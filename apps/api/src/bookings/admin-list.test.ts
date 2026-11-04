import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../db";

const stamp = Date.now();
const prefix = `adminlist${stamp}`;
const password = "TestUser1!";
const HOUR = 3600 * 1000;
const created: string[] = [];

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const titleOf = (name: string) => `TEST-${prefix}-${name}`;
const short = (items: { title: string }[]) =>
  items.map((b) => b.title.replace(`TEST-${prefix}-`, ""));

async function makeUser(label: string, role: "employee" | "admin" = "employee") {
  const email = `${prefix}-${label}@example.com`;
  const res = await request(app)
    .post("/auth/register")
    .send({ name: `AdminList ${label}`, email, password });
  expect(res.status).toBe(201);
  const id = res.body.user.id as string;
  created.push(id);
  if (role === "admin") {
    await prisma.user.update({ where: { id }, data: { role: "admin" } });
  }
  return { id, token: res.body.token as string };
}

type Person = Awaited<ReturnType<typeof makeUser>>;
let boss: Person;
let ua: Person;
let ub: Person;

const list = (token: string, query: string) =>
  request(app).get(`/bookings?${query}`).set(auth(token));

beforeAll(async () => {
  boss = await makeUser("boss", "admin");
  ua = await makeUser("ua");
  ub = await makeUser("ub");

  const room = await prisma.resource.findFirstOrThrow({ where: { name: "Room A" } });
  const desk = await prisma.resource.findFirstOrThrow({ where: { name: "Desk 1" } });
  const now = Date.now();

  const add = (
    userId: string,
    resourceId: string,
    name: string,
    startHours: number,
    status: "confirmed" | "cancelled" = "confirmed"
  ) =>
    prisma.booking.create({
      data: {
        userId,
        resourceId,
        title: titleOf(name),
        startAt: new Date(now + startHours * HOUR),
        endAt: new Date(now + (startHours + 1) * HOUR),
        status,
        ...(status === "cancelled" ? { cancelledAt: new Date() } : {}),
      },
    });

  await add(ua.id, room.id, "ua1", 48);
  await add(ua.id, desk.id, "ua2", 72);
  await add(ua.id, room.id, "ua3", -72);
  await add(ua.id, desk.id, "ua4", -96);
  await add(ua.id, room.id, "ua5", 96, "cancelled");
  await add(ub.id, desk.id, "ub1", 120);
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { userId: { in: created } } });
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe("admin bookings list", () => {
  it("blocks employees", async () => {
    const res = await list(ua.token, "");
    expect(res.status).toBe(403);
  });

  it("filters by user, type and when, and reports the right total", async () => {
    const forUa = `userId=${ua.id}`;

    const all = await list(boss.token, forUa);
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(5);
    expect(short(all.body.items).sort()).toEqual(["ua1", "ua2", "ua3", "ua4", "ua5"]);

    const rooms = await list(boss.token, `${forUa}&type=room`);
    expect(short(rooms.body.items).sort()).toEqual(["ua1", "ua3", "ua5"]);
    expect(rooms.body.total).toBe(3);

    const desks = await list(boss.token, `${forUa}&type=desk`);
    expect(short(desks.body.items).sort()).toEqual(["ua2", "ua4"]);

    const upcoming = await list(boss.token, `${forUa}&when=upcoming`);
    expect(short(upcoming.body.items).sort()).toEqual(["ua1", "ua2", "ua5"]);

    const past = await list(boss.token, `${forUa}&when=past`);
    expect(short(past.body.items).sort()).toEqual(["ua3", "ua4"]);

    const combined = await list(boss.token, `${forUa}&type=room&when=upcoming`);
    expect(short(combined.body.items).sort()).toEqual(["ua1", "ua5"]);
    expect(combined.body.total).toBe(2);

    const other = await list(boss.token, `userId=${ub.id}`);
    expect(short(other.body.items)).toEqual(["ub1"]);

    const blanks = await list(boss.token, `${forUa}&type=&when=&sort=`);
    expect(blanks.status).toBe(200);
    expect(blanks.body.total).toBe(5);
  });

  it("sorts by newest, oldest, resource type and resource name", async () => {
    const forUa = `userId=${ua.id}`;
    const order = async (sort: string) =>
      short((await list(boss.token, `${forUa}&sort=${sort}`)).body.items);

    expect(await order("newest")).toEqual(["ua5", "ua2", "ua1", "ua3", "ua4"]);
    expect(await order("oldest")).toEqual(["ua4", "ua3", "ua1", "ua2", "ua5"]);
    // Rooms first (latest first), then desks (latest first)
    expect(await order("type")).toEqual(["ua5", "ua1", "ua3", "ua2", "ua4"]);
    // Desk 1 before Room A, each latest first
    expect(await order("name")).toEqual(["ua2", "ua4", "ua5", "ua1", "ua3"]);
  });

  it("pages without overlaps or gaps", async () => {
    const forUa = `userId=${ua.id}&sort=newest&limit=2`;
    const p1 = await list(boss.token, `${forUa}&offset=0`);
    const p2 = await list(boss.token, `${forUa}&offset=2`);
    const p3 = await list(boss.token, `${forUa}&offset=4`);
    const p4 = await list(boss.token, `${forUa}&offset=10`);

    expect(short(p1.body.items)).toHaveLength(2);
    expect(short(p3.body.items)).toHaveLength(1);
    for (const page of [p1, p2, p3, p4]) {
      expect(page.status).toBe(200);
      expect(page.body.total).toBe(5);
    }
    expect([
      ...short(p1.body.items),
      ...short(p2.body.items),
      ...short(p3.body.items),
    ]).toEqual(["ua5", "ua2", "ua1", "ua3", "ua4"]);
    expect(p4.body.items).toEqual([]);
  });

  it("rejects bad input with 400, and treats an unknown user as an empty list", async () => {
    const bad = [
      "type=bogus",
      "when=bogus",
      "sort=bogus",
      "limit=0",
      "limit=101",
      "limit=abc",
      "limit=1.5",
      "offset=-1",
      "offset=abc",
      "userId=not-a-uuid",
    ];
    for (const query of bad) {
      const res = await list(boss.token, query);
      expect(res.status, query).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }

    const unknown = await list(boss.token, "userId=00000000-0000-0000-0000-000000000000");
    expect(unknown.status).toBe(200);
    expect(unknown.body.items).toEqual([]);
    expect(unknown.body.total).toBe(0);
  });

  it("returns the expected fields and never a password hash", async () => {
    const res = await list(boss.token, `userId=${ua.id}`);
    expect(res.status).toBe(200);

    for (const item of res.body.items) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.title).toBe("string");
      expect(typeof item.startAt).toBe("string");
      expect(typeof item.endAt).toBe("string");
      expect(["confirmed", "cancelled"]).toContain(item.status);
      expect(typeof item.resource.name).toBe("string");
      expect(["room", "desk"]).toContain(item.resource.type);
      expect(typeof item.user.name).toBe("string");
      expect(typeof item.user.email).toBe("string");
    }
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });
});