import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { prisma } from "@/lib/prisma";

const TOKEN_LIFETIME_MS = 8 * 60 * 60 * 1000;

type CameraPairingPayload = {
  purpose: "live-game-camera";
  matchId: string;
  workspaceId: string;
  userId: string;
  exp: number;
  nonce: string;
};

function secret() {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value) throw new Error("AUTH_SECRET is required to pair a phone camera.");
  return value;
}

function sign(data: string) {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function createCameraPairingToken(input: Pick<CameraPairingPayload, "matchId" | "workspaceId" | "userId">) {
  const expiresAt = Date.now() + TOKEN_LIFETIME_MS;
  const payload: CameraPairingPayload = {
    purpose: "live-game-camera",
    ...input,
    exp: expiresAt,
    nonce: randomBytes(18).toString("base64url"),
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${data}.${sign(data)}`, expiresAt: new Date(expiresAt).toISOString() };
}

export function readCameraPairingToken(token: string) {
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;
  const expected = sign(data);
  const providedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (providedBytes.length !== expectedBytes.length || !timingSafeEqual(providedBytes, expectedBytes)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as CameraPairingPayload;
    if (payload.purpose !== "live-game-camera" || payload.exp <= Date.now()) return null;
    if (![payload.matchId, payload.workspaceId, payload.userId, payload.nonce].every((value) => typeof value === "string" && value.length > 0)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function requireCameraPairing(token: string) {
  const payload = readCameraPairingToken(token);
  if (!payload) throw new Error("This camera link is invalid or has expired. Generate a new QR code on the match computer.");
  const [match, user] = await Promise.all([
    prisma.match.findFirst({ where: { id: payload.matchId, workspaceId: payload.workspaceId }, select: { id: true, title: true, workspaceId: true } }),
    prisma.user.findFirst({ where: { id: payload.userId, workspaceId: payload.workspaceId }, select: { id: true } }),
  ]);
  if (!match || !user) throw new Error("This camera link no longer belongs to an active workspace.");
  return { payload, match };
}
