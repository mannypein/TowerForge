// Tests for reading the game's JSON back out of a PDF (engine/pdfImport.ts),
// on made-up page text shaped like what pdf.js reads from a browser's
// "Save as PDF" of tool_export.json: one JSON line per text line, plus a
// date, a footer path + page number and Chrome's "Pretty-print" label on
// every page. (Checked against real Chrome / Edge PDFs of a full export:
// identical data back.)

import { describe, expect, it } from 'vitest';
import { jsonFromPdfPages, looksLikePdf, stripPageFurniture } from './pdfImport';
import type { PdfPage } from './pdfImport';
import { parseGameExport } from './gameExport';

// Splits `lines` into pages of `perPage` lines, top to bottom, adding the
// furniture a browser prints on each page.
function printed(lines: string[], perPage: number, furniture = true): PdfPage[] {
    const pages: PdfPage[] = [];
    const count = Math.ceil(lines.length / perPage);
    for (let p = 0; p < count; p++) {
        const body = lines.slice(p * perPage, (p + 1) * perPage).map((text, i) => ({ text, y: 750 - i * 12 }));
        // The browser shortens the long path more when the page number is longer.
        const path = `file:///C:/Users/someone/Downloads/exports/${p + 1 < 10 ? 'tool_export' : 'tool_expo…'}`;
        pages.push(furniture
            ? [...body, { text: 'Pretty-print', y: 760 }, { text: '10/16/26, 4:48 PM', y: 775 }, { text: `${path} ${p + 1}/${count}`, y: 17 }]
            : body);
    }
    return pages;
}

const exportJson = {
    VersionNumber: 1246, DataVersion: 30, Coins: 1.3308457992699089e19, Gems: 71,
    UserName: 'Someone', BannedPerksIndex: [3, 40],
    UnlockedFlags: Array(40).fill(false),   // a long run of "false," lines
    GlobalPresets: [{ PresetName: 'Preset 1', WorkshopIndex: 0 }, { PresetName: 'Farm', WorkshopIndex: 1 }],
};
const prettyLines = JSON.stringify(exportJson, null, 2).split('\n');

describe('reading the game export from a PDF', () => {
    it('gets the exact data back from a printed export', () => {
        expect(jsonFromPdfPages(printed(prettyLines, 6))).toEqual(exportJson);
        expect(jsonFromPdfPages(printed(prettyLines, 6, false))).toEqual(exportJson);
    });

    it('removes the date, path + page number and labels on every page', () => {
        const kept = stripPageFurniture(printed(prettyLines, 6)).flat();
        expect(kept).toEqual(prettyLines);
    });

    it('never removes real JSON lines, even ones that repeat on every page', () => {
        // Every page starts and ends with "false," at the same height.
        const lines = ['{', '"A": [', ...Array(60).fill('false,'), 'false', '],', '"B": 1', '}'];
        expect(stripPageFurniture(printed(lines, 6)).flat()).toEqual(lines);
    });

    it('rejoins lines that wrapped mid-value', () => {
        const oneLine = JSON.stringify(exportJson);
        const wrapped = oneLine.match(/.{1,37}/g)!;   // cut every 37 characters, wherever that lands
        expect(jsonFromPdfPages(printed(wrapped, 5))).toEqual(exportJson);
    });

    it('says why when the PDF has no game data', () => {
        expect(() => jsonFromPdfPages([[{ text: 'My shopping list', y: 700 }]])).toThrow(/No JSON data/);
        expect(() => jsonFromPdfPages([[]])).toThrow(/no readable text/);
        expect(() => jsonFromPdfPages(printed(prettyLines.slice(0, -4), 6))).toThrow(/isn't complete JSON/);
    });

    it('spots a PDF from its contents, whatever the file is called', () => {
        expect(looksLikePdf('%PDF-1.7\n%âãÏÓ')).toBe(true);
        expect(looksLikePdf('{"VersionNumber": 1}')).toBe(false);
    });

    it('treats "Preset1" (a wrapped "Preset 1") as a default preset name', () => {
        const imp = parseGameExport({ VersionNumber: 1, DataVersion: 1, Coins: 0, Gems: 0,
            GlobalPresets: [{ PresetName: 'Preset1', WorkshopIndex: 0 }, { PresetName: 'Farm', WorkshopIndex: 1 }] });
        expect(imp.presetNames.slice(0, 2)).toEqual(['', 'Farm']);
    });
});
