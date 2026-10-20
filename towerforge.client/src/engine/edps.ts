// ============================================================
//  TowerForge Companion — Calibrated eDPS (Glass Cannon)
//  Scores upgrades by how much more damage the tower deals, weighted
//  by what actually dealt the damage in one of the player's runs.
//
//  The UW model (uwdps.ts) predicts how each damage source CHANGES with
//  an upgrade, but its absolute numbers aren't reliable (tower damage
//  and enemy health aren't modeled to scale). A battle report says how
//  much each source really dealt, so:
//    score = Σ source share × (modeled source now ÷ modeled at the anchor)
//          + wave-HP effects (Smite, Consume) + sources stones can't change
//  The anchor (the player's current setup) scores exactly 1.
//
//  • Chain Lightning, Smart Missiles (+ Spotlight Missiles), Death Wave,
//    Inner Land Mines and Poison Swamp scale with their modeled eDPS,
//    including core module UW damage, the Ultimate Damage relic,
//    Spotlight and damage-taken effects.
//  • Black Hole deals a share of enemy health, so it scales with its
//    reach (holes × uptime × size), not tower damage.
//  • Tower shots, rend armor and land mines scale with tower damage ×
//    crits × hits per second (attack speed × Multishot × Bounce Shot ×
//    Rapid Fire, towerDamage.calcProjectileFactors) × Spotlight; Chain
//    Lightning procs on those same hits. Echoing Shot (Amplify Bot+)
//    multiplies them by the bullets each tower bullet counts as.
//  • Flame Bot (from the run's FlameBotDamage): burns for its Damage
//    multiple of tower damage with crits (wiki), once per cooldown (Cooldown
//    stat − 1 s per Flame Bot Cooldown lab level), so per enemy pass it
//    scales with ×Damage × tower damage × crits × time in range ÷ cooldown.
//    Burn stacks and Wild Fire (Bot+) aren't modeled. Flat damage.
//  • Guardian Attack (the run's GuardianDamage — the Attack chip is the
//    Guardian's only damage): every cooldown it hits Targets of the most
//    hurt enemies for Percentage of the health they've lost (wiki). So it
//    scales with Percentage × Targets ÷ Cooldown, and with the health its
//    targets have lost, which the rest of the damage takes off: × the rest
//    of the score (eDPS), × the flat sources (run length). The code's
//    assumption: its targets are about as hurt as in the run.
//  • Orbs, thorns, Death Ray and everything else stay fixed.
//  • Smite (CL+) and Consume (BH+) add a share of each enemy's health.
//    The run's total damage is about the total enemy health, so +x% of
//    every enemy's health is about +x% of total damage.
//    Smite: each Chain Lightning hit has the CL chance to smite, up to 100
//    times per enemy. Hits per enemy come from the run: shots fired ×
//    CL chance × chains ÷ enemies CL reached (the game counts each enemy
//    once). Farming runs land far fewer than 100; without shot counts the
//    cap is assumed.
//    Consume reaches the kills made inside a Black Hole.
//  • Everything is damage to an enemy on its way in. Cooldown UWs (SM, DW,
//    ILM, PS) already count their activations during an enemy's time in
//    range; Chain Lightning and tower shots hit every second, so they scale
//    with that time too (×TTT), and so do Smite procs (more CL hits per
//    enemy). That's how Chrono Field, Chrono Loop (CF+), Slow Aura and range
//    raise damage without dealing any themselves — the code's model: an
//    enemy takes damage for as long as it's in range.
//
//  Pure functions — no store imports.
// ============================================================

