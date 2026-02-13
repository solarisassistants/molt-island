import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// REMOVED: game-tick-dispatcher - instant action system means no ticks needed
// HP regen and respawn now happen on-demand when agents take actions

// Maintenance: cleanup ground items and apply AFK decay (every 5 minutes)
crons.interval(
  "game-maintenance",
  { minutes: 5 },
  internal.game.maintenance
);

// Phase transition check: every minute
crons.interval(
  "phase-check",
  { minutes: 1 },
  internal.game.checkPhaseTransition
);

// Season end check: every minute
crons.interval(
  "season-end-check",
  { minutes: 1 },
  internal.game.checkSeasonEnd
);

// Transaction confirmation check: every 30 seconds
crons.interval(
  "tx-confirmation",
  { seconds: 30 },
  internal.payments.checkPendingTransactions
);

// Cleanup old rate limit records: every hour
crons.interval(
  "cleanup-rate-limits",
  { hours: 1 },
  internal.rateLimit.cleanup
);

// NPC respawn: every 5 minutes
crons.interval(
  "npc-respawn",
  { minutes: 5 },
  internal.npcs.respawn
);

// Events cleanup: every 6 hours
crons.interval(
  "events-cleanup",
  { hours: 6 },
  internal.events.cleanup
);

export default crons;
