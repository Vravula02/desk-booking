import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../db";

const stamp = Date.now();
const prefix = `usrtest${stamp}`;
const password = "TestUser1!";
const created: string[] = [];
const HOUR = 3600 * 1000;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function makeUser(label: string, role: "employee" | "admin" = "employee") {
  const email = `${prefix}-${label}@example.com`;
  const res = await request(app)
    .post("/auth/register")
    .send({ name: `UsrTest ${label}`, email, password });
  expect(res.status).toBe(201);
  const id = res.body.user.id as string;
  created.push(id);
  if (role === "admin") {
    await prisma.user.update({ where: { id }, data: { role: "admin" } });
  }
  return { id, email, token: res.body.token as string };
}

let boss: Awaited<ReturnType<typeof makeUser>>;
let emp: Awaited<ReturnType<typeof makeUser>>;
let resourceId = "";

beforeAll(async () => {
  boss = await makeUser("boss", "admin");
  emp = await makeUser("emp");
  const resource = await prisma.resource.findFirstOrThrow({ where: { name: "Desk 1" } });
  resourceId = resource.id;
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { userId: { in: created } } });
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe("admin user management", () => {
  it("blocks employees from every users endpoint", async () => {
    const list = await request(app).get("/users").set(auth(emp.token));
    expect(list.status).toBe(403);

    const role = await request(app)
      .patch(`/users/${boss.id}/role`)
      .set(auth(emp.token))
      .send({ role: "employee" });
    expect(role.status).toBe(403);

    const active = await request(app)
      .post(`/users/${boss.id}/active`)
      .set(auth(emp.token))
      .send({ isActive: false });
    expect(active.status).toBe(403);
  });

  it("lists users safely, with working search and filters", async () => {
    const sleeper = await makeUser("sleeper");
    await prisma.user.update({ where: { id: sleeper.id }, data: { isActive: false } });

    const all = await request(app).get(`/users?query=${prefix}`).set(auth(boss.token));
    expect(all.status).toBe(200);
    expect(all.body.items.length).toBeGreaterThanOrEqual(3);
    expect(all.body.total).toBeGreaterThanOrEqual(all.body.items.length);
    for (const item of all.body.items) {
      expect(item).not.toHaveProperty("passwordHash");
      expect(typeof item.upcomingBookings).toBe("number");
      expect(typeof item.isProtected).toBe("boolean");
    }

    const admins = await request(app)
      .get(`/users?query=${prefix}&role=admin`)
      .set(auth(boss.token));
    expect(admins.body.items.every((u: { role: string }) => u.role === "admin")).toBe(true);
    expect(admins.body.items.some((u: { id: string }) => u.id === boss.id)).toBe(true);

    const inactive = await request(app)
      .get(`/users?query=${prefix}&status=inactive`)
      .set(auth(boss.token));
    expect(inactive.body.items.every((u: { isActive: boolean }) => !u.isActive)).toBe(true);
    expect(inactive.body.items.some((u: { id: string }) => u.id === sleeper.id)).toBe(true);

    const demo = await request(app).get("/users?query=admin@example.com").set(auth(boss.token));
    const seeded = demo.body.items.find((u: { email: string }) => u.email === "admin@example.com");
    expect(seeded.isProtected).toBe(true);
  });

  it("promotes and demotes, effective on the very next request", async () => {
    const person = await makeUser("promote");

    const before = await request(app).get("/users").set(auth(person.token));
    expect(before.status).toBe(403);

    const up = await request(app)
      .patch(`/users/${person.id}/role`)
      .set(auth(boss.token))
      .send({ role: "admin" });
    expect(up.status).toBe(200);
    expect(up.body.user.role).toBe("admin");

    const during = await request(app).get("/users").set(auth(person.token));
    expect(during.status).toBe(200);

    const down = await request(app)
      .patch(`/users/${person.id}/role`)
      .set(auth(boss.token))
      .send({ role: "employee" });
    expect(down.body.user.role).toBe("employee");

    const after = await request(app).get("/users").set(auth(person.token));
    expect(after.status).toBe(403);
  });

  it("stops an admin changing their own account", async () => {
    const role = await request(app)
      .patch(`/users/${boss.id}/role`)
      .set(auth(boss.token))
      .send({ role: "employee" });
    expect(role.status).toBe(422);
    expect(role.body.error.code).toBe("CANNOT_MODIFY_SELF");

    const active = await request(app)
      .post(`/users/${boss.id}/active`)
      .set(auth(boss.token))
      .send({ isActive: false });
    expect(active.status).toBe(422);
    expect(active.body.error.code).toBe("CANNOT_MODIFY_SELF");
  });

  it("protects the demo accounts from every change", async () => {
    const demoEmployee = await prisma.user.findUniqueOrThrow({
      where: { email: "employee@example.com" },
    });
    const demoAdmin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@example.com" },
    });

    const promote = await request(app)
      .patch(`/users/${demoEmployee.id}/role`)
      .set(auth(boss.token))
      .send({ role: "admin" });
    expect(promote.status).toBe(422);
    expect(promote.body.error.code).toBe("PROTECTED_USER");

    const deactivate = await request(app)
      .post(`/users/${demoEmployee.id}/active`)
      .set(auth(boss.token))
      .send({ isActive: false });
    expect(deactivate.body.error.code).toBe("PROTECTED_USER");

    const demote = await request(app)
      .patch(`/users/${demoAdmin.id}/role`)
      .set(auth(boss.token))
      .send({ role: "employee" });
    expect(demote.body.error.code).toBe("PROTECTED_USER");
  });

  it("deactivates a user, cancelling only their future bookings", async () => {
    const victim = await makeUser("victim");
    const now = Date.now();

    const make = (
      title: string,
      start: number,
      end: number,
      status: "confirmed" | "cancelled" = "confirmed"
    ) =>
      prisma.booking.create({
        data: {
          resourceId,
          userId: victim.id,
          title: `TEST-${prefix}-${title}`,
          startAt: new Date(start),
          endAt: new Date(end),
          status,
          ...(status === "cancelled" ? { cancelledAt: new Date() } : {}),
        },
      });

    await make("future1", now + 48 * HOUR, now + 49 * HOUR);
    await make("future2", now + 72 * HOUR, now + 73 * HOUR);
    await make("old", now - 48 * HOUR, now - 47 * HOUR);
    await make("live", now - HOUR, now + HOUR);
    await make("already-cancelled", now + 96 * HOUR, now + 97 * HOUR, "cancelled");

    await prisma.passwordResetToken.create({
      data: {
        userId: victim.id,
        tokenHash: `hash-${stamp}`,
        expiresAt: new Date(now + 15 * 60 * 1000),
      },
    });

    const list = await request(app)
      .get(`/users?query=${victim.email}`)
      .set(auth(boss.token));
    expect(list.body.items[0].upcomingBookings).toBe(2);

    const res = await request(app)
      .post(`/users/${victim.id}/active`)
      .set(auth(boss.token))
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.cancelledBookings).toBe(2);
    expect(res.body.user.isActive).toBe(false);
    expect(res.body.user.upcomingBookings).toBe(0);

    const rows = await prisma.booking.findMany({ where: { userId: victim.id } });
    const status = (title: string) =>
      rows.find((b) => b.title === `TEST-${prefix}-${title}`)!.status;
    expect(status("future1")).toBe("cancelled");
    expect(status("future2")).toBe("cancelled");
    expect(status("old")).toBe("confirmed");
    expect(status("live")).toBe("confirmed");

    const tokens = await prisma.passwordResetToken.count({ where: { userId: victim.id } });
    expect(tokens).toBe(0);

    const login = await request(app)
      .post("/auth/login")
      .send({ email: victim.email, password });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe("ACCOUNT_DEACTIVATED");

    const oldToken = await request(app).get("/auth/me").set(auth(victim.token));
    expect(oldToken.status).toBe(403);
  });

  it("reactivates without restoring bookings, and repeats are harmless", async () => {
    const person = await makeUser("again");
    await prisma.booking.create({
      data: {
        resourceId,
        userId: person.id,
        title: `TEST-${prefix}-again`,
        startAt: new Date(Date.now() + 120 * HOUR),
        endAt: new Date(Date.now() + 121 * HOUR),
      },
    });

    await request(app)
      .post(`/users/${person.id}/active`)
      .set(auth(boss.token))
      .send({ isActive: false });

    const back = await request(app)
      .post(`/users/${person.id}/active`)
      .set(auth(boss.token))
      .send({ isActive: true });
    expect(back.status).toBe(200);
    expect(back.body.cancelledBookings).toBe(0);
    expect(back.body.user.isActive).toBe(true);
    expect(back.body.user.upcomingBookings).toBe(0);

    const repeat = await request(app)
      .post(`/users/${person.id}/active`)
      .set(auth(boss.token))
      .send({ isActive: true });
    expect(repeat.status).toBe(200);

    const first = await request(app)
      .patch(`/users/${person.id}/role`)
      .set(auth(boss.token))
      .send({ role: "admin" });
    const second = await request(app)
      .patch(`/users/${person.id}/role`)
      .set(auth(boss.token))
      .send({ role: "admin" });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.user.role).toBe("admin");
  });

  it("returns 404 for bad ids and 400 for bad input", async () => {
    const targets = ["not-a-uuid", "00000000-0000-0000-0000-000000000000"];
    for (const id of targets) {
      const role = await request(app)
        .patch(`/users/${id}/role`)
        .set(auth(boss.token))
        .send({ role: "admin" });
      expect(role.status).toBe(404);

      const active = await request(app)
        .post(`/users/${id}/active`)
        .set(auth(boss.token))
        .send({ isActive: false });
      expect(active.status).toBe(404);
    }

    const badRole = await request(app)
      .patch(`/users/${emp.id}/role`)
      .set(auth(boss.token))
      .send({ role: "boss" });
    expect(badRole.status).toBe(400);

    const badActive = await request(app)
      .post(`/users/${emp.id}/active`)
      .set(auth(boss.token))
      .send({ isActive: "yes" });
    expect(badActive.status).toBe(400);

    const badFilter = await request(app).get("/users?role=bogus").set(auth(boss.token));
    expect(badFilter.status).toBe(400);
  });

  it("lets only one of two admins demote each other at the same moment", async () => {
    const x = await makeUser("rival-x", "admin");
    const y = await makeUser("rival-y", "admin");

    const results = await Promise.all([
      request(app).patch(`/users/${y.id}/role`).set(auth(x.token)).send({ role: "employee" }),
      request(app).patch(`/users/${x.id}/role`).set(auth(y.token)).send({ role: "employee" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 403]);

    const rows = await prisma.user.findMany({ where: { id: { in: [x.id, y.id] } } });
    expect(rows.filter((u) => u.role === "admin")).toHaveLength(1);

    const activeAdmins = await prisma.user.count({ where: { role: "admin", isActive: true } });
    expect(activeAdmins).toBeGreaterThanOrEqual(1);
  });
});