import { calcTTT, calcTowerRange } from './ttt';
import {
    buildDamageContext, calcUWDPS, calcSpotlightMult, calcDamageTakenMult, calcSpotlightMissilesDPS,
    calcBlackHoleReach, calcConsumeFraction, calcSmitePerProc, calcCLChanceQty,
} from './uwdps';
import { calcDamageMeter, calcCoreUWDamageMult, echoingShotBullets } from './towerDamage';
import { attackRate, damageMeterFactor } from './guardian';
import type { BattleReport } from './battleReport';
import { extraDamage } from './battleReport';
import { BOTS_CONFIG } from '../constants/botData';
import type { OptimizerSnapshot } from './optimizer';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// A bot stat at a medal level (level 0 = the unlock value).
function botStatValue(bot: string, stat: string, level: number): number {
    const s = BOTS_CONFIG.find(b => b.name === bot)?.stats.find(x => x.label === stat);
    if (!s) return 0;
    return parseFloat(level > 0 ? s.values[Math.min(level, s.values.length) - 1] : s.lv0) || 0;
}

// Flame Bot burn per enemy pass, in tower-damage units: ×Damage × time in
// range ÷ cooldown. 0 when the bot isn't owned.
function flameBotPerPass(snap: OptimizerSnapshot, hit: number, ttt: number): number {
    const bot = snap.botData?.['Flame Bot'];
    if (!bot?.owned) return 0;
    const medals = bot.medals ?? [];
    const mult = botStatValue('Flame Bot', 'Damage', medals[2] ?? 0);
    const cooldown = Math.max(1, botStatValue('Flame Bot', 'Cooldown', medals[1] ?? 0)
        - (snap.labData['Flame Bot Cooldown'] ?? 0));
    return (mult * hit * ttt) / cooldown;
}

// The damage sources stones can change, modeled in relative units.
export interface EdpsParts {
    cl: number;
    sm: number;
    dw: number;
    ilm: number;
    ps: number;
    bh: number;        // Black Hole reach
    tower: number;     // tower shots / rend / land mines
    smite: number;     // share of enemy health per Smite proc
    clChance: number;  // Chain Lightning chance (0–1)
    clQty: number;     // Chain Lightning chains per proc
    consume: number;   // share of enemy health Consume deals per hole
    flame: number;     // Flame Bot burn per enemy pass
    attack: number;    // Guardian Attack: share of lost health dealt per second
    ttt: number;       // seconds an enemy spends in range (time to tower)
    shotRate: number;  // enemy hits per second (Chain Lightning's chances to proc)
}

export interface EdpsCalibration {
    anchor: EdpsParts;
    // Share of the run's total damage, after taking Smite and Consume out of
    // Chain Lightning and Black Hole. `fixed` = orbs, thorns and the rest.
    shares: Omit<EdpsParts, 'smite' | 'clChance' | 'clQty' | 'consume' | 'ttt' | 'shotRate' | 'attack'>
        & { guardian: number; fixed: number };
    clReach: number;      // share of enemies Chain Lightning hits (Smite)
    smiteProcs: number;   // Smite procs per enemy reached, at the anchor (≤ 100)
    bhKills: number;      // share of kills made inside a Black Hole (Consume)
}

const SMITE_CAP = 100;

// Smite procs per enemy: CL hits per enemy × CL chance, capped at 100.
// Scales from the anchor with CL chance² × chains (more procs and more
// chains) × attacks per second × time in range (more chances per enemy).
function smiteProcs(x: EdpsParts, a: EdpsParts, procs0: number): number {
    const w = (p: EdpsParts) => p.clChance * p.clChance * p.clQty * p.shotRate * p.ttt;
    return Math.min(SMITE_CAP, procs0 * (w(a) > 0 ? w(x) / w(a) : 1));
}

// Time in range now ÷ at the anchor: what per-second sources gain per enemy.
const timeRatio = (x: EdpsParts, a: EdpsParts) => (a.ttt > 0 ? x.ttt / a.ttt : 1);

const calcCLChanceQtyParts = (uwData: OptimizerSnapshot['uwData'], mb: OptimizerSnapshot['modBonuses']) => {
    const { chance, qty } = calcCLChanceQty(uwData, mb);
    return { clChance: chance, clQty: qty };
};

