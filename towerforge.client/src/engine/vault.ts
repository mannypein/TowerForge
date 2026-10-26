// ============================================================
//  TowerForge Companion — Vault keys
//  What a player's Vault cost and what's left, from the upgrade
//  levels and unlocked sections (constants/vaultData.ts; levels by
//  the game's vault id, unlocks under "g<group>", as imported).
//  A section counts as unlocked when the file says so, when it's open
//  from the start, or when anything in it is bought (it can't be
//  otherwise in game, and a hand-entered level shouldn't need both).
// ============================================================

import { VAULT_SECTIONS, vaultGroupKey } from '../constants/vaultData';
import type { VaultSection, VaultTree, VaultUpgrade } from '../constants/vaultData';

export type VaultLevels = Record<string, number> | undefined;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export const vaultLevel = (levels: VaultLevels, u: VaultUpgrade): number =>
    Math.max(0, Math.min(u.costs.length, Math.floor(levels?.[String(u.id)] ?? 0)));

// The Enemy tab lists three enemies per section; a section unlocks once.
function groupSections(group: number): VaultSection[] {
    return VAULT_SECTIONS.filter(s => s.group === group);
}

export function sectionUnlocked(levels: VaultLevels, section: VaultSection): boolean {
    if (section.unlock === 0 || (levels?.[vaultGroupKey(section.group)] ?? 0) > 0) return true;
    return groupSections(section.group).some(s => s.upgrades.some(u => vaultLevel(levels, u) > 0));
}

const GROUPS = [...new Set(VAULT_SECTIONS.map(s => s.group))];
const firstOf = (group: number) => VAULT_SECTIONS.find(s => s.group === group)!;

export interface VaultKeys {
    spent: number;      // keys spent on what's unlocked and bought
    toMax: number;      // keys still to spend for everything
}

// Keys for one tree, or the whole Vault.
export function vaultKeys(levels: VaultLevels, tree?: VaultTree): VaultKeys {
    let spent = 0, toMax = 0;
    for (const group of GROUPS) {
        const section = firstOf(group);
        if (tree && section.tree !== tree) continue;
        if (sectionUnlocked(levels, section)) spent += section.unlock;
        else toMax += section.unlock;
        for (const u of groupSections(group).flatMap(s => s.upgrades)) {
            const lv = vaultLevel(levels, u);
            spent += sum(u.costs.slice(0, lv));
            toMax += sum(u.costs.slice(lv));
        }
    }
    return { spent, toMax };
}

// The Vault's Additional Card Slot (id 1200): the export's SlotsUnlocked
// counts only the slots bought with gems.
export const vaultCardSlots = (levels: VaultLevels): number =>
    vaultLevel(levels, VAULT_SECTIONS.flatMap(s => s.upgrades).find(u => u.id === 1200)!);
