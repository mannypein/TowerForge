// ============================================================
//  TowerForge Companion — Game Icons
//  Icons from the game, trimmed and resized by import-icons.ps1, looked
//  up by name: "Golden Bot" → assets/bots/golden-bot.png. Drop a new PNG
//  named after the bot / module into the folder and it's picked up.
//  Cards, chips, UWs and Vault upgrades come in under the asset folder's
//  own file names (named after the picture: Damage is "sword"), so each
//  is matched to its file below. Missing icons return null (the UI falls
//  back to a drawn badge).
// ============================================================

import type { UWAbbr } from '../types/gameTypes';

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function byName(files: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
        Object.entries(files).map(([path, url]) => [path.split('/').pop()!.replace(/\.png$/, ''), url]),
    );
}

const glob = (files: Record<string, unknown>) => byName(files as Record<string, string>);
const BOT_ICONS = glob(import.meta.glob('../assets/bots/*.png', { eager: true, import: 'default' }));
const MODULE_ICONS = glob(import.meta.glob('../assets/modules/*.png', { eager: true, import: 'default' }));
const CARD_ICONS = glob(import.meta.glob('../assets/cards/*.png', { eager: true, import: 'default' }));
const CHIP_ICONS = glob(import.meta.glob('../assets/chips/*.png', { eager: true, import: 'default' }));
const UW_ICONS = glob(import.meta.glob('../assets/uws/*.png', { eager: true, import: 'default' }));
const VAULT_ICONS = glob(import.meta.glob('../assets/vault/*.png', { eager: true, import: 'default' }));

export const botIcon = (name: string): string | null => BOT_ICONS[slug(name)] ?? null;
export const moduleIcon = (name: string): string | null => MODULE_ICONS[slug(name)] ?? null;

// Each card's picture. Cash has none in the assets yet.
export const CARD_FILES: Record<string, string> = {
    'Damage': 'sword', 'Attack Speed': 'speedometer', 'Health': 'heart', 'Health Regen': 'heartbeat',
    'Range': 'radar', 'Coins': 'coin-card', 'Slow Aura': 'snail', 'Critical Chance': 'critical-chance',
    'Enemy Balance': 'enemy-balance', 'Extra Defense': 'extra-defense', 'Fortress': 'fortress',
    'Free Upgrades': 'upgrade', 'Extra Orb': 'bullseye', 'Plasma Cannon': 'plasma-shot',
    'Critical Coin': 'critical-coin', 'Wave Skip': 'wave-skip', 'Intro Sprint': 'sprint',
    'Land Mine Stun': 'drop-land-mine-card', 'Recovery Pkg Chance': 'recovery-card', 'Cells': 'cells-card',
    'Death Ray': 'death-ray', 'Energy Net': 'net', 'Super Tower': 'super-tower', 'Second Wind': 'second-wind',
    'Demon Mode': 'demon-mode', 'Energy Shield': 'energy', 'Wave Accelerator': 'wave-accelerator',
    'Berserker': 'axes', 'Ultimate Crit': 'critical-ultimate', 'Nuke': 'protector-nuke',
    'Area of Effect': 'area-of-effect',
};
export const cardIcon = (name: string): string | null => CARD_ICONS[CARD_FILES[name] ?? slug(name)] ?? null;

// Guardian chips by their site id; the asset calls Bounty "Steal".
export const chipIcon = (id: string): string | null => CHIP_ICONS[id === 'bounty' ? 'steal' : id] ?? null;

export const UW_FILES: Record<UWAbbr, string> = {
    CL: 'weapon-chain-lightning', SM: 'weapon-smart-missilies', DW: 'weapon-death-wave', CF: 'weapon-chrono-field',
    ILM: 'weapon-land-mines', GT: 'weapon-golden-tower', PS: 'weapon-swamp', BH: 'weapon-black-hole', SL: 'weapon-spotlight',
};
export const uwIcon = (abbr: string): string | null => UW_ICONS[UW_FILES[abbr as UWAbbr]] ?? null;

// Vault upgrades by the game's vault id: a Vault picture, or the card's
// or UW's picture for the same thing ("card:sword", "uw:BH") where the
// assets have none of the Vault's own. Ad Gem Stack's picture grows with
// its level (2×, 3×, 5×).
export const VAULT_FILES: Record<number, string> = {
    // Harmony
    1000: 'auto-restart-run', 1020: 'damage-slider', 1200: 'bonus-card-slot', 1210: 'auto-charge-berzerk',
    1220: 'demon-mode-auto', 1230: 'demon-mode-auto', 1240: 'nuke-auto', 1250: 'nuke-auto',
    1260: 'card:death-ray', 1270: 'card:wave-accelerator', 1280: 'life-saving-reordering', 1290: 'card:energy',
    1400: 'missile-barrage-auto', 1410: 'missile-barrage-auto', 1420: 'uw:BH', 1430: 'uw:PS',
    1600: 'auto-shatter-module', 1610: 'choose-shard-type', 1620: 'reroll-mission', 1630: 'module-reroll-discount',
    1800: 'bot-repec', 1805: 'bot-presets', 1810: 'bot-range-slider',
    2005: 'workshop-presets', 2010: 'enhancement-discount', 2020: 'workshop-orb-adjuster',
    // Power
    1: 'card:sword', 10: 'card:speedometer', 20: 'card:critical-chance', 30: 'crit-factor',
    50: 'multishot', 60: 'rapid-fire', 80: 'super-critical', 90: 'super-crit-multi', 100: 'rend-armor', 110: 'rend-armor',
    200: 'card:heart', 210: 'card:heartbeat', 220: 'card:extra-defense', 230: 'card:extra-defense',
    240: 'thorns-1', 250: 'knockback', 260: 'knockback', 270: 'orb-speed', 280: 'card:bullseye',
    290: 'shockwave', 300: 'shockwave', 310: 'death-defy', 320: 'wall-rebuild', 330: 'wall-rebuild',
    410: 'cash-per-wave', 420: 'card:coin-card', 430: 'coin-per-wave', 440: 'free-attack-upgrade',
    450: 'free-defense-upgrade', 460: 'free-utility-upgrade', 470: 'interest-per-wave', 480: 'card:recovery-card',
    490: 'card:recovery-card', 500: 'enemy-attack-skip', 510: 'enemy-health-skip',
    600: 'card:critical-ultimate', 610: 'uw:CL', 620: 'uw:SM', 630: 'uw:DW', 640: 'uw:ILM', 650: 'uw:GT',
    660: 'uw:PS', 670: 'uw:SL', 680: 'uw:BH',
};

export function vaultIcon(id: number, level = 0): string | null {
    if (id === 1010) return VAULT_ICONS[level >= 4 ? 'ad-gem-stack5x' : level >= 2 ? 'ad-gem-stack3x' : '2x-ad-gem-stack'] ?? null;
    const file = VAULT_FILES[id];
    if (!file) return null;
    if (file.startsWith('card:')) return CARD_ICONS[file.slice(5)] ?? null;
    if (file.startsWith('uw:')) return uwIcon(file.slice(3));
    return VAULT_ICONS[file] ?? null;
}
