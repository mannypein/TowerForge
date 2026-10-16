// ============================================================
//  TowerForge Companion — Bot Stat Definitions
//  Bot names, stat labels, and per-level display values.
//  Shared by the Bots tab and the bot share card.
// ============================================================

import type { BotData, BotEntry, BotLoadouts } from '../types/gameTypes';

// ── Bot Data Constants ────────────────────────────────────────
// Each stat: array of display values per level (index 0 = level 1)
const RAW_BOTS: {
    name: string;
    plusMax: number;
    stats: {
        label: string;
        values: string[];
    }[];
}[] = [
        {
            name: 'Flame Bot',
            plusMax: 5,
            stats: [
                {
                    label: 'Damage Reduction',
                    values: [
                        '23%', '26%', '29%', '32%', '35%', '38%', '41%', '44%', '47%', '50%',
                        '53%', '56%', '59%', '62%', '65%', '68%', '71%', '74%', '77%', '80%',
                        '83%', '86%', '89%', '92%', '95%',
                    ],
                },
                {
                    label: 'Cooldown',
                    values: [
                        '72s', '69s', '66s', '63s', '60s', '57s', '54s', '51s', '48s', '45s',
                        '42s', '39s', '36s', '33s', '30s',
                    ],
                },
                {
                    label: 'Damage',
                    values: [
                        '58x', '66x', '74x', '82x', '90x', '98x', '106x', '114x', '122x', '130x',
                        '138x', '146x', '154x', '162x', '170x', '178x', '186x', '194x', '202x', '210x',
                        '218x', '226x', '234x', '242x', '250x', '258x', '266x', '274x', '282x', '290x',
                    ],
                },
                {
                    label: 'Range',
                    values: [
                        '34m', '38m', '42m', '46m', '50m', '54m', '58m', '62m', '66m', '70m',
                        '74m', '78m', '82m', '86m', '90m',
                    ],
                },
            ],
        },
        {
            name: 'Thunder Bot',
            plusMax: 5,
            stats: [
                {
                    label: 'Duration',
                    values: [
                        '5.5s', '6.0s', '6.5s', '7.0s', '7.5s', '8.0s', '8.5s', '9.0s', '9.5s', '10.0s',
                        '10.5s', '11.0s', '11.5s', '12.0s', '12.5s', '13.0s', '13.5s', '14.0s', '14.5s', '15.0s',
                    ],
                },
                {
                    label: 'Cooldown',
                    values: [
                        '117s', '114s', '111s', '108s', '105s', '102s', '99s', '96s', '93s', '90s',
                        '87s', '84s', '81s', '78s', '75s',
                    ],
                },
                {
                    label: 'Linger',
                    values: [
                        '23%', '26%', '29%', '32%', '35%', '38%', '41%', '44%', '47%', '50%',
                        '53%', '56%', '59%', '62%', '65%', '68%', '71%', '74%', '77%', '80%',
                    ],
                },
                {
                    label: 'Range',
                    values: [
                        '28m', '31m', '34m', '37m', '40m', '43m', '46m', '49m', '52m', '55m',
                        '58m', '61m', '64m', '67m', '70m',
                    ],
                },
            ],
        },
        {
            name: 'Golden Bot',
            plusMax: 5,
            stats: [
                {
                    label: 'Duration',
                    values: [
                        '20.5s', '21.0s', '21.5s', '22.0s', '22.5s', '23.0s', '23.5s', '24.0s', '24.5s', '25.0s',
                        '25.5s', '26.0s', '26.5s', '27.0s', '27.5s', '28.0s', '28.5s', '29.0s', '29.5s', '30.0s',
                        '30.5s', '31.0s', '31.5s', '32.0s', '32.5s', '33.0s', '33.5s', '34.0s', '34.5s', '35.0s',
                    ],
                },
                {
                    label: 'Cooldown',
                    values: [
                        '117s', '114s', '111s', '108s', '105s', '102s', '99s', '96s', '93s', '90s',
                        '87s', '84s', '81s', '78s', '75s',
                    ],
                },
                {
                    label: 'Bonus',
                    values: [
                        '2.2x', '2.4x', '2.6x', '2.8x', '3.0x', '3.2x', '3.4x', '3.6x', '3.8x', '4.0x',
                        '4.2x', '4.4x', '4.6x', '4.8x', '5.0x', '5.2x', '5.4x', '5.6x', '5.8x', '6.0x',
                        '6.2x', '6.4x', '6.6x', '6.8x', '7.0x', '7.2x', '7.4x', '7.6x', '7.8x', '8.0x',
                    ],
                },
                {
                    label: 'Range',
                    values: [
                        '22m', '24m', '26m', '28m', '30m', '32m', '34m', '36m', '38m', '40m',
                        '42m', '44m', '46m', '48m', '50m', '52m', '54m', '56m', '58m', '60m',
                    ],
                },
            ],
        },
        {
            name: 'Amplify Bot',
            plusMax: 5,
            stats: [
                {
                    label: 'Duration',
                    values: [
                        '20.5s', '21.0s', '21.5s', '22.0s', '22.5s', '23.0s', '23.5s', '24.0s', '24.5s', '25.0s',
                        '25.5s', '26.0s', '26.5s', '27.0s', '27.5s', '28.0s', '28.5s', '29.0s', '29.5s', '30.0s',
                        '30.5s', '31.0s', '31.5s', '32.0s', '32.5s', '33.0s', '33.5s', '34.0s', '34.5s', '35.0s',
                    ],
                },
                {
                    label: 'Cooldown',
                    values: [
                        '117s', '114s', '111s', '108s', '105s', '102s', '99s', '96s', '93s', '90s',
                        '87s', '84s', '81s', '78s', '75s',
                    ],
                },
                {
                    label: 'Bonus',
                    values: [
                        '3.9x', '4.3x', '4.7x', '5.1x', '5.5x', '5.9x', '6.3x', '6.7x', '7.1x', '7.5x',
                        '7.9x', '8.3x', '8.7x', '9.1x', '9.5x', '9.9x', '10.3x', '10.7x', '11.1x', '11.5x',
                        '11.9x', '12.3x', '12.7x', '13.1x', '13.5x', '13.9x', '14.3x', '14.7x', '15.1x', '15.5x',
                    ],
                },
                {
                    label: 'Range',
                    values: [
                        '27m', '29m', '31m', '33m', '35m', '37m', '39m', '41m', '43m', '45m',
                        '47m', '49m', '51m', '53m', '55m', '57m', '59m', '61m',
                    ],
                },
            ],
        },
        {
            name: 'Bot Bot',
            plusMax: 5,
            stats: [
                {
                    label: 'Duration',
                    values: [
                        '20.5s', '21.0s', '21.5s', '22.0s', '22.5s', '23.0s', '23.5s', '24.0s', '24.5s', '25.0s',
                        '25.5s', '26.0s', '26.5s', '27.0s', '27.5s', '28.0s', '28.5s', '29.0s', '29.5s', '30.0s',
                        '30.5s', '31.0s', '31.5s', '32.0s', '32.5s', '33.0s', '33.5s', '34.0s', '34.5s', '35.0s',
                    ],
                },
                {
                    label: 'Cooldown',
                    values: [
                        '117s', '114s', '111s', '108s', '105s', '102s', '99s', '96s', '93s', '90s',
                        '87s', '84s', '81s', '78s', '75s',
                    ],
                },
                {
                    label: 'Bonus',
                    values: [
                        '1.05x', '1.10x', '1.15x', '1.20x', '1.25x', '1.30x', '1.35x', '1.40x', '1.45x', '1.50x',
                        '1.55x', '1.60x', '1.65x', '1.70x', '1.75x', '1.80x', '1.85x', '1.90x', '1.95x', '2.00x',
                        '2.05x', '2.10x', '2.15x', '2.20x', '2.25x', '2.30x', '2.35x', '2.40x', '2.45x', '2.50x',
                    ],
                },
                {
                    label: 'Range',
                    values: [
                        '27m', '29m', '31m', '33m', '35m', '37m', '39m', '41m', '43m', '45m',
                        '47m', '49m', '51m', '53m', '55m', '57m', '59m', '61m',
                    ],
                },
            ],
        },
    ];

