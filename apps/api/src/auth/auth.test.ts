import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../db";

const testEmail = `test-${Date.now()}@example.com`;
const password = "Password123!";

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: testEmail } });
  await prisma.$disconnect();
});

describe("register", () => {
  it("creates an employee and returns a token", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ name: "Test", email: testEmail, password });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("employee");
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("rejects a duplicate email with 409", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ name: "Test", email: testEmail, password });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects a short password with 400", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ name: "Test", email: "x@example.com", password: "123" });
    expect(res.status).toBe(400);
  });

  it("rejects a password without a capital letter or special character", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ name: "Test", email: "weak@example.com", password: "password123" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("WEAK_PASSWORD");
  });
});

describe("login", () => {
  it("returns a token for correct credentials", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: testEmail, password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
  });

  it("rejects a wrong password with 401", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: testEmail, password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("/auth/me and role guard", () => {
  it("rejects a request with no token", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the current user with a valid token", async () => {
    const login = await request(app)
      .post("/auth/login")
      .send({ email: testEmail, password });
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(testEmail);
  });
});