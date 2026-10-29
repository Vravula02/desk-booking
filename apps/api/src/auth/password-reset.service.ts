import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { config } from "../config";
import { sendEmail } from "../email";
import { HttpError } from "./auth.service";


const TOKEN_MINUTES = 30;

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function isStrongPassword(password: string) {
  return password.length >= 8 && /[A-Z]/.test(password) && /[^A-Za-z0-9]/.test(password);
}

export async function requestPasswordReset(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return;

  const token = crypto.randomBytes(32).toString("hex");

  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + TOKEN_MINUTES * 60 * 1000),
      },
    }),
  ]);

  const link = `${config.appUrl}/?reset=${token}`;
  await sendEmail({
    to: user.email,
    subject: "Reset your Workspace Booking password",
    text: `Use this link to choose a new password (valid for ${TOKEN_MINUTES} minutes):\n\n${link}\n\nIf you didn't ask for this, ignore this email.`,
  });
}

export async function resetPassword(token: string, newPassword: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new HttpError(400, "INVALID_OR_EXPIRED_TOKEN", "This reset link is invalid or has expired");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction(async (tx) => {
    // Claim the token first, so two simultaneous requests can't both use it
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new HttpError(400, "INVALID_OR_EXPIRED_TOKEN", "This reset link is invalid or has expired");
    }
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
  });
}

export async function isResetTokenValid(token: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  return !!record && !record.usedAt && record.expiresAt >= new Date();
}