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
//
//  Nothing acts alone, so the result also lists every link that moved on
//  the way (`chain`): range, slows and Chrono Loop → time each enemy spends
//  in range → each damage source per enemy (with its share of your damage)
//  → push → waves → coins per run and per hour, alongside the coin bonuses
//  an upgrade changes directly.
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
import { killerMix, pathRunGains, wavesSpread } from './runLength';
import { calcTTTDisplayStats } from './ttt';
import { buildDamageContext } from './uwdps';
import { buildEdpsCalibration, edpsParts, edpsSurvivalScore } from './edps';
import { buildFarmCalibration, coinFactors, FARM_EFFECTS, FARM_EFFECT_LABELS } from './farming';
import { healthLabCut } from './enemyStats';
import type { EnemyType } from './enemyStats';
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

// One link in the chain: a quantity before and after. `kind` says how to
// show it; `share` is that damage source's share of the run's damage.
export interface ChainLink {
    group: 'Enemies in range' | 'Tower' | 'Damage to each enemy' | 'Level skip' | 'Coin bonuses';
    label: string;
    before: number;
    after: number;
    kind: 'seconds' | 'meters' | 'percent' | 'times' | 'perSecond' | 'count' | 'points';
    share?: number;
    waves?: number;     // this link's part of the waves gained (damage sources, skip, enemy health labs)
}

// What the push gain is made of, to split the waves between the links:
// waves ∝ log of each part (flat damage, level skip, killers' health labs).
interface WaveSplit {
    waves: number;
    damage: number;     // flat damage ratio
    skipLog: number;    // skip points × skipWorth
    killerLog: number;  // log of the killers' health-lab factor
}

export interface WhatIfResult {
    damagePct: number;                 // all damage (calibrated eDPS when the report has damage by source)
    pushPct: number;                   // flat damage + skip as damage (what moves a Glass Cannon death wave)
    skipPoints: number;                // Enemy Health Level Skip points added
    waves: { from: number; to: number } | null;
    coinsHourPct: number;              // coin income at the same wave (coin bonuses only)
    coinsRun: { from: number; to: number } | null;
    coinsHour: { from: number; to: number } | null;   // playing each run to its end
    survivalPct: number | null;        // eHP (not Glass Cannon)
    chain: ChainLink[];
    perChange: { kind: ChangeKind; key: string; waves: number }[];   // each change on its own (GC)
    // Run to run: the waves gained from each recent death on its own, and
    // the waves those runs ended on.
    spread: { min: number; max: number; endedMin: number; endedMax: number; runs: number } | null;
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
        blend: b.blend, skipWorth: b.skipWorth, killers: b.killers };
    return ratioPct(goalScore(a), goalScore(b));
}

