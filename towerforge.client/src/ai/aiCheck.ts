// ============================================================
//  TowerForge Companion — Ask AI: checking an answer's numbers
//  Every number in an answer should come from the data TowerForge worked
//  out (or the question). The ones that don't are listed under the answer
//  ("not one of TowerForge's numbers") so the player knows what to check —
//  a small model sometimes adds or rounds wrong ("+9.8M" for 444.78M →
//  453.58M). The test bench grades with the same check (bench/benchGrade.ts).
//  Pure functions.
// ============================================================

// The game's letters (q quadrillion, Q quintillion — case matters).
const LETTERS: Record<string, number> = {
    K: 1e3, k: 1e3, M: 1e6, B: 1e9, T: 1e12, q: 1e15, Q: 1e18, s: 1e21, S: 1e24, O: 1e27, N: 1e30, D: 1e33,
};

// Every number in a text with its value: "1,500", "+5.7", "W8,600", "4.67Q",
// "23%", "12h 30m" (each part). Dates and list markers ("1.") are skipped.
// `values`: every way it reads — "40s" is 40 seconds as often as 40
// sextillion (the game's s), so both count (the notes' "Cooldown 180s"
// flagged an answer's "180 seconds", 2026-10-29).
export function numbersIn(text: string): { raw: string; value: number; values: number[] }[] {
    const out: { raw: string; value: number; values: number[] }[] = [];
    const clean = text.replace(/\b\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?\b/g, ' ').replace(/^\s*\d+\.\s/gm, ' ');
    const re = /(\d[\d,]*(?:\.\d+)?)(\s?(?:K|M|B|T|q|Q|s|S|O|N|D)(?![a-zA-Z]))?/g;
    for (let m = re.exec(clean); m; m = re.exec(clean)) {
        const n = Number(m[1].replace(/,/g, ''));
        if (!Number.isFinite(n)) continue;
        const letter = m[2]?.trim();
        const value = letter ? n * LETTERS[letter] : n;
        out.push({ raw: m[0].trim(), value, values: letter === 's' ? [value, n] : [value] });
    }
    return out;
}

// Same within rounding: "5.7" for 5.66, "99q" for 98.9q, "3,190" for 3,190.
export function close(a: number, b: number): boolean {
    if (a === b) return true;
    const big = Math.max(Math.abs(a), Math.abs(b));
    return big > 0 && Math.abs(a - b) / big <= 0.011;
}

// Numbers in the answer that aren't in the data or the question. Small
// counts (1–12) pass: "3 picks", "top 2", tier numbers in passing.
export function unverifiedNumbers(answer: string, data: string, question: string): string[] {
    const known = [...numbersIn(data), ...numbersIn(question)].flatMap(n => n.values);
    return [...new Set(numbersIn(answer)
        .filter(n => !n.values.some(v => Number.isInteger(v) && v <= 12))
        .filter(n => !n.values.some(v => known.some(k => close(k, v))))
        .map(n => n.raw))];
}
