// ============================================================
//  TowerForge Companion — Cloud Save Parser
//  Converts flat Firestore JSON → TowerForge's typed data model
//
//  Flow:
//    1. User logs in → raw Firestore JSON captured
//    2. parseCloudSave(rawSave) → TowerForge structures
//    3. Store updates all tabs automatically
// ============================================================

import type {
    Profile, PerkData, TierWaves, WSPreset, EnhData, LabData, CardData, CardEntry,
    UWData, RelicData, BotData, ModuleState,
} from '../types/gameTypes';
import { CARDS, PERKS, LABS } from '../constants/gameData';

// ── Mapping Tables ────────────────────────────────────────
// Card names by index (Firestore array index → TowerForge card name)
const CARD_NAMES = CARDS.map(c => c[0]); // indices 0-30

// Bot names by index
const BOT_NAMES = ['Flame Bot', 'Thunder Bot', 'Golden Bot', 'Amplify Bot', 'Bot Bot'];

// UW abbreviations by index (matches game order exactly)
const UW_ABBRS: Array<'CL' | 'SM' | 'DW' | 'CF' | 'ILM' | 'GT' | 'PS' | 'BH' | 'SL'> =
    ['CL', 'SM', 'DW', 'CF', 'ILM', 'GT', 'PS', 'BH', 'SL'];

// Build lab index → name map from LABS constant
function buildLabMap(): Record<number, string> {
    const map: Record<number, string> = {};
    let index = 0;
    for (const category of LABS) {
        for (const [labName] of category.l) {
            map[index] = labName;
            index++;
        }
    }
    return map;
}
const LAB_NAMES = buildLabMap();

// Build perk ID map by index
const PERK_IDS = PERKS.map(p => p.id); // indices 0-25+

// ── Type Guard & Helpers ─────────────────────────────────────
function toNumber(v: unknown, def = 0): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
        const n = parseFloat(v);
        return isNaN(n) ? def : n;
    }
    return def;
}

function toBool(v: unknown): boolean {
    return v === true || v === 1 || v === '1' || v === 'true';
}

function toArray<T>(v: unknown, map?: (x: unknown) => T): T[] {
    if (!Array.isArray(v)) return [];
    return map ? v.map(map) : (v as T[]);
}

// ── Parsers ──────────────────────────────────────────────────

function parseProfile(raw: Record<string, any>): Profile {
    return {
        name: raw.UserName || '',
        league: raw.League || '',
        build: raw.CurrentBuild || '',
        presets: toNumber(raw.CurrentPreset) === 1 ? 2 : 5,
        wall: toBool(raw.WallEnabled),
        highestTier: toNumber(raw.HighestTier),
        completedTier: toNumber(raw.CompletedTier),
    };
}

function parseTierWaves(raw: Record<string, any>): TierWaves {
    const result: TierWaves = {};
    const waves = raw.HighestWaveThisTier || raw.HighestWavePerTierThisCycle;
    if (Array.isArray(waves)) {
        for (let i = 0; i < waves.length; i++) {
            if (toNumber(waves[i], -1) >= 0) {
                result[i] = toNumber(waves[i]);
            }
        }
    }
    return result;
}

function parseWorkshop(raw: Record<string, any>): WSPreset[] {
    // Firestore stores preset workshop levels as flat arrays:
    // PresetUpgradeWorkshopLevel[100] = 5 presets × 20 attack stats
    // PresetUpgradeWorkshopDefenseLevel[100] = 5 presets × 20 defense stats
    // PresetUpgradeWorkshopUtilityLevel[100] = 5 presets × 20 utility stats
    // Indexed as: [preset0_stat0...19, preset1_stat0...19, ..., preset4_stat0...19]

    const atkLevels = toArray(raw.PresetUpgradeWorkshopLevel, toNumber);
    const defLevels = toArray(raw.PresetUpgradeWorkshopDefenseLevel, toNumber);
    const utilLevels = toArray(raw.PresetUpgradeWorkshopUtilityLevel, toNumber);

    const presets: WSPreset[] = [];
    for (let p = 0; p < 5; p++) {
        const start = p * 20;
        const end = start + 20;
        presets.push({
            attack: atkLevels.slice(start, end),
            defense: defLevels.slice(start, end),
            utility: utilLevels.slice(start, end),
        });
    }

    return presets;
}

function parseEnhancements(raw: Record<string, any>): EnhData {
    const result: EnhData = { d: {}, u: {} };

    // Enhancement arrays: [Attack, Defense, Utility] × [Level, TierUnlocked]
    const atkLvl = toArray(raw.EnhancementLevel, n => toNumber(n));
    const atkUnlocked = toArray(raw.EnhancementTierUnlocked, toBool);
    const defLvl = toArray(raw.EnhancementDefenseLevel, n => toNumber(n));
    const defUnlocked = toArray(raw.EnhancementDefenseTierUnlocked, toBool);
    const utilLvl = toArray(raw.EnhancementUtilityLevel, n => toNumber(n));
    const utilUnlocked = toArray(raw.EnhancementUtilityTierUnlocked, toBool);

    result.d.attack = atkLvl;
    result.u.attack = atkUnlocked;
    result.d.defense = defLvl;
    result.u.defense = defUnlocked;
    result.d.utility = utilLvl;
    result.u.utility = utilUnlocked;

    return result;
}

function parseLabs(raw: Record<string, any>): LabData {
    const result: LabData = {};
    const levels = raw.LabLevel || raw.ResearchLevel;

    if (Array.isArray(levels)) {
        for (let i = 0; i < levels.length; i++) {
            const labName = LAB_NAMES[i];
            if (labName && toNumber(levels[i], -1) >= 0) {
                result[labName] = toNumber(levels[i]);
            }
        }
    }
    return result;
}

