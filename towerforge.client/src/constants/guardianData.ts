// ============================================================
//  TowerForge Companion — Guardian chips
//  The Guardian (Guild → Guardian) fights next to the tower with its
//  equipped chips; each chip has three stats bought with Bits.
//
//  Sources (checked 2026-10-19):
//   • Chip order = the game's save index: its asset table (TheTowerSDK
//     data/assets GUARDIANS_ASSET_TABLE.modifierName): 0 Bounty, 1 Catch,
//     2 Attack, 3 Scare, 4 Rush, 5 Ally, 6 Fetch, 7 Summon, 8 Scout.
//     Catch, Scare and Rush aren't released. On the owner's account the
//     unlocked chips are exactly 0, 2, 5, 6, 7, 8 and every chip's three
//     levels fit only its own maximums (Summon's cooldown at its max 70,
//     Scout 60/24/15, Fetch 7/14/2, Attack 4/58/1).
//   • Stat order and max levels: the same table (chipBenefitNames,
//     chipLevelsMax) — Ally's save order is Recovery Amount, Max
//     Recovery, Cooldown.
//   • Values and Bits costs: the wiki's chip tables (Chips page) and
//     TheTowerSDK's guardian upgrade tables — the formulas below match
//     both at every level they list.
//   • Slots: 1 with the Guardian (200 Bits), 2nd 200, 3rd 300 Bits.
//     Skins: each owned skin adds a permanent +0.6% coins (wiki).
// ============================================================

export type ChipId = 'bounty' | 'catch' | 'attack' | 'scare' | 'rush' | 'ally' | 'fetch' | 'summon' | 'scout';

export interface ChipStat {
    name: string;                         // the game's word
    max: number;                          // highest level (levels bought; 0 = base)
    value: (level: number) => number;
    fmt: (v: number) => string;
    cost: (level: number) => number;      // Bits to buy this level
}

export interface ChipDef {
    id: ChipId;
    index: number;                        // the game's save index
    name: string;
    text: string;                         // the game's description
    released: boolean;
    stats: [ChipStat, ChipStat, ChipStat];
}

const secs = (v: number) => `${v}s`;
const pct = (v: number) => `${v}%`;
const times = (v: number) => `x${v.toFixed(2).replace(/0$/, '')}`;
const count = (v: number) => `${v}`;
const cooldown = (base: number, max: number, cost: (l: number) => number): ChipStat =>
    ({ name: 'Cooldown', max, value: l => base - l, fmt: secs, cost });
const NOT_RELEASED: ChipStat = { name: '—', max: 0, value: () => 0, fmt: () => '—', cost: () => 0 };

export const CHIPS: ChipDef[] = [
    {
        id: 'bounty', index: 0, name: 'Bounty', released: true,
        text: 'Places a Bounty on nearby non-Common enemies: they grant more coins on kill',
        stats: [
            { name: 'Multiplier', max: 99, value: l => 1.01 + 0.01 * l, fmt: times, cost: l => l },
            cooldown(120, 60, l => 2 * l),
            { name: 'Targets', max: 9, value: l => 1 + l, fmt: count, cost: l => 100 * l },
        ],
    },
    { id: 'catch', index: 1, name: 'Catch', released: false, text: 'Catches enemy projectiles before they hit the tower', stats: [NOT_RELEASED, NOT_RELEASED, NOT_RELEASED] },
    {
        id: 'attack', index: 2, name: 'Attack', released: true,
        text: 'Attacks the enemies with the most missing health, dealing a share of their lost health (half against bosses)',
        stats: [
            { name: 'Percentage', max: 19, value: l => 1 + l, fmt: pct, cost: l => 25 * l },
            cooldown(120, 90, l => l),
            { name: 'Targets', max: 9, value: l => 1 + l, fmt: count, cost: l => 100 * l },
        ],
    },
    { id: 'scare', index: 3, name: 'Scare', released: false, text: 'Scares nearby enemies, causing them to flee', stats: [NOT_RELEASED, NOT_RELEASED, NOT_RELEASED] },
    { id: 'rush', index: 4, name: 'Rush', released: false, text: 'Speeds up the wave timer', stats: [NOT_RELEASED, NOT_RELEASED, NOT_RELEASED] },
    {
        id: 'ally', index: 5, name: 'Ally', released: true,
        text: 'Converts an enemy into an Ally Recovery Package that can heal past the normal Max Recovery',
        stats: [
            { name: 'Recovery Amount', max: 49, value: l => 1 + l, fmt: pct, cost: l => (l > 0 ? 5 * l + 5 : 0) },
            { name: 'Max Recovery', max: 89, value: l => 1.1 + 0.1 * l, fmt: times, cost: l => l },
            cooldown(120, 90, l => l),
        ],
    },
    {
        id: 'fetch', index: 6, name: 'Fetch', released: true,
        text: 'Finds hidden loot: coins, gems, medals, shards and modules',
        stats: [
            cooldown(120, 60, l => 2 * l),
            { name: 'Find Chance', max: 40, value: l => 10 + l, fmt: pct, cost: l => (l > 0 ? 15 + 5 * l : 0) },
            { name: 'Double Find Chance', max: 48, value: l => 2 + l, fmt: pct, cost: l => (l > 0 ? 5 + 5 * l : 0) },
        ],
    },
    {
        id: 'summon', index: 7, name: 'Summon', released: true,
        text: 'Summons 2 enemies a second (Basic, Tank, Ranged, Fast) while active, and a cash bonus on every kill',
        stats: [
            cooldown(140, 70, l => (l > 0 ? 2 * l - 1 : 0)),
            { name: 'Duration', max: 30, value: l => 5 + l, fmt: secs, cost: l => (l > 0 ? 5 + 10 * l : 0) },
            { name: 'Cash Bonus', max: 9, value: l => 1 + l, fmt: times, cost: l => 100 * l },
        ],
    },
    {
        id: 'scout', index: 8, name: 'Scout', released: true,
        text: 'While active, every enemy counts as farther from the tower for damage (Damage/Meter)',
        stats: [
            cooldown(105, 70, l => (l > 0 ? 2 * l - 1 : 0)),
            { name: 'Range Bonus', max: 40, value: l => 2 + 0.1 * l, fmt: times, cost: l => (l > 0 ? 5 + 5 * l : 0) },
            { name: 'Duration', max: 30, value: l => 5 + l, fmt: secs, cost: l => 10 * l },
        ],
    },
];

export const RELEASED_CHIPS = CHIPS.filter(c => c.released);
export const chipById = (id: ChipId) => CHIPS.find(c => c.id === id)!;

export const GUARDIAN_UNLOCK_BITS = 200;
export const GUARDIAN_SLOT_BITS = [200, 300];      // 2nd and 3rd chip slot
export const GUARDIAN_MAX_SLOTS = 3;
export const SKIN_COIN_BONUS = 0.006;               // +0.6% coins per owned skin (wiki)

// Bits from one level of a stat to another.
export function statBits(stat: ChipStat, from: number, to: number): number {
    let total = 0;
    for (let l = Math.max(0, from) + 1; l <= Math.min(stat.max, to); l++) total += stat.cost(l);
    return total;
}
