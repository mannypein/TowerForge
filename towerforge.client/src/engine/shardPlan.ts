// ============================================================
//  TowerForge Companion — Module shard plan
//  The best way to spend each type's saved Module Shards. Each type's
//  shards level only that type's slots (wiki Currency/Shards), and a
//  type's main effect is its primary module × its assist at Mult
//  Efficiency, so each type's plan splits its own shards between its
//  main and assist slot. Levels are bought in order of gain per shard
//  (looking up to LOOKAHEAD levels ahead, so a cheap level just before a
//  step-up counts with the levels it opens): the most each shard adds
//  as they come in. When the best next level is out of reach the plan
//  saves for it rather than spend on a weaker one — an assist at low
//  Mult Efficiency won't take shards the main slot will want next.
//
//  Levels past the equipped module's rarity cap add nothing (the game
//  shows "Level Capped by Rarity"), so the plan stops there. Slot levels
//  already past the cap are reported: Restore refunds every shard and
//  coin a slot cost (wiki Modules). Costs are after the Module Shard and
//  Module Coin Cost labs. Only the main effect is valued — sub-effect
//  slots that a level reveals aren't.
//  Pure functions — no store imports.
// ============================================================

import { moduleMaxLevel } from '../constants/moduleRarities';
import { activeLoadout } from './statHelpers';
import { MODULE_SLOT_MAX, moduleSlotCost } from './upgradeCosts';
import { slotMainMult } from './towerDamage';
import type { LabData, ModuleEntry, ModuleState, ModuleType } from '../types/gameTypes';

export type SlotPos = 'main' | 'assist';

export interface SlotStep {
    pos: SlotPos;
    from: number;
    to: number;
    shards: number;
    coins: number;
    gainPct: number;     // on the type's main effect
}

export interface ShardPlanSlot {
    module: ModuleEntry | null;
    from: number;        // slot level now
    to: number;          // after the plan
    cap: number;         // the module's rarity cap (levels past it add nothing)
    fixed: boolean;      // a ×value typed on the module: levels don't move it here
}

export interface TypeShardPlan {
    type: ModuleType;
    saved: number;
    now: number;         // the type's main effect now (main × assist)
    after: number;       // after the plan
    gainPct: number;
    main: ShardPlanSlot;
    assist: ShardPlanSlot | null;   // assist slot locked
    shards: number;      // what the plan spends
    coins: number;
    left: number;        // shards it leaves (not enough for another level that adds)
    next: SlotStep | null;          // the best step past the plan — what to save for
    per10k: Record<SlotPos, number | null>;   // % gain per 10,000 shards past the plan
    pastCap: { pos: SlotPos; levels: number; shards: number; coins: number }[];
}

// How far past the plan "next" and the rates look: far enough to see a
// cheap level before a dearer one that adds a lot (the curves step up at
// 100 and 200).
const LOOKAHEAD = 25;
const EPS = 1e-6;

// Shards to reach each level from 0, after the Module Shard Cost lab.
function shardTable(labs: LabData): number[] {
    const cum = [0];
    for (let l = 0; l < MODULE_SLOT_MAX; l++) cum.push(cum[l] + moduleSlotCost(l, l + 1, labs).shards);
    return cum;
}

function planSlot(moduleState: ModuleState, type: ModuleType, pos: SlotPos): ShardPlanSlot {
    const id = activeLoadout(moduleState)?.slots[type]?.[pos] ?? '';
    const module = moduleState.library.find(m => m.id === id) ?? null;
    const from = Math.min(MODULE_SLOT_MAX, Math.max(0, moduleState.slotLevels?.[type]?.[pos] ?? 0));
    const fixed = !!module && (module.mainMult ?? 0) > 0;
    const cap = module ? Math.min(MODULE_SLOT_MAX, moduleMaxLevel(module.rarity)) : 0;
    return { module, from, to: from, cap, fixed };
}

// The highest level this slot's shards can usefully reach: none for an
// empty slot or a typed ×value, else the module's cap.
const topLevel = (s: ShardPlanSlot) => (!s.module || s.fixed ? s.from : Math.max(s.from, s.cap));

