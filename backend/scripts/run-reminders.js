import "dotenv/config";
import prisma from "../src/repositories/prisma.js";
import {
  createReminderService,
  mailtrapSender,
} from "../src/sprint2/reminders.js";
try {
  console.log(await createReminderService(prisma, mailtrapSender())());
} catch {
  console.error(
    "Reminder run failed. Check sandbox configuration; do not paste credentials into logs or chat.",
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
