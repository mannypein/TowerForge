// Elite cells per run: the run's cells per elite split into the part the
// Cells/Kill Bonus enhancement multiplies and the Cells card's flat cells
// (wiki Currencies page), so an upgrade changes the right part.

import { describe, expect, it } from 'vitest';
import { cellParts, cellsPerRun } from './cells';
import type { OptimizerSnapshot } from './optimizer';
import { parseGameExport } from './gameExport';
import { battle, makeExport } from '../test/makeExport';
import { WS_ENH } from '../constants/gameData';

const ENH = WS_ENH.utility.findIndex(([n]) => n === 'Cells/Kill Bonus');
const snap = (enhLv: number | null, cardStars = 0) => {
    const d: number[] = [];
    const u: boolean[] = [];
    if (enhLv !== null) { d[ENH] = enhLv; u[ENH] = true; }
    return {
        presetIdx: 0,
        enhData: { d: { utility: d }, u: { utility: u } },
        cardData: { data: cardStars ? { Cells: { s: cardStars } } : {}, slots: 1, presets: { 0: cardStars ? ['Cells'] : [] } },
    } as unknown as OptimizerSnapshot;
};
// 1,000 elites gave 20,000 cells.
const report = parseGameExport(makeExport({ BattleHistory: [battle({ CellsEarned: 20000, TotalElites: 1000 })] })).battles[0];

describe('elite cells per run', () => {
    it('reads the enhancement and the card', () => {
        expect(cellParts(snap(50, 7))).toEqual({ enhancement: 1.5, card: 14, mastery: 1 });
        expect(cellParts(snap(null))).toEqual({ enhancement: 1, card: 0, mastery: 1 });
    });

    it('scales the multiplied part with the enhancement and adds the card after it', () => {
        // 20 a elite = k × 1.5 + 14 → k = 4; at ×2: 4 × 2 + 14 = 22 a elite.
        expect(cellsPerRun(snap(50, 7), snap(100, 7), report)!.to).toBeCloseTo(22000, 6);
        // Without the card: 20 = k × 1.5 → k = 13.33; at ×2: 26.67 a elite.
        expect(cellsPerRun(snap(50), snap(100), report)!.to).toBeCloseTo(20000 * 2 / 1.5, 6);
        expect(cellsPerRun(snap(50), snap(50), report)!.to).toBeCloseTo(20000, 6);
    });

    it('says nothing without cells or elites in the run', () => {
        const empty = parseGameExport(makeExport({ BattleHistory: [battle({})] })).battles[0];
        expect(cellsPerRun(snap(50), snap(100), empty)).toBeNull();
        expect(cellsPerRun(snap(50), snap(100), null)).toBeNull();
    });
});
