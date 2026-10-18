// ============================================================
//  TowerForge Companion — Run Length Tab
//  Run simulator, step 2, for Glass Cannon: what ended each saved run,
//  the enemy health the tower stops coping with, and how many waves —
//  and how many more coins per run — extra damage or extra Enemy
//  Health Level Skip would buy (engine/runLength.ts, runCoins.ts).
// ============================================================

import { useMemo } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { buildRunLengthModel, runEnds, wavesFromDamage, wavesFromSkip } from '../../engine/runLength';
import { buildRunModel, projectRun, runSettingsFromCards } from '../../engine/runCoins';
import { defaultBattleIndex } from '../../engine/gameExport';

const DAMAGE_STEPS = [0.01, 0.05, 0.1, 0.25, 0.5, 1];
const SKIP_STEPS = [0.5, 1, 2, 5];

const pctOf = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`;

export default function RunLengthTab() {
    const battles = useGameStore(s => s.importedBattles);
    const cardData = useGameStore(s => s.cardData);
    const preset = useGameStore(s => s.activePreset);

    const model = useMemo(() => buildRunLengthModel(battles), [battles]);
    const ends = useMemo(() => runEnds(battles).filter(e => !e.run.tournament && e.run.wave > 1).reverse(), [battles]);
    // Coins per run from step 1, tuned on the default run with the card settings.
    const coins = useMemo(() => {
        const settings = runSettingsFromCards(cardData, preset);
        const coinModel = buildRunModel(battles, defaultBattleIndex(battles), settings);
        return coinModel ? { cal: coinModel.calibration, settings } : null;
    }, [battles, cardData, preset]);

    if (!model) {
        return (
            <div className="relics-note">
                <strong>Run Length</strong> needs runs that ended in a death, with their level skips — use
                <em> Import Game Data</em> (runs imported before Oct 17 don&apos;t have them; importing again adds them).
            </div>
        );
    }

    const used = new Set(model.used.map(d => d.index));
    const coinsAt = (wave: number) => coins ? projectRun(coins.cal, coins.settings, wave, model.tier).coins : null;
    const baseCoins = coinsAt(model.typicalWave);
    const coinChange = (extraWaves: number) => {
        const at = coinsAt(model.typicalWave + extraWaves);
        return at !== null && baseCoins ? at / baseCoins - 1 : null;
    };

    return (
        <div>
            <div className="relics-note">
                <strong>Run simulator, step 2 — how far a run gets (Glass Cannon).</strong> One hit ends a GC run, so
                a run lasts until enemies are too tough to kill before they reach the tower. Enemy health at the
                wave you died (from the formula checked against the game) tells us where that point is; more
                damage pushes it to where enemies are that much tougher.
            </div>

            <div className="section" style={{ marginBottom: '12px' }}>
                <div className="section-head"><h3>Where your runs end</h3><span className="s-badge">Tier {model.tier}</span></div>
                <div className="section-body en-inputs">
                    <div className="rc-result">
                        <div><span>Runs end around</span><strong>W{model.typicalWave.toLocaleString()}</strong></div>
                        <div><span>Health levels skipped</span><strong>{(model.skipRate * 100).toFixed(1)}%</strong></div>
                        <div><span>+10% damage</span><strong>+{Math.round(wavesFromDamage(model, 0.1))} waves</strong></div>
                    </div>
                    <p className="en-note">
                        From your {model.used.length} newest death{model.used.length === 1 ? '' : 's'} on tier {model.tier} (marked • below).
                        Enemy health jumps at some waves — a wall — so the same extra damage buys more waves in
                        some runs than others; the tables average your recent deaths.
                    </p>
                </div>
            </div>

            <div className="section" style={{ marginBottom: '12px' }}>
                <div className="section-head"><h3>What more damage buys</h3></div>
                <div className="section-body en-table-wrap">
                    <table className="en-table">
                        <thead><tr><th>Damage</th><th>Waves</th><th>Run to</th><th>Coins / run</th></tr></thead>
                        <tbody>
                            {DAMAGE_STEPS.map(g => {
                                const w = Math.round(wavesFromDamage(model, g));
                                const c = coinChange(w);
                                return (
                                    <tr key={g}>
                                        <td>{g >= 1 ? `×${1 + g}` : `+${g * 100}%`}</td>
                                        <td>+{w}</td>
                                        <td>W{(model.typicalWave + w).toLocaleString()}</td>
                                        <td>{c === null ? '—' : pctOf(c)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <p className="en-note">
                        &quot;Damage&quot; is everything that kills — the Optimizer&apos;s eDPS. Coins per run come from
                        Coins per Run, tuned on your default run.
                    </p>
                </div>
            </div>

            <div className="section" style={{ marginBottom: '12px' }}>
                <div className="section-head"><h3>What more Enemy Health Level Skip buys</h3></div>
                <div className="section-body en-table-wrap">
                    <table className="en-table">
                        <thead><tr><th>Skip</th><th>Waves</th><th>Run to</th><th>Coins / run</th></tr></thead>
                        <tbody>
                            {SKIP_STEPS.map(p => {
                                const w = Math.round(wavesFromSkip(model, p));
                                const c = coinChange(w);
                                return (
                                    <tr key={p}>
                                        <td>+{p}%</td>
                                        <td>+{w}</td>
                                        <td>W{(model.typicalWave + w).toLocaleString()}</td>
                                        <td>{c === null ? '—' : pctOf(c)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <p className="en-note">
                        Percentage points of the skip chance you actually get on this tier (after its battle conditions).
                    </p>
                </div>
            </div>

            <div className="section">
                <div className="section-head"><h3>Your runs</h3></div>
                <div className="section-body en-table-wrap">
                    <table className="en-table rc-table">
                        <thead><tr><th>Run</th><th>Ended by</th><th>Enemy health</th></tr></thead>
                        <tbody>
                            {ends.map(e => (
                                <tr key={e.index}>
                                    <td>
                                        {used.has(e.index) ? '• ' : ''}T{e.run.tier} W{e.run.wave.toLocaleString()}
                                        <span className="en-sub">{e.run.date}</span>
                                    </td>
                                    <td>{e.killer === undefined ? <span className="en-dim">—</span> : e.killer ?? 'You (quit)'}</td>
                                    <td>
                                        {e.enemyHealth === null || !e.killer || e.run.tier !== model.tier
                                            ? <span className="en-dim">—</span>
                                            : pctOf(e.enemyHealth / model.limit - 1)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="en-note">
                        &quot;Ended by&quot; is the game&apos;s Killed By (the enemy type that got through). Enemy health is
                        how tough enemies were at the end of the run compared with where your runs usually end.
                    </p>
                </div>
            </div>
        </div>
    );
}
