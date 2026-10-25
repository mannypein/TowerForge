// Poster pages: blocks fill a page in order, headings stay with what
// follows them, and a group cut across pages repeats its heading.

import { describe, expect, it } from 'vitest';
import { paginate, paginateEvenly } from './posterLayout';

const input = (heights: number[], heading: number[] = [], avail = 100) => ({
    heights,
    keepWithNext: heights.map((_, i) => heading.includes(i)),
    contHeights: heights.map((_, i) => (heading.includes(i) ? null : 10)),
    avail,
    gap: 5,
});

describe('poster pages', () => {
    it('keeps everything on one page when it fits', () => {
        const pages = paginate(input([30, 30, 30]));
        expect(pages.map(p => p.blocks)).toEqual([[0, 1, 2]]);
        expect(pages[0].used).toBe(100);           // 3 × 30 + 2 gaps
    });

    it('starts a new page when the next block doesn’t fit', () => {
        const pages = paginate(input([40, 40, 40]));
        expect(pages.map(p => p.blocks)).toEqual([[0, 1], [2]]);
    });

    it('moves a heading to the next page with the row after it', () => {
        // rows 40 + 40, then a heading (10) whose row would overflow
        const pages = paginate(input([40, 40, 10, 40], [2]));
        expect(pages.map(p => p.blocks)).toEqual([[0, 1], [2, 3]]);
        expect(pages[1].cont).toBeNull();
    });

    it('repeats the group’s heading when its rows go on to the next page', () => {
        const pages = paginate(input([10, 40, 40, 40], [0]));
        expect(pages.map(p => p.blocks)).toEqual([[0, 1, 2], [3]]);
        expect(pages[1].cont).toBe(3);
        expect(pages[1].used).toBe(10 + 5 + 40);   // the continued heading counts
    });

    it('fills the pages evenly instead of leaving the last one nearly empty', () => {
        // greedy: 3 rows, then 1 → evenly: 2 and 2
        const rows = [30, 30, 30, 30];
        expect(paginate(input(rows)).map(p => p.blocks)).toEqual([[0, 1, 2], [3]]);
        const even = paginateEvenly(input(rows));
        expect(even.map(p => p.blocks)).toEqual([[0, 1], [2, 3]]);
        expect(even.map(p => p.used)).toEqual([65, 80]);   // page 2 opens with the continued heading
        expect(paginateEvenly(input([30, 30])).map(p => p.blocks)).toEqual([[0, 1]]);   // one page stays as it is
    });

    it('gives a block taller than a page a page of its own', () => {
        const pages = paginate(input([20, 150, 20]));
        expect(pages.map(p => p.blocks)).toEqual([[0], [1], [2]]);
    });
});
