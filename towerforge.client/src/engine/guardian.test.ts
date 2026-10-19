// The Guardian: chip tables pinned to the wiki's Bits totals, the import
// (chips by save index, presets, slots), what each counted chip does, and
// the Optimizer's Bits panel — on made-up accounts.

import { describe, expect, it } from 'vitest';
import { useGameStore } from '../store/useGameStore';
import { CHIPS, chipById, statBits } from '../constants/guardianData';
import {
    activeChips, bountyExtra, damageMeterFactor, defaultGuardianData, fetchRate, summonExtra, withChipLevel,
} from './guardian';
import { parseGameExport } from './gameExport';
import { readActiveModuleBonuses } from './modBonuses';
import { DEFAULT_RUN_RATES } from './runRates';
import { buildCandidates } from './optimizer';
import type { OptimizerSnapshot } from './optimizer';
import { buildFarmCalibration, coinRate } from './farming';
import { changeCost, upgradeTargets } from './whatIf';
import type { GuardianData } from '../types/gameTypes';
import { battle, makeExport } from '../test/makeExport';

// A Guardian with these chips in the first preset, every slot open.
function guardian(chips: Record<string, number[]>): GuardianData {
    const g = defaultGuardianData();
    const levels = Array(CHIPS.length * 3).fill(0);
    const equipped: number[] = [];
    for (const [id, lv] of Object.entries(chips)) {
        const c = chipById(id as never);
        lv.forEach((v, k) => { levels[c.index * 3 + k] = v; });
        equipped.push(c.index);
    }
    return {
        ...g, unlocked: true,
        chipsOwned: CHIPS.map(c => c.released),
        presets: [{ name: 'P', extraSlots: 2, chips: [...equipped, -1, -1, -1].slice(0, 3), levels }],
    };
}

describe('chip tables', () => {
    it('add up to the wiki’s Bits totals for every stat', () => {
        const totals: Record<string, number[]> = {
            attack: [4750, 4095, 4500], ally: [6370, 4005, 4095], bounty: [4950, 3660, 4500],
            fetch: [3660, 4700, 6120], summon: [4900, 4800, 4500], scout: [4900, 4300, 4650],
        };
        for (const [id, want] of Object.entries(totals)) {
            const c = chipById(id as never);
            expect(c.stats.map(s => statBits(s, 0, s.max)), id).toEqual(want);
        }
    });

    it('end at the wiki’s maximums', () => {
        const at = (id: string, k: number) => { const s = chipById(id as never).stats[k]; return s.value(s.max); };
        expect([at('attack', 0), at('attack', 1), at('attack', 2)]).toEqual([20, 30, 10]);
        expect(at('ally', 1)).toBeCloseTo(10, 10);             // Max Recovery ×10
        expect(at('bounty', 0)).toBeCloseTo(2, 10);            // ×2.00
        expect([at('fetch', 0), at('fetch', 1), at('fetch', 2)]).toEqual([60, 50, 50]);
        expect([at('summon', 0), at('summon', 1), at('summon', 2)]).toEqual([70, 35, 10]);
        expect(at('scout', 1)).toBeCloseTo(6, 10);             // Range Bonus ×6.0
    });
});

describe('Guardian import', () => {
    // Chips by save index: 7 Summon, 6 Fetch, 8 Scout, 2 Attack, 5 Ally.
    const raw = makeExport({
        GuardianUnlocked: true,
        GuardianSlotsUnlocked: 2,
        GuardianChipSlot: [7, 6, 8],
        GuardianChipUnlocked: [true, false, true, false, false, true, true, true, true, false],
        GuardianChipLevel: Array(30).fill(0).map((_, i) => (i === 21 ? 70 : i === 22 ? 25 : 0)),
        GuardianSkinUnlocked: [true, true, false, true],
        CurrentGuardianPreset: 0,
        GuardianPresets: [
            { PresetName: 'Farm', SlotsUnlocked: 2, ChipSlot: [7, 6, 8], ChipLevel: Array(30).fill(0) },
            { PresetName: 'Tourney', SlotsUnlocked: 1, ChipSlot: [8, 2, -1], ChipLevel: Array(30).fill(0).map((_, i) => (i === 24 ? 70 : 0)) },
        ],
        GlobalPresets: [{ GuardiansIndex: 0 }, { GuardiansIndex: 1 }],
    });
    const g = parseGameExport(raw).guardian!;

    it('reads owned chips, skins, presets and which one each site preset uses', () => {
        expect(g.unlocked).toBe(true);
        expect(CHIPS.filter(c => g.chipsOwned[c.index]).map(c => c.name)).toEqual(['Bounty', 'Attack', 'Ally', 'Fetch', 'Summon', 'Scout']);
        expect(g.skinsOwned).toBe(3);
        expect(g.presets.map(p => p.name)).toEqual(['Farm', 'Tourney']);
        expect(g.presetFor.slice(0, 2)).toEqual([0, 1]);
    });

    it('takes the current preset’s levels from the live fields, and counts slots as 1 + bought', () => {
        const farm = activeChips(g, 0);
        expect(farm.map(a => a.chip.name)).toEqual(['Summon', 'Fetch', 'Scout']);
        expect(farm[0].values).toEqual([70, 30, 1]);           // Summon cooldown 70 levels → 70s
        const tourney = activeChips(g, 1);
        expect(tourney.map(a => a.chip.name)).toEqual(['Scout', 'Attack']);
        expect(tourney[0].values[0]).toBe(35);                 // Scout cooldown maxed
    });
});

