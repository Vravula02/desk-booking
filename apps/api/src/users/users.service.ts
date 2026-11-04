import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { config } from "../config";
import { HttpError } from "../auth/auth.service";

type Role = "employee" | "admin";
type Tx = Prisma.TransactionClient;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN_LOCK_KEY = 4242001; // one shared lock for every role or status change
const LIST_LIMIT = 50;

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function isProtected(email: string) {
  return config.protectedEmails.includes(email.toLowerCase());
}

function toItem(u: UserRow, upcomingBookings: number) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
    upcomingBookings,
    isProtected: isProtected(u.email),
  };
}

const notFound = () => new HttpError(404, "NOT_FOUND", "User not found");

export async function listUsers(filters: {
  query?: string;
  role?: Role;
  status?: "active" | "inactive";
}) {
  const where: Prisma.UserWhereInput = {
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.status ? { isActive: filters.status === "active" } : {}),
    ...(filters.query
      ? {
          OR: [
            { name: { contains: filters.query, mode: "insensitive" } },
            { email: { contains: filters.query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { name: "asc" },
      take: LIST_LIMIT,
      select: userSelect,
    }),
    prisma.user.count({ where }),
  ]);

  const counts = await prisma.booking.groupBy({
    by: ["userId"],
    where: {
      userId: { in: users.map((u) => u.id) },
      status: "confirmed",
      startAt: { gt: new Date() },
    },
    _count: { _all: true },
  });
  const upcoming = new Map(counts.map((c) => [c.userId, c._count._all]));

  return {
    items: users.map((u) => toItem(u, upcoming.get(u.id) ?? 0)),
    total,
  };
}

// Runs one change as a single transaction, behind one lock, with all the safety checks.
async function guarded(
  actorId: string,
  targetId: string,
  action: string,
  mutate: (tx: Tx, target: UserRow) => Promise<{ changed: boolean; cancelled: number }>
) {
  if (!UUID_RE.test(targetId)) throw notFound();

  const out = await prisma.$transaction(async (tx) => {
    // Admin changes queue up here, so two of them can never race each other
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_LOCK_KEY}::bigint)`;

    // Re-check the acting admin now that we hold the lock
    const actor = await tx.user.findUnique({ where: { id: actorId } });
    if (!actor || !actor.isActive || actor.role !== "admin") {
      throw new HttpError(403, "FORBIDDEN", "You do not have access to this resource");
    }
    if (actorId === targetId) {
      throw new HttpError(422, "CANNOT_MODIFY_SELF", "You can't change your own account here");
    }

    const target = await tx.user.findUnique({ where: { id: targetId }, select: userSelect });
    if (!target) throw notFound();
    if (isProtected(target.email)) {
      throw new HttpError(422, "PROTECTED_USER", "This account is protected and can't be changed");
    }

    const { changed, cancelled } = await mutate(tx, target);

    if (changed) {
      const admins = await tx.user.count({ where: { role: "admin", isActive: true } });
      if (admins === 0) {
        throw new HttpError(422, "LAST_ADMIN", "At least one active admin is required");
      }
    }

    const fresh = await tx.user.findUniqueOrThrow({ where: { id: targetId }, select: userSelect });
    const upcoming = await tx.booking.count({
      where: { userId: targetId, status: "confirmed", startAt: { gt: new Date() } },
    });
    return { user: toItem(fresh, upcoming), cancelledBookings: cancelled, changed };
  });

  if (out.changed) {
    // Ids only, no email addresses
    console.log(
      JSON.stringify({ event: "admin.user_changed", action, actor: actorId, target: targetId })
    );
  }
  return { user: out.user, cancelledBookings: out.cancelledBookings };
}

export function setUserRole(actorId: string, targetId: string, role: Role) {
  return guarded(actorId, targetId, `role:${role}`, async (tx, target) => {
    if (target.role === role) return { changed: false, cancelled: 0 };
    await tx.user.update({ where: { id: target.id }, data: { role } });
    return { changed: true, cancelled: 0 };
  });
}

export function setUserActive(actorId: string, targetId: string, isActive: boolean) {
  return guarded(actorId, targetId, isActive ? "reactivate" : "deactivate", async (tx, target) => {
    if (target.isActive === isActive) return { changed: false, cancelled: 0 };
    await tx.user.update({ where: { id: target.id }, data: { isActive } });

    let cancelled = 0;
    if (!isActive) {
      const result = await tx.booking.updateMany({
        where: { userId: target.id, status: "confirmed", startAt: { gt: new Date() } },
        data: { status: "cancelled", cancelledAt: new Date() },
      });
      cancelled = result.count;
      await tx.passwordResetToken.deleteMany({ where: { userId: target.id, usedAt: null } });
    }
    return { changed: true, cancelled };
  });
}