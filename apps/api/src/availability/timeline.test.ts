import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../db";

const SECRET = "TEST-timeline-secret";
const otherEmail = `timeline-${Date.now()}@example.com`;
const start = "2030-03-05T15:00:00Z";
const end = "2030-03-05T16:00:00Z";

let resourceId = "";
let bookingId = "";
const tokens = { owner: "", other: "", admin: "" };

async function login(email: string, password: string) {
  const res = await request(app).post("/auth/login").send({ email, password });
  return res.body.token as string;
}

async function timeline(token: string) {
  const res = await request(app)
    .get(`/availability/timeline?start=${start}&end=${end}`)
    .set("Authorization", `Bearer ${token}`);
  const resource = res.body.find((r: { id: string }) => r.id === resourceId);
  const booking = resource.bookings.find((b: { id: string }) => b.id === bookingId);
  return { body: res.body, booking };
}

beforeAll(async () => {
  tokens.owner = await login("employee@example.com", "Employee123!");
  tokens.admin = await login("admin@example.com", "Admin123!");

  const reg = await request(app)
    .post("/auth/register")
    .send({ name: "Timeline Other", email: otherEmail, password: "OtherUser1!" });
  tokens.other = reg.body.token;

  const resource = await prisma.resource.findUniqueOrThrow({ where: { name: "Desk 2" } });
  resourceId = resource.id;
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "employee@example.com" } });

  const booking = await prisma.booking.create({
    data: {
      resourceId,
      userId: owner.id,
      title: SECRET,
      startAt: new Date(start),
      endAt: new Date(end),
    },
  });
  bookingId = booking.id;
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { title: SECRET } });
  await prisma.user.deleteMany({ where: { email: otherEmail } });
  await prisma.$disconnect();
});

describe("timeline privacy", () => {
  it("shows the owner their own title", async () => {
    const { booking } = await timeline(tokens.owner);
    expect(booking.title).toBe(SECRET);
    expect(booking.isMine).toBe(true);
  });

  it("hides the title from another employee", async () => {
    const { body, booking } = await timeline(tokens.other);
    expect(booking.title).toBeNull();
    expect(booking.isMine).toBe(false);
    expect(JSON.stringify(body)).not.toContain(SECRET);
  });

  it("shows every title to an admin", async () => {
    const { booking } = await timeline(tokens.admin);
    expect(booking.title).toBe(SECRET);
    expect(booking.isMine).toBe(false);
  });
});