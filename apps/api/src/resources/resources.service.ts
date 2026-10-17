import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { HttpError } from "../auth/auth.service";

export async function listResources(includeInactive: boolean) {
  return prisma.resource.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: "asc" },
  });
}

export async function createResource(input: {
  name: string;
  type: "room" | "desk";
  floor?: string;
  capacity: number;
  description?: string;
}) {
  try {
    return await prisma.resource.create({
      data: {
        name: input.name.trim(),
        type: input.type,
        floor: input.floor,
        capacity: input.capacity,
        description: input.description,
      },
    });
  } catch (err) {
    // P2002 = unique constraint failed (the name already exists)
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new HttpError(409, "RESOURCE_NAME_TAKEN", "A resource with this name already exists");
    }
    throw err;
  }
}

export async function updateResource(
  id: string,
  input: {
    name?: string;
    type?: "room" | "desk";
    floor?: string;
    capacity?: number;
    description?: string;
  }
) {
  const existing = await prisma.resource.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, "NOT_FOUND", "Resource not found");
  }

  try {
    return await prisma.resource.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        type: input.type,
        floor: input.floor,
        capacity: input.capacity,
        description: input.description,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new HttpError(409, "RESOURCE_NAME_TAKEN", "A resource with this name already exists");
    }
    throw err;
  }
}

export async function setResourceActive(id: string, isActive: boolean) {
  const existing = await prisma.resource.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, "NOT_FOUND", "Resource not found");
  }

  // Activating needs no side effects
  if (isActive) {
    const resource = await prisma.resource.update({
      where: { id },
      data: { isActive: true },
    });
    return { resource, cancelledBookings: 0 };
  }

  // Deactivating: update the resource and cancel future bookings together
  const [resource, cancelled] = await prisma.$transaction([
    prisma.resource.update({
      where: { id },
      data: { isActive: false },
    }),
    prisma.booking.updateMany({
      where: {
        resourceId: id,
        status: "confirmed",
        startAt: { gt: new Date() },
      },
      data: { status: "cancelled", cancelledAt: new Date() },
    }),
  ]);

  return { resource, cancelledBookings: cancelled.count };
}