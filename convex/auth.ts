"use node";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import bcrypt from "bcryptjs";
import { internal } from "./_generated/api";

// Action to verify API key (uses Node.js for bcrypt)
export const verifyApiKey = internalAction({
  args: {
    apiKey: v.string(),
  },
  handler: async (ctx, { apiKey }) => {
    const apiKeyPrefix = apiKey.slice(0, 8);

    // Find agent by prefix (fast indexed lookup)
    const agent = await ctx.runQuery(internal.agents.getByApiKeyPrefix, {
      apiKeyPrefix,
    });
    if (!agent) return null;

    // Verify full key with bcrypt (constant-time comparison)
    const isValid = await bcrypt.compare(apiKey, agent.apiKeyHash);
    if (!isValid) return null;

    return agent;
  },
});

// Helper functions for HTTP responses (no Node.js needed)
export function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Invalid or missing API key" } }),
    { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
}

export function rateLimitedResponse(): Response {
  return new Response(
    JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many requests. Max 1 action per second." } }),
    { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};
