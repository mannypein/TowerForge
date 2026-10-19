// ============================================================
//  TowerForge Companion — Tournament Tab
//  How your tournament runs end; a run simulated under this week's battle
//  conditions, each as strong as the game makes it at the wave the run ends
//  (heat, engine/battleConditions.ts); and which of your modules to run for
//  the most tournament waves (engine/loadoutOptimizer.ts) — all measured
//  against your own tournament deaths on the tournament curve.
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
import { killedBy, killerMix, runWavesChange, wavesSpread } from '../../engine/runLength';
import { runSavers } from '../../engine/battleReport';
import { bcLabCut, heatConditions, heatValue, leagueConditions } from '../../engine/battleConditions';
import type { TourneyConditions } from '../../engine/battleConditions';
import { activeLoadout } from '../../engine/statHelpers';
import { RARITIES } from '../../constants/moduleRarities';
import { LEAGUE_HEAT, LEGEND_OVERHEAT, RANDOM_CONDITIONS, SAVER_CONDITIONS } from '../../constants/tournamentData';
import type { HeatCondition, HeatKey, LeagueHeat } from '../../constants/tournamentData';

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
const round1 = (v: number) => Math.round(v * 10) / 10;

// The league and conditions picked on this page — a per-viewer
// convenience, so it lives in this browser only.
type Ticks = Partial<Record<HeatKey, boolean>>;
interface SimState {
    league: League;
    week: Ticks;      // in this week's tournament
    recent: Ticks;    // in the tournaments your deaths come from
}
const SIM_KEY = 'tc_tourney_sim';
const EMPTY_SIM: SimState = { league: '', week: {}, recent: {} };
function loadSim(): SimState {
    try {
        const raw = localStorage.getItem(SIM_KEY);
        const s = raw ? JSON.parse(raw) : null;
        return s ? { league: s.league ?? '', week: s.week ?? {}, recent: s.recent ?? {} } : EMPTY_SIM;
    } catch {
        return EMPTY_SIM;
    }
}
function saveSim(s: SimState) {
    try { localStorage.setItem(SIM_KEY, JSON.stringify(s)); } catch { /* private window: not remembered */ }
}

