import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// Note: Full Privy integration requires actual API keys
// This is a placeholder that simulates payment verification

export const verifyEntryFee = internalAction({
  args: {
    agentId: v.id("agents"),
    txHash: v.string(),
  },
  handler: async (ctx, { agentId, txHash }) => {
    const agent = await ctx.runQuery(internal.agents.get, { id: agentId });
    if (!agent) return;

    const season = await ctx.runQuery(internal.seasons.get, { id: agent.seasonId });
    if (!season) return;

    const idempotencyKey = `entry-${agentId}`;
    const existing = await ctx.runQuery(internal.transactions.getByIdempotencyKey, {
      idempotencyKey,
    });
    if (existing?.status === "confirmed") return;

    const verified = await verifySolanaTransfer({
      txHash,
      amount: season.entryFee,
      treasuryAddress: season.treasuryAddress,
    });

    if (!verified) {
      if (!existing) {
        await ctx.runMutation(internal.transactions.create, {
          agentId,
          seasonId: season._id,
          type: "entry_fee",
          amount: season.entryFee,
          idempotencyKey,
          txHash,
          status: "pending",
        });
      }
      return;
    }

    if (!existing) {
      await ctx.runMutation(internal.transactions.create, {
        agentId,
        seasonId: season._id,
        type: "entry_fee",
        amount: season.entryFee,
        idempotencyKey,
        txHash,
        status: "confirmed",
      });
    } else {
      await ctx.runMutation(internal.transactions.confirm, {
        idempotencyKey,
        txHash,
      });
    }

    if (agent.status !== "alive") {
      await ctx.runMutation(internal.agents.activate, { agentId });
    }

    await ctx.runMutation(internal.seasons.addToPrizePool, {
      seasonId: season._id,
      amount: season.entryFee,
    });
  },
});

async function verifySolanaTransfer({
  txHash,
  amount,
  treasuryAddress,
}: {
  txHash: string;
  amount: number;
  treasuryAddress: string;
}): Promise<boolean> {
  const stubMode = process.env.PAYMENTS_STUB_MODE === "true" || process.env.NODE_ENV !== "production";
  if (stubMode) {
    return txHash.length > 0;
  }

  void amount;
  void treasuryAddress;
  return false;
}

export const payBounty = internalAction({
  args: {
    killerId: v.id("agents"),
    victimId: v.id("agents"),
    tick: v.number(),
  },
  handler: async (ctx, { killerId, victimId, tick }) => {
    const killer = await ctx.runQuery(internal.agents.get, { id: killerId });
    const victim = await ctx.runQuery(internal.agents.get, { id: victimId });
    const season = await ctx.runQuery(internal.seasons.getActiveInternal);

    if (!killer || !season) return;

    const bountyAmount = Math.floor(season.entryFee * 0.1);
    const idempotencyKey = `bounty-${killerId}-${victimId}-${tick}`;

    const existing = await ctx.runQuery(internal.transactions.getByIdempotencyKey, {
      idempotencyKey,
    });
    if (existing) return;

    await ctx.runMutation(internal.transactions.create, {
      agentId: killerId,
      seasonId: season._id,
      type: "bounty",
      amount: bountyAmount,
      idempotencyKey,
      status: "pending",
    });

    // TODO: Implement actual Privy USDC transfer
    // For now, mark as confirmed immediately
    const txHash = `sim_${Date.now()}_${killerId}`;

    await ctx.runMutation(internal.transactions.confirm, {
      idempotencyKey,
      txHash,
    });

    await ctx.runMutation(internal.events.emit, {
      seasonId: season._id,
      tick,
      type: "bounty_paid",
      agentId: killerId,
      agentName: killer.name,
      targetId: victimId,
      targetName: victim?.name,
      data: {
        amount: bountyAmount,
        txHash,
        message: `${killer.name} received ${bountyAmount / 1000000} USDC bounty`,
      },
    });
  },
});

export const checkPendingTransactions = internalAction({
  handler: async (ctx) => {
    const pending = await ctx.runQuery(internal.transactions.getPending);

    for (const tx of pending) {
      if (tx.txHash) {
        const verified = await verifySolanaTransfer({
          txHash: tx.txHash,
          amount: tx.amount,
          treasuryAddress: "",
        });
        if (verified) {
          await ctx.runMutation(internal.transactions.confirm, {
            idempotencyKey: tx.idempotencyKey,
            txHash: tx.txHash,
          });
        }
      }
    }
  },
});
