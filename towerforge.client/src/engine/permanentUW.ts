// ============================================================
//  TowerForge Companion — Permanent UW Engine
//  Works out what it takes to keep a UW permanently active —
//  i.e. effective Duration ≥ effective Cooldown (after Galaxy
//  Compressor) — and the cheapest stone path to get there.
//
//  Only duration-based UWs qualify (they have both a Duration and
//  a Cooldown stat): Chrono Field, Golden Tower, Poison Swamp,
//  Black Hole. CL/SM/DW/ILM fire instantly on cooldown (no active
//  duration) and Spotlight is a passive aura, so "permanent" is
//  meaningless for them — they're excluded.
//
//  Pure functions — no store imports.
// ============================================================

import { UWS, UW_STAT_VALUES, UW_STONE_COSTS } from '../constants/gameData';
import { calcGCompCDReduction } from './ttt';
import { hasUnique } from './moduleEffects';

import type {
    UWData,
    ModBonuses,
    WSPreset,
    LabData,
    CardData,
    UWAbbr,
} from '../types/gameTypes';

// ── Per-UW config ─────────────────────────────────────────────
// durIdx / cdIdx = which sv[] index holds the Duration / Cooldown stat.
// durPerkKey = perk that adds flat duration (cfExtraDur / bhExtraDur).
// durLab = lab that adds flat duration (+durLabPer seconds per level).
interface PermaCfg {
    a: UWAbbr;
    durIdx: number;
    cdIdx: number;
    durPerkKey: 'cfExtraDur' | 'bhExtraDur' | null;
    durLab: string | null;
    durLabPer: number;
    gcompApplies: boolean; // Galaxy Compressor reduces every UW's cooldown EXCEPT Poison Swamp.
}

const PERMA_UWS: PermaCfg[] = [
    { a: 'CF', durIdx: 0, cdIdx: 2, durPerkKey: 'cfExtraDur', durLab: 'CF-Duration', durLabPer: 1, gcompApplies: true },
    { a: 'GT', durIdx: 1, cdIdx: 2, durPerkKey: null,         durLab: 'GT-Duration', durLabPer: 1, gcompApplies: true },
    { a: 'PS', durIdx: 1, cdIdx: 2, durPerkKey: null,         durLab: null,          durLabPer: 0, gcompApplies: false },
    { a: 'BH', durIdx: 1, cdIdx: 2, durPerkKey: 'bhExtraDur', durLab: null,          durLabPer: 0, gcompApplies: true },
];

// Numeric value of a UW stat at a given 1-based level (suffix stripped).
function statVal(a: UWAbbr, statIdx: number, level: number): number {
    const raw = UW_STAT_VALUES[a]?.[statIdx]?.[level - 1];
    return raw ? (parseFloat(raw) || 0) : 0;
}

// Flat duration bonus from module sub-effect + perk + lab.
function durationBonus(cfg: PermaCfg, modBonuses: ModBonuses, labData: LabData): number {
    const modDur = modBonuses.uwBonus[cfg.a]?.dur ?? 0;
    const perkDur = cfg.durPerkKey ? (modBonuses.perks[cfg.durPerkKey] ?? 0) : 0;
    const labDur = cfg.durLab ? (labData[cfg.durLab] ?? 0) * cfg.durLabPer : 0;
    return modDur + perkDur + labDur;
}

function durationAt(cfg: PermaCfg, level: number, modBonuses: ModBonuses, labData: LabData): number {
    return statVal(cfg.a, cfg.durIdx, level) + durationBonus(cfg, modBonuses, labData);
}

// Effective cooldown at a Cooldown-stat level (raw − Galaxy Compressor).
function effCooldownAt(
    cfg: PermaCfg, level: number,
    modBonuses: ModBonuses, wsData: WSPreset[], labData: LabData, cardData: CardData,
): { rawCD: number; gcomp: number; effCD: number } {
    const rawCD = statVal(cfg.a, cfg.cdIdx, level) + (modBonuses.uwBonus[cfg.a]?.cd ?? 0);
    // Poison Swamp's cooldown is not reduced by Galaxy Compressor.
    const gcomp = cfg.gcompApplies
        ? calcGCompCDReduction(rawCD, modBonuses, wsData, labData, cardData)
        : 0;
    const effCD = Math.max(1, rawCD - gcomp);
    return { rawCD, gcomp, effCD };
}

