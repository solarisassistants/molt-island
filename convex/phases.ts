export const PHASE_CONFIG = {
  shallows: {
    levelRange: [1, 10] as const,
    pvpEnabled: false,
    deathPenalty: 0.5,
    respawnDelay: 5000, // 5 seconds - instant action system
  },
  awakening: {
    levelRange: [11, 20] as const,
    pvpEnabled: true,
    deathPenalty: 0.75,
    respawnDelay: 5000, // 5 seconds - instant action system
  },
  volcano: {
    levelRange: [21, Infinity] as const,
    pvpEnabled: true,
    deathPenalty: 0.9,
    respawnDelay: 5000, // 5 seconds - instant action system
  },
} as const;

// HP regen per action type
export const HP_REGEN = {
  move: 3,
  rest: 10,
  shallowsBonus: 2,
  combatCooldown: 5000, // No regen if hit within 5 seconds
} as const;

// Spawn protection duration (reduced for fast-paced gameplay)
export const SPAWN_PROTECTION_MS = 10000; // 10 seconds

export type Zone = keyof typeof PHASE_CONFIG;

export const VALID_ZONES: Zone[] = ["shallows", "awakening", "volcano"];

export const ZONE_CONFIG = {
  shallows: { xpMultiplier: 1.0, scoreMultiplier: 1.0, pvpBountyPercent: 0 },
  awakening: { xpMultiplier: 1.5, scoreMultiplier: 1.5, pvpBountyPercent: 10 },
  volcano: { xpMultiplier: 2.0, scoreMultiplier: 2.0, pvpBountyPercent: 20 },
} as const;

export const WORLD_BOUNDS = {
  shallows: { minX: 0, maxX: 100, minY: 0, maxY: 100 },
  awakening: { minX: 0, maxX: 200, minY: 0, maxY: 200 },
  volcano: { minX: 0, maxX: 50, minY: 0, maxY: 50 },
};

export const COMBAT_RANGE = 5;

export const XP_TABLE = [
  0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700,
  3250, 3850, 4500, 5200, 5950, 6750, 7600, 8500, 9450, 10450,
  11500, 12600, 13750, 14950, 16200, 17500, 18850, 20250, 21700, 23200,
];

export function calculateLevel(xp: number): number {
  for (let level = XP_TABLE.length; level >= 1; level--) {
    if (xp >= XP_TABLE[level - 1]) return level;
  }
  return 1;
}
