// ============================================================
//  TowerForge Companion — Orbs: how many, how fast, how big
//  Orbs circle the tower and destroy most enemies they touch (not
//  bosses, elites, fleets or enemies a Protector shields). How often an
//  enemy crossing their ring gets touched follows the orbs passing its
//  spot: orbs × rotations a minute × orb size. That rate, against the
//  calibration run's, scales the touches the run's own orb kills show
//  (edps.ts for the enemies that end Glass Cannon runs, ehp.ts for the
//  enemies that never reach an eHP tower).
//
//  From the wiki's Orbs page (read 2026-10-23):
//  - Orb Speed (workshop, 38 levels): 0.4 + 0.15 a level rotations a
//    minute (0.55 at 1 … 6.10 at 38); the Orb Speed lab adds 0.1 a level
//    (20 levels, +2.0); the Orb Speed relics multiply it (+28% at most);
//    an armor's Orb Speed substat adds its value.
//  - Orbs (workshop, 4 levels): +1 a level; the orb perk +1 a pick (2
//    picks); an armor's Orbs substat +1/+2; the Vault +2 (not counted —
//    its save id isn't mapped).
//  - Orb Size enhancement: ×1 + 0.01 a level (200 levels, ×3).
//  - Extra Orb card: one more orb going the other way at the workshop
//    speed + the card's value; Extra Extra Orbs lab +1 / +2 more, each
//    level 5% slower.
//  The orb perk isn't on the Perks tab yet, so it's counted as taken —
//  the code's assumption, as are the size and the extra orbs counting
//  like workshop orbs (the wiki doesn't say how size widens a touch).
//  Pure functions — no store imports.
// ============================================================

import { WS_ENH, WS_STATS } from '../constants/gameData';
import { activeCard, cardValue } from './statHelpers';
import type { OptimizerSnapshot } from './optimizer';

const ORB_PERK_ORBS = 2;

export interface OrbStats {
    orbs: number;          // workshop orbs (perk, substat included)
    speed: number;         // rotations a minute
    size: number;          // Orb Size enhancement multiplier
    extraOrbs: number;     // Extra Orb card orbs
    extraSpeed: number;
    rate: number;          // size × (orbs × speed + extra orbs × their speed)
}

type OrbSnap = Pick<OptimizerSnapshot, 'presetIdx' | 'wsData' | 'labData' | 'cardData' | 'relicData' | 'enhData' | 'modBonuses'>;

export function orbStats(snap: OrbSnap): OrbStats {
    const ws = snap.wsData[snap.presetIdx];
    const wsLv = (name: string) => ws?.defense?.[WS_STATS.defense.findIndex(([n]) => n === name)] ?? 0;
    const subs = snap.modBonuses.subs ?? {};
    const orbLevels = wsLv('Orbs');
    if (orbLevels <= 0) return { orbs: 0, speed: 0, size: 1, extraOrbs: 0, extraSpeed: 0, rate: 0 };

    const speedLv = wsLv('Orb Speed');
    const speed = (0.4 + 0.15 * speedLv + 0.1 * (snap.labData['Orb Speed Lab'] ?? 0) + (subs['Orb Speed'] ?? 0))
        * (1 + (snap.relicData['rOrb'] ?? 0) / 100);
    const orbs = orbLevels + ORB_PERK_ORBS + (subs['Orbs'] ?? 0);

    const sizeIdx = WS_ENH.defense.findIndex(([n]) => n === 'Orb Size');
    const sizeOwned = snap.enhData?.u?.defense?.[sizeIdx] ?? false;
    const size = sizeOwned ? 1 + 0.01 * (snap.enhData?.d?.defense?.[sizeIdx] ?? 0) : 1;

    const card = activeCard(snap.cardData, snap.presetIdx, 'Extra Orb');
    const extraLab = snap.labData['Extra Extra Orbs'] ?? 0;
    const extraOrbs = card ? 1 + extraLab : 0;
    const extraSpeed = card ? (speed + cardValue('Extra Orb', card.stars)) * (1 - 0.05 * extraLab) : 0;

    return { orbs, speed, size, extraOrbs, extraSpeed, rate: size * (orbs * speed + extraOrbs * extraSpeed) };
}

// Touches now ÷ at a calibration whose rate was `anchorRate` (1 without orbs).
export const orbRateRatio = (snap: OrbSnap, anchorRate: number) =>
    (anchorRate > 0 ? orbStats(snap).rate / anchorRate : 1);
