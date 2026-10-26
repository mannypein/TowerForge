// ============================================================
//  TowerForge Companion — The Vault
//  Every upgrade the game's Vault sells for Keys (Legends league and
//  up), in its three tabs: Harmony (quality of life, card slots,
//  presets, bot range), Power (stat bonuses) and Enemy (weaker
//  enemies). Each section is unlocked once for keys, then each
//  upgrade is bought level by level.
//  Names, effects and key costs: the wiki's The_Vault page; the game's
//  ids (Vault.UpgradesLevel in the export) and section groups
//  (Vault.UnlockedGroups): TheTowerSDK's v29 vault data. Checked on the
//  owner's export (2026-10-25): the costs of the 20 upgrades owned and
//  the 9 sections unlocked add up to the file's TotalKeysSpent, 810
//  (docs/game-export-format.md). Where the two sources differ the row
//  says so.
// ============================================================

export type VaultTree = 'harmony' | 'power' | 'enemy';

export interface VaultUpgrade {
    id: number;                  // the game's vault id
    name: string;
    costs: number[];             // keys for each level, level 1 first
    effect: (level: number) => string;   // what it gives at a level (0 = not bought)
    note?: string;
}

export interface VaultSection {
    tree: VaultTree;
    name: string;
    group: number;               // the game's VaultGroup id (UnlockedGroups)
    unlock: number;              // keys to unlock the section; 0 = open from the start
    upgrades: VaultUpgrade[];
    enemy?: string;              // Enemy tab: the enemy each row of three belongs to
}

export const VAULT_TREES: { id: VaultTree; label: string; about: string }[] = [
    { id: 'harmony', label: 'Harmony', about: 'Quality of life: automation, sliders, card slots, presets, discounts and Bot Range.' },
    { id: 'power', label: 'Power', about: 'Stat bonuses, like a second workshop. Each section costs 25 keys to unlock.' },
    { id: 'enemy', label: 'Enemy', about: 'Makes each enemy type weaker. Simple is open from the start; each enemy has three upgrades with the same costs.' },
];

// The key a section's unlock is kept under with the levels (vaultLevels).
export const vaultGroupKey = (group: number) => `g${group}`;

// Effect helpers: one text per level, or a step per level.
const steps = (values: string[]) => (lv: number) => (lv > 0 ? values[Math.min(lv, values.length) - 1] : '—');
const each = (fmt: (lv: number) => string) => (lv: number) => (lv > 0 ? fmt(lv) : '—');
const pct = (step: number, sign = '+') => each(lv => `${sign}${+(step * lv).toFixed(2)}%`);
const once = (text: string) => (lv: number) => (lv > 0 ? text : '—');

// Power: most stats are +5% a level for 10/20/40/70/110 keys.
const P5 = [10, 20, 40, 70, 110];
const power = (id: number, name: string, step: number, costs = P5, sign = '+'): VaultUpgrade =>
    ({ id, name, costs, effect: pct(step, sign) });

// Enemy: every upgrade takes 30 levels on one ladder (the wiki's level 8
// total, "129", is a typo for 239 — the costs add up to 239).
const E30 = [25, 26, 28, 29, 30, 32, 34, 35, 37, 39, 41, 43, 45, 47, 49, 52, 55, 57, 60, 63, 66, 70, 73, 77, 81, 85, 89, 93, 98, 103];
const enemyRows = (base: number, stats: [string, (lv: number) => string][]): VaultUpgrade[] =>
    stats.map(([name, effect], i) => ({ id: base + i * 10, name, costs: E30, effect }));
const less = (stat: string): [string, (lv: number) => string] => [stat, pct(1, '-')];

