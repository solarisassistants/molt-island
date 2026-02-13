import { query, mutation, internalMutation, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { PHASE_CONFIG, ZONE_CONFIG, calculateLevel, VALID_ZONES, Zone, HP_REGEN, SPAWN_PROTECTION_MS } from "./phases";
import { hashString, seededRandom, getBucketIndex, POSITION_BUCKET_SIZE } from "./utils";
import { NPC_TYPES } from "./npcs";
import { ITEMS, ItemId } from "./items";

const MAX_INVENTORY_SLOTS = 6;
const DEFAULT_MAX_STACK = 5;
const XP_SOFT_CAP = 2000;
const XP_SOFT_CAP_WINDOW_MS = 60 * 60 * 1000;
const AFK_THRESHOLD_MS = 10 * 60 * 1000;
const AFK_DECAY_INTERVAL_MS = 60 * 1000;
// SPAWN_PROTECTION_MS imported from phases.ts
const KILL_COOLDOWN_MS = 30 * 1000;
const NPC_ATTACK_RANGE = 2;
const NPC_MOVE_EVERY_TICKS = 3;
const NPC_ATTACK_COOLDOWN_MS = 2000;

function applyXpWithSoftCap(params: {
  agent: {
    xp: number;
    level: number;
    xpGainedThisHour?: number;
    xpHourReset?: number;
  };
  baseXp: number;
  zone: Zone;
  now: number;
  avgLevel?: number; // For underdog bonus calculation
}) {
  const { agent, baseXp, zone, now, avgLevel } = params;
  const multiplier = ZONE_CONFIG[zone].xpMultiplier;

  // Underdog bonus: 2x XP when 3+ levels below average, 1.5x when below average
  let underdogMultiplier = 1.0;
  if (avgLevel !== undefined) {
    if (agent.level <= avgLevel - 3) {
      underdogMultiplier = 2.0; // 2x XP when 3+ levels below average
    } else if (agent.level < avgLevel) {
      underdogMultiplier = 1.5; // 1.5x XP when below average
    }
  }

  let adjustedXp = Math.floor(baseXp * multiplier * underdogMultiplier);

  let xpThisHour = agent.xpGainedThisHour ?? 0;
  let xpHourReset = agent.xpHourReset ?? 0;
  if (now - xpHourReset > XP_SOFT_CAP_WINDOW_MS) {
    xpThisHour = 0;
    xpHourReset = now;
  }

  if (xpThisHour >= XP_SOFT_CAP) {
    adjustedXp = Math.floor(adjustedXp * 0.5);
  }

  const newXp = agent.xp + adjustedXp;
  return { adjustedXp, newXp, xpThisHour: xpThisHour + adjustedXp, xpHourReset, underdogMultiplier };
}

// ===== QUERIES =====

export const getWorldState = query({
  args: {
    seasonId: v.id("seasons"),
    zone: v.optional(v.string()),
    limit: v.number(),
    viewerPosition: v.object({ x: v.number(), y: v.number() }),
  },
  handler: async (ctx, { seasonId, zone, limit, viewerPosition }) => {
    const validatedZone: Zone | undefined = zone && VALID_ZONES.includes(zone as Zone)
      ? (zone as Zone)
      : undefined;

    const season = await ctx.db.get(seasonId);
    if (!season) return { agents: [], npcs: [] };

    const zones = validatedZone ? [validatedZone] : VALID_ZONES;
    const limitPerZone = Math.ceil(limit / zones.length);

    const collectAgentsNear = async (targetZone: Zone, center: { x: number; y: number }) => {
      const bounds = season.config.worldBounds[targetZone];
      const centerBucketX = getBucketIndex(center.x, bounds.minX);
      const centerBucketY = getBucketIndex(center.y, bounds.minY);
      const visited = new Set<string>();
      const collected: any[] = [];
      const maxRadius = 3;

      for (let radius = 0; radius <= maxRadius && collected.length < limitPerZone; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dy = -radius; dy <= radius; dy++) {
            const bucketX = centerBucketX + dx;
            const bucketY = centerBucketY + dy;
            const key = `${bucketX}:${bucketY}`;
            if (visited.has(key)) continue;
            visited.add(key);

            const bucketAgents = await ctx.db
              .query("agents")
              .withIndex("by_season_status_zone_bucket", (q) =>
                q
                  .eq("seasonId", seasonId)
                  .eq("status", "alive")
                  .eq("zone", targetZone)
                  .eq("bucketX", bucketX)
                  .eq("bucketY", bucketY)
              )
              .collect();

            collected.push(...bucketAgents);
            if (collected.length >= limitPerZone) break;
          }
          if (collected.length >= limitPerZone) break;
        }
      }

      collected.sort((a, b) => {
        const distA = Math.sqrt(
          Math.pow(a.positionX - center.x, 2) +
          Math.pow(a.positionY - center.y, 2)
        );
        const distB = Math.sqrt(
          Math.pow(b.positionX - center.x, 2) +
          Math.pow(b.positionY - center.y, 2)
        );
        return distA - distB;
      });

      return collected.slice(0, limitPerZone);
    };

    const allAgents: any[] = [];
    const clamp = (value: number, minValue: number, maxValue: number) =>
      Math.min(maxValue, Math.max(minValue, value));

    for (const targetZone of zones) {
      const bounds = season.config.worldBounds[targetZone];
      const center = validatedZone
        ? viewerPosition
        : {
            x: clamp(viewerPosition.x, bounds.minX, bounds.maxX),
            y: clamp(viewerPosition.y, bounds.minY, bounds.maxY),
          };
      const zoneAgents = await collectAgentsNear(targetZone, center);
      allAgents.push(...zoneAgents);
    }

    // Global sort by distance from viewer (not just per-zone)
    allAgents.sort((a, b) => {
      const distA = Math.sqrt(
        Math.pow(a.positionX - viewerPosition.x, 2) +
        Math.pow(a.positionY - viewerPosition.y, 2)
      );
      const distB = Math.sqrt(
        Math.pow(b.positionX - viewerPosition.x, 2) +
        Math.pow(b.positionY - viewerPosition.y, 2)
      );
      return distA - distB;
    });

    const result = allAgents.slice(0, limit).map((a) => ({
      id: a._id,
      name: a.name,
      level: a.level,
      hp: a.hp,
      maxHp: a.maxHp,
      position: { x: a.positionX, y: a.positionY },
      zone: a.zone,
      status: a.status,
    }));

    const npcResults: any[] = [];
    for (const targetZone of zones) {
      const bounds = season.config.worldBounds[targetZone];
      const center = validatedZone
        ? viewerPosition
        : {
            x: clamp(viewerPosition.x, bounds.minX, bounds.maxX),
            y: clamp(viewerPosition.y, bounds.minY, bounds.maxY),
          };
      const centerBucketX = getBucketIndex(center.x, bounds.minX);
      const centerBucketY = getBucketIndex(center.y, bounds.minY);
      const visited = new Set<string>();
      const maxRadius = 3;

      for (let radius = 0; radius <= maxRadius && npcResults.length < 50; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dy = -radius; dy <= radius; dy++) {
            const bucketX = centerBucketX + dx;
            const bucketY = centerBucketY + dy;
            const key = `${targetZone}:${bucketX}:${bucketY}`;
            if (visited.has(key)) continue;
            visited.add(key);

            const bucketNpcs = await ctx.db
              .query("npcs")
              .withIndex("by_season_zone_bucket", (q) =>
                q.eq("seasonId", seasonId).eq("zone", targetZone).eq("bucketX", bucketX).eq("bucketY", bucketY)
              )
              .collect();
            npcResults.push(...bucketNpcs);
            if (npcResults.length >= 50) break;
          }
          if (npcResults.length >= 50) break;
        }
      }
    }

    const npcResult = npcResults.slice(0, 50).map((n) => ({
      id: n._id,
      type: n.type,
      level: n.level,
      hp: n.hp,
      maxHp: n.maxHp,
      position: { x: n.positionX, y: n.positionY },
      zone: n.zone,
    }));

    return { agents: result, npcs: npcResult };
  },
});

