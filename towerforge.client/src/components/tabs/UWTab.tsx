// ============================================================
//  TowerForge Companion — UW Tab
//  9 Ultimate Weapons: stats, UW+, stone balance.
// ============================================================

import { useRef } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { UWS, UW_STAT_VALUES, UW_PLUS_DATA, UW_PLUS_UNLOCK_COSTS, UW_STONE_COSTS, UW_UNLOCK_COSTS } from '../../constants/gameData';
import { readActiveModuleBonuses } from '../../engine/modBonuses';
import type { UWAbbr } from '../../types/gameTypes';
import stoneIcon from '../../assets/stone.png';
import IconDropdown from '../common/IconDropdown';
import UWShareCard from '../share/UWShareCard';
import { exportPosterPages, SHARE_OFFSCREEN_STYLE } from '../share/shareTheme';

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

    // Cost (in stones) to unlock the NEXT UW. UW_UNLOCK_COSTS is a single
    // global sequence indexed by how many you already own: index 0 = the
    // 1st UW, index 1 = the 2nd, etc. null when the data isn't available.
    const nextUWUnlockCost = UW_UNLOCK_COSTS[ownedCount] ?? null;

    // UW_PLUS_UNLOCK_COSTS is a single global sequence — the cost of your
    // *next* UW+ unlock depends on how many you've already unlocked in
    // total, not which UW it is.
    const unlockedPlusCount = UWS.filter(u => uwData.data[u.a]?.upOwn).length;

    const shareRef = useRef<HTMLDivElement>(null);
    function handleExport() {
        if (!shareRef.current) return;
        exportPosterPages(shareRef.current, 'towerforge-uws')
            .catch(() => alert('Image export failed. Please try again.'));
    }

    return (
        <div>
            {/* ── Off-screen share card (rendered for export only) ── */}
            <div style={SHARE_OFFSCREEN_STYLE} aria-hidden="true">
                <UWShareCard ref={shareRef} poster />
            </div>

            {/* ── Export action ── */}
            <div className="flex-row" style={{ padding: '14px 14px 0' }}>
                <span style={{ flex: 1 }} />
                <button className="btn btn-accent" onClick={handleExport}>
                    📸 Export Image
                </button>
            </div>

            {/* ── Next UW Unlock Banner ── */}
            {!allUWsOwned && (
                <div className="uw-next-unlock-bar">
                    <span className="uw-next-unlock-label">
                        {ownedCount}/9 UWs owned
                    </span>
                    {nextUWUnlockCost != null ? (
                        <span className="uw-next-unlock-cost">
                            Next UW unlock:&nbsp;<strong>{nextUWUnlockCost.toLocaleString()}</strong>
                            <img src={stoneIcon} alt="stones" className="cost-icon" />
                        </span>
                    ) : (
                        <span className="uw-next-unlock-cost uw-next-unlock-cost-unknown">
                            Next UW unlock cost: unknown
                        </span>
                    )}
                </div>
            )}

            {/* ── UW Sections ── */}
            <div style={{ padding: '14px' }}>
                {UWS.map(uw => {
                    const ud = uwData.data[uw.a] ?? { own: false, sv: [0, 0, 0], upOwn: false, upLvl: 0 };
                    const owned = ud.own ?? false;
                    const plusDef = UW_PLUS_DATA[uw.a];
                    const upOwn = ud.upOwn ?? false;
                    const upLvl = ud.upLvl ?? 0;

                    // UW+ unlock cost display — next cost in the global sequence
                    const unlockCost = UW_PLUS_UNLOCK_COSTS[unlockedPlusCount];
                    const upgradeCost = upOwn && plusDef?.costs[upLvl] != null
                        ? plusDef.costs[upLvl]
                        : null;

                    return (
                        <div key={uw.a} className={`uw-section ${!owned ? 'uw-not-owned' : ''}`}>

                            {/* ── UW Header ── */}
                            <div className="uw-head">
                                <span className="uw-name">{uw.n}</span>
                                <span className="uw-abbr">{uw.a}</span>
                                <span
                                    className={`uw-owned-badge ${owned ? 'owned' : 'not-owned'}`}
                                    onClick={() => {
                                        if (!owned) {
                                            // Initialize all stats to level 1 on first unlock
                                            setUWOwned(uw.a, true);
                                            uw.s.forEach((_, statIdx) => {
                                                setUWStat(uw.a, statIdx, 1);
                                            });
                                        } else {
                                            setUWOwned(uw.a, false);
                                        }
                                    }}
                                    title="Click to toggle owned"
                                >
                                    {owned ? '✓ Owned' : '✗ Not Owned'}
                                </span>
                            </div>

                            {/* ── UW Body ── */}
                            {owned && (
                                <div className="uw-body">

                                    {/* Stats grid */}
                                    <div className="uw-stats-grid">
                                        {uw.s.map(([statName, maxLv], statIdx) => {
                                            const curLv = ud.sv[statIdx] ?? 1;
                                            const vals = UW_STAT_VALUES[uw.a as UWAbbr]?.[statIdx] ?? [];

                                            // SL Angle is capped at 60° — the underlying data goes to 90°,
                                            // but upgrading past 60° provides no additional benefit and
                                            // we don't want players over-investing stones into it.
                                            const isSLAngle = uw.a === 'SL' && statIdx === 1;
                                            const SL_ANGLE_CAP = 60; // degrees
                                            const cappedVals = isSLAngle
                                                ? vals.filter(v => parseInt(v) <= SL_ANGLE_CAP)
                                                : vals;

                                            const trueMax = cappedVals.length;  // capped max level for SL angle, true max otherwise
                                            const curVal = cappedVals[curLv - 1] ?? vals[curLv - 1] ?? '—';
                                            const pct = Math.min(100, Math.round((curLv / trueMax) * 100));

                                            // Module sub-stat bonus
                                            const bonusKey = STAT_BONUS_KEYS[uw.a as UWAbbr]?.[statIdx] ?? null;
                                            const uwBonusMap = (modBonuses.uwBonus as Record<string, Record<string, number>>)[uw.a] ?? {};
                                            const modBonusVal = bonusKey ? (uwBonusMap[bonusKey] ?? 0) : 0;

                                            // Lab bonus for this stat (in display units)
                                            const labBonus = (UW_LAB_BONUSES[uw.a as UWAbbr] ?? [])
                                                .filter(lb => lb.statIdx === statIdx)
                                                .reduce((sum, lb) => sum + (labData[lb.labName] ?? 0) * lb.perLevel, 0);

                                            const effVal = (bonusKey || labBonus) && curVal !== '—'
                                                ? computeEffective(curVal, bonusKey, modBonusVal, labBonus)
                                                : null;

                                            return (
                                                <div key={statName} className="uw-stat-box">
                                                    <div className="uw-stat-label">{statName}</div>

                                                    {/* Dropdown — value is the 1-based level */}
                                                    <IconDropdown
                                                        value={curLv}
                                                        icon={stoneIcon}
                                                        iconAlt="stones"
                                                        style={{ marginBottom: '6px' }}
                                                        onChange={lv => setUWStat(uw.a, statIdx, lv)}
                                                        options={cappedVals.map((displayVal, lvIdx) => ({
                                                            value: lvIdx + 1,
                                                            label: `Lv ${lvIdx + 1} — ${displayVal}`,
                                                            // Lv1 is free (comes with the UW); costs[0] is the
                                                            // Lv1→Lv2 upgrade, so level (lvIdx+1) costs costs[lvIdx-1].
                                                            cost: lvIdx > 0
                                                                ? UW_STONE_COSTS[uw.a as UWAbbr]?.[statIdx]?.[lvIdx - 1]
                                                                : undefined,
                                                        }))}
                                                    />

                                                    {/* Current value + Max button */}
                                                    <div className="uw-stat-input" style={{ marginBottom: effVal ? '2px' : '6px' }}>
                                                        <span className="uw-stat-val" style={{
                                                            flex: 1,
                                                            color: curLv >= maxLv ? 'var(--gold)' : 'var(--accent)',
                                                        }}>
                                                            {curVal}
                                                        </span>
                                                        <button
                                                            className="btn btn-dim"
                                                            style={{ fontSize: '11px', padding: '2px 7px' }}
                                                            disabled={curLv >= trueMax}
                                                            title={`Max ${statName}`}
                                                            onClick={() => setUWStat(uw.a, statIdx, trueMax)}
                                                        >
                                                            {curLv >= trueMax ? '✓ Max' : 'Max'}
                                                        </button>
                                                    </div>

                                                    {/* Effective value with module bonuses */}
                                                    {effVal && (
                                                        <div className="uw-stat-effective" style={{ marginBottom: '6px' }}>
                                                            <span className="uw-stat-eff-label">Eff</span>
                                                            <span className="uw-stat-eff-val">{effVal}</span>
                                                        </div>
                                                    )}

                                                    {/* Progress bar */}
                                                    <div className="pbar">
                                                        <div
                                                            className={`pbar-fill ${pct >= 100 ? 'gold' : ''}`}
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                    <div className="pbar-pct">{curLv} / {trueMax}</div>
                                                    {plusDef && !allUWsOwned && (
                                                        <div className="uw-plus-locked-hint">
                                                            Unlock all 9 UWs to access {plusDef.name}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* UW+ Section — only shown once all 9 UWs are owned */}
                                    {plusDef && allUWsOwned && (
                                        <div className="uw-plus-section">
                                            <span className="uw-plus-label">
                                                {plusDef.name}
                                            </span>

                                            <input
                                                type="checkbox"
                                                checked={upOwn}
                                                onChange={e => {
                                                    setUWPlusOwned(uw.a, e.target.checked);
                                                    if (!e.target.checked) setUWPlusLevel(uw.a, 0);
                                                }}
                                                title="Mark UW+ as unlocked"
                                            />
                                            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                                                Unlocked
                                            </span>

                                            {upOwn && (
                                                <>
                                                    {/* UW+ level dropdown */}
                                                    <IconDropdown
                                                        value={upLvl}
                                                        icon={stoneIcon}
                                                        iconAlt="stones"
                                                        style={{ minWidth: '220px' }}
                                                        onChange={lv => setUWPlusLevel(uw.a, lv)}
                                                        // upLvl is 0-based: upLvl 0 = the base level you get free
                                                        // on unlock (vals[0]), shown as "Lv 1". Reaching upLvl k
                                                        // costs costs[k-1] (k=0 is free).
                                                        options={plusDef.vals.map((displayVal, k) => ({
                                                            value: k,
                                                            label: `Lv ${k + 1} — ${displayVal}`,
                                                            cost: k > 0 ? plusDef.costs[k - 1] : undefined,
                                                        }))}
                                                    />

                                                    {/* Max button */}
                                                    <button
                                                        className="btn btn-dim"
                                                        style={{ fontSize: '11px', padding: '2px 7px' }}
                                                        disabled={upLvl >= uw.upMax}
                                                        onClick={() => setUWPlusLevel(uw.a, uw.upMax)}
                                                    >
                                                        {upLvl >= uw.upMax ? '✓ Max' : 'Max'}
                                                    </button>

                                                    {/* Current value display (upLvl is 0-based) */}
                                                    {plusDef.vals[upLvl] && (
                                                        <span className="uw-plus-val">
                                                            {plusDef.vals[upLvl]} {plusDef.unit}
                                                        </span>
                                                    )}

                                                    {/* Next upgrade cost */}
                                                    {upgradeCost != null && upLvl < uw.upMax && (
                                                        <span className="uw-plus-cost">
                                                            Next: {upgradeCost.toLocaleString()}
                                                            <img src={stoneIcon} alt="stones" className="cost-icon" />
                                                        </span>
                                                    )}

                                                    {upLvl >= uw.upMax && (
                                                        <span style={{ color: 'var(--gold)', fontSize: '12px' }}>
                                                            ✓ Maxed
                                                        </span>
                                                    )}
                                                </>
                                            )}

                                            {!upOwn && (
                                                <span className="uw-plus-cost">
                                                    Unlock: {unlockCost.toLocaleString()}
                                                    <img src={stoneIcon} alt="stones" className="cost-icon" />
                                                </span>
                                            )}

                                            {/* UW+ description */}
                                            <span className="uw-plus-desc">
                                                {plusDef.desc.replace('{CL Chance}', `${ud.sv[2] ?? 0}`)}
                                            </span>
                                        </div>
                                    )}

                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}