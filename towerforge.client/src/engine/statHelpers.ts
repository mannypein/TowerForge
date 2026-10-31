// ============================================================
//  TowerForge Companion — Shared stat readers
//  Small helpers used by the Farming and eHP models.
//  Pure functions — no store imports.
// ============================================================

import { CARDS, CARD_MASTERY_VALS } from '../constants/gameData';
import { labValue } from '../constants/buildStatCurves';
import type { CardData, EnhData, LabData, Loadout, ModuleRarity, ModuleState, TierWaves } from '../types/gameTypes';

// Whether a "Tier X, Wave Y" milestone (lab, card, feature unlock) is reached:
// the best wave on that tier when it's known (imported from the game, or typed
// on the Tiers tab). Completing a tier only takes wave 100 (300 from Tier 15),
// so a completed tier doesn't mean its later milestones are reached. With no
// wave recorded for the tier, a tier marked completed still counts.
export function milestoneReached(tier: number, wave: number, completedTier: number, tierWaves: TierWaves): boolean {
    if (tier <= 0) return true;
    const best = tierWaves[tier] ?? 0;
    return best > 0 ? best >= wave : completedTier >= tier;
}

// The equipped module loadout — the one every calculation reads.
export function activeLoadout(ms: ModuleState): Loadout | undefined {
    return ms.loadouts.find(l => l.id === ms.activeLoadout) ?? ms.loadouts[0];
}

// The loadout a preset uses, when the game's Global Presets say; undefined
// when they don't or the loadout has since been deleted.
export function loadoutForPreset(ms: ModuleState, preset: number): string | undefined {
    const id = ms.loadoutFor?.[preset];
    return id && ms.loadouts.some(l => l.id === id) ? id : undefined;
}

// Enhancement data as one preset sees it: that preset's own levels when it
// has them (imported from the game), else the shared levels.
export function enhForPreset(enh: EnhData, presetIdx: number): EnhData {
    return { d: enh.p?.[presetIdx] ?? enh.d, u: enh.u };
}

// Card value at a star level (0 when not owned).
export function cardValue(name: string, stars: number): number {
    const def = CARDS.find(c => c[0] === name);
    return def && stars > 0 ? def[4][Math.min(stars, 7) - 1] : 0;
}

// Stars and mastery value of a card, only if it's active in the preset.
// Mastery counts once the card is 7★ and mastery is unlocked.
export function activeCard(
    cardData: CardData,
    presetIdx: number,
    name: string,
): { stars: number; mastery: number | null } | null {
    const active = new Set(cardData.presets[presetIdx] ?? []);
    const e = cardData.data[name];
    if (!e || !e.s || !active.has(name)) return null;
    const mastery = e.s >= 7 && e.mu ? (CARD_MASTERY_VALS[name]?.[e.m ?? 0] ?? null) : null;
    return { stars: e.s, mastery };
}

// A card whose mastery "increases the card stat multiplier": the mastery
// scales the card's BONUS, not the whole multiplier. Coins card ×1.45 (+45%)
// with mastery ×1.30 → +58.5% → ×1.585 (a +9.3% coin gain, not +30%).
export function masteredCardMult(card: number, mastery: number | null): number {
    if (card <= 0) return 1;
    return 1 + (card - 1) * (mastery ?? 1);
}

// Lab value that is `neutral` until the first level is researched.
export function labMult(labData: LabData, name: string, neutral: number): number {
    const lv = labData[name] ?? 0;
    return lv > 0 ? labValue(name, lv) : neutral;
}

// Module rarity code → the rarity tier unique effects scale with.
export function uniqueTier(rarity: ModuleRarity): 'Epic' | 'Legendary' | 'Mythic' | 'Ancestral' | null {
    if (rarity === 'E' || rarity === 'Ep') return 'Epic';
    if (rarity === 'L' || rarity === 'Lp') return 'Legendary';
    if (rarity === 'M' || rarity === 'Mp') return 'Mythic';
    if (rarity.startsWith('A')) return 'Ancestral';
    return null;
}
