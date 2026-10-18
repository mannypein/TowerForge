// ============================================================
//  TowerForge Companion — Battle Report Parser
//  Reads the end-of-run "Battle Report" text players copy from the
//  game, so the optimizer can calibrate to their real runs.
//
//  The report is "Label<TAB>Value" lines grouped under section
//  headers (lines with no value). Labels repeat across sections
//  ("Golden Tower" is in Killed With Effect Active, Coins and Cash),
//  so values are stored per section.
// ============================================================

import { parseGameNumber } from './gameNumbers';

// "1d 14h 30m 17s" → seconds.
export function parseDuration(raw: string): number {
    let total = 0;
    for (const [, n, unit] of raw.matchAll(/(\d+)\s*([dhms])/g)) {
        total += Number(n) * { d: 86400, h: 3600, m: 60, s: 1 }[unit as 'd' | 'h' | 'm' | 's'];
    }
    return total;
}

// "1248681 [100.0%]" → 1.0
function parseBracketPct(raw: string): number | null {
    const m = raw.match(/\[([\d.]+)%\]/);
    return m ? parseFloat(m[1]) / 100 : null;
}

// Damage dealt in the run, by source (same units as the game's report).
export interface DamageBreakdown {
    total: number;
    chainLightning: number;
    smartMissiles: number;
    deathWave: number;
    innerLandMines: number;
    poisonSwamp: number;
    blackHole: number;
    orbs: number;
    projectiles: number;
    rendArmor: number;
    landMines: number;
    thorns: number;
}

export interface BattleReport {
    date: string;
    tier: number;
    wave: number;
    gameTimeSec: number;
    realTimeSec: number;
    coinsEarned: number;
    coinsPerHour: number;
    totalEnemies: number;
    wavesSkipped: number;
    largestGoldenCombo: number;
    recoveryPackages: number;   // packages received during the run (Utility)
    thornsKills: number;        // enemies destroyed by thorns
    // Share of kills made while each effect was active ("Killed With Effect Active").
    killedWithEffect: {
        goldenTower: number | null;
        deathWave: number | null;
        spotlight: number | null;
        goldenBot: number | null;
        blackHole: number | null;
        orbs: number | null;
    };
    // Coins section breakdown.
    coins: {
        goldenCombo: number;
        waveSkip: number;
        coinsPerWave: number;
        criticalCoin: number;
        fetched: number;
    };
    tournament?: boolean;       // set for runs imported from the game's battle history
    // From the game's battle history only (not in the pasted report) —
    // run rates for unique module effects (engine/runRates.ts).
    bossKills?: number;
    eliteKills?: number;        // Vampire + Ray + Scatter
    fleetKills?: number;        // Commander + Saboteur + Overcharge
    cashEarned?: number;
    projectileCount?: number;   // tower shots fired
    clHits?: number;            // enemies hit by Chain Lightning (each counted once)
    psHits?: number;            // enemies hit by Poison Swamp
    orbHits?: number;
    damage?: DamageBreakdown;   // damage by source (calibrates Glass Cannon)
    // Imported runs only: when the run was played (ms since 1970) and every
    // field the game stored for it (~150 run totals, `BattleHistory` names),
    // kept for calibration and the run simulator (docs/run-simulation.md).
    time?: number;
    raw?: Record<string, BattleField>;
}

export type BattleField = number | string | boolean | number[];

// The game's export only holds the last 5 runs, so each import adds its runs
// to the ones already kept instead of replacing them. A run seen again (same
// tier, wave and times) is replaced by the fresh copy, which has every field.
// Oldest → newest; runs kept before times were stored sort first. The newest
// MAX_STORED_BATTLES are kept (up to ~10 KB each: ~1 MB at the cap, under
// the server's 2 MB limit for a synced save).
export const MAX_STORED_BATTLES = 100;

const runKey = (b: BattleReport) =>
    [b.tier, b.wave, Math.round(b.gameTimeSec), Math.round(b.realTimeSec), b.tournament ? 1 : 0].join('|');

export function mergeBattles(stored: BattleReport[], incoming: BattleReport[]): BattleReport[] {
    const byKey = new Map<string, BattleReport>();
    for (const b of stored) byKey.set(runKey(b), b);
    for (const b of incoming) byKey.set(runKey(b), b);
    return [...byKey.values()]
        .sort((x, y) => (x.time ?? -Infinity) - (y.time ?? -Infinity))
        .slice(-MAX_STORED_BATTLES);
}

type Sections = Record<string, Record<string, string>>;

