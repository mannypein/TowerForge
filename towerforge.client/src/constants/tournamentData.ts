// ============================================================
//  TowerForge Companion — Tournament leagues and battle conditions
//  Each league's fixed conditions, and how strong every random battle
//  condition ("heat") is at each wave of a tournament run.
//
//  Sources (checked 2026-10-18, details in docs/run-simulation.md §3):
//   • Heat by wave: "v26 BCs and Heat", crowdsourced in game by the J Plays
//     Discord (Cdcooper13, LTK, RichardSz, AshDs, Summer, Gorgar), linked
//     from the Tower Knowledge Hub (the-tower.notion.site). Conditions step
//     up at fixed waves and reach full strength at W1000. Champion and
//     Legend share one ramp ('steep'); Platinum's resistances, Armored
//     Enemies, Enemy Speed and Enemy Attack Speed climb more gently. Its
//     Thorns column matches TheTowerSDK's heat table (read from game code)
//     in both ramps.
//   • Fixed per league: the wiki's Tiers page (Tournament Overheat, v28) —
//     Skip Reduction - Multiply and Skip Decay; Mythic's ×0.3 from
//     TheTowerSDK (v29 game data); More Bosses and the random-condition
//     count from the wiki and SDK.
//  Assumptions (not in any source): Silver and Gold use Platinum's ramp,
//  Mythic uses Legend's; Mythic's Skip Decay isn't known, so it's left out.
// ============================================================

import type { League } from '../types/gameTypes';

// The waves heat steps up at; each condition has one value per step.
export const HEAT_WAVES = [0, 20, 40, 60, 80, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000];

export type HeatRamp = 'gentle' | 'steep';

export interface LeagueHeat {
    league: Exclude<League, ''>;
    tierPlus: number;              // enemy scaling base: "tier +" (Copper T1+ … Mythic T23+)
    bossEvery: number;             // More Bosses: a boss every N waves (fixed, doesn't ramp)
    randomConditions: number;      // random battle conditions a week
    saverDown: boolean;            // Death Defy Down or Energy Shields Down (Platinum and up)
    ramp: HeatRamp | null;         // how the random conditions climb (null: Copper, no heat)
    skipMultiply: number;          // Skip Reduction - Multiply, always on (1 = none)
    skipDecayEvery: number | null; // Skip Decay: 1% every N waves, always on (null = none / unknown)
}

export const LEAGUE_HEAT: LeagueHeat[] = [
    { league: 'Copper', tierPlus: 1, bossEvery: 10, randomConditions: 0, saverDown: false, ramp: null, skipMultiply: 1, skipDecayEvery: null },
    { league: 'Silver', tierPlus: 3, bossEvery: 9, randomConditions: 1, saverDown: false, ramp: 'gentle', skipMultiply: 1, skipDecayEvery: null },
    { league: 'Gold', tierPlus: 5, bossEvery: 8, randomConditions: 2, saverDown: false, ramp: 'gentle', skipMultiply: 0.9, skipDecayEvery: 80 },
    { league: 'Platinum', tierPlus: 8, bossEvery: 7, randomConditions: 3, saverDown: true, ramp: 'gentle', skipMultiply: 0.75, skipDecayEvery: 60 },
    { league: 'Champion', tierPlus: 12, bossEvery: 6, randomConditions: 4, saverDown: true, ramp: 'steep', skipMultiply: 0.6, skipDecayEvery: 40 },
    { league: 'Legend', tierPlus: 17, bossEvery: 5, randomConditions: 5, saverDown: true, ramp: 'steep', skipMultiply: 0.45, skipDecayEvery: 20 },
    { league: 'Mythic', tierPlus: 23, bossEvery: 4, randomConditions: 6, saverDown: true, ramp: 'steep', skipMultiply: 0.3, skipDecayEvery: null },
];

// Legend's extra overheat (wiki), shown for runs that get near it.
export const LEGEND_OVERHEAT = [
    { from: 1000, text: 'More Fleets: an extra fleet every 100 waves' },
    { from: 1500, text: 'Damage Decay: tower Damage −35 levels every 10 waves' },
    { from: 1500, text: 'Health Decay: tower Health −50 levels every 10 waves' },
    { from: 2000, text: 'More Elites: an extra elite every 5 waves' },
];

// A random condition. `steep` is the Champion/Legend ramp; `gentle` (when
// it differs) Platinum's. `fmt` shows a value in the game's words; `lab`
// is the condition's own lab (each level weakens it 1%). `effect` is what
// the model does with it — 'waves' (moves where a Glass Cannon run ends),
// 'savers' (the killing hits a run survives), or 'none' (a Glass Cannon
// run doesn't feel it, or the model doesn't have it) — with `how` / `why`.
export type HeatKey =
    | 'uwDurations' | 'bossUltimate' | 'enemySpeed' | 'armored' | 'moreEnemies' | 'orb' | 'deathRay'
    | 'thorns' | 'plasma' | 'knockback' | 'enemyAttackSpeed' | 'rangedUltimate' | 'tankUltimate'
    | 'protectorUltimate' | 'fastUltimate' | 'basicUltimate' | 'deathDefyDown' | 'energyShieldsDown';

