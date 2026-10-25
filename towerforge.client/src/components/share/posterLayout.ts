// ============================================================
//  TowerForge Companion — Poster page layout
//  Splits a poster's blocks (group headings, rows of tiles, the
//  module board…) into pages no taller than 4:5, the tallest shape a
//  Reddit post shows whole on a phone (1080×1350, the ratio Reddit's
//  own image specs and the social-media size guides recommend; a
//  taller image is shrunk to fit the post box, which is why the long
//  posters looked small). Pages of one export share one height, so a
//  Reddit gallery of them doesn't jump in size.
// ============================================================

export const POSTER_MAX_RATIO = 1.25;   // height / width: 4:5

export interface PageInput {
    heights: number[];              // each block's height
    keepWithNext: boolean[];        // a heading: never the last thing on a page
    contHeights: (number | null)[]; // height of the "continued" heading a block repeats at the top of a new page
    avail: number;                  // room for blocks on one page
    gap: number;                    // space between blocks
}

export interface PagePlan {
    cont: number | null;   // the block whose "continued" heading opens the page
    blocks: number[];
    used: number;          // height of the page's blocks, gaps included
}

// Greedy: blocks go in order, a new page starts when the next one (with
// the block it keeps with) doesn't fit. A block taller than a page gets
// a page of its own.
export function paginate({ heights, keepWithNext, contHeights, avail, gap }: PageInput): PagePlan[] {
    const pages: PagePlan[] = [];
    let cur: PagePlan = { cont: null, blocks: [], used: 0 };
    const hasItems = (p: PagePlan) => p.blocks.length > 0 || p.cont !== null;

    heights.forEach((h, i) => {
        const withNext = keepWithNext[i] && i + 1 < heights.length ? gap + heights[i + 1] : 0;
        if (hasItems(cur) && cur.used + gap + h + withNext > avail) {
            pages.push(cur);
            cur = { cont: null, blocks: [], used: 0 };
            const contH = contHeights[i];
            if (!keepWithNext[i] && contH != null) {
                cur.cont = i;
                cur.used = contH;
            }
        }
        cur.used += (hasItems(cur) ? gap : 0) + h;
        cur.blocks.push(i);
    });
    if (hasItems(cur)) pages.push(cur);
    return pages;
}

// The same number of pages, filled evenly: the smallest page that still
// needs no more pages than a full one. Without it the last page of a
// gallery could hold one row under a screen of empty space.
export function paginateEvenly(input: PageInput): PagePlan[] {
    const full = paginate(input);
    if (full.length <= 1) return full;
    let lo = Math.max(...input.heights.map((h, i) => h + (input.contHeights[i] ?? 0) + input.gap));
    let hi = input.avail;
    if (lo >= hi) return full;
    while (hi - lo > 1) {
        const mid = (lo + hi) / 2;
        if (paginate({ ...input, avail: mid }).length <= full.length) hi = mid;
        else lo = mid;
    }
    return paginate({ ...input, avail: hi });
}
