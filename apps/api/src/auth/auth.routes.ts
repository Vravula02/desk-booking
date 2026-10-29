import { Router } from "express";
import { loginUser, registerUser } from "./auth.service";
import { requireAuth } from "./auth.middleware";
import { prisma } from "../db";
import {
  isResetTokenValid,
  isStrongPassword,
  requestPasswordReset,
  resetPassword,
} from "./password-reset.service";

export const authRouter = Router();

authRouter.post("/register", async (req, res, next) => {
  try {
        const { name, email, password } = req.body ?? {};

    if (
      typeof name !== "string" || name.trim() === "" ||
      typeof email !== "string" || !email.includes("@") ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Name, a valid email, and a password are required",
        },
      });
    }

    if (
      password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) {
      return res.status(400).json({
        error: {
          code: "WEAK_PASSWORD",
          message:
            "Password must be at least 8 characters and include a capital letter and a special character",
        },
      });
    }

    const result = await registerUser({ name, email, password });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Email and password are required" },
      });
    }

    const result = await loginUser({ email, password });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    res.json({ id: user!.id, name: user!.name, email: user!.email, role: user!.role });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/forgot", async (req, res, next) => {
  try {
    const { email } = req.body ?? {};

    if (typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "A valid email is required" },
      });
    }

    try {
      await requestPasswordReset(email);
    } catch (err) {
      // Log it, but answer the same way, so errors can't reveal which emails exist
      console.error("Password reset request failed", err);
    }

    res.status(202).json({
      message: "If that email is registered, a reset link has been sent.",
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/reset", async (req, res, next) => {
  try {
    const { token, newPassword } = req.body ?? {};

    if (typeof token !== "string" || typeof newPassword !== "string") {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Token and new password are required" },
      });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        error: {
          code: "WEAK_PASSWORD",
          message:
            "Password must be at least 8 characters and include a capital letter and a special character",
        },
      });
    }

    await resetPassword(token, newPassword);
    res.json({ message: "Password updated. You can now log in." });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/reset/check", async (req, res, next) => {
  try {
    const { token } = req.body ?? {};

    if (typeof token !== "string" || token === "") {
      return res.json({ valid: false });
    }

    res.json({ valid: await isResetTokenValid(token) });
  } catch (err) {
    next(err);
  }
});