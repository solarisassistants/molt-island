import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const getByIdempotencyKey = internalQuery({
  args: { idempotencyKey: v.string() },
  handler: async (ctx, { idempotencyKey }) => {
    return ctx.db
      .query("transactions")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();
  },
});

export const getPending = internalQuery({
  handler: async (ctx) => {
    return ctx.db
      .query("transactions")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
  },
});

export const create = internalMutation({
  args: {
    agentId: v.id("agents"),
    seasonId: v.id("seasons"),
    type: v.union(v.literal("entry_fee"), v.literal("bounty"), v.literal("prize"), v.literal("prize_payout")),
    amount: v.number(),
    idempotencyKey: v.string(),
    txHash: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("failed")),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("transactions", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const confirm = internalMutation({
  args: {
    idempotencyKey: v.string(),
    txHash: v.string(),
    privyTxId: v.optional(v.string()),
  },
  handler: async (ctx, { idempotencyKey, txHash, privyTxId }) => {
    const tx = await ctx.db
      .query("transactions")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();
    if (tx) {
      await ctx.db.patch(tx._id, {
        status: "confirmed",
        txHash,
        privyTxId,
        confirmedAt: Date.now(),
      });
    }
  },
});

export const fail = internalMutation({
  args: { idempotencyKey: v.string(), errorMessage: v.string() },
  handler: async (ctx, { idempotencyKey, errorMessage }) => {
    const tx = await ctx.db
      .query("transactions")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();
    if (tx) {
      await ctx.db.patch(tx._id, { status: "failed", errorMessage });
    }
  },
});