export const VAULT_SECTIONS: VaultSection[] = [
    // ── Harmony ──
    {
        tree: 'harmony', name: 'Gameplay', group: 100, unlock: 0, upgrades: [
            { id: 1000, name: 'Auto Restart Run', costs: [20], effect: once('Restarts the battle after the tower falls') },
            { id: 1010, name: 'Ad Gem Stack', costs: [10, 20, 40, 60], effect: each(lv => `Ad gems stack up to ${lv + 1}×`) },
            { id: 1020, name: 'Damage Cap Slider', costs: [25], effect: once('Scale damage by enemy health (Damage stat in battle; off during Intro Sprint)') },
            { id: 1030, name: 'Global Presets', costs: [20], effect: once('+3 global presets') },
        ],
    },
    {
        tree: 'harmony', name: 'Cards', group: 110, unlock: 5, upgrades: [
            { id: 1200, name: 'Additional Card Slot', costs: [5, 10, 20, 40, 60, 80], effect: each(lv => `+${lv} card slot${lv > 1 ? 's' : ''}`) },
            { id: 1210, name: 'Charge Berserker', costs: [5], effect: once('0.1% of enemy damage is added to Berserker when you kill them') },
            { id: 1220, name: 'Demon Mode Automation', costs: [10], effect: once('Demon Mode activates when its cooldown is done') },
            { id: 1230, name: 'Smart Demon Mode Automation', costs: [25], effect: once('Demon Mode activates to save the tower from a killing blow') },
            { id: 1240, name: 'Nuke Automation', costs: [10], effect: once('Nuke activates when its cooldown is done') },
            { id: 1250, name: 'Smart Nuke Automation', costs: [25], effect: once('Nuke activates to save the tower from a killing blow') },
            { id: 1260, name: 'Death Ray Toggle', costs: [15], effect: once('Death Ray can deal 99% of remaining health instead of killing') },
            { id: 1270, name: 'Spawn Accelerator Toggle', costs: [20], effect: once('Spawn Accelerator (Wave Accelerator mastery) can be turned off') },
            { id: 1280, name: 'Life Saving Ordering', costs: [50], effect: once('Choose the order death saves are used') },
            { id: 1290, name: 'Energy Shield Restriction', costs: [50], effect: once('Energy Shield charges can be kept for fatal hits only') },
        ],
    },
    {
        tree: 'harmony', name: 'Ultimate Weapons', group: 120, unlock: 5, upgrades: [
            { id: 1400, name: 'Missile Barrage Automation', costs: [10], effect: once('Missile Barrage activates when its cooldown is done') },
            { id: 1410, name: 'Smart Missile Barrage Automation', costs: [25], effect: once('Missile Barrage activates when the tower is hit') },
            { id: 1420, name: 'Black Hole Size Slider', costs: [25], effect: once('A slider for the size of Black Holes') },
            { id: 1430, name: 'Swamp Range Slider', costs: [25], effect: once('A slider for the size of Poison Swamp puddles') },
        ],
    },
    {
        tree: 'harmony', name: 'Modules', group: 130, unlock: 5, upgrades: [
            { id: 1600, name: 'Auto Shatter Rare Modules', costs: [5], effect: once('Rare modules can shatter automatically') },
            { id: 1610, name: 'Daily Mission Shard Type', costs: [10], effect: once('Pick the shard type daily missions give') },
            { id: 1620, name: 'Free Mission Reroll', costs: [15], effect: once('Unlimited free mission rerolls') },
            { id: 1630, name: 'Module Reroll Discount', costs: [5, 10, 15, 20, 25, 30, 35, 40], effect: pct(2.5, '-') },
            { id: 1640, name: 'Module Presets', costs: [20], effect: once('+3 module presets') },
        ],
    },
    {
        tree: 'harmony', name: 'Bots', group: 140, unlock: 10, upgrades: [
            { id: 1800, name: 'Bot Respec Discount', costs: [5, 10, 15], effect: each(lv => `-${Math.min(100, lv * 33)}% gems on bot respecs`) },
            { id: 1805, name: 'Bot Presets', costs: [20], effect: once('+3 bot presets, no bot respec limit'), note: 'After Bot Respec Discount' },
            { id: 1810, name: 'Bot Range', costs: [10, 20, 30, 40], effect: each(lv => `+${lv * 2} m on every bot`) },
            { id: 1820, name: 'Bot Cooldown Sliders', costs: [15], effect: once('A slider for each bot’s cooldown') },
        ],
    },
    {
        tree: 'harmony', name: 'Workshop', group: 150, unlock: 10, upgrades: [
            { id: 2000, name: 'Workshop Respec Discount', costs: [5, 10, 15], effect: each(lv => `-${Math.min(100, lv * 33)}% gems on workshop respecs`) },
            { id: 2005, name: 'Workshop Presets', costs: [20], effect: once('+3 workshop presets'), note: 'After Workshop Respec Discount' },
            { id: 2010, name: 'Enhancements Discount', costs: [2, 4, 6, 8, 10, 12, 14, 16, 18], effect: pct(2.5, '-') },
            { id: 2020, name: 'Workshop Orb Adjuster', costs: [15], effect: once('Adjust how far from the tower workshop orbs circle') },
        ],
    },
    {
        tree: 'harmony', name: 'Guardian', group: 160, unlock: 10, upgrades: [
            { id: 2200, name: 'Guardian Respec Discount', costs: [5, 10, 15], effect: each(lv => `-${Math.min(100, lv * 33)}% gems on Guardian respecs`) },
            { id: 2205, name: 'Guardian Presets', costs: [20], effect: once('+3 Guardian presets'), note: 'After Guardian Respec Discount' },
        ],
    },

    // ── Power ──
    {
        tree: 'power', name: 'Attack', group: 1000, unlock: 25, upgrades: [
            power(1, 'Damage', 5), power(10, 'Attack Speed', 5), power(20, 'Critical Chance', 1), power(30, 'Critical Factor', 5),
            power(40, 'Damage / Meter', 5), power(50, 'Multishot Chance', 4), power(60, 'Rapid Fire Chance', 4), power(70, 'Bounce Shot Chance', 4),
            power(80, 'Super Critical Chance', 2), power(90, 'Super Critical Multiplier', 5), power(100, 'Rend Armor Chance', 4), power(110, 'Rend Armor Multiplier', 5),
        ],
    },
    {
        tree: 'power', name: 'Defense', group: 1010, unlock: 25, upgrades: [
            power(200, 'Health', 5), power(210, 'Health Regen', 5), power(220, 'Defense %', 0.5, [20, 40, 70]), power(230, 'Defense Absolute', 5),
            power(240, 'Thorn Damage', 5), power(250, 'Knockback Chance', 1), power(260, 'Knockback Force', 5), power(270, 'Orb Speed', 5),
            { id: 280, name: 'Orbs', costs: [20, 40], effect: each(lv => `+${lv}`) },
            power(290, 'Shockwave Size', 5),
            { id: 300, name: 'Shockwave Frequency', costs: [20, 40], effect: each(lv => `-${lv}s`) },
            { ...power(310, 'Death Defy', 2, [20, 40, 80, 140, 220]), note: 'Costs from TheTowerSDK; the wiki says 10 / 20 / 40 / 70 / 110' },
            power(320, 'Wall Health', 5),
            { id: 330, name: 'Wall Rebuild', costs: [20, 40, 80, 140, 220], effect: each(lv => `-${lv * 20}s`) },
        ],
    },
    {
        tree: 'power', name: 'Utility', group: 1020, unlock: 25, upgrades: [
            power(400, 'Cash Bonus', 5), power(410, 'Cash / Wave', 100), power(420, 'Coins / Kill', 5), power(430, 'Coins / Wave', 100),
            power(440, 'Free Attack Upgrade', 5), power(450, 'Free Defense Upgrade', 5), power(460, 'Free Utility Upgrade', 5),
            power(470, 'Interest / Wave', 100), power(480, 'Recovery Amount', 5),
            { id: 490, name: 'Max Recovery', costs: P5, effect: steps(['+20%', '+40%', '+80%', '+100%', '+120%']) },
            power(500, 'Enemy Attack Level Skip', 0.5, [20, 40, 80]), power(510, 'Enemy Health Level Skip', 0.5, [20, 40, 80]),
        ],
    },
    {
        tree: 'power', name: 'Ultimate Weapons', group: 1030, unlock: 25, upgrades: [
            power(600, 'Ultimate Damage', 5, [5, 10, 20, 35, 55]), power(610, 'Chain Lightning Damage', 5), power(620, 'Smart Missile Damage', 5),
            power(630, 'Death Wave Damage', 5), power(640, 'Inner Land Mine Damage', 5), power(650, 'Golden Tower Bonus', 1),
            power(660, 'Poison Swamp Damage', 5), power(670, 'Spotlight Bonus', 5), power(680, 'Black Hole Size', 5),
        ],
    },

    // ── Enemy ── (sections of three enemies, three upgrades each)
    ...([
        ['Simple', 2000, 0, [
            ['Basic', 3000, [less('Attack'), less('Health'), ['Coin Bonus', each(lv => `+${(0.01 * lv).toFixed(2)}`)]]],
            ['Fast', 3100, [less('Attack'), less('Health'), less('Speed')]],
            ['Tank', 3200, [less('Attack'), less('Health'), less('Mass')]],
        ]],
        ['Advanced', 2010, 50, [
            ['Boss', 4000, [less('Attack'), less('Health'), ['Common Drop Chance', pct(0.1)]]],
            ['Ranged', 4100, [less('Attack'), less('Health'), less('Range')]],
            ['Protector', 4200, [less('Attack'), less('Health'), less('Radius')]],
        ]],
        ['Elites', 2020, 100, [
            ['Vampire', 5000, [less('Attack'), less('Health'), less('Attack Speed')]],
            ['Scatter', 5100, [less('Attack'), less('Health'), less('Attack Speed')]],
            ['Ray', 5200, [less('Attack'), less('Health'), less('Attack Speed')]],
        ]],
        ['Fleets', 2030, 150, [
            ['Saboteur', 6000, [less('Attack Speed'), less('Health'), ['Miss Chance', pct(1)]]],
            ['Commander', 6100, [less('Pulse Effect'), less('Health'), less('Pulse Speed')]],
            ['Overcharge', 6200, [less('Attack'), less('Health'), less('Attack Exponent')]],
        ]],
    ] as [string, number, number, [string, number, [string, (lv: number) => string][]][]][]).flatMap(([section, group, unlock, enemies]) =>
        enemies.map(([enemy, base, stats]): VaultSection => ({
            tree: 'enemy', name: section, group, unlock, enemy, upgrades: enemyRows(base, stats),
        }))),
];

// Upgrades the site's models use, and where.
export const VAULT_USED: Record<number, string> = {
    1200: 'Counted in your card slots (Cards)',
    1810: 'Counted in bot range (Bots, coins)',
};
