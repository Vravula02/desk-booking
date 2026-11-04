import { prisma } from "../db";
import { HttpError } from "../auth/auth.service";
import { checkBookingTimes } from "./rules";
import { Prisma } from "@prisma/client";

export async function createBooking(input: {
  userId: string;
  resourceId: string;
  title: string;
  start: Date;
  end: Date;
}) {
  checkBookingTimes(input.start, input.end);

  return prisma.$transaction(async (tx) => {
    // Lock this resource's row. Other requests for the same resource wait here.
    await tx.$queryRaw`SELECT id FROM resources WHERE id = ${input.resourceId}::uuid FOR UPDATE`;

    const resource = await tx.resource.findUnique({ where: { id: input.resourceId } });
    if (!resource) {
      throw new HttpError(404, "NOT_FOUND", "Resource not found");
    }
    if (!resource.isActive) {
      throw new HttpError(422, "RESOURCE_INACTIVE", "This resource is not available for booking");
    }

    // Overlap: an existing booking starts before we end AND ends after we start
    const conflict = await tx.booking.findFirst({
      where: {
        resourceId: input.resourceId,
        status: "confirmed",
        startAt: { lt: input.end },
        endAt: { gt: input.start },
      },
    });
    if (conflict) {
      throw new HttpError(409, "BOOKING_CONFLICT", "This resource is already booked for that time");
    }

    return tx.booking.create({
      data: {
        resourceId: input.resourceId,
        userId: input.userId,
        title: input.title,
        startAt: input.start,
        endAt: input.end,
      },
    });
  });
}

export async function listMyBookings(userId: string) {
  return prisma.booking.findMany({
    where: { userId },
    include: { resource: { select: { name: true, type: true } } },
    orderBy: { startAt: "desc" },
  });
}

export async function cancelBooking(
  bookingId: string,
  user: { id: string; role: "employee" | "admin" }
) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });

  if (!booking || (user.role !== "admin" && booking.userId !== user.id)) {
    throw new HttpError(404, "NOT_FOUND", "Booking not found");
  }
  if (booking.status !== "confirmed") {
    throw new HttpError(422, "INVALID_STATE", "Only confirmed bookings can be cancelled");
  }
    if (booking.endAt <= new Date()) {
    throw new HttpError(422, "BOOKING_ENDED", "Past bookings can't be cancelled");
  }

  return prisma.booking.update({
    where: { id: bookingId },
    data: { status: "cancelled", cancelledAt: new Date() },
  });
}

export type AdminBookingFilters = {
  type?: "room" | "desk";
  when?: "upcoming" | "past";
  userId?: string;
  sort: "newest" | "oldest" | "type" | "name";
  limit: number;
  offset: number;
};

export async function listBookingsForAdmin(f: AdminBookingFilters) {
  const now = new Date();

  const where: Prisma.BookingWhereInput = {
    ...(f.userId ? { userId: f.userId } : {}),
    ...(f.type ? { resource: { type: f.type } } : {}),
    // Same rule as My bookings: a booking is past once its end time has passed
    ...(f.when === "upcoming" ? { endAt: { gte: now } } : {}),
    ...(f.when === "past" ? { endAt: { lt: now } } : {}),
  };

  // Every order ends with the id, so paging never repeats or skips a row
  let orderBy: Prisma.BookingOrderByWithRelationInput[];
  switch (f.sort) {
    case "oldest":
      orderBy = [{ startAt: "asc" }, { id: "asc" }];
      break;
    case "type": // rooms first, then desks (the enum is declared in that order)
      orderBy = [{ resource: { type: "asc" } }, { startAt: "desc" }, { id: "asc" }];
      break;
    case "name":
      orderBy = [{ resource: { name: "asc" } }, { startAt: "desc" }, { id: "asc" }];
      break;
    default:
      orderBy = [{ startAt: "desc" }, { id: "asc" }];
  }

  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy,
      skip: f.offset,
      take: f.limit,
      include: {
        resource: { select: { name: true, type: true } },
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.booking.count({ where }),
  ]);

  return { items, total };
}