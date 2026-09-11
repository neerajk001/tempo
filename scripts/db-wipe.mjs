import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

// One-off destructive maintenance: wipe product data, keep users (logins).
const envText = fs.readFileSync(new URL("../.env", import.meta.url), "utf8");
const line = envText.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
if (!line) throw new Error("DATABASE_URL missing in .env");
const url = line.slice("DATABASE_URL=".length).replace(/^"|"$/g, "");

const db = new PrismaClient({ datasourceUrl: url });

const counts = async () => ({
  tasks: await db.task.count(),
  sessions: await db.pomodoroSession.count(),
  events: await db.sessionEvent.count(),
  users: await db.user.count(),
});

console.log("BEFORE", JSON.stringify(await counts()));
await db.sessionEvent.deleteMany({});
await db.pomodoroSession.deleteMany({});
await db.task.deleteMany({});
console.log("AFTER", JSON.stringify(await counts()));
await db.$disconnect();
