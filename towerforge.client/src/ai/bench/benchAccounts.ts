// ============================================================
//  TowerForge Companion — Ask AI test bench: made-up accounts
//  Three accounts at different stages of the game, written as the game's
//  export (tool_export.json) so they go through Import Game Data like a
//  player's file: early (T5, one UW, no level skips), mid (T11, five
//  UWs, modules and two bots, tournaments in Gold) and late (T18, every
//  UW and UW+, Ancestral modules, Legend tournaments). Every number is
//  made up — never a real player's export (the repo is public). Levels
//  are a share of each upgrade's max, varied a little per upgrade so the
//  Optimizer has real choices.
// ============================================================

import { LABS, UWS, WS_STATS, WS_UNLOCK_GROUPS } from '../../constants/gameData';
import { GAME_CARDS, GAME_LABS, MASTERY_LAB_START } from '../../constants/gameExportMaps';
import { BOTS_CONFIG } from '../../constants/botData';
import { battle, gameModule, labIndex, makeExport, zeros } from '../../test/makeExport';
import type { BuildType } from '../../types/gameTypes';

type Raw = Record<string, unknown>;

export interface BenchAccount {
    key: 'early' | 'mid' | 'late';
    label: string;
    build: BuildType | '';      // set on the Profile page after the import ('' = not set)
    raw: Raw;                   // the made-up export
}

// The same "random" share every time: a hash of the name.
function jitter(name: string): number {
    let h = 2166136261;
    for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return ((h >>> 0) % 1000) / 1000;
}
const share = (max: number, f: number, name: string) =>
    Math.max(0, Math.min(max, Math.round(max * f * (0.6 + 0.8 * jitter(name)))));

const CATS = ['attack', 'defense', 'utility'] as const;
const WS_LIVE = { attack: 'UpgradeWorkshopLevel', defense: 'UpgradeWorkshopDefenseLevel', utility: 'UpgradeWorkshopUtilityLevel' };
const WS_UNLOCK = { attack: 'UpgradeTierUnlocked', defense: 'UpgradeDefenseTierUnlocked', utility: 'UpgradeUtilityTierUnlocked' };

// Workshop levels with the first `groups` stat groups of each category bought.
function workshop(f: number, groups: Record<typeof CATS[number], number>): Raw {
    const out: Raw = {};
    for (const cat of CATS) {
        const open = new Set(WS_UNLOCK_GROUPS[cat].slice(0, groups[cat]).flatMap(g => g.stats));
        out[WS_LIVE[cat]] = WS_STATS[cat].map(([name, max]) => (open.has(name) ? share(max, f, name) : 0));
        // [k] = group k + 1 bought (the first group is free).
        out[WS_UNLOCK[cat]] = WS_UNLOCK_GROUPS[cat].slice(1).map((_, k) => k + 1 < groups[cat]);
    }
    return out;
}

const LAB_MAX: Record<string, number> = Object.fromEntries(LABS.flatMap(c => c.l.map(([n, max]) => [n, max] as const)));

// Every lab at a share of its max; card mastery labs at `mastery`.
function research(f: number, mastery = 0): number[] {
    const out = zeros(260);
    for (const [n, name] of Object.entries(GAME_LABS)) out[Number(n)] = share(LAB_MAX[name] ?? 0, f, name);
    for (let i = 0; i < 30; i++) out[MASTERY_LAB_START + i] = mastery;
    return out;
}

// The UWs owned (by short name), their stats at a share of max, and UW+.
function uws(owned: string[], f: number, plus: number): Raw {
    const own = UWS.map(u => owned.includes(u.a));
    return {
        UltimateWeaponUnlocked: own,
        UltimateWeaponLevel: UWS.flatMap((u, i) => u.s.map(([stat, max]) => (own[i] ? Math.max(0, share(max, f, u.a + stat) - 1) : 0))),
        UltimateWeaponPlusUnlocked: UWS.map((_, i) => own[i] && plus > 0),
        UltimateWeaponPlusLevel: UWS.map((u, i) => (own[i] && plus > 0 ? share(u.upMax, plus, u.up) : 0)),
    };
}

// The first `count` cards owned at about `stars`; the first `active` equipped.
function cards(count: number, stars: number, active: number, slots: number, mastered = false): Raw {
    const ids = Object.keys(GAME_CARDS).map(Number).sort((a, b) => a - b);
    const level = zeros(Math.max(...ids) + 1);
    const unlocked = level.map(() => false);
    const mastery = level.map(() => false);
    const on = level.map(() => false);
    ids.slice(0, count).forEach((id, i) => {
        unlocked[id] = true;
        level[id] = Math.max(1, Math.min(7, Math.round(stars + (jitter(GAME_CARDS[id]) - 0.5) * 2)));
        mastery[id] = mastered && level[id] >= 7;
        on[id] = i < active;
    });
    return { CardLevel: level, CardUnlocked: unlocked, CardMasteryUnlocked: mastery, CardActive: on, SlotsUnlocked: slots, CurrentPreset: 0 };
}

