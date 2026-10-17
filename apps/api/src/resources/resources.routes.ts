import { Router } from "express";
import { requireAuth, requireRole } from "../auth/auth.middleware";
import { createResource, listResources, setResourceActive, updateResource } from "./resources.service";

export const resourcesRouter = Router();

resourcesRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    // Only admins may see inactive resources
    const wantsInactive = req.query.includeInactive === "true";
    const includeInactive = wantsInactive && req.user!.role === "admin";

    const resources = await listResources(includeInactive);
    res.json(resources);
  } catch (err) {
    next(err);
  }
});

resourcesRouter.post("/", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const { name, type, floor, capacity, description } = req.body ?? {};

    if (
      typeof name !== "string" || name.trim() === "" ||
      (type !== "room" && type !== "desk") ||
      !Number.isInteger(capacity) || capacity < 1
    ) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Name, type (room or desk), and capacity (whole number, at least 1) are required",
        },
      });
    }

    const resource = await createResource({
      name,
      type,
      floor: typeof floor === "string" ? floor : undefined,
      capacity,
      description: typeof description === "string" ? description : undefined,
    });
    res.status(201).json(resource);
  } catch (err) {
    next(err);
  }
});

resourcesRouter.patch("/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const { name, type, floor, capacity, description } = req.body ?? {};

    const invalid =
      (name !== undefined && (typeof name !== "string" || name.trim() === "")) ||
      (type !== undefined && type !== "room" && type !== "desk") ||
      (capacity !== undefined && (!Number.isInteger(capacity) || capacity < 1)) ||
      (floor !== undefined && typeof floor !== "string") ||
      (description !== undefined && typeof description !== "string");

    if (invalid) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "One or more fields are invalid" },
      });
    }

    const resource = await updateResource(String(req.params.id), {
      name,
      type,
      floor,
      capacity,
      description,
    });
    res.json(resource);
  } catch (err) {
    next(err);
  }
});

resourcesRouter.post(
  "/:id/active",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const { isActive } = req.body ?? {};

      if (typeof isActive !== "boolean") {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "isActive must be true or false" },
        });
      }

      const result = await setResourceActive(String(req.params.id), isActive);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);