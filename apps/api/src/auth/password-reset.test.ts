import crypto from "crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../db";

const email = `reset-${Date.now()}@example.com`;
const oldPassword = "OldPassword1!";
const newPassword = "NewPassword1!";
const goodToken = `good-${Date.now()}`;
const expiredToken = `expired-${Date.now()}`;

const sha = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

async function addToken(token: string, minutesFromNow: number) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: sha(token),
      expiresAt: new Date(Date.now() + minutesFromNow * 60 * 1000),
    },
  });
}

beforeAll(async () => {
  const res = await request(app)
    .post("/auth/register")
    .send({ name: "Reset Test", email, password: oldPassword });
  expect(res.status).toBe(201);
  await addToken(goodToken, 30);
  await addToken(expiredToken, -5);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("password reset", () => {
  it("reports a good token as valid and a bad one as invalid", async () => {
    const good = await request(app).post("/auth/reset/check").send({ token: goodToken });
    expect(good.body.valid).toBe(true);

    const bad = await request(app).post("/auth/reset/check").send({ token: "nonsense" });
    expect(bad.body.valid).toBe(false);
  });

  it("rejects a weak new password and keeps the token usable", async () => {
    const res = await request(app)
      .post("/auth/reset")
      .send({ token: goodToken, newPassword: "weak" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("WEAK_PASSWORD");

    const check = await request(app).post("/auth/reset/check").send({ token: goodToken });
    expect(check.body.valid).toBe(true);
  });

  it("resets the password once, then the token stops working", async () => {
    const res = await request(app)
      .post("/auth/reset")
      .send({ token: goodToken, newPassword });
    expect(res.status).toBe(200);

    const oldLogin = await request(app).post("/auth/login").send({ email, password: oldPassword });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post("/auth/login").send({ email, password: newPassword });
    expect(newLogin.status).toBe(200);

    const again = await request(app)
      .post("/auth/reset")
      .send({ token: goodToken, newPassword: "AnotherPass1!" });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("INVALID_OR_EXPIRED_TOKEN");
  });

  it("rejects an expired token", async () => {
    const check = await request(app).post("/auth/reset/check").send({ token: expiredToken });
    expect(check.body.valid).toBe(false);

    const res = await request(app)
      .post("/auth/reset")
      .send({ token: expiredToken, newPassword });
    expect(res.status).toBe(400);
  });
});