// ============================================================
//  TowerForge Companion — Ask AI: the account data it reads
//  The assistant (a small model running in the player's browser) can't
//  calculate anything itself, so every number it gives comes from here:
//  the same engine the Optimizer, What If and Tournament pages use,
//  written out as short plain text it can quote.
//   • accountSummary — always in its prompt;
//   • bestUpgrades — the Optimizer's next picks for a currency;
//   • whatIfChanges — What If for upgrades named in words ("max CL");
//   • levelsOf — current levels of upgrades named in words;
//   • tournamentOutlook — the Tournament page's estimate for this week;
//   • runsReport — the saved runs, with damage by source;
//   • tierOutlook — how far the same damage gets on another tier.
//  Pure functions — no store imports.
// ============================================================

import type { AppState, BuildType, League, OptCandidate, OptCategory, OptCurrency } from '../types/gameTypes';
import type { AccountState, GoalModels } from '../engine/accountModels';
import { applyGoal, chosenReport, runModels, snapshotFromState } from '../engine/accountModels';
import { mergeRepeats, simulateCategoryPath, simulateMedalPath, simulateStonePath } from '../engine/optimizer';
import { changeCost, upgradeTargets, whatIf } from '../engine/whatIf';
import type { Change, Costs, UpgradeTarget } from '../engine/whatIf';
import { buildTournamentModel, heatOf, newestTournament } from '../engine/tournamentModel';
import { leagueMoves, leagueStats, placed } from '../engine/tourneyHistory';
import type { Ticks } from '../engine/tournamentModel';
import { buildRunLengthModel, deathWave, killedBy } from '../engine/runLength';
import { extraDamage, runKey } from '../engine/battleReport';
import type { BattleReport } from '../engine/battleReport';
import { defaultBattleIndex } from '../engine/gameExport';
import { formatGameNumber } from '../engine/gameNumbers';
import { formatLabTime } from '../engine/upgradeCosts';
import { activeLoadout } from '../engine/statHelpers';
import { labFinishAt } from '../engine/labTimer';
import { UWS, presetLabel } from '../constants/gameData';
import { BOTS_CONFIG, botsForPreset } from '../constants/botData';
import { RARITIES, rarityStars } from '../constants/moduleRarities';
import { BUILD_GOALS, GOAL_LABELS } from '../constants/optimizerConfig';
import type { OptGoal } from '../constants/optimizerConfig';
import { HEAT_CONDITIONS } from '../constants/tournamentData';

// Everything the tools read: the account plus a few things the pages keep.
export type AiAccount = AccountState & Pick<AppState,
    'currencies' | 'labsRunning' | 'tourneyLog' | 'tierWaves' | 'botLoadouts'> & Partial<Pick<AppState, 'tourneyRecords'>>;

// The Tournament page's settings (components/common/tourneySim.ts).
export interface AiTourneySettings {
    league: League;
    week: Ticks;
    recent: Ticks;
    preset?: number;
    loadout?: string;
}

export interface ToolResult {
    title: string;     // shown under the answer ("Looked at: …")
    text: string;      // what the model reads
}

