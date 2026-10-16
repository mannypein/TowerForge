// ============================================================
//  TowerForge Companion — Game Type Definitions
//  All interfaces and types used across state, engine, and UI.
//  No logic lives here — pure type contracts only.
// ============================================================

import type { BattleReport } from '../engine/battleReport';

// ── Currencies ────────────────────────────────────────────────
export interface Currencies {
    coins: number;
    gems: number;
    stones: number;
    medals: number;
    cells: number;
    keys: number;
    tokens: number;
    bits: number;
}

// ── Build Types ───────────────────────────────────────────────
export type BuildType = 'Glass Cannon' | 'eHP' | 'Hybrid' | 'Farming';
export type League = 'Copper' | 'Silver' | 'Gold' | 'Platinum' | 'Champion' | 'Legend' | 'Mythic' | '';
export type UWAbbr = 'CL' | 'SM' | 'DW' | 'CF' | 'ILM' | 'GT' | 'PS' | 'BH' | 'SL';
export type TabName =
    | 'profile' | 'perks' | 'tiers' | 'workshop'
    | 'labs' | 'cards' | 'uw' | 'puws' | 'relics'
    | 'bots' | 'modules' | 'optimizer' | 'share' | 'account';

// ── Workshop Types ────────────────────────────────────────────
export type WSCategory = 'attack' | 'defense' | 'utility';

export interface WSPreset {
    attack: number[];
    defense: number[];
    utility: number[];
}

export interface EnhCategoryData {
    [category: string]: number[];   // level per enhancement index
}

export interface EnhOwnedData {
    [category: string]: boolean[];  // owned flag per enhancement index
}

export interface EnhData {
    d: EnhCategoryData;  // levels (shared by presets without their own entry in p)
    u: EnhOwnedData;     // owned flags (account-wide)
    // Per-preset levels — the game keeps enhancement levels per workshop
    // preset. Present once a game export has been imported; read through
    // enhForPreset() rather than using d directly.
    p?: { [presetIdx: number]: EnhCategoryData };
}

// ── Profile ───────────────────────────────────────────────────
export interface Profile {
    name: string;
    league: League;
    build: BuildType | '';
    presets: 2 | 5;
    wall: boolean;
    highestTier: number;
    completedTier: number;
    excludedUWs?: string[];   // UW abbrs the optimizer should not suggest upgrades for
    presetNames?: string[];   // custom preset names (from the game import or typed in); blank = default
}

// ── Perks ─────────────────────────────────────────────────────
export interface PerkData {
    banned: string[];   // array of banned perk IDs
}

// ── Tiers ─────────────────────────────────────────────────────
export interface TierWaves {
    [tier: number]: number;   // tier number → highest wave reached
}

// ── Labs ──────────────────────────────────────────────────────
export interface LabData {
    [labName: string]: number;   // lab name → current level
}

// ── Cards ─────────────────────────────────────────────────────
export interface CardEntry {
    s: number;    // star level (0–7)
    m: number;    // in-game mastery level 0–9 (only applies when mu = true; value = CARD_MASTERY_VALS[name][m])
    mu?: boolean; // mastery unlocked — false/undefined = no mastery bonus (×1)
}

export interface CardData {
    data: { [cardName: string]: CardEntry };
    slots: number;                           // total active card slots (1–28)
    presets: { [presetIdx: number]: string[] }; // preset index → active card names
}

// ── Ultimate Weapons ──────────────────────────────────────────
export interface UWStat {
    own: boolean;
    sv: [number, number, number];  // stat values [stat0, stat1, stat2]
    upOwn: boolean;
    upLvl: number;
}

export interface UWData {
    data: { [abbr in UWAbbr]?: UWStat };
    stones: number;
}

// ── Relics ────────────────────────────────────────────────────
export interface RelicData {
    [relicKey: string]: number;
}

// ── Bots ──────────────────────────────────────────────────────
export interface BotLevels {
    medals: number[];   // medal upgrade levels per stat (0 = Lv 0 base)
    plusLv: number;     // Bot+ level
}

