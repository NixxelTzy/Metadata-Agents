/**
 * instrumentation.ts
 * Next.js Server Boot Initialization Hook
 *
 * Runs once when the Next.js server boots up.
 * Automatically starts the Autonomous Giveaway Scheduler Daemon in Node.js runtime.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { startGiveawayAutonomousDaemon } = await import("@/lib/giveaway");
      startGiveawayAutonomousDaemon();
    } catch (err) {
      console.error("[Instrumentation] Failed to start giveaway autonomous daemon:", err);
    }
  }
}