export const getLeaderboard = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 50 }) => {
    const season = await ctx.db
      .query("seasons")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .first();

    if (!season) return { leaderboard: [], season: null };

    const agents = await ctx.db
      .query("agents")
      .withIndex("by_season_status", (q) => q.eq("seasonId", season._id))
      .collect();

    const scored = agents
      .filter((a) => a.status !== "pending_payment")
      .map((a) => ({
        id: a._id,
        name: a.name,
        level: a.level,
        kills: a.kills,
        deaths: a.deaths,
        score: a.score,
        status: a.status,
        zone: a.zone,
        avatar: a.avatar,
        prizeEligible: a.prizeEligible,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return {
      leaderboard: scored,
      season: {
        number: season.number,
        prizePool: season.prizePool,
        endsAt: season.endTime,
      },
    };
  },
});

// ===== MUTATIONS =====

export const submitAction = internalMutation({
  args: {
    agentId: v.id("agents"),
    action: v.object({
      type: v.union(
        v.literal("move"),
        v.literal("attack"),
        v.literal("attack_npc"),
        v.literal("rest"),
        v.literal("loot"),
        v.literal("flee"),
        v.literal("use_item")
      ),
      payload: v.optional(v.any()),
    }),
  },
  handler: async (ctx, { agentId, action }) => {
    let agent = await ctx.db.get(agentId);
    if (!agent) throw new Error("Agent not found");

    // Reject oversized payloads
    const payloadStr = JSON.stringify(action.payload || {});
    if (payloadStr.length > 500) {
      throw new Error("Payload too large");
    }

    const now = Date.now();

    // Check if dead agent can respawn (5 second delay)
    if (agent.status === "dead") {
      if (!agent.respawnAt || now < agent.respawnAt) {
        const waitTime = agent.respawnAt ? Math.ceil((agent.respawnAt - now) / 1000) : 5;
        throw new Error(`RESPAWNING: ${waitTime}s remaining`);
      }
      // Auto-respawn on first action after timer expires
      const season = await ctx.db.get(agent.seasonId);
      if (!season) throw new Error("Season not found");
      // Respawn in same zone (not shallows) - matches SKILL.md
      const respawnZone = agent.zone;
      const bounds = season.config.worldBounds[respawnZone];
      const respawnSeed = hashString(agentId) + now + agent.deaths;
      const respawnRng = seededRandom(respawnSeed);
      const newX = Math.floor(respawnRng() * (bounds.maxX - bounds.minX)) + bounds.minX;
      const newY = Math.floor(respawnRng() * (bounds.maxY - bounds.minY)) + bounds.minY;
      const bucketX = getBucketIndex(newX, bounds.minX);
      const bucketY = getBucketIndex(newY, bounds.minY);

      await ctx.db.patch(agentId, {
        status: "alive",
        hp: agent.maxHp,
        zone: respawnZone,
        positionX: newX,
        positionY: newY,
        bucketX,
        bucketY,
        respawnAt: undefined,
        inventory: [],
        spawnProtectionUntil: now + SPAWN_PROTECTION_MS,
      });

      // Re-fetch agent after respawn
      agent = (await ctx.db.get(agentId))!;

      // Emit respawn event
      const gameState = await ctx.db
        .query("gameState")
        .withIndex("by_season", (q) => q.eq("seasonId", agent.seasonId))
        .first();
      await ctx.db.insert("events", {
        seasonId: agent.seasonId,
        tick: gameState?.tick || 0,
        timestamp: now,
        type: "agent_respawned",
        agentId,
        agentName: agent.name,
        data: {
          positionX: newX,
          positionY: newY,
          message: `${agent.name} respawned!`,
        },
      });
    }

    // Re-check status and cooldown in mutation (prevents race conditions)
    if (agent.status !== "alive") throw new Error("NOT_ALIVE");

    // Per-action HP regen (instant action system)
    if (agent.hp < agent.maxHp) {
      let hpGain = 0;

      // Base regen per action type
      if (action.type === "rest") {
        hpGain = HP_REGEN.rest; // +10 HP for rest
      } else if (action.type === "move") {
        hpGain = HP_REGEN.move; // +3 HP for move
      }

      // Bonus in safe zone (SHALLOWS)
      if (agent.zone === "shallows") {
        hpGain += HP_REGEN.shallowsBonus; // Extra +2 HP
      }

      // No regen if in active combat (hit in last 5 seconds)
      const inCombat = agent.lastHitAt && (now - agent.lastHitAt) < HP_REGEN.combatCooldown;
      if (inCombat && action.type !== "rest") {
        hpGain = 0; // Rest always heals even in combat
      }

      if (hpGain > 0) {
        const newHp = Math.min(agent.hp + hpGain, agent.maxHp);
        await ctx.db.patch(agentId, { hp: newHp });
        agent = { ...agent, hp: newHp }; // Update local reference
      }
    }

    const season = await ctx.db.get(agent.seasonId);
    if (!season) throw new Error("Season not found");
    if (season.status !== "active" || now > season.endTime) {
      throw new Error("SEASON_ENDED: Season is no longer active");
    }

    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_season", (q) => q.eq("seasonId", agent.seasonId))
      .first();

    const tick = gameState?.tick || 0;
    const bounds = season.config.worldBounds[agent.zone];

    let secretSeed = gameState?.secretSeed;
    if (secretSeed === undefined) {
      secretSeed = Math.floor(Math.random() * 0x7fffffff);
      if (gameState) {
        await ctx.db.patch(gameState._id, { secretSeed });
      }
    }

    const nextActionNonce = (agent.actionNonce ?? 0) + 1;
    const baseSeed = secretSeed + hashString(agentId) + nextActionNonce;
    const actionRng = seededRandom(baseSeed + hashString(action.type));

    let result: Record<string, unknown> = {};
    let currentXp = agent.xp; // Track XP changes for level calculation
    let currentScore = agent.score;

    switch (action.type) {
      case "move": {
        const payload = action.payload as { direction: "n" | "s" | "e" | "w" } | undefined;
        const direction = payload?.direction;
        if (!direction || !["n", "s", "e", "w"].includes(direction)) {
          throw new Error("INVALID_DIRECTION");
        }

        let newX = agent.positionX;
        let newY = agent.positionY;

        if (direction === "n") newY -= 1;
        else if (direction === "s") newY += 1;
        else if (direction === "e") newX += 1;
        else if (direction === "w") newX -= 1;

        // Ensure integer bounds comparison (defensive against float edge cases)
        const minX = Math.floor(bounds.minX);
        const maxX = Math.floor(bounds.maxX);
        const minY = Math.floor(bounds.minY);
        const maxY = Math.floor(bounds.maxY);

        if (newX < minX || newX > maxX || newY < minY || newY > maxY) {
          throw new Error("OUT_OF_BOUNDS");
        }

        const bucketX = getBucketIndex(newX, bounds.minX);
        const bucketY = getBucketIndex(newY, bounds.minY);
        await ctx.db.patch(agentId, {
          positionX: Math.floor(newX),
          positionY: Math.floor(newY),
          bucketX,
          bucketY,
        });
        result = { newPosition: { x: newX, y: newY } };
        break;
      }

      case "attack": {
        const payload = action.payload as { targetId: string } | undefined;
        const targetIdStr = payload?.targetId;
        if (!targetIdStr) throw new Error("INVALID_TARGET");

        // CRITICAL: Prevent self-attack
        if (targetIdStr === agentId) throw new Error("CANNOT_ATTACK_SELF");

        const targetIdTyped = targetIdStr as Id<"agents">;
        const target = await ctx.db.get(targetIdTyped);
        if (!target) throw new Error("INVALID_TARGET");
        if (target.status !== "alive") throw new Error("INVALID_TARGET");
        if (target.zone !== agent.zone) throw new Error("INVALID_TARGET");

        const now = Date.now();
        if (target.spawnProtectionUntil && target.spawnProtectionUntil > now) {
          throw new Error("TARGET_SPAWN_PROTECTED");
        }

        const recentKill = (agent.lastKilledAgents || []).find(
          (k) => k.agentId === targetIdTyped && now - k.killedAt < KILL_COOLDOWN_MS
        );
        if (recentKill) {
          throw new Error("KILL_COOLDOWN_ACTIVE");
        }

        const phaseConfig = PHASE_CONFIG[agent.zone];
        if (!phaseConfig.pvpEnabled) throw new Error("PVP_DISABLED");

        const distance = Math.sqrt(
          Math.pow(agent.positionX - target.positionX, 2) +
          Math.pow(agent.positionY - target.positionY, 2)
        );
        if (distance > 5) throw new Error("INVALID_TARGET");

        const combatSeed = baseSeed + hashString(targetIdTyped) + 101;
        const combatRng = seededRandom(combatSeed);

        const hitChance = 0.7 + (agent.level - target.level) * 0.05;
        const hit = combatRng() < Math.min(0.95, Math.max(0.3, hitChance));

        let npcAlive = true;

        if (!hit) {
          result = { hit: false, damage: 0 };
          await ctx.db.insert("events", {
            seasonId: agent.seasonId,
            tick,
            timestamp: Date.now(),
            type: "combat",
            agentId,
            agentName: agent.name,
            targetId: targetIdTyped,
            targetName: target.name,
            data: {
              damage: 0,
              hit: false,
              positionX: agent.positionX,
              positionY: agent.positionY,
              message: `${agent.name} missed ${target.name}`,
            },
          });
        } else {
          const attackMultiplier =
            agent.attackBuffUntil && agent.attackBuffUntil > now
              ? (agent.attackBuffMultiplier ?? 1)
              : 1;
          const defenseMultiplier =
            target.defenseBuffUntil && target.defenseBuffUntil > now
              ? (target.defenseBuffMultiplier ?? 1)
              : 1;

          const baseDamage = 10;
          const levelRatio = agent.level / Math.max(1, target.level);
          const variance = 0.8 + combatRng() * 0.4;
          let damage = Math.floor(baseDamage * levelRatio * variance);
          damage = Math.max(1, Math.floor(damage * attackMultiplier * defenseMultiplier));
          const newHp = Math.max(0, target.hp - damage);

          await ctx.db.patch(targetIdTyped, { hp: newHp, lastHitAt: now });

          await ctx.db.insert("events", {
            seasonId: agent.seasonId,
            tick,
            timestamp: Date.now(),
            type: "combat",
            agentId,
            agentName: agent.name,
            targetId: targetIdTyped,
            targetName: target.name,
            data: {
              damage,
              hit: true,
              positionX: agent.positionX,
              positionY: agent.positionY,
              message: `${agent.name} hit ${target.name} for ${damage} damage`,
            },
          });

          if (newHp === 0) {
            const targetPhaseConfig = PHASE_CONFIG[target.zone];
            const xpPenalty = Math.floor(target.xp * targetPhaseConfig.deathPenalty);
            const respawnAt = Date.now() + targetPhaseConfig.respawnDelay;

            const scoreMultiplier = ZONE_CONFIG[agent.zone].scoreMultiplier;
            const bountyPercent = ZONE_CONFIG[agent.zone].pvpBountyPercent;
            const stolenScore = Math.floor((target.score || 0) * (bountyPercent / 100));
            const killScore = Math.floor(100 * scoreMultiplier);
            const newVictimScore = Math.max(0, (target.score || 0) - stolenScore);

            // IMPORTANT: Calculate leader bounty BEFORE marking target as dead
            // Use pre-kill scores for accurate ranking
            const allAgentsForRanking = await ctx.db
              .query("agents")
              .withIndex("by_season_status", (q) =>
                q.eq("seasonId", agent.seasonId).eq("status", "alive")
              )
              .collect();

            // Sort by score to find target's PRE-KILL rank
            const preKillLeaderboard = allAgentsForRanking.sort((a, b) => b.score - a.score);
            const targetPreKillRank = preKillLeaderboard.findIndex((a) => a._id === targetIdTyped) + 1;

            // Leader bounties: bonus score for killing top 3 (based on PRE-KILL rank)
            let bountyBonus = 0;
            if (targetPreKillRank === 1) bountyBonus = 500;      // Kill #1 = 500 bonus score
            else if (targetPreKillRank === 2) bountyBonus = 300; // Kill #2 = 300 bonus score
            else if (targetPreKillRank === 3) bountyBonus = 150; // Kill #3 = 150 bonus score

            // Calculate average level for underdog bonus (exclude target who is about to die)
            const aliveAfterKill = allAgentsForRanking.filter((a) => a._id !== targetIdTyped);
            const avgLevel = aliveAfterKill.length > 0
              ? aliveAfterKill.reduce((sum, a) => sum + a.level, 0) / aliveAfterKill.length
              : agent.level;

            // Now mark target as dead
            await ctx.db.patch(targetIdTyped, {
              status: "dead",
              deaths: target.deaths + 1,
              xp: Math.max(0, target.xp - xpPenalty),
              respawnAt,
              inventory: [],
              score: newVictimScore,
              attackBuffUntil: 0,
              attackBuffMultiplier: 1,
              defenseBuffUntil: 0,
              defenseBuffMultiplier: 1,
            });

            const xpResult = applyXpWithSoftCap({
              agent,
              baseXp: 50,
              zone: agent.zone,
              now,
              avgLevel,
            });
            currentXp = xpResult.newXp;

            const recentKills = (agent.lastKilledAgents || [])
              .filter((k) => now - k.killedAt < KILL_COOLDOWN_MS && k.agentId !== targetIdTyped)
              .slice(-9);
            recentKills.push({ agentId: targetIdTyped, killedAt: now });

            currentScore = currentScore + killScore + stolenScore + bountyBonus;
            await ctx.db.patch(agentId, {
              kills: agent.kills + 1,
              xp: currentXp,
              xpGainedThisHour: xpResult.xpThisHour,
              xpHourReset: xpResult.xpHourReset,
              score: currentScore,
              lastKilledAgents: recentKills,
            });

            // Kill event with personality
            const killMessage = agent.motto
              ? `${agent.name} eliminates ${target.name}: "${agent.motto}"`
              : `${agent.name} killed ${target.name}!`;

            await ctx.db.insert("events", {
              seasonId: agent.seasonId,
              tick,
              timestamp: Date.now(),
              type: "agent_killed",
              agentId,
              agentName: agent.name,
              targetId: targetIdTyped,
              targetName: target.name,
              data: {
                damage,
                xpGained: xpResult.adjustedXp,
                stolenScore,
                bountyAmount: bountyBonus,
                positionX: target.positionX,
                positionY: target.positionY,
                message: killMessage,
                killerAvatar: agent.avatar,
                targetAvatar: target.avatar,
                killerMotto: agent.motto,
              },
            });

            // Trigger drama detection with pre-kill context
            await ctx.scheduler.runAfter(0, internal.events.detectDrama, {
              killerId: agentId,
              targetId: targetIdTyped,
              seasonId: agent.seasonId,
              killerPreKillScore: agent.score, // Pass pre-kill score for accurate new leader detection
              killerNewScore: currentScore,
              targetPreKillRank,
            });

            await ctx.db.insert("events", {
              seasonId: agent.seasonId,
              tick,
              timestamp: Date.now(),
              type: "agent_died",
              agentId: targetIdTyped,
              agentName: target.name,
              targetId: agentId,
              targetName: agent.name,
              data: {
                positionX: target.positionX,
                positionY: target.positionY,
                message: `${target.name} was killed by ${agent.name}`,
              },
            });

            await ctx.scheduler.runAfter(0, internal.payments.payBounty, {
              killerId: agentId,
              victimId: targetIdTyped,
              tick,
            });

            result = { hit: true, damage, kill: true, xpGained: xpResult.adjustedXp, stolenScore };
          } else {
            result = { hit: true, damage, kill: false };
          }
        }
        break;
      }

      case "attack_npc": {
        const payload = action.payload as { targetId: string } | undefined;
        const npcIdStr = payload?.targetId;
        if (!npcIdStr) throw new Error("INVALID_TARGET");

        const npcId = npcIdStr as Id<"npcs">;
        const npc = await ctx.db.get(npcId);

        // Validate: exists, same zone, within 5 tiles
        if (!npc || npc.zone !== agent.zone) throw new Error("INVALID_TARGET");

        const npcType = NPC_TYPES[npc.type as keyof typeof NPC_TYPES];

        const distance = Math.sqrt(
          Math.pow(agent.positionX - npc.positionX, 2) +
          Math.pow(agent.positionY - npc.positionY, 2)
        );
        if (distance > 5) throw new Error("INVALID_TARGET");

        // Combat math (same as PvP)
        const npcCombatSeed = baseSeed + hashString(npcId) + 202;
        const npcCombatRng = seededRandom(npcCombatSeed);
        const hitChance = Math.min(0.95, Math.max(0.3, 0.7 + (agent.level - npc.level) * 0.05));
        const hit = npcCombatRng() < hitChance;

        if (!hit) {
          result = { hit: false, damage: 0 };
          // Log miss event (consistency with PvP)
          await ctx.db.insert("events", {
            seasonId: agent.seasonId,
            tick,
            timestamp: Date.now(),
            type: "combat",
            agentId,
            agentName: agent.name,
            data: {
              damage: 0,
              hit: false,
              npcType: npc.type,
              positionX: agent.positionX,
              positionY: agent.positionY,
              message: `${agent.name} missed the ${npc.type}`,
            },
          });
        } else {
          const now = Date.now();
          const attackMultiplier =
            agent.attackBuffUntil && agent.attackBuffUntil > now
              ? (agent.attackBuffMultiplier ?? 1)
              : 1;
          let damage = Math.floor(10 * (agent.level / npc.level) * (0.8 + npcCombatRng() * 0.4));
          damage = Math.max(1, Math.floor(damage * attackMultiplier));
          const newHp = Math.max(0, npc.hp - damage);

          if (newHp === 0) {
            npcAlive = false;

            // Calculate average level for underdog bonus
            const allAliveAgents = await ctx.db
              .query("agents")
              .withIndex("by_season_status", (q) =>
                q.eq("seasonId", agent.seasonId).eq("status", "alive")
              )
              .collect();
            const avgLevel = allAliveAgents.length > 0
              ? allAliveAgents.reduce((sum, a) => sum + a.level, 0) / allAliveAgents.length
              : agent.level;

            const xpResult = applyXpWithSoftCap({
              agent,
              baseXp: npcType.xpReward,
              zone: agent.zone,
              now,
              avgLevel,
            });
            currentXp = xpResult.newXp;

            // Roll loot drops
            const droppedItems: string[] = [];
            for (const lootEntry of npc.lootTable) {
              if (npcCombatRng() < lootEntry.dropRate) {
                await ctx.db.insert("groundItems", {
                  seasonId: agent.seasonId,
                  itemId: lootEntry.itemId,
                  positionX: npc.positionX,
                  positionY: npc.positionY,
                  bucketX: getBucketIndex(npc.positionX, bounds.minX),
                  bucketY: getBucketIndex(npc.positionY, bounds.minY),
                  zone: npc.zone,
                  droppedAt: Date.now(),
                });
                droppedItems.push(lootEntry.itemId);
              }
            }

            // Delete NPC, award XP
            await ctx.db.delete(npcId);
            await ctx.db.patch(agentId, {
              xp: currentXp,
              xpGainedThisHour: xpResult.xpThisHour,
              xpHourReset: xpResult.xpHourReset,
            });

            // Increment bossKills if boss (use in operator for safety)
            if ("isBoss" in npcType && npcType.isBoss) {
              const scoreMultiplier = ZONE_CONFIG[agent.zone].scoreMultiplier;
              const bossScore = Math.floor(500 * scoreMultiplier);
              currentScore += bossScore;
              await ctx.db.patch(agentId, {
                bossKills: agent.bossKills + 1,
                score: currentScore,
              });
            }

            // Log event
            await ctx.db.insert("events", {
              seasonId: agent.seasonId,
              tick,
              timestamp: Date.now(),
              type: "npc_killed",
              agentId,
              agentName: agent.name,
              data: {
                npcType: npc.type,
                xpGained: xpResult.adjustedXp,
                positionX: npc.positionX,
                positionY: npc.positionY,
                message: `${agent.name} killed a ${npc.type}!`,
              },
            });

            result = { hit: true, damage, kill: true, xpGained: xpResult.adjustedXp, lootDropped: droppedItems };
          } else {
            await ctx.db.patch(npcId, { hp: newHp });
            result = { hit: true, damage, kill: false };
          }
        }

        if (npcAlive && npcType.behavior === "defensive") {
          await ctx.db.patch(npcId, {
            targetAgentId: agentId,
            aggroTick: tick,
          });
        }

        // All NPCs counterattack when attacked (if within NPC attack range)
        if (npcAlive && distance <= NPC_ATTACK_RANGE) {
          const now = Date.now();
          if (!(agent.spawnProtectionUntil && agent.spawnProtectionUntil > now)) {
            if (!npc.lastAttackAt || now - npc.lastAttackAt >= NPC_ATTACK_COOLDOWN_MS) {
              const defenseMultiplier =
                agent.defenseBuffUntil && agent.defenseBuffUntil > now
                  ? (agent.defenseBuffMultiplier ?? 1)
                  : 1;
              const counterDamage = Math.max(1, Math.floor(npcType.damage * defenseMultiplier));
              const newHp = Math.max(0, agent.hp - counterDamage);
              await ctx.db.patch(agentId, { hp: newHp, lastHitAt: now });
              await ctx.db.patch(npcId, { lastAttackAt: now });

            await ctx.db.insert("events", {
              seasonId: agent.seasonId,
              tick,
              timestamp: now,
              type: "combat",
              agentId,
              agentName: agent.name,
              data: {
                damage: counterDamage,
                hit: true,
                npcType: npc.type,
                positionX: agent.positionX,
                positionY: agent.positionY,
                message: `${npc.type} hit ${agent.name} for ${counterDamage} damage`,
              },
            });

            if (newHp === 0) {
              const targetPhaseConfig = PHASE_CONFIG[agent.zone];
              const xpPenalty = Math.floor(agent.xp * targetPhaseConfig.deathPenalty);
              const respawnAt = Date.now() + targetPhaseConfig.respawnDelay;
              await ctx.db.patch(agentId, {
                status: "dead",
                deaths: agent.deaths + 1,
                xp: Math.max(0, agent.xp - xpPenalty),
                respawnAt,
                inventory: [],
                attackBuffUntil: 0,
                attackBuffMultiplier: 1,
                defenseBuffUntil: 0,
                defenseBuffMultiplier: 1,
              });

              await ctx.db.insert("events", {
                seasonId: agent.seasonId,
                tick,
                timestamp: now,
                type: "agent_died",
                agentId,
                agentName: agent.name,
                data: {
                  positionX: agent.positionX,
                  positionY: agent.positionY,
                  message: `${agent.name} was killed by ${npc.type}`,
                },
              });
            }
          }
        }
        }
        break;
      }

      case "rest": {
        // HP regen already applied above (+10 HP for rest)
        // Just return the result - no cooldown in instant action system
        result = { action: "rest", message: "Rested and recovered HP" };
        break;
      }

      case "flee": {
        const success = actionRng() < 0.5;
        if (success) {
          const rangeX = bounds.maxX - bounds.minX;
          const rangeY = bounds.maxY - bounds.minY;
          const newX = Math.floor(actionRng() * rangeX) + bounds.minX;
          const newY = Math.floor(actionRng() * rangeY) + bounds.minY;
          const bucketX = getBucketIndex(newX, bounds.minX);
          const bucketY = getBucketIndex(newY, bounds.minY);
          await ctx.db.patch(agentId, {
            positionX: newX,
            positionY: newY,
            bucketX,
            bucketY,
            cooldownUntil: Date.now() + 10000,
          });
          result = { success: true, newPosition: { x: newX, y: newY } };
        } else {
          await ctx.db.patch(agentId, { cooldownUntil: Date.now() + 3000 });
          result = { success: false };
        }
        break;
      }

      case "loot": {
        // Find ground items within 1 tile of agent (bucketed query)
        const agentBucketX = getBucketIndex(agent.positionX, bounds.minX);
        const agentBucketY = getBucketIndex(agent.positionY, bounds.minY);
        const candidateItems: any[] = [];

        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const bucketX = agentBucketX + dx;
            const bucketY = agentBucketY + dy;
            const bucketItems = await ctx.db
              .query("groundItems")
              .withIndex("by_season_zone_bucket", (q) =>
                q.eq("seasonId", agent.seasonId)
                  .eq("zone", agent.zone)
                  .eq("bucketX", bucketX)
                  .eq("bucketY", bucketY)
              )
              .collect();
            candidateItems.push(...bucketItems);
          }
        }

        const nearbyItems = candidateItems.filter(
          (item) =>
            Math.abs(item.positionX - agent.positionX) <= 1 &&
            Math.abs(item.positionY - agent.positionY) <= 1
        );

        const collected: string[] = [];
        const newInventory = agent.inventory.map((i) => ({ ...i }));
        let scoreDelta = 0;
        const scoreMultiplier = ZONE_CONFIG[agent.zone].scoreMultiplier;

        for (const groundItem of nearbyItems) {
          const itemDef = ITEMS[groundItem.itemId as ItemId];
          const maxStack = itemDef?.maxStack ?? DEFAULT_MAX_STACK;

          const existing = newInventory.find((i) => i.itemId === groundItem.itemId);
          if (existing) {
            if (existing.quantity >= maxStack) {
              throw new Error("STACK_FULL");
            }
            existing.quantity += 1;
          } else {
            if (newInventory.length >= MAX_INVENTORY_SLOTS) {
              throw new Error("INVENTORY_FULL");
            }
            newInventory.push({ itemId: groundItem.itemId, quantity: 1 });
          }

          if (itemDef?.effect === "score") {
            scoreDelta += Math.floor(itemDef.value * scoreMultiplier);
          }

          collected.push(groundItem.itemId);
        }

        if (collected.length > 0) {
          for (const groundItem of nearbyItems) {
            await ctx.db.delete(groundItem._id);
            await ctx.db.insert("events", {
              seasonId: agent.seasonId,
              tick,
              timestamp: Date.now(),
              type: "item_looted",
              agentId,
              agentName: agent.name,
              data: {
                itemId: groundItem.itemId,
                positionX: groundItem.positionX,
                positionY: groundItem.positionY,
                message: `${agent.name} picked up ${groundItem.itemId}`,
              },
            });
          }

          currentScore += scoreDelta;
          await ctx.db.patch(agentId, {
            inventory: newInventory,
            score: currentScore,
          });
        }

        result = { items: collected, scoreAdded: scoreDelta };
        break;
      }

      case "use_item": {
        const payload = action.payload as { itemId: string } | undefined;
        const itemIdStr = payload?.itemId;
        if (!itemIdStr) throw new Error("ITEM_NOT_FOUND");

        const invItem = agent.inventory.find((i) => i.itemId === itemIdStr);
        if (!invItem || invItem.quantity < 1) throw new Error("ITEM_NOT_FOUND");

        const itemDef = ITEMS[itemIdStr as ItemId];
        if (!itemDef) throw new Error("ITEM_NOT_FOUND");

        let effectApplied: Record<string, number> = {};

        switch (itemDef.effect) {
          case "heal": {
            const healAmount = itemDef.value;
            const newHp = Math.min(agent.hp + healAmount, agent.maxHp);
            await ctx.db.patch(agentId, { hp: newHp });
            effectApplied = { healed: newHp - agent.hp };
            break;
          }
          case "score": {
            throw new Error("ITEM_NOT_USABLE");
          }
          case "buff_attack": {
            const duration = "duration" in itemDef ? itemDef.duration : 0;
            const until = Date.now() + duration;
            await ctx.db.patch(agentId, {
              attackBuffUntil: until,
              attackBuffMultiplier: itemDef.value,
            });
            effectApplied = { attackBoost: itemDef.value, until };
            break;
          }
          case "buff_defense": {
            const duration = "duration" in itemDef ? itemDef.duration : 0;
            const until = Date.now() + duration;
            await ctx.db.patch(agentId, {
              defenseBuffUntil: until,
              defenseBuffMultiplier: itemDef.value,
            });
            effectApplied = { defenseBoost: itemDef.value, until };
            break;
          }
          default:
            effectApplied = { applied: 1 };
        }

        // Decrement inventory
        const newInventory = agent.inventory
          .map((i) =>
            i.itemId === itemIdStr ? { ...i, quantity: i.quantity - 1 } : i
          )
          .filter((i) => i.quantity > 0);
        await ctx.db.patch(agentId, { inventory: newInventory });

        result = { used: itemIdStr, effect: effectApplied };
        break;
      }
    }

    // Re-check if agent is still alive (NPC counterattack may have killed them)
    const agentAfterAction = await ctx.db.get(agentId);
    if (!agentAfterAction || agentAfterAction.status === "dead") {
      return { ...result, action: action.type };
    }

    // Check for level up (use currentXp which includes any XP gained this action)
    const newLevel = calculateLevel(currentXp);
    if (newLevel > agent.level) {
      const levelGain = newLevel - agent.level;
      const scoreMultiplier = ZONE_CONFIG[agent.zone].scoreMultiplier;
      const levelScore = Math.floor(levelGain * 100 * scoreMultiplier);
      currentScore += levelScore;
      await ctx.db.patch(agentId, {
        level: newLevel,
        maxHp: 100 + (newLevel - 1) * 10,
        hp: Math.min(agent.hp + 20, 100 + (newLevel - 1) * 10),
        score: currentScore,
      });
      result.levelUp = { newLevel, newMaxHp: 100 + (newLevel - 1) * 10, scoreAdded: levelScore };

      await ctx.db.insert("events", {
        seasonId: agent.seasonId,
        tick,
        timestamp: Date.now(),
        type: "level_up",
        agentId,
        agentName: agent.name,
        data: {
          oldLevel: agent.level,
          newLevel,
          positionX: agent.positionX,
          positionY: agent.positionY,
          message: `${agent.name} reached level ${newLevel}!`,
        },
      });

      // Instant zone transition on level-up (don't wait for cron)
      let newZone: Zone = agent.zone;
      if (agent.zone === "shallows" && newLevel >= 11) newZone = "awakening";
      else if (agent.zone === "awakening" && newLevel >= 21) newZone = "volcano";

      if (newZone !== agent.zone) {
        const newBounds = season.config.worldBounds[newZone];
        const transSeed = hashString(agentId) + tick + newLevel;
        const transRng = seededRandom(transSeed);
        const transX = Math.floor(transRng() * (newBounds.maxX - newBounds.minX)) + newBounds.minX;
        const transY = Math.floor(transRng() * (newBounds.maxY - newBounds.minY)) + newBounds.minY;
        await ctx.db.patch(agentId, {
          zone: newZone,
          positionX: transX,
          positionY: transY,
          bucketX: getBucketIndex(transX, newBounds.minX),
          bucketY: getBucketIndex(transY, newBounds.minY),
        });
        result.zoneTransition = { from: agent.zone, to: newZone, newPosition: { x: transX, y: transY } };

        await ctx.db.insert("events", {
          seasonId: agent.seasonId,
          tick,
          timestamp: Date.now(),
          type: "zone_transition",
          agentId,
          agentName: agent.name,
          data: {
            fromZone: agent.zone,
            toZone: newZone,
            positionX: transX,
            positionY: transY,
            message: `${agent.name} advanced to ${newZone}!`,
          },
        });
      }
    }

    await ctx.db.patch(agentId, { actionNonce: nextActionNonce });

    await ctx.db.insert("actions", {
      seasonId: agent.seasonId,
      agentId,
      tick,
      type: action.type,
      payload: action.payload || {},
      result: { success: true, outcome: result },
      timestamp: Date.now(),
    });

    return { success: true, result };
  },
});

