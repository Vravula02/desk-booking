import crypto from "crypto";
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../db";

const ids: string[] = [];
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

async function makeUser(label: string) {
  const email = `acct-${label}-${Date.now()}@example.com`;
  const password = "Password123!";
  const res = await request(app)
    .post("/auth/register")
    .send({ name: `Acct ${label}`, email, password });
  ids.push(res.body.user.id);
  return { email, password, token: res.body.token as string, id: res.body.user.id as string };
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

describe("account details and name", () => {
  it("returns details, needs a token, and updates the name", async () => {
    const u = await makeUser("name");

    expect((await request(app).get("/account")).status).toBe(401);

    const details = await request(app).get("/account").set(auth(u.token));
    expect(details.status).toBe(200);
    expect(details.body.email).toBe(u.email);
    expect(details.body.createdAt).toBeTypeOf("string");

    const renamed = await request(app)
      .patch("/account")
      .set(auth(u.token))
      .send({ name: "  New Name " });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe("New Name");

    const empty = await request(app).patch("/account").set(auth(u.token)).send({ name: "  " });
    expect(empty.status).toBe(400);
  });
});

describe("change password", () => {
  it("checks the current password and the rules", async () => {
    const u = await makeUser("pw-checks");

    const wrong = await request(app)
      .post("/account/password")
      .set(auth(u.token))
      .send({ currentPassword: "Wrong123!", newPassword: "Another123!" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe("INVALID_CURRENT_PASSWORD");

    const weak = await request(app)
      .post("/account/password")
      .set(auth(u.token))
      .send({ currentPassword: u.password, newPassword: "weak" });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe("WEAK_PASSWORD");
  });

  it("signs out older sessions but keeps this one", async () => {
    const u = await makeUser("pw-change");
    const newPassword = "Changed456!";

    const res = await request(app)
      .post("/account/password")
      .set(auth(u.token))
      .send({ currentPassword: u.password, newPassword });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");

    expect((await request(app).get("/auth/me").set(auth(u.token))).status).toBe(401);
    expect((await request(app).get("/auth/me").set(auth(res.body.token))).status).toBe(200);

    const loginNew = await request(app).post("/auth/login").send({ email: u.email, password: newPassword });
    expect(loginNew.status).toBe(200);
    const loginOld = await request(app).post("/auth/login").send({ email: u.email, password: u.password });
    expect(loginOld.status).toBe(401);
  });
});

describe("request an email change", () => {
  it("validates, then creates one request and enforces the cooldown", async () => {
    const u = await makeUser("em-req");
    const other = await makeUser("em-other");
    const newEmail = `acct-new-${Date.now()}@example.com`;
    const send = (body: object) =>
      request(app).post("/account/email").set(auth(u.token)).send(body);

    expect((await send({ newEmail, currentPassword: "Wrong123!" })).body.error.code).toBe(
      "INVALID_CURRENT_PASSWORD"
    );
    expect((await send({ newEmail: "not-an-email", currentPassword: u.password })).status).toBe(400);
    expect((await send({ newEmail: other.email, currentPassword: u.password })).status).toBe(409);

    const ok = await send({ newEmail, currentPassword: u.password });
    expect(ok.status).toBe(202);
    const row = await prisma.emailChangeRequest.findFirst({ where: { userId: u.id } });
    expect(row?.newEmail).toBe(newEmail);

    const again = await send({ newEmail, currentPassword: u.password });
    expect(again.status).toBe(429);
  });
});

describe("confirm an email change", () => {
  it("rejects bad, expired and reused links, and applies a good one", async () => {
    const u = await makeUser("em-confirm");
    const confirm = (token: string) =>
      request(app).post("/account/email/confirm").send({ token });

    expect((await confirm("not-a-real-token")).status).toBe(400);

    const expiredToken = crypto.randomBytes(16).toString("hex");
    await prisma.emailChangeRequest.create({
      data: {
        userId: u.id,
        newEmail: `expired-${Date.now()}@example.com`,
        tokenHash: hash(expiredToken),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    expect((await confirm(expiredToken)).status).toBe(400);

    const newEmail = `confirmed-${Date.now()}@example.com`;
    const token = crypto.randomBytes(16).toString("hex");
    await prisma.emailChangeRequest.create({
      data: {
        userId: u.id,
        newEmail,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    expect((await confirm(token)).status).toBe(200);
    expect((await confirm(token)).status).toBe(400);

    const login = await request(app).post("/auth/login").send({ email: newEmail, password: u.password });
    expect(login.status).toBe(200);
    expect((await request(app).get("/auth/me").set(auth(u.token))).status).toBe(401);
  });
});

describe("protected demo accounts", () => {
  it("cannot be changed", async () => {
    const login = await request(app)
      .post("/auth/login")
      .send({ email: "employee@example.com", password: "Employee123!" });
    const res = await request(app)
      .patch("/account")
      .set(auth(login.body.token))
      .send({ name: "Hacked" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PROTECTED_ACCOUNT");
  });
});