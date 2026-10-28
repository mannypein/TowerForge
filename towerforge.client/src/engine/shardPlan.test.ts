// The module shard plan: each type's shards split between its main and
// assist slot for the biggest main effect. Anchor: a real Ancestral armor
// card at slot Lv 200 shows ×16.24 (towerDamage.ts).

import { describe, expect, it } from 'vitest';
import { MODULE_SLOT_SHARDS } from '../constants/moduleCosts';
import { planTypeShards } from './shardPlan';
import { slotMainMult } from './towerDamage';
import { moduleSlotCost } from './upgradeCosts';
import type { LabData, ModuleRarity, ModuleState, ModuleType } from '../types/gameTypes';

type Slot = { rarity: ModuleRarity; lv: number; mainMult?: number };

// A made-up account with one type's slots filled; the assist is locked
// unless it's given.
function modules(type: ModuleType, main: Slot | null, assist?: Slot & { multEff: number }, assistEmpty = false): ModuleState {
    const none = { main: '', assist: '' };
    const lv0 = { main: 0, assist: 0 };
    const library = [
        ...(main ? [{ id: 'm', name: 'Made-up Main', type, rarity: main.rarity, subs: [], mainMult: main.mainMult }] : []),
        ...(assist && !assistEmpty ? [{ id: 'a', name: 'Made-up Assist', type, rarity: assist.rarity, subs: [] }] : []),
    ];
    return {
        library,
        loadouts: [{
            id: 'l', name: 'Farming',
            slots: { cannon: none, armor: none, generator: none, core: none, [type]: { main: main ? 'm' : '', assist: assist && !assistEmpty ? 'a' : '' } },
        }],
        activeLoadout: 'l',
        assistData: assist ? { [type]: { rarity: 'Ancestral', multEff: assist.multEff, subEff: 0 } } : {},
        slotLevels: { cannon: lv0, armor: lv0, generator: lv0, core: lv0, [type]: { main: main?.lv ?? 0, assist: assist?.lv ?? 0 } },
    };
}

const shardsFor = (from: number, to: number, labs: LabData = {}) => moduleSlotCost(from, to, labs).shards;

