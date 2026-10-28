// ============================================================
//  TowerForge Companion — UW Tab
//  The nine Ultimate Weapons drawn like the game's UW screen (UWPanel):
//  each stat's value and next cost — tap a stat to set its level — the
//  effective value with module and lab bonuses, and the UW+ along the
//  bottom once all nine are owned. Stones for the next UW and UW+.
// ============================================================

import { useRef } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { UWS, UW_PLUS_UNLOCK_COSTS, UW_UNLOCK_COSTS, uwStatValues } from '../../constants/gameData';
import { readActiveModuleBonuses } from '../../engine/modBonuses';
import type { UWAbbr } from '../../types/gameTypes';
import stoneIcon from '../../assets/stone.png';
import UWPanel from '../common/UWPanel';
import UWShareCard from '../share/UWShareCard';
import { SHARE_OFFSCREEN_STYLE } from '../share/shareTheme';
import { openExportDialog } from '../share/exportImages';

// Which uwBonus key corresponds to each stat index per UW.
// null = no module sub-effect targets that stat.
// 'slow' and 'dmg' are stored as fractions (0.15 = 15%) — ×100 for display.
const STAT_BONUS_KEYS: Partial<Record<UWAbbr, (string | null)[]>> = {
    CL:  ['dmg',   null,  null],    // stat 0 Damage receives b.dmg (multiplicative)
    SM:  [null,    'qty', 'cd'],
    DW:  [null,    null,  'cd'],
    CF:  ['dur',   'slow','cd'],
    ILM: [null,    'qty', 'cd'],
    GT:  [null,    'dur', 'cd'],
    PS:  [null,    'dur', 'cd'],
    BH:  [null,    'dur', 'cd'],
    SL:  ['bonus', 'angle', null],
};

// UW labs that add directly to a tracked stat (in display units, e.g. seconds or ×).
// perLevel is the bonus added per lab level.
const UW_LAB_BONUSES: Partial<Record<UWAbbr, { labName: string; statIdx: number; perLevel: number }[]>> = {
    CF: [{ labName: 'CF-Duration', statIdx: 0, perLevel: 1 }],
    GT: [
        { labName: 'GT-Bonus',    statIdx: 0, perLevel: 0.15 },
        { labName: 'GT-Duration', statIdx: 1, perLevel: 1 },
    ],
};

// Compute effective display value combining module sub-stat bonus + lab bonus.
// modBonus: from uwBonus (fractions for 'slow'/'dmg', direct seconds otherwise).
// labBonus: already in display units (seconds, multiplier value, etc.).
function computeEffective(
    displayStr: string,
    bonusKey: string | null,
    modBonus: number,
    labBonus: number,
): string | null {
    const base = parseFloat(displayStr);
    if (isNaN(base)) return null;
    const unit = displayStr.replace(/[-0-9.]/g, '');
    const decimals = (displayStr.split('.')[1] ?? '').replace(/[^0-9]/g, '').length;

    // 'dmg' is a multiplicative bonus on a × multiplier stat (CL Damage):
    // effective = (base + labBonus) × (1 + modBonus).
    if (bonusKey === 'dmg') {
        if (!modBonus && !labBonus) return null;
        const effective = (base + labBonus) * (1 + modBonus);
        return `${effective.toFixed(decimals)}${unit}`;
    }

    // Additive bonuses: 'slow' is stored as a fraction (×100 for display %),
    // everything else is already in display units (seconds, ×, etc.).
    const modDisplay = bonusKey === 'slow' ? modBonus * 100 : modBonus;
    const totalBonus = modDisplay + labBonus;
    if (!totalBonus) return null;
    const effective = base + totalBonus;
    return `${effective.toFixed(decimals)}${unit}`;
}

