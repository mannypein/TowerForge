// ============================================================
//  TowerForge Companion — Optimizer Tab
//  Stats panel (TTT breakdown) + 8-panel ranked upgrade paths.
//  Currently scores Glass Cannon builds via eDPS/stone.
//  eHP/Hybrid/Farming are placeholder until formulas are built.
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { OPT_PANELS, OPT_GAIN_THRESHOLDS, OPT_DEFAULT_SHOW, BUILD_SUPPORT, RESEARCH_PANELS } from '../../constants/optimizerConfig';
import { presetLabel, UWS, WS_STATS, WS_ENH } from '../../constants/gameData';
import stoneIcon from '../../assets/stone.png';
import { simulateStonePath, simulateCategoryPath } from '../../engine/optimizer';
import { readActiveModuleBonuses } from '../../engine/modBonuses';
import { calcTTT, calcTTTDisplayStats, packageChancePct } from '../../engine/ttt';
import { runRatesFrom } from '../../engine/runRates';
import { calcTowerEDPS, calcSmiteWaveHPFraction } from '../../engine/uwdps';
import type { OptCandidate, OptCategory, BuildType } from '../../types/gameTypes';
import type { OptimizerSnapshot } from '../../engine/optimizer';
import type { TTTDisplayStats } from '../../engine/ttt';
import { activeBattleReport } from '../../engine/battleReport';
import { buildFarmCalibration } from '../../engine/farming';
import type { FarmCalibration } from '../../engine/farming';
import { buildEhpCalibration } from '../../engine/ehp';
import { enhForPreset } from '../../engine/statHelpers';
import { botsForPreset } from '../../constants/botData';
import type { EhpCalibration } from '../../engine/ehp';
import { buildEdpsCalibration } from '../../engine/edps';
import type { EdpsCalibration } from '../../engine/edps';
import { BattleReportPanel, EconomyStats, EhpStats } from './BuildPanels';

const EMPTY_RESULTS: Record<OptCategory, OptCandidate[]> = {
    uw: [], uwp: [], mast: [], assist: [], stones: [],
    workshop: [], labs: [], cards: [], enhancements: [], bots: [],
};

const EMPTY_SHOW_MORE: Record<OptCategory, boolean> = {
    uw: false, uwp: false, mast: false, assist: false, stones: false,
    workshop: false, labs: false, cards: false, enhancements: false, bots: false,
};