export function planTypeShards(
    moduleState: ModuleState,
    labData: LabData,
    type: ModuleType,
    saved: number,
): TypeShardPlan {
    const cum = shardTable(labData);
    const cost = (a: number, b: number) => (b > a ? cum[b] - cum[a] : 0);
    const curve = (pos: SlotPos, lv: number) => slotMainMult(moduleState, type, pos, lv, labData);
    const budget = Math.max(0, saved);

    const main = planSlot(moduleState, type, 'main');
    const assistLocked = (moduleState.assistData[type]?.rarity ?? 'locked') === 'locked';
    const assist = assistLocked ? null : planSlot(moduleState, type, 'assist');
    const slots = (assist ? [['main', main], ['assist', assist]] : [['main', main]]) as [SlotPos, ShardPlanSlot][];

    // Each jump a slot could make from where the plan has it, up to
    // LOOKAHEAD levels, with its gain on the type's main effect.
    const jumpsFrom = (pos: SlotPos, s: ShardPlanSlot): SlotStep[] => {
        const base = curve(pos, s.to);
        const out: SlotStep[] = [];
        for (let to = s.to + 1; to <= Math.min(topLevel(s), s.to + LOOKAHEAD); to++) {
            const shards = cost(s.to, to);
            if (shards > 0) out.push({ pos, from: s.to, to, shards, coins: 0, gainPct: (curve(pos, to) / base - 1) * 100 });
        }
        return out;
    };
    const rateOf = (j: SlotStep) => j.gainPct / j.shards;
    // Both slots' best rate (gain per shard), and the slot with the better one.
    const rates = () => {
        const per: Partial<Record<SlotPos, { slot: ShardPlanSlot; jumps: SlotStep[]; best: SlotStep; rate: number }>> = {};
        let top: (typeof per)[SlotPos] | undefined;
        for (const [pos, slot] of slots) {
            const jumps = jumpsFrom(pos, slot);
            const best = jumps.reduce<SlotStep | undefined>((b, j) => (!b || rateOf(j) > rateOf(b) + 1e-15 ? j : b), undefined);
            if (!best || rateOf(best) <= 1e-15) continue;
            per[pos] = { slot, jumps, best, rate: rateOf(best) };
            if (!top || per[pos]!.rate > top.rate) top = per[pos];
        }
        return { per, top };
    };

    // Levels in order of gain per shard: the better slot's best jump, a
    // level at a time while the shards last. When its next level is out of
    // reach the rest is saved for it, not spent on a weaker one.
    let left = budget;
    for (;;) {
        const { top } = rates();
        if (!top) break;
        const { slot, best } = top;
        while (slot.to < best.to && cost(slot.to, slot.to + 1) <= left + EPS) {
            left -= cost(slot.to, slot.to + 1);
            slot.to++;
        }
        if (slot.to < best.to) break;
    }
    left = Math.max(0, left);

    const now = curve('main', main.from) * (assist ? curve('assist', assist.from) : 1);
    const after = curve('main', main.to) * (assist ? curve('assist', assist.to) : 1);
    const coinsFor = (s: ShardPlanSlot) => moduleSlotCost(s.from, s.to, labData).coins;

    // Past the plan: each slot's rate, and "next" on the slot with the
    // better one — the nearest level worth saving for, the shortest jump
    // that gets at least half that rate (one level, except just under a
    // step-up like 100).
    const past = rates();
    const per10k: Record<SlotPos, number | null> = {
        main: past.per.main ? past.per.main.rate * 10_000 : null,
        assist: past.per.assist ? past.per.assist.rate * 10_000 : null,
    };
    const top = past.top;
    const next = top ? { ...(top.jumps.find(j => rateOf(j) >= top.rate / 2) ?? top.best) } : null;
    if (next) next.coins = moduleSlotCost(next.from, next.to, labData).coins;

    // Levels bought past the module's cap, which count for nothing now.
    const pastCap: TypeShardPlan['pastCap'] = [];
    for (const s of [main, assist]) {
        if (!s?.module || s.fixed || s.from <= s.cap) continue;
        const c = moduleSlotCost(s.cap, s.from, labData);
        pastCap.push({ pos: s === main ? 'main' : 'assist', levels: s.from - s.cap, shards: c.shards, coins: c.coins });
    }

    return {
        type, saved: budget, now, after, gainPct: (after / now - 1) * 100,
        main, assist,
        shards: budget - left, coins: coinsFor(main) + (assist ? coinsFor(assist) : 0),
        left, next, per10k, pastCap,
    };
}