const num = (v: number) => formatGameNumber(v < 1000 ? Math.round(v) : v);
const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`;
const buildOf = (s: AiAccount) => (s.profile.build || 'Glass Cannon') as BuildType;

// ── Account summary ───────────────────────────────────────────
export function accountSummary(s: AiAccount, now = Date.now()): string {
    const p = s.profile;
    const lines: string[] = [];
    lines.push(`Build: ${p.build || 'Glass Cannon (not set on the Profile page, so TowerForge assumes it)'}. Highest tier reached: ${p.highestTier ? `T${p.highestTier}` : 'unknown'}`
        + `${p.completedTier ? ` (completed T${p.completedTier})` : ''}. League: ${p.league || 'unknown'}`
        + `${p.currentLeague && p.currentLeague !== p.league ? ` (this week: ${p.currentLeague})` : ''}.`);
    const best = Object.entries(s.tierWaves ?? {}).map(([t, w]) => [Number(t), Number(w)] as const)
        .filter(([, w]) => w > 0).sort((a, b) => b[0] - a[0]).slice(0, 4);
    if (best.length) lines.push(`Best waves: ${best.map(([t, w]) => `T${t} W${w.toLocaleString()}`).join(', ')}.`);

    const c = s.currencies;
    if (c) lines.push(`Holding: ${num(c.coins)} coins, ${c.stones.toLocaleString()} stones, ${c.gems.toLocaleString()} gems, `
        + `${c.medals.toLocaleString()} medals, ${c.bits.toLocaleString()} bits.`);

    const uws = UWS.filter(u => s.uwData.data[u.a]?.own).map(u => {
        const d = s.uwData.data[u.a]!;
        const stats = u.s.map(([name, max], i) => `${name} ${d.sv[i] ?? 1}/${max}`).join(', ');
        const plus = d.upOwn ? `; ${u.up} (UW+) ${(d.upLvl ?? 0) + 1}/${u.upMax + 1}` : '';
        return `${u.n} (${stats}${plus})`;
    });
    lines.push(uws.length ? `Ultimate Weapons: ${uws.join('; ')}.` : 'Ultimate Weapons: none owned.');

    const presetIdx = s.activePreset;
    const cards = s.cardData.presets?.[presetIdx] ?? [];
    if (cards.length) {
        lines.push(`Cards in ${presetLabel(p.presetNames, presetIdx)}: ${cards.map(n => {
            const e = s.cardData.data[n];
            return e ? `${n} ${e.s}★${e.mu ? ` (mastery ${e.m})` : ''}` : n;
        }).join(', ')}.`);
    }

    const lo = activeLoadout(s.moduleState);
    if (lo) {
        const mods = (['cannon', 'armor', 'generator', 'core'] as const).map(type => {
            const m = s.moduleState.library.find(x => x.id === lo.slots[type]?.main);
            const lv = s.moduleState.slotLevels?.[type]?.main ?? 0;
            const stars = rarityStars(m?.rarity);
            const rarity = stars ? `Ancestral ${stars}★` : RARITIES.find(r => r.k === m?.rarity)?.label ?? m?.rarity;
            return m ? `${type}: ${m.name} (${rarity}, slot Lv ${lv})` : `${type}: empty`;
        });
        lines.push(`Modules equipped: ${mods.join('; ')}.`);
    }

    const presetBots = botsForPreset(s.botData, s.activePreset);
    const bots = BOTS_CONFIG.filter(b => presetBots[b.name]?.owned).map(b => {
        const e = presetBots[b.name]!;
        const lv = b.stats.map((st, i) => `${st.label} ${e.medals?.[i] ?? 0}/${st.values.length}`).join(', ');
        return `${b.name} (${lv}${e.plusLv ? `; Bot+ ${e.plusLv}/${b.plusMax}` : ''})`;
    });
    if (bots.length) lines.push(`Bots: ${bots.join('; ')}.`);

    const running = (s.labsRunning ?? []).filter(l => l.lab);
    if (running.length) {
        lines.push(`Labs researching: ${running.map(l => {
            const lv = l.toLevel ?? (s.labData[l.lab!] ?? 0) + 1;
            const done = labFinishAt(l);
            const left = done ? Math.max(0, (done - now) / 3600000) : null;
            return `${l.lab} to Lv ${lv}${left !== null ? (left > 0 ? ` (${formatLabTime(left)} left)` : ' (done)') : ''}`;
        }).join('; ')}.`);
    }

    const runs = [...s.importedBattles].sort((a, b) => (b.time ?? 0) - (a.time ?? 0)).slice(0, 5);
    if (runs.length) {
        lines.push(`Recent runs (newest first): ${runs.map(r => {
            const by = killedBy(r);
            return `${r.tournament ? 'tournament' : `T${r.tier}`} W${r.wave.toLocaleString()}`
                + `${by ? `, killed by ${by}` : by === null ? ', ended early' : ''}`
                + `${!r.tournament && r.coinsPerHour ? `, ${num(r.coinsPerHour)} coins/h` : ''}`;
        }).join('; ')}.`);
    }
    return lines.join('\n');
}

// ── Best upgrades ─────────────────────────────────────────────
export type AiCurrency = 'any' | OptCurrency;

const CURRENCY_CATS: Record<OptCurrency, OptCategory[]> = {
    stones: ['stones'], coins: ['workshop', 'enhancements'], research: ['labs'], shards: ['modules'],
    medals: ['bots'], gems: ['cards'], bits: ['guardian'],
};
const CURRENCY_NAMES: Record<OptCurrency, string> = {
    stones: 'stones', coins: 'coins (workshop and enhancements)', research: 'lab research', shards: 'Module Shards',
    medals: 'medals (bots)', gems: 'gems (card slots)', bits: 'bits (Guardian chips)',
};
const PICKS = 6;

// What the player holds of a currency (null: not tracked, e.g. lab time).
function held(s: AiAccount, c: OptCurrency): number | null {
    const cur = s.currencies;
    if (!cur) return null;
    return { stones: cur.stones, coins: cur.coins, medals: cur.medals, gems: cur.gems, bits: cur.bits, shards: null, research: null }[c];
}

// The goal the Optimizer page uses for this build (its saved one when it fits).
export function goalFor(build: BuildType, wanted?: string): OptGoal {
    const goals = BUILD_GOALS[build] ?? [];
    return wanted && goals.includes(wanted as OptGoal) ? wanted as OptGoal : goals[0] ?? 'damage';
}

function costText(c: OptCandidate): string {
    if (c.costType === 'research') {
        return c.hours !== undefined ? `${formatLabTime(c.hours)} of research${c.coins ? `, ${num(c.coins)} coins` : ''}` : '';
    }
    if (c.costKnown === false) return '';
    const unit = { stones: 'stones', coins: 'coins', medals: 'medals', shards: 'shards', gems: 'gems', bits: 'bits', research: '' }[c.costType];
    return c.cost > 0 ? `${num(c.cost)} ${unit}` : 'free';
}

export function bestUpgrades(s: AiAccount, currency: AiCurrency, goalWanted?: string): ToolResult {
    const build = buildOf(s);
    const goal = goalFor(build, goalWanted);
    const snap = snapshotFromState(s);
    applyGoal(snap, goal, build, chosenReport(s), runModels(s));
    const wanted: OptCurrency[] = currency === 'any' ? ['stones', 'coins', 'research'] : [currency];
    const metric = { damage: 'damage', waves: 'push (damage toward waves)', coins: 'coins per hour', survival: 'survival', blend: 'coins and push' }[goal];
    const parts: string[] = [`Goal: ${GOAL_LABELS[goal]}. Each pick's gain is in ${metric}, in the order the Optimizer would buy them.`];
    let stones: OptCandidate[] | null = null;
    for (const cur of wanted) {
        let path: OptCandidate[] = [];
        // Back-to-back levels of one stat read as one row ("3% → 9%").
        if (cur === 'stones') path = mergeRepeats(stones = simulateStonePath(60, snap));
        else if (cur === 'medals') {
            stones ??= simulateStonePath(40, snap);
            path = simulateMedalPath(PICKS, snap, stones, s.currencies?.stones ?? 0, simulateCategoryPath('modules', 20, snap));
        } else {
            for (const cat of CURRENCY_CATS[cur]) path.push(...simulateCategoryPath(cat, 30, snap));
            path.sort((a, b) => b.scorePerCost - a.scorePerCost);
        }
        if (path[0]) parts.push(`Headline: the best next ${CURRENCY_NAMES[cur].split(' (')[0]} buy is ${path[0].label} ${path[0].subLabel}${costText(path[0]) ? ` for ${costText(path[0])}` : ''} (${pct(path[0].scorePct)}).`);
        const have = held(s, cur);
        const picks = path.slice(0, PICKS);
        const rows = picks.map((c, i) => {
            const cost = costText(c);
            const afford = have !== null && c.cost > 0 && c.costKnown !== false ? (c.cost <= have ? ' (you have enough now)' : ' (more than you have)') : '';
            return `${i + 1}. ${c.label} ${c.subLabel} — ${pct(c.scorePct)}${cost ? `, ${cost}` : ''}${afford}`;
        });
        parts.push(`Next ${CURRENCY_NAMES[cur]}:\n${rows.length ? rows.join('\n') : 'nothing left worth buying'}`);
        // Costs compared by the site: small models misread K, M, B, T, q, Q…
        const priced = picks.filter(c => c.cost > 0 && c.costKnown !== false);
        if (priced.length > 1) {
            const cheap = [...priced].sort((a, b) => a.cost - b.cost);
            parts.push(`Cheapest first: ${cheap.map(c => `${c.label} ${c.subLabel} (${costText(c)})`).join('; ')}.`);
        }
    }
    return { title: `Optimizer — ${wanted.map(c => CURRENCY_NAMES[c].split(' (')[0]).join(', ')}`, text: parts.join('\n') };
}

