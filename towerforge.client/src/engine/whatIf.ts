// ============================================================
//  TowerForge Companion — What if
//  Change any levels (UWs, UW+, workshop, labs, enhancements, module
//  slots, bots) on a copy of the account and see what it does to every
//  model at once: all damage, waves reached, coins per hour, coins per
//  run and survival — and what the changes cost.
//
//  Every score is calibrated on the account as it is now (the chosen
//  Battle Report), then read on the changed copy, so "now" is always 1.
//  Waves and coins per run go through Run Length and Coins per Run.
//  Pure functions — no store imports.
// ============================================================

import { LABS, UWS, UW_PLUS_DATA, UW_PLUS_UNLOCK_COSTS, UW_STONE_COSTS, WS_ENH, WS_STATS } from '../constants/gameData';
import { BOTS_CONFIG } from '../constants/botData';
import type { BuildType, ModuleType, OptCurrency } from '../types/gameTypes';
import type { OptimizerSnapshot } from './optimizer';
import { goalScore } from './optimizer';
import { applyGoal } from './accountModels';
import type { GoalModels } from './accountModels';
import type { OptGoal } from '../constants/optimizerConfig';
import type { BattleReport } from './battleReport';
import { readActiveModuleBonuses } from './modBonuses';
import { healthSkipChance, healthSkipSources } from './levelSkip';
import { pathRunGains } from './runLength';
import {
    botMedalCost, enhancementCost, enhancementDiscount, labLevelCost, MODULE_SLOT_MAX, moduleSlotCost,
    workshopCost, workshopDiscount,
} from './upgradeCosts';

export type ChangeKind = 'uw' | 'uwp' | 'workshop' | 'lab' | 'enhancement' | 'module' | 'bot';

// Something the page can set a level on.
export interface UpgradeTarget {
    kind: ChangeKind;
    key: string;          // what applyChange reads (e.g. "CL|0", "attack|0", "cannon|main")
    group: string;        // the picker's first list
    label: string;
    current: number;
    max: number;
}

export interface Change {
    kind: ChangeKind;
    key: string;
    level: number;
}

const SECTIONS = ['attack', 'defense', 'utility'] as const;
const MODULE_TYPES: ModuleType[] = ['cannon', 'armor', 'generator', 'core'];
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

// Everything the account can change, with its level now and its max.
export function upgradeTargets(snap: OptimizerSnapshot): UpgradeTarget[] {
    const out: UpgradeTarget[] = [];
    for (const uw of UWS) {
        const d = snap.uwData.data[uw.a];
        if (!d?.own) continue;
        uw.s.forEach(([stat, max], i) => out.push({
            kind: 'uw', key: `${uw.a}|${i}`, group: 'Ultimate Weapons', label: `${uw.n} — ${stat}`,
            current: d.sv[i] ?? 1, max,
        }));
        if (UW_PLUS_DATA[uw.a]) out.push({
            kind: 'uwp', key: uw.a, group: 'UW+', label: `${uw.n}+ — ${uw.up}`,
            current: d.upOwn ? (d.upLvl ?? 0) + 1 : 0, max: uw.upMax,
        });
    }
    for (const sec of SECTIONS) {
        WS_STATS[sec].forEach(([name, max], i) => out.push({
            kind: 'workshop', key: `${sec}|${i}`, group: `Workshop — ${cap(sec)}`, label: name,
            current: snap.wsData[snap.presetIdx]?.[sec]?.[i] ?? 0, max,
        }));
    }
    for (const g of LABS) {
        for (const [name, max] of g.l) out.push({
            kind: 'lab', key: name, group: `Labs — ${g.c}`, label: name, current: snap.labData[name] ?? 0, max,
        });
    }
    for (const sec of SECTIONS) {
        WS_ENH[sec].forEach(([name, max], i) => {
            if (!snap.enhData.u?.[sec]?.[i]) return;
            out.push({
                kind: 'enhancement', key: `${sec}|${i}`, group: 'Enhancements', label: `${cap(sec)} — ${name}`,
                current: snap.enhData.d?.[sec]?.[i] ?? 0, max,
            });
        });
    }
    for (const type of MODULE_TYPES) {
        for (const pos of ['main', 'assist'] as const) out.push({
            kind: 'module', key: `${type}|${pos}`, group: 'Module slots', label: `${cap(type)} — ${cap(pos)} slot`,
            current: snap.moduleState.slotLevels?.[type]?.[pos] ?? 0, max: MODULE_SLOT_MAX,
        });
    }
    for (const bot of BOTS_CONFIG) {
        const e = snap.botData[bot.name];
        if (!e?.owned) continue;
        bot.stats.forEach((st, i) => out.push({
            kind: 'bot', key: `${bot.name}|${i}`, group: 'Bots', label: `${bot.name} — ${st.label}`,
            current: e.medals?.[i] ?? 0, max: st.values.length,
        }));
    }
    return out;
}