export interface BotEntry extends BotLevels {
    owned?: boolean;    // bot unlocked (account-wide) — when owned, every stat sits at least at Lv 0
    // In game each bot preset keeps its own medal and Bot+ levels. A preset
    // that was never edited uses medals / plusLv above.
    presets?: { [presetIdx: number]: BotLevels };
}

export interface BotData {
    [botName: string]: BotEntry;
}

// Which bots are active in each preset — same shape as CardData.presets.
// A preset with no entry has never been edited and means "all owned bots".
export interface BotLoadouts {
    [presetIdx: number]: string[];
}

// ── Modules ───────────────────────────────────────────────────
export type ModuleType = 'cannon' | 'armor' | 'generator' | 'core';
export type ModuleRarity =
    | 'C' | 'R' | 'Rp'
    | 'E' | 'Ep'
    | 'L' | 'Lp'
    | 'M' | 'Mp'
    | 'A' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5';

export interface SubSlot {
    effect: string;
    rar: string;
    val: string;
}

export interface ModuleEntry {
    id: string;
    name: string;
    type: ModuleType;
    rarity: ModuleRarity;
    subs: SubSlot[];
    // Main-effect ×value read straight off the module card (cannon = Tower
    // Damage, core = Ultimate Weapon Damage). 0/undefined = not entered.
    // NOTE: level lives on the loadout SLOT (slotLevels), not the module —
    // levels stay with the slot when you swap modules in/out.
    mainMult?: number;
}

export interface LoadoutSlots {
    cannon: { main: string; assist: string };
    armor: { main: string; assist: string };
    generator: { main: string; assist: string };
    core: { main: string; assist: string };
}

export interface Loadout {
    id: string;
    name: string;
    slots: LoadoutSlots;
}

export type AssistType = 'cannon' | 'armor' | 'generator' | 'core';

export interface AssistEntry {
    rarity: 'locked' | 'Epic' | 'Legendary' | 'Mythic' | 'Ancestral';
    multEff: number;   // assist multiplier effect %, 0-130
    subEff: number;    // assist substat effect %, 0-100
}

export interface AssistData {
    [type: string]: AssistEntry;
}

// Account-wide module slot levels. Level belongs to the slot position
// (cannon/armor/generator/core × main/assist), shared across all loadouts —
// not to the individual module, since levels transfer when modules are swapped.
export interface SlotPositionLevels {
    main: number;
    assist: number;
}
export type SlotLevels = Record<ModuleType, SlotPositionLevels>;

export interface ModuleState {
    library: ModuleEntry[];
    loadouts: Loadout[];
    activeLoadout?: string;   // id of the equipped loadout (the one the calculators use); default = first
    assistData: AssistData;
    slotLevels: SlotLevels;
}

// ── Engine — Module Bonuses ───────────────────────────────────
export interface UWBonus {
    dur?: number;
    cd?: number;
    slow?: number;
    dmg?: number;
    qty?: number;
    bonus?: number;
    angle?: number;
    size?: number;
    dmgm?: number;
    chance?: number;
}

export type UniqueTier = 'Epic' | 'Legendary' | 'Mythic' | 'Ancestral';

// One equipped module's unique effect at the tier it runs at: a primary
// module at its own rarity, an assist at the slot's unlocked tier.
export interface ActiveUnique {
    name: string;
    type: ModuleType;
    slot: 'main' | 'assist';
    tier: UniqueTier;
    value: number;
}

// How often things happen in the player's runs (from the Battle Report),
// for effects that depend on it. Defaults stand in without a report.
export interface RunRates {
    source: 'report' | 'default';
    waveSec: number;            // game seconds per wave
    killsPerSec: number;        // every enemy killed
    bossFleetPerSec: number;    // bosses + fleet enemies (Commander / Saboteur / Overcharge)
    elitePerSec: number;        // Vampire / Ray / Scatter
    packagesPerSec: number;     // recovery packages
    pkgChanceAtRun: number;     // package chance % behind packagesPerSec (0 = unknown)
    cashDigits: number;         // log10 of cash during the run
    clHitsPerEnemy: number;     // Chain Lightning hits per enemy
    poisonedShare: number;      // share of enemies hit by Poison Swamp
    bhShare: number;            // share of kills inside a Black Hole
    orbHitsPerEnemy: number;    // orb hits per enemy
}

