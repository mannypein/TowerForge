// ============================================================
//  TowerForge Companion — Module Board Layout
//  Where the 8 module slots sit around the tower, like the game's
//  Modules screen. Used by the Modules tab and the shared-stats
//  Modules card (with components/common/TowerArt).
// ============================================================

import type { ModuleType } from '../types/gameTypes';

export type SlotKey = 'main' | 'assist';

// Cannon top-left, armor bottom-left, generator top-right, core
// bottom-right; assists on the outside. Rows: left side top, right
// side top, left side bottom, right side bottom.
export const BOARD: [ModuleType, SlotKey][][] = [
    [['cannon', 'assist'], ['cannon', 'main']],
    [['generator', 'main'], ['generator', 'assist']],
    [['armor', 'assist'], ['armor', 'main']],
    [['core', 'main'], ['core', 'assist']],
];