// ===== INTERNAL MUTATIONS =====

// REMOVED: applyTickEffects - now inlined in dispatchTick for batch processing

export const dispatchTick = internalMutation({
  handler: async (ctx) => {
    const activeSeason = await ctx.db
      .query("seasons")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .first();

    if (!activeSeason) return;

    let gameState = await ctx.db
      .query("gameState")
      .withIndex("by_season", (q) => q.eq("seasonId", activeSeason._id))
      .first();

    if (!gameState) {
      const secretSeed = Math.floor(Math.random() * 0x7fffffff);
      const id = await ctx.db.insert("gameState", {
        seasonId: activeSeason._id,
        tick: 0,
        phase: "shallows",
        rngSeed: Date.now(),
        secretSeed,
        lastTickAt: Date.now(),
      });
      gameState = await ctx.db.get(id);
    }

    const newTick = gameState!.tick + 1;
    await ctx.db.patch(gameState!._id, { tick: newTick, lastTickAt: Date.now() });

    // BATCH OPTIMIZATION: Process all alive agents directly (no scheduler calls)
    // This reduces function calls from 1 + N to just 1 per tick
    // Convex supports up to 16,000 document writes per mutation
    const aliveAgents = await ctx.db
      .query("agents")
      .withIndex("by_season_status", (q) =>
        q.eq("seasonId", activeSeason._id).eq("status", "alive")
      )
      .collect();

    const now = Date.now();
    for (const agent of aliveAgents) {
      // Skip if already processed this tick (idempotency)
      if (agent.lastTickProcessed && agent.lastTickProcessed >= newTick) continue;

      // NOTE: HP regen is now per-action (in submitAction), not per-tick
      // This tick only handles: bucket updates, NPC AI, respawns
      const updates: Record<string, number> = { lastTickProcessed: newTick };
      if (agent.bucketX === undefined || agent.bucketY === undefined) {
        const bounds = activeSeason.config.worldBounds[agent.zone];
        updates.bucketX = getBucketIndex(agent.positionX, bounds.minX);
        updates.bucketY = getBucketIndex(agent.positionY, bounds.minY);
      }

      // AFK decay is now handled by maintenance cron, not per-tick
      await ctx.db.patch(agent._id, updates);
    }

    // BATCH OPTIMIZATION: Process respawns directly (no scheduler calls)
    const deadAgents = await ctx.db
      .query("agents")
      .withIndex("by_season_status", (q) =>
        q.eq("seasonId", activeSeason._id).eq("status", "dead")
      )
      .collect();

    for (const agent of deadAgents) {
      if (agent.respawnAt && agent.respawnAt <= now) {
        const zone = agent.zone;
        const bounds = activeSeason.config.worldBounds[zone];

        const respawnSeed = hashString(agent._id) + newTick + agent.deaths;
        const respawnRng = seededRandom(respawnSeed);
        const newX = Math.floor(respawnRng() * (bounds.maxX - bounds.minX)) + bounds.minX;
        const newY = Math.floor(respawnRng() * (bounds.maxY - bounds.minY)) + bounds.minY;
        const bucketX = getBucketIndex(newX, bounds.minX);
        const bucketY = getBucketIndex(newY, bounds.minY);

        await ctx.db.patch(agent._id, {
          status: "alive",
          hp: agent.maxHp,
          positionX: newX,
          positionY: newY,
          bucketX,
          bucketY,
          respawnAt: undefined,
          inventory: [],
          attackBuffUntil: 0,
          attackBuffMultiplier: 1,
          defenseBuffUntil: 0,
          defenseBuffMultiplier: 1,
          spawnProtectionUntil: now + SPAWN_PROTECTION_MS,
        });

        await ctx.db.insert("events", {
          seasonId: activeSeason._id,
          tick: newTick,
          timestamp: now,
          type: "agent_respawned",
          agentId: agent._id,
          agentName: agent.name,
          data: {
            positionX: newX,
            positionY: newY,
            message: `${agent.name} respawned in ${zone}`,
          },
        });
      }
    }

    const agentsById = new Map(aliveAgents.map((a) => [a._id, a]));
    const deadAgentIds = new Set<string>();
    const agentsByZoneBucket = new Map<string, typeof aliveAgents>();
    for (const agent of aliveAgents) {
      const bounds = activeSeason.config.worldBounds[agent.zone];
      const bucketX = getBucketIndex(agent.positionX, bounds.minX);
      const bucketY = getBucketIndex(agent.positionY, bounds.minY);
      const key = `${agent.zone}:${bucketX}:${bucketY}`;
      if (!agentsByZoneBucket.has(key)) {
        agentsByZoneBucket.set(key, []);
      }
      agentsByZoneBucket.get(key)!.push(agent);
    }

    const zones: Zone[] = ["shallows", "awakening", "volcano"];
    const shouldMoveThisTick = newTick % NPC_MOVE_EVERY_TICKS === 0;

    for (const zone of zones) {
      const npcs = await ctx.db
        .query("npcs")
        .withIndex("by_season_zone", (q) =>
          q.eq("seasonId", activeSeason._id).eq("zone", zone)
        )
        .collect();

      const bounds = activeSeason.config.worldBounds[zone];

      for (const npc of npcs) {
        const npcType = NPC_TYPES[npc.type as keyof typeof NPC_TYPES];
        let target = npc.targetAgentId ? agentsById.get(npc.targetAgentId) : undefined;

        if (npcType.behavior === "passive") {
          target = undefined;
        }

        if (target && deadAgentIds.has(target._id)) {
          target = undefined;
        }

        if (target && (target.status !== "alive" || target.zone !== npc.zone)) {
          target = undefined;
        }

        if (target && npc.aggroTick !== undefined && npcType.chaseTicks > 0) {
          if (newTick - npc.aggroTick > npcType.chaseTicks) {
            target = undefined;
          }
        }

        if (!target && npcType.behavior === "aggressive") {
          const searchRadius = Math.max(1, Math.ceil(npcType.aggroRange / POSITION_BUCKET_SIZE));
          const npcBucketX = getBucketIndex(npc.positionX, bounds.minX);
          const npcBucketY = getBucketIndex(npc.positionY, bounds.minY);
          let nearest: typeof aliveAgents[0] | undefined;
          let nearestDist = Number.POSITIVE_INFINITY;

          for (let dx = -searchRadius; dx <= searchRadius; dx++) {
            for (let dy = -searchRadius; dy <= searchRadius; dy++) {
              const key = `${npc.zone}:${npcBucketX + dx}:${npcBucketY + dy}`;
              const candidates = agentsByZoneBucket.get(key) || [];
              for (const candidate of candidates) {
                if (deadAgentIds.has(candidate._id)) continue;
                if (candidate.spawnProtectionUntil && candidate.spawnProtectionUntil > now) continue;
                const dist = Math.sqrt(
                  Math.pow(candidate.positionX - npc.positionX, 2) +
                  Math.pow(candidate.positionY - npc.positionY, 2)
                );
                if (dist <= npcType.aggroRange && dist < nearestDist) {
                  nearest = candidate;
                  nearestDist = dist;
                }
              }
            }
          }

          if (nearest) {
            target = nearest;
            await ctx.db.patch(npc._id, {
              targetAgentId: nearest._id,
              aggroTick: newTick,
            });
          }
        }

        if (!target && npc.targetAgentId) {
          await ctx.db.patch(npc._id, { targetAgentId: undefined, aggroTick: undefined });
        }

        if (target && shouldMoveThisTick) {
          const dx = target.positionX - npc.positionX;
          const dy = target.positionY - npc.positionY;
          let newX = npc.positionX;
          let newY = npc.positionY;
          if (Math.abs(dx) >= Math.abs(dy)) {
            newX += Math.sign(dx);
          } else {
            newY += Math.sign(dy);
          }

          newX = Math.min(bounds.maxX, Math.max(bounds.minX, newX));
          newY = Math.min(bounds.maxY, Math.max(bounds.minY, newY));
          const bucketX = getBucketIndex(newX, bounds.minX);
          const bucketY = getBucketIndex(newY, bounds.minY);
          await ctx.db.patch(npc._id, { positionX: newX, positionY: newY, bucketX, bucketY });
        }

        if (!target && shouldMoveThisTick && npc.homeX != null && npc.homeY != null) {
          const dx = npc.homeX - npc.positionX;
          const dy = npc.homeY - npc.positionY;
          if (dx !== 0 || dy !== 0) {
            let newX = npc.positionX;
            let newY = npc.positionY;
            if (Math.abs(dx) >= Math.abs(dy)) {
              newX += Math.sign(dx);
            } else {
              newY += Math.sign(dy);
            }
            newX = Math.min(bounds.maxX, Math.max(bounds.minX, newX));
            newY = Math.min(bounds.maxY, Math.max(bounds.minY, newY));
            const bucketX = getBucketIndex(newX, bounds.minX);
            const bucketY = getBucketIndex(newY, bounds.minY);
            await ctx.db.patch(npc._id, { positionX: newX, positionY: newY, bucketX, bucketY });
          }
        }

        if (target) {
          const distance = Math.sqrt(
            Math.pow(target.positionX - npc.positionX, 2) +
            Math.pow(target.positionY - npc.positionY, 2)
          );
          if (distance <= NPC_ATTACK_RANGE && (!npc.lastAttackAt || now - npc.lastAttackAt >= NPC_ATTACK_COOLDOWN_MS)) {
            const victims: typeof aliveAgents = [];
            const victimIds = new Set<string>();
            if ("isBoss" in npcType && npcType.isBoss) {
              const searchRadius = Math.max(1, Math.ceil(NPC_ATTACK_RANGE / POSITION_BUCKET_SIZE));
              const npcBucketX = getBucketIndex(npc.positionX, bounds.minX);
              const npcBucketY = getBucketIndex(npc.positionY, bounds.minY);
              for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                for (let dy = -searchRadius; dy <= searchRadius; dy++) {
                  const key = `${npc.zone}:${npcBucketX + dx}:${npcBucketY + dy}`;
                  const candidates = agentsByZoneBucket.get(key) || [];
                  for (const candidate of candidates) {
                    const dist = Math.sqrt(
                      Math.pow(candidate.positionX - npc.positionX, 2) +
                      Math.pow(candidate.positionY - npc.positionY, 2)
                    );
                    if (dist <= NPC_ATTACK_RANGE && !victimIds.has(candidate._id)) {
                      victimIds.add(candidate._id);
                      victims.push(candidate);
                    }
                  }
                }
              }
            } else {
              victims.push(target);
            }

            for (const victim of victims) {
              if (deadAgentIds.has(victim._id)) continue;
              if (victim.spawnProtectionUntil && victim.spawnProtectionUntil > now) continue;
              const defenseMultiplier =
                victim.defenseBuffUntil && victim.defenseBuffUntil > now
                  ? (victim.defenseBuffMultiplier ?? 1)
                  : 1;
              const damage = Math.max(1, Math.floor(npcType.damage * defenseMultiplier));
              const newHp = Math.max(0, victim.hp - damage);

              await ctx.db.patch(victim._id, { hp: newHp });
              await ctx.db.insert("events", {
                seasonId: activeSeason._id,
                tick: newTick,
                timestamp: now,
                type: "combat",
                agentId: victim._id,
                agentName: victim.name,
                data: {
                  damage,
                  hit: true,
                  npcType: npc.type,
                  positionX: victim.positionX,
                  positionY: victim.positionY,
                  message: `${npc.type} hit ${victim.name} for ${damage} damage`,
                },
              });

              if (newHp === 0) {
                deadAgentIds.add(victim._id);
                const targetPhaseConfig = PHASE_CONFIG[victim.zone];
                const xpPenalty = Math.floor(victim.xp * targetPhaseConfig.deathPenalty);
                const respawnAt = now + targetPhaseConfig.respawnDelay;
                await ctx.db.patch(victim._id, {
                  status: "dead",
                  deaths: victim.deaths + 1,
                  xp: Math.max(0, victim.xp - xpPenalty),
                  respawnAt,
                  inventory: [],
                  attackBuffUntil: 0,
                  attackBuffMultiplier: 1,
                  defenseBuffUntil: 0,
                  defenseBuffMultiplier: 1,
                });

                await ctx.db.insert("events", {
                  seasonId: activeSeason._id,
                  tick: newTick,
                  timestamp: now,
                  type: "agent_died",
                  agentId: victim._id,
                  agentName: victim.name,
                  data: {
                    positionX: victim.positionX,
                    positionY: victim.positionY,
                    message: `${victim.name} was killed by ${npc.type}`,
                  },
                });
              }
            }

            await ctx.db.patch(npc._id, { lastAttackAt: now });
          }
        }
      }
    }
  },
});

