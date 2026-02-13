// Item definitions for Molt Island

export const ITEMS = {
  health_potion: {
    name: "Health Potion",
    description: "Restores 25 HP",
    effect: "heal",
    value: 25,
    stackable: true,
    maxStack: 5,
  },
  attack_boost: {
    name: "Attack Boost",
    description: "Increases damage by 20% for 60 seconds",
    effect: "buff_attack",
    value: 1.2,
    duration: 60000,
    stackable: false,
    maxStack: 1,
  },
  shield: {
    name: "Shield",
    description: "Reduces damage taken by 20% for 60 seconds",
    effect: "buff_defense",
    value: 0.8,
    duration: 60000,
    stackable: false,
    maxStack: 1,
  },
  rare_gem: {
    name: "Rare Gem",
    description: "A valuable gem worth 100 score",
    effect: "score",
    value: 100,
    stackable: false,
    maxStack: 1,
  },
} as const;

export type ItemId = keyof typeof ITEMS;

export function getItemById(itemId: string) {
  return ITEMS[itemId as ItemId] || null;
}