// Modeled damage parts for a snapshot. `ttt` overrides the time-to-tower
// (Chrono Loop is scored through its effect on the path length).
export function edpsParts(snap: OptimizerSnapshot, ttt?: number): EdpsParts {
    const { presetIdx, wsData, labData, cardData, uwData, modBonuses, moduleState, relicData, enhData, botData } = snap;
    const refTTT = ttt ?? calcTTT(presetIdx, wsData, labData, cardData, uwData, modBonuses).ttt;
    const ctx = buildDamageContext(presetIdx, wsData, labData, cardData, relicData, enhData, modBonuses, moduleState, botData);
    const damageMeter = calcDamageMeter(presetIdx, wsData, labData, enhData, relicData);
    const range = calcTowerRange(presetIdx, wsData, labData, cardData);
    const sl = calcSpotlightMult(uwData, modBonuses, damageMeter, range);
    const taken = calcDamageTakenMult(uwData, modBonuses, refTTT, presetIdx, wsData, labData);
    const uwShared = calcCoreUWDamageMult(moduleState, labData) * (1 + (relicData['rUWDmg'] ?? 0) / 100) * sl * taken;
    const uw = (abbr: 'CL' | 'SM' | 'DW' | 'ILM' | 'PS') =>
        calcUWDPS(abbr, uwData, modBonuses, refTTT, presetIdx, wsData, labData, cardData, ctx) * uwShared;
    const flame = flameBotPerPass(snap, ctx.towerDamage * ctx.critMult, refTTT) * sl * taken;
    const slMissiles = calcSpotlightMissilesDPS(
        uwData, modBonuses, refTTT, presetIdx, wsData, labData, cardData, moduleState, relicData, enhData, ctx,
    ) * taken;

    return {
        cl: uw('CL'),
        sm: uw('SM') + slMissiles,
        dw: uw('DW'),
        ilm: uw('ILM'),
        ps: uw('PS'),
        bh: calcBlackHoleReach(uwData, modBonuses, presetIdx, wsData, labData, cardData),
        // Damage/Meter (and Guardian Scout) on tower shots — engine/guardian.ts.
        tower: ctx.towerDamage * ctx.critMult * ctx.hitRate * sl * taken
            * damageMeterFactor(snap.guardian, presetIdx, damageMeter, range) * echoingShotBullets(botData),
        smite: calcSmitePerProc(uwData),
        ...calcCLChanceQtyParts(uwData, modBonuses),
        consume: calcConsumeFraction(uwData),
        flame,
        attack: attackRate(snap.guardian, presetIdx),
        ttt: refTTT,
        shotRate: ctx.hitRate,
    };
}

// Calibration from a run's damage by source; null when the report has none.
export function buildEdpsCalibration(snap: OptimizerSnapshot, report: BattleReport | null): EdpsCalibration | null {
    const d = report?.damage;
    if (!d || !(d.total > 0)) return null;
    const anchor = edpsParts(snap);
    const clReach = clamp01(snap.modBonuses.run?.clHitsPerEnemy ?? 0.5);
    const bhKills = clamp01(report?.killedWithEffect.blackHole ?? 0.3);
    const share = (v: number) => Math.max(0, v) / d.total;

    // CL hits per enemy reached = shots × chance × chains ÷ enemies reached.
    const shots = report?.projectileCount ?? 0;
    const reached = report?.clHits ?? 0;
    const hitsPerEnemy = shots > 0 && reached > 0 ? (shots * anchor.clChance * anchor.clQty) / reached : Infinity;
    // Without Chain Lightning there's nothing to smite (and ∞ × 0 would be NaN).
    const smiteProcs0 = anchor.clChance > 0 ? Math.min(SMITE_CAP, hitsPerEnemy * anchor.clChance) : 0;

    const smite0 = Math.min(1, anchor.smite * smiteProcs0) * clReach;
    const consume0 = anchor.consume * bhKills;
    const shares = {
        cl: Math.max(0, share(d.chainLightning) - smite0),
        sm: share(d.smartMissiles),
        dw: share(d.deathWave),
        ilm: share(d.innerLandMines),
        ps: share(d.poisonSwamp),
        bh: Math.max(0, share(d.blackHole) - consume0),
        tower: share(d.projectiles + d.rendArmor + d.landMines),
        flame: report ? share(extraDamage(report).flameBot) : 0,
        guardian: report ? share(extraDamage(report).guardian) : 0,
        fixed: 0,
    };
    const counted = shares.cl + shares.sm + shares.dw + shares.ilm + shares.ps + shares.bh + shares.tower + shares.flame
        + shares.guardian + smite0 + consume0;
    shares.fixed = Math.max(0, 1 - counted);
    return { anchor, shares, clReach, smiteProcs: smiteProcs0, bhKills };
}