export const respawnAgent = internalMutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const agent = await ctx.db.get(agentId);
    if (!agent || agent.status !== "dead") return;

    const season = await ctx.db.get(agent.seasonId);
    if (!season) return;

    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .first();
    const tick = gameState?.tick || 0;

    const zone = agent.zone;
    const bounds = season.config.worldBounds[zone];

    const respawnSeed = hashString(agentId) + tick + agent.deaths;
    const respawnRng = seededRandom(respawnSeed);
    const newX = Math.floor(respawnRng() * (bounds.maxX - bounds.minX)) + bounds.minX;
    const newY = Math.floor(respawnRng() * (bounds.maxY - bounds.minY)) + bounds.minY;
    const bucketX = getBucketIndex(newX, bounds.minX);
    const bucketY = getBucketIndex(newY, bounds.minY);

    await ctx.db.patch(agentId, {
      status: "alive",
      hp: agent.maxHp,
      positionX: newX,
      positionY: newY,
      bucketX,
      bucketY,
      respawnAt: undefined,
      inventory: [],
      attackBuffUntil: 0,
      attackBuffMultiplier: 1,
      defenseBuffUntil: 0,
      defenseBuffMultiplier: 1,
      spawnProtectionUntil: Date.now() + SPAWN_PROTECTION_MS,
    });

    await ctx.db.insert("events", {
      seasonId: season._id,
      tick,
      timestamp: Date.now(),
      type: "agent_respawned",
      agentId,
      agentName: agent.name,
      data: {
        positionX: newX,
        positionY: newY,
        message: `${agent.name} respawned in ${zone}`,
      },
    });
  },
});

