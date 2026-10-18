import { Router } from "express";

import { requireAuth, requireRole } from "../auth/auth.middleware";
import {cancelBooking, createBooking, listAllBookings, listMyBookings } from "./bookings.service";

export const bookingsRouter = Router();

bookingsRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const { resourceId, title, startAt, endAt } = req.body ?? {};

    const start = new Date(startAt);
    const end = new Date(endAt);

    if (
      typeof resourceId !== "string" ||
      typeof title !== "string" || title.trim() === "" ||
      typeof startAt !== "string" || typeof endAt !== "string" ||
      isNaN(start.getTime()) || isNaN(end.getTime()) ||
      end <= start
    ) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "resourceId, title, startAt and endAt (end after start, ISO format) are required",
        },
      });
    }

    const booking = await createBooking({
      userId: req.user!.id,
      resourceId,
      title: title.trim(),
      start,
      end,
    });
    res.status(201).json(booking);
  } catch (err) {
    next(err);
  }
});

bookingsRouter.get("/mine", requireAuth, async (req, res, next) => {
  try {
    res.json(await listMyBookings(req.user!.id));
  } catch (err) {
    next(err);
  }
});

bookingsRouter.post("/:id/cancel", requireAuth, async (req, res, next) => {
  try {
    const booking = await cancelBooking(String(req.params.id), req.user!);
    res.json(booking);
  } catch (err) {
    next(err);
  }
});


bookingsRouter.get("/", requireAuth, requireRole("admin"), async (_req, res, next) => {
  try {
    res.json(await listAllBookings());
  } catch (err) {
    next(err);
  }
});