// ── Finding upgrades named in words ───────────────────────────
// Players write "CL", "chrono field duration", "damage lab", "CF+"…
const STOP = new Set(['the', 'my', 'a', 'an', 'of', 'to', 'and', 'level', 'levels', 'lvl', 'lv', 'upgrade', 'upgrades', 'stat', 'max', 'maxed', 'maxing', 'uw', 'uws']);
const ABBR: Record<string, string> = Object.fromEntries(UWS.map(u => [u.a.toLowerCase(), u.n.toLowerCase()]));
Object.assign(ABBR, { gc: 'golden combo', dr: 'death ray', ws: 'workshop', cc: 'critical chance', cf: 'chrono field', 'ehp': 'health' });

export function wordsOf(text: string): string[] {
    const out: string[] = [];
    for (const raw of text.toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9+]+/)) {
        const w = raw.replace(/\+$/, '');
        if (!w || STOP.has(w)) continue;
        if (raw.endsWith('+')) out.push('+');
        out.push(...(ABBR[w] ?? w).split(' '));
    }
    return out;
}

const KIND_WORDS: Record<UpgradeTarget['kind'], string> = {
    uw: 'ultimate weapon', uwp: 'ultimate weapon plus +', workshop: 'workshop', lab: 'lab labs research',
    enhancement: 'enhancement enhancements', module: 'module modules slot', bot: 'bot bots', guardian: 'guardian chip chips',
};

