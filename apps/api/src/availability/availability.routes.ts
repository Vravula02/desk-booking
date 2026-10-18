import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware";
import { searchAvailable } from "./availability.service";

export const availabilityRouter = Router();

availabilityRouter.get("/search", requireAuth, async (req, res, next) => {
  try {
    const start = new Date(String(req.query.start));
    const end = new Date(String(req.query.end));
    const type = req.query.type;
    const minCapacity =
      req.query.minCapacity !== undefined ? Number(req.query.minCapacity) : undefined;

    if (
      isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start ||
      (type !== undefined && type !== "room" && type !== "desk") ||
      (minCapacity !== undefined && (!Number.isInteger(minCapacity) || minCapacity < 1))
    ) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "start and end (ISO format, end after start) are required. type must be room or desk.",
        },
      });
    }

    res.json(await searchAvailable({ start, end, type, minCapacity }));
  } catch (err) {
    next(err);
  }
});