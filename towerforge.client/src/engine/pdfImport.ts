// ============================================================
//  TowerForge Companion — Game data from a PDF
//  Some players end up with their tool_export.json as a PDF (their
//  phone "printed" or "saved it as PDF"). The JSON is still in there
//  as text, so this reads the text back out with pdf.js and rebuilds
//  the JSON:
//    1. Read each page's text as lines (pdf.js text items, in order).
//    2. Drop what printing adds to every page — a date, the file name,
//       a URL, "3/520" — found as the same line at the same height on
//       most pages.
//    3. Join the lines and parse. If that fails (a long line wrapped
//       mid-value), join them with no line breaks and parse again.
//  pdf.js (~1 MB) loads only when a PDF is chosen. The text handling
//  is separate from pdf.js so it can be tested.
// ============================================================

export interface PdfLine {
    text: string;
    y: number;   // height on the page (PDF units)
}
export type PdfPage = PdfLine[];

// The parts of pdf.js used here (lets tests pass in the Node build).
interface PdfTextItem { str: string; hasEOL?: boolean; transform: number[] }
interface PdfJs {
    getDocument(src: { data: Uint8Array }): {
        promise: Promise<{
            numPages: number;
            getPage(n: number): Promise<{
                getTextContent(): Promise<{ items: unknown[] }>;
                cleanup(): void;
            }>;
        }>;
        destroy(): Promise<void>;
    };
}

const EDGE_LINES = 5;   // lines at the top and bottom of a page checked for headers / footers

// Every page's text as lines. A line ends at pdf.js's end-of-line mark or
// when the text moves to a new height.
export async function extractPdfPages(pdfjs: PdfJs, data: ArrayBuffer): Promise<PdfPage[]> {
    const task = pdfjs.getDocument({ data: new Uint8Array(data) });
    const pages: PdfPage[] = [];
    try {
        const doc = await task.promise;
        for (let n = 1; n <= doc.numPages; n++) {
            const page = await doc.getPage(n);
            const { items } = await page.getTextContent();
            const lines: PdfLine[] = [];
            let text = '';
            let y: number | null = null;
            const endLine = () => {
                if (text.trim()) lines.push({ text, y: y ?? 0 });
                text = '';
                y = null;
            };
            for (const raw of items) {
                const item = raw as PdfTextItem;
                if (typeof item.str !== 'string') continue;
                const itemY = item.transform?.[5] ?? 0;
                if (y !== null && Math.abs(itemY - y) > 1 && item.str) endLine();
                if (y === null && item.str) y = itemY;
                text += item.str;
                if (item.hasEOL) endLine();
            }
            endLine();
            pages.push(lines);
            page.cleanup();
        }
    } finally {
        await task.destroy();
    }
    return pages;
}

// A whole line of pretty-printed JSON — an optional "key": then a value or
// bracket and an optional comma. The game's export is printed one such line
// at a time, and these are never treated as headers / footers.
const JSON_LINE = /^\s*(?:"(?:[^"\\]|\\.)*"\s*:\s*)?(?:[[{]|[\]}]|"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)\s*[\]}]?,?\s*$/;

// Where a line sits and how it starts, digits blanked out — so "Page 3 of 9"
// matches "Page 4 of 9", and a footer path the browser shortens differently
// on each page still matches.
const PREFIX = 10;
const pattern = (line: PdfLine) =>
    `${Math.round(line.y)}|${line.text.trim().replace(/\d+/g, '#').slice(0, PREFIX)}`;

// Page text without the headers / footers printing adds: lines near the top
// or bottom of a page that aren't JSON and start the same way at the same
// height on at least half the pages.
export function stripPageFurniture(pages: PdfPage[]): string[][] {
    const candidate = (page: PdfPage, line: PdfLine, i: number) =>
        (i < EDGE_LINES || i >= page.length - EDGE_LINES) && !JSON_LINE.test(line.text);
    if (pages.length < 2) return pages.map(page => page.map(l => l.text));

    const counts = new Map<string, number>();
    for (const page of pages) {
        const seen = new Set(page.filter((l, i) => candidate(page, l, i)).map(pattern));
        for (const key of seen) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const minPages = Math.max(2, Math.ceil(pages.length / 2));
    const furniture = new Set([...counts].filter(([, n]) => n >= minPages).map(([key]) => key));
    return pages.map(page => page
        .filter((l, i) => !(candidate(page, l, i) && furniture.has(pattern(l))))
        .map(l => l.text));
}

// The JSON object in the PDF's text, or an error saying why not.
export function jsonFromPdfPages(pages: PdfPage[]): unknown {
    const lines = stripPageFurniture(pages).flat();
    if (!lines.length) throw new Error('The PDF has no readable text (it may be a scanned image).');
    let lastError: unknown = null;
    for (const text of [lines.join('\n'), lines.join('')]) {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start < 0 || end <= start) continue;
        try {
            return JSON.parse(text.slice(start, end + 1));
        } catch (err) {
            lastError = err;
        }
    }
    throw new Error(lastError instanceof Error
        ? `The text in the PDF isn't complete JSON (${lastError.message}).`
        : 'No JSON data was found in the PDF.');
}

// Reads a PDF file in the browser and returns the JSON it contains.
export async function jsonFromPdf(data: ArrayBuffer): Promise<unknown> {
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return jsonFromPdfPages(await extractPdfPages(pdfjs as unknown as PdfJs, data));
}

// A PDF by type, name or content ("%PDF" at the start).
export const isPdfFile = (file: File): boolean =>
    file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
export const looksLikePdf = (text: string): boolean => text.trimStart().startsWith('%PDF');
