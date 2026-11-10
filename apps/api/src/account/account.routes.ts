import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware";
import {
  changePassword,
  confirmEmailChange,
  getAccount,
  requestEmailChange,
  updateName,
} from "./account.service";

export const accountRouter = Router();

const invalid = (message: string) => ({ error: { code: "VALIDATION_ERROR", message } });

// Public: the emailed token is the proof of ownership
accountRouter.post("/email/confirm", async (req, res, next) => {
  try {
    const { token } = req.body ?? {};
    if (typeof token !== "string" || token === "") {
      return res.status(400).json(invalid("A token is required"));
    }
    res.json(await confirmEmailChange(token));
  } catch (err) {
    next(err);
  }
});

// Everything below needs a logged-in user
accountRouter.use(requireAuth);

accountRouter.get("/", async (req, res, next) => {
  try {
    res.json(await getAccount(req.user!.id));
  } catch (err) {
    next(err);
  }
});

accountRouter.patch("/", async (req, res, next) => {
  try {
    const { name } = req.body ?? {};
    if (typeof name !== "string") return res.status(400).json(invalid("A name is required"));
    res.json(await updateName(req.user!.id, name));
  } catch (err) {
    next(err);
  }
});

accountRouter.post("/password", async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return res.status(400).json(invalid("Current and new password are required"));
    }
    res.json(await changePassword(req.user!.id, currentPassword, newPassword));
  } catch (err) {
    next(err);
  }
});

accountRouter.post("/email", async (req, res, next) => {
  try {
    const { newEmail, currentPassword } = req.body ?? {};
    if (typeof newEmail !== "string" || typeof currentPassword !== "string") {
      return res.status(400).json(invalid("New email and current password are required"));
    }
    await requestEmailChange(req.user!.id, newEmail, currentPassword);
    res.status(202).json({
      message: "We sent a confirmation link to your new address. Your email changes after you click it.",
    });
  } catch (err) {
    next(err);
  }
});