describe('module shard plan', () => {
    it('levels the main slot to its cap, and no further', () => {
        const ms = modules('armor', { rarity: 'A', lv: 199 });
        const plan = planTypeShards(ms, {}, 'armor', 1_000_000);
        expect(plan.main.to).toBe(200);
        expect(plan.shards).toBe(MODULE_SLOT_SHARDS[199]);
        expect(plan.left).toBe(1_000_000 - MODULE_SLOT_SHARDS[199]);
        expect(plan.after).toBeCloseTo(16.24, 6);               // the card's ×16.24
        expect(plan.gainPct).toBeCloseTo((16.24 / (16.24 - 0.138) - 1) * 100, 5);
        expect(plan.next).toBeNull();                 // nothing past the cap adds
        expect(plan.per10k.main).toBeNull();
        expect(plan.assist).toBeNull();
    });

    it('spends nothing it can’t afford a level with', () => {
        const ms = modules('armor', { rarity: 'A', lv: 199 });
        const plan = planTypeShards(ms, {}, 'armor', MODULE_SLOT_SHARDS[199] - 1);
        expect(plan.main.to).toBe(199);
        expect(plan.shards).toBe(0);
        expect(plan.next).toMatchObject({ pos: 'main', from: 199, to: 200, shards: MODULE_SLOT_SHARDS[199] });
    });

    it('takes the Module Shard Cost lab off', () => {
        const labs = { 'Module Shard Cost': 30 };
        const ms = modules('armor', { rarity: 'A', lv: 199 });
        const plan = planTypeShards(ms, labs, 'armor', MODULE_SLOT_SHARDS[199] * 0.7);
        expect(plan.main.to).toBe(200);
        expect(plan.shards).toBeCloseTo(MODULE_SLOT_SHARDS[199] * 0.7, 6);
    });

    it('puts the shards on the assist when the main is capped', () => {
        const ms = modules('cannon', { rarity: 'A', lv: 200 }, { rarity: 'A', lv: 100, multEff: 50 });
        const plan = planTypeShards(ms, {}, 'cannon', shardsFor(100, 105));
        expect(plan.main.to).toBe(200);
        expect(plan.assist?.to).toBe(105);
        expect(plan.left).toBeCloseTo(0, 6);
    });

    // An assist at 1% Mult Efficiency adds little a shard: the main slot's
    // next level is worth saving for instead (the owner's armor, 2026-10-28).
    it('saves for a better level rather than spend on a weak one', () => {
        const labs = { 'Module Shard Cost': 30 };
        const ms = modules('armor', { rarity: 'A5', lv: 215 }, { rarity: 'A5', lv: 201, multEff: 1 });
        const plan = planTypeShards(ms, labs, 'armor', shardsFor(215, 216, labs) + shardsFor(201, 202, labs));
        expect(plan.main.to).toBe(216);
        expect(plan.assist?.to).toBe(201);
        expect(plan.left).toBeCloseTo(shardsFor(201, 202, labs), 6);
        expect(plan.next).toMatchObject({ pos: 'main', from: 216, to: 217 });
        expect(plan.per10k.main!).toBeGreaterThan(plan.per10k.assist! * 3);
    });

    it('levels both slots when they give about the same a shard', () => {
        const labs = { 'Module Shard Cost': 30 };
        const ms = modules('cannon', { rarity: 'A5', lv: 220 }, { rarity: 'A5', lv: 201, multEff: 58 });
        const plan = planTypeShards(ms, labs, 'cannon', 300_000);
        expect(plan.main.to).toBeGreaterThan(220);
        expect(plan.assist!.to).toBeGreaterThan(201);
        expect(plan.shards).toBeCloseTo(shardsFor(220, plan.main.to, labs) + shardsFor(201, plan.assist!.to, labs), 6);
        expect(plan.shards + plan.left).toBeCloseTo(300_000, 6);
        // What's left can't buy the next level the plan wants.
        expect(plan.next!.shards).toBeGreaterThan(plan.left);
        // Never better than the best split there is.
        let best = 0;
        for (let m = 220; m <= 300; m++) {
            for (let a = 201; a <= 300; a++) {
                if (shardsFor(220, m, labs) + shardsFor(201, a, labs) > 300_000) continue;
                best = Math.max(best, slotMainMult(ms, 'cannon', 'main', m, labs) * slotMainMult(ms, 'cannon', 'assist', a, labs));
            }
        }
        expect(plan.after).toBeLessThanOrEqual(best + 1e-9);
        expect(plan.after).toBeGreaterThan(best * 0.99);
    });

    it('saves for the level past a step-up, not the cheap one before it', () => {
        // Cannon levels add 0.0115 up to 100, then 0.138 a level.
        const ms = modules('cannon', { rarity: 'A', lv: 99 });
        const plan = planTypeShards(ms, {}, 'cannon', 0);
        expect(plan.next?.from).toBe(99);
        expect(plan.next!.to).toBeGreaterThan(100);
        expect(plan.per10k.main).toBeGreaterThan(0);
    });

    it('reports slot levels past the module’s cap', () => {
        const ms = modules('core', { rarity: 'A1', lv: 230 });
        const plan = planTypeShards(ms, {}, 'core', 0);
        const shards = MODULE_SLOT_SHARDS.slice(220, 230).reduce((a, b) => a + b, 0);
        expect(plan.pastCap).toEqual([{ pos: 'main', levels: 10, shards, coins: moduleSlotCost(220, 230, {}).coins }]);
    });

    it('plans nothing for an empty slot or a ×value typed on the module', () => {
        expect(planTypeShards(modules('core', null), {}, 'core', 50_000)).toMatchObject({ shards: 0, gainPct: 0, next: null });
        const typed = planTypeShards(modules('core', { rarity: 'A', lv: 150, mainMult: 20 }), {}, 'core', 50_000);
        expect(typed.main.fixed).toBe(true);
        expect(typed).toMatchObject({ shards: 0, gainPct: 0, next: null });
        // An assist slot with no module in it isn't levelled either.
        const emptyAssist = modules('core', { rarity: 'A', lv: 200 }, { rarity: 'A', lv: 50, multEff: 40 }, true);
        expect(planTypeShards(emptyAssist, {}, 'core', 50_000).assist?.to).toBe(50);
    });
});