export interface ModBonuses {
    uwBonus: { [abbr in UWAbbr]?: UWBonus };
    stUWMult: number;
    perks: PerkBonuses;
    uniques: Record<string, number>;   // unique module → its value at the tier it runs at
    activeUniques: ActiveUnique[];
    subs: Record<string, number>;      // sub-effect → total over equipped modules (assist at
                                       // substat efficiency), in the card's units (10 = +10%)
    run: RunRates;
}

// ── Engine — Perk Bonuses ─────────────────────────────────────
export interface PerkBonuses {
    totalDmgMult: number;
    atkSpdMult: number;
    clDmgMult: number;
    slBonusMult: number;
    dwExtraWave: number;
    smExtraQty: number;
    bhExtraDur: number;
    cfExtraDur: number;
    gtBonusMult: number;
    psRadMult: number;
    enemySpdMult: number;
    toDmgMult: number;
}

// ── Engine — Card Mastery Bonuses ─────────────────────────────
export interface CardMasteryBonuses {
    dmgMastMult: number;
    atkMastMult: number;
    critMastAdd: number;
    stMastCDRedux: number;
    rangeMastMult: number;
    slowMastMult: number;
}

// ── Engine — TTT Data ─────────────────────────────────────────
export interface TTTData {
    ttt: number;
    range: number;
    cappedSlow: number;
    cfPathMult: number;
    cfUptime: number;
}

// ── Optimizer ─────────────────────────────────────────────────
// 'stones' is a panel-only pseudo-category — it represents the merged
// UW/UW+/Mastery/Assist stone path. Individual OptCandidate.category
// values stay as 'uw'/'uwp'/'mast'/'assist' for badge display.
export type OptCategory =
    | 'uw' | 'uwp' | 'mast' | 'assist' | 'stones'
    | 'workshop' | 'labs' | 'cards' | 'enhancements' | 'bots';

export interface OptCandidate {
    category: OptCategory;
    label: string;
    subLabel: string;
    fromLv: number;
    toLv: number;
    cost: number;
    costType: 'stones' | 'coins' | 'research';
    costKnown?: boolean;   // false/omitted for coin/research rows where `cost` is only a level proxy
    scorePct: number;   // eDPS delta %
    scorePerCost: number;   // eDPS delta % per stone/coin
    alts?: OptAlt[];
}

export interface OptAlt {
    label: string;
    cost: number;
    scorePct: number;
}

// ── Cloud Save ────────────────────────────────────────────────
export interface CloudSaveData {
    rawSave: Record<string, any>;     // raw JSON from Firestore (all 725 fields)
    pulledAt: string;                 // ISO timestamp when last pulled
}

// ── Full App State (root shape for the store) ─────────────────
export interface AppState {
    activeTab: TabName;
    activePreset: number;   // 0–4

    profile: Profile;
    perkData: PerkData;
    tierWaves: TierWaves;
    wsData: WSPreset[];  // wsData[presetIdx]
    enhData: EnhData;
    labData: LabData;
    cardData: CardData;
    uwData: UWData;
    relicData: RelicData;
    botData: BotData;
    botLoadouts: BotLoadouts;
    moduleState: ModuleState;
    battleReportText: string;   // last pasted in-game Battle Report (Farming calibration)
    currencies: Currencies;
    importedBattles: BattleReport[];   // BattleHistory from the last game data import
    battleReportChoice: number;        // which report calibrates the optimizer: -1 = pasted, else importedBattles index
    cloudSaveData: CloudSaveData | null;  // cloud save if pulled, null otherwise
}