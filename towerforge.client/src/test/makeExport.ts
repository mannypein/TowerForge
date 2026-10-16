// ============================================================
//  TowerForge Companion — Test fixtures
//  A made-up game export (tool_export.json) built field by field.
//  Never put a real player's export in tests — the repo is public.
// ============================================================

import { GAME_LABS } from '../constants/gameExportMaps';

type Raw = Record<string, unknown>;

// The minimum isGameExport() needs, plus anything the test sets.
export function makeExport(fields: Raw = {}): Raw {
    return {
        VersionNumber: 270,
        DataVersion: 3,
        Coins: 1e15,
        Gems: 500,
        Stones: 1200,
        Medals: 300,
        Cells: 40,
        Keys: 2,
        Tokens: 0,
        Bits: 0,
        UserName: 'TestPlayer',
        ...fields,
    };
}

export const zeros = (n: number): number[] => Array(n).fill(0);

// ResearchLevel index of a lab, from the import's own table.
export function labIndex(name: string): number {
    const hit = Object.entries(GAME_LABS).find(([, n]) => n === name);
    if (!hit) throw new Error(`No game number for lab "${name}"`);
    return Number(hit[0]);
}

// A ResearchLevel array with some labs set.
export function research(levels: Record<number, number>, length = 260): number[] {
    const out = zeros(length);
    for (const [i, v] of Object.entries(levels)) out[Number(i)] = v;
    return out;
}

// One owned module as the export stores it.
export function gameModule(guid: string, infoIndex: number, rarityCode: number, effects: number[], maxLevelReached = 300): Raw {
    return {
        Guid: guid,
        InfoIndex: infoIndex,
        CurrentRarity: rarityCode,
        MaxLevelReached: maxLevelReached,
        Effects: [...effects, ...zeros(8 - effects.length)],
    };
}

// One BattleHistory entry with sensible defaults.
export function battle(fields: Raw = {}): Raw {
    return {
        BattleDate: '2026-10-01T12:00:00Z',
        Tier: 18,
        Wave: 8000,
        GameTime: 40000,
        RealTime: 20000,
        CoinsEarned: 1e15,
        TotalEnemies: 300000,
        IsTournament: false,
        ...fields,
    };
}