export const checkPhaseTransition = internalMutation({
  handler: async (ctx) => {
    const season = await ctx.db
      .query("seasons")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .first();
    if (!season) return;

    const gameState = await ctx.db
      .query("gameState")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .first();
    if (!gameState) return;

    const agents = await ctx.db
      .query("agents")
      .withIndex("by_season_status", (q) =>
        q.eq("seasonId", season._id).eq("status", "alive")
      )
      .collect();

    for (const agent of agents) {
      let newZone: Zone = agent.zone;

      if (agent.zone === "shallows" && agent.level >= 11) {
        newZone = "awakening";
      } else if (agent.zone === "awakening" && agent.level >= 21) {
        newZone = "volcano";
      }

      if (newZone !== agent.zone) {
        const bounds = season.config.worldBounds[newZone];
        const transitionSeed = hashString(agent._id) + gameState.tick;
        const transitionRng = seededRandom(transitionSeed);
        const newX = Math.floor(transitionRng() * (bounds.maxX - bounds.minX)) + bounds.minX;
        const newY = Math.floor(transitionRng() * (bounds.maxY - bounds.minY)) + bounds.minY;
        const bucketX = getBucketIndex(newX, bounds.minX);
        const bucketY = getBucketIndex(newY, bounds.minY);

        await ctx.db.patch(agent._id, {
          zone: newZone,
          positionX: newX,
          positionY: newY,
          bucketX,
          bucketY,
        });

        await ctx.db.insert("events", {
          seasonId: season._id,
          tick: gameState.tick,
          timestamp: Date.now(),
          type: "zone_transition",
          agentId: agent._id,
          agentName: agent.name,
          data: {
            fromZone: agent.zone,
            toZone: newZone,
            positionX: newX,
            positionY: newY,
            message: `${agent.name} advanced to ${newZone}!`,
          },
        });
      }
    }
  },
});

