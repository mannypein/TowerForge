// ============================================================
//  TowerForge Companion — Enemy stats (the in-game Wave Info panel)
//  Each enemy's health, attack, speed and spawn for a tier and wave,
//  after level skips, enemy research labs and trade-off perks.
//
//  - Enemies use their stat LEVEL, not the wave: level = wave − levels
//    skipped (the two counts the panel's footer shows).
//  - Base health / damage per level: the formula and constants of
//    TheTowerSDK (MIT, github.com/TmRxJD/TheTowerSDK), whose wave scaling
//    builds on skye's tower-idle-toolkit (ISC). Campaign tiers only —
//    tournaments use a different curve, not added yet.
//  - Type rules, speeds, labs, perks and spawn schedules: the wiki
//    (Enemies, Tiers, Perks, Improve Trade-Off Perks).
//  Checked against the game at T18 W6000 and W6196–6206 — every
//  health / attack / speed row matches to the panel's digits
//  (docs/run-simulation.md). Pure functions — no store imports.
// ============================================================

import type { LabData } from '../types/gameTypes';

export type EnemyType =
    | 'Basic' | 'Fast' | 'Tank' | 'Ranged' | 'Boss' | 'Protector'
    | 'Vampire' | 'Scatter' | 'Ray' | 'Saboteur' | 'Commander' | 'Overcharge';

// The panel's row order.
export const ENEMY_TYPES: EnemyType[] = [
    'Basic', 'Fast', 'Tank', 'Ranged', 'Boss', 'Protector',
    'Vampire', 'Scatter', 'Ray', 'Saboteur', 'Commander', 'Overcharge',
];

const ELITES = new Set<EnemyType>(['Vampire', 'Scatter', 'Ray']);
const FLEETS = new Set<EnemyType>(['Saboteur', 'Commander', 'Overcharge']);

// ── Base health and damage per stat level (TheTowerSDK constants) ──
// Banded: every term steps at floor(level / divisor), so the curve jumps at
// band boundaries rather than growing smoothly.

const TIER_PRESSURE = [0, 1, 20, 60, 120, 240, 480, 960, 1920, 5760, 40320, 2620800, 1572480000,
    786239979520, 235870007328768, 7.076199997322035e16, 3.538100050200625e18, 1.0614000038903074e20,
    2.653599994915152e21, 3.449599940780421e24, 4.139599895572065e27, 4.9675000690814487e30,
    5.961000082897738e33, 7.153200099477286e36, 8.583840119372743e39];
const DAMAGE_TIER_DIVISOR = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2.299999952316284, 11.5, 115, 5750, 287500,
    14375000, 86250000, 431249984, 2156250112, 10781249536, 53906251776, 269531250688, 1.34765625344e12,
    6.7382812672e12, 3.3691406336e13];

