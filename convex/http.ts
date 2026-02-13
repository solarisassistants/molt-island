import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { unauthorizedResponse, rateLimitedResponse, jsonResponse, corsHeaders } from "./auth";

const http = httpRouter();

const corsHandler = httpAction(async () => {
  return new Response(null, { status: 204, headers: corsHeaders });
});

// Helper to extract API key from request
function getApiKey(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

// CORS OPTIONS for all routes
http.route({ path: "/api/register", method: "OPTIONS", handler: corsHandler });
http.route({ path: "/api/season", method: "OPTIONS", handler: corsHandler });
http.route({ path: "/api/world", method: "OPTIONS", handler: corsHandler });
http.route({ path: "/api/me", method: "OPTIONS", handler: corsHandler });
http.route({ path: "/api/action", method: "OPTIONS", handler: corsHandler });
http.route({ path: "/api/leaderboard", method: "OPTIONS", handler: corsHandler });

// Public: Register (calls action for crypto operations)
http.route({
  path: "/api/register",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    try {
      const body = await req.json();
      const result = await ctx.runAction(api.agentsActions.register, body);
      return jsonResponse(result, 201);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return jsonResponse({ error: { code: "REGISTRATION_FAILED", message } }, 400);
    }
  }),
});

// Public: Get season info
http.route({
  path: "/api/season",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const result = await ctx.runQuery(api.seasons.getActive);
    if (!result) {
      return jsonResponse({ error: { code: "NO_ACTIVE_SEASON", message: "No active season" } }, 404);
    }
    return jsonResponse({
      seasonNumber: result.number,
      entryFee: result.entryFee,
      treasuryAddress: result.treasuryAddress,
      prizePool: result.prizePool,
      endsAt: result.endTime,
    });
  }),
});

// Protected: Get world state
http.route({
  path: "/api/world",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const apiKey = getApiKey(req);
    if (!apiKey) return unauthorizedResponse();

    const agent = await ctx.runAction(internal.auth.verifyApiKey, { apiKey });
    if (!agent) return unauthorizedResponse();

    const url = new URL(req.url);
    const zoneParam = url.searchParams.get("zone") || undefined; // undefined = all zones
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

    const result = await ctx.runQuery(api.game.getWorldState, {
      seasonId: agent.seasonId,
      zone: zoneParam,
      limit,
      viewerPosition: { x: agent.positionX, y: agent.positionY },
    });
    return jsonResponse(result);
  }),
});

// Protected: Get own state
http.route({
  path: "/api/me",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const apiKey = getApiKey(req);
    if (!apiKey) return unauthorizedResponse();

    const agent = await ctx.runAction(internal.auth.verifyApiKey, { apiKey });
    if (!agent) return unauthorizedResponse();

    // Only expose fields documented in SKILL.md
    return jsonResponse({
      id: agent._id,
      name: agent.name,
      level: agent.level,
      xp: agent.xp,
      hp: agent.hp,
      maxHp: agent.maxHp,
      position: { x: agent.positionX, y: agent.positionY },
      zone: agent.zone,
      inventory: agent.inventory,
      score: agent.score,
      kills: agent.kills,
      deaths: agent.deaths,
      status: agent.status,
      walletAddress: agent.walletAddress,
      // Personality
      avatar: agent.avatar,
      motto: agent.motto,
      prizeEligible: agent.prizeEligible,
      // Respawn info (if dead)
      respawnAt: agent.respawnAt,
    });
  }),
});

// Protected: Submit action (rate limited)
http.route({
  path: "/api/action",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const apiKey = getApiKey(req);
    if (!apiKey) return unauthorizedResponse();

    const agent = await ctx.runAction(internal.auth.verifyApiKey, { apiKey });
    if (!agent) return unauthorizedResponse();

    // Allow dead agents through for auto-respawn (submitAction handles respawn logic)
    if (agent.status !== "alive" && agent.status !== "dead") {
      return jsonResponse({
        error: { code: "NOT_ALIVE", message: `Cannot act while ${agent.status}` }
      }, 400);
    }

    if (agent.status === "alive" && agent.cooldownUntil > Date.now()) {
      return jsonResponse({
        error: {
          code: "COOLDOWN_ACTIVE",
          message: "Action on cooldown",
          details: { cooldownUntil: agent.cooldownUntil }
        }
      }, 400);
    }

    const rateLimitOk = await ctx.runMutation(internal.rateLimit.check, {
      agentId: agent._id,
      maxRequests: 1,
      windowMs: 1000,
    });
    if (!rateLimitOk) return rateLimitedResponse();

    try {
      const body = await req.json();
      const result = await ctx.runMutation(internal.game.submitAction, {
        agentId: agent._id,
        action: body,
      });
      return jsonResponse(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "RATE_LIMITED") {
        return rateLimitedResponse();
      }
      return jsonResponse({
        error: { code: "ACTION_FAILED", message }
      }, 400);
    }
  }),
});

// Public: Leaderboard
http.route({
  path: "/api/leaderboard",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const result = await ctx.runQuery(api.game.getLeaderboard, { limit });
    return jsonResponse(result);
  }),
});

// CORS for log endpoint
http.route({ path: "/api/log", method: "OPTIONS", handler: corsHandler });

// Protected: Agent log/reasoning (rate limited: 1 per 10 seconds)
http.route({
  path: "/api/log",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const apiKey = getApiKey(req);
    if (!apiKey) return unauthorizedResponse();

    const agent = await ctx.runAction(internal.auth.verifyApiKey, { apiKey });
    if (!agent) return unauthorizedResponse();

    if (agent.status !== "alive") {
      return jsonResponse({
        error: { code: "NOT_ALIVE", message: `Cannot log while ${agent.status}` }
      }, 400);
    }

    // Rate limit: 1 log per 10 seconds (separate limiter from actions)
    const rateLimitOk = await ctx.runMutation(internal.rateLimit.checkLog, {
      agentId: agent._id,
      windowMs: 10000,
    });
    if (!rateLimitOk) {
      return jsonResponse({
        error: { code: "RATE_LIMITED", message: "Too many logs. Max 1 per 10 seconds." }
      }, 429);
    }

    try {
      const body = await req.json();
      const result = await ctx.runMutation(internal.events.createAgentLog, {
        agentId: agent._id,
        seasonId: agent.seasonId,
        logType: body.type || "observation",
        content: body.content?.slice(0, 500) || "", // Max 500 chars
      });
      return jsonResponse(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return jsonResponse({
        error: { code: "LOG_FAILED", message }
      }, 400);
    }
  }),
});

export default http;