// Upgrades matching the words best. "CL" alone means every Chain Lightning
// stat; a UW+ needs a "+" or "plus" (or its own name, e.g. Smite).
export function findTargets(targets: UpgradeTarget[], query: string): UpgradeTarget[] {
    // Only words some upgrade has count ("how many waves would maxing CL get
    // me" is about CL).
    const vocab = new Set(targets.flatMap(t => wordsOf(`${t.label} ${t.group} ${KIND_WORDS[t.kind]}`)));
    const q = wordsOf(query).filter(w => vocab.has(w));
    if (!q.length) return [];
    const scored = targets.map(t => {
        const words = new Set(wordsOf(`${t.label} ${t.group} ${KIND_WORDS[t.kind]}`));
        const name = new Set(wordsOf(t.label));
        let hit = 0;
        for (const w of q) if (words.has(w)) hit += name.has(w) ? 1 : 0.4;
        // A UW+ when it's asked for ("+", "plus" or its own name), else the UW.
        const plusWanted = q.includes('+') || q.includes('plus');
        const upWords = t.kind === 'uwp' ? wordsOf(t.label.split(' — ')[1] ?? '') : [];
        const namesUp = upWords.length > 0 && upWords.every(w => q.includes(w));
        const fit = (t.kind === 'uwp' && !plusWanted && !namesUp) || (t.kind === 'uw' && plusWanted) ? -0.5 : 0;
        // Its whole name asked for ("Damage" lab over "Super Crit Damage");
        // workshop before labs unless labs are named (both have "Damage").
        const exact = [...name].every(w => q.includes(w)) ? 0.1 : 0;
        const order = t.kind === 'workshop' ? 0.05 : 0;
        return { t, score: hit / q.length + fit + exact + order };
    }).filter(x => x.score > 0.45).sort((a, b) => b.score - a.score);
    if (!scored.length) return [];
    const top = scored[0];
    // All of one UW's stats when no stat was named.
    const sameUw = scored.filter(x => x.t.kind === 'uw' && top.t.kind === 'uw'
        && x.t.key.split('|')[0] === top.t.key.split('|')[0] && Math.abs(x.score - top.score) < 0.03);
    return sameUw.length > 1 ? sameUw.map(x => x.t) : [top.t];
}

