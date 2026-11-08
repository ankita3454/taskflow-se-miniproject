import nodemailer from "nodemailer";
import prisma from "../repositories/prisma.js";
import { utcToday } from "./dashboard.js";
import { lockProject } from "./common.js";
// The free Mailtrap sandbox accepts one message per 10 seconds. Serialize
// attempts before opening the send transaction, so waiting never holds a DB lock.
// This queue is process-local; separate workers need shared coordination.
export function createSendPacer({
  intervalMs = 10500,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  let tail = Promise.resolve();
  let nextAllowedAt = 0;
  return (operation) => {
    const run = async () => {
      const delay = nextAllowedAt - now();
      if (delay > 0) await sleep(delay);
      try {
        return await operation();
      } finally {
        nextAllowedAt = now() + intervalMs;
      }
    };
    const result = tail.then(run, run);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}

const sandboxSendPacer = createSendPacer();
export function mailtrapSender(env = process.env) {
  const host = env.MAILTRAP_HOST || "sandbox.smtp.mailtrap.io",
    port = Number(env.MAILTRAP_PORT || 2525);
  if (
    host !== "sandbox.smtp.mailtrap.io" ||
    ![2525, 587, 465].includes(port) ||
    !env.MAILTRAP_USER ||
    !env.MAILTRAP_PASSWORD
  )
    throw new Error(
      "Configure Mailtrap sandbox credentials and a supported sandbox port",
    );
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: env.MAILTRAP_USER, pass: env.MAILTRAP_PASSWORD },
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  const send = (message) => transport.sendMail(message);
  send.runWithPacing = sandboxSendPacer;
  return send;
}
export function createReminderService(db = prisma, sendMail) {
  return async function run(now = new Date()) {
    const today = utcToday(now),
      dates = [1, 3].map((n) => new Date(today.getTime() + n * 86400000));
    const candidates = await db.task.findMany({
      where: {
        status: { not: "DONE" },
        assigneeId: { not: null },
        dueDate: { in: dates },
      },
    });
    const result = { sent: 0, skipped: 0, uncertain: 0 };
    for (const candidate of candidates) {
      let claim;
      try {
        claim = await db.$transaction(async (tx) => {
          await lockProject(tx, candidate.projectId);
          const task = await tx.task.findUnique({
            where: { id: candidate.id },
            include: { assignee: true },
          });
          const interval = task?.dueDate
            ? (task.dueDate - today) / 86400000
            : 0;
          if (
            !task ||
            task.status === "DONE" ||
            ![1, 3].includes(interval) ||
            !task.assignee?.active
          )
            return null;
          const member = await tx.projectMember.findUnique({
            where: {
              projectId_userId: {
                projectId: task.projectId,
                userId: task.assigneeId,
              },
            },
          });
          if (!member) return null;
          const reminder = await tx.reminder.create({
            data: { taskId: task.id, interval, recipientId: task.assigneeId },
          });
          await tx.notification.create({
            data: {
              userId: task.assigneeId,
              taskId: task.id,
              type: "DUE_REMINDER",
              body: `Task "${task.title}" is due in ${interval} day${interval === 1 ? "" : "s"}.`,
            },
          });
          return {
            id: reminder.id,
            projectId: task.projectId,
            taskId: task.id,
            recipientId: task.assigneeId,
            interval,
          };
        });
      } catch (e) {
        if (e.code === "P2002") {
          result.skipped++;
          continue;
        }
        throw e;
      }
      if (!claim) {
        result.skipped++;
        continue;
      }
      try {
        const sendTransaction = () => db.$transaction(
          async (tx) => {
            await lockProject(tx, claim.projectId);
            const task = await tx.task.findUnique({
              where: { id: claim.taskId },
              include: { assignee: true },
            });
            const membership = task?.assigneeId
              ? await tx.projectMember.findUnique({
                  where: {
                    projectId_userId: {
                      projectId: claim.projectId,
                      userId: task.assigneeId,
                    },
                  },
                })
              : null;
            if (
              !task ||
              task.status === "DONE" ||
              !task.assignee?.active ||
              !membership ||
              task.assigneeId !== claim.recipientId ||
              !task.dueDate ||
              (task.dueDate - today) / 86400000 !== claim.interval
            ) {
              await tx.reminder.updateMany({
                where: { id: claim.id },
                data: { state: "CANCELLED" },
              });
              return false;
            }
            if (!sendMail)
              throw new Error("No configured sandbox mail transport");
            await sendMail({
              from: "TaskFlow <taskflow@example.test>",
              to: task.assignee.email,
              subject: `TaskFlow: task due in ${claim.interval} day${claim.interval === 1 ? "" : "s"}`,
              text: `${task.title}\nDue date (UTC): ${task.dueDate.toISOString().slice(0, 10)}\nOpen TaskFlow to review this task.`,
              messageId: `<taskflow-reminder-${claim.id}@example.test>`,
            });
            await tx.reminder.update({
              where: { id: claim.id },
              data: { state: "SENT", sentAt: now },
            });
            return true;
          },
          { timeout: 30000 },
        );
        const sent = sendMail?.runWithPacing
          ? await sendMail.runWithPacing(sendTransaction)
          : await sendTransaction();
        if (sent) result.sent++;
        else result.skipped++;
      } catch {
        // SMTP acceptance and PostgreSQL commit cannot be made atomic. Never blindly retry
        // an uncertain send: the persistent task/interval claim remains unique.
        await db.reminder.updateMany({
          where: { id: claim.id },
          data: { state: "UNKNOWN" },
        });
        result.uncertain++;
      }
    }
    return result;
  };
}
export function startReminderScheduler() {
  if (process.env.REMINDERS_ENABLED !== "true") return () => {};
  const run = createReminderService(prisma, mailtrapSender());
  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      const r = await run();
      console.info("Reminder scheduler", r);
    } catch {
      console.error(
        "Reminder scheduler failed; inspect configuration/database without exposing credentials.",
      );
    } finally {
      running = false;
    }
  }
  tick();
  const timer = setInterval(tick, 60000);
  timer.unref();
  return () => clearInterval(timer);
}
