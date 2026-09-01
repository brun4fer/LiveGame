import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

import { hashPassword, validatePassword } from "../src/lib/auth";

config({ path: ".env.local", quiet: true });

const [usernameInput, nameInput, password] = process.argv.slice(2);
const username = usernameInput?.trim().toLowerCase();
const name = nameInput?.trim();
if (!username || !name || !password) throw new Error("Usage: tsx scripts/create-user.ts <username> <name> <temporary-password>");
validatePassword(password);

async function main() {
  const prisma = new PrismaClient();
  try {
  if (await prisma.user.findUnique({ where: { username }, select: { id: true } })) throw new Error(`User "${username}" already exists.`);
  const user = await prisma.user.create({
    data: { username, name, passwordHash: hashPassword(password), mustChangePassword: true, role: "analyst" },
    select: { id: true, username: true, name: true, mustChangePassword: true, workspaceId: true },
  });
    console.log(JSON.stringify(user));
  } finally {
    await prisma.$disconnect();
  }
}

void main();