// Relative eDPS: 1 at the calibration anchor.
export function edpsScore(snap: OptimizerSnapshot, calib: EdpsCalibration, ttt?: number): number {
    const x = edpsParts(snap, ttt);
    const a = calib.anchor;
    const s = calib.shares;
    const r = (now: number, then: number) => (then > 0 ? now / then : 1);
    const bhRatio = r(x.bh, a.bh);
    const t = timeRatio(x, a);
    const rest = s.cl * r(x.cl, a.cl) * t
        + s.sm * r(x.sm, a.sm)
        + s.dw * r(x.dw, a.dw)
        + s.ilm * r(x.ilm, a.ilm)
        + s.ps * r(x.ps, a.ps)
        + s.bh * bhRatio
        + s.tower * r(x.tower, a.tower) * t
        + s.flame * r(x.flame, a.flame)
        + s.fixed
        + Math.min(1, x.smite * smiteProcs(x, a, calib.smiteProcs)) * calib.clReach
        + x.consume * clamp01(calib.bhKills * bhRatio);
    // Attack: its rate × the health the rest of the damage takes off.
    const lost = 1 - s.guardian > 0 ? rest / (1 - s.guardian) : 1;
    return rest + s.guardian * r(x.attack, a.attack) * lost;
}

// Guardian Attack's damage now ÷ at the anchor, given the flat damage's
// ratio (the health its targets have lost).
export const attackRatio = (x: EdpsParts, a: EdpsParts, flatRatio: number) =>
    (a.attack > 0 ? x.attack / a.attack : 1) * flatRatio;

// How far a Glass Cannon run gets depends only on FLAT damage — Chain
// Lightning, Smart Missiles, Death Wave, Inner Land Mines, Poison Swamp and
// tower shots. Orbs (on Orb Resistance tiers), Black Hole, Smite and Consume
// deal a share of an enemy's health, so they don't fall behind as enemies get
// tougher; and the enemies that end GC runs (elites, fleets, bosses) are
// immune to orbs and Black Hole anyway (docs/run-simulation.md). Guardian
// Attack deals a share of the health flat damage took off, so it keeps pace
// with flat damage and counts with it.
// Relative flat damage, 1 at the anchor; feeds runLength's waves gained.
export function edpsSurvivalScore(snap: OptimizerSnapshot, calib: EdpsCalibration, ttt?: number): number {
    const x = edpsParts(snap, ttt);
    const a = calib.anchor;
    const s = calib.shares;
    const flat = s.cl + s.sm + s.dw + s.ilm + s.ps + s.tower + s.flame;
    if (flat <= 0) return 1;
    const f = flatDamageRatio(x, a, s);
    return (flat * f + s.guardian * attackRatio(x, a, f)) / (flat + s.guardian);
}

// The flat sources' damage now ÷ at the anchor (Guardian Attack's targets'
// lost health; What If splits waves by it too).
export function flatDamageRatio(x: EdpsParts, a: EdpsParts, s: EdpsCalibration['shares']): number {
    const flat = s.cl + s.sm + s.dw + s.ilm + s.ps + s.tower + s.flame;
    if (flat <= 0) return 1;
    const r = (now: number, then: number) => (then > 0 ? now / then : 1);
    const t = timeRatio(x, a);
    return (s.cl * r(x.cl, a.cl) * t + s.sm * r(x.sm, a.sm) + s.dw * r(x.dw, a.dw) + s.ilm * r(x.ilm, a.ilm)
        + s.ps * r(x.ps, a.ps) + s.tower * r(x.tower, a.tower) * t + s.flame * r(x.flame, a.flame)) / flat;
}
