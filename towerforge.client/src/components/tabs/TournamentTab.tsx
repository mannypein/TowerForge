// ============================================================
//  TowerForge Companion — Tournament Tab
//  How your tournament runs end; a run simulated under this week's battle
//  conditions (engine/battleConditions.ts); and which of your modules to
//  run for the most tournament waves (engine/loadoutOptimizer.ts) — all
//  measured against your own tournament deaths on the tournament curve.
// ============================================================

import { useMemo, useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import type { BuildType, League, LoadoutSlots, ModuleType } from '../../types/gameTypes';
import { applyGoal, runModels, snapshotFromState } from '../../engine/accountModels';
import type { AccountState } from '../../engine/accountModels';
import { bestLoadout, loadoutScore } from '../../engine/loadoutOptimizer';
import type { LoadoutResult } from '../../engine/loadoutOptimizer';
import { goalScore, skipChanceOf } from '../../engine/optimizer';
import type { OptimizerSnapshot } from '../../engine/optimizer';
import { killedBy, runWavesChange, wavesSpread } from '../../engine/runLength';
import { runSavers } from '../../engine/battleReport';
import { skipDecayAverage } from '../../engine/battleConditions';
import type { TourneyConditions } from '../../engine/battleConditions';
import { activeLoadout } from '../../engine/statHelpers';
import { RARITIES } from '../../constants/moduleRarities';
import { COUNTED_CONDITIONS, LEAGUE_HEAT, UNCOUNTED_CONDITIONS } from '../../constants/tournamentData';
import type { ConditionKey } from '../../constants/tournamentData';

const TYPES: ModuleType[] = ['cannon', 'armor', 'generator', 'core'];
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
const wavesText = (w: number) => {
    const a = Math.abs(w);
    return `${w < 0 ? '−' : '+'}${a < 10 ? a.toFixed(1) : Math.round(a)} waves`;
};
// Big gains read better as a multiplier (a farming loadout moved to damage).
const gainText = (pct: number) => (pct >= 100
    ? `×${(1 + pct / 100).toLocaleString(undefined, { maximumFractionDigits: pct >= 1000 ? 0 : 2 })}`
    : `+${pct.toFixed(pct >= 10 ? 1 : 2)}%`);

// The conditions picked on this page — a per-viewer convenience, so it
// lives in this browser only.
interface SimState {
    league: League;
    week: Partial<Record<ConditionKey, boolean>>;     // in this week's tournament
    recent: Partial<Record<ConditionKey, boolean>>;   // in the runs your deaths come from
    val: Partial<Record<ConditionKey, number>>;       // strength the game shows
    decayEvery: number;                               // Skip Decay: every N waves
}
const SIM_KEY = 'tc_tourney_sim';
const EMPTY_SIM: SimState = { league: '', week: {}, recent: {}, val: {}, decayEvery: 0 };
function loadSim(): SimState {
    try {
        const raw = localStorage.getItem(SIM_KEY);
        return raw ? { ...EMPTY_SIM, ...JSON.parse(raw) } : EMPTY_SIM;
    } catch {
        return EMPTY_SIM;
    }
}
function saveSim(s: SimState) {
    try { localStorage.setItem(SIM_KEY, JSON.stringify(s)); } catch { /* private window: not remembered */ }
}

// The conditions in a set, at the strengths entered. Skip Decay becomes
// the points it takes off on average over a run to `wave`.
function conditionsOf(sim: SimState, set: Partial<Record<ConditionKey, boolean>>, chance: number, wave: number): TourneyConditions {
    const v = (k: ConditionKey) => (set[k] && (sim.val[k] ?? 0) > 0 ? sim.val[k] : undefined);
    const mult = v('skipMultiply') !== undefined ? Math.min(1, v('skipMultiply')!) : undefined;
    const decay = v('skipDecay');
    return {
        enemySpeedPct: v('enemySpeed'),
        uwDurationSec: v('uwDurations'),
        skipMultiply: mult,
        skipDecayPoints: decay !== undefined ? skipDecayAverage(decay, sim.decayEvery, wave, chance * (mult ?? 1)) : undefined,
        bossHealthPct: v('bossUltimate'),
    };
}

interface Scored { score: number; skip: number }

export default function TournamentTab() {
    const state = useGameStore();
    const setModuleState = useGameStore(s => s.setModuleState);
    const build = (state.profile.build || 'Glass Cannon') as BuildType;
    const isGC = build === 'Glass Cannon';

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

    const [sim, setSimState] = useState<SimState>(loadSim);
    const [result, setResult] = useState<{ res: LoadoutResult; own: Record<string, number>; waves: number | null; weekWaves: number | null } | null>(null);
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState(false);
    const setSim = (patch: Partial<SimState>) => {
        const next = { ...sim, ...patch };
        setSimState(next);
        saveSim(next);
        setResult(null);
    };
    const league = sim.league || state.profile.league || '';
    const heat = LEAGUE_HEAT.find(l => l.league === league);

    // The account scored under the conditions of the runs its deaths come
    // from (the calibration), and a way to read any other set against it.
    const model = useMemo(() => {
        if (!account || !models) return null;
        const snap = snapshotFromState(account);
        const report = account.importedBattles[tourneyIdx];
        if (!isGC || !run) {
            applyGoal(snap, 'survival', build, report, models);
            return { weekSnap: snap, wavesOf: null, week: null, each: [] as { key: ConditionKey; waves: number }[] };
        }
        const chance = skipChanceOf(snap);
        const conds = (set: Partial<Record<ConditionKey, boolean>>) => conditionsOf(sim, set, chance, run.typicalWave);
        snap.conditions = conds(sim.recent);
        applyGoal(snap, 'waves', build, report, models);
        const ref: Scored = { score: goalScore(snap), skip: skipChanceOf(snap) };
        const scoreOf = (s: OptimizerSnapshot): Scored => ({ score: goalScore(s), skip: skipChanceOf(s) });
        const wavesOf = (s: Scored) => runWavesChange(
            run, Math.log(s.score / ref.score) - models.worth * (s.skip - ref.skip), s.skip - ref.skip);
        const weekSnap: OptimizerSnapshot = { ...snap, conditions: conds(sim.week) };
        const each = COUNTED_CONDITIONS.filter(c => sim.week[c.key] || sim.recent[c.key]).map(c => ({
            key: c.key,
            waves: wavesOf(scoreOf({ ...snap, conditions: conds({ ...sim.recent, [c.key]: sim.week[c.key] }) })),
        }));
        return { weekSnap, wavesOf, week: wavesOf(scoreOf(weekSnap)), each };
    }, [account, models, run, tourneyIdx, isGC, build, sim]);

    if (!account || !models || !model) {
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
    const anyWeek = COUNTED_CONDITIONS.some(c => sim.week[c.key] && (sim.val[c.key] ?? 0) > 0);

    function findBest() {
        setBusy(true);
        setSaved(false);
        setTimeout(() => {
            try {
                const snap = model!.weekSnap;
                const res = bestLoadout(snap);
                const start = activeLoadout(snap.moduleState)?.slots;
                const wavesOf = model!.wavesOf;
                const at = (slots: LoadoutSlots) => loadoutScore(snap, slots);
                const now = start ? at(start) : null;
                const own: Record<string, number> = {};
                let waves: number | null = null;
                let weekWaves: number | null = null;
                if (start && now && wavesOf) {
                    for (const c of res.changes) {
                        const one: LoadoutSlots = { ...start, [c.type]: { ...start[c.type], [c.position]: c.to } };
                        own[`${c.type}-${c.position}`] = wavesOf(at(one)) - wavesOf(now);
                    }
                    weekWaves = wavesOf(at(res.slots));
                    waves = weekWaves - wavesOf(now);
                }
                setResult({ res, own, waves, weekWaves });
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
        if (!m) return 'Empty slot';
        return `${m.name} (${RARITIES.find(r => r.k === m.rarity)?.label ?? m.rarity})`;
    };
    const endWave = (change: number) => `W${Math.round((run?.typicalWave ?? 0) + change).toLocaleString()}`;

    return (
        <div>
            <div className="relics-note">
                <strong>Tournaments.</strong> Tournament enemies get tougher much faster than on a campaign tier, so
                everything here is measured against your own tournament deaths, on the tournament enemy curve. To try
                any other change, pick a tournament run as the Optimizer&apos;s Battle Report and use What If.
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
                        <table className="en-table rc-table">
                            <thead><tr><th>Run</th><th>Ended by</th></tr></thead>
                            <tbody>
                                {tourneyRuns.map((b, i) => {
                                    const k = killedBy(b);
                                    const s = runSavers(b);
                                    const saves = ([['Death Defy', s.deathDefy], ['Energy Shield', s.energyShield], ['Second Wind', s.secondWind]] as [string, number | null][])
                                        .filter(([, v]) => (v ?? 0) > 0).map(([n, v]) => `${n} ${v}`).join(' · ');
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

            {isGC && run && model.wavesOf && (
                <div className="section" style={{ marginBottom: '12px' }}>
                    <div className="section-head"><h3>This week&apos;s battle conditions</h3></div>
                    <div className="section-body">
                        <div className="tn-league">
                            <label htmlFor="tn-league">League</label>
                            <select id="tn-league" value={league} onChange={e => setSim({ league: e.target.value as League })}>
                                <option value="">—</option>
                                {LEAGUE_HEAT.map(l => <option key={l.league} value={l.league}>{l.league}</option>)}
                            </select>
                            {heat && (
                                <span className="en-sub">
                                    Tier {heat.tierPlus}+ enemies · a boss every {heat.bossEvery} waves
                                    {heat.randomConditions > 0 && ` · ${heat.randomConditions} random condition${heat.randomConditions === 1 ? '' : 's'}`}
                                    {heat.saverDown && ' · Death Defy Down or Energy Shields Down'}
                                </span>
                            )}
                        </div>
                        <p className="en-note">
                            Tick the conditions this week&apos;s tournament has and type the strength the game shows for each,
                            near the wave your runs end (conditions get stronger as the run goes on). Tick &quot;Recent runs&quot;
                            for any your last tournaments had too — those are already in your deaths.
                        </p>

                        <div className="tn-bc">
                            {COUNTED_CONDITIONS.map(c => (
                                <div key={c.key} className="tn-bc-row">
                                    <div className="tn-bc-name">
                                        <strong>{c.name}</strong>
                                        <span className="en-sub">{c.text}</span>
                                    </div>
                                    <div className="tn-bc-inputs">
                                        <label className="tn-check">
                                            <input type="checkbox" checked={!!sim.week[c.key]}
                                                onChange={e => setSim({ week: { ...sim.week, [c.key]: e.target.checked } })} />
                                            This week
                                        </label>
                                        <span className="tn-val">
                                            <input type="number" min={0} max={c.max} step={c.step} inputMode="decimal"
                                                aria-label={`${c.name} strength`}
                                                value={sim.val[c.key] ?? ''}
                                                onChange={e => {
                                                    const n = parseFloat(e.target.value);
                                                    setSim({ val: { ...sim.val, [c.key]: Number.isFinite(n) ? Math.min(c.max, Math.max(0, n)) : undefined } });
                                                }} />
                                            {c.unit}
                                        </span>
                                        {c.every && (
                                            <span className="tn-val">
                                                every
                                                <input type="number" min={1} step={1} inputMode="numeric" aria-label="Skip Decay every N waves"
                                                    value={sim.decayEvery || ''}
                                                    onChange={e => setSim({ decayEvery: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
                                                waves
                                            </span>
                                        )}
                                        <label className="tn-check">
                                            <input type="checkbox" checked={!!sim.recent[c.key]}
                                                onChange={e => setSim({ recent: { ...sim.recent, [c.key]: e.target.checked } })} />
                                            Recent runs
                                        </label>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="rc-result" style={{ marginTop: '12px' }}>
                            <div><span>Your tournaments end</span><strong>W{run.typicalWave.toLocaleString()}</strong></div>
                            <div><span>This week</span><strong>{endWave(model.week ?? 0)}</strong></div>
                            <div><span>Change</span><strong>{wavesText(model.week ?? 0)}</strong></div>
                        </div>
                        {model.each.length > 0 && (
                            <div className="wi-chain">
                                {model.each.map(e => {
                                    const c = COUNTED_CONDITIONS.find(x => x.key === e.key)!;
                                    const both = sim.week[e.key] && sim.recent[e.key];
                                    const noVal = !((sim.val[e.key] ?? 0) > 0) || (c.every && !sim.decayEvery);
                                    return (
                                        <div key={e.key} className="wi-chain-row">
                                            <span className="wi-v">{c.name}{sim.week[e.key] ? '' : ' (gone this week)'}</span>
                                            <span className="wi-share">
                                                {noVal ? 'enter its strength' : both ? 'already in your runs' : wavesText(e.waves)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        <p className="en-note">
                            Each condition changes what the model already reads: Enemy Speed the time enemies spend in range;
                            UW Durations how long Chrono Field and Poison Swamp last; the skip conditions your Enemy Health
                            Level Skip; Boss&apos;s Ultimate boss health, as often as bosses end your runs. Skip Decay is
                            counted at its average over the run (about half its end value) — the code&apos;s assumption.
                        </p>
                        <details className="tn-uncounted">
                            <summary>Conditions it can&apos;t count yet</summary>
                            <ul>
                                {UNCOUNTED_CONDITIONS.map(u => <li key={u.name}><strong>{u.name}</strong> — {u.why}</li>)}
                            </ul>
                        </details>
                    </div>
                </div>
            )}

            <div className="section" style={{ marginBottom: '12px' }}>
                <div className="section-head">
                    <h3>Best modules for {isGC ? (anyWeek ? 'this week' : 'tournament waves') : 'tournament survival'}</h3>
                </div>
                <div className="section-body">
                    <p className="en-note" style={{ marginTop: 0 }}>
                        Tries every module you own in each main and assist slot — main effect at the slot&apos;s level,
                        substats at its efficiency, the unique effects the model reads — and keeps the swaps that add
                        the most, round after round, so modules that work together are found together.
                        {isGC && anyWeek && ' Scored under this week’s conditions, so a module that answers one (Chrono Field duration against shorter UWs, say) counts for it.'}
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
                                    <div><span>{isGC ? 'Flat damage + skip' : 'Survival'}</span><strong>{gainText(result.res.gainPct)}</strong></div>
                                    {result.waves !== null && (
                                        <div><span>Tournament waves</span><strong>{wavesText(result.waves)}</strong></div>
                                    )}
                                    {result.weekWaves !== null && (
                                        <div><span>{anyWeek ? 'This week with them' : 'Runs would end around'}</span><strong>{endWave(result.weekWaves)}</strong></div>
                                    )}
                                </div>
                                <div className="tn-swaps">
                                    {TYPES.filter(t => result.res.changes.some(c => c.type === t)).map(t => (
                                        <div key={t} className="tn-swap">
                                            <div className="tn-swap-head">{cap(t)}</div>
                                            {result.res.changes.filter(c => c.type === t).map(c => (
                                                <div key={c.position} className="tn-swap-row">
                                                    <span className="tn-pos">{cap(c.position)}</span>
                                                    <span className={c.from ? 'tn-from' : 'tn-pos'}>{moduleName(c.from)}</span>
                                                    <span className="tn-to">→ {moduleName(c.to)}</span>
                                                    {result.own[`${c.type}-${c.position}`] !== undefined && (
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
                                    {!anyWeek && ' Without this week’s conditions, this is the best loadout for the conditions your recent tournaments had.'}
                                </p>
                            </>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}