// "max", "+5", "next", "20" → a level for the target.
export function levelFor(t: UpgradeTarget, level: string): number | null {
    const l = level.trim().toLowerCase();
    if (!l || l === 'max' || l === 'maxed' || l === 'maximum') return t.max;
    if (l === 'next') return Math.min(t.max, t.current + 1);
    const rel = /^\+\s*(\d+)$/.exec(l);
    if (rel) return Math.min(t.max, t.current + Number(rel[1]));
    const abs = /(\d+)/.exec(l);
    return abs ? Math.max(0, Math.min(t.max, Number(abs[1]))) : null;
}

// ── Levels ────────────────────────────────────────────────────
export function levelsOf(s: AiAccount, query: string): ToolResult {
    const targets = upgradeTargets(snapshotFromState(s));
    const found = findTargets(targets, query);
    const text = found.length
        ? found.map(t => `${t.label} (${t.group}): level ${t.current} of ${t.max}`).join('\n')
        : `No upgrade on this account matches "${query}".`;
    return { title: 'Current levels', text };
}

// ── What If ───────────────────────────────────────────────────
export interface AiChangeAsk { upgrade: string; level: string }

const COSTS: [OptCurrency, (v: number) => string][] = [
    ['coins', v => `${num(v)} coins`], ['stones', v => `${v.toLocaleString()} stones`],
    ['research', v => `${formatLabTime(v)} of research`], ['medals', v => `${v.toLocaleString()} medals`],
    ['shards', v => `${num(v)} Module Shards`], ['bits', v => `${v.toLocaleString()} bits`],
];
const costsText = (c: Costs) => COSTS.filter(([k]) => (c[k] ?? 0) > 0).map(([k, f]) => f(c[k]!)).join(', ') || 'free';

interface WhatIfSetup { base: ReturnType<typeof snapshotFromState>; models: GoalModels; report: ReturnType<typeof chosenReport> }

function campaignSetup(s: AiAccount): WhatIfSetup {
    // What If's campaign mode: the chosen report, or the usual campaign run
    // when that's a tournament run.
    const campaign: AccountState = chosenReport(s)?.tournament
        ? { ...s, battleReportText: '', battleReportChoice: defaultBattleIndex(s.importedBattles) }
        : s;
    return { base: snapshotFromState(campaign), models: runModels(campaign), report: chosenReport(campaign) };
}