export const checkSeasonEnd = internalMutation({
  handler: async (ctx) => {
    const season = await ctx.db
      .query("seasons")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .first();
    if (!season) return;

    const now = Date.now();
    if (now < season.endTime) return;

    const agents = await ctx.db
      .query("agents")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .collect();

    const ranked = agents
      .filter((a) => a.status !== "pending_payment" && a.prizeEligible) // Only prize-eligible agents can win
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.kills !== a.kills) return b.kills - a.kills;
        if (b.bossKills !== a.bossKills) return b.bossKills - a.bossKills;
        return a.createdAt - b.createdAt;
      });

    const winners = ranked.slice(0, 3);
    const payouts = [0.5, 0.3, 0.2];

    for (let i = 0; i < winners.length; i++) {
      const winner = winners[i];
      const amount = Math.floor(season.prizePool * payouts[i]);
      const idempotencyKey = `payout-${season._id}-${i + 1}`;

      const existing = await ctx.db
        .query("transactions")
        .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
        .first();
      if (existing) continue;

      await ctx.db.insert("transactions", {
        agentId: winner._id,
        seasonId: season._id,
        type: "prize_payout",
        amount,
        status: "confirmed",
        idempotencyKey,
        txHash: `fake_payout_${Date.now()}_${i}`,
        createdAt: now,
      });
    }

    for (const agent of agents) {
      await ctx.db.patch(agent._id, { status: "spectating" });
    }

    await ctx.db.patch(season._id, { status: "ended", endTime: now });

    await ctx.db.insert("events", {
      seasonId: season._id,
      tick: 0,
      timestamp: now,
      type: "season_ended",
      data: {
        winners: winners.map((w, i) => ({
          place: i + 1,
          name: w.name,
          score: w.score,
          payout: Math.floor(season.prizePool * payouts[i]),
        })),
        message: `Season ${season.number} ended! Winner: ${winners[0]?.name ?? "N/A"}`,
      },
    });

    // Auto-start next season (same config, 7-day duration)
    await ctx.scheduler.runAfter(0, internal.seasons.create, {
      treasuryAddress: season.treasuryAddress,
      entryFee: season.entryFee,
      durationHours: 168,
      maxPlayers: season.config.maxPlayers,
    });
  },
});