function parseCards(raw: Record<string, any>): CardData {
    const cardData: CardData = { data: {}, slots: toNumber(raw.CardSlots, 1), presets: {} };

    const unlocked = toArray(raw.CardUnlocked, toBool);
    const masteryUnlocked = toArray(raw.CardMasteryUnlocked, toBool);
    const masteryLvls = toArray(raw.CardMasteryLevel, n => toNumber(n));

    for (let i = 0; i < CARD_NAMES.length; i++) {
        const cardName = CARD_NAMES[i];
        if (cardName) {
            const entry: CardEntry = {
                s: unlocked[i] ? 1 : 0, // star level (simplified: 0 or 1)
                m: masteryLvls[i] ?? 0,
                mu: masteryUnlocked[i] ?? false,
            };
            cardData.data[cardName] = entry;
        }
    }

    return cardData;
}

function parseUWs(raw: Record<string, unknown>): UWData {
    const uwData: UWData = { data: {}, stones: toNumber(raw.Stones as number) };

    const unlocked = toArray(raw.UltimateWeaponUnlocked, toBool);
    const levels = toArray(raw.UltimateWeaponLevel, n => toNumber(n));
    const plusUnlocked = toArray(raw.UltimateWeaponPlusUnlocked, toBool);
    const plusLvls = toArray(raw.UltimateWeaponPlusLevel, n => toNumber(n));

    // UltimateWeaponLevel array stores [level0-8, stat1_0-8, stat2_0-8, ...]
    // Extract just the base levels (first 9 values)
    const baseLevels = levels.slice(0, 9);
    const stat1Values = levels.slice(9, 18);
    const stat2Values = levels.slice(18, 27);

    for (let i = 0; i < UW_ABBRS.length; i++) {
        const abbr = UW_ABBRS[i];
        if (abbr && unlocked[i]) {
            uwData.data[abbr] = {
                own: true,
                sv: [baseLevels[i] ?? 0, stat1Values[i] ?? 0, stat2Values[i] ?? 0],
                upOwn: plusUnlocked[i] ?? false,
                upLvl: toNumber(plusLvls[i] ?? 0),
            };
        }
    }

    return uwData;
}

function parseRelics(raw: Record<string, any>): RelicData {
    const result: RelicData = {};
    const relics = raw.ProfileRelics || [];

    if (Array.isArray(relics)) {
        // Relics is array of { type, level } objects. Flatten to key → level.
        for (const relic of relics) {
            if (relic && typeof relic === 'object') {
                const type = relic.type || '';
                const lvl = toNumber(relic.level);
                // Build key from type (e.g., "Attack" + "Damage" → "rDmg")
                // For now, store by index or type; full mapping TBD.
                result[type] = lvl;
            }
        }
    }

    return result;
}

function parsePerks(raw: Record<string, any>): PerkData {
    const banned: string[] = [];
    const bannedIndices = toArray(raw.BannedPerksIndex, toNumber);

    for (const idx of bannedIndices) {
        const perkId = PERK_IDS[idx];
        if (perkId) {
            banned.push(perkId);
        }
    }

    return { banned };
}

function parseBots(raw: Record<string, any>): BotData {
    const result: BotData = {};
    const unlocked = toArray(raw.BotsUnlocked, toBool);
    const plusLvls = toArray(raw.BotsPlusLevel, n => toNumber(n));
    const medals = toArray(raw.BotsMedals, v => toArray(v, toNumber));

    for (let i = 0; i < BOT_NAMES.length; i++) {
        const botName = BOT_NAMES[i];
        if (botName && unlocked[i]) {
            result[botName] = {
                owned: true,
                medals: medals[i] ?? [],
                plusLv: toNumber(plusLvls[i] ?? 0),
            };
        }
    }

    return result;
}

function parseModules(): ModuleState {
    // Module parsing is deferred pending:
    // 1. Module definitions mapping (InfoIndex → name + type)
    // 2. Clarification on how modules should load into the app
    // For now, return empty module state
    return {
        library: [],
        loadouts: [],
        assistData: {},
        slotLevels: {
            cannon: { main: 0, assist: 0 },
            armor: { main: 0, assist: 0 },
            generator: { main: 0, assist: 0 },
            core: { main: 0, assist: 0 },
        },
    };
}

// ── Main Parser ───────────────────────────────────────────────

export interface ParsedSave {
    profile: Profile;
    perkData: PerkData;
    tierWaves: TierWaves;
    wsData: WSPreset[];
    enhData: EnhData;
    labData: LabData;
    cardData: CardData;
    uwData: UWData;
    relicData: RelicData;
    botData: BotData;
    moduleState: ModuleState;
}

/**
 * Parse raw Firestore cloud save JSON into TowerForge's typed structure.
 * Automatically maps array indices to names and populates all game systems.
 */
export function parseCloudSave(rawSave: Record<string, any>): ParsedSave {
    return {
        profile: parseProfile(rawSave),
        perkData: parsePerks(rawSave),
        tierWaves: parseTierWaves(rawSave),
        wsData: parseWorkshop(rawSave),
        enhData: parseEnhancements(rawSave),
        labData: parseLabs(rawSave),
        cardData: parseCards(rawSave),
        uwData: parseUWs(rawSave),
        relicData: parseRelics(rawSave),
        botData: parseBots(rawSave),
        moduleState: parseModules(),
    };
}