// Bots: each owned bot's four upgrades at a share of max, Bot+ levels.
function bots(owned: string[], f: number, plus: number): Raw {
    const out: Raw = {};
    const KEYS: Record<string, string> = {
        'Flame Bot': 'FlameBotPresets', 'Thunder Bot': 'ThunderBotPresets', 'Golden Bot': 'GoldenBotPresets',
        'Amplify Bot': 'AmplifyBotPresets', 'Bot Bot': 'BotBotPresets',
    };
    for (const b of BOTS_CONFIG) {
        const key = KEYS[b.name];
        if (!key) continue;
        const own = owned.includes(b.name);
        // The save keeps the four upgrades in another order (gameExport fromSaveOrder).
        const lv = b.stats.map(st => (own ? share(st.values.length, f, b.name + st.label) : 0));
        const save = [lv[2] ?? 0, lv[3] ?? 0, lv[1] ?? 0, lv[0] ?? 0];
        out[key] = [{ Unlocked: own, Active: own, Levels: save, SelectedLevels: save, PlusUnlocked: own && plus > 0, PlusLevel: own ? Math.round(b.plusMax * plus) : 0 }];
    }
    return out;
}

// Damage by source as shares of a run's damage.
type Shares = Partial<Record<'ChainLightningDamage' | 'OrbDamage' | 'BlackHoleDamage' | 'ProjectilesDamage' | 'DeathWaveDamage'
    | 'SmartMissileDamage' | 'InnerLandMineDamage' | 'SwampDamage' | 'LandMineDamage' | 'ThornDamage', number>>;

// Shares of a run's enemies hit or killed: Chain Lightning's hits (Smite
// reaches as many), Black Hole's and the orbs' kills (Consume, orb waves).
interface Reach { cl?: number; bh?: number; orbs?: number }

// Runs: campaign deaths (with level skips) and tournament runs.
function runs(list: { tier: number; wave: number; day: number; killer: number; tourney?: boolean; skip?: number; coins?: number; hours?: number; league?: number }[], shares: Shares, tShares?: Shares, reach: Reach = {}, cellsPerHour = 0): Raw[] {
    return list.map(r => {
        const total = 1e6;
        const enemies = r.wave * 40;
        const s = r.tourney && tShares ? tShares : shares;
        const hours = r.hours ?? (r.tourney ? 0.6 : r.wave / 1500);
        return battle({
            BattleDate: `2026-10-${String(r.day).padStart(2, '0')}T${r.tourney ? '18' : '09'}:00:00Z`,
            Tier: r.tier, Wave: r.wave, KilledBy: r.killer, IsTournament: !!r.tourney,
            GameTime: Math.round(hours * 3600 * 2.5), RealTime: Math.round(hours * 3600),
            CoinsEarned: r.coins ?? 0, TotalEnemies: enemies, ProjectilesCount: enemies * 3, CellsEarned: Math.round(cellsPerHour * hours),
            EnemiesHitByChainLightningThisRound: Math.round(enemies * (reach.cl ?? 0)),
            DestroyedInBlackhole: Math.round(enemies * (reach.bh ?? 0)), DestroyedInOrbs: Math.round(enemies * (reach.orbs ?? 0)),
            HealthLevelSkips: Math.floor(r.wave * (r.skip ?? 0)), AttackLevelSkips: Math.floor(r.wave * (r.skip ?? 0) * 0.99),
            DamageDealt: total, ...Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v * total])),
            ...(r.league !== undefined ? { LeagueID: r.league } : {}),
        });
    });
}

const tierWaves = (waves: number[]) => [0, ...waves];

// Labs being researched at the export: each lab's level and hours left
// at normal speed, from when this file loads (the game's ResearchCompleteDate).
function running(labs: string[], hoursLeft: number[]): Raw {
    const now = Date.now();
    const done: (string | null)[] = Array(260).fill(null);
    labs.forEach((name, i) => { done[labIndex(name)] = new Date(now + hoursLeft[i] * 3600_000).toISOString(); });
    return {
        ExportedAt: new Date(now).toISOString(),
        LabActiveBool: labs.map(() => true), LabResearchInt: labs.map(labIndex),
        LabSpeedUpSpeed: labs.map(() => 1), LabSpeedUpRemainingSeconds: labs.map(() => 0),
        ResearchCompleteDate: done,
    };
}