// ===== MAINTENANCE =====

// Maintenance mutation for cleanup tasks (runs every 5 minutes via cron)
export const maintenance = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    let itemsCleaned = 0;
    let afkDecayed = 0;

    // 1. Clean expired ground items (5 min old)
    const expiredItems = await ctx.db
      .query("groundItems")
      .withIndex("by_droppedAt", (q) => q.lt("droppedAt", now - 300000))
      .take(100);
    for (const item of expiredItems) {
      await ctx.db.delete(item._id);
      itemsCleaned++;
    }

    // 2. AFK decay: agents inactive for 10+ min lose 1% score per maintenance cycle
    const activeSeason = await ctx.db
      .query("seasons")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .first();

    if (activeSeason) {
      const afkThreshold = now - AFK_THRESHOLD_MS; // 10 minutes
      const agents = await ctx.db
        .query("agents")
        .withIndex("by_season_status", (q) =>
          q.eq("seasonId", activeSeason._id).eq("status", "alive")
        )
        .collect();

      for (const agent of agents) {
        const lastActionAt = agent.lastActionAt || agent.createdAt;
        if (lastActionAt < afkThreshold && agent.score > 0) {
          const decay = Math.floor(agent.score * 0.01); // 1% decay
          if (decay > 0) {
            await ctx.db.patch(agent._id, {
              score: agent.score - decay,
              lastAfkDecayAt: now,
            });
            afkDecayed++;
          }
        }
      }
    }

    return { itemsCleaned, afkDecayed };
  },
});

// ===== INTERNAL ACTIONS =====

// REMOVED: processAgentTick - now inlined in dispatchTick for batch processing
// This eliminates N scheduler calls per tick, reducing from 1+N to 1 function call

export const cleanupActions = internalMutation({
  handler: async (ctx) => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const oldActions = await ctx.db
      .query("actions")
      .withIndex("by_season_tick")
      .filter((q) => q.lt(q.field("timestamp"), twoHoursAgo))
      .take(500);

    for (const action of oldActions) {
      await ctx.db.delete(action._id);
    }
    return { deleted: oldActions.length };
  },
});