export function whatIfChanges(s: AiAccount, asks: AiChangeAsk[]): ToolResult {
    const build = buildOf(s);
    const { base, models, report } = campaignSetup(s);
    const targets = upgradeTargets(base);
    const changes: Change[] = [];
    const notes: string[] = [];
    for (const ask of asks.slice(0, 4)) {
        const found = findTargets(targets, ask.upgrade);
        if (!found.length) { notes.push(`Couldn't find "${ask.upgrade}" on this account.`); continue; }
        for (const t of found) {
            const lv = levelFor(t, ask.level);
            if (lv === null) { notes.push(`Didn't understand level "${ask.level}" for ${t.label}.`); continue; }
            if (lv === t.current) { notes.push(`${t.label} is already level ${t.current}${t.current === t.max ? ' (max)' : ''}.`); continue; }
            changes.push({ kind: t.kind, key: t.key, level: lv });
            notes.push(`${t.label}: ${t.current} → ${lv} (max ${t.max}), costs ${costsText(changeCost(base, t, lv))}.`);
        }
    }
    if (!changes.length) return { title: 'What If', text: notes.join('\n') || 'No change to try.' };
    const r = whatIf(base, changes, targets, build, report, models);
    const out: string[] = [];
    // One sentence to quote (small models copy numbers best from a sentence).
    const gain = r.waves
        ? `about ${r.waves.gained >= 0 ? '+' : ''}${r.waves.gained.toFixed(1)} waves (runs end around W${r.waves.from.toLocaleString()} now, W${r.waves.to.toLocaleString()} after)`
        : `${pct(r.survivalPct ?? r.damagePct)} ${r.survivalPct !== null ? 'survival' : 'damage'}`;
    const asked = (a: AiChangeAsk) => (/^\+\s*\d+$/.test(a.level.trim()) ? `${a.upgrade} ${a.level.trim()} levels`
        : /\d/.test(a.level) ? `${a.upgrade} to level ${/\d+/.exec(a.level)![0]}` : `maxing ${a.upgrade}`);
    out.push(`Headline: ${asks.map(asked).join(' and ')} gives ${gain}, for ${costsText(r.costs)}.`);
    out.push(...notes, `Details (campaign runs; damage measured on your T${report?.tier ?? '?'} run that ended at W${report?.wave.toLocaleString() ?? '?'}):`);
    out.push(`All damage ${pct(r.damagePct)}.`);
    if (build === 'Glass Cannon') out.push(`Push (flat damage + level skip) ${pct(r.pushPct)}.`);
    if (r.spread) out.push(`Run to run: ${r.spread.min.toFixed(1)} to ${r.spread.max.toFixed(1)} waves across the last ${r.spread.runs} runs.`);
    if (r.coinsRun) out.push(`Coins per run: ${num(r.coinsRun.from)} → ${num(r.coinsRun.to)}.`);
    if (r.coinsHour) out.push(`Coins per hour: ${num(r.coinsHour.from)} → ${num(r.coinsHour.to)}.`);
    if (r.survivalPct !== null) out.push(`Survival (eHP) ${pct(r.survivalPct)}.`);
    const links = r.chain.filter(l => l.waves !== undefined && Math.abs(l.waves) >= 0.05)
        .sort((a, b) => Math.abs(b.waves!) - Math.abs(a.waves!)).slice(0, 4);
    if (links.length) out.push(`Where the waves come from: ${links.map(l => `${l.label} ${l.waves! >= 0 ? '+' : ''}${l.waves!.toFixed(1)}`).join('; ')}.`);
    out.push(`Total cost: ${costsText(r.costs)}.`);
    return { title: 'What If', text: out.join('\n') };
}