// [coefficient, divisor] — Σ coeff × floor(level / divisor).
const HP_BANDS: [number, number][] = [
    [0.10000000149011612, 107], [0.20999999344348907, 94], [0.20000000298023224, 83],
    [0.18000000715255737, 72], [0.10000000149011612, 60], [0.3499999940395355, 900],
    [0.15000000596046448, 200], [0.11999999731779099, 100], [0.07999999821186066, 50],
    [0.05999999865889549, 25], [0.03999999910593033, 5], [0.05000000074505806, 10],
];
const DMG_BANDS: [number, number][] = [
    [0.019999999552965164, 900], [0.02500000037252903, 200], [0.019999999552965164, 100],
    [0.017000000923871994, 50], [0.012000000104308128, 25], [0.019999999552965164, 5],
    [0.02500000037252903, 10],
];
// [rate, divisor] — Π rate^floor(level / divisor). 'w>>10' = level >> 10;
// 'mid' = the game's integer form of floor(level / 107) for damage.
type Step = [number, number | 'w>>10' | 'mid'];
const HP_GROWTH: Step[] = [
    [1.034999966621399, 30], [1.0199999809265137, 60], [1.024999976158142, 72],
    [1.0299999713897705, 83], [1.0299999713897705, 94], [1.0199999809265137, 100],
    [1.0199999809265137, 107], [1.0299999713897705, 200], [1.059999942779541, 400],
    [1.149999976158142, 900], [1.149999976158142, 'w>>10'], [1.1100000143051147, 139],
    [1.1100000143051147, 182], [1.1299999952316284, 241], [1.1299999952316284, 332],
];
const DMG_GROWTH: Step[] = [
    [1.0049999952316284, 30], [1.0099999904632568, 72], [1.0099999904632568, 83],
    [1.0099999904632568, 94], [1.0099999904632568, 'mid'], [1.0199999809265137, 200],
    [1.0199999809265137, 400], [1.034999966621399, 900], [1.0499999523162842, 'w>>10'],
    [1.0299999713897705, 241], [1.0299999713897705, 332],
];
// Extra damage growth above tier 6 (the /182 step skips tier 7).
const DMG_GROWTH_ABOVE_T6: [number, number, number | null][] = [
    [1.024999976158142, 139, null], [1.024999976158142, 182, 7],
];
// Exponent add-ons for tiers 10–14, then a cap from tier 15.
const HP_EXP_ADDON = [0.009999999776482582, 0.019999999552965164, 0.10000000149011612, 0.2199999988079071, 0.36000001430511475];
const HP_EXP_CAP = 0.5099999904632568;
const DMG_EXP_ADDON = [0.0020000000949949026, 0.004000000189989805, 0.019999999552965164, 0.04600000008940697, 0.0729999989271164];
const DMG_EXP_CAP = 0.10199999809265137;

const clampTier = (t: number) => Math.min(24, Math.max(1, Math.round(t)));
const bracket = (level: number, d: number) => Math.floor(Math.max(1, Math.floor(level)) / d);

function stepExponent(level: number, d: Step[1]): number {
    if (d === 'w>>10') return (level >> 10) & 0x3fffff;
    if (d === 'mid') {
        const blend = Math.floor((level * 842937507) / 2 ** 32);
        return (blend + ((level - blend) >> 1)) >> 6;
    }
    return bracket(level, d);
}

const growth = (level: number, steps: Step[]) =>
    steps.reduce((p, [rate, d]) => p * rate ** stepExponent(level, d), 1);

const tierAddon = (t: number, table: number[], cap: number) => (t <= 9 ? 0 : t <= 14 ? table[t - 10] : cap);

// Health of a basic enemy at a stat level on a campaign tier.
export function baseEnemyHealth(level: number, tier: number): number {
    const w = Math.max(1, Math.floor(level));
    const t = clampTier(tier);
    const bands = 1 + HP_BANDS.reduce((s, [c, d]) => s + c * bracket(w, d), 0);
    const exp = 2.130000114440918 + tierAddon(t, HP_EXP_ADDON, HP_EXP_CAP);
    const body = w ** exp * 0.05000000074505806 + 0.800000011920929 * w + 1.5;
    return bands * growth(w, HP_GROWTH) * body * TIER_PRESSURE[t];
}

// Attack of a basic enemy at a stat level on a campaign tier.
export function baseEnemyDamage(level: number, tier: number): number {
    const w = Math.max(1, Math.floor(level));
    const t = clampTier(tier);
    let env = (1 + DMG_BANDS.reduce((s, [c, d]) => s + c * bracket(w, d), 0)) * growth(w, DMG_GROWTH);
    if (t > 6) {
        for (const [rate, d, skipTier] of DMG_GROWTH_ABOVE_T6) if (skipTier !== t) env *= rate ** bracket(w, d);
    }
    const exp = 2.006999969482422 + tierAddon(t, DMG_EXP_ADDON, DMG_EXP_CAP);
    const body = w ** exp * 0.020999999716877937 + 0.1599999964237213 * w + 1.07;
    const p = TIER_PRESSURE[t];
    const tierFactor = t < 4 ? p * 0.9399999976158142
        : t < 7 ? p * 0.8999999761581421
            : t < 10 ? p * 0.8600000143051147
                : (p * 0.8600000143051147) / DAMAGE_TIER_DIVISOR[t];
    return env * body * tierFactor;
}

