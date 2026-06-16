import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Session, User } from "@/types";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "eks-inventory-dev-secret-change-in-prod"
);
const COOKIE = "eks_session";
const EXPIRY = 60 * 60 * 8; // 8 hours

// ─── Hardcoded users (replace with DB / LDAP in production) ──────────────────
const USERS: Array<User & { password: string }> = [
  { id: "1", username: "admin", password: process.env.ADMIN_PASSWORD ?? "admin123", role: "admin" },
  { id: "2", username: "viewer", password: process.env.VIEWER_PASSWORD ?? "viewer123", role: "viewer" },
];

export async function signIn(
  username: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const user = USERS.find(
    (u) => u.username === username && u.password === password
  );
  if (!user) return { ok: false, error: "Invalid credentials" };

  const token = await new SignJWT({ id: user.id, username: user.username, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${EXPIRY}s`)
    .setIssuedAt()
    .sign(SECRET);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: EXPIRY,
    path: "/",
  });

  return { ok: true };
}

export async function getSession(): Promise<Session | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, SECRET);
    return {
      user: {
        id: payload.id as string,
        username: payload.username as string,
        role: payload.role as User["role"],
      },
      expiresAt: (payload.exp ?? 0) * 1000,
    };
  } catch {
    return null;
  }
}

export async function signOut() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
}

export async function requireAuth(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireAuth();
  if (session.user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return session;
}
