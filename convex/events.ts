import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

const EVENT_TYPES = [
  "agent_joined", "agent_killed", "agent_died", "agent_respawned",
  "level_up", "zone_transition", "boss_killed", "npc_killed",
  "bounty_paid", "prize_paid", "combat", "item_looted",
  "season_started", "season_ended", "agent_log",
  // Drama events for spectator experience
  "drama_rivalry", "drama_upset", "drama_streak", "drama_showdown", "drama_new_leader"
] as const;

type EventType = typeof EVENT_TYPES[number];

export const emit = internalMutation({
  args: {
    seasonId: v.id("seasons"),
    tick: v.number(),
    type: v.string(),
    agentId: v.optional(v.id("agents")),
    agentName: v.optional(v.string()),
    targetId: v.optional(v.id("agents")),
    targetName: v.optional(v.string()),
    data: v.object({
      damage: v.optional(v.number()),
      hit: v.optional(v.boolean()),
      oldLevel: v.optional(v.number()),
      newLevel: v.optional(v.number()),
      fromZone: v.optional(v.string()),
      toZone: v.optional(v.string()),
      positionX: v.optional(v.number()),
      positionY: v.optional(v.number()),
      amount: v.optional(v.number()),
      txHash: v.optional(v.string()),
      npcType: v.optional(v.string()),
      xpGained: v.optional(v.number()),
      itemId: v.optional(v.string()),
      message: v.optional(v.string()),
      stolenScore: v.optional(v.number()),
      winners: v.optional(v.array(v.object({
        place: v.number(),
        name: v.string(),
        score: v.number(),
        payout: v.number(),
      }))),
      logType: v.optional(v.string()),
      content: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("events", {
      ...args,
      type: args.type as EventType,
      timestamp: Date.now(),
    });
  },
});

// Create agent log event (for agent reasoning/strategy)
export const createAgentLog = internalMutation({
  args: {
    agentId: v.id("agents"),
    seasonId: v.id("seasons"),
    logType: v.string(),
    content: v.string(),
  },
  handler: async (ctx, { agentId, seasonId, logType, content }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent) throw new Error("Agent not found");

    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
      .first();

    await ctx.db.insert("events", {
      seasonId,
      tick: gameState?.tick || 0,
      timestamp: Date.now(),
      type: "agent_log",
      agentId,
      agentName: agent.name,
      data: {
        logType: logType as "strategy" | "decision" | "observation",
        content,
        message: `${agent.name}: ${content.slice(0, 100)}${content.length > 100 ? "..." : ""}`,
      },
    });

    return { success: true };
  },
});

// Detect drama events after kills (rivalry, upset, streak)
export const detectDrama = internalMutation({
  args: {
    killerId: v.id("agents"),
    targetId: v.id("agents"),
    seasonId: v.id("seasons"),
    killerPreKillScore: v.number(),
    killerNewScore: v.number(),
    targetPreKillRank: v.number(),
  },
  handler: async (ctx, { killerId, targetId, seasonId, killerPreKillScore, killerNewScore, targetPreKillRank }) => {
    const killer = await ctx.db.get(killerId);
    const target = await ctx.db.get(targetId);
    if (!killer || !target) return;

    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
      .first();
    const tick = gameState?.tick || 0;
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Upset: killed someone 5+ levels higher
    const levelDiff = target.level - killer.level;
    if (levelDiff >= 5) {
      await ctx.db.insert("events", {
        seasonId,
        tick,
        timestamp: now,
        type: "drama_upset",
        agentId: killerId,
        agentName: killer.name,
        targetId,
        targetName: target.name,
        data: {
          levelDiff,
          message: `💀 UPSET: ${killer.name} (lvl ${killer.level}) killed ${target.name} (lvl ${target.level})!`,
        },
      });
    }

    // Rivalry: killed same agent 3+ times in last hour
    // DEDUPLICATION: Only emit if no rivalry event for this pair in last hour
    const recentKills = await ctx.db
      .query("events")
      .withIndex("by_agent", (q) => q.eq("agentId", killerId))
      .filter((q) =>
        q.and(
          q.eq(q.field("type"), "agent_killed"),
          q.eq(q.field("targetId"), targetId),
          q.gt(q.field("timestamp"), oneHourAgo)
        )
      )
      .collect();

    if (recentKills.length >= 3) {
      // Check if we already emitted a rivalry event for this pair recently
      const existingRivalry = await ctx.db
        .query("events")
        .withIndex("by_agent", (q) => q.eq("agentId", killerId))
        .filter((q) =>
          q.and(
            q.eq(q.field("type"), "drama_rivalry"),
            q.eq(q.field("targetId"), targetId),
            q.gt(q.field("timestamp"), oneHourAgo)
          )
        )
        .first();

      if (!existingRivalry) {
        await ctx.db.insert("events", {
          seasonId,
          tick,
          timestamp: now,
          type: "drama_rivalry",
          agentId: killerId,
          agentName: killer.name,
          targetId,
          targetName: target.name,
          data: {
            killCount: recentKills.length,
            message: `🔥 RIVALRY: ${killer.name} has killed ${target.name} ${recentKills.length} times this hour!`,
          },
        });
      }
    }

    // Streak: every 5 kills (5, 10, 15, etc.)
    // DEDUPLICATION: Only emit at exact milestones
    if (killer.kills > 0 && killer.kills % 5 === 0) {
      // Check if we already emitted this streak milestone
      const existingStreak = await ctx.db
        .query("events")
        .withIndex("by_agent", (q) => q.eq("agentId", killerId))
        .filter((q) =>
          q.and(
            q.eq(q.field("type"), "drama_streak"),
            q.gt(q.field("timestamp"), oneHourAgo)
          )
        )
        .collect();

      // Only emit if we haven't emitted this exact streak count
      const alreadyEmitted = existingStreak.some((e) => e.data.streakCount === killer.kills);
      if (!alreadyEmitted) {
        await ctx.db.insert("events", {
          seasonId,
          tick,
          timestamp: now,
          type: "drama_streak",
          agentId: killerId,
          agentName: killer.name,
          data: {
            streakCount: killer.kills,
            message: `🎯 STREAK: ${killer.name} is on a ${killer.kills} kill streak!`,
          },
        });
      }
    }

    // New leader check using actual pre-kill scores
    const allAgents = await ctx.db
      .query("agents")
      .withIndex("by_season_status", (q) =>
        q.eq("seasonId", seasonId).eq("status", "alive")
      )
      .collect();

    // Check if killer is now #1 with their new score
    const isNowLeader = allAgents.every(
      (a) => a._id === killerId || a.score < killerNewScore
    );

    // Check if killer was NOT #1 before the kill
    const wasLeaderBefore = allAgents.every(
      (a) => a._id === killerId || a.score <= killerPreKillScore
    );

    if (isNowLeader && !wasLeaderBefore) {
      await ctx.db.insert("events", {
        seasonId,
        tick,
        timestamp: now,
        type: "drama_new_leader",
        agentId: killerId,
        agentName: killer.name,
        data: {
          amount: killerNewScore,
          message: `👑 NEW LEADER: ${killer.name} takes #1 with ${killerNewScore} score!`,
        },
      });
    }
  },
});

export const getRecent = query({
  args: {
    seasonId: v.optional(v.id("seasons")),
    limit: v.optional(v.number()),
    types: v.optional(v.array(v.string())),
    afterTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, { seasonId, limit = 50, types, afterTimestamp }) => {
    let targetSeasonId = seasonId;
    if (!targetSeasonId) {
      const activeSeason = await ctx.db
        .query("seasons")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .first();
      if (!activeSeason) return { events: [], seasonId: null };
      targetSeasonId = activeSeason._id;
    }

    let events = await ctx.db
      .query("events")
      .withIndex("by_season_timestamp", (q) => q.eq("seasonId", targetSeasonId))
      .order("desc")
      .take(limit * 2);

    if (afterTimestamp) {
      events = events.filter((e) => e.timestamp > afterTimestamp);
    }

    if (types && types.length > 0) {
      events = events.filter((e) => types.includes(e.type));
    }

    return {
      events: events.slice(0, limit).map((e) => ({
        id: e._id,
        tick: e.tick,
        timestamp: e.timestamp,
        type: e.type,
        agentId: e.agentId,
        agentName: e.agentName,
        targetId: e.targetId,
        targetName: e.targetName,
        data: e.data,
      })),
      seasonId: targetSeasonId,
    };
  },
});

export const getByAgent = query({
  args: {
    agentId: v.id("agents"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { agentId, limit = 100 }) => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .order("desc")
      .take(limit);

    return events.map((e) => ({
      id: e._id,
      tick: e.tick,
      timestamp: e.timestamp,
      type: e.type,
      targetId: e.targetId,
      targetName: e.targetName,
      data: e.data,
    }));
  },
});

export const getStats = query({
  args: { seasonId: v.optional(v.id("seasons")) },
  handler: async (ctx, { seasonId }) => {
    let targetSeasonId = seasonId;
    if (!targetSeasonId) {
      const activeSeason = await ctx.db
        .query("seasons")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .first();
      if (!activeSeason) return null;
      targetSeasonId = activeSeason._id;
    }

    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentEvents = await ctx.db
      .query("events")
      .withIndex("by_season_timestamp", (q) => q.eq("seasonId", targetSeasonId))
      .filter((q) => q.gt(q.field("timestamp"), oneHourAgo))
      .collect();

    return {
      totalEvents: recentEvents.length,
      kills: recentEvents.filter((e) => e.type === "agent_killed").length,
      deaths: recentEvents.filter((e) => e.type === "agent_died").length,
      levelUps: recentEvents.filter((e) => e.type === "level_up").length,
      zoneTransitions: recentEvents.filter((e) => e.type === "zone_transition").length,
      bossKills: recentEvents.filter((e) => e.type === "boss_killed").length,
      bountyPaid: recentEvents
        .filter((e) => e.type === "bounty_paid")
        .reduce((sum, e) => sum + (e.data.amount || 0), 0),
    };
  },
});

export const cleanup = internalMutation({
  handler: async (ctx) => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    const oldEvents = await ctx.db
      .query("events")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", oneDayAgo))
      .take(1000);

    for (const event of oldEvents) {
      await ctx.db.delete(event._id);
    }

    return { deleted: oldEvents.length };
  },
});
