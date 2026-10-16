// ============================================================
//  TowerForge Companion — Spotlight Workshop Values
//  Real in-game wiki data for SL workshop stat progressions
//
//  Source: Game Wiki - Spotlight stats
//  Last Updated: 2026-07-01
// ============================================================

/**
 * Spotlight Bonus stat progression
 * Maps level (0-25) to multiplier value
 * Level 0 = 8x, Level 25 = 43x
 */
export const SL_BONUS_VALUES = [
    8.0,    // Lv 0 (0 stones)
    9.4,    // Lv 1 (5 stones)
    10.8,   // Lv 2 (13 stones)
    12.2,   // Lv 3 (21 stones)
    13.6,   // Lv 4 (30 stones)
    15.0,   // Lv 5 (40 stones)
    16.4,   // Lv 6 (52 stones)
    17.8,   // Lv 7 (65 stones)
    19.2,   // Lv 8 (80 stones)
    20.6,   // Lv 9 (95 stones)
    22.0,   // Lv 10 (112 stones)
    23.4,   // Lv 11 (133 stones)
    24.8,   // Lv 12 (150 stones)
    26.2,   // Lv 13 (180 stones)
    27.6,   // Lv 14 (220 stones)
    29.0,   // Lv 15 (280 stones)
    30.4,   // Lv 16 (320 stones)
    31.8,   // Lv 17 (360 stones)
    33.2,   // Lv 18 (420 stones)
    34.6,   // Lv 19 (500 stones)
    36.0,   // Lv 20 (600 stones)
    37.4,   // Lv 21 (720 stones)
    38.8,   // Lv 22 (850 stones)
    40.2,   // Lv 23 (1000 stones)
    41.6,   // Lv 24 (1175 stones)
    43.0,   // Lv 25 (1400 stones)
];

/**
 * Spotlight Bonus stone costs
 * Index matches SL_BONUS_VALUES level
 */
export const SL_BONUS_COSTS = [
    0, 5, 13, 21, 30, 40, 52, 65, 80, 95,
    112, 133, 150, 180, 220, 280, 320, 360, 420, 500,
    600, 720, 850, 1000, 1175, 1400,
];

/**
 * Spotlight Angle stat progression
 * Maps level (0-85) to angle value
 * Level 0 = 30 angle, Level 85+ = 80 angle
 */
export const SL_ANGLE_VALUES = [
    30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55,
    56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80,
    // Continues beyond level 50; capped at 80
];

/**
 * Spotlight Angle stone costs
 * Index matches SL_ANGLE_VALUES level
 */
export const SL_ANGLE_COSTS = [
    0, 5, 16, 27, 38, 49, 60, 71, 82, 93, 104, 115, 126, 137, 148, 159, 170, 181, 192, 203, 214, 225, 236, 247, 258, 269,
    280, 291, 302, 313, 324, 337, 352, 369, 388, 409, 432, 457, 484, 513, 544, 577, 612, 649, 688, 729, 772, 817, 864, 913, 964,
    // Costs continue beyond level 50
];

/**
 * Spotlight Quantity stat progression
 * Maps level (0-3) to quantity value
 * Level 0 = 1 missile, Level 3 = 4 missiles
 */
export const SL_QUANTITY_VALUES = [
    1,      // Lv 0 (0 stones)
    2,      // Lv 1 (375 stones)
    3,      // Lv 2 (850 stones)
    4,      // Lv 3 (2500 stones)
];

/**
 * Spotlight Quantity stone costs
 * Index matches SL_QUANTITY_VALUES level
 */
export const SL_QUANTITY_COSTS = [
    0, 375, 850, 2500,
];

/**
 * Helper: Get Spotlight Bonus multiplier by workshop level
 */
export function getSlBonusMultiplier(level: number): number {
    if (level < 0) return SL_BONUS_VALUES[0];
    if (level >= SL_BONUS_VALUES.length) return SL_BONUS_VALUES[SL_BONUS_VALUES.length - 1];
    return SL_BONUS_VALUES[level];
}

/**
 * Helper: Get Spotlight Angle value by workshop level
 */
export function getSlAngleValue(level: number): number {
    if (level < 0) return SL_ANGLE_VALUES[0];
    if (level >= SL_ANGLE_VALUES.length) return SL_ANGLE_VALUES[SL_ANGLE_VALUES.length - 1];
    return SL_ANGLE_VALUES[level];
}

/**
 * Helper: Get Spotlight Quantity value by workshop level
 */
export function getSlQuantityValue(level: number): number {
    if (level < 0) return SL_QUANTITY_VALUES[0];
    if (level >= SL_QUANTITY_VALUES.length) return SL_QUANTITY_VALUES[SL_QUANTITY_VALUES.length - 1];
    return SL_QUANTITY_VALUES[level];
}
