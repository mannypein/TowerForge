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

import type { AssistData, AssistEntry, LabData, ModuleType } from '../types/gameTypes';

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

// The Assist lab a lab name is, if any ("Assist-Generator Mult").
const ASSIST_LAB = /^Assist-(Cannon|Armor|Generator|Core) (Mult|Substat)$/;
export function assistLabOf(lab: string): { type: ModuleType; kind: AssistKind } | null {
    const m = ASSIST_LAB.exec(lab);
    return m ? { type: m[1].toLowerCase() as ModuleType, kind: m[2] === 'Mult' ? 'multEff' : 'subEff' } : null;
}

// The slots' efficiencies after an Assist lab goes from `from` to `to`
// levels. Each efficiency is kept as its total %, the lab's levels in it,
// so a lab level has to move the total too: until 2026-11-16 it didn't,
// and the Optimizer saw no gain from any Assist lab (a player asked why
// Assist Module Bonus - Generator was never offered for coins). A locked
// slot has no efficiency to move. Same object back when nothing changes.
export function assistWithLab(assistData: AssistData, lab: string, from: number, to: number): AssistData {
    const which = assistLabOf(lab);
    const entry = which ? assistData[which.type] : undefined;
    if (!which || !entry || entry.rarity === 'locked' || to === from) return assistData;
    const cap = which.kind === 'multEff' ? 130 : 100;
    const total = Math.min(cap, Math.max(0, (entry[which.kind] ?? 0) + to - from));
    return { ...assistData, [which.type]: { ...entry, [which.kind]: total } };
}

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
