// ============================================================
//  TowerForge Companion — Guardian
//  Which chips the Guardian runs for a preset, and what the counted
//  ones do in the models (constants/guardianData.ts for the chips).
//   • Scout: while active, enemies count as Range Bonus × farther away
//     for Damage/Meter, which adds DPM × distance to tower damage
//     (wiki: Damage × DPM% × range) — so it scales tower shots.
//   • Bounty: tagged non-Common enemies pay × Multiplier coins.
//   • Summon: 2 extra enemies a second while active — more kills, more
//     kill coins. Its Cash Bonus is in-run cash (AFK: not counted).
//   • Fetch: finds per second = find chance × (1 + double find) ÷
//     cooldown; its loot (coins, gems, medals, shards, modules) scales
//     with that.
//   • Attack: every cooldown, hits Targets enemies (the most hurt) for
//     Percentage of the health they've lost (half on bosses). Its damage
//     in a run scales with Percentage × Targets ÷ Cooldown, and with the
//     health its targets have lost — which the rest of the tower's damage
//     takes off (edps.ts).
//   • Ally heals past Max Recovery — not counted (see docs/coverage.md).
//  The code's assumptions, flagged where used: tower shots land at half
//  the range on average; every summoned or tagged enemy pays an
//  average kill; about 80% of kills are non-Common (T18 W6000 spawn mix).
//  Pure functions — no store imports.
// ============================================================

import type { GuardianData, GuardianPreset } from '../types/gameTypes';
import { CHIPS } from '../constants/guardianData';
import type { ChipDef, ChipId } from '../constants/guardianData';

export const NON_COMMON_SHARE = 0.8;
const SUMMON_PER_SEC = 2;

export function defaultGuardianData(): GuardianData {
    return {
        unlocked: false,
        chipsOwned: CHIPS.map(c => c.id === 'attack' || c.id === 'ally'),
        skinsOwned: 1,
        presets: [{ name: 'Preset 1', extraSlots: 0, chips: [-1, -1, -1], levels: Array(CHIPS.length * 3).fill(0) }],
        presetFor: [0, 0, 0, 0, 0],
    };
}

// The Guardian preset a site preset uses; null when there's no Guardian.
export function guardianPreset(g: GuardianData | undefined, presetIdx: number): GuardianPreset | null {
    if (!g?.unlocked || g.presets.length === 0) return null;
    const i = g.presetFor[presetIdx] ?? 0;
    return g.presets[Math.min(Math.max(0, i), g.presets.length - 1)] ?? null;
}

export interface ActiveChip {
    chip: ChipDef;
    slot: number;
    levels: [number, number, number];
    values: [number, number, number];
}

const levelsOf = (p: GuardianPreset, chip: ChipDef): [number, number, number] =>
    [0, 1, 2].map(k => Math.min(chip.stats[k].max, Math.max(0, p.levels[chip.index * 3 + k] ?? 0))) as [number, number, number];

// Equipped chips in the slots the preset has (1 + extra), released and owned.
export function activeChips(g: GuardianData | undefined, presetIdx: number): ActiveChip[] {
    const p = guardianPreset(g, presetIdx);
    if (!p || !g) return [];
    const out: ActiveChip[] = [];
    const slots = 1 + Math.min(2, Math.max(0, p.extraSlots));
    for (let slot = 0; slot < slots; slot++) {
        const chip = CHIPS.find(c => c.index === p.chips[slot]);
        if (!chip?.released || !g.chipsOwned[chip.index] || out.some(a => a.chip.id === chip.id)) continue;
        const levels = levelsOf(p, chip);
        out.push({ chip, slot, levels, values: [0, 1, 2].map(k => chip.stats[k].value(levels[k])) as [number, number, number] });
    }
    return out;
}

export const findChip = (g: GuardianData | undefined, presetIdx: number, id: ChipId) =>
    activeChips(g, presetIdx).find(a => a.chip.id === id) ?? null;

// Share of time a chip is active: duration ÷ cooldown, at most all of it.
const uptime = (duration: number, cooldown: number) => (cooldown > 0 ? Math.min(1, duration / cooldown) : 0);

// Damage/Meter's factor on tower shots: 1 + DPM × average hit distance,
// the distance × Range Bonus while Scout is active. The code's assumption:
// shots land at half the range on average.
export function damageMeterFactor(g: GuardianData | undefined, presetIdx: number, dpm: number, range: number): number {
    const distance = Math.max(0, range) / 2;
    const scout = findChip(g, presetIdx, 'scout');
    const boost = scout ? 1 + uptime(scout.values[2], scout.values[0]) * (scout.values[1] - 1) : 1;
    return 1 + Math.max(0, dpm) * distance * boost;
}

// Attack's rate: share of lost health dealt per second, over all its
// targets — Percentage × Targets ÷ Cooldown (0 without Attack).
export function attackRate(g: GuardianData | undefined, presetIdx: number): number {
    const a = findChip(g, presetIdx, 'attack');
    if (!a || a.values[1] <= 0) return 0;
    return ((a.values[0] / 100) * a.values[2]) / a.values[1];
}

// Extra kill coins from Bounty: the share of kills it tags × (Multiplier − 1).
// Tags Targets enemies per cooldown, from non-Common ones only.
export function bountyExtra(g: GuardianData | undefined, presetIdx: number, killsPerSec: number): number {
    const b = findChip(g, presetIdx, 'bounty');
    if (!b || killsPerSec <= 0) return 0;
    const tagged = Math.min(NON_COMMON_SHARE, b.values[2] / b.values[1] / killsPerSec);
    return tagged * (b.values[0] - 1);
}

// Extra kills from Summon, as a share of the run's kills.
export function summonExtra(g: GuardianData | undefined, presetIdx: number, killsPerSec: number): number {
    const s = findChip(g, presetIdx, 'summon');
    if (!s || killsPerSec <= 0) return 0;
    return (SUMMON_PER_SEC * s.values[1]) / s.values[0] / killsPerSec;
}

// Fetch finds per second (0 without Fetch).
export function fetchRate(g: GuardianData | undefined, presetIdx: number): number {
    const f = findChip(g, presetIdx, 'fetch');
    if (!f) return 0;
    return ((f.values[1] / 100) * (1 + f.values[2] / 100)) / f.values[0];
}

// The Guardian with one chip stat at a new level, in the Guardian preset
// the site preset uses.
export function withChipLevel(g: GuardianData, presetIdx: number, chipIndex: number, stat: number, level: number): GuardianData {
    const pi = Math.min(Math.max(0, g.presetFor[presetIdx] ?? 0), g.presets.length - 1);
    const chip = CHIPS.find(c => c.index === chipIndex);
    if (pi < 0 || !chip) return g;
    const presets = g.presets.map((p, i) => {
        if (i !== pi) return p;
        const levels = [...p.levels];
        levels[chipIndex * 3 + stat] = Math.min(chip.stats[stat].max, Math.max(0, Math.round(level)));
        return { ...p, levels };
    });
    return { ...g, presets };
}
