import crypto from "crypto";
import bcrypt from "bcryptjs";
import { Prisma, type User } from "@prisma/client";
import { prisma } from "../db";
import { config } from "../config";
import { sendEmail } from "../email";
import { HttpError } from "../auth/auth.service";
import { isStrongPassword } from "../auth/password-reset.service";
import { signToken } from "../auth/token";

const EMAIL_TOKEN_MINUTES = 30;
const EMAIL_COOLDOWN_SECONDS = 120;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function publicUser(user: User) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

const invalidLink = () =>
  new HttpError(400, "INVALID_OR_EXPIRED_TOKEN", "This link is invalid or has expired");

async function loadUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) {
    throw new HttpError(401, "UNAUTHORIZED", "Please log in again");
  }
  return user;
}

// The public demo accounts share a published password, so they stay fixed
function assertEditable(user: User) {
  if ([...config.protectedEmails].includes(user.email)) {
    throw new HttpError(403, "PROTECTED_ACCOUNT", "This demo account can't be changed");
  }
}

async function assertCurrentPassword(user: User, password: string) {
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    // 400, not 401: the web app treats a 401 outside /auth as an expired session
    throw new HttpError(400, "INVALID_CURRENT_PASSWORD", "Current password is incorrect");
  }
}

export async function getAccount(userId: string) {
  const user = await loadUser(userId);
  return { ...publicUser(user), createdAt: user.createdAt };
}

export async function updateName(userId: string, rawName: string) {
  const name = rawName.trim();
  if (name.length < 1 || name.length > 60) {
    throw new HttpError(400, "VALIDATION_ERROR", "Name must be 1 to 60 characters");
  }
  const user = await loadUser(userId);
  assertEditable(user);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { name } });
  return publicUser(updated);
}

export async function changePassword(userId: string, current: string, next: string) {
  const user = await loadUser(userId);
  assertEditable(user);
  await assertCurrentPassword(user, current);

  if (!isStrongPassword(next)) {
    throw new HttpError(
      400,
      "WEAK_PASSWORD",
      "Password must be at least 8 characters and include a capital letter and a special character"
    );
  }
  if (next === current) {
    throw new HttpError(400, "SAME_PASSWORD", "Choose a password different from the current one");
  }

  const passwordHash = await bcrypt.hash(next, 10);

  // Bumping token_version signs out every other session. A fresh token keeps this one.
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });

  return {
    user: publicUser(updated),
    token: signToken({ sub: updated.id, role: updated.role, tv: updated.tokenVersion }),
  };
}

export async function requestEmailChange(
  userId: string,
  rawNewEmail: string,
  currentPassword: string
) {
  const user = await loadUser(userId);
  assertEditable(user);
  await assertCurrentPassword(user, currentPassword);

  const newEmail = rawNewEmail.trim().toLowerCase();
  if (newEmail.length > 254 || !EMAIL_PATTERN.test(newEmail)) {
    throw new HttpError(400, "VALIDATION_ERROR", "Enter a valid email address");
  }
  if (newEmail === user.email) {
    throw new HttpError(400, "SAME_EMAIL", "That is already your email address");
  }
  if (await prisma.user.findUnique({ where: { email: newEmail } })) {
    throw new HttpError(409, "EMAIL_TAKEN", "That email address is already in use");
  }

  const latest = await prisma.emailChangeRequest.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (latest) {
    const waitMs = EMAIL_COOLDOWN_SECONDS * 1000 - (Date.now() - latest.createdAt.getTime());
    if (waitMs > 0) {
      throw new HttpError(
        429,
        "TOO_SOON",
        `Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting another link`
      );
    }
  }

  const token = crypto.randomBytes(32).toString("hex");

  // A new request cancels any earlier unused one
  await prisma.$transaction([
    prisma.emailChangeRequest.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.emailChangeRequest.create({
      data: {
        userId: user.id,
        newEmail,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + EMAIL_TOKEN_MINUTES * 60 * 1000),
      },
    }),
  ]);

  const link = `${config.appUrl}/?confirm-email=${token}`;
  void sendEmail({
    to: newEmail,
    subject: "Confirm your new Workspace Booking email",
    text:
      `Use this link to confirm this address for your Workspace Booking account. ` +
      `It works once and expires in ${EMAIL_TOKEN_MINUTES} minutes:\n\n${link}\n\n` +
      `If you didn't ask for this, ignore this email and nothing will change.`,
  }).catch((err) => console.error("Email change message failed to send", err));
}

export async function confirmEmailChange(token: string) {
  const record = await prisma.emailChangeRequest.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) throw invalidLink();

  let oldEmail = "";
  try {
    await prisma.$transaction(async (tx) => {
      // Claim the token first, so two simultaneous requests can't both use it
      const claimed = await tx.emailChangeRequest.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) throw invalidLink();

      const user = await tx.user.findUnique({ where: { id: record.userId } });
      if (!user || !user.isActive) throw invalidLink();
      assertEditable(user);

      if (await tx.user.findUnique({ where: { email: record.newEmail } })) {
        throw new HttpError(409, "EMAIL_TAKEN", "That email address is already in use");
      }

      oldEmail = user.email;
      await tx.user.update({
        where: { id: user.id },
        data: { email: record.newEmail, tokenVersion: { increment: 1 } },
      });
      await tx.emailChangeRequest.deleteMany({ where: { userId: user.id, usedAt: null } });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new HttpError(409, "EMAIL_TAKEN", "That email address is already in use");
    }
    throw err;
  }

  void sendEmail({
    to: oldEmail,
    subject: "Your Workspace Booking email was changed",
    text:
      `The email on your Workspace Booking account was changed to ${record.newEmail}. ` +
      `If this wasn't you, use "Forgot password" on the login page right away.`,
  }).catch((err) => console.error("Email change notice failed to send", err));

  return { message: "Email updated. Please log in with your new email address." };
}