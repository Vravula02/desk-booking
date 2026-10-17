import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { signToken } from "./token";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}) {
  const email = input.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new HttpError(409, "EMAIL_TAKEN", "Email is already registered");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  const user = await prisma.user.create({
    data: { name: input.name.trim(), email, passwordHash },
  });

  const token = signToken({ sub: user.id, role: user.role });

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    token,
  };
}

export async function loginUser(input: { email: string; password: string }) {
  const email = input.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email } });

  // Same error for "no such email" and "wrong password", so attackers can't tell which emails exist
  const valid = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
  if (!user || !valid) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  if (!user.isActive) {
    throw new HttpError(403, "ACCOUNT_DEACTIVATED", "This account has been deactivated");
  }

  const token = signToken({ sub: user.id, role: user.role });

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    token,
  };
}