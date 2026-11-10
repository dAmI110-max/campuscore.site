/**
 * Supabase Auth session verification for the Express API.
 * Expects Authorization: Bearer <supabase_access_token>.
 * Set SUPABASE_URL + SUPABASE_ANON_KEY (or SUPABASE_JWT_SECRET) in the environment.
 */
import { createClient, type User } from "@supabase/supabase-js";
import type { Request } from "express";
import { HttpError } from "./errors";

export type AuthUser = {
  id: string;
  email: string | null;
  emailVerified: boolean;
};

let cached: ReturnType<typeof createClient> | null = null;

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !key) {
    throw new HttpError(503, "Authentication is not configured (missing SUPABASE_URL / key).");
  }
  return (cached ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }));
}

/** Public client for user JWT validation (anon key is enough to getUser with a token). */
function supabaseWithToken(accessToken: string) {
  const url = process.env.SUPABASE_URL?.trim();
  const anon = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) {
    throw new HttpError(503, "Authentication is not configured (missing SUPABASE_URL / SUPABASE_ANON_KEY).");
  }
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function bearerToken(req: Request): string | null {
  const header = req.get("authorization") || req.get("Authorization");
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m?.[1]?.trim() || null;
}

export async function identityFromSupabase(req: Request): Promise<AuthUser | null> {
  const token = bearerToken(req);
  if (!token) return null;
  const client = supabaseWithToken(token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return mapUser(data.user);
}

function mapUser(user: User): AuthUser {
  const email = user.email ?? null;
  const emailVerified = Boolean(
    user.email_confirmed_at || user.confirmed_at || (user as { email_confirmed?: boolean }).email_confirmed,
  );
  return { id: user.id, email, emailVerified };
}

export async function requireSupabaseUser(req: Request): Promise<AuthUser> {
  const user = await identityFromSupabase(req);
  if (!user) throw new HttpError(401, "Please sign in to continue.");
  return user;
}

/** Optional admin lookup of a user by id (service role). */
export async function getSupabaseUserById(userId: string): Promise<AuthUser | null> {
  try {
    const { data, error } = await supabaseAdmin().auth.admin.getUserById(userId);
    if (error || !data.user) return null;
    return mapUser(data.user);
  } catch {
    return null;
  }
}
