import { PrismaClient as MediaPrismaClient } from "@/generated/media-client";

const globalForMediaPrisma = globalThis as unknown as { mediaPrisma?: MediaPrismaClient };

export const mediaPrisma = globalForMediaPrisma.mediaPrisma ?? new MediaPrismaClient();

if (process.env.NODE_ENV !== "production") globalForMediaPrisma.mediaPrisma = mediaPrisma;

