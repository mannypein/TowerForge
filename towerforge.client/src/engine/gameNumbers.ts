// ============================================================
//  TowerForge Companion — Game number format
//  The Tower writes big numbers with letter suffixes
//  (K, M, B, T, q, Q, s, S, o, N, d, U, D). Case matters.
// ============================================================

const SUFFIXES: [string, number][] = [
    ['D', 1e39], ['U', 1e36], ['d', 1e33], ['N', 1e30], ['o', 1e27], ['S', 1e24],
    ['s', 1e21], ['Q', 1e18], ['q', 1e15], ['T', 1e12], ['B', 1e9], ['M', 1e6], ['K', 1e3],
];
const SUFFIX_VALUE: Record<string, number> = Object.fromEntries(SUFFIXES);

// "3.05Q" → 3.05e18, "$791.44B" → 7.9144e11, "1,234" → 1234, "1248681 [100.0%]" → 1248681.
// Returns NaN for text it doesn't understand.
export function parseGameNumber(raw: string): number {
    const m = raw.trim().replace(/^\$/, '').replace(/,/g, '').match(/^(-?[\d.]+)\s*([A-Za-z]*)/);
    if (!m) return NaN;
    const base = parseFloat(m[1]);
    if (!m[2]) return base;
    const mult = SUFFIX_VALUE[m[2]];
    return mult ? base * mult : NaN;
}

// 3.05e18 → "3.05Q"; small numbers keep up to 2 decimals without trailing zeros.
export function formatGameNumber(n: number): string {
    if (!Number.isFinite(n)) return '0';
    const abs = Math.abs(n);
    for (const [suffix, value] of SUFFIXES) {
        if (abs >= value) return `${(n / value).toFixed(2)}${suffix}`;
    }
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}