// ── Early: T5, Silver, one UW, no modules or bots ──────────────
const early: BenchAccount = {
    key: 'early', label: 'Early (T5, one UW)', build: '',
    raw: makeExport({
        UserName: 'BenchEarly',
        Coins: 2.4e9, Gems: 420, Stones: 160, Medals: 35, Cells: 900, Keys: 0, Bits: 0,
        HighestLeague: 1, LeagueID: 1,
        HighestWaveThisTier: tierWaves([4100, 2600, 1500, 900, 420]),
        ...workshop(0.08, { attack: 3, defense: 2, utility: 2 }),
        ResearchLevel: research(0.05),
        LabsUnlocked: 1,
        ...uws(['GT'], 0.15, 0),
        ...cards(9, 2, 4, 4),
        BattleHistory: runs([
            { tier: 5, wave: 380, day: 20, killer: 2, coins: 1.1e8 },
            { tier: 5, wave: 405, day: 21, killer: 3, coins: 1.2e8 },
            { tier: 4, wave: 870, day: 22, killer: 4, coins: 2.6e8 },
            { tier: 5, wave: 418, day: 23, killer: 3, coins: 1.3e8 },
            { tier: 5, wave: 431, day: 24, killer: 2, coins: 1.35e8 },
        ], { ProjectilesDamage: 0.71, OrbDamage: 0.18, LandMineDamage: 0.08, ThornDamage: 0.03 }, undefined, { orbs: 0.2 }, 60),
    }),
};

// ── Mid: T11, Gold, five UWs, eHP ──────────────────────────────
const mid: BenchAccount = {
    key: 'mid', label: 'Mid (T11, five UWs, eHP)', build: 'eHP',
    raw: makeExport({
        UserName: 'BenchMid',
        Coins: 3.8e14, Gems: 1650, Stones: 2300, Medals: 940, Cells: 52000, Keys: 0, Bits: 140,
        HighestLeague: 2, LeagueID: 2,
        HighestWaveThisTier: tierWaves([9000, 8000, 7000, 6500, 6000, 5200, 4400, 3900, 3500, 3100, 1800]),
        ...workshop(0.35, { attack: 6, defense: 5, utility: 5 }),
        ResearchLevel: research(0.3),
        LabsUnlocked: 3,
        ...uws(['DW', 'GT', 'BH', 'CF', 'CL'], 0.4, 0),
        ...cards(20, 4.5, 12, 12),
        ModuleEquipped: [gameModule('mid-c', 7, 6, []), gameModule('mid-a', 17, 6, []), gameModule('mid-g', 27, 5, []), gameModule('mid-o', 37, 6, [])],
        SlotLevels: [95, 110, 80, 90],
        ModuleCannonShards: 5200, ModuleArmorShards: 3400, ModuleGeneratorShards: 2100, ModuleCoreShards: 2800, ModuleRerollCurrency: 9000,
        ...bots(['Flame Bot', 'Golden Bot'], 0.4, 0),
        BattleHistory: runs([
            { tier: 11, wave: 1620, day: 18, killer: 9, skip: 0.18, coins: 2.1e13 },
            { tier: 10, wave: 3050, day: 19, killer: 7, skip: 0.2, coins: 6.8e13 },
            { tier: 0, wave: 240, day: 19, killer: 9, tourney: true, league: 2 },
            { tier: 10, wave: 3120, day: 20, killer: 9, skip: 0.2, coins: 7.0e13 },
            { tier: 10, wave: 2980, day: 21, killer: 7, skip: 0.2, coins: 6.6e13 },
            { tier: 0, wave: 265, day: 22, killer: 4, tourney: true, league: 2 },
            { tier: 10, wave: 3190, day: 23, killer: 9, skip: 0.21, coins: 7.3e13 },
            { tier: 10, wave: 3240, day: 24, killer: 11, skip: 0.21, coins: 7.5e13 },
        ], { ProjectilesDamage: 0.38, OrbDamage: 0.24, ChainLightningDamage: 0.18, DeathWaveDamage: 0.1, BlackHoleDamage: 0.06, ThornDamage: 0.04 },
        { ProjectilesDamage: 0.46, OrbDamage: 0.2, ChainLightningDamage: 0.14, DeathWaveDamage: 0.12, ThornDamage: 0.08 },
        { cl: 0.45, bh: 0.15, orbs: 0.3 }, 9000),
        ...running(['Damage Lab', 'Health Lab', 'Coins/Kill Lab'], [30, 52, 75]),
    }),
};

