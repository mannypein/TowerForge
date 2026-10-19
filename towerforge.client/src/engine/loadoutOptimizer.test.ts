// Tests for the best-loadout search, on a made-up account: core modules
// that differ only in a Chain Lightning substat, scored with the
// calibrated eDPS of a made-up run where Chain Lightning does 10%.

import { describe, expect, it } from 'vitest';
import { useGameStore } from '../store/useGameStore';
import { readActiveModuleBonuses } from './modBonuses';
import { runRatesFrom } from './runRates';
import { parseGameExport } from './gameExport';
import { buildEdpsCalibration } from './edps';
import { bestLoadout, loadoutScore } from './loadoutOptimizer';
import type { OptimizerSnapshot } from './optimizer';
import type { BattleReport } from './battleReport';
import type { LoadoutSlots, ModuleEntry, ModuleState } from '../types/gameTypes';
import { UWS } from '../constants/gameData';
import { battle, makeExport } from '../test/makeExport';

const report: BattleReport = parseGameExport(makeExport({
    BattleHistory: [battle({
        TotalEnemies: 1000, GameTime: 10000, Wave: 500,
        DamageDealt: 1000, ChainLightningDamage: 100, OrbDamage: 800, ProjectilesDamage: 100,
        ProjectilesCount: 10000, EnemiesHitByChainLightningThisRound: 500,
    })],
})).battles[0];

// Same rarity, so the same main effect; only the Chain Lightning substat differs.
const core = (id: string, qty: number): ModuleEntry => ({
    id, name: `Core ${id}`, type: 'core', rarity: 'L',
    subs: qty ? [{ effect: 'Chain Lightning - Quantity', rar: 'L', val: String(qty) }] : [],
});

const EMPTY = { main: '', assist: '' };
function snapshot(library: ModuleEntry[], coreSlots: { main: string; assist: string }, assistOpen: boolean): OptimizerSnapshot {
    const st = useGameStore.getState();
    const moduleState: ModuleState = {
        library,
        loadouts: [{ id: 'l', name: 'Now', slots: { cannon: EMPTY, armor: EMPTY, generator: EMPTY, core: coreSlots } }],
        activeLoadout: 'l',
        assistData: assistOpen ? { core: { rarity: 'Legendary', multEff: 50, subEff: 50 } } : {},
        slotLevels: { cannon: { main: 0, assist: 0 }, armor: { main: 0, assist: 0 }, generator: { main: 0, assist: 0 }, core: { main: 100, assist: 0 } },
    };
    const cardData = { data: {}, slots: 1, presets: { 0: [] } };
    const snap: OptimizerSnapshot = {
        presetIdx: 0,
        wsData: JSON.parse(JSON.stringify(st.wsData)),
        enhData: JSON.parse(JSON.stringify(st.enhData)),
        labData: {},
        cardData,
        perkData: { banned: [] },
        uwData: { stones: 0, data: Object.fromEntries(UWS.map(u => [u.a, { own: true, sv: [10, 3, 10], upOwn: false, upLvl: 0 }])) },
        relicData: {},
        modBonuses: readActiveModuleBonuses(moduleState, { banned: [] }, {}, cardData, runRatesFrom(report)),
        moduleState,
        botData: {},
        metric: 'edps',
    };
    snap.edps = buildEdpsCalibration(snap, report) ?? undefined;
    return snap;
}

describe('best module loadout', () => {
    it('puts the stronger module in the main slot', () => {
        const snap = snapshot([core('plain', 0), core('cl', 2)], { main: 'plain', assist: '' }, false);
        const r = bestLoadout(snap);
        expect(r.slots.core.main).toBe('cl');
        expect(r.changes).toEqual([{ type: 'core', position: 'main', from: 'plain', to: 'cl' }]);
        expect(r.gainPct).toBeGreaterThan(0);
    });

    it('fills the assist slot only once it is unlocked', () => {
        const lib = [core('plain', 0), core('cl', 2), core('cl1', 1)];
        expect(bestLoadout(snapshot(lib, { main: 'plain', assist: '' }, false)).slots.core.assist).toBe('');
        const open = bestLoadout(snapshot(lib, { main: 'plain', assist: '' }, true));
        expect(open.slots.core).toEqual({ main: 'cl', assist: 'cl1' });
    });

    it('never puts one module in two slots', () => {
        const r = bestLoadout(snapshot([core('cl', 2)], { main: '', assist: '' }, true));
        expect(r.slots.core).toEqual({ main: 'cl', assist: '' });
    });

    it('keeps the loadout when it is already the best, and leaves the account untouched', () => {
        const snap = snapshot([core('plain', 0), core('cl', 2)], { main: 'cl', assist: '' }, false);
        const before = JSON.stringify(snap.moduleState);
        const r = bestLoadout(snap);
        expect(r.changes).toEqual([]);
        expect(r.gainPct).toBe(0);
        expect(JSON.stringify(snap.moduleState)).toBe(before);
    });

    it('scores a swap on its own against the current loadout', () => {
        const snap = snapshot([core('plain', 0), core('cl', 2)], { main: 'plain', assist: '' }, false);
        const now = snap.moduleState.loadouts[0].slots;
        const swapped: LoadoutSlots = { ...now, core: { main: 'cl', assist: '' } };
        const gain = loadoutScore(snap, swapped).score / loadoutScore(snap, now).score - 1;
        expect(gain * 100).toBeCloseTo(bestLoadout(snap).gainPct, 9);
    });
});
