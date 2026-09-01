import { Prisma } from "@prisma/client";
import { cookies } from "next/headers";

import { createSessionToken, hashPassword, SESSION_COOKIE, sessionCookieOptions, validatePassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: string; username?: string; password?: string; confirmation?: string };
    const name = body.name?.trim() || "";
    const username = body.username?.trim().toLowerCase() || "";
    const password = body.password || "";

    if (name.length < 2 || name.length > 80) {
      return Response.json({ error: "Your name must contain between 2 and 80 characters." }, { status: 400 });
    }
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      return Response.json({ error: "The username must be 3 to 40 characters and use only letters, numbers, dots, hyphens or underscores." }, { status: 400 });
    }
    if (password !== body.confirmation) {
      return Response.json({ error: "The passwords do not match." }, { status: 400 });
    }
    validatePassword(password);

    const user = await prisma.user.create({
      data: {
        name,
        username,
        passwordHash: hashPassword(password),
        mustChangePassword: false,
        role: "analyst"
      }
    });
    const token = createSessionToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      mustChangePassword: false,
      needsOnboarding: true,
      managementAccessVersion: null
    });
    (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
    return Response.json({ id: user.id, name: user.name, username: user.username, needsOnboarding: true }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "This username is already in use." }, { status: 409 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Could not create the account." }, { status: 400 });
  }
}

