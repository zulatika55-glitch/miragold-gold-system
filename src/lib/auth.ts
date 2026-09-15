import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const COOKIE_NAME = "miragold_session";
const SESSION_DAYS = 30;

type SessionPayload = {
  userId: string;
  customerId: string;
  role: string;
};

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

export async function createSession(userId: string, customerId: string, role: string) {
  const token = jwt.sign({ userId, customerId, role } satisfies SessionPayload, getSecret(), {
    expiresIn: `${SESSION_DAYS}d`,
  });

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return jwt.verify(token, getSecret()) as SessionPayload;
  } catch {
    return null;
  }
}

/** Loads the full current user row, or null if not authenticated. Also
 * enforces account status: SUSPENDED/CLOSED/REVIEW accounts cannot act. */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  return user ?? null;
}

export function isStaffOrAbove(role: string): boolean {
  return ["STAFF", "SUPERVISOR", "ADMIN", "OWNER"].includes(role);
}

export function isAdminOrAbove(role: string): boolean {
  return ["ADMIN", "OWNER"].includes(role);
}
