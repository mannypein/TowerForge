// ============================================================
//  TowerForge Companion — Assist module slots
//  What an assist slot's stone upgrades are and what they cost, from the
//  confirmed rules (docs/optimizer.md, Stone rules): the slot unlocks
//  for 1,000 stones (Epic), then the unique-effect tier Legendary 1,000,
//  Mythic 1,200, Ancestral 1,400. Efficiency starts at 1% and the k-th
//  stone level (k from 0) costs 15 + 3k: Main effect to 100% (99 levels,
//  16,038 stones), Substats to 70% (69 levels, 8,073). Each type's Assist
//  lab adds up to 30% on top, no stones (Main 130%, Substats 100%).
//  The site keeps each efficiency as its total %; the stone part is the
//  total − 1% − the lab's levels.
//  Pure functions — no store imports.
// ============================================================

import type { AssistEntry, LabData, ModuleType } from '../types/gameTypes';

export type AssistTier = AssistEntry['rarity'];
export type AssistKind = 'multEff' | 'subEff';

export const ASSIST_TIERS: AssistTier[] = ['locked', 'Epic', 'Legendary', 'Mythic', 'Ancestral'];
export const ASSIST_TIER_COST: Record<Exclude<AssistTier, 'locked'>, number> = {
    Epic: 1000, Legendary: 1000, Mythic: 1200, Ancestral: 1400,
};
export const ASSIST_STONE_LEVELS: Record<AssistKind, number> = { multEff: 99, subEff: 69 };
export const ASSIST_LAB_MAX = 30;

// The next stone level after `bought` levels.
export const assistLevelCost = (bought: number) => 15 + 3 * Math.max(0, bought);

// Stones from `bought` levels to `to`.
export function assistStonesTo(bought: number, to: number): number {
    let sum = 0;
    for (let k = Math.max(0, bought); k < to; k++) sum += assistLevelCost(k);
    return sum;
}

export const assistLabName = (type: ModuleType, kind: AssistKind) =>
    `Assist-${type.charAt(0).toUpperCase() + type.slice(1)} ${kind === 'multEff' ? 'Mult' : 'Substat'}`;

export interface AssistPart {
    total: number;      // the efficiency %
    stones: number;     // stone levels bought
    maxStones: number;
    lab: number;        // the Assist lab's levels
    next: number | null;   // stones for the next +1% (null: stones maxed)
    toMax: number;      // stones to finish the stone levels
}

export function assistPart(type: ModuleType, kind: AssistKind, total: number, labs: LabData): AssistPart {
    const lab = Math.max(0, Math.min(ASSIST_LAB_MAX, labs[assistLabName(type, kind)] ?? 0));
    const maxStones = ASSIST_STONE_LEVELS[kind];
    const stones = Math.max(0, Math.min(maxStones, Math.round(total) - 1 - lab));
    return {
        total, stones, maxStones, lab,
        next: stones < maxStones ? assistLevelCost(stones) : null,
        toMax: assistStonesTo(stones, maxStones),
    };
}

// The next unique-effect tier and its stones (null: Ancestral).
export function nextAssistTier(tier: AssistTier): { tier: Exclude<AssistTier, 'locked'>; cost: number } | null {
    const next = ASSIST_TIERS[ASSIST_TIERS.indexOf(tier) + 1] as Exclude<AssistTier, 'locked'> | undefined;
    return next ? { tier: next, cost: ASSIST_TIER_COST[next] } : null;
}
