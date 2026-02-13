import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { hashString, seededRandom, getBucketIndex } from "./utils";

// Internal mutation to create agent (deterministic, called from action)
export const createAgent = internalMutation({
  args: {
    name: v.string(),
    walletAddress: v.string(),
    entryFeeTxHash: v.string(),
    apiKeyPrefix: v.string(),
    apiKeyHash: v.string(),
    avatar: v.optional(v.string()),
    motto: v.optional(v.string()),
  },
  handler: async (ctx, { name, walletAddress, entryFeeTxHash, apiKeyPrefix, apiKeyHash, avatar, motto }) => {
    // Get active season
    const season = await ctx.db
      .query("seasons")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .first();
    if (!season) {
      return { success: false, error: "No active season" };
    }

    // Rate limit registrations: max 5 per minute globally
    const oneMinuteAgo = Date.now() - 60000;
    const recentAgents = await ctx.db
      .query("agents")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .filter((q) => q.gt(q.field("createdAt"), oneMinuteAgo))
      .collect();
    if (recentAgents.length >= 5) {
      return { success: false, error: "Too many registrations. Try again in a minute." };
    }

    const maxPlayers = season.config.maxPlayers;
    const existingAgents = await ctx.db
      .query("agents")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .take(maxPlayers + 1);
    if (existingAgents.length >= maxPlayers) {
      return { success: false, error: "Season is full" };
    }
    // Unlimited free tier - everyone can play, but only paid agents can win prizes
    const hasPaid = entryFeeTxHash && entryFeeTxHash.length > 0 && entryFeeTxHash !== "free";
    const prizeEligible = hasPaid;

    // CRITICAL: Check for duplicate name in this season (using index for O(1) lookup)
    const existingAgent = await ctx.db
      .query("agents")
      .withIndex("by_season_name", (q) => q.eq("seasonId", season._id).eq("name", name))
      .first();
    if (existingAgent) {
      return { success: false, error: "Agent name already taken" };
    }

    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .first();
    const secretSeed = gameState?.secretSeed ?? Math.floor(Math.random() * 0x7fffffff);

    // Deterministic spawn position based on server secret + API key prefix (unpredictable to user)
    const positionSeed = secretSeed + hashString(apiKeyPrefix) + hashString(name);
    const positionRng = seededRandom(positionSeed);
    const bounds = season.config.worldBounds.shallows;
    const newX = Math.floor(positionRng() * (bounds.maxX - bounds.minX)) + bounds.minX;
    const newY = Math.floor(positionRng() * (bounds.maxY - bounds.minY)) + bounds.minY;
    const bucketX = getBucketIndex(newX, bounds.minX);
    const bucketY = getBucketIndex(newY, bounds.minY);

    // Create agent - always alive (free tier unlimited), prizeEligible only if paid
    const agentId = await ctx.db.insert("agents", {
      seasonId: season._id,
      name,
      apiKeyPrefix,
      apiKeyHash,
      walletAddress,
      level: 1,
      xp: 0,
      hp: 100,
      maxHp: 100,
      positionX: newX,
      positionY: newY,
      bucketX,
      bucketY,
      zone: "shallows",
      inventory: [],
      score: 100,
      kills: 0,
      deaths: 0,
      bossKills: 0,
      status: hasPaid ? "pending_payment" : "alive", // Free agents start immediately
      lastActionTick: 0,
      lastActionAt: Date.now(),
      actionNonce: 0,
      cooldownUntil: 0,
      attackBuffUntil: 0,
      attackBuffMultiplier: 1,
      defenseBuffUntil: 0,
      defenseBuffMultiplier: 1,
      xpGainedThisHour: 0,
      xpHourReset: Date.now(),
      spawnProtectionUntil: Date.now() + 10000, // 10 second spawn protection
      lastKilledAgents: [],
      lastAfkDecayAt: Date.now(),
      createdAt: Date.now(),
      // Personality
      avatar: avatar || undefined,
      motto: motto || undefined,
      prizeEligible,
    });

    if (!hasPaid) {
      // Free tier - emit joined event directly
      const gameState = await ctx.db
        .query("gameState")
        .withIndex("by_season", (q) => q.eq("seasonId", season._id))
        .first();
      await ctx.db.insert("events", {
        seasonId: season._id,
        tick: gameState?.tick || 0,
        timestamp: Date.now(),
        type: "agent_joined",
        agentId,
        agentName: name,
        data: {
          positionX: newX,
          positionY: newY,
          message: `${name} joined the game!${prizeEligible ? "" : " (free tier)"}`,
        },
      });
    } else {
      // Paid tier - schedule payment verification
      await ctx.scheduler.runAfter(0, internal.payments.verifyEntryFee, {
        agentId,
        txHash: entryFeeTxHash,
      });
    }

    return { success: true, agentId, freeSlot: !hasPaid, prizeEligible };
  },
});

// Internal queries
export const get = internalQuery({
  args: { id: v.id("agents") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const getByApiKeyPrefix = internalQuery({
  args: { apiKeyPrefix: v.string() },
  handler: async (ctx, { apiKeyPrefix }) => {
    return ctx.db
      .query("agents")
      .withIndex("by_apiKeyPrefix", (q) => q.eq("apiKeyPrefix", apiKeyPrefix))
      .first();
  },
});

// Internal mutations
export const activate = internalMutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent) return;

    await ctx.db.patch(agentId, { status: "alive", spawnProtectionUntil: Date.now() + 10000 });

    // Get current tick for event
    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_season", (q) => q.eq("seasonId", agent.seasonId))
      .first();

    // Emit agent joined event
    await ctx.db.insert("events", {
      seasonId: agent.seasonId,
      tick: gameState?.tick || 0,
      timestamp: Date.now(),
      type: "agent_joined",
      agentId,
      agentName: agent.name,
      data: {
        positionX: agent.positionX,
        positionY: agent.positionY,
        message: `${agent.name} joined the game!`,
      },
    });
  },
});

export const failPayment = internalMutation({
  args: { agentId: v.id("agents"), error: v.string() },
  handler: async (ctx, { agentId, error }) => {
    const agent = await ctx.db.get(agentId);
    if (agent) {
      // Log failed payment attempt before deleting
      await ctx.db.insert("events", {
        seasonId: agent.seasonId,
        tick: 0,
        timestamp: Date.now(),
        type: "agent_died",
        agentId,
        agentName: agent.name,
        data: {
          message: `Registration failed: ${error}`,
        },
      });
    }
    await ctx.db.delete(agentId);
  },
});
