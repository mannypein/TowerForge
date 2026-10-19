// ============================================================
//  TowerForge Companion — Best module loadout
//  Which of your modules to equip, main and assist for each type, to get
//  the most out of a goal — waves for a tournament or a push.
//
//  Every module you own of a type is tried in its main slot and its assist
//  slot (assist only once that slot is unlocked), scored with the account's
//  own calibrated model (main effect at the slot's level, substats at the
//  slot's efficiency, unique effects the model reads). One slot changes at
//  a time and the best stays, round after round, until nothing improves —
//  so modules that work together (a core that feeds the UWs a cannon's
//  substats boost) are found together. The same module can't sit in two
//  slots.
//  Pure functions — no store imports.
// ============================================================

import type { LoadoutSlots, ModuleState, ModuleType } from '../types/gameTypes';
import type { OptimizerSnapshot } from './optimizer';
import { goalScore } from './optimizer';
import { readActiveModuleBonuses } from './modBonuses';
import { activeLoadout } from './statHelpers';
import { healthSkipChance, healthSkipSources } from './levelSkip';

const TYPES: ModuleType[] = ['cannon', 'armor', 'generator', 'core'];
const POSITIONS = ['main', 'assist'] as const;
const MAX_ROUNDS = 4;

export interface SlotChange {
    type: ModuleType;
    position: 'main' | 'assist';
    from: string;               // module id ('' = empty)
    to: string;
}

export interface LoadoutResult {
    slots: LoadoutSlots;        // the best loadout found
    gainPct: number;            // its score against the current loadout, in %
    skipPoints: number;         // Enemy Health Level Skip points it adds (substats)
    changes: SlotChange[];
    evaluated: number;          // loadouts scored
}

const EMPTY_SLOTS: LoadoutSlots = {
    cannon: { main: '', assist: '' }, armor: { main: '', assist: '' },
    generator: { main: '', assist: '' }, core: { main: '', assist: '' },
};

// The snapshot with these slots in its equipped loadout.
function withSlots(snap: OptimizerSnapshot, slots: LoadoutSlots): OptimizerSnapshot {
    // Only the equipped loadout changes; the library is shared, not copied.
    const current = activeLoadout(snap.moduleState);
    const moduleState: ModuleState = current
        ? { ...snap.moduleState, loadouts: snap.moduleState.loadouts.map(l => (l === current ? { ...l, slots } : l)) }
        : { ...snap.moduleState, loadouts: [{ id: 'best', name: 'Best', slots }], activeLoadout: 'best' };
    return {
        ...snap,
        moduleState,
        modBonuses: readActiveModuleBonuses(moduleState, snap.perkData, snap.labData, snap.cardData, snap.modBonuses.run),
    };
}

const skipOf = (s: OptimizerSnapshot) => healthSkipChance(healthSkipSources(
    s.wsData[s.presetIdx], s.labData, s.enhData, s.relicData, s.modBonuses.subs ?? {},
));

// A loadout's score and Enemy Health Level Skip chance, for one swap on its own.
export function loadoutScore(snap: OptimizerSnapshot, slots: LoadoutSlots): { score: number; skip: number } {
    const s = withSlots(snap, slots);
    return { score: goalScore(s), skip: skipOf(s) };
}

// The best loadout for the goal the snapshot is set up for (accountModels.applyGoal).
export function bestLoadout(snap: OptimizerSnapshot): LoadoutResult {
    const start: LoadoutSlots = JSON.parse(JSON.stringify(activeLoadout(snap.moduleState)?.slots ?? EMPTY_SLOTS));
    let slots: LoadoutSlots = JSON.parse(JSON.stringify(start));
    const score0 = goalScore(withSlots(snap, start));
    let best = score0;
    let evaluated = 1;

    const owned = (type: ModuleType) => snap.moduleState.library.filter(m => m.type === type).map(m => m.id);
    const assistOpen = (type: ModuleType) => (snap.moduleState.assistData[type]?.rarity ?? 'locked') !== 'locked';

    for (let round = 0; round < MAX_ROUNDS; round++) {
        let improved = false;
        for (const type of TYPES) {
            for (const position of POSITIONS) {
                if (position === 'assist' && !assistOpen(type)) continue;
                const other = position === 'main' ? slots[type].assist : slots[type].main;
                for (const id of owned(type)) {
                    if (id === slots[type][position] || id === other) continue;
                    const trial: LoadoutSlots = { ...slots, [type]: { ...slots[type], [position]: id } };
                    const score = goalScore(withSlots(snap, trial));
                    evaluated++;
                    if (score > best * (1 + 1e-9)) {
                        best = score;
                        slots = trial;
                        improved = true;
                    }
                }
            }
        }
        if (!improved) break;
    }

    const changes: SlotChange[] = [];
    for (const type of TYPES) {
        for (const position of POSITIONS) {
            if (start[type][position] !== slots[type][position]) {
                changes.push({ type, position, from: start[type][position], to: slots[type][position] });
            }
        }
    }
    return {
        slots,
        gainPct: score0 > 0 ? (best / score0 - 1) * 100 : 0,
        skipPoints: skipOf(withSlots(snap, slots)) - skipOf(withSlots(snap, start)),
        changes,
        evaluated,
    };
}