// ── Speed ──────────────────────────────────────────────────────
// A basic enemy's speed grows with the wave and tier up to ×12 (TheTowerSDK
// growth chain; confirmed at the cap). Types move at a fixed ratio of it
// (wiki); Fast jumps to about ×3.9 from wave 750 (the wiki's rounded figure —
// 0.06% fast against the game at T18 W6000).
const SPAWN_WEIGHT = [1.04, 1.1232, 1.257984, 1.484421, 1.810994, 2.209412, 2.695483, 3.288489,
    4.011957, 4.894588, 5.971397, 7.285105, 8.887828];

export function basicEnemySpeed(wave: number, tier: number): number {
    const w = Math.max(1, Math.floor(wave));
    const t = clampTier(tier);
    const weight = t < 9 ? 1 + (t - 1) * 0.04 : SPAWN_WEIGHT[Math.min(SPAWN_WEIGHT.length - 1, t - 9)];
    let mult = (1 + Math.max(0, w - 100) * 0.0003) * weight;
    if (w >= 141) mult *= 1.129;
    if (w >= 678) mult *= 1.324;
    if (w >= 3500) mult *= 1.15;
    return Math.min(12, mult);
}

const SPEED_RATIO: Record<EnemyType, number> = {
    Basic: 1, Fast: 2.1, Tank: 0.6, Ranged: 1.2, Boss: 0.4, Protector: 0.4,
    Vampire: 0.4, Scatter: 0.6, Ray: 0.4, Saboteur: 2.1, Commander: 0.2, Overcharge: 0.2,
};

// ── Type rules (relative to the wave's basic enemy) ────────────
const HEALTH_MULT: Record<EnemyType, number> = {
    Basic: 1, Fast: 1, Tank: 5, Ranged: 1, Boss: 20, Protector: 0.6,
    Vampire: 2, Scatter: 2, Ray: 1, Saboteur: 20, Commander: 20, Overcharge: 20,
};
// Scatter hits for half; Saboteur and Commander don't attack; Overcharge's
// attack is pinned to wave 1 of the tier (below).
const ATTACK_MULT: Record<EnemyType, number> = {
    Basic: 1, Fast: 1, Tank: 1, Ranged: 1, Boss: 1, Protector: 1,
    Vampire: 1, Scatter: 0.5, Ray: 1, Saboteur: 0, Commander: 0, Overcharge: 1,
};

// ── Enemy research labs ───────────────────────────────────────
// Each level takes 0.4% off that enemy's health or attack (0.3% for Boss and
// Protector), on its own row only. The fleet labs' per-level value is the
// code's assumption (0.4%, fits Overcharge on the checked account).
type LabRef = [name: string, perLevel: number];
const HEALTH_LAB: Partial<Record<EnemyType, LabRef>> = {
    Basic: ['Common Enemy Health', 0.004], Fast: ['Fast Enemy Health', 0.004],
    Tank: ['Tank Enemy Health', 0.004], Ranged: ['Ranged Enemy Health', 0.004],
    Boss: ['Boss Health', 0.003], Protector: ['Protector Health', 0.003],
    Vampire: ['Vampire Health', 0.004], Scatter: ['Scatter Health', 0.004], Ray: ['Ray Health', 0.004],
    Saboteur: ['Saboteur Enemy Health', 0.004], Commander: ['Commander Enemy Health', 0.004],
    Overcharge: ['Overcharge Enemy Health', 0.004],
};
const ATTACK_LAB: Partial<Record<EnemyType, LabRef>> = {
    Basic: ['Common Enemy Attack', 0.004], Fast: ['Fast Enemy Attack', 0.004],
    Tank: ['Tank Enemy Attack', 0.004], Ranged: ['Ranged Enemy Attack', 0.004],
    Boss: ['Boss Attack', 0.003], Vampire: ['Vampire Attack', 0.004],
    Scatter: ['Scatter Attack', 0.004], Ray: ['Ray Attack', 0.004],
    Overcharge: ['Overcharge Enemy Damage', 0.004],
};
const labCut = (labs: LabData, ref: LabRef | undefined) => (ref ? 1 - ref[1] * (labs[ref[0]] ?? 0) : 1);