// Stone cost to raise a stat from level `from` to `to`. Level 1 is free;
// reaching level L+1 from L costs costs[L-1].
function upgradeCost(a: UWAbbr, statIdx: number, from: number, to: number): number {
    if (to <= from) return 0;
    const costs = UW_STONE_COSTS[a]?.[statIdx] ?? [];
    let sum = 0;
    for (let k = from; k < to; k++) sum += costs[k - 1] ?? 0;
    return sum;
}

export interface UWPermaPlan {
    achievable: boolean;       // false = can't reach permanent even maxed out
    durFrom: number; durTo: number; durCost: number;
    cdFrom: number; cdTo: number; cdCost: number;
    totalCost: number;
    resultDuration: number; resultEffCD: number;
}

export interface UWPermaResult {
    abbr: UWAbbr;
    name: string;
    owned: boolean;
    hasGComp: boolean;
    gcompApplies: boolean;   // false for Poison Swamp
    // Current state
    duration: number;        // effective current duration (s)
    rawCD: number;           // current cooldown before GComp (s)
    gcompReduction: number;  // GComp reduction (s)
    effCD: number;           // effective cooldown after GComp (s)
    isPermanent: boolean;
    // Theoretical bounds with current bonuses (for the "impossible" case)
    maxDuration: number;
    minEffCD: number;
    plan: UWPermaPlan | null; // present only when owned & not yet permanent
}

export function calcPermanentUWs(
    uwData: UWData,
    modBonuses: ModBonuses,
    wsData: WSPreset[],
    labData: LabData,
    cardData: CardData,
): UWPermaResult[] {
    return PERMA_UWS.map(cfg => {
        const meta = UWS.find(u => u.a === cfg.a)!;
        const ud = uwData.data[cfg.a];
        const owned = ud?.own ?? false;

        const curDurLv = ud?.sv[cfg.durIdx] ?? 1;
        const curCdLv = ud?.sv[cfg.cdIdx] ?? 1;
        const maxDurLv = UW_STAT_VALUES[cfg.a][cfg.durIdx].length;
        const maxCdLv = UW_STAT_VALUES[cfg.a][cfg.cdIdx].length;

        const duration = durationAt(cfg, curDurLv, modBonuses, labData);
        const { rawCD, gcomp, effCD } = effCooldownAt(cfg, curCdLv, modBonuses, wsData, labData, cardData);
        const isPermanent = owned && duration >= effCD;

        const maxDuration = durationAt(cfg, maxDurLv, modBonuses, labData);
        const minEffCD = effCooldownAt(cfg, maxCdLv, modBonuses, wsData, labData, cardData).effCD;

        let plan: UWPermaPlan | null = null;
        if (owned && !isPermanent) {
            // Cheapest (Duration↑, Cooldown↑) pair where duration ≥ effective CD.
            // For a fixed duration level, effective CD shrinks as the cooldown
            // level rises, so the first satisfying cooldown level is the cheapest
            // for that duration — then we take the min total across duration levels.
            let best: UWPermaPlan | null = null;
            for (let d = curDurLv; d <= maxDurLv; d++) {
                const dur = durationAt(cfg, d, modBonuses, labData);
                for (let c = curCdLv; c <= maxCdLv; c++) {
                    const eff = effCooldownAt(cfg, c, modBonuses, wsData, labData, cardData).effCD;
                    if (dur >= eff) {
                        const durCost = upgradeCost(cfg.a, cfg.durIdx, curDurLv, d);
                        const cdCost = upgradeCost(cfg.a, cfg.cdIdx, curCdLv, c);
                        const totalCost = durCost + cdCost;
                        if (!best || totalCost < best.totalCost) {
                            best = {
                                achievable: true,
                                durFrom: curDurLv, durTo: d, durCost,
                                cdFrom: curCdLv, cdTo: c, cdCost,
                                totalCost, resultDuration: dur, resultEffCD: eff,
                            };
                        }
                        break;
                    }
                }
            }
            plan = best ?? {
                achievable: false,
                durFrom: curDurLv, durTo: maxDurLv, durCost: 0,
                cdFrom: curCdLv, cdTo: maxCdLv, cdCost: 0,
                totalCost: 0, resultDuration: maxDuration, resultEffCD: minEffCD,
            };
        }

        return {
            abbr: cfg.a,
            name: meta.n,
            owned,
            hasGComp: hasUnique(modBonuses, 'Galaxy Compressor'),
            gcompApplies: cfg.gcompApplies,
            duration,
            rawCD,
            gcompReduction: gcomp,
            effCD,
            isPermanent,
            maxDuration,
            minEffCD,
            plan,
        };
    });
}
