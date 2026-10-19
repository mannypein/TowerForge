// ============================================================
//  TowerForge Companion — Labs Tab
//  179 labs across 11 categories with search and lock state, and the
//  labs being researched at the last import (29.1.3+ exports).
// ============================================================

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { LABS } from '../../constants/gameData';
import NumericInput from '../common/NumericInput';
import { milestoneReached } from '../../engine/statHelpers';
import type { LabRunning } from '../../types/gameTypes';

const span = (sec: number) => {
    const m = Math.max(0, Math.round(sec / 60));
    const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), min = m % 60;
    return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${min}m` : `${min}m`;
};

// The labs the game was researching when it exported. The finish time is
// the game's own (ResearchCompleteDate); a speed-up's time left is as of
// the export.
function LabsRunning({ labs }: { labs: LabRunning[] }) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(t);
    }, []);
    return (
        <div className="section" style={{ marginBottom: '10px' }}>
            <div className="section-head">
                <h3>Researching</h3>
                <span className="s-badge">at your last import</span>
            </div>
            <div className="section-body">
                {labs.map((r, i) => (
                    <div key={i} className="field-row lab-run">
                        <label className="field-label">
                            {r.lab ?? `Lab #${r.labIndex}`}
                            {r.speedUp > 1 && r.speedUpLeftSec > 0 && (
                                <span className="field-sub">
                                    ×{r.speedUp} speed-up, {span(r.speedUpLeftSec)} left when exported
                                </span>
                            )}
                        </label>
                        <span className="lab-run-time">
                            {r.doneAt === null ? '—'
                                : r.doneAt <= now ? 'Done — collect it in the game'
                                    : `Done in ${span((r.doneAt - now) / 1000)} · ${new Date(r.doneAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function LabsTab() {
    const [search, setSearch] = useState('');
    const profile = useGameStore(s => s.profile);
    const labData = useGameStore(s => s.labData);
    const tierWaves = useGameStore(s => s.tierWaves);
    const setLabLevel = useGameStore(s => s.setLabLevel);
    const setAllLabs = useGameStore(s => s.setAllLabs);
    const labsRunning = useGameStore(s => s.labsRunning);

    const completedTier = profile.completedTier || 0;

    // A lab is unlocked once its Tier / Wave milestone is reached.
    const isUnlocked = useCallback(
        (unlockTier: number, unlockWave: number): boolean =>
            milestoneReached(unlockTier, unlockWave, completedTier, tierWaves),
        [completedTier, tierWaves],
    );

    // Max all unlocked labs
    function maxAllUnlocked() {
        const next = { ...labData };
        for (const group of LABS) {
            for (const [labName, maxLv, unlockTier, unlockWave] of group.l) {
                if (isUnlocked(unlockTier, unlockWave)) {
                    next[labName] = maxLv;
                }
            }
        }
        setAllLabs(next);
    }

    function clearAll() {
        setAllLabs({});
    }

    // Summary counts
    const { totalLabs, doneLabs } = useMemo(() => {
        let total = 0;
        let done = 0;
        for (const group of LABS) {
            for (const [labName, maxLv, unlockTier, unlockWave] of group.l) {
                if (!isUnlocked(unlockTier, unlockWave)) continue;
                total++;
                if ((labData[labName] ?? 0) >= maxLv) done++;
            }
        }
        return { totalLabs: total, doneLabs: done };
    }, [labData, isUnlocked]);

    // Filtered groups based on search
    const filteredGroups = useMemo(() => {
        const q = search.toLowerCase();
        if (!q) return LABS;
        return LABS.map(group => ({
            ...group,
            l: group.l.filter(([labName]) => labName.toLowerCase().includes(q)),
        })).filter(group => group.l.length > 0);
    }, [search]);

    return (
        <div>
            {/* ── Search + Actions ── */}
            <input
                type="text"
                className="search-bar"
                placeholder="🔍  Search labs..."
                value={search}
                onChange={e => setSearch(e.target.value)}
            />

            <div className="flex-row" style={{ marginBottom: '12px' }}>
                <button className="btn btn-gold" onClick={maxAllUnlocked}>
                    ⚡ Max All Unlocked
                </button>
                <button className="btn btn-dim" onClick={clearAll}>
                    Clear All
                </button>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                    {doneLabs} / {totalLabs} maxed
                </span>
            </div>

            {labsRunning.length > 0 && <LabsRunning labs={labsRunning} />}

            {/* ── Lab Groups ── */}
            {filteredGroups.filter(group =>
                group.l.some(([, , ut, uw]) => isUnlocked(ut, uw)),
            ).map(group => (
                <div key={group.c} className="section" style={{ marginBottom: '10px' }}>
                    <div className="section-head">
                        <h3>{group.c}</h3>
                        <span className="s-badge">
                            {group.l.filter(([n, max, ut, uw]) => isUnlocked(ut, uw) && (labData[n] ?? 0) >= max).length}
                            {' / '}
                            {group.l.filter(([, , ut, uw]) => isUnlocked(ut, uw)).length} maxed
                        </span>
                    </div>
                    <div className="section-body">
                        {group.l.filter(([, , unlockTier, unlockWave]) => isUnlocked(unlockTier, unlockWave)).map(([labName, maxLv, , , isUnlockLab]) => {
                            const curLv = labData[labName] ?? 0;
                            const isMaxed = curLv >= maxLv;
                            const pct = maxLv > 1
                                ? Math.min(100, Math.round((curLv / maxLv) * 100))
                                : curLv > 0 ? 100 : 0;

                            return (
                                <div key={labName} className="field-row">
                                    <label className="field-label">
                                        {labName}
                                        {isUnlockLab && (
                                            <span className="field-sub">Unlock lab</span>
                                        )}
                                    </label>

                                    {isUnlockLab ? (
                                        <input
                                            type="checkbox"
                                            checked={curLv > 0}
                                            onChange={e => setLabLevel(labName, e.target.checked ? 1 : 0)}
                                        />
                                    ) : (
                                        <>
                                                <NumericInput
                                                    value={curLv}
                                                    min={0}
                                                    max={maxLv}
                                                    onChange={v => setLabLevel(labName, v)}
                                                />
                                            <button
                                                className="btn btn-dim"
                                                style={{ fontSize: '10px', padding: '2px 7px' }}
                                                disabled={!isUnlocked || isMaxed}
                                                title={`Max ${labName}`}
                                                onClick={() => setLabLevel(labName, maxLv)}
                                            >
                                                {isMaxed ? '✓' : 'Max'}
                                            </button>
                                            <div className="pbar-wrap">
                                                <div className="pbar">
                                                    <div
                                                        className={`pbar-fill ${isMaxed ? 'gold' : ''}`}
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                                <div className="pbar-pct">
                                                    {curLv} / {maxLv}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

        </div>
    );
}