// Everything between a change and its result, for both snapshots; links
// that didn't move are left out.
function buildChain(
    base: OptimizerSnapshot, after: OptimizerSnapshot, build: BuildType,
    report: BattleReport | null, models: GoalModels, split: WaveSplit | null,
): ChainLink[] {
    // A part's share of the waves, by its log against the whole gain's.
    const totalLog = split ? Math.log(split.damage) + split.skipLog + split.killerLog : 0;
    const wavesOf = (log: number) => (split && Math.abs(totalLog) > 1e-12 ? (split.waves * log) / totalLog : undefined);
    const links: ChainLink[] = [];
    const add = (l: ChainLink) => {
        const moved = l.kind === 'points' || l.kind === 'count'
            ? Math.abs(l.after - l.before) > 1e-6
            : l.before !== 0 ? Math.abs(l.after / l.before - 1) > 1e-5 : l.after !== 0;
        if (moved) links.push(l);
    };
    const tt = (s: OptimizerSnapshot) => calcTTTDisplayStats(s.presetIdx, s.wsData, s.labData, s.cardData, s.uwData, s.modBonuses);
    const [t0, t1] = [tt(base), tt(after)];
    add({ group: 'Enemies in range', label: 'Tower range', before: t0.range, after: t1.range, kind: 'meters' });
    add({ group: 'Enemies in range', label: 'Chrono Field uptime', before: t0.cfUptime * 100, after: t1.cfUptime * 100, kind: 'percent' });
    add({ group: 'Enemies in range', label: 'Slow (Chrono Field + Slow Aura)', before: t0.cappedSlowPct, after: t1.cappedSlowPct, kind: 'percent' });
    add({ group: 'Enemies in range', label: 'Chrono Loop (CF+) extra path', before: t0.cfPathMult, after: t1.cfPathMult, kind: 'times' });
    add({ group: 'Enemies in range', label: 'Time each enemy is in range', before: t0.ttt, after: t1.ttt, kind: 'seconds' });

    const ctx = (s: OptimizerSnapshot) => buildDamageContext(s.presetIdx, s.wsData, s.labData, s.cardData, s.relicData,
        s.enhData, s.modBonuses, s.moduleState, s.botData);
    const [c0, c1] = [ctx(base), ctx(after)];
    add({ group: 'Tower', label: 'Tower damage', before: 1, after: c1.towerDamage / c0.towerDamage, kind: 'times' });
    add({ group: 'Tower', label: 'Attacks per second', before: c0.attackSpeed, after: c1.attackSpeed, kind: 'perSecond' });
    add({ group: 'Tower', label: 'Crit multiplier (average)', before: c0.critMult, after: c1.critMult, kind: 'times' });
    add({ group: 'Tower', label: 'Projectiles per attack (Multishot)', before: c0.projectiles.multishot, after: c1.projectiles.multishot, kind: 'times' });
    add({ group: 'Tower', label: 'Hits per projectile (Bounce Shot)', before: c0.projectiles.bounce, after: c1.projectiles.bounce, kind: 'times' });
    add({ group: 'Tower', label: 'Fire rate from Rapid Fire', before: c0.projectiles.rapid, after: c1.projectiles.rapid, kind: 'times' });
    add({ group: 'Tower', label: 'Enemy hits per second', before: c0.hitRate, after: c1.hitRate, kind: 'perSecond' });

    // Damage to each enemy on its way in, by source, with its share of your damage.
    const calib = buildEdpsCalibration(base, report);
    if (calib) {
        const [p0, p1] = [edpsParts(base), edpsParts(after)];
        const time = p0.ttt > 0 ? p1.ttt / p0.ttt : 1;
        const rel = (a: number, b: number, t = 1) => (b > 0 ? (a / b) * t : 1);
        const src: [string, number, number][] = [
            ['Chain Lightning', rel(p1.cl, p0.cl, time), calib.shares.cl],
            ['Smart Missiles', rel(p1.sm, p0.sm), calib.shares.sm],
            ['Death Wave', rel(p1.dw, p0.dw), calib.shares.dw],
            ['Inner Land Mines', rel(p1.ilm, p0.ilm), calib.shares.ilm],
            ['Poison Swamp', rel(p1.ps, p0.ps), calib.shares.ps],
            ['Tower shots', rel(p1.tower, p0.tower, time), calib.shares.tower],
            ['Black Hole reach', rel(p1.bh, p0.bh), calib.shares.bh],
        ];
        // Flat sources split the flat-damage part of the waves by what each added.
        const flat = calib.shares.cl + calib.shares.sm + calib.shares.dw + calib.shares.ilm + calib.shares.ps
            + calib.shares.tower;
        const flatWaves = wavesOf(split ? Math.log(split.damage) : 0);
        const added = split ? split.damage - 1 : 0;
        for (const [label, ratio, share] of src) {
            const own = label === 'Black Hole reach' || flat <= 0 ? 0 : (share * (ratio - 1)) / flat;
            add({
                group: 'Damage to each enemy', label, before: 1, after: ratio, kind: 'times', share,
                waves: flatWaves !== undefined && Math.abs(added) > 1e-12 && label !== 'Black Hole reach'
                    ? (flatWaves * own) / added : undefined,
            });
        }
        const procs = (p: typeof p0) => p.clChance * p.clChance * p.clQty * p.shotRate * p.ttt;
        const procs0 = calib.smiteProcs;
        if (p0.smite > 0 || p1.smite > 0) {     // Smite needs CL+
            add({ group: 'Damage to each enemy', label: 'Smite procs per enemy', before: procs0,
                after: Math.min(100, procs0 * rel(procs(p1), procs(p0))), kind: 'count' });
        }
        add({ group: 'Damage to each enemy', label: 'Smite (share of health per proc)', before: p0.smite * 100, after: p1.smite * 100, kind: 'percent' });
        add({ group: 'Damage to each enemy', label: 'Consume (share of health)', before: p0.consume * 100, after: p1.consume * 100, kind: 'percent' });
    }

    add({ group: 'Level skip', label: 'Enemy Health Level Skip', before: skipOf(base), after: skipOf(after), kind: 'points',
        waves: wavesOf(split?.skipLog ?? 0) });
    if (build === 'Glass Cannon' && models.run) {
        const killers = Object.entries(killerMix(models.run)) as [EnemyType, number][];
        for (const [type, share] of killers) {
            const [cut0, cut1] = [healthLabCut(base.labData, type), healthLabCut(after.labData, type)];
            add({ group: 'Level skip', label: `${type} health (lab)`, before: cut0 * 100, after: cut1 * 100,
                kind: 'percent', share, waves: wavesOf(share * Math.log(cut0 / cut1)) });
        }
    }

    const farm = buildFarmCalibration(base, report);
    const [f0, f1] = [coinFactors(base, farm), coinFactors(after, farm)];
    add({ group: 'Coin bonuses', label: 'Always-on coin multiplier', before: 1, after: f1.base / f0.base, kind: 'times' });
    for (const e of FARM_EFFECTS) {
        add({ group: 'Coin bonuses', label: `${FARM_EFFECT_LABELS[e]} coin bonus (average)`, before: f0[e], after: f1[e], kind: 'times' });
    }
    return links;
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
    let coinsHour: WhatIfResult['coinsHour'] = null;
    let split: WaveSplit | null = null;
    let spread: WhatIfResult['spread'] = null;
    const perChange: WhatIfResult['perChange'] = [];
    if (gc && models.run) {
        const run = models.run;
        const wavesFor = (gain: number, skip: number) =>
            pathRunGains(run, [gain], undefined, [Math.max(0, skip)], models.worth)[0].waves;
        const gained = wavesFor(pushPct, skipPoints);
        const from = run.typicalWave;
        const to = from + Math.round(gained);
        waves = { from, to };
        for (const c of changes) {
            const one = JSON.parse(JSON.stringify(base)) as OptimizerSnapshot;
            applyChange(one, c);
            one.modBonuses = readActiveModuleBonuses(one.moduleState, one.perkData, one.labData, one.cardData, one.modBonuses.run);
            perChange.push({ kind: c.kind, key: c.key, waves: wavesFor(goalPct(base, one, 'waves', build, report, models), skipOf(one) - skipOf(base)) });
        }
        const s = wavesSpread(run, pushPct, skipPoints, models.worth);
        spread = {
            min: Math.min(...s.moves), max: Math.max(...s.moves),
            endedMin: Math.min(...s.ended), endedMax: Math.max(...s.ended), runs: s.ended.length,
        };
        const calib = buildEdpsCalibration(base, report);
        if (calib) {
            const killers = Object.entries(killerMix(run)) as [EnemyType, number][];
            split = {
                waves: gained,
                damage: edpsSurvivalScore(after, calib) / edpsSurvivalScore(base, calib),
                skipLog: models.worth * skipPoints,
                killerLog: killers.reduce((sum, [type, share]) =>
                    sum + share * Math.log(healthLabCut(base.labData, type) / healthLabCut(after.labData, type)), 0),
            };
        }
        // A longer run: coins for the extra waves, at the new coin bonuses;
        // per hour, the later waves pay more than the early ones.
        if (models.projectAt) {
            const [p0, p1] = [models.projectAt(from), models.projectAt(to)];
            const bonus = 1 + coinsHourPct / 100;
            coinsRun = { from: p0.coins, to: p1.coins * bonus };
            coinsHour = { from: p0.coinsPerHour, to: p1.coinsPerHour * bonus };
        }
    }
    return {
        damagePct, pushPct, skipPoints, waves, coinsHourPct, coinsRun, coinsHour,
        survivalPct: gc ? null : goalPct(base, after, 'survival', build, report, models),
        chain: buildChain(base, after, build, report, models, split),
        perChange, spread,
        costs,
    };
}
