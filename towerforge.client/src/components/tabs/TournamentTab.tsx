// ============================================================
//  TowerForge Companion — Tournament Tab
//  How your tournament runs end, and which of your modules to run for the
//  most tournament waves (engine/loadoutOptimizer.ts), measured against
//  your own tournament deaths on the tournament enemy curve.
// ============================================================

import { useMemo, useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import type { BuildType, LoadoutSlots, ModuleType } from '../../types/gameTypes';
import { applyGoal, runModels, snapshotFromState } from '../../engine/accountModels';
import type { AccountState } from '../../engine/accountModels';
import { bestLoadout, loadoutScore } from '../../engine/loadoutOptimizer';
import type { LoadoutResult } from '../../engine/loadoutOptimizer';
import { pathRunGains, wavesSpread } from '../../engine/runLength';
import { runSavers } from '../../engine/battleReport';
import { killedBy } from '../../engine/runLength';
import { activeLoadout } from '../../engine/statHelpers';
import { RARITIES } from '../../constants/moduleRarities';

const TYPES: ModuleType[] = ['cannon', 'armor', 'generator', 'core'];
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
// Big gains read better as a multiplier (a farming loadout moved to damage).
const gainText = (pct: number) => (pct >= 100
    ? `×${(1 + pct / 100).toLocaleString(undefined, { maximumFractionDigits: pct >= 1000 ? 0 : 2 })}`
    : `+${pct.toFixed(pct >= 10 ? 1 : 2)}%`);
const wavesText = (w: number) => `${w < 0 ? '−' : '+'}${Math.abs(w) < 10 ? Math.abs(w).toFixed(1) : Math.round(Math.abs(w))} waves`;

export default function TournamentTab() {
    const state = useGameStore();
    const setModuleState = useGameStore(s => s.setModuleState);
    const build = (state.profile.build || 'Glass Cannon') as BuildType;

    // The newest tournament run calibrates: its damage mix, run rates and the
    // tournament deaths behind it.
    const tourneyIdx = useMemo(() => {
        const idx = state.importedBattles.map((b, i) => ({ b, i })).filter(({ b }) => b.tournament)
            .sort((a, b) => (b.b.time ?? b.i) - (a.b.time ?? a.i))[0]?.i;
        return idx ?? -1;
    }, [state.importedBattles]);

    const account: AccountState | null = useMemo(() => (tourneyIdx < 0 ? null : {
        activePreset: state.activePreset, profile: state.profile, perkData: state.perkData, wsData: state.wsData,
        enhData: state.enhData, labData: state.labData, cardData: state.cardData, uwData: state.uwData,
        relicData: state.relicData, botData: state.botData, moduleState: state.moduleState,
        battleReportText: '', importedBattles: state.importedBattles, battleReportChoice: tourneyIdx,
    }), [tourneyIdx, state.activePreset, state.profile, state.perkData, state.wsData, state.enhData, state.labData,
        state.cardData, state.uwData, state.relicData, state.botData, state.moduleState, state.importedBattles]);

    const models = useMemo(() => (account ? runModels(account) : null), [account]);
    const run = models?.run ?? null;
    const [result, setResult] = useState<{ res: LoadoutResult; own: Record<string, number> } | null>(null);
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState(false);

    if (!account || !models) {
        return (
            <div className="relics-note">
                <strong>Tournament</strong> needs tournament runs in your battle history — play one, then use
                <em> Import Game Data</em>. Each import adds your latest runs.
            </div>
        );
    }

    const tourneyRuns = state.importedBattles.filter(b => b.tournament)
        .sort((a, b) => (b.time ?? 0) - (a.time ?? 0)).slice(0, 10);
    const spread = run ? wavesSpread(run, 0, 0, 0).ended : [];
    const toWaves = (gainPct: number, skip: number) =>
        run ? pathRunGains(run, [gainPct], undefined, [Math.max(0, skip)], models.worth)[0].waves : null;

    const goal = build === 'Glass Cannon' ? 'waves' : 'survival';
    function findBest() {
        setBusy(true);
        setSaved(false);
        setTimeout(() => {
            try {
                const snap = snapshotFromState(account!);
                applyGoal(snap, goal, build, account!.importedBattles[tourneyIdx], models!);
                const res = bestLoadout(snap);
                // Each swap on its own, from the current loadout.
                const start = activeLoadout(snap.moduleState)?.slots;
                const base = start ? loadoutScore(snap, start) : null;
                const own: Record<string, number> = {};
                if (start && base) {
                    for (const c of res.changes) {
                        const one: LoadoutSlots = { ...start, [c.type]: { ...start[c.type], [c.position]: c.to } };
                        const s = loadoutScore(snap, one);
                        own[`${c.type}-${c.position}`] = toWaves((s.score / base.score - 1) * 100, s.skip - base.skip) ?? 0;
                    }
                }
                setResult({ res, own });
            } finally {
                setBusy(false);
            }
        }, 30);
    }

    function saveLoadout() {
        if (!result) return;
        const loadouts = state.moduleState.loadouts.filter(l => l.id !== 'tourney-best');
        setModuleState({ loadouts: [...loadouts, { id: 'tourney-best', name: 'Best for tournaments', slots: result.res.slots }] });
        setSaved(true);
    }

    const moduleName = (id: string) => {
        const m = state.moduleState.library.find(x => x.id === id);
        if (!m) return 'Empty';
        return `${m.name} (${RARITIES.find(r => r.k === m.rarity)?.label ?? m.rarity})`;
    };
    const totalWaves = result ? toWaves(result.res.gainPct, result.res.skipPoints) : null;

    return (
        <div>
            <div className="relics-note">
                <strong>Tournaments.</strong> Tournament enemies get tougher much faster than on a campaign tier, so
                everything here is measured against your own tournament deaths, on the tournament enemy curve. Which
                modules to run, below; to try any other change, pick a tournament run as the Optimizer&apos;s Battle
                Report and use What If.
            </div>

            <div className="section" style={{ marginBottom: '12px' }}>
                <div className="section-head"><h3>Your tournaments</h3></div>
                <div className="section-body">
                    {run ? (
                        <div className="rc-result">
                            <div><span>Runs end around</span><strong>W{run.typicalWave.toLocaleString()}</strong></div>
                            <div><span>Last {spread.length} deaths</span><strong>W{Math.min(...spread)}–W{Math.max(...spread)}</strong></div>
                            <div><span>Health levels skipped</span><strong>{(run.skipRate * 100).toFixed(1)}%</strong></div>
                        </div>
                    ) : (
                        <p className="en-note">
                            Your tournament runs don&apos;t have the level-skip counts waves need — import again to add them.
                        </p>
                    )}
                    <div className="en-table-wrap" style={{ marginTop: '10px' }}>
                        <table className="en-table">
                            <thead><tr><th>Run</th><th>Ended by</th></tr></thead>
                            <tbody>
                                {tourneyRuns.map((b, i) => {
                                    const k = killedBy(b);
                                    const s = runSavers(b);
                                    const saves = [['Death Defy', s.deathDefy], ['Energy Shield', s.energyShield], ['Second Wind', s.secondWind]]
                                        .filter(([, v]) => ((v as number | null) ?? 0) > 0).map(([n, v]) => `${n} ${v}`).join(' · ');
                                    return (
                                        <tr key={i}>
                                            <td>W{b.wave.toLocaleString()}<span className="en-sub">{b.date}</span></td>
                                            <td>
                                                {k === undefined ? <span className="en-dim">—</span> : k ?? 'You (quit)'}
                                                {saves && <span className="en-sub">Saved by {saves}</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div className="section" style={{ marginBottom: '12px' }}>
                <div className="section-head"><h3>Best modules for tournament {goal === 'waves' ? 'waves' : 'survival'}</h3></div>
                <div className="section-body">
                    <p className="en-note" style={{ marginTop: 0 }}>
                        Tries every module you own in each main and assist slot — main effect at the slot&apos;s level,
                        substats at its efficiency, the unique effects the model reads — and keeps the swaps that add
                        the most, round after round, so modules that work together are found together.
                    </p>
                    <button className="btn btn-accent" onClick={findBest} disabled={busy}>
                        {busy ? '⏳ Trying your modules…' : '▶ Find the best loadout'}
                    </button>

                    {result && (
                        result.res.changes.length === 0 ? (
                            <p className="en-note">Your current loadout is already the best of your modules for this.</p>
                        ) : (
                            <>
                                <div className="rc-result" style={{ marginTop: '12px' }}>
                                    <div><span>{goal === 'waves' ? 'Flat damage + skip' : 'Survival'}</span><strong>{gainText(result.res.gainPct)}</strong></div>
                                    {totalWaves !== null && goal === 'waves' && (
                                        <div><span>Tournament waves</span><strong>{wavesText(totalWaves)}</strong></div>
                                    )}
                                    <div><span>Loadouts tried</span><strong>{result.res.evaluated.toLocaleString()}</strong></div>
                                </div>
                                <div className="tn-swaps">
                                    {TYPES.filter(t => result.res.changes.some(c => c.type === t)).map(t => (
                                        <div key={t} className="tn-swap">
                                            <div className="tn-swap-head">{cap(t)}</div>
                                            {result.res.changes.filter(c => c.type === t).map(c => (
                                                <div key={c.position} className="tn-swap-row">
                                                    <span className="tn-pos">{cap(c.position)}</span>
                                                    <span className={c.from ? 'tn-from' : 'tn-pos'}>{c.from ? moduleName(c.from) : 'Empty slot'}</span>
                                                    <span className="tn-to">→ {moduleName(c.to)}</span>
                                                    {goal === 'waves' && result.own[`${c.type}-${c.position}`] !== undefined && (
                                                        <span className="tn-waves">{wavesText(result.own[`${c.type}-${c.position}`])} on its own</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                                {TYPES.some(t => !result.res.changes.some(c => c.type === t)) && (
                                    <p className="en-note">
                                        Keep your {TYPES.filter(t => !result.res.changes.some(c => c.type === t)).map(cap).join(', ')}
                                        {' '}— none of your other modules there does more for this.
                                    </p>
                                )}
                                <button className="btn btn-dim" onClick={saveLoadout} style={{ marginTop: '10px' }}>
                                    {saved ? '✓ Saved — see Gear → Modules' : 'Save as a loadout'}
                                </button>
                                <p className="en-note">
                                    Swaps work on each other, so the waves on their own don&apos;t add up to the total.
                                    Battle conditions change from week to week and your past tournaments mix them, so this is
                                    the best loadout for an average week of your league.
                                </p>
                            </>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}
