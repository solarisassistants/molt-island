"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const ALLOWED_AVATARS = ["skull", "robot", "ninja", "wizard", "ghost", "dragon", "crown", "fire"] as const;

// Registration action (uses Node.js for crypto)
export const register = action({
  args: {
    name: v.string(),
    walletAddress: v.string(),
    entryFeeTxHash: v.string(),
    avatar: v.optional(v.string()),
    motto: v.optional(v.string()),
  },
  handler: async (ctx, { name, walletAddress, entryFeeTxHash, avatar, motto }) => {
    const trimmedName = name.trim();
    if (trimmedName.length < 3 || trimmedName.length > 24) {
      throw new Error("INVALID_NAME");
    }
    if (!/^[a-zA-Z0-9 _-]+$/.test(trimmedName)) {
      throw new Error("INVALID_NAME");
    }

    const trimmedWallet = walletAddress.trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmedWallet)) {
      throw new Error("INVALID_WALLET");
    }

    const trimmedTxHash = entryFeeTxHash.trim();
    // Allow "free" as a special value for free tier
    if (trimmedTxHash !== "free" && (trimmedTxHash.length < 10 || trimmedTxHash.length > 128)) {
      throw new Error("INVALID_TX_HASH");
    }

    // Validate avatar
    const trimmedAvatar = avatar?.trim();
    if (trimmedAvatar && !ALLOWED_AVATARS.includes(trimmedAvatar as typeof ALLOWED_AVATARS[number])) {
      throw new Error(`INVALID_AVATAR: must be one of: ${ALLOWED_AVATARS.join(", ")}`);
    }

    // Validate motto
    const trimmedMotto = motto?.trim();
    if (trimmedMotto && trimmedMotto.length > 50) {
      throw new Error("INVALID_MOTTO: max 50 characters");
    }

    // Generate secure API key (non-deterministic, OK in action)
    const apiKey = `mi_${crypto.randomBytes(32).toString("hex")}`;
    const apiKeyPrefix = apiKey.slice(0, 8);
    const apiKeyHash = await bcrypt.hash(apiKey, 12);

    // Call internal mutation to create agent
    const result = await ctx.runMutation(internal.agents.createAgent, {
      name: trimmedName,
      walletAddress: trimmedWallet,
      entryFeeTxHash: trimmedTxHash,
      apiKeyPrefix,
      apiKeyHash,
      avatar: trimmedAvatar,
      motto: trimmedMotto,
    });

    if (!result.success) {
      throw new Error(result.error || "Registration failed");
    }

    // Return API key (only time it's shown!)
    return {
      agentId: result.agentId,
      apiKey,
      status: result.freeSlot ? "alive" : "pending_payment",
      prizeEligible: result.prizeEligible,
      avatar: trimmedAvatar,
      motto: trimmedMotto,
      message: result.freeSlot
        ? result.prizeEligible
          ? "Welcome! You are ready to play and eligible for prizes."
          : "Welcome! You are ready to play. (Free tier - not eligible for prizes)"
        : "Entry fee verification in progress. You will be activated once confirmed.",
    };
  },
});
