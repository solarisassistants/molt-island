import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Seasons
  seasons: defineTable({
    number: v.number(),
    status: v.union(v.literal("pending"), v.literal("active"), v.literal("ended")),
    startTime: v.number(),
    endTime: v.number(),
    prizePool: v.number(),
    entryFee: v.number(),
    treasuryAddress: v.string(),
    config: v.object({
      maxPlayers: v.number(),
      tickIntervalMs: v.number(),
      worldBounds: v.object({
        shallows: v.object({ minX: v.number(), maxX: v.number(), minY: v.number(), maxY: v.number() }),
        awakening: v.object({ minX: v.number(), maxX: v.number(), minY: v.number(), maxY: v.number() }),
        volcano: v.object({ minX: v.number(), maxX: v.number(), minY: v.number(), maxY: v.number() }),
      }),
    }),
  }).index("by_status", ["status"]),

  // Agents (flattened position for indexing)
  agents: defineTable({
    seasonId: v.id("seasons"),
    name: v.string(),
    apiKeyPrefix: v.string(),
    apiKeyHash: v.string(),
    walletAddress: v.string(),
    privyWalletId: v.optional(v.string()),
    level: v.number(),
    xp: v.number(),
    hp: v.number(),
    maxHp: v.number(),
    positionX: v.number(),
    positionY: v.number(),
    bucketX: v.number(),
    bucketY: v.number(),
    zone: v.union(v.literal("shallows"), v.literal("awakening"), v.literal("volcano")),
    inventory: v.array(v.object({
      itemId: v.string(),
      quantity: v.number(),
    })),
    score: v.number(),
    kills: v.number(),
    deaths: v.number(),
    bossKills: v.number(),
    status: v.union(v.literal("pending_payment"), v.literal("alive"), v.literal("dead"), v.literal("spectating")),
    lastActionTick: v.number(),
    lastActionAt: v.optional(v.number()),
    actionNonce: v.optional(v.number()),
    lastTickProcessed: v.optional(v.number()), // For tick idempotency without action records
    cooldownUntil: v.number(),
    respawnAt: v.optional(v.number()),
    attackBuffUntil: v.optional(v.number()),
    attackBuffMultiplier: v.optional(v.number()),
    defenseBuffUntil: v.optional(v.number()),
    defenseBuffMultiplier: v.optional(v.number()),
    xpGainedThisHour: v.optional(v.number()),
    xpHourReset: v.optional(v.number()),
    spawnProtectionUntil: v.optional(v.number()),
    lastKilledAgents: v.optional(v.array(v.object({
      agentId: v.id("agents"),
      killedAt: v.number(),
    }))),
    lastAfkDecayAt: v.optional(v.number()),
    createdAt: v.number(),
    // Personality
    avatar: v.optional(v.string()),
    motto: v.optional(v.string()),
    prizeEligible: v.boolean(),
    // Combat tracking for HP regen
    lastHitAt: v.optional(v.number()),
    // Separate rate limit for /api/log
    lastLogAt: v.optional(v.number()),
  })
    .index("by_season_status", ["seasonId", "status"])
    .index("by_season_zone", ["seasonId", "zone"])
    .index("by_season_name", ["seasonId", "name"])
    .index("by_season", ["seasonId"])
    .index("by_season_status_zone_bucket", ["seasonId", "status", "zone", "bucketX", "bucketY"])
    .index("by_apiKeyPrefix", ["apiKeyPrefix"]),

  // Game State (singleton per season)
  gameState: defineTable({
    seasonId: v.id("seasons"),
    tick: v.number(),
    phase: v.union(v.literal("shallows"), v.literal("awakening"), v.literal("volcano")),
    rngSeed: v.number(),
    secretSeed: v.optional(v.number()),
    lastTickAt: v.number(),
  }).index("by_season", ["seasonId"]),

  // Actions Log
  actions: defineTable({
    seasonId: v.id("seasons"),
    agentId: v.id("agents"),
    tick: v.number(),
    type: v.string(),
    payload: v.any(),
    result: v.object({
      success: v.boolean(),
      outcome: v.any(),
      error: v.optional(v.string()),
    }),
    timestamp: v.number(),
  })
    .index("by_agent_tick", ["agentId", "tick"])
    .index("by_season_tick", ["seasonId", "tick"]),

  // Transactions (with idempotency)
  transactions: defineTable({
    seasonId: v.id("seasons"),
    agentId: v.id("agents"),
    type: v.union(v.literal("entry_fee"), v.literal("bounty"), v.literal("prize"), v.literal("prize_payout")),
    amount: v.number(),
    idempotencyKey: v.string(),
    privyTxId: v.optional(v.string()),
    txHash: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("failed")),
    createdAt: v.number(),
    confirmedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  })
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_agent", ["agentId"])
    .index("by_status", ["status"]),

  // Rate Limiting
  rateLimits: defineTable({
    agentId: v.id("agents"),
    windowStart: v.number(),
    requestCount: v.number(),
  }).index("by_agent_window", ["agentId", "windowStart"]),

  // NPCs (flattened position for indexing)
  npcs: defineTable({
    seasonId: v.id("seasons"),
    type: v.string(),
    level: v.number(),
    hp: v.number(),
    maxHp: v.number(),
    positionX: v.number(),
    positionY: v.number(),
    bucketX: v.optional(v.number()),
    bucketY: v.optional(v.number()),
    homeX: v.optional(v.number()),
    homeY: v.optional(v.number()),
    zone: v.union(v.literal("shallows"), v.literal("awakening"), v.literal("volcano")),
    lootTable: v.array(v.object({ itemId: v.string(), dropRate: v.number() })),
    targetAgentId: v.optional(v.id("agents")),
    aggroTick: v.optional(v.number()),
    lastAttackAt: v.optional(v.number()),
  })
    .index("by_season_zone", ["seasonId", "zone"])
    .index("by_season_zone_bucket", ["seasonId", "zone", "bucketX", "bucketY"]),

  // Ground Items (dropped loot, expires after 5 minutes)
  groundItems: defineTable({
    seasonId: v.id("seasons"),
    itemId: v.string(),
    positionX: v.number(),
    positionY: v.number(),
    bucketX: v.number(),
    bucketY: v.number(),
    zone: v.union(v.literal("shallows"), v.literal("awakening"), v.literal("volcano")),
    droppedAt: v.number(),
  })
    .index("by_season_zone", ["seasonId", "zone"])
    .index("by_season_zone_bucket", ["seasonId", "zone", "bucketX", "bucketY"])
    .index("by_droppedAt", ["droppedAt"]),

  // Events (for full observability on dashboard)
  events: defineTable({
    seasonId: v.id("seasons"),
    tick: v.number(),
    timestamp: v.number(),
    type: v.union(
      v.literal("agent_joined"),
      v.literal("agent_killed"),
      v.literal("agent_died"),
      v.literal("agent_respawned"),
      v.literal("level_up"),
      v.literal("zone_transition"),
      v.literal("boss_killed"),
      v.literal("npc_killed"),
      v.literal("bounty_paid"),
      v.literal("prize_paid"),
      v.literal("combat"),
      v.literal("item_looted"),
      v.literal("season_started"),
      v.literal("season_ended"),
      v.literal("agent_log"),
      // Drama events for spectator experience
      v.literal("drama_rivalry"),
      v.literal("drama_upset"),
      v.literal("drama_streak"),
      v.literal("drama_showdown"),
      v.literal("drama_new_leader")
    ),
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
      winners: v.optional(v.array(v.object({
        place: v.number(),
        name: v.string(),
        score: v.number(),
        payout: v.number(),
      }))),
      stolenScore: v.optional(v.number()),
      logType: v.optional(v.union(v.literal("strategy"), v.literal("decision"), v.literal("observation"))),
      content: v.optional(v.string()),
      // Personality for kill events
      killerAvatar: v.optional(v.string()),
      targetAvatar: v.optional(v.string()),
      killerMotto: v.optional(v.string()),
      // Drama event data
      killCount: v.optional(v.number()),
      streakCount: v.optional(v.number()),
      levelDiff: v.optional(v.number()),
      bountyAmount: v.optional(v.number()),
    }),
  })
    .index("by_season_tick", ["seasonId", "tick"])
    .index("by_season_timestamp", ["seasonId", "timestamp"])
    .index("by_season_type", ["seasonId", "type"])
    .index("by_agent", ["agentId"])
    .index("by_timestamp", ["timestamp"]),
});
