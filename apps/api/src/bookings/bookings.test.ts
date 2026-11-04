import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../db";

let token = "";
let resourceId = "";

// A weekday far in the future: Tuesday 2030-01-08, 10:00-11:00 New York = 15:00-16:00 UTC
const start = "2030-01-08T15:00:00Z";
const end = "2030-01-08T16:00:00Z";

async function book(title: string) {
  return request(app)
    .post("/bookings")
    .set("Authorization", `Bearer ${token}`)
    .send({ resourceId, title, startAt: start, endAt: end });
}

beforeAll(async () => {
  const login = await request(app)
    .post("/auth/login")
    .send({ email: "employee@example.com", password: "Employee123!" });
  token = login.body.token;

  const resource = await prisma.resource.findUniqueOrThrow({ where: { name: "Desk 1" } });
  resourceId = resource.id;

  await prisma.booking.deleteMany({ where: { title: { startsWith: "TEST-" } } });
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { title: { startsWith: "TEST-" } } });
  await prisma.$disconnect();
});

describe("bookings", () => {
  it("creates a booking, then rejects an overlapping one with 409", async () => {
    const first = await book("TEST-first");
    expect(first.status).toBe(201);

    const second = await book("TEST-second");
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("BOOKING_CONFLICT");

    await prisma.booking.deleteMany({ where: { title: { startsWith: "TEST-" } } });
  });

  it("lets only one of two simultaneous requests succeed", async () => {
    const results = await Promise.all([book("TEST-race-1"), book("TEST-race-2")]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
  });

  it("does not allow cancelling a booking that has ended", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "employee@example.com" },
    });
    const past = await prisma.booking.create({
      data: {
        resourceId,
        userId: user.id,
        title: "TEST-past",
        startAt: new Date("2020-01-07T15:00:00Z"),
        endAt: new Date("2020-01-07T16:00:00Z"),
      },
    });

    const res = await request(app)
      .post(`/bookings/${past.id}/cancel`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("BOOKING_ENDED");
  });

  it("lists the logged-in user's own bookings", async () => {
    const res = await request(app)
      .get("/bookings/mine")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});