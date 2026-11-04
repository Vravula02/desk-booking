import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { authRouter } from "./auth/auth.routes";
import { HttpError } from "./auth/auth.service";
import { resourcesRouter } from "./resources/resources.routes";
import { bookingsRouter } from "./bookings/bookings.routes";
import { availabilityRouter } from "./availability/availability.routes";
import { config } from "./config";
import { usersRouter } from "./users/users.routes";

export const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/config", (_req, res) => {
  res.json({ timezone: config.officeTimezone });
});

app.use("/auth", authRouter);
app.use("/resources", resourcesRouter);
app.use("/bookings", bookingsRouter);
app.use("/users", usersRouter);
app.use("/availability", availabilityRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    return res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message } });
  }
  console.error(err);
  res
    .status(500)
    .json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
});