describe('what the chips do', () => {
    it('Scout stretches Damage/Meter’s distance while it’s up', () => {
        const g = guardian({ scout: [0, 0, 0] });              // 105s cooldown, ×2, 5s
        const base = damageMeterFactor(undefined, 0, 0.1, 80);
        expect(base).toBeCloseTo(1 + 0.1 * 40, 10);            // half the range on average
        const scout = damageMeterFactor(g, 0, 0.1, 80);
        expect(scout).toBeCloseTo(1 + 0.1 * 40 * (1 + (5 / 105) * 1), 10);
        expect(damageMeterFactor(g, 0, 0, 80)).toBe(1);        // nothing to stretch without Damage/Meter
    });

    it('Bounty tags Targets kills per cooldown, at most the non-Common ones', () => {
        const g = guardian({ bounty: [99, 60, 9] });           // ×2.00, 60s, 10 targets
        expect(bountyExtra(g, 0, 1)).toBeCloseTo((10 / 60) * 1, 10);
        expect(bountyExtra(g, 0, 0.01)).toBeCloseTo(0.8, 10);   // capped
    });

    it('Summon adds 2 kills a second while active; Fetch finds per second', () => {
        const g = guardian({ summon: [70, 30, 0], fetch: [60, 40, 48] });
        expect(summonExtra(g, 0, 2)).toBeCloseTo((2 * 35) / 70 / 2, 10);
        expect(fetchRate(g, 0)).toBeCloseTo((0.5 * 1.5) / 60, 10);
    });

    it('chips only count when equipped, owned and in an open slot', () => {
        const g = guardian({ summon: [0, 0, 0] });
        expect(activeChips({ ...g, unlocked: false }, 0)).toEqual([]);
        expect(activeChips({ ...g, chipsOwned: g.chipsOwned.map(() => false) }, 0)).toEqual([]);
        const closed = { ...g, presets: [{ ...g.presets[0], chips: [-1, 7, -1], extraSlots: 0 }] };
        expect(activeChips(closed, 0)).toEqual([]);
    });

    it('a level change lands in the site preset’s Guardian preset only', () => {
        const g = { ...guardian({ fetch: [0, 0, 0] }), presetFor: [0, 1, 0, 0, 0] };
        g.presets = [...g.presets, { ...g.presets[0], name: 'Second' }];
        const next = withChipLevel(g, 1, chipById('fetch').index, 1, 999);
        expect(next.presets[1].levels[chipById('fetch').index * 3 + 1]).toBe(40);   // capped at the max
        expect(next.presets[0].levels[chipById('fetch').index * 3 + 1]).toBe(0);
    });
});

describe('Guardian in the coin model, Optimizer and What If', () => {
    const report = parseGameExport(makeExport({
        BattleHistory: [battle({
            TotalEnemies: 10000, GameTime: 5000, RealTime: 3600, Wave: 3000,
            CoinsEarned: 1e15, GuardianCoinsFetched: 1e14,
        })],
    })).battles[0];
    function snap(g: GuardianData): OptimizerSnapshot {
        const st = useGameStore.getState();
        const cardData = { data: {}, slots: 1, presets: { 0: [] } };
        return {
            presetIdx: 0, wsData: JSON.parse(JSON.stringify(st.wsData)), enhData: JSON.parse(JSON.stringify(st.enhData)),
            labData: {}, cardData, perkData: { banned: [] }, uwData: { stones: 0, data: {} }, relicData: {},
            modBonuses: readActiveModuleBonuses(st.moduleState, { banned: [] }, {}, cardData, { ...DEFAULT_RUN_RATES, killsPerSec: 2 }),
            moduleState: JSON.parse(JSON.stringify(st.moduleState)), botData: {}, metric: 'coins', guardian: g,
        };
    }

    it('fetched coins are their own share, scaled by finds', () => {
        const s = snap(guardian({ fetch: [0, 0, 0] }));
        const calib = buildFarmCalibration(s, report);
        expect(calib.shares.fetch).toBeCloseTo(0.1, 6);
        const faster = { ...s, guardian: withChipLevel(s.guardian!, 0, chipById('fetch').index, 0, 60) };   // 120s → 60s
        expect(coinRate(faster, calib)).toBeCloseTo(0.9 + 0.1 * 2, 6);
    });

    it('Bounty and Summon raise kill coins', () => {
        const s = snap(guardian({ bounty: [0, 0, 0], summon: [0, 0, 0] }));
        s.farm = buildFarmCalibration(s, report);
        expect(coinRate(s, s.farm)).toBeCloseTo(1, 10);
        const more = { ...s, guardian: withChipLevel(s.guardian!, 0, chipById('bounty').index, 0, 99) };
        expect(coinRate(more, s.farm)).toBeGreaterThan(1);
        const longer = { ...s, guardian: withChipLevel(s.guardian!, 0, chipById('summon').index, 1, 30) };
        expect(coinRate(longer, s.farm)).toBeGreaterThan(1);
    });

    it('the Bits panel ranks equipped chips’ next levels at their real price', () => {
        const s = snap(guardian({ bounty: [0, 0, 0] }));
        s.farm = buildFarmCalibration(s, report);
        const rows = buildCandidates(s, 'guardian');
        expect(rows.map(r => r.label).sort()).toEqual(['Bounty — Cooldown', 'Bounty — Multiplier', 'Bounty — Targets']);
        expect(rows.every(r => r.costType === 'bits' && r.scorePct > 0)).toBe(true);
        expect(rows.find(r => r.label === 'Bounty — Targets')!.cost).toBe(100);
    });

    it('What If offers equipped chips, priced in Bits', () => {
        const s = snap(guardian({ scout: [0, 0, 0] }));
        const t = upgradeTargets(s).find(x => x.kind === 'guardian' && x.label === 'Scout — Duration')!;
        expect(t.max).toBe(30);
        expect(changeCost(s, t, 30)).toEqual({ bits: 4650 });
    });
});
