import { Router } from "express";
import { loginUser, registerUser } from "./auth.service";

export const authRouter = Router();

authRouter.post("/register", async (req, res, next) => {
  try {
    const { name, email, password } = req.body ?? {};

    if (
      typeof name !== "string" || name.trim() === "" ||
      typeof email !== "string" || !email.includes("@") ||
      typeof password !== "string" || password.length < 8
    ) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Name, a valid email, and a password of at least 8 characters are required",
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