// Sets one level on a snapshot (in place).
export function applyChange(snap: OptimizerSnapshot, c: Change): void {
    const [a, b] = c.key.split('|');
    switch (c.kind) {
        case 'uw': {
            const d = snap.uwData.data[a as keyof typeof snap.uwData.data];
            if (d) d.sv[Number(b)] = c.level;
            break;
        }
        case 'uwp': {
            const d = snap.uwData.data[a as keyof typeof snap.uwData.data];
            if (!d) break;
            d.upOwn = c.level > 0;
            d.upLvl = Math.max(0, c.level - 1);
            break;
        }
        case 'workshop': {
            const ws = snap.wsData[snap.presetIdx];
            if (ws) ws[a as typeof SECTIONS[number]][Number(b)] = c.level;
            break;
        }
        case 'lab':
            snap.labData[c.key] = c.level;
            break;
        case 'enhancement': {
            if (!snap.enhData.d[a]) snap.enhData.d[a] = [];
            snap.enhData.d[a][Number(b)] = c.level;
            break;
        }
        case 'module': {
            const levels = snap.moduleState.slotLevels ?? ({} as NonNullable<typeof snap.moduleState.slotLevels>);
            levels[a as ModuleType] = { ...(levels[a as ModuleType] ?? { main: 0, assist: 0 }), [b]: c.level };
            snap.moduleState.slotLevels = levels;
            break;
        }
        case 'bot': {
            const e = snap.botData[a];
            if (!e) break;
            const medals = [...(e.medals ?? [])];
            medals[Number(b)] = c.level;
            snap.botData[a] = { ...e, medals };
            break;
        }
    }
}

export type Costs = Partial<Record<OptCurrency, number>>;

// What raising a level costs (lowering refunds nothing here). Unknown
// prices are left out.
export function changeCost(snap: OptimizerSnapshot, t: UpgradeTarget, level: number): Costs {
    const from = t.current;
    if (level <= from) return {};
    const [a, b] = t.key.split('|');
    switch (t.kind) {
        case 'uw': {
            // Level 1 comes with the UW; reaching level L costs costs[L − 2].
            const costs = UW_STONE_COSTS[a as keyof typeof UW_STONE_COSTS]?.[Number(b)] ?? [];
            let stones = 0;
            for (let l = from + 1; l <= level; l++) stones += costs[l - 2] ?? 0;
            return { stones };
        }
        case 'uwp': {
            const plus = UW_PLUS_DATA[a as keyof typeof UW_PLUS_DATA];
            if (!plus) return {};
            let stones = 0;
            if (from === 0) {
                const unlocked = UWS.filter(u => snap.uwData.data[u.a]?.upOwn).length;
                stones += UW_PLUS_UNLOCK_COSTS[unlocked] ?? 0;
            }
            // UW+ level n (upLvl n − 1) → n + 1 costs costs[n − 1].
            for (let n = Math.max(1, from); n < level; n++) stones += plus.costs[n - 1] ?? 0;
            return { stones };
        }
        case 'workshop': {
            const coins = workshopCost(t.label, from, level, workshopDiscount(snap.labData, a as typeof SECTIONS[number]));
            return coins === null ? {} : { coins };
        }
        case 'lab': {
            let coins = 0;
            let research = 0;
            for (let l = from + 1; l <= level; l++) {
                const lv = labLevelCost(t.key, l, snap.labData, snap.relicData);
                if (!lv) return {};
                coins += lv.coins;
                research += lv.hours;
            }
            return { coins, research };
        }
        case 'enhancement': {
            const name = WS_ENH[a]?.[Number(b)]?.[0];
            const coins = name ? enhancementCost(name, from, level, enhancementDiscount(snap.labData, a as typeof SECTIONS[number])) : null;
            return coins === null ? {} : { coins };
        }
        case 'module': {
            const { shards, coins } = moduleSlotCost(from, level, snap.labData);
            return { shards, coins };
        }
        case 'bot':
            return { medals: botMedalCost(from, level) };
    }
}