export default function OptimizerTab() {
    const [results, setResults] = useState<Record<OptCategory, OptCandidate[]>>(EMPTY_RESULTS);
    const [running, setRunning] = useState(false);
    const [showMore, setShowMore] = useState<Record<OptCategory, boolean>>(EMPTY_SHOW_MORE);
    const [currentEDPS, setCurrentEDPS] = useState<number | null>(null);
    const [ttStats, setTTStats] = useState<TTTDisplayStats | null>(null);
    const [smitePct, setSmitePct] = useState<number>(0);
    const [showUWFilter, setShowUWFilter] = useState(false);
    const [appliedMsg, setAppliedMsg] = useState<string | null>(null);
    const [undoStack, setUndoStack] = useState<OptCandidate[]>([]);
    const [farmCalib, setFarmCalib] = useState<FarmCalibration | null>(null);
    const [ehpCalib, setEhpCalib] = useState<EhpCalibration | null>(null);
    const [edpsCalib, setEdpsCalib] = useState<EdpsCalibration | null>(null);

    useEffect(() => {
        if (!appliedMsg) return;
        const t = setTimeout(() => setAppliedMsg(null), 2800);
        return () => clearTimeout(t);
    }, [appliedMsg]);

    const profile = useGameStore(s => s.profile);
    const updateProfile = useGameStore(s => s.updateProfile);
    const activePreset = useGameStore(s => s.activePreset);
    const setActivePreset = useGameStore(s => s.setActivePreset);

    const presetCount = profile.presets || 2;
    const presets = Array.from({ length: presetCount }, (_, i) => i);

    const buildType = (profile.build || 'Glass Cannon') as BuildType;
    const buildSupport = BUILD_SUPPORT[buildType] ?? BUILD_SUPPORT['Glass Cannon'];
    const isFarming = buildType === 'Farming';
    const isEhp = buildType === 'eHP';
    const metricLabel = isFarming ? 'coins' : isEhp ? 'survival' : 'eDPS';

    // ── Build snapshot from current store state ───────────────
    // Reads fresh state via getState() so a re-run triggered right after
    // applying an upgrade sees the just-committed store values (closures
    // captured at render time would be stale).
    const buildSnapshot = useCallback((): OptimizerSnapshot => {
        const s = useGameStore.getState();
        // Run rates (boss/elite kills, packages, cash…) from the active Battle
        // Report drive several unique module effects.
        const report = activeBattleReport(s.battleReportText, s.importedBattles, s.battleReportChoice);
        const modBonuses = readActiveModuleBonuses(
            s.moduleState, s.perkData, s.labData, s.cardData, runRatesFrom(report),
        );
        // The report's package rate belongs to today's package chance.
        modBonuses.run = {
            ...modBonuses.run,
            pkgChanceAtRun: packageChancePct(s.activePreset, s.wsData, s.labData, s.cardData, modBonuses),
        };
        return {
            presetIdx: s.activePreset,
            wsData: JSON.parse(JSON.stringify(s.wsData)),
            enhData: JSON.parse(JSON.stringify(enhForPreset(s.enhData, s.activePreset))),
            labData: JSON.parse(JSON.stringify(s.labData)),
            cardData: JSON.parse(JSON.stringify(s.cardData)),
            perkData: JSON.parse(JSON.stringify(s.perkData)),
            uwData: JSON.parse(JSON.stringify(s.uwData)),
            relicData: JSON.parse(JSON.stringify(s.relicData)),
            modBonuses,
            moduleState: JSON.parse(JSON.stringify(s.moduleState)),
            botData: botsForPreset(s.botData, s.activePreset),
            excludedUWs: [...(s.profile.excludedUWs ?? [])],
            metric: s.profile.build === 'Farming' ? 'coins' : s.profile.build === 'eHP' ? 'ehp' : 'edps',
        };
    }, []);

    // ── Run optimizer ─────────────────────────────────────────
    function runOptimizer() {
        setRunning(true);
        setShowMore(EMPTY_SHOW_MORE);

        setTimeout(() => {
            try {
                const snap = buildSnapshot();
                const tttData = calcTTT(
                    snap.presetIdx, snap.wsData, snap.labData,
                    snap.cardData, snap.uwData, snap.modBonuses,
                );
                const edps = calcTowerEDPS(
                    snap.uwData, snap.modBonuses, tttData.ttt,
                    snap.presetIdx, snap.wsData, snap.labData,
                    snap.cardData, snap.moduleState,
                    snap.relicData, snap.enhData,
                    snap.botData,
                );
                setCurrentEDPS(edps);
                setSmitePct(calcSmiteWaveHPFraction(snap.uwData) * 100);

                // TTT display stats — always shown regardless of build type
                const stats = calcTTTDisplayStats(
                    snap.presetIdx, snap.wsData, snap.labData,
                    snap.cardData, snap.uwData, snap.modBonuses,
                );
                setTTStats(stats);

                // Calibrate the build's model from the chosen Battle Report: coins
                // and survival always; eDPS when the report has damage by source.
                const st = useGameStore.getState();
                const report = activeBattleReport(st.battleReportText, st.importedBattles, st.battleReportChoice);
                snap.farm = snap.metric === 'coins' ? buildFarmCalibration(snap, report) : undefined;
                snap.ehp = snap.metric === 'ehp' ? buildEhpCalibration(snap, report) : undefined;
                snap.edps = snap.metric === 'edps' ? buildEdpsCalibration(snap, report) ?? undefined : undefined;
                setFarmCalib(snap.farm ?? null);
                setEhpCalib(snap.ehp ?? null);
                setEdpsCalib(snap.edps ?? null);
                if (snap.edps) {
                    // Smite at this run's proc rate (not the 100-hit cap).
                    setSmitePct(Math.min(1, snap.edps.anchor.smite * snap.edps.smiteProcs) * 100);
                }

                // Only run the simulation for builds with verified scoring.
                if (buildSupport.ready) {
                    const newResults: Record<OptCategory, OptCandidate[]> = { ...EMPTY_RESULTS };
                    for (const panel of OPT_PANELS) {
                        if (snap.metric !== 'edps' && RESEARCH_PANELS.includes(panel.cat)) {
                            newResults[panel.cat] = simulateCategoryPath(panel.cat, panel.maxSteps, snap);
                            continue;
                        }
                        if (panel.cat === 'stones') {
                            // Row 1: ranked stone upgrade path (all stone categories merged)
                            newResults[panel.cat] = simulateStonePath(panel.maxSteps, snap);
                        } else if (panel.cat === 'bots') {
                            // Bots only: free upgrade ranking (single category)
                            newResults[panel.cat] = simulateCategoryPath('bots', panel.maxSteps, snap);
                        }
                        // Row 2 (workshop, labs, cards, enhancements) still under construction
                    }
                    setResults(newResults);
                } else {
                    setResults(EMPTY_RESULTS);
                }
            } catch (e) {
                console.error('Optimizer error:', e);
            } finally {
                setRunning(false);
            }
        }, 50);
    }

    // ── Write a candidate's target to the store ───────────────
    // Writes `level` for the stat/upgrade the candidate refers to, using
    // the same setters the manual tabs use. Applying uses c.toLv; undo
    // uses c.fromLv. Returns true if the write succeeded.
    // For UW+ unlock candidates, fromLv === -1 means "not unlocked":
    //   level -1 → un-unlock, level 0 → unlock at level 0.
    function writeCandidate(c: OptCandidate, level: number): boolean {
        const st = useGameStore.getState();

        switch (c.category) {
            case 'uw': {
                const match = UWS.find(u => c.label.startsWith(u.n));
                if (!match) return false;
                const statIdx = match.s.findIndex(([sName]) => c.label.endsWith(sName));
                if (statIdx < 0) return false;
                st.setUWStat(match.a, statIdx, level);
                return true;
            }
            case 'uwp': {
                const match = UWS.find(u => c.label.startsWith(u.n));
                if (!match) return false;
                if (level < 0) {
                    st.setUWPlusOwned(match.a, false);
                    st.setUWPlusLevel(match.a, 0);
                } else if (c.fromLv === -1 && level === 0) {
                    st.setUWPlusOwned(match.a, true);
                    st.setUWPlusLevel(match.a, 0);
                } else {
                    st.setUWPlusLevel(match.a, level);
                }
                return true;
            }
            case 'mast': {
                // Stones unlock the mastery (fromLv −1 = locked); its level is the lab's.
                st.setCardMasteryUnlocked(c.label.replace(' Mastery', ''), level >= 0);
                return true;
            }
            case 'assist': {
                const type = c.label.split(' — ')[0].replace(/ Assist$/i, '').toLowerCase();
                const key = c.label.includes('Substat') ? 'subEff' : 'multEff';
                st.updateAssist(type, key, level);
                return true;
            }
            case 'labs': {
                st.setLabLevel(c.label, level);
                return true;
            }
            case 'workshop': {
                const parts = c.label.split(' — ');
                const wsCat = parts[0].replace('WS ', '').toLowerCase() as 'attack' | 'defense' | 'utility';
                const idx = (WS_STATS[wsCat] ?? []).findIndex(([n]) => n === parts[1]);
                if (idx < 0) return false;
                st.setWSStat(st.activePreset, wsCat, idx, level);
                return true;
            }
            case 'cards': {
                st.setCardStars(c.label.replace(' Card', ''), level);
                return true;
            }
            case 'enhancements': {
                const parts = c.label.split(' — ');
                const enhCat = parts[0].replace('Enh ', '').toLowerCase();
                const idx = (WS_ENH[enhCat] ?? []).findIndex(([n]) => n === parts[1]);
                if (idx < 0) return false;
                st.setEnhLevel(enhCat, idx, level);
                return true;
            }
            default:
                return false;
        }
    }

    // ── Apply a recommended upgrade to the actual tower ───────
    // Double-clicking a row writes the upgrade straight to the store,
    // pushes it onto the undo stack, then re-runs the optimizer.
    function applyCandidate(c: OptCandidate) {
        if (!writeCandidate(c, c.toLv)) return;
        setUndoStack(s => [...s, c]);
        setAppliedMsg(`✓ Applied: ${c.label} — ${c.subLabel}`);
        runOptimizer();
    }

    // ── Undo the most recent applied upgrade ──────────────────
    function undoLast() {
        if (!undoStack.length) return;
        const last = undoStack[undoStack.length - 1];
        if (writeCandidate(last, last.fromLv)) {
            setAppliedMsg(`↩ Undone: ${last.label} — ${last.subLabel}`);
            runOptimizer();
        }
        setUndoStack(s => s.slice(0, -1));
    }

    // ── UW exclusion toggle ───────────────────────────────────
    const excludedUWs = profile.excludedUWs ?? [];
    function toggleUW(abbr: string) {
        const set = new Set(excludedUWs);
        if (set.has(abbr)) set.delete(abbr);
        else set.add(abbr);
        updateProfile({ excludedUWs: [...set] });
    }

    // ── Gain color ────────────────────────────────────────────
    function gainColor(scorePct: number): string {
        if (scorePct >= OPT_GAIN_THRESHOLDS.high) return 'var(--ra)';
        if (scorePct >= OPT_GAIN_THRESHOLDS.med) return '#ff9800';
        return 'var(--rr)';
    }

    // ── Category label color ──────────────────────────────────
    function catStyle(cat: OptCategory): React.CSSProperties {
        const map: Record<OptCategory, { bg: string; color: string }> = {
            uw: { bg: 'rgba(0,230,118,.12)', color: 'var(--ra)' },
            uwp: { bg: 'rgba(147,51,234,.15)', color: 'var(--purple)' },
            mast: { bg: 'rgba(186,117,23,.15)', color: 'var(--gold)' },
            assist: { bg: 'rgba(79,195,247,.15)', color: 'var(--rr)' },
            stones: { bg: 'var(--bg4)', color: 'var(--text-dim)' },
            workshop: { bg: 'rgba(29,158,117,.15)', color: 'var(--accent)' },
            labs: { bg: 'rgba(59,130,246,.15)', color: '#4fc3f7' },
            cards: { bg: 'rgba(186,117,23,.15)', color: 'var(--gold)' },
            enhancements: { bg: 'rgba(147,51,234,.15)', color: '#e040fb' },
            bots: { bg: 'rgba(231,76,60,.15)', color: '#e74c3c' },
        };
        return {
            background: map[cat]?.bg ?? 'var(--bg4)',
            color: map[cat]?.color ?? 'var(--text-dim)',
        };
    }

    const hasResults = Object.values(results).some(arr => arr.length > 0);

    return (
        <div>
            {/* ── Apply toast ── */}
            {appliedMsg && (
                <div className="opt-apply-toast">
                    <span>{appliedMsg}</span>
                    {undoStack.length > 0 && appliedMsg.startsWith('✓') && (
                        <button className="opt-toast-undo" onClick={undoLast}>
                            Undo
                        </button>
                    )}
                </div>
            )}

            {/* ── Controls ── */}
            <div className="section" style={{ marginBottom: '12px' }}>
                <div className="section-body" style={{ padding: '10px 14px' }}>
                    <div className="flex-row" style={{ gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>

                        <div>
                            <span className="opt-control-label">Build</span>
                            <select
                                value={buildType}
                                onChange={e => updateProfile({ build: e.target.value as BuildType })}
                                style={{ fontSize: '13px' }}
                            >
                                {Object.entries(BUILD_SUPPORT).map(([key, cfg]) => (
                                    <option key={key} value={key}>
                                        {cfg.label}{!cfg.ready ? ' (coming soon)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <span className="opt-control-label">Preset</span>
                            <select
                                value={activePreset}
                                onChange={e => setActivePreset(parseInt(e.target.value))}
                                style={{ fontSize: '13px' }}
                            >
                                {presets.map(i => (
                                    <option key={i} value={i}>{presetLabel(profile.presetNames, i)}</option>
                                ))}
                            </select>
                        </div>

                        <button
                            className="btn btn-dim"
                            onClick={undoLast}
                            disabled={undoStack.length === 0}
                            style={{ marginLeft: 'auto' }}
                            title="Undo the last applied upgrade"
                        >
                            ↩ Undo{undoStack.length > 0 ? ` (${undoStack.length})` : ''}
                        </button>

                        <button
                            className="btn btn-dim"
                            onClick={() => setShowUWFilter(true)}
                            title="Choose which UWs the optimizer suggests upgrades for"
                        >
                            ⚙ UW Filter{excludedUWs.length > 0 ? ` (${excludedUWs.length} off)` : ''}
                        </button>

                        <button
                            className="btn btn-accent"
                            onClick={runOptimizer}
                            disabled={running}
                        >
                            {running ? '⏳ Running...' : '▶ Run Optimizer'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── UW Filter Modal ── */}
            {showUWFilter && (
                <div className="modal-overlay" onClick={() => setShowUWFilter(false)}>
                    <div className="modal-box" onClick={e => e.stopPropagation()}>
                        <div className="modal-head">
                            <span className="modal-title">Include in Optimizer</span>
                            <button className="btn btn-dim" onClick={() => setShowUWFilter(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <p className="opt-row-explainer" style={{ marginTop: 0, marginBottom: '12px' }}>
                                Unchecked UWs are skipped — no stone (UW or UW+) upgrades will be suggested for them.
                            </p>
                            <div className="uw-filter-list">
                                {UWS.map(uw => {
                                    const checked = !excludedUWs.includes(uw.a);
                                    return (
                                        <label key={uw.a} className="uw-filter-row">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleUW(uw.a)}
                                            />
                                            <span className="uw-filter-name">{uw.n}</span>
                                            <span className="uw-filter-abbr">{uw.a}</span>
                                        </label>
                                    );
                                })}
                            </div>
                            <div className="modal-actions" style={{ marginTop: '16px', justifyContent: 'flex-start' }}>
                                <button
                                    className="btn btn-dim"
                                    onClick={() => updateProfile({ excludedUWs: [] })}
                                >
                                    Select All
                                </button>
                                <button
                                    className="btn btn-dim"
                                    onClick={() => updateProfile({ excludedUWs: UWS.map(u => u.a) })}
                                >
                                    Clear All
                                </button>
                                <button
                                    className="btn btn-accent"
                                    onClick={() => setShowUWFilter(false)}
                                    style={{ marginLeft: 'auto' }}
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Battle Report (calibrates every build) + build breakdown ── */}
            {buildSupport.ready && <BattleReportPanel purpose={isEhp ? 'ehp' : isFarming ? 'farming' : 'edps'} />}
            {isFarming && farmCalib && <EconomyStats calib={farmCalib} />}
            {isEhp && ehpCalib && <EhpStats calib={ehpCalib} />}

            {/* ── TTT Stats Panel ── */}
            {ttStats && !isFarming && !isEhp && (
                <div className="section" style={{ marginBottom: '12px' }}>
                    <div className="section-head">
                        <h3>Tower Stats</h3>
                        <span className="s-badge">{presetLabel(profile.presetNames, activePreset)}</span>
                    </div>
                    <div className="section-body">
                        <div className="ttt-stats-grid">

                            <div className="stat-pill">
                                <span className="stat-pill-label">Range</span>
                                <span className="stat-pill-val">{ttStats.range.toFixed(1)}m</span>
                            </div>

                            <div className="stat-pill">
                                <span className="stat-pill-label">Total Slow</span>
                                <span className="stat-pill-val" style={{
                                    color: ttStats.cappedSlowPct >= 90 ? 'var(--gold)' : 'var(--text-bright)',
                                }}>
                                    {ttStats.cappedSlowPct.toFixed(1)}%
                                </span>
                            </div>

                            <div className="stat-pill">
                                <span className="stat-pill-label">CF Slow</span>
                                <span className="stat-pill-val">{ttStats.cfSlowPct.toFixed(1)}%</span>
                            </div>

                            <div className="stat-pill">
                                <span className="stat-pill-label">Slow Aura</span>
                                <span className="stat-pill-val">{ttStats.slowAuraPct.toFixed(1)}%</span>
                            </div>

                            <div className="stat-pill">
                                <span className="stat-pill-label">CF Uptime</span>
                                <span className="stat-pill-val" style={{
                                    color: ttStats.cfUptime >= 1 ? 'var(--gold)' : 'var(--text-bright)',
                                }}>
                                    {(ttStats.cfUptime * 100).toFixed(0)}%
                                </span>
                            </div>

                            <div className="stat-pill">
                                <span className="stat-pill-label">CF+ Path Mult</span>
                                <span className="stat-pill-val" style={{ color: 'var(--purple)' }}>
                                    {ttStats.cfPathMult.toFixed(2)}×
                                </span>
                            </div>

                            <div className="stat-pill">
                                <span className="stat-pill-label">Enemy Speed</span>
                                <span className="stat-pill-val">{ttStats.enemySpeed.toFixed(2)} m/s</span>
                            </div>

                            <div className="stat-pill">
                                <span className="stat-pill-label">TTT</span>
                                <span className="stat-pill-val green" style={{ fontSize: '15px' }}>
                                    {ttStats.ttt.toFixed(2)}s
                                </span>
                            </div>

                            {currentEDPS !== null && !edpsCalib && (
                                <div className="stat-pill" title="Model units — only the change between upgrades matters. Choose a run with damage data above to rank by your real damage.">
                                    <span className="stat-pill-label">eDPS (model)</span>
                                    <span className="stat-pill-val gold" style={{ fontSize: '15px' }}>
                                        {currentEDPS.toExponential(3)}
                                    </span>
                                </div>
                            )}

                            {smitePct > 0 && (
                                <div className="stat-pill" title={edpsCalib
                                    ? `CL+ Smite: % of each enemy's wave HP dealt, at ${edpsCalib.smiteProcs.toFixed(1)} smites per enemy in your run (100 max).`
                                    : "CL+ Smite: % of each enemy's wave HP dealt over 100 hits (assumes the hit cap is reached)."}>
                                    <span className="stat-pill-label">Smite (wave HP)</span>
                                    <span className="stat-pill-val" style={{ color: 'var(--purple)', fontSize: '15px' }}>
                                        {smitePct.toFixed(1)}%
                                    </span>
                                </div>
                            )}

                        </div>

                        <p className="ttt-explainer">
                            TTT (Time-To-Tower) is how long an enemy takes to cross your tower's range.
                            Longer TTT means more UW activations for SM, DW, ILM, PS, BH, and GT.
                            While Chrono Field is up, its slow (capped at 90%), Slow Aura and Chrono Loop (CF+) multiply; the CF+ figure is the extra time Chrono Loop's spiral adds.
                        </p>
                    </div>
                </div>
            )}

            {/* ── Farming coins-only note ── */}
            {isFarming && hasResults && (
                <div className="opt-warning-banner">
                    <span className="opt-warning-icon">⚠️</span>
                    <div>
                        <strong>These upgrades are ranked for coins only.</strong> They don&apos;t account
                        for survival or damage — a farming setup still has to reach the waves you
                        farm. Workshop upgrades are ranked by coins gained per coin spent; labs and
                        enhancements by gain per level, since their costs and lab times aren&apos;t
                        compared yet.
                    </div>
                </div>
            )}

            {/* ── eHP survival-only note ── */}
            {isEhp && hasResults && (
                <div className="opt-warning-banner">
                    <span className="opt-warning-icon">⚠️</span>
                    <div>
                        <strong>These upgrades are ranked for survival only.</strong> Damage and coins
                        aren&apos;t counted (thorns are the exception). Workshop upgrades are ranked by
                        survival gained per coin; labs and enhancements by survival gained per level,
                        since their costs and lab times aren&apos;t compared yet.
                    </div>
                </div>
            )}

            {/* ── GC eDPS-only warning ── */}
            {buildSupport.ready && hasResults && !isFarming && !isEhp && (
                <div className="opt-warning-banner">
                    <span className="opt-warning-icon">⚠️</span>
                    <div>
                        <strong>These upgrades are ranked for pure eDPS.</strong>{' '}
                        {edpsCalib
                            ? 'Gains are a share of all the damage in your chosen run, so sources stones can’t change (like orbs) keep their real weight.'
                            : 'Without a run that has damage data, gains come from the model alone and can over- or under-value some sources (Black Hole especially).'}
                        {' '}They don&apos;t account for coin income: some upgrades that boost eDPS can
                        hurt your economy — for example, heavily investing in Poison Swamp or stacking
                        too much slow/stun can reduce coin generation even though eDPS goes up.
                        Use your judgment alongside these suggestions.
                    </div>
                </div>
            )}

            {/* ── Build not yet supported ── */}
            {!buildSupport.ready && (
                <div className="empty-state" style={{ marginTop: '20px' }}>
                    <div className="icon">🚧</div>
                    <h3>{buildSupport.label} optimizer coming soon</h3>
                    <p>
                        {buildType} scoring requires its own dedicated formula set covering defensive
                        labs, modules, relics, and UW crowd-control contributions. This is being built
                        as its own project — for now, switch to <strong>Glass Cannon</strong> above to
                        see ranked upgrades, or check back soon.
                    </p>
                </div>
            )}

            {/* ── No results yet (GC, not run) ── */}
            {buildSupport.ready && !hasResults && !running && (
                <div className="empty-state" style={{ marginTop: '40px' }}>
                    <div className="icon">⚙️</div>
                    <h3>Ready to optimize</h3>
                    <p>
                        Fill in your UW, Workshop, Labs, Cards, and Modules tabs,
                        then click Run Optimizer to see your ranked upgrade path.
                    </p>
                </div>
            )}

            {/* ── Results ── */}
            {buildSupport.ready && hasResults && (
                <div>
                    <div className="opt-row-label">Stone Upgrades</div>
                    <p className="opt-row-explainer">
                        One ranked path across UW stats, UW+, Card Mastery, and Assist
                        modules — since they all draw from the same stone pool, this is
                        the order that gets you the most {metricLabel} per stone spent.
                        <br />
                        <strong>💡 Double-click any upgrade to apply it to your tower.</strong>
                    </p>
                    {OPT_PANELS.filter(p => p.row === 1).map(panel => (
                        <OptPanel
                            key={panel.cat}
                            panel={panel}
                            candidates={results[panel.cat] ?? []}
                            showAll={showMore[panel.cat] ?? false}
                            onShowMore={() => setShowMore(s => ({ ...s, [panel.cat]: true }))}
                            gainColor={gainColor}
                            catStyle={catStyle}
                            onApply={applyCandidate}
                        />
                    ))}

                    <div className="opt-row-label" style={{ marginTop: '14px' }}>
                        Coin / Research Upgrades
                    </div>
                    {isFarming || isEhp ? OPT_PANELS.filter(p => RESEARCH_PANELS.includes(p.cat)).map(panel => (
                        <OptPanel
                            key={panel.cat}
                            panel={panel}
                            candidates={results[panel.cat] ?? []}
                            showAll={showMore[panel.cat] ?? false}
                            onShowMore={() => setShowMore(s => ({ ...s, [panel.cat]: true }))}
                            gainColor={gainColor}
                            catStyle={catStyle}
                            onApply={applyCandidate}
                        />
                    )) : (
                    <div className="opt-construction">
                        <span className="opt-construction-icon">🚧</span>
                        <div>
                            <strong>Coming soon</strong>
                            <p>
                                Ranking for Workshop, Labs, Cards, and Enhancements is
                                still under construction. For now, the optimizer focuses
                                on stone upgrades above.
                            </p>
                        </div>
                    </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Optimizer Panel Component ─────────────────────────────────
interface OptPanelProps {
    panel: typeof OPT_PANELS[number];
    candidates: OptCandidate[];
    showAll: boolean;
    onShowMore: () => void;
    gainColor: (score: number) => string;
    catStyle: (cat: OptCategory) => React.CSSProperties;
    onApply: (c: OptCandidate) => void;
}

function OptPanel({
    panel, candidates, showAll, onShowMore, gainColor, catStyle, onApply,
}: OptPanelProps) {
    const visible = showAll
        ? candidates
        : candidates.slice(0, OPT_DEFAULT_SHOW);

    return (
        <div className="opt-section">
            <div className="opt-section-head">
                <span className="opt-section-title">{panel.label}</span>
                <span className="s-badge">{candidates.length} upgrades</span>
            </div>

            {candidates.length === 0 ? (
                <div className="opt-empty">
                    No upgrades available — all maxed or no data entered.
                </div>
            ) : (
                <>
                    {visible.map((c, idx) => (
                        <div
                            key={`${c.label}-${idx}`}
                            className="opt-row opt-row-applicable"
                            onDoubleClick={() => onApply(c)}
                            title="Double-click to apply this upgrade to your tower"
                        >
                            <span className="opt-rank">#{idx + 1}</span>
                            <span className="opt-cat-badge" style={catStyle(c.category)}>
                                {c.category.toUpperCase()}
                            </span>
                            <div className="opt-name-col">
                                <span className="opt-name">{c.label}</span>
                                <span className="opt-sub">{c.subLabel}</span>
                            </div>
                            <span className="opt-cost" title={c.costType !== 'stones' && !c.costKnown ? 'Cost not modeled yet — ranked by gain per level' : undefined}>
                                {c.costType === 'stones' || c.costKnown ? c.cost.toLocaleString() : '—'}
                                <span className="opt-cost-type">
                                    {c.costType === 'stones' ? <img src={stoneIcon} alt="stones" className="cost-icon" /> :
                                        c.costType === 'research' ? ' 🔬' : ' 🪙'}
                                </span>
                            </span>
                            <span className="opt-gain" style={{ color: gainColor(c.scorePct) }}>
                                {c.scorePct > 0 ? `+${c.scorePct.toFixed(3)}%` : '—'}
                            </span>
                        </div>
                    ))}

                    {!showAll && candidates.length > OPT_DEFAULT_SHOW && (
                        <div className="opt-show-more">
                            <button className="btn btn-dim" onClick={onShowMore}>
                                Show all {candidates.length} upgrades
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}