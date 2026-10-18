import { prisma } from "../db";
import { HttpError } from "../auth/auth.service";
import { checkBookingTimes } from "./rules";

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

  return prisma.booking.update({
    where: { id: bookingId },
    data: { status: "cancelled", cancelledAt: new Date() },
  });
}

export async function listAllBookings() {
  return prisma.booking.findMany({
    include: {
      resource: { select: { name: true, type: true } },
      user: { select: { name: true, email: true } },
    },
    orderBy: { startAt: "desc" },
  });
}