export default function UWTab() {
    const uwData = useGameStore(s => s.uwData);
    const setUWStat = useGameStore(s => s.setUWStat);
    const setUWOwned = useGameStore(s => s.setUWOwned);
    const setUWPlusOwned = useGameStore(s => s.setUWPlusOwned);
    const setUWPlusLevel = useGameStore(s => s.setUWPlusLevel);

    const moduleState = useGameStore(s => s.moduleState);
    const perkData = useGameStore(s => s.perkData);
    const labData = useGameStore(s => s.labData);
    const cardData = useGameStore(s => s.cardData);
    const modBonuses = readActiveModuleBonuses(moduleState, perkData, labData, cardData);

    const ownedCount = UWS.filter(u => uwData.data[u.a]?.own).length;
    const allUWsOwned = ownedCount >= UWS.length;

    // UW_UNLOCK_COSTS is one sequence by how many UWs are owned (the 1st
    // costs [0], the 2nd [1]…), and UW+ unlocks likewise by how many UW+
    // are unlocked — the next one's price, whichever it is.
    const nextUWUnlockCost = UW_UNLOCK_COSTS[ownedCount] ?? null;
    const unlockedPlusCount = UWS.filter(u => uwData.data[u.a]?.upOwn).length;
    const plusUnlockCost = UW_PLUS_UNLOCK_COSTS[unlockedPlusCount];

    const shareRef = useRef<HTMLDivElement>(null);
    const handleExport = () => openExportDialog(shareRef.current, 'towerforge-uws', 'Ultimate Weapons');

    // A stat's value with its module sub-effect and lab bonuses, when any.
    function effectiveValues(a: UWAbbr): (string | null)[] {
        const ud = uwData.data[a];
        const uwBonusMap = (modBonuses.uwBonus as Record<string, Record<string, number>>)[a] ?? {};
        return [0, 1, 2].map(i => {
            const vals = uwStatValues(a, i);
            const cur = vals[(ud?.sv[i] ?? 1) - 1];
            const bonusKey = STAT_BONUS_KEYS[a]?.[i] ?? null;
            const labBonus = (UW_LAB_BONUSES[a] ?? [])
                .filter(lb => lb.statIdx === i)
                .reduce((sum, lb) => sum + (labData[lb.labName] ?? 0) * lb.perLevel, 0);
            if (!cur || (!bonusKey && !labBonus)) return null;
            return computeEffective(cur, bonusKey, bonusKey ? (uwBonusMap[bonusKey] ?? 0) : 0, labBonus);
        });
    }

    return (
        <div>
            {/* ── Off-screen share card (rendered for export only) ── */}
            <div style={SHARE_OFFSCREEN_STYLE} aria-hidden="true">
                <UWShareCard ref={shareRef} poster />
            </div>

            <div className="uwg-bar">
                <span className="uwg-count">{ownedCount}/9 owned</span>
                {!allUWsOwned && (
                    <span className="uwg-count">
                        Next UW:{' '}
                        {nextUWUnlockCost !== null ? <strong>{nextUWUnlockCost.toLocaleString()}<img src={stoneIcon} alt="stones" className="cost-icon" /></strong> : 'unknown'}
                        {' · '}UW+ opens once all 9 are owned
                    </span>
                )}
                <span style={{ flex: 1 }} />
                <button className="btn btn-accent" onClick={handleExport}>📸 Export Image</button>
            </div>

            <div className="uwg-list">
                {UWS.map(uw => (
                    <UWPanel
                        key={uw.a}
                        uw={uw}
                        data={uwData.data[uw.a]}
                        showPlus={allUWsOwned}
                        plusUnlockCost={plusUnlockCost}
                        unlockCost={nextUWUnlockCost}
                        effective={effectiveValues(uw.a)}
                        edit={{
                            onStat: (i, lv) => setUWStat(uw.a, i, lv),
                            onOwned: on => {
                                setUWOwned(uw.a, on);
                                // A new UW starts every stat at level 1.
                                if (on) uw.s.forEach((_, i) => setUWStat(uw.a, i, 1));
                            },
                            onPlus: lv => {
                                setUWPlusOwned(uw.a, lv >= 0);
                                setUWPlusLevel(uw.a, Math.max(0, lv));
                            },
                        }}
                    />
                ))}
            </div>
            <p className="uwg-note">Tap a stat to set its level; the bar under it is the next level&apos;s cost.</p>
        </div>
    );
}