export interface HeatCondition {
    key: HeatKey;
    name: string;
    text: string;
    steep: number[];
    gentle?: number[];
    fmt: (v: number) => string;
    lab?: string;
    resistance?: boolean;          // the value is what's left of the damage (labs weaken what it takes)
    effect: ConditionEffect;
    how?: string;                  // how the model counts it
    why?: string;                  // why it doesn't move a Glass Cannon run
}

export type ConditionEffect = 'waves' | 'savers' | 'none';

const pct = (v: number) => `+${v}%`;
const left = (v: number) => `${v}% damage`;

export const HEAT_CONDITIONS: HeatCondition[] = [
    {
        key: 'uwDurations', name: 'Ultimate Weapon Durations', effect: 'waves', lab: 'UW Durations BC',
        text: 'Chrono Field, Golden Tower, Poison Swamp and Black Hole last x s shorter',
        steep: [1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 10], fmt: v => `−${v}s`,
        how: 'Chrono Field, Golden Tower, Poison Swamp and Black Hole last that much shorter, through the same bonus their duration substats add to.',
    },
    {
        key: 'bossUltimate', name: "Boss's Ultimate", effect: 'waves', lab: "Boss's Ultimate",
        text: 'Bosses spawn overhealed by x%',
        steep: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 100], fmt: pct,
        how: 'Boss health, as often as bosses end your runs.',
    },
    {
        key: 'enemySpeed', name: 'Enemy Speed', effect: 'waves', lab: 'Enemy Speed BC',
        text: 'Enemies move x% faster',
        steep: [20, 40, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 186, 192, 196, 198],
        gentle: [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 198], fmt: pct,
        how: 'Enemies spend that much less time in your range, so everything that hits over time does less to each. The game caps enemy speed (players find enemies reach top speed sooner with it), so far into a run (W800+) it counts too much.',
    },
    {
        key: 'armored', name: 'Armored Enemies', effect: 'waves', lab: 'Armored Enemies BC',
        text: 'Enemies block the first x hits (all damage and effects)',
        steep: [1, 2, 3, 5, 10, 15, 20, 25, 30, 35, 50, 55, 60, 65, 70, 80, 90, 95, 100],
        gentle: [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 20, 25, 30, 35, 40, 45, 50, 100], fmt: v => `${v} hits`,
        how: 'Each enemy ignores its first hits: that share of the hits an enemy takes on its way in (your last tournament: shots × bounces plus Chain Lightning, per enemy) does nothing. More hits a second make it matter less.',
    },
    {
        key: 'moreEnemies', name: 'More Enemies', effect: 'waves', lab: 'More Enemies BC',
        text: 'x% more enemies spawn',
        steep: [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 85, 90, 100],
        gentle: [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 95, 100], fmt: pct,
        how: 'Single-target fire (tower shots, Chain Lightning, Smart Missiles) is shared by that many more enemies; area damage isn’t.',
    },
    {
        key: 'orb', name: 'Orb Resistance', effect: 'waves', lab: 'Orb Resist', resistance: true,
        text: 'Orbs deal x% of enemy health instead of destroying',
        steep: [90, 75, 50, 40, 30, 20, 17, 14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
        gentle: [90, 75, 50, 45, 35, 30, 25, 20, 18, 16, 14, 12, 10, 9, 8, 7, 3, 2, 1], fmt: left,
        how: 'Enemies orbs used to destroy (their share of your last tournament’s kills) keep the rest of their health, so your other damage has to finish them — counted like extra enemies.',
    },
    {
        key: 'deathRay', name: 'Death Ray Resistance', effect: 'waves', lab: 'Death Ray Resist', resistance: true,
        text: 'Death Ray deals x% of enemy health instead of destroying',
        steep: [90, 80, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 7, 4, 2, 1],
        gentle: [90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 1], fmt: left,
        how: 'Enemies Death Ray used to destroy (its share of your last tournament’s kills) keep the rest of their health — counted like extra enemies.',
    },
    {
        key: 'thorns', name: 'Thorns Resistance', effect: 'none', lab: 'Thorns Resist', resistance: true,
        text: 'Thorns deal x% of their damage',
        steep: [95, 90, 80, 75, 70, 65, 60, 58, 56, 54, 50, 45, 40, 35, 30, 25, 20, 15, 5],
        gentle: [95, 90, 80, 75, 70, 65, 60, 58, 56, 54, 52, 50, 48, 46, 44, 40, 35, 30, 20], fmt: left,
        why: 'Thorns only hurt enemies that hit the tower — in a Glass Cannon run that hit ends the run or uses a save anyway.',
    },
    {
        key: 'plasma', name: 'Plasma Cannon Resistance', effect: 'none', lab: 'Plasma Cannon Resist', resistance: true,
        text: 'Plasma Cannon deals x% of its damage',
        steep: [95, 90, 80, 75, 70, 65, 60, 58, 56, 54, 50, 45, 40, 35, 30, 25, 20, 15, 5],
        gentle: [95, 90, 80, 75, 70, 65, 60, 58, 56, 54, 52, 50, 48, 46, 44, 40, 35, 30, 20], fmt: left,
        why: 'Plasma Cannon isn’t in the model.',
    },
    {
        key: 'knockback', name: 'Knockback Resistance', effect: 'none', lab: 'Knockback Resist', resistance: true,
        text: 'Knockback force is reduced to x%',
        steep: [95, 90, 80, 75, 70, 65, 60, 58, 56, 54, 50, 45, 40, 35, 30, 25, 20, 15, 5],
        gentle: [95, 90, 80, 75, 70, 65, 60, 58, 56, 54, 52, 50, 48, 46, 44, 40, 35, 30, 20], fmt: v => `${v}% force`,
        why: 'Knockback isn’t in the model.',
    },
    {
        key: 'enemyAttackSpeed', name: 'Enemy Attack Speed', effect: 'none', lab: 'Enemy Atk Speed BC',
        text: 'Enemies attack x% faster',
        steep: [5, 25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300, 325, 350, 400, 425, 450, 500],
        gentle: [5, 25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300, 325, 350, 400, 450, 475, 500], fmt: pct,
        why: 'One hit ends a Glass Cannon run (or uses a save) however fast enemies attack.',
    },
    {
        key: 'rangedUltimate', name: 'Ranged Ultimate', effect: 'none', lab: 'Ranged Ultimate',
        text: 'Ranged enemies’ shots stop the tower firing for x s',
        steep: [0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.4, 0.4, 0.5, 0.5, 0.6, 0.6, 0.7, 0.7, 0.8, 0.8, 0.9, 0.9, 1], fmt: v => `${v}s`,
        why: 'A ranged shot that lands ends a Glass Cannon run or uses a save, so the pause comes after it matters.',
    },
    {
        key: 'tankUltimate', name: 'Tank’s Ultimate', effect: 'waves', lab: "Tank's Ultimate",
        text: 'Tanks act like bosses and stop inside tower range for x s',
        steep: [3, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 240, 270, 285, 300], fmt: v => `${v}s`,
        how: 'Tanks get boss immunities, so orbs and Death Ray stop destroying them — counted like extra enemies, by tanks’ share of your enemies. Their stop inside your range isn’t counted (it gives your tower more time on them).',
    },
    {
        key: 'protectorUltimate', name: 'Protector’s Ultimate', effect: 'none', lab: "Protector's Ultimate",
        text: 'Protector shields block knockback, shockwave and Black Hole damage for x s',
        steep: [3, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 240, 270, 285, 300], fmt: v => `${v}s`,
        why: 'Shielded enemies ignore Black Hole, shockwave and knockback; Black Hole isn’t in the flat damage that decides a Glass Cannon run, and the other two aren’t in the model.',
    },
    {
        key: 'fastUltimate', name: 'Fast’s Ultimate', effect: 'waves', lab: "Fast's Ultimate",
        text: 'Fasts buff up to x nearby enemies to match their speed',
        steep: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10], fmt: v => `up to ${v} nearby`,
        how: 'Slow enemies that end your runs (Overcharge, bosses, tanks…) come in at Fast speed most of the time (you see it happen; more often the more it buffs), so they spend that much less time in your range and take that much less damage — by how often each ends your runs.',
    },
    {
        key: 'basicUltimate', name: 'Basic’s Ultimate', effect: 'waves', lab: "Basic's Ultimate",
        text: 'Basics have a chance to spawn as Fast or Tank (and less often Ranged, Boss, Protector)',
        steep: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10], fmt: v => `${v}% each`,
        how: 'Basics spawn as a fast, tank, ranged, boss or protector at that % each (wiki), adding health to the field — counted like extra enemies, by basics’ share of your enemies.',
    },
    {
        key: 'deathDefyDown', name: 'Death Defy Down', effect: 'savers', lab: 'Death Defy Down BC',
        text: 'Death Defy chance reduced by x%',
        steep: [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30], fmt: v => `−${v}%`,
        how: 'Points off your Death Defy chance (the code’s reading: the sheet’s 30% at W1000 is the workshop’s most), so a run survives fewer killing hits. Waves don’t include saves yet.',
    },
    {
        key: 'energyShieldsDown', name: 'Energy Shields Down', effect: 'savers', lab: 'Energy Shields Down BC',
        text: 'Energy Shield recharge time increased by x%',
        steep: [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 95, 100], fmt: pct,
        how: 'Energy Shield recharges that much slower, so it takes fewer killing hits a run. Waves don’t include saves yet.',
    },
];

// The random conditions a week can draw (Death Defy Down and Energy Shields
// Down come as the Platinum-and-up saver condition instead).
export const RANDOM_CONDITIONS = HEAT_CONDITIONS.filter(c => c.key !== 'deathDefyDown' && c.key !== 'energyShieldsDown');
export const SAVER_CONDITIONS = HEAT_CONDITIONS.filter(c => c.key === 'deathDefyDown' || c.key === 'energyShieldsDown');