// ── Tournament ────────────────────────────────────────────────
export function tournamentOutlook(s: AiAccount, sim: AiTourneySettings): ToolResult {
    const idx = newestTournament(s);
    if (idx < 0) return { title: 'Tournament', text: 'No tournament runs in the imported battle history yet.' };
    const build = buildOf(s);
    const calib = s.importedBattles[idx];
    const entry = s.tourneyLog?.[runKey(calib)];
    const league = (sim.league || s.profile.currentLeague || s.profile.league || '') as League;
    const last: Ticks = entry ? Object.fromEntries(entry.conditions.map(k => [k, true])) : sim.recent;
    const lastLeague = (entry?.league || league) as League;
    const account: AccountState = { ...s, battleReportText: '', battleReportChoice: idx };
    const model = buildTournamentModel(account, { league, week: sim.week, last, lastLeague, preset: sim.preset, loadout: sim.loadout }, build);
    const names = (t: Ticks) => Object.entries(t).filter(([, on]) => on)
        .map(([k]) => HEAT_CONDITIONS.find(c => c.key === k)?.name ?? k);
    const out: string[] = [`League: ${league || 'unknown'}.`];
    const runs = s.importedBattles.filter(b => b.tournament).sort((a, b) => (b.time ?? 0) - (a.time ?? 0)).slice(0, 5);
    out.push(`Recent tournament runs: ${runs.map(r => {
        const by = killedBy(r);
        const e = s.tourneyLog?.[runKey(r)];
        return `W${r.wave.toLocaleString()}${by ? ` (killed by ${by})` : ''}${e?.conditions.length ? ` with ${names(Object.fromEntries(e.conditions.map(k => [k, true]))).join(', ')}` : ''}`;
    }).join('; ')}.`);
    const week = names(sim.week);
    out.push(`This week's battle conditions (ticked on the Tournament page): ${week.length ? week.join(', ') : 'none ticked'}.`);
    if (model?.settle && model.run) {
        const zero = model.settle(last, heatOf(lastLeague));
        const shift = model.settle(sim.week) - zero;
        out.push(`Runs usually end around W${model.run.typicalWave.toLocaleString()}; with this week's conditions, around W${Math.round(model.run.typicalWave + shift).toLocaleString()} (${shift >= 0 ? '+' : ''}${shift.toFixed(1)} waves).`);
    } else if (build !== 'Glass Cannon') {
        out.push('Waves for tournaments are only estimated for Glass Cannon builds so far.');
    }
    // Every tournament played (the game's records, 29.1.3+).
    const recs = s.tourneyRecords ?? [];
    if (recs.length) {
        const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
        out.push(`Tournament history: ${recs.length} tournaments since ${day(recs[0].date)}. Waves only compare within a league. Rank 1 is the top of the bracket.`);
        for (const st of leagueStats(recs).reverse()) {
            out.push(`- ${st.league}: ${st.count} tournaments (${day(st.first)} to ${day(st.last)}), best W${st.bestWave.toLocaleString()}, `
                + `average of the last 10 W${Math.round(st.recentWave ?? 0).toLocaleString()}, best rank ${st.bestRank ?? '—'}, `
                + `average rank of the last 10 ${st.recentRank?.toFixed(1) ?? '—'}.`);
        }
        const moves = leagueMoves(recs).slice(-3).map(m => `${m.up ? 'up to' : 'down to'} ${m.to} on ${day(m.date)}`);
        if (moves.length) out.push(`Last league moves: ${moves.join('; ')}.`);
        out.push(`Last 8 tournaments: ${recs.slice(-8).map(r => `${day(r.date)} ${r.league} W${r.wave.toLocaleString()} ${placed(r) ? `rank ${r.rank}` : '(not placed yet)'}`).join('; ')}.`);
    }
    return { title: 'Tournament', text: out.join('\n') };
}

// ── Runs ──────────────────────────────────────────────────────
// Damage by source as shares of the run's damage (under 1% left out).
export function damageShares(r: BattleReport): [string, number][] {
    const d = r.damage;
    if (!d || d.total <= 0) return [];
    const x = extraDamage(r);
    const parts: [string, number][] = [
        ['Chain Lightning', d.chainLightning], ['Orbs', d.orbs], ['Death Ray', x.deathRay], ['Black Hole', d.blackHole],
        ['Tower shots', d.projectiles], ['Smart Missiles', d.smartMissiles], ['Death Wave', d.deathWave],
        ['Inner Land Mines', d.innerLandMines], ['Poison Swamp', d.poisonSwamp], ['Spotlight', x.spotlight],
        ['Flame Bot', x.flameBot], ['Guardian', x.guardian], ['Electrons', x.electrons],
        ['Thorns', d.thorns], ['Land Mines', d.landMines], ['Rend Armor', d.rendArmor],
    ];
    return parts.map(([n, v]) => [n, v / d.total] as [string, number])
        .filter(([, share]) => share >= 0.01).sort((a, b) => b[1] - a[1]);
}

const sharesText = (shares: [string, number][]) =>
    shares.map(([n, v]) => `${n} ${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`).join(', ');

// The average share of each source over several runs.
function averageShares(runs: BattleReport[]): [string, number][] {
    const withDamage = runs.filter(r => r.damage && r.damage.total > 0);
    if (!withDamage.length) return [];
    const sum = new Map<string, number>();
    for (const r of withDamage) for (const [n, v] of damageShares(r)) sum.set(n, (sum.get(n) ?? 0) + v / withDamage.length);
    return [...sum.entries()].filter(([, v]) => v >= 0.01).sort((a, b) => b[1] - a[1]);
}

export type AiRunKind = 'any' | 'campaign' | 'tournament';

