// ============================================================
//  TowerForge Companion — Battle conditions in the model
//  Tournament battle conditions get stronger as a run goes on ("heat"):
//  each steps up at fixed waves to full strength at W1000
//  (constants/tournamentData.ts). Their strength where a run ends is what
//  decides it, so they're read at the death wave. What the model counts:
//   • Ultimate Weapon Durations −x s → Chrono Field, Golden Tower, Poison
//     Swamp and Black Hole, through the same bonus their duration
//     substats add to
//   • Boss's Ultimate +x%            → boss health, where bosses end runs
//   • Skip Reduction - Multiply ×x   → Enemy Health Level Skip chance
//   • Skip Decay 1% every N waves    → the skip chance, averaged over the run
//  The last two are fixed for the league and in every tournament.
//  Battle-condition labs weaken them: BC Reduction 2% a level for all,
//  each condition's own lab 1% a level, added (TheTowerSDK
//  getTotalBcModifierFraction).
//  Pure functions — no store imports.
// ============================================================

import type { LabData, ModBonuses, UWAbbr } from '../types/gameTypes';
import { HEAT_CONDITIONS, HEAT_WAVES } from '../constants/tournamentData';
import type { HeatCondition, HeatKey, HeatRamp, LeagueHeat } from '../constants/tournamentData';

export interface TourneyConditions {
    uwDurationSec?: number;     // seconds off CF, GT, PS and BH
    bossHealthPct?: number;     // bosses spawn with this % more health
    skipMultiply?: number;      // skip chance × this
    skipDecayFactor?: number;   // skip chance × this, Skip Decay averaged over the run
}

const DURATION_UWS: UWAbbr[] = ['CF', 'GT', 'PS', 'BH'];

// The heat step a wave is in.
export function heatStep(wave: number): number {
    let i = 0;
    while (i + 1 < HEAT_WAVES.length && wave >= HEAT_WAVES[i + 1]) i++;
    return i;
}

// A condition's value at a wave, before labs.
export function heatValue(c: HeatCondition, ramp: HeatRamp, wave: number): number {
    const values = ramp === 'gentle' && c.gentle ? c.gentle : c.steep;
    return values[heatStep(wave)];
}

// How much the battle-condition labs weaken a condition (0–1).
export function bcLabCut(labs: LabData, lab?: string): number {
    const global = 0.02 * Math.min(10, labs['BC Reduction'] ?? 0);
    const own = lab ? 0.01 * (labs[lab] ?? 0) : 0;
    return Math.min(1, global + own);
}

// Skip Decay takes 1% (less the labs' cut) of the chance off every `every`
// waves, so by wave w the chance is ×(1 − pct·⌊w/every⌋). Health levels
// skipped are the sum over the run, so this is that factor averaged over a
// run to `wave`. TheTowerSDK applies it as a multiplier (applySkipDecay);
// whether the game takes points off instead isn't confirmed.
export function skipDecayFactor(pct: number, every: number, wave: number): number {
    if (pct <= 0 || every <= 0 || wave <= 0) return 1;
    let sum = 0;
    for (let w = 1; w <= wave; w++) sum += Math.max(0, 1 - (pct / 100) * Math.floor(w / every));
    return sum / wave;
}

// The league's fixed conditions (in every tournament), for runs to `wave`.
export function leagueConditions(heat: LeagueHeat, wave: number, labs: LabData): TourneyConditions {
    const cut = bcLabCut(labs);
    const out: TourneyConditions = {};
    if (heat.skipMultiply < 1) out.skipMultiply = cut > 0 ? 1 - (1 - heat.skipMultiply) * (1 - cut) : heat.skipMultiply;
    if (heat.skipDecayEvery) out.skipDecayFactor = skipDecayFactor(1 - cut, heat.skipDecayEvery, wave);
    return out;
}

// The counted random conditions in `active`, at their strength at `wave`.
export function heatConditions(
    heat: LeagueHeat, active: Partial<Record<HeatKey, boolean>>, wave: number, labs: LabData,
): TourneyConditions {
    const out: TourneyConditions = {};
    if (!heat.ramp) return out;
    const at = (key: HeatKey) => {
        const c = HEAT_CONDITIONS.find(x => x.key === key)!;
        return heatValue(c, heat.ramp!, wave) * (1 - bcLabCut(labs, c.lab));
    };
    if (active.uwDurations) out.uwDurationSec = at('uwDurations');
    if (active.bossUltimate) out.bossHealthPct = at('bossUltimate');
    return out;
}

// Module and perk bonuses with the conditions in them.
export function withConditions(mb: ModBonuses, c: TourneyConditions | undefined): ModBonuses {
    if (!c?.uwDurationSec) return mb;
    const uwBonus = { ...mb.uwBonus };
    for (const a of DURATION_UWS) uwBonus[a] = { ...uwBonus[a], dur: (uwBonus[a]?.dur ?? 0) - c.uwDurationSec };
    return { ...mb, uwBonus };
}

// A snapshot scored under its conditions.
export function conditioned<T extends { modBonuses: ModBonuses; conditions?: TourneyConditions }>(snap: T): T {
    return snap.conditions ? { ...snap, modBonuses: withConditions(snap.modBonuses, snap.conditions) } : snap;
}

// Enemy Health Level Skip chance (points) under the conditions: × Skip
// Reduction, then × Skip Decay (TheTowerSDK's order).
export function conditionedSkip(chance: number, c: TourneyConditions | undefined): number {
    if (!c) return chance;
    return Math.max(0, chance * (c.skipMultiply ?? 1) * (c.skipDecayFactor ?? 1));
}

// Health multiplier on an enemy type from the conditions.
export function conditionHealth(type: string, c: TourneyConditions | undefined): number {
    return type === 'Boss' && c?.bossHealthPct ? 1 + c.bossHealthPct / 100 : 1;
}
