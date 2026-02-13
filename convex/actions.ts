import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const getByAgentTick = internalQuery({
  args: { agentId: v.id("agents"), tick: v.number() },
  handler: async (ctx, { agentId, tick }) => {
    return ctx.db
      .query("actions")
      .withIndex("by_agent_tick", (q) => q.eq("agentId", agentId).eq("tick", tick))
      .first();
  },
});

// Check specifically for tick-type actions (for HP regen idempotency)
export const getTickActionByAgentTick = internalQuery({
  args: { agentId: v.id("agents"), tick: v.number() },
  handler: async (ctx, { agentId, tick }) => {
    const actions = await ctx.db
      .query("actions")
      .withIndex("by_agent_tick", (q) => q.eq("agentId", agentId).eq("tick", tick))
      .collect();
    return actions.find((a) => a.type === "tick") || null;
  },
});
