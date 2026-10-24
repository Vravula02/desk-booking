import { Router } from "express";
import { loginUser, registerUser } from "./auth.service";
import { requireAuth } from "./auth.middleware";
import { prisma } from "../db";

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