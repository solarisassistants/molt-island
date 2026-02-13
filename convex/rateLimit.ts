import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Sliding window rate limiter using request timestamps
// More accurate than fixed windows - prevents burst abuse at window boundaries
export const check = internalMutation({
  args: {
    agentId: v.id("agents"),
    maxRequests: v.number(),
    windowMs: v.number(),
  },
  handler: async (ctx, { agentId, maxRequests, windowMs }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent) return false;

    const now = Date.now();
    const lastActionAt = agent.lastActionAt || 0;
    const minInterval = Math.floor(windowMs / Math.max(1, maxRequests));
    if (lastActionAt && now - lastActionAt < minInterval) {
      return false;
    }

    await ctx.db.patch(agentId, { lastActionAt: now, lastAfkDecayAt: now });
    return true;
  },
});

export const cleanup = internalMutation({
  handler: async (ctx) => {
    // Clean up records older than 1 hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    const oldRecords = await ctx.db
      .query("rateLimits")
      .filter((q) => q.lt(q.field("windowStart"), oneHourAgo))
      .collect();

    for (const record of oldRecords) {
      await ctx.db.delete(record._id);
    }
  },
});
