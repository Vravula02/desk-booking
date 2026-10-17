import jwt from "jsonwebtoken";
import { config } from "../config";

export type TokenPayload = {
  sub: string;
  role: "employee" | "admin";
};

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}