export function runsReport(s: AiAccount, kind: AiRunKind = 'any'): ToolResult {
    const all = [...s.importedBattles].sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
    if (!all.length) return { title: 'Your runs', text: 'No runs saved yet: import your game data to add your battle history.' };
    const tourney = all.filter(r => r.tournament);
    const campaign = all.filter(r => !r.tournament);
    const out: string[] = [`Saved runs: ${all.length} (${campaign.length} campaign, ${tourney.length} tournament). Each import adds the game's latest runs.`];
    // Where the damage comes from, campaign against tournaments.
    const farmTier = campaign.length ? [...campaign.reduce((m, r) => m.set(r.tier, (m.get(r.tier) ?? 0) + 1), new Map<number, number>())]
        .sort((a, b) => b[1] - a[1])[0][0] : null;
    if (farmTier !== null) {
        const sh = averageShares(campaign.filter(r => r.tier === farmTier && r.wave > 100).slice(0, 5));
        if (sh.length) out.push(`Damage by source, last campaign runs on T${farmTier}: ${sharesText(sh)}.`);
    }
    const tSh = averageShares(tourney.filter(r => r.wave > 10).slice(0, 5));
    if (tSh.length) out.push(`Damage by source, last tournament runs: ${sharesText(tSh)}.`);
    const list = (kind === 'tournament' ? tourney : kind === 'campaign' ? campaign : all).slice(0, 12);
    out.push(`${kind === 'any' ? 'Newest runs' : `Newest ${kind} runs`}:`);
    for (const r of list) {
        const by = killedBy(r);
        const sh = damageShares(r).slice(0, 4);
        out.push(`- ${r.date}: ${r.tournament ? 'tournament' : `T${r.tier}`} W${r.wave.toLocaleString()}`
            + `${by ? `, killed by ${by}` : by === null ? ', ended by the player' : ''}`
            + `${r.realTimeSec ? `, ${formatLabTime(r.realTimeSec / 3600)}` : ''}`
            + `${!r.tournament && r.coinsPerHour ? `, ${num(r.coinsPerHour)} coins/h` : ''}`
            + `${sh.length ? `; damage: ${sharesText(sh)}` : ''}`);
    }
    return { title: `Your runs${kind === 'any' ? '' : ` — ${kind}`}`, text: out.join('\n') };
}

// ── Another tier ──────────────────────────────────────────────
// Your last campaign deaths: the basic enemy's health where each run ended
// (Run Length), and the wave a run on another tier reaches that health with
// the same damage and the same level skip. Health only — enemies on a higher
// tier also hit harder, so it's where the damage runs out, not a promise.
export function tierOutlook(s: AiAccount, target: number): ToolResult {
    const model = buildRunLengthModel(s.importedBattles);
    if (!model) return { title: 'Another tier', text: 'No campaign deaths with level skips saved yet, so there is nothing to measure from.' };
    const to = Math.max(1, Math.min(24, Math.round(target || model.tier + 1)));
    const waves = model.used.map(d => deathWave(d.enemyHealth!, to, Math.max(0, 1 - d.healthLevel! / d.run.wave)));
    const avg = Math.round(waves.reduce((a, w) => a + w, 0) / waves.length);
    const from = model.used.map(d => d.run.wave);
    const out = [
        `Headline: with the damage and level skip of your last ${from.length} deaths on T${model.tier} (W${Math.min(...from).toLocaleString()}–W${Math.max(...from).toLocaleString()}, about W${model.typicalWave.toLocaleString()}), runs on T${to} would end around W${avg.toLocaleString()} (W${Math.min(...waves).toLocaleString()}–W${Math.max(...waves).toLocaleString()}).`,
        `How: each death's basic enemy health on T${model.tier}, and the wave where T${to} enemies reach the same health. Only health is compared: enemies on higher tiers also hit harder, and coins per wave are higher.`,
        ...model.used.map((d, i) => `- T${model.tier} W${d.run.wave.toLocaleString()} → T${to} W${waves[i].toLocaleString()}`),
    ];
    return { title: `T${model.tier} → T${to}`, text: out.join('\n') };
}
