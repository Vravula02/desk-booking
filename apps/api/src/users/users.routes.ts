import { Router } from "express";
import { requireAuth, requireRole } from "../auth/auth.middleware";
import { listUsers, setUserActive, setUserRole } from "./users.service";

export const usersRouter = Router();

// Every route here is admin-only, enforced on the server
usersRouter.use(requireAuth, requireRole("admin"));

const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);

usersRouter.get("/", async (req, res, next) => {
  try {
    const rawQuery = blankToUndefined(req.query.query);
    const rawRole = blankToUndefined(req.query.role);
    const rawStatus = blankToUndefined(req.query.status);

    const bad =
      (rawQuery !== undefined && typeof rawQuery !== "string") ||
      (rawRole !== undefined && rawRole !== "employee" && rawRole !== "admin") ||
      (rawStatus !== undefined && rawStatus !== "active" && rawStatus !== "inactive");

    if (bad) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid filter value" },
      });
    }

    res.json(
      await listUsers({
        query: typeof rawQuery === "string" ? rawQuery.trim() || undefined : undefined,
        role: rawRole === "employee" || rawRole === "admin" ? rawRole : undefined,
        status: rawStatus === "active" || rawStatus === "inactive" ? rawStatus : undefined,
      })
    );
  } catch (err) {
    next(err);
  }
});

usersRouter.patch("/:id/role", async (req, res, next) => {
  try {
    const { role } = req.body ?? {};
    if (role !== "employee" && role !== "admin") {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "role must be employee or admin" },
      });
    }
    res.json(await setUserRole(req.user!.id, String(req.params.id), role));
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/:id/active", async (req, res, next) => {
  try {
    const { isActive } = req.body ?? {};
    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "isActive must be true or false" },
      });
    }
    res.json(await setUserActive(req.user!.id, String(req.params.id), isActive));
  } catch (err) {
    next(err);
  }
});