// What an enemy type's health lab leaves of its health (1 = no lab).
export const healthLabCut = (labs: LabData, type: EnemyType) => labCut(labs, HEALTH_LAB[type]);

// ── Trade-off perks that change enemies ───────────────────────
// Improve Trade-Off Perks raises the benefit side by 1% a level (half for the
// Boss Health one; not at all for the ranged one).
export interface EnemyPerks {
    enemyHealth: boolean;   // Enemies Have −50% Health, but Tower Health Regen and Lifesteal −90%
    enemySpeed: boolean;    // Enemies Speed −40%, but Enemies Damage ×2.5
    enemyDamage: boolean;   // Enemies Damage −50%, but Tower Damage −50%
    rangedDamage: boolean;  // Ranged Enemies Attack Distance Reduced, but Ranged Enemies Damage ×3
    bossHealthDown: boolean; // Boss Health −70%, but Boss Speed +50%
    bossHealthUp: boolean;  // ×1.50 Tower Damage, but Bosses Have 8× Health
}

export const NO_ENEMY_PERKS: EnemyPerks = {
    enemyHealth: false, enemySpeed: false, enemyDamage: false,
    rangedDamage: false, bossHealthDown: false, bossHealthUp: false,
};

// ── Spawning ──────────────────────────────────────────────────
// Boss waves: every 10 waves to T13, then 9, 8, 7, 6 and every 5 from T18.
export const bossWaveInterval = (tier: number) => {
    const t = clampTier(tier);
    return t <= 13 ? 10 : t >= 18 ? 5 : 23 - t;
};

// Fleet waves: T14+ on their own schedule; every tier from a very high wave.
const FLEET_SCHEDULE: Record<number, [first: number, every: number]> = {
    14: [2495, 1000], 15: [1495, 750], 16: [995, 500], 17: [495, 250], 18: [95, 100], 19: [45, 50],
    20: [5, 10], 21: [5, 10], 22: [5, 10], 23: [5, 10], 24: [5, 10],
};
export function isFleetWave(tier: number, wave: number): boolean {
    const t = clampTier(tier);
    const late = 15000 - 250 * (Math.min(t, 21) - 1);   // 15,000 on T1 … 10,000 from T21
    if (wave >= late && (wave - late) % 100 === 0) return true;
    const s = FLEET_SCHEDULE[t];
    return !!s && wave >= s[0] && (wave - s[0]) % s[1] === 0;
}

