import { prisma } from "../db";

export async function searchAvailable(input: {
  start: Date;
  end: Date;
  type?: "room" | "desk";
  minCapacity?: number;
}) {
  return prisma.resource.findMany({
    where: {
      isActive: true,
      type: input.type,
      capacity: input.minCapacity ? { gte: input.minCapacity } : undefined,
      // Keep only resources with NO confirmed booking overlapping the window
      bookings: {
        none: {
          status: "confirmed",
          startAt: { lt: input.end },
          endAt: { gt: input.start },
        },
      },
    },
    orderBy: { name: "asc" },
  });
}