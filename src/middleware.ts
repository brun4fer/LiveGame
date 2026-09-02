import { NextRequest, NextResponse } from "next/server";

const COOKIE = "live_game_session";
const publicPaths = ["/login", "/register", "/api/auth/login", "/api/auth/register", "/api/health"];

function bytes(value: string) { return new TextEncoder().encode(value); }
function base64url(value: ArrayBuffer) { return btoa(String.fromCharCode(...new Uint8Array(value))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }

async function validSession(token?: string) {
  if (!token || !process.env.AUTH_SECRET) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;
  const key = await crypto.subtle.importKey("raw", bytes(process.env.AUTH_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  if (base64url(await crypto.subtle.sign("HMAC", key, bytes(data))) !== signature) return null;
  try {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(normalized)) as { exp: number; mustChangePassword: boolean; needsOnboarding?: boolean };
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (publicPaths.includes(path) || path.startsWith("/_next") || path.includes(".")) return NextResponse.next();
  const session = await validSession(request.cookies.get(COOKIE)?.value);
  if (!session) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
    const url = new URL("/login", request.url);
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (session.mustChangePassword && !["/change-password", "/api/auth/change-password", "/api/auth/logout"].includes(path)) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Change the temporary password before continuing." }, { status: 403 });
    return NextResponse.redirect(new URL("/change-password", request.url));
  }
  if (session.needsOnboarding && !["/change-password", "/api/auth/change-password", "/onboarding", "/api/account", "/api/account/team", "/api/account/team/join", "/api/auth/logout"].includes(path)) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Complete the team setup before continuing." }, { status: 403 });
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon.svg).*)"] };
