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
// is the condition's own lab (each level weakens it 1%); `counted` means
// the waves model reads it — the others say why not.
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
    resistance?: boolean;          // the value is what's left (labs raise it, not cut it)
    counted: boolean;
    why?: string;
}

const pct = (v: number) => `+${v}%`;
const left = (v: number) => `${v}% damage`;

export const HEAT_CONDITIONS: HeatCondition[] = [
    {
        key: 'uwDurations', name: 'Ultimate Weapon Durations', counted: true, lab: 'UW Durations BC',
        text: 'Chrono Field, Golden Tower, Poison Swamp and Black Hole last x s shorter',
        steep: [1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 10], fmt: v => `−${v}s`,
    },
    {
        key: 'bossUltimate', name: "Boss's Ultimate", counted: true, lab: "Boss's Ultimate",
        text: 'Bosses spawn overhealed by x%',
        steep: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 100], fmt: pct,
    },
    {
        key: 'enemySpeed', name: 'Enemy Speed', counted: false, lab: 'Enemy Speed BC',
        text: 'Enemies move x% faster',
        steep: [20, 40, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 186, 192, 196, 198],
        gentle: [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 198], fmt: pct,
        why: 'Players who tested it found it makes enemies reach their top speed sooner (around W800–900 instead of W1200), not move x% faster at once; how enemy speed grows with waves in a tournament isn’t known yet.',
    },
    {
        key: 'armored', name: 'Armored Enemies', counted: false, lab: 'Armored Enemies BC',
        text: 'Enemies block the first x hits (all damage and effects)',
        steep: [1, 2, 3, 5, 10, 15, 20, 25, 30, 35, 50, 55, 60, 65, 70, 80, 90, 95, 100],
        gentle: [1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 20, 25, 30, 35, 40, 45, 50, 100], fmt: v => `${v} hits`,
        why: 'It blocks a number of hits per enemy, not a share of damage — needs how many hits each enemy takes.',
    },
    {
        key: 'moreEnemies', name: 'More Enemies', counted: false, lab: 'More Enemies BC',
        text: 'x% more enemies spawn',
        steep: [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 85, 90, 100],
        gentle: [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 95, 100], fmt: pct,
        why: 'More enemies in the same time; the model’s limit is the toughest enemy you can kill, not how many.',
    },
    {
        key: 'orb', name: 'Orb Resistance', counted: false, lab: 'Orb Resist', resistance: true,
        text: 'Orbs deal x% of enemy health instead of destroying',
        steep: [90, 75, 50, 40, 30, 20, 17, 14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
        gentle: [90, 75, 50, 45, 35, 30, 25, 20, 18, 16, 14, 12, 10, 9, 8, 7, 3, 2, 1], fmt: left,
        why: 'Orbs take a share of health whatever the enemy’s health, so they aren’t in the damage that decides how far a run gets.',
    },
    {
        key: 'deathRay', name: 'Death Ray Resistance', counted: false, lab: 'Death Ray Resist', resistance: true,
        text: 'Death Ray deals x% of enemy health instead of destroying',
        steep: [90, 80, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 7, 4, 2, 1],
        gentle: [90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 1], fmt: left,
        why: 'Same as orbs: a share of health, not flat damage.',
    },
    {
        key: 'thorns', name: 'Thorns Resistance', counted: false, lab: 'Thorns Resist', resistance: true,
        text: 'Thorns deal x% of their damage',
        steep: [95, 90, 80, 75, 70, 65, 60, 58, 56, 54, 50, 45, 40, 35, 30, 25, 20, 15, 5],
        gentle: [95, 90, 80, 75, 70, 65, 60, 58, 56, 54, 52, 50, 48, 46, 44, 40, 35, 30, 20], fmt: left,
        why: 'Thorns only hurt enemies that hit the tower — for Glass Cannon that hit already ends the run.',
    },
    {
        key: 'plasma', name: 'Plasma Cannon Resistance', counted: false, lab: 'Plasma Cannon Resist', resistance: true,
        text: 'Plasma Cannon deals x% of its damage',
        steep: [95, 90, 80, 75, 70, 65, 60, 58, 56, 54, 50, 45, 40, 35, 30, 25, 20, 15, 5],
        gentle: [95, 90, 80, 75, 70, 65, 60, 58, 56, 54, 52, 50, 48, 46, 44, 40, 35, 30, 20], fmt: left,
        why: 'Plasma Cannon isn’t modeled.',
    },
    {
        key: 'knockback', name: 'Knockback Resistance', counted: false, lab: 'Knockback Resist', resistance: true,
        text: 'Knockback force is reduced to x%',
        steep: [95, 90, 80, 75, 70, 65, 60, 58, 56, 54, 50, 45, 40, 35, 30, 25, 20, 15, 5],
        gentle: [95, 90, 80, 75, 70, 65, 60, 58, 56, 54, 52, 50, 48, 46, 44, 40, 35, 30, 20], fmt: v => `${v}% force`,
        why: 'Knockback isn’t modeled.',
    },
    {
        key: 'enemyAttackSpeed', name: 'Enemy Attack Speed', counted: false, lab: 'Enemy Atk Speed BC',
        text: 'Enemies attack x% faster',
        steep: [5, 25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300, 325, 350, 400, 425, 450, 500],
        gentle: [5, 25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300, 325, 350, 400, 450, 475, 500], fmt: pct,
        why: 'One hit ends a Glass Cannon run either way.',
    },
    {
        key: 'rangedUltimate', name: 'Ranged Ultimate', counted: false, lab: 'Ranged Ultimate',
        text: 'Ranged enemies’ shots stop the tower firing for x s',
        steep: [0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.4, 0.4, 0.5, 0.5, 0.6, 0.6, 0.7, 0.7, 0.8, 0.8, 0.9, 0.9, 1], fmt: v => `${v}s`,
        why: 'Needs how often ranged shots land.',
    },
    {
        key: 'tankUltimate', name: 'Tank’s Ultimate', counted: false, lab: "Tank's Ultimate",
        text: 'Tanks act like bosses and stop inside tower range for x s',
        steep: [3, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 240, 270, 285, 300], fmt: v => `${v}s`,
        why: 'Tanks acting as bosses isn’t modeled.',
    },
    {
        key: 'protectorUltimate', name: 'Protector’s Ultimate', counted: false, lab: "Protector's Ultimate",
        text: 'Protector shields block knockback, shockwave and Black Hole damage for x s',
        steep: [3, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 240, 270, 285, 300], fmt: v => `${v}s`,
        why: 'Protector immunity isn’t modeled.',
    },
    {
        key: 'fastUltimate', name: 'Fast’s Ultimate', counted: false, lab: "Fast's Ultimate",
        text: 'Fast enemies speed up to x nearby enemies to their speed',
        steep: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10], fmt: v => `${v} enemies`,
        why: 'The model already times the Fast enemy; others matching its speed doesn’t change that.',
    },
    {
        key: 'basicUltimate', name: 'Basic’s Ultimate', counted: false, lab: "Basic's Ultimate",
        text: 'Basics have a chance to spawn as Fast or Tank (and less often Ranged, Boss, Protector)',
        steep: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10], fmt: v => `${v}% each`,
        why: 'Which enemies spawn isn’t modeled.',
    },
    {
        key: 'deathDefyDown', name: 'Death Defy Down', counted: false, lab: 'Death Defy Down BC',
        text: 'Death Defy chance reduced by x%',
        steep: [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30], fmt: v => `−${v}%`,
        why: 'Death Defy isn’t in waves yet (killing hits near the end aren’t measured).',
    },
    {
        key: 'energyShieldsDown', name: 'Energy Shields Down', counted: false, lab: 'Energy Shields Down BC',
        text: 'Energy Shield recharge time increased by x%',
        steep: [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90, 95, 100], fmt: pct,
        why: 'Energy Shield isn’t in waves yet.',
    },
];

// The random conditions a week can draw (Death Defy Down and Energy Shields
// Down come as the Platinum-and-up saver condition instead).
export const RANDOM_CONDITIONS = HEAT_CONDITIONS.filter(c => c.key !== 'deathDefyDown' && c.key !== 'energyShieldsDown');
export const SAVER_CONDITIONS = HEAT_CONDITIONS.filter(c => c.key === 'deathDefyDown' || c.key === 'energyShieldsDown');