const COUNTED = RANDOM_CONDITIONS.filter(c => c.counted);

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
        guardianData: state.guardianData,
    }), [tourneyIdx, state.activePreset, state.profile, state.perkData, state.wsData, state.enhData, state.labData,
        state.cardData, state.uwData, state.relicData, state.botData, state.moduleState, state.importedBattles,
        state.guardianData]);

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
    const league = sim.league || state.profile.currentLeague || state.profile.league || '';
    const heat: LeagueHeat | undefined = LEAGUE_HEAT.find(l => l.league === league);

    // The account scored under the conditions of the runs its deaths come
    // from (the calibration), and a way to read any other set against it.
    const model = useMemo(() => {
        if (!account || !models) return null;
        const snap = snapshotFromState(account);
        const report = account.importedBattles[tourneyIdx];
        if (!isGC || !run) {
            applyGoal(snap, 'survival', build, report, models);
            return {
                weekSnap: snap, wavesOf: null, week: 0, weekWave: 0, each: [] as { key: HeatKey; waves: number }[],
                weekAt: (): TourneyConditions => snap.conditions ?? {},
            };
        }
        const labs = account.labData;
        // The league's fixed conditions are in every tournament, at the wave
        // runs usually end; the random ones at the wave the run ends.
        const fixed = heat ? leagueConditions(heat, run.typicalWave, labs) : {};
        const at = (set: Ticks, wave: number): TourneyConditions =>
            (heat ? { ...fixed, ...heatConditions(heat, set, wave, labs) } : {});
        snap.conditions = at(sim.recent, run.typicalWave);
        applyGoal(snap, 'waves', build, report, models);
        const ref: Scored = { score: goalScore(snap), skip: skipChanceOf(snap) };
        const scoreOf = (s: OptimizerSnapshot): Scored => ({ score: goalScore(s), skip: skipChanceOf(s) });
        const wavesOf = (s: Scored) => runWavesChange(
            run, Math.log(s.score / ref.score) - models.worth * (s.skip - ref.skip), s.skip - ref.skip);
        // Conditions are read where the run ends, which they move: settle it.
        const settle = (set: Ticks) => {
            let w = 0;
            for (let i = 0; i < 3; i++) w = wavesOf(scoreOf({ ...snap, conditions: at(set, run.typicalWave + w) }));
            return w;
        };
        const week = settle(sim.week);
        const weekWave = run.typicalWave + week;
        const each = COUNTED.filter(c => sim.week[c.key] || sim.recent[c.key])
            .map(c => ({ key: c.key, waves: settle({ ...sim.recent, [c.key]: sim.week[c.key] }) }));
        return {
            weekSnap: { ...snap, conditions: at(sim.week, weekWave) }, wavesOf, week, weekWave, each,
            weekAt: (wave: number) => at(sim.week, wave),
        };
    }, [account, models, run, tourneyIdx, isGC, build, sim, heat]);

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
    const anyWeek = RANDOM_CONDITIONS.some(c => sim.week[c.key]);
    const endW = run?.typicalWave ?? 0;
    const labs = state.labData;

    // A condition's strength at a wave, after your labs (resistances shown as the game lists them).
    const strength = (c: HeatCondition, wave: number) => {
        if (!heat?.ramp) return null;
        const raw = heatValue(c, heat.ramp, wave);
        const cut = c.resistance ? 0 : bcLabCut(labs, c.lab);
        return { raw, after: round1(raw * (1 - cut)), cut };
    };
    const fixed = heat && run ? leagueConditions(heat, endW, labs) : null;

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
                    // A loadout that goes much further meets stronger conditions there.
                    let w = wavesOf(at(res.slots));
                    for (let i = 0; i < 3; i++) {
                        w = wavesOf(loadoutScore({ ...snap, conditions: model!.weekAt(endW + w) }, res.slots));
                    }
                    weekWaves = w;
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
    const endWave = (change: number) => `W${Math.round(endW + change).toLocaleString()}`;
    const ticked = (c: HeatCondition) => !!(sim.week[c.key] || sim.recent[c.key]);

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
                                    Tier {heat.tierPlus}+ enemies · {heat.randomConditions} random condition{heat.randomConditions === 1 ? '' : 's'} a week
                                </span>
                            )}
                        </div>

                        {!heat ? (
                            <p className="en-note">Pick your league — each has its own fixed conditions and heat.</p>
                        ) : (
                            <>
                                <div className="wi-chain">
                                    <div className="wi-chain-head">Always on in {heat.league}</div>
                                    <div className="wi-chain-row"><span className="wi-v">More Bosses</span><span className="wi-share">a boss every {heat.bossEvery} waves</span></div>
                                    {fixed?.skipMultiply !== undefined && (
                                        <div className="wi-chain-row">
                                            <span className="wi-v">Skip Reduction - Multiply</span>
                                            <span className="wi-share">×{heat.skipMultiply}{fixed.skipMultiply !== heat.skipMultiply && ` (×${fixed.skipMultiply.toFixed(2)} after your labs)`}</span>
                                        </div>
                                    )}
                                    {heat.skipDecayEvery && fixed?.skipDecayFactor !== undefined && (
                                        <div className="wi-chain-row">
                                            <span className="wi-v">Skip Decay</span>
                                            <span className="wi-share">1% every {heat.skipDecayEvery} waves (×{fixed.skipDecayFactor.toFixed(2)} on average to W{endW})</span>
                                        </div>
                                    )}
                                    {heat.saverDown && (
                                        <div className="wi-chain-row">
                                            <span className="wi-v">Death Defy Down or Energy Shields Down</span>
                                            <span className="wi-share">
                                                {SAVER_CONDITIONS.map(c => c.fmt(strength(c, endW)?.after ?? 0)).join(' / ')} at W{endW}
                                            </span>
                                        </div>
                                    )}
                                    {heat.league === 'Legend' && LEGEND_OVERHEAT.map(o => (
                                        <div key={o.text} className="wi-chain-row">
                                            <span className="wi-v">{o.text}</span><span className="wi-share">from W{o.from.toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                                <p className="en-note">
                                    Your deaths already have these, so they don&apos;t move this week&apos;s end — but they make
                                    each point of Enemy Health Level Skip worth less in a tournament, which the Optimizer, What If
                                    and the module search below count when a tournament run is the Battle Report.
                                </p>

                                {heat.randomConditions > 0 && (
                                    <>
                                        <div className="wi-chain-head" style={{ marginTop: '12px' }}>Random conditions</div>
                                        <p className="en-note" style={{ marginTop: 0 }}>
                                            Tick the ones this week&apos;s tournament has — the game shows them before you start.
                                            They get stronger as the run goes on (full strength at W1000); the strength shown is at
                                            the wave your runs end. Tick &quot;Recent runs&quot; for any your last tournaments had too —
                                            those are already in your deaths.
                                        </p>
                                        <div className="tn-bc">
                                            {RANDOM_CONDITIONS.map(c => {
                                                const s = strength(c, endW);
                                                return (
                                                    <div key={c.key} className="tn-bc-row">
                                                        <div className="tn-bc-name">
                                                            <strong>{c.name}</strong>
                                                            <span className="en-sub">
                                                                {c.text} · at W{endW}: <span className="tn-heat">{s ? c.fmt(s.after) : '—'}</span>
                                                                {s && s.cut > 0 && ` (${c.fmt(s.raw)} before your labs)`}
                                                            </span>
                                                            {!c.counted && ticked(c) && <span className="en-sub tn-why">Not counted: {c.why}</span>}
                                                        </div>
                                                        <div className="tn-bc-inputs">
                                                            <label className="tn-check">
                                                                <input type="checkbox" checked={!!sim.week[c.key]}
                                                                    onChange={e => setSim({ week: { ...sim.week, [c.key]: e.target.checked } })} />
                                                                This week
                                                            </label>
                                                            <label className="tn-check">
                                                                <input type="checkbox" checked={!!sim.recent[c.key]}
                                                                    onChange={e => setSim({ recent: { ...sim.recent, [c.key]: e.target.checked } })} />
                                                                Recent runs
                                                            </label>
                                                            {!c.counted && <span className="tn-tag">not counted</span>}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="rc-result" style={{ marginTop: '12px' }}>
                                            <div><span>Your tournaments end</span><strong>W{endW.toLocaleString()}</strong></div>
                                            <div><span>This week</span><strong>{endWave(model.week)}</strong></div>
                                            <div><span>Change</span><strong>{wavesText(model.week)}</strong></div>
                                        </div>
                                        {model.each.length > 0 && (
                                            <div className="wi-chain">
                                                {model.each.map(e => {
                                                    const c = COUNTED.find(x => x.key === e.key)!;
                                                    const both = sim.week[e.key] && sim.recent[e.key];
                                                    const s = strength(c, model.weekWave);
                                                    return (
                                                        <div key={e.key} className="wi-chain-row">
                                                            <span className="wi-v">
                                                                {c.name}{sim.week[e.key] ? (s ? ` (${c.fmt(s.after)} at W${Math.round(model.weekWave)})` : '') : ' (gone this week)'}
                                                            </span>
                                                            <span className="wi-share">
                                                                {both ? 'already in your runs'
                                                                    : e.key === 'bossUltimate' && !killerMix(run).Boss ? 'bosses haven’t ended your recent runs'
                                                                        : wavesText(e.waves)}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        <p className="en-note">
                                            Counted: Ultimate Weapon Durations (how long Chrono Field and Poison Swamp last, at the
                                            seconds it takes off where the run ends) and Boss&apos;s Ultimate (boss health, as often as
                                            bosses end your runs). Your battle-condition labs weaken both. The others are shown with
                                            their strength but don&apos;t change the waves yet — tick one to see why.
                                        </p>
                                    </>
                                )}
                            </>
                        )}
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
                        {isGC && heat && ' Scored under your league’s conditions'}
                        {isGC && heat && (anyWeek ? ' and this week’s, so a module that answers one (Chrono Field duration against shorter UWs, say) counts for it.' : '.')}
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
