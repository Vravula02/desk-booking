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

export async function getTimeline(
  start: Date,
  end: Date,
  userId: string,
  isAdmin: boolean
) {
  const resources = await prisma.resource.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: {
      bookings: {
        where: {
          status: "confirmed",
          startAt: { lt: end },
          endAt: { gt: start },
        },
        select: { id: true, title: true, startAt: true, endAt: true, userId: true },
        orderBy: { startAt: "asc" },
      },
    },
  });

  return resources.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    capacity: r.capacity,
    bookings: r.bookings.map((b) => {
      const mine = b.userId === userId;
      return {
        id: b.id,
        startAt: b.startAt,
        endAt: b.endAt,
        isMine: mine,
        title: mine || isAdmin ? b.title : null,
      };
    }),
  }));
}
