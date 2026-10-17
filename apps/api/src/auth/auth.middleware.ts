import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { prisma } from "../db";
import { HttpError } from "./auth.service";

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new HttpError(401, "UNAUTHENTICATED", "Missing or invalid token");
    }

    const token = header.slice("Bearer ".length);

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    } catch {
      throw new HttpError(401, "UNAUTHENTICATED", "Missing or invalid token");
    }

    const user = await prisma.user.findUnique({ where: { id: String(payload.sub) } });
    if (!user) {
      throw new HttpError(401, "UNAUTHENTICATED", "Missing or invalid token");
    }
    if (!user.isActive) {
      throw new HttpError(403, "ACCOUNT_DEACTIVATED", "This account has been deactivated");
    }

    req.user = { id: user.id, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(role: "admin") {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new HttpError(401, "UNAUTHENTICATED", "Missing or invalid token"));
    }
    if (req.user.role !== role) {
      return next(new HttpError(403, "FORBIDDEN", "You do not have access to this resource"));
    }
    next();
  };
}