// Elite spawn chance (wiki tables): the wave each band opens on each tier,
// for the first elite and for a second one. Shown in game as the share per
// elite type: 0.33, 1.33, 3, 5, 8, 12, 16, 21, 27, 33%; 100% once a second
// elite is certain too.
const ELITE_PCT = [0.33, 1.33, 3, 5, 8, 12, 16, 21, 27, 33];
const ELITE_SINGLE: number[][] = [
    [500, 450, 405, 365, 328, 295, 266, 239, 215, 194, 174, 157, 141, 127, 114, 41, 37, 33, 30, 27, 24, 21, 19, 17],
    [1000, 900, 810, 729, 656, 590, 531, 478, 430, 387, 349, 314, 282, 254, 229, 102, 92, 83, 75, 67, 60, 54, 49, 44],
    [1500, 1350, 1215, 1094, 984, 886, 797, 717, 646, 581, 523, 471, 424, 381, 343, 205, 185, 166, 150, 135, 121, 109, 98, 88],
    [2000, 1800, 1620, 1458, 1312, 1181, 1063, 957, 861, 775, 697, 628, 565, 508, 458, 308, 277, 250, 225, 203, 182, 164, 147, 132],
    [3000, 2700, 2430, 2187, 1968, 1771, 1594, 1435, 1291, 1162, 1046, 941, 847, 763, 686, 411, 370, 333, 300, 270, 243, 218, 196, 177],
    [4000, 3600, 3240, 2916, 2624, 2362, 2126, 1913, 1722, 1550, 1395, 1255, 1130, 1017, 915, 617, 555, 500, 450, 405, 364, 328, 295, 265],
    [5000, 4500, 4050, 3645, 3281, 2952, 2657, 2391, 2152, 1937, 1743, 1569, 1412, 1271, 1144, 823, 741, 667, 600, 540, 486, 437, 393, 354],
    [6000, 5400, 4860, 4374, 3937, 3543, 3189, 2870, 2583, 2325, 2092, 1883, 1695, 1525, 1373, 1029, 926, 833, 750, 675, 607, 547, 492, 443],
    [7000, 6300, 5670, 5103, 4593, 4133, 3720, 3348, 3013, 2712, 2441, 2197, 1977, 1779, 1601, 1235, 1111, 1000, 900, 810, 729, 656, 590, 531],
    [8000, 7200, 6480, 5832, 5249, 4724, 4252, 3826, 3444, 3099, 2789, 2510, 2259, 2033, 1830, 1441, 1297, 1167, 1050, 945, 851, 765, 689, 620],
];
const ELITE_DOUBLE: number[][] = [
    [8000, 7200, 6480, 5832, 5249, 4724, 4252, 3826, 3444, 3099, 2789, 2510, 2259, 2033, 1830, 1441, 1297, 1167, 1051, 946, 851, 765, 689, 620],
    [9000, 8100, 7290, 6561, 5905, 5314, 4783, 4305, 3874, 3487, 3138, 2824, 2542, 2288, 2059, 1647, 1482, 1334, 1201, 1080, 972, 875, 787, 709],
    [10000, 9000, 8100, 7290, 6561, 5905, 5314, 4783, 4305, 3874, 3487, 3138, 2824, 2542, 2288, 1853, 1667, 1500, 1350, 1215, 1094, 984, 886, 797],
    [11000, 9900, 8910, 8019, 7217, 6495, 5846, 5261, 4735, 4262, 3835, 3452, 3107, 2796, 2516, 2058, 1853, 1667, 1501, 1351, 1216, 1094, 984, 886],
    [12000, 10800, 9720, 8748, 7873, 7086, 6377, 5740, 5166, 4649, 4184, 3766, 3389, 3050, 2745, 2264, 2038, 1834, 1651, 1485, 1337, 1203, 1083, 974],
    [13000, 11700, 10530, 9477, 8529, 7676, 6909, 6218, 5596, 5036, 4533, 4080, 3672, 3304, 2974, 2470, 2223, 2001, 1801, 1621, 1459, 1313, 1181, 1063],
    [14000, 12600, 11340, 10206, 9185, 8267, 7440, 6696, 6027, 5424, 4881, 4394, 3954, 3559, 3203, 2676, 2408, 2168, 1951, 1756, 1580, 1422, 1280, 1152],
    [15000, 13500, 12150, 10935, 9841, 8857, 7972, 7174, 6457, 5811, 5230, 4708, 4236, 3813, 3432, 2882, 2594, 2334, 2101, 1891, 1702, 1531, 1378, 1240],
    [16000, 14400, 12960, 11664, 10497, 9448, 8503, 7653, 6887, 6199, 5579, 5022, 4519, 4067, 3660, 3088, 2779, 2501, 2251, 2026, 1823, 1641, 1477, 1329],
    [17000, 15300, 13770, 12393, 11153, 10038, 9034, 8131, 7318, 6586, 5928, 5336, 4801, 4321, 3889, 3294, 2964, 2668, 2402, 2161, 1945, 1750, 1575, 1418],
];

// Highest band reached (−1 = none yet).
const eliteBand = (table: number[][], tier: number, wave: number) => {
    const col = clampTier(tier) - 1;
    let band = -1;
    table.forEach((row, i) => { if (wave >= row[col]) band = i; });
    return band;
};

