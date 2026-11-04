import { Router, type Request } from "express";

import { requireAuth, requireRole } from "../auth/auth.middleware";
import {
  cancelBooking,
  createBooking,
  listBookingsForAdmin,
  listMyBookings,
  type AdminBookingFilters,
} from "./bookings.service";

export const bookingsRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WHOLE_NUMBER = /^\d+$/;

// Returns the cleaned filters, or null if any value is invalid
function parseAdminFilters(query: Request["query"]): AdminBookingFilters | null {
  const pick = (key: string): unknown => {
    const value = query[key];
    return value === "" ? undefined : value; // blank means "no filter"
  };

  const type = pick("type");
  const when = pick("when");
  const sort = pick("sort") ?? "newest";
  const userId = pick("userId");
  const limit = pick("limit") ?? "50";
  const offset = pick("offset") ?? "0";

  if (type !== undefined && type !== "room" && type !== "desk") return null;
  if (when !== undefined && when !== "upcoming" && when !== "past") return null;
  if (sort !== "newest" && sort !== "oldest" && sort !== "type" && sort !== "name") return null;
  if (userId !== undefined && !(typeof userId === "string" && UUID_RE.test(userId))) return null;
  if (typeof limit !== "string" || !WHOLE_NUMBER.test(limit)) return null;
  if (Number(limit) < 1 || Number(limit) > 100) return null;
  if (typeof offset !== "string" || !WHOLE_NUMBER.test(offset)) return null;
  if (Number(offset) > 1_000_000) return null;

  return {
    type: type === "room" || type === "desk" ? type : undefined,
    when: when === "upcoming" || when === "past" ? when : undefined,
    userId: typeof userId === "string" ? userId : undefined,
    sort,
    limit: Number(limit),
    offset: Number(offset),
  };
}

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

bookingsRouter.get("/", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const filters = parseAdminFilters(req.query);
    if (!filters) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid filter, sort or paging value" },
      });
    }
    res.json(await listBookingsForAdmin(filters));
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


bookingsRouter.get("/mine", requireAuth, async (req, res, next) => {
  try {
    res.json(await listMyBookings(req.user!.id));
  } catch (err) {
    next(err);
  }
});