// ── Late: T18, Legend, every UW and UW+, Glass Cannon ──────────
const late: BenchAccount = {
    key: 'late', label: 'Late (T18, all UWs + UW+, Glass Cannon)', build: 'Glass Cannon',
    raw: makeExport({
        UserName: 'BenchLate',
        Coins: 4.6e18, Gems: 5200, Stones: 1850, Medals: 2700, Cells: 3.1e6, Keys: 40, Bits: 620,
        HighestLeague: 5, LeagueID: 5,
        HighestWaveThisTier: tierWaves([22000, 20000, 18500, 17000, 16000, 15000, 14500, 14000, 13500, 13000, 12500, 12000, 11500, 11000, 10600, 10200, 9800, 9150]),
        ...workshop(0.8, { attack: 8, defense: 8, utility: 8 }),
        ResearchLevel: research(0.72, 6),
        LabsUnlocked: 4,
        ...uws(UWS.map(u => u.a), 0.75, 0.35),
        ...cards(Object.keys(GAME_CARDS).length, 7, 21, 21, true),
        ModuleEquipped: [gameModule('late-c', 8, 15, []), gameModule('late-a', 20, 13, []), gameModule('late-g', 29, 14, []), gameModule('late-o', 40, 15, [])],
        SlotLevels: [235, 220, 210, 240],
        AssistModuleSlots: [0, 1, 2, 3].map(t => ({
            Type: t, Unlocked: true, Level: [150, 120, 140, 160][t],
            UniqueEffectEfficiencyLevel: 2, MainEffectEfficiencyLevel: [20, 14, 16, 22][t], SubstatEfficiencyLevel: [12, 9, 10, 15][t],
            EquippedModule: gameModule(`late-assist-${t}`, [9, 18, 28, 38][t], 11, []),
        })),
        ModuleCannonShards: 18000, ModuleArmorShards: 9500, ModuleGeneratorShards: 12000, ModuleCoreShards: 15500, ModuleRerollCurrency: 120000,
        ...bots(['Flame Bot', 'Thunder Bot', 'Golden Bot', 'Amplify Bot'], 0.85, 0.4),
        BattleHistory: runs([
            { tier: 18, wave: 8720, day: 17, killer: 9, skip: 0.58, coins: 9.2e17, hours: 9.5 },
            { tier: 0, wave: 412, day: 18, killer: 9, tourney: true, league: 5 },
            { tier: 18, wave: 9010, day: 19, killer: 12, skip: 0.58, coins: 9.6e17, hours: 9.8 },
            { tier: 18, wave: 8890, day: 20, killer: 9, skip: 0.58, coins: 9.4e17, hours: 9.6 },
            { tier: 0, wave: 455, day: 21, killer: 4, tourney: true, league: 5 },
            { tier: 18, wave: 9150, day: 22, killer: 9, skip: 0.59, coins: 9.9e17, hours: 10 },
            { tier: 18, wave: 8960, day: 23, killer: 11, skip: 0.58, coins: 9.5e17, hours: 9.7 },
            { tier: 0, wave: 438, day: 24, killer: 9, tourney: true, league: 5 },
        ], { OrbDamage: 0.58, ChainLightningDamage: 0.14, BlackHoleDamage: 0.11, DeathWaveDamage: 0.06, ProjectilesDamage: 0.07, SmartMissileDamage: 0.04 },
        { OrbDamage: 0.44, ChainLightningDamage: 0.11, DeathWaveDamage: 0.2, ProjectilesDamage: 0.15, BlackHoleDamage: 0.06, SmartMissileDamage: 0.04 },
        { cl: 0.7, bh: 0.3, orbs: 0.55 }, 210000),
        ...running(['Damage Lab', 'Super Crit Mult Lab', 'Enemy HP Lvl Skip Lab', 'Attack Speed Lab', 'Coins/Kill Lab'], [20, 140, 300, 9, 66]),
        // Vault: Harmony's card slots and a few Power and Enemy upgrades.
        Vault: { UpgradesLevel: { 1010: 2, 1030: 1, 1200: 3, 1210: 1, 1810: 2 }, UnlockedGroups: [0, 1, 2] },
        // Guardian: Attack, Bounty and Fetch equipped.
        GuardianUnlocked: true, GuardianSlotsUnlocked: 2, GuardianChipSlot: [2, 0, 6],
        GuardianChipUnlocked: [true, false, true, false, false, true, true, true, true],
        GuardianChipLevel: Array.from({ length: 27 }, (_, i) => [0, 2, 6].includes(Math.floor(i / 3)) ? 5 + (i % 3) * 2 : 0),
        TournamentRecords: Array.from({ length: 12 }, (_, i) => ({
            TournamentNumber: 300 + i, Date: `2026-${i < 5 ? '09' : '10'}-${String(i < 5 ? 3 + i * 6 : (i - 5) * 3 + 2).padStart(2, '0')}T12:00:00Z`,
            LeagueID: i < 4 ? 4 : 5, Wave: i < 4 ? 1900 + i * 60 : 380 + i * 7, Rank: i < 4 ? [3, 2, 1, 1][i] : [22, 19, 17, 18, 15, 14, 16, 12][i - 4],
        })),
    }),
};

export const BENCH_ACCOUNTS: BenchAccount[] = [early, mid, late];
