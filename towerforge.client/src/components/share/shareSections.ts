// ============================================================
//  TowerForge Companion — Share sections as tiles
//  Turns the shared Profile, Workshop, Labs, Relics and Guardian into
//  the groups StatsShareCard draws: what the sender has, in the game's
//  words, maxed in gold. Only what's above zero is listed, so a share
//  stays short.
// ============================================================

import { LABS, RELICS, WS_ENH, WS_STATS } from '../../constants/gameData';
import { activeChips, guardianPreset } from '../../engine/guardian';
import { enhForPreset } from '../../engine/statHelpers';
import { RELEASED_CHIPS, SKIN_COIN_BONUS } from '../../constants/guardianData';
import type { SharedGuardian, SharedLabs, SharedProfile, SharedRelics, SharedWorkshop } from '../../engine/shareApi';
import type { StatGroup, StatTile } from './StatsShareCard';

const CATEGORY: Record<string, string> = { attack: 'Attack', defense: 'Defense', utility: 'Utility' };
const level = (lv: number, max: number): StatTile['note'] => (lv >= max ? 'Max' : `Lv ${lv} / ${max}`);
const fmtMult = (v: number) => `×${v.toFixed(2)}`;

export function profileGroups(p: SharedProfile): StatGroup[] {
    const account: StatTile[] = [
        { name: 'Build', value: p.build || '—' },
        { name: 'League (highest)', value: p.league || '—' },
        ...(p.currentLeague && p.currentLeague !== p.league ? [{ name: 'League now', value: p.currentLeague }] : []),
        { name: 'Highest tier', value: p.highestTier ? `T${p.highestTier}` : '—' },
        { name: 'Tiers beaten', value: p.completedTier ? String(p.completedTier) : '—' },
    ];
    const waves = Object.entries(p.tierWaves ?? {})
        .map(([t, w]) => [Number(t), w] as const)
        .filter(([, w]) => w > 0)
        .sort((a, b) => a[0] - b[0])
        .map(([t, w]): StatTile => ({ name: `Tier ${t}`, value: `W${w.toLocaleString()}` }));
    return [
        { label: 'Account', tiles: account },
        { label: 'Best wave by tier', tiles: waves },
    ];
}

// One preset's workshop levels and its enhancements.
export function workshopGroups(w: SharedWorkshop, preset: number): StatGroup[] {
    const ws = w.presets[preset] ?? w.presets[0];
    const enh = enhForPreset(w.enh, preset);
    const groups: StatGroup[] = Object.entries(WS_STATS).map(([cat, stats]) => ({
        label: CATEGORY[cat] ?? cat,
        tiles: stats.map(([name, max], i) => ({ lv: ws?.[cat as keyof typeof ws]?.[i] ?? 0, name, max }))
            .filter(s => s.lv > 0)
            .map(s => ({ name: s.name, value: `Lv ${s.lv.toLocaleString()}`, note: s.lv >= s.max ? 'Max' : `of ${s.max.toLocaleString()}`, maxed: s.lv >= s.max })),
    }));
    // Enhancements by category, like the workshop's (the names alone fit a tile).
    const enhGroups = Object.entries(WS_ENH).map(([cat, list]): StatGroup => ({
        label: `${CATEGORY[cat] ?? cat} Enhancements`,
        tiles: list
            .map(([name, max, , step], i) => ({ name, max, step, lv: enh.d?.[cat]?.[i] ?? 0 }))
            .filter(e => e.lv > 0)
            .map(e => ({ name: e.name, value: fmtMult(1 + e.step * e.lv), note: level(e.lv, e.max), maxed: e.lv >= e.max })),
    }));
    return [...groups, ...enhGroups];
}

export function labsGroups(l: SharedLabs): StatGroup[] {
    return LABS.map(({ c, l: labs }) => {
        const tiles = labs
            .map(([name, max]) => ({ name, max, lv: l.levels[name] ?? 0 }))
            .filter(x => x.lv > 0)
            .map((x): StatTile => ({ name: x.name, value: `Lv ${x.lv}`, note: x.lv >= x.max ? 'Max' : `of ${x.max}`, maxed: x.lv >= x.max }));
        const maxed = tiles.filter(t => t.maxed).length;
        return { label: c, note: tiles.length ? `${tiles.length} researched · ${maxed} maxed` : undefined, tiles };
    });
}

export function relicsGroups(r: SharedRelics): StatGroup[] {
    return Object.entries(RELICS).map(([cat, list]) => ({
        label: cat,
        tiles: list
            .map(([key, name, , max, unit]) => ({ name, unit, max, v: r.totals[key] ?? 0 }))
            .filter(x => x.v !== 0)
            .map((x): StatTile => ({ name: x.name, value: `${x.v > 0 && x.unit !== 's' ? '+' : ''}${x.v}${x.unit}` })),
    }));
}

// The Guardian preset a site preset uses: its equipped chips with their
// stats, then what's owned.
export function guardianGroups(s: SharedGuardian, preset: number): StatGroup[] {
    const g = s.guardian;
    if (!g?.unlocked) return [];
    const p = guardianPreset(g, preset);
    const chips = activeChips(g, preset).map((a): StatGroup => ({
        label: a.chip.name,
        note: 'equipped',
        tiles: a.chip.stats.map((stat, k) => ({
            name: stat.name, value: stat.fmt(a.values[k]), note: level(a.levels[k], stat.max), maxed: a.levels[k] >= stat.max,
        })),
    }));
    const owned = RELEASED_CHIPS.filter(c => g.chipsOwned[c.index]).map(c => c.name);
    return [
        ...chips,
        {
            label: 'Guardian',
            tiles: [
                { name: 'Chip slots', value: String(1 + Math.min(2, Math.max(0, p?.extraSlots ?? 0))) },
                { name: 'Chips owned', value: owned.length ? owned.join(', ') : '—' },
                { name: 'Skins', value: String(g.skinsOwned ?? 0), note: `+${((g.skinsOwned ?? 0) * SKIN_COIN_BONUS * 100).toFixed(1)}% coins` },
            ],
        },
    ];
}
