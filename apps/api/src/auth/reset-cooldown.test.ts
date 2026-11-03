import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../db";

const email = `cooldown-${Date.now()}@example.com`;
let userId = "";

async function tokens() {
  return prisma.passwordResetToken.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
}

beforeAll(async () => {
  // Tests must never send real email, even if .env holds Azure settings
  delete process.env.ACS_CONNECTION_STRING;

  const res = await request(app)
    .post("/auth/register")
    .send({ name: "Cooldown Test", email, password: "CoolDown1!" });
  expect(res.status).toBe(201);
  userId = res.body.user.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("reset link cooldown", () => {
  it("creates one link and ignores a second request within 2 minutes", async () => {
    const first = await request(app).post("/auth/forgot").send({ email });
    expect(first.status).toBe(202);
    expect(first.body.retryAfterSeconds).toBe(120);
    const afterFirst = await tokens();
    expect(afterFirst).toHaveLength(1);

    const second = await request(app).post("/auth/forgot").send({ email });
    expect(second.status).toBe(202);
    const afterSecond = await tokens();
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0].id).toBe(afterFirst[0].id);
  });

  it("allows a new link after the cooldown, which replaces the old one", async () => {
    const before = await tokens();
    await prisma.passwordResetToken.update({
      where: { id: before[0].id },
      data: { createdAt: new Date(Date.now() - 3 * 60 * 1000) },
    });

    const res = await request(app).post("/auth/forgot").send({ email });
    expect(res.status).toBe(202);

    const after = await tokens();
    expect(after).toHaveLength(1);
    expect(after[0].id).not.toBe(before[0].id);

    const minutes = (after[0].expiresAt.getTime() - after[0].createdAt.getTime()) / 60000;
    expect(Math.round(minutes)).toBe(15);
  });
});