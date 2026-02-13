import { internalMutation } from "./_generated/server";
import { Zone } from "./phases";
import { getBucketIndex } from "./utils";

export const NPC_TYPES = {
  slime: {
    level: 1,
    hp: 20,
    damage: 5,
    xpReward: 10,
    behavior: "passive",
    aggroRange: 0,
    chaseTicks: 0,
    spawnZones: ["shallows"] as const,
    loot: [{ itemId: "health_potion", dropRate: 0.3 }],
  },
  goblin: {
    level: 3,
    hp: 40,
    damage: 10,
    xpReward: 25,
    behavior: "defensive",
    aggroRange: 0,
    chaseTicks: 5,
    spawnZones: ["shallows"] as const,
    loot: [{ itemId: "health_potion", dropRate: 0.2 }],
  },
  orc: {
    level: 5,
    hp: 80,
    damage: 15,
    xpReward: 50,
    behavior: "aggressive",
    aggroRange: 4,
    chaseTicks: 10,
    spawnZones: ["awakening"] as const,
    loot: [{ itemId: "attack_boost", dropRate: 0.1 }],
  },
  troll: {
    level: 8,
    hp: 150,
    damage: 25,
    xpReward: 100,
    behavior: "aggressive",
    aggroRange: 5,
    chaseTicks: 15,
    spawnZones: ["awakening", "volcano"] as const,
    loot: [{ itemId: "shield", dropRate: 0.1 }],
  },
  boss_dragon: {
    level: 10,
    hp: 500,
    damage: 50,
    xpReward: 500,
    behavior: "aggressive",
    aggroRange: 8,
    chaseTicks: 999,
    spawnZones: ["volcano"] as const,
    loot: [{ itemId: "rare_gem", dropRate: 1.0 }],
    isBoss: true,
  },
} as const;

export const respawn = internalMutation({
  handler: async (ctx) => {
    const season = await ctx.db
      .query("seasons")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .first();
    if (!season) return;

    // Cleanup expired ground items (5 minute TTL)
    const GROUND_ITEM_TTL = 5 * 60 * 1000; // 5 minutes
    const expiredItems = await ctx.db
      .query("groundItems")
      .withIndex("by_droppedAt", (q) => q.lt("droppedAt", Date.now() - GROUND_ITEM_TTL))
      .take(1000);
    for (const item of expiredItems) {
      await ctx.db.delete(item._id);
    }

    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .first();

    const seed = (gameState?.tick || 0) * 31337;
    let rngState = seed;
    const rng = () => {
      rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
      return rngState / 0x7fffffff;
    };

    const zones: Zone[] = ["shallows", "awakening", "volcano"];
    const targetCounts: Record<Zone, number> = { shallows: 50, awakening: 30, volcano: 10 };

    for (const zone of zones) {
      const npcs = await ctx.db
        .query("npcs")
        .withIndex("by_season_zone", (q) =>
          q.eq("seasonId", season._id).eq("zone", zone)
        )
        .collect();

      const deficit = targetCounts[zone] - npcs.length;
      const bounds = season.config.worldBounds[zone];

      for (let i = 0; i < deficit; i++) {
        const types = Object.entries(NPC_TYPES).filter(([, t]) =>
          t.spawnZones.includes(zone)
        );
        const typeIndex = Math.floor(rng() * types.length);
        const [typeKey, typeData] = types[typeIndex];

        const positionX = Math.floor(rng() * (bounds.maxX - bounds.minX)) + bounds.minX;
        const positionY = Math.floor(rng() * (bounds.maxY - bounds.minY)) + bounds.minY;
        const bucketX = getBucketIndex(positionX, bounds.minX);
        const bucketY = getBucketIndex(positionY, bounds.minY);

        await ctx.db.insert("npcs", {
          seasonId: season._id,
          type: typeKey,
          level: typeData.level,
          hp: typeData.hp,
          maxHp: typeData.hp,
          positionX,
          positionY,
          bucketX,
          bucketY,
          homeX: positionX,
          homeY: positionY,
          zone,
          lootTable: typeData.loot,
          targetAgentId: undefined,
          aggroTick: undefined,
          lastAttackAt: undefined,
        });
      }
    }
  },
});