// Level 0 (base unlock) value for a stat, extrapolated one step below Lv 1
// from the existing arithmetic progression. Preserves the unit and the
// decimal format of the source values (e.g. '23%' → '20%', '1.05x' → '1.00x').
function levelZeroValue(values: string[]): string {
    if (values.length < 2) return values[0] ?? '';
    const v0 = parseFloat(values[0]);
    const v1 = parseFloat(values[1]);
    const lv0 = v0 - (v1 - v0);
    const unit = values[0].replace(/[-0-9.]/g, '');
    const decimals = (values[0].split('.')[1] ?? '').replace(/[^0-9]/g, '').length;
    return `${lv0.toFixed(decimals)}${unit}`;
}

// Bot config with a derived Lv 0 (base unlock) value per stat. The original
// values arrays are untouched — Lv 1 stays Lv 1; Lv 0 is the new base below it.
export const BOTS_CONFIG = RAW_BOTS.map(bot => ({
    ...bot,
    stats: bot.stats.map(s => ({ ...s, lv0: levelZeroValue(s.values) })),
}));


// Ownership is an explicit flag (an owned bot can sit at all-Lv 0). Legacy
// saves without the flag fall back to the old "any medal/Bot+ > 0" rule.
export function isBotEntryOwned(entry: BotEntry | undefined): boolean {
    if (!entry) return false;
    if (entry.owned !== undefined) return entry.owned;
    return (entry.medals ?? []).some(v => v > 0) || (entry.plusLv ?? 0) > 0;
}

// Bot levels as one preset sees them (each preset keeps its own medal and
// Bot+ levels, like in game), flattened so the calculators can read them.
export function botsForPreset(botData: BotData, presetIdx: number): BotData {
    return Object.fromEntries(Object.entries(botData).map(([name, e]) => {
        const p = e.presets?.[presetIdx];
        return [name, {
            owned: isBotEntryOwned(e),
            medals: [...(p?.medals ?? e.medals ?? [])],
            plusLv: p?.plusLv ?? e.plusLv ?? 0,
        }];
    }));
}

// Bots active in a preset. A preset that was never edited defaults to every
// owned bot, so new players see their bots as running.
export function getPresetBots(loadouts: BotLoadouts | undefined, presetIdx: number, ownedNames: string[]): string[] {
    return loadouts?.[presetIdx] ?? ownedNames;
}
