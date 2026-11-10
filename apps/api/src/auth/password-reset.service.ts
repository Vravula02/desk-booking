import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { config } from "../config";
import { sendEmail } from "../email";
import { HttpError } from "./auth.service";

const TOKEN_MINUTES = 15;
export const COOLDOWN_SECONDS = 120;

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

  // Too soon after the last link? Create nothing and send nothing.
  const latest = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (latest && Date.now() - latest.createdAt.getTime() < COOLDOWN_SECONDS * 1000) {
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");

  // A new link cancels any earlier unused one
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

  // Not awaited: sending takes seconds, and waiting would make registered emails
  // answer more slowly than unknown ones.
  void sendEmail({
    to: user.email,
    subject: "Reset your Workspace Booking password",
    text:
      `Use this link to choose a new password. It works once and expires in ${TOKEN_MINUTES} minutes:\n\n` +
      `${link}\n\n` +
      `Requesting another link cancels this one. If you didn't ask for this, ignore this email.`,
  }).catch((err) => console.error("Reset email failed to send", err));
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
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
    });
  });
}

export async function isResetTokenValid(token: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  return !!record && !record.usedAt && record.expiresAt >= new Date();
}