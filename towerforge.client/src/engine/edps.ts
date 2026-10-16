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
//    crits × attack speed × Spotlight.
//  • Orbs, thorns and everything else stay fixed.
//  • Smite (CL+) and Consume (BH+) add a share of each enemy's health.
//    The run's total damage is about the total enemy health, so +x% of
//    every enemy's health is about +x% of total damage.
//    Smite: each Chain Lightning hit has the CL chance to smite, up to 100
//    times per enemy. Hits per enemy come from the run: shots fired ×
//    CL chance × chains ÷ enemies CL reached (the game counts each enemy
//    once). Farming runs land far fewer than 100; without shot counts the
//    cap is assumed.
//    Consume reaches the kills made inside a Black Hole.
//
//  Pure functions — no store imports.
// ============================================================

import { calcTTT, calcTowerRange } from './ttt';
import {
    buildDamageContext, calcUWDPS, calcSpotlightMult, calcDamageTakenMult, calcSpotlightMissilesDPS,
    calcBlackHoleReach, calcConsumeFraction, calcSmitePerProc, calcCLChanceQty,
} from './uwdps';
import { calcDamageMeter, calcCoreUWDamageMult } from './towerDamage';
import type { BattleReport } from './battleReport';
import type { OptimizerSnapshot } from './optimizer';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

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
}

export interface EdpsCalibration {
    anchor: EdpsParts;
    // Share of the run's total damage, after taking Smite and Consume out of
    // Chain Lightning and Black Hole. `fixed` = orbs, thorns and the rest.
    shares: Omit<EdpsParts, 'smite' | 'clChance' | 'clQty' | 'consume'> & { fixed: number };
    clReach: number;      // share of enemies Chain Lightning hits (Smite)
    smiteProcs: number;   // Smite procs per enemy reached, at the anchor (≤ 100)
    bhKills: number;      // share of kills made inside a Black Hole (Consume)
}

const SMITE_CAP = 100;

// Smite procs per enemy: CL hits per enemy × CL chance, capped at 100.
// Scales with CL chance² × chains from the anchor (more procs and more chains).
function smiteProcs(x: EdpsParts, a: EdpsParts, procs0: number): number {
    const w = (p: EdpsParts) => p.clChance * p.clChance * p.clQty;
    return Math.min(SMITE_CAP, procs0 * (w(a) > 0 ? w(x) / w(a) : 1));
}

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
    const uwShared = calcCoreUWDamageMult(moduleState) * (1 + (relicData['rUWDmg'] ?? 0) / 100) * sl * taken;
    const uw = (abbr: 'CL' | 'SM' | 'DW' | 'ILM' | 'PS') =>
        calcUWDPS(abbr, uwData, modBonuses, refTTT, presetIdx, wsData, labData, cardData, ctx) * uwShared;
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
        tower: ctx.towerDamage * ctx.critMult * ctx.attackSpeed * sl * taken,
        smite: calcSmitePerProc(uwData),
        ...calcCLChanceQtyParts(uwData, modBonuses),
        consume: calcConsumeFraction(uwData),
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
    const smiteProcs0 = Math.min(SMITE_CAP, hitsPerEnemy * anchor.clChance);

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
        fixed: 0,
    };
    const counted = shares.cl + shares.sm + shares.dw + shares.ilm + shares.ps + shares.bh + shares.tower + smite0 + consume0;
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
    return s.cl * r(x.cl, a.cl)
        + s.sm * r(x.sm, a.sm)
        + s.dw * r(x.dw, a.dw)
        + s.ilm * r(x.ilm, a.ilm)
        + s.ps * r(x.ps, a.ps)
        + s.bh * bhRatio
        + s.tower * r(x.tower, a.tower)
        + s.fixed
        + Math.min(1, x.smite * smiteProcs(x, a, calib.smiteProcs)) * calib.clReach
        + x.consume * clamp01(calib.bhKills * bhRatio);
}
