import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { WORLD_BOUNDS } from "./phases";
import { internal } from "./_generated/api";

export const get = internalQuery({
  args: { id: v.id("seasons") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

export const getActive = query({
  handler: async (ctx) => {
    return ctx.db
      .query("seasons")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .first();
  },
});

// Internal version for server-side calls
export const getActiveInternal = internalQuery({
  handler: async (ctx) => {
    return ctx.db
      .query("seasons")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .first();
  },
});

export const addToPrizePool = internalMutation({
  args: { seasonId: v.id("seasons"), amount: v.number() },
  handler: async (ctx, { seasonId, amount }) => {
    const season = await ctx.db.get(seasonId);
    if (season) {
      await ctx.db.patch(seasonId, { prizePool: season.prizePool + amount });
    }
  },
});

// Create a new season (internal only - call via CLI: npx convex run seasons:createInternal)
export const create = internalMutation({
  args: {
    treasuryAddress: v.string(),
    entryFee: v.optional(v.number()),
    durationHours: v.optional(v.number()),
    maxPlayers: v.optional(v.number()),
  },
  handler: async (ctx, { treasuryAddress, entryFee = 1000000, durationHours = 168, maxPlayers = 1000 }) => {
    // End any currently active season
    const activeSeason = await ctx.db
      .query("seasons")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .first();

    if (activeSeason) {
      await ctx.db.patch(activeSeason._id, { status: "ended" });
    }

    // Get next season number
    const allSeasons = await ctx.db.query("seasons").collect();
    const nextNumber = allSeasons.length + 1;

    const now = Date.now();
    const seasonId = await ctx.db.insert("seasons", {
      number: nextNumber,
      status: "active",
      startTime: now,
      endTime: now + durationHours * 60 * 60 * 1000,
      prizePool: 0,
      entryFee,
      treasuryAddress,
      config: {
        maxPlayers,
        tickIntervalMs: 10000,
        worldBounds: WORLD_BOUNDS,
      },
    });

    // Initialize game state for this season
    const secretSeed = Math.floor(Math.random() * 0x7fffffff);
    await ctx.db.insert("gameState", {
      seasonId,
      tick: 0,
      phase: "shallows",
      rngSeed: now,
      secretSeed,
      lastTickAt: now,
    });

    // Emit season started event
    await ctx.db.insert("events", {
      seasonId,
      tick: 0,
      timestamp: now,
      type: "season_started",
      data: {
        message: `Season ${nextNumber} has begun!`,
      },
    });

    // Spawn initial NPCs immediately so the world isn't empty
    await ctx.scheduler.runAfter(0, internal.npcs.respawn, {});

    return { seasonId, number: nextNumber };
  },
});

// Set end time for active season (internal only - call via CLI)
export const setEndTime = internalMutation({
  args: { hoursFromNow: v.number() },
  handler: async (ctx, { hoursFromNow }) => {
    const season = await ctx.db
      .query("seasons")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .first();
    if (!season) throw new Error("No active season");
    const newEndTime = Date.now() + hoursFromNow * 60 * 60 * 1000;
    await ctx.db.patch(season._id, { endTime: newEndTime });
    return { seasonId: season._id, newEndTime, endsAt: new Date(newEndTime).toISOString() };
  },
});

export const getLastSeasonWinners = query({
  handler: async (ctx) => {
    // Get the most recently ended season
    const endedSeasons = await ctx.db
      .query("seasons")
      .withIndex("by_status", (q) => q.eq("status", "ended"))
      .collect();

    if (endedSeasons.length === 0) return null;

    // Find the one with the latest endTime
    const lastEnded = endedSeasons.reduce((a, b) => (a.endTime > b.endTime ? a : b));

    // Find the season_ended event for this season (has winners data)
    const events = await ctx.db
      .query("events")
      .withIndex("by_season_type", (q) =>
        q.eq("seasonId", lastEnded._id).eq("type", "season_ended")
      )
      .collect();

    const endedEvent = events.find(
      (e) => (e.data as any).winners && (e.data as any).winners.length > 0
    );

    if (!endedEvent) return null;

    return {
      seasonNumber: lastEnded.number,
      winners: (endedEvent.data as any).winners as Array<{
        place: number;
        name: string;
        score: number;
        payout: number;
      }>,
      endedAt: endedEvent.timestamp,
    };
  },
});

// End a season manually (internal only - call via CLI: npx convex run seasons:end)
export const end = internalMutation({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, { seasonId }) => {
    const season = await ctx.db.get(seasonId);
    if (!season) throw new Error("Season not found");
    if (season.status !== "active") throw new Error("Season is not active");

    await ctx.db.patch(seasonId, { status: "ended", endTime: Date.now() });

    // Get current tick
    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
      .first();

    await ctx.db.insert("events", {
      seasonId,
      tick: gameState?.tick || 0,
      timestamp: Date.now(),
      type: "season_ended",
      data: {
        message: `Season ${season.number} has ended!`,
        amount: season.prizePool,
      },
    });

    return { success: true };
  },
});
