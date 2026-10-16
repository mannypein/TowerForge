// ============================================================
//  TowerForge Companion — Module Rarity Table
//  Display labels and max levels per module rarity code.
//  Shared by the Modules tab and the module share card.
// ============================================================

import type { ModuleRarity } from '../types/gameTypes';

// Max module level per rarity (wiki): Ancestral 200, +20 per star up to 300.
// A real card confirms Ancestral (no stars) = Lv 200/200, ★5 = /300.
export const MODULE_RARITY_MAX_LEVEL: Record<ModuleRarity, number> = {
    C: 20, R: 30, Rp: 40, E: 60, Ep: 80, L: 100, Lp: 120, M: 140, Mp: 160,
    A: 200, A1: 220, A2: 240, A3: 260, A4: 280, A5: 300,
};
export const moduleMaxLevel = (r: ModuleRarity): number => MODULE_RARITY_MAX_LEVEL[r] ?? 300;

const LABELS: [ModuleRarity, string][] = [
    ['E', 'Epic'], ['Ep', 'Epic+'], ['L', 'Legendary'], ['Lp', 'Legendary+'],
    ['M', 'Mythic'], ['Mp', 'Mythic+'], ['A', 'Ancestral'], ['A1', 'Ancestral I'],
    ['A2', 'Ancestral II'], ['A3', 'Ancestral III'], ['A4', 'Ancestral IV'], ['A5', 'Ancestral V'],
];
export const RARITIES: { k: ModuleRarity; label: string; maxLv: number }[] =
    LABELS.map(([k, label]) => ({ k, label, maxLv: MODULE_RARITY_MAX_LEVEL[k] }));

// Glow color for a module rarity (matches the game: Ancestral green, Mythic red,
// Legendary orange, Epic purple, Rare blue).
export function rarityColor(r: ModuleRarity | undefined): string {
    if (!r) return '#3a4a78';
    if (r.startsWith('A')) return '#00e676';
    if (r.startsWith('M')) return '#f44336';
    if (r.startsWith('L')) return '#ff9800';
    if (r.startsWith('E')) return '#e040fb';
    if (r.startsWith('R')) return '#4fc3f7';
    return '#8a9ab5';
}

export function rarityStars(r: ModuleRarity | undefined): number {
    const m = r?.match(/^A(\d)$/);
    return m ? Number(m[1]) : 0;
}