function splitSections(text: string): Sections {
    const sections: Sections = {};
    let current = 'Battle Report';
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;

        let label: string;
        let value: string;
        const tab = rawLine.indexOf('\t');
        if (tab >= 0) {
            label = rawLine.slice(0, tab).trim();
            value = rawLine.slice(tab + 1).trim();
        } else {
            // Tabs can get lost when copying — fall back to "label <number…>".
            const m = line.match(/^(.*?[A-Za-z)])\s+([$\d].*)$/);
            if (!m) { current = line; continue; }   // no value → section header
            label = m[1].trim();
            value = m[2].trim();
        }
        if (!value) { current = label; continue; }
        (sections[current] ??= {})[label] = value;
    }
    return sections;
}

// Returns null when the text doesn't look like a Battle Report.
export function parseBattleReport(text: string): BattleReport | null {
    const s = splitSections(text);
    const top = s['Battle Report'] ?? {};
    const coins = s['Coins'] ?? {};
    const effect = s['Killed With Effect Active'] ?? {};
    const records = s['Records'] ?? {};
    const counts = s['Counts'] ?? {};
    const enemies = s['Total Enemies'] ?? {};
    const utility = s['Utility'] ?? {};
    const destroyed = s['Enemies Destroyed By'] ?? {};

    const gameTimeSec = parseDuration(top['Game Time'] ?? '');
    const coinsEarned = parseGameNumber(top['Coins Earned'] ?? coins['Coins Earned'] ?? '');
    if (!gameTimeSec || !Number.isFinite(coinsEarned)) return null;

    const num = (v: string | undefined) => {
        const n = v ? parseGameNumber(v) : NaN;
        return Number.isFinite(n) ? n : 0;
    };
    const pct = (key: string) => (effect[key] ? parseBracketPct(effect[key]) : null);

    // Damage lines can sit in any section; match their labels loosely
    // ("Chain Lightning Damage", "Chain Lightning" under a Damage header…).
    const all = Object.entries(s).flatMap(([sec, rows]) => Object.entries(rows).map(([k, v]) => [`${sec} ${k}`.toLowerCase(), k.toLowerCase(), v] as const));
    const dmg = (...names: string[]) => {
        const hit = all.find(([full, label]) => names.some(n => label === n || (full.includes('damage') && label === n.replace(/ damage$/, ''))));
        return hit ? num(hit[2]) : 0;
    };
    const total = dmg('damage dealt');
    const damage = total > 0 ? {
        total,
        chainLightning: dmg('chain lightning damage'),
        smartMissiles: dmg('smart missile damage', 'smart missiles damage'),
        deathWave: dmg('death wave damage'),
        innerLandMines: dmg('inner land mine damage', 'inner land mines damage'),
        poisonSwamp: dmg('swamp damage', 'poison swamp damage'),
        blackHole: dmg('black hole damage'),
        orbs: dmg('orb damage'),
        projectiles: dmg('projectiles damage'),
        rendArmor: dmg('rend armor damage'),
        landMines: dmg('land mine damage'),
        thorns: dmg('thorn damage'),
    } : undefined;

    return {
        date: top['Battle Date'] ?? '',
        tier: num(top['Tier']),
        wave: num(top['Wave']),
        gameTimeSec,
        realTimeSec: parseDuration(top['Real Time'] ?? ''),
        coinsEarned,
        coinsPerHour: num(top['Coins Per Hour']),
        totalEnemies: num(enemies['Total Enemies']),
        wavesSkipped: num(counts['Waves Skipped']),
        largestGoldenCombo: num(records['Largest Golden Combo']),
        recoveryPackages: num(utility['Recovery Packages']),
        thornsKills: num(destroyed['Thorns']),
        killedWithEffect: {
            goldenTower: pct('Golden Tower'),
            deathWave: pct('Death Wave'),
            spotlight: pct('Spotlight'),
            goldenBot: pct('Golden Bot'),
            blackHole: pct('Black Hole'),
            orbs: pct('Orbs'),
        },
        coins: {
            goldenCombo: num(coins['Golden Combo']),
            waveSkip: num(coins['Wave Skip']),
            coinsPerWave: num(coins['Coins / Wave']),
            criticalCoin: num(coins['Critical Coin']),
            fetched: num(coins['Coins Fetched']),
        },
        damage,
        projectileCount: dmg('projectiles count') || undefined,
    };
}

// The report the optimizer calibrates from: a run picked from the imported
// game data (choice ≥ 0), otherwise the pasted Battle Report text.
export function activeBattleReport(text: string, imported: BattleReport[], choice: number): BattleReport | null {
    if (choice >= 0 && imported[choice]) return imported[choice];
    return text ? parseBattleReport(text) : null;
}