export interface WhatIfResult {
    damagePct: number;                 // all damage (calibrated eDPS when the report has damage by source)
    pushPct: number;                   // flat damage + skip as damage (what moves a Glass Cannon death wave)
    skipPoints: number;                // Enemy Health Level Skip points added
    waves: { from: number; to: number } | null;
    coinsHourPct: number;              // coins per hour at the same run length
    coinsRun: { from: number; to: number } | null;
    survivalPct: number | null;        // eHP (not Glass Cannon)
    costs: Costs;
}

const ratioPct = (after: number, before: number) => (before > 0 ? (after / before - 1) * 100 : 0);

// Score of `after` against `before` for one goal, both calibrated on `before`.
function goalPct(
    before: OptimizerSnapshot, after: OptimizerSnapshot, goal: OptGoal, build: BuildType,
    report: BattleReport | null, models: GoalModels,
): number {
    const b = JSON.parse(JSON.stringify(before)) as OptimizerSnapshot;
    applyGoal(b, goal, build, report, models);
    const a = { ...after, farm: b.farm, ehp: b.ehp, edps: b.edps, metric: b.metric, edpsMode: b.edpsMode,
        blend: b.blend, skipWorth: b.skipWorth };
    return ratioPct(goalScore(a), goalScore(b));
}

const skipOf = (s: OptimizerSnapshot) => healthSkipChance(healthSkipSources(
    s.wsData[s.presetIdx], s.labData, s.enhData, s.relicData, s.modBonuses.subs ?? {},
));

export function whatIf(
    base: OptimizerSnapshot, changes: Change[], targets: UpgradeTarget[], build: BuildType,
    report: BattleReport | null, models: GoalModels,
): WhatIfResult {
    const after = JSON.parse(JSON.stringify(base)) as OptimizerSnapshot;
    const costs: Costs = {};
    for (const c of changes) {
        const t = targets.find(x => x.kind === c.kind && x.key === c.key);
        if (t) {
            for (const [k, v] of Object.entries(changeCost(base, t, c.level)) as [OptCurrency, number][]) {
                costs[k] = (costs[k] ?? 0) + v;
            }
        }
        applyChange(after, c);
    }
    after.modBonuses = readActiveModuleBonuses(
        after.moduleState, after.perkData, after.labData, after.cardData, after.modBonuses.run,
    );

    const gc = build === 'Glass Cannon';
    const damagePct = goalPct(base, after, 'damage', build, report, models);
    const pushPct = goalPct(base, after, 'waves', build, report, models);
    const coinsHourPct = goalPct(base, after, 'coins', build, report, models);
    const skipPoints = skipOf(after) - skipOf(base);

    let waves: WhatIfResult['waves'] = null;
    let coinsRun: WhatIfResult['coinsRun'] = null;
    if (gc && models.run) {
        const [step] = pathRunGains(models.run, [pushPct], undefined, [Math.max(0, skipPoints)], models.worth);
        const from = models.run.typicalWave;
        const to = from + Math.round(step.waves);
        waves = { from, to };
        if (models.coinsAt) {
            coinsRun = { from: models.coinsAt(from), to: models.coinsAt(to) * (1 + coinsHourPct / 100) };
        }
    }
    return {
        damagePct, pushPct, skipPoints, waves, coinsHourPct, coinsRun,
        survivalPct: gc ? null : goalPct(base, after, 'survival', build, report, models),
        costs,
    };
}
