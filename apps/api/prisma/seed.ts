import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminHash = await bcrypt.hash("Admin123!", 10);
  const employeeHash = await bcrypt.hash("Employee123!", 10);

  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      name: "Admin User",
      email: "admin@example.com",
      passwordHash: adminHash,
      role: "admin",
    },
  });

  await prisma.user.upsert({
    where: { email: "employee@example.com" },
    update: {},
    create: {
      name: "Demo Employee",
      email: "employee@example.com",
      passwordHash: employeeHash,
      role: "employee",
    },
  });

  const resources = [
    { name: "Room A", type: "room", floor: "1", capacity: 6, description: "Projector, whiteboard" },
    { name: "Room B", type: "room", floor: "1", capacity: 10, description: "Large conference room" },
    { name: "Room C", type: "room", floor: "2", capacity: 4, description: "Small meeting room" },
    { name: "Desk 1", type: "desk", floor: "2", capacity: 1, description: "Window desk" },
    { name: "Desk 2", type: "desk", floor: "2", capacity: 1, description: "Standing desk" },
  ] as const;

  for (const r of resources) {
    await prisma.resource.upsert({
      where: { name: r.name },
      update: {},
      create: r,
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());