// Per-type elite chance as the panel shows it, and the second elite's chance.
export function eliteSpawn(tier: number, wave: number): { shown: number; second: number } {
    const single = eliteBand(ELITE_SINGLE, tier, wave);
    const double = eliteBand(ELITE_DOUBLE, tier, wave);
    const second = double >= 0 ? ELITE_PCT[double] : 0;
    if (double === ELITE_PCT.length - 1) return { shown: 100, second };
    return { shown: single >= 0 ? ELITE_PCT[single] : 0, second };
}

// ── The panel ─────────────────────────────────────────────────
export interface EnemyStatsInput {
    tier: number;
    wave: number;
    healthSkips: number;      // "Enemy Health Level Skip" in the panel's footer
    attackSkips: number;      // "Enemy Attack Level Skip"
    perks: EnemyPerks;
    improveTradeOff: number;  // Improve Trade-Off Perks lab level (0–10, +1% each)
    labs: LabData;            // enemy research levels by lab name
}

export interface EnemyRow {
    type: EnemyType;
    health: number;
    attack: number;
    speed: number;
    // Spawn chance in %; null for normal enemies (their mix isn't confirmed yet).
    spawn: number | null;
    secondElite?: number;     // elites: chance of a second one per wave
}

export interface EnemyPanel {
    healthLevel: number;
    attackLevel: number;
    rows: EnemyRow[];
}

export function enemyPanel(input: EnemyStatsInput): EnemyPanel {
    const tier = clampTier(input.tier);
    const wave = Math.max(1, Math.floor(input.wave));
    const healthLevel = Math.max(1, wave - Math.max(0, Math.floor(input.healthSkips)));
    const attackLevel = Math.max(1, wave - Math.max(0, Math.floor(input.attackSkips)));
    const { perks, labs } = input;
    const improve = Math.min(10, Math.max(0, input.improveTradeOff)) / 100;

    const hpBase = baseEnemyHealth(healthLevel, tier);
    const dmgBase = baseEnemyDamage(attackLevel, tier);
    const hpPerk = perks.enemyHealth ? 1 - 0.5 * (1 + improve) : 1;
    const dmgPerk = (perks.enemySpeed ? 2.5 : 1) * (perks.enemyDamage ? 1 - 0.5 * (1 + improve) : 1);
    const speedPerk = perks.enemySpeed ? 1 - 0.4 * (1 + improve) : 1;
    const basicSpeed = basicEnemySpeed(wave, tier) * speedPerk;
    const boss = wave % bossWaveInterval(tier) === 0;
    const fleet = isFleetWave(tier, wave);
    const elite = eliteSpawn(tier, wave);

    const rows = ENEMY_TYPES.map((type): EnemyRow => {
        let health = hpBase * HEALTH_MULT[type] * labCut(labs, HEALTH_LAB[type]) * hpPerk;
        let attack = (type === 'Overcharge' ? baseEnemyDamage(1, tier) : dmgBase)
            * ATTACK_MULT[type] * labCut(labs, ATTACK_LAB[type]) * dmgPerk;
        let speed = basicSpeed * SPEED_RATIO[type];
        if (type === 'Boss') {
            if (perks.bossHealthDown) {
                health *= 1 - 0.7 * (1 + improve / 2);
                speed *= 1.5;
            }
            if (perks.bossHealthUp) health *= 8;
        }
        if (type === 'Ranged' && perks.rangedDamage) attack *= 3;
        if (type === 'Fast') {
            speed = basicSpeed * (wave >= 750 ? 3.9 : 2.1) * (1 - 0.004 * (labs['Fast Enemy Speed'] ?? 0));
        }

        let spawn: number | null = null;
        let secondElite: number | undefined;
        if (type === 'Boss') spawn = boss ? 100 : 0;
        else if (FLEETS.has(type)) spawn = fleet ? 100 : 0;
        else if (ELITES.has(type)) {
            spawn = fleet ? 0 : elite.shown;
            secondElite = elite.second;
        }
        return { type, health, attack, speed, spawn, ...(secondElite !== undefined ? { secondElite } : {}) };
    });

    return { healthLevel, attackLevel, rows };
}
