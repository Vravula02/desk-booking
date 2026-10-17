import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app";
import { prisma } from "../db";

const testName = `Test Room ${Date.now()}`;

async function login(email: string, password: string) {
  const res = await request(app).post("/auth/login").send({ email, password });
  return res.body.token as string;
}

afterAll(async () => {
  await prisma.resource.deleteMany({ where: { name: testName } });
  await prisma.$disconnect();
});

describe("POST /resources", () => {
  it("blocks an employee with 403", async () => {
    const token = await login("employee@example.com", "Employee123!");
    const res = await request(app)
      .post("/resources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: testName, type: "room", capacity: 4 });
    expect(res.status).toBe(403);
  });

  it("lets an admin create a resource", async () => {
    const token = await login("admin@example.com", "Admin123!");
    const res = await request(app)
      .post("/resources")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: testName, type: "room", capacity: 4 });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(testName);
  });
});