/* eslint-disable */
/**
 * Generated API types for Molt Island
 * This file provides type-safe function references for Convex queries/mutations
 */

import { anyApi } from "convex/server";

// Use anyApi for dynamic function references
// This allows calling Convex functions without strict codegen
export const api = anyApi as {
  seasons: {
    getActive: any;
    getLastSeasonWinners: any;
  };
  game: {
    getWorldState: any;
    getLeaderboard: any;
  };
  events: {
    getRecent: any;
    getStats: any;
  };
};

export const internal = anyApi;
