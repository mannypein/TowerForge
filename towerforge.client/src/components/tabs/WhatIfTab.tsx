// ============================================================
//  TowerForge Companion — What If Tab
//  Try changes on a copy of the account — any UW, UW+, workshop, lab,
//  enhancement, module slot or bot level — and see what they do to all
//  damage, waves reached, coins per hour, coins per run and survival,
//  and what they cost (engine/whatIf.ts). Nothing is saved.
// ============================================================

import { useMemo, useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import type { BuildType, OptCurrency } from '../../types/gameTypes';
import { chosenReport, runModels, snapshotFromState } from '../../engine/accountModels';
import type { AccountState } from '../../engine/accountModels';
import { changeCost, upgradeTargets, whatIf } from '../../engine/whatIf';
import type { ChainLink, Change, Costs } from '../../engine/whatIf';
import { formatGameNumber } from '../../engine/gameNumbers';
import { formatLabTime } from '../../engine/upgradeCosts';
import { MEDAL_SYMBOL } from '../../constants/gameData';

const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`;

const wavesText = (w: number) => {
    const n = Math.abs(w) < 10 ? Math.abs(w).toFixed(1) : Math.round(Math.abs(w)).toLocaleString();
    return `${w < 0 ? '−' : '+'}${n} waves`;
};

const CHAIN_GROUPS: ChainLink['group'][] = ['Enemies in range', 'Tower', 'Damage to each enemy', 'Level skip', 'Coin bonuses'];

// A link as "before → after (change)"; relative ones (×) as a % change.
function linkText(l: ChainLink): string {
    const change = l.before !== 0 ? pct((l.after / l.before - 1) * 100) : '';
    switch (l.kind) {
        case 'seconds': return `${l.before.toFixed(2)}s → ${l.after.toFixed(2)}s (${change})`;
        case 'meters': return `${l.before.toFixed(1)}m → ${l.after.toFixed(1)}m (${change})`;
        case 'percent': return `${l.before.toFixed(1)}% → ${l.after.toFixed(1)}%`;
        case 'perSecond': return `${l.before.toFixed(2)}/s → ${l.after.toFixed(2)}/s (${change})`;
        case 'count': return `${l.before.toFixed(2)} → ${l.after.toFixed(2)}`;
        case 'points': return `${l.before.toFixed(2)} → ${l.after.toFixed(2)} points`;
        case 'times': return l.before === 1 ? change : `×${l.before.toFixed(3)} → ×${l.after.toFixed(3)} (${change})`;
    }
}

const COST_LABEL: [OptCurrency, string, (v: number) => string][] = [
    ['coins', 'Coins', v => `${formatGameNumber(v < 1000 ? Math.round(v) : v)} 🪙`],
    ['stones', 'Power Stones', v => `${v.toLocaleString()} Power Stones`],
    ['research', 'Lab time', v => `${formatLabTime(v)} 🔬`],
    ['medals', 'Medals', v => `${v.toLocaleString()} ${MEDAL_SYMBOL}`],
    ['shards', 'Module Shards', v => `${formatGameNumber(Math.round(v))} shards`],
];

function CostLine({ costs }: { costs: Costs }) {
    const parts = COST_LABEL.filter(([k]) => (costs[k] ?? 0) > 0).map(([k, , fmt]) => fmt(costs[k]!));
    return <>{parts.length ? parts.join(' · ') : 'Free'}</>;
}

export default function WhatIfTab() {
    const activePreset = useGameStore(s => s.activePreset);
    const profile = useGameStore(s => s.profile);
    const perkData = useGameStore(s => s.perkData);
    const wsData = useGameStore(s => s.wsData);
    const enhData = useGameStore(s => s.enhData);
    const labData = useGameStore(s => s.labData);
    const cardData = useGameStore(s => s.cardData);
    const uwData = useGameStore(s => s.uwData);
    const relicData = useGameStore(s => s.relicData);
    const botData = useGameStore(s => s.botData);
    const moduleState = useGameStore(s => s.moduleState);
    const battleReportText = useGameStore(s => s.battleReportText);
    const importedBattles = useGameStore(s => s.importedBattles);
    const battleReportChoice = useGameStore(s => s.battleReportChoice);

    const account: AccountState = useMemo(() => ({
        activePreset, profile, perkData, wsData, enhData, labData, cardData, uwData, relicData, botData,
        moduleState, battleReportText, importedBattles, battleReportChoice,
    }), [activePreset, profile, perkData, wsData, enhData, labData, cardData, uwData, relicData, botData,
        moduleState, battleReportText, importedBattles, battleReportChoice]);

    const build = (profile.build || 'Glass Cannon') as BuildType;
    const base = useMemo(() => snapshotFromState(account), [account]);
    const targets = useMemo(() => upgradeTargets(base), [base]);
    const models = useMemo(() => runModels(account), [account]);
    const groups = useMemo(() => [...new Set(targets.map(t => t.group))], [targets]);

    const [group, setGroup] = useState<string>('');
    const [pick, setPick] = useState<string>('');
    const [level, setLevel] = useState<string>('');
    const [changes, setChanges] = useState<Change[]>([]);

    const activeGroup = groups.includes(group) ? group : groups[0] ?? '';
    const inGroup = targets.filter(t => t.group === activeGroup);
    const target = inGroup.find(t => `${t.kind}:${t.key}` === pick) ?? inGroup[0];
    const wanted = Number(level);
    const validLevel = target && level !== '' && Number.isInteger(wanted) && wanted >= 0 && wanted <= target.max;

    const result = useMemo(
        () => (changes.length ? whatIf(base, changes, targets, build, chosenReport(account), models) : null),
        [base, changes, targets, build, account, models],
    );

    const own = (c: Change) => result?.perChange.find(x => x.kind === c.kind && x.key === c.key)?.waves;

    function add() {
        if (!target || !validLevel) return;
        setChanges(cs => [...cs.filter(c => !(c.kind === target.kind && c.key === target.key)),
            { kind: target.kind, key: target.key, level: wanted }]);
        setLevel('');
    }

    const gc = build === 'Glass Cannon';

    return (
        <div>
            <div className="relics-note">
                <strong>What if I…?</strong> Pick any upgrade and a level, add as many as you like, and see what
                they do to your damage, how far your runs get, your coins and your survival — and what they
                cost. Scores are calibrated on your chosen Battle Report (Optimizer page); waves and coins per run
                come from Run Length and Coins per Run. Nothing here changes your saved account.
            </div>

            <div className="section" style={{ marginBottom: '12px' }}>
                <div className="section-head"><h3>Change</h3></div>
                <div className="section-body">
                    <div className="wi-picker">
                        <select value={activeGroup} onChange={e => { setGroup(e.target.value); setPick(''); }}>
                            {groups.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <select
                            value={target ? `${target.kind}:${target.key}` : ''}
                            onChange={e => { setPick(e.target.value); setLevel(''); }}
                        >
                            {inGroup.map(t => (
                                <option key={`${t.kind}:${t.key}`} value={`${t.kind}:${t.key}`}>
                                    {t.label} (Lv {t.current}/{t.max})
                                </option>
                            ))}
                        </select>
                        {target && (
                            <div className="wi-level">
                                <input
                                    type="number" min={0} max={target.max} inputMode="numeric"
                                    placeholder={`Lv ${target.current}`} value={level}
                                    onChange={e => setLevel(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') add(); }}
                                    aria-label="New level"
                                />
                                <button className="btn btn-dim" onClick={() => setLevel(String(Math.min(target.max, target.current + 1)))}>+1</button>
                                <button className="btn btn-dim" onClick={() => setLevel(String(Math.min(target.max, target.current + 10)))}>+10</button>
                                <button className="btn btn-dim" onClick={() => setLevel(String(target.max))}>Max</button>
                                <button className="btn btn-accent" onClick={add} disabled={!validLevel}>Add</button>
                            </div>
                        )}
                    </div>
                    {target && validLevel && wanted > target.current && (
                        <p className="wi-hint">
                            Lv {target.current} → {wanted}: <CostLine costs={changeCost(base, target, wanted)} />
                        </p>
                    )}

                    {changes.length > 0 && (
                        <div className="wi-list">
                            {changes.map(c => {
                                const t = targets.find(x => x.kind === c.kind && x.key === c.key);
                                if (!t) return null;
                                return (
                                    <div key={`${c.kind}:${c.key}`} className="wi-item">
                                        <span className="wi-item-name">{t.label}</span>
                                        <span className="wi-item-lv">
                                            Lv {t.current} → {c.level}
                                            {own(c) !== undefined && <span className="wi-item-waves">{wavesText(own(c)!)}</span>}
                                        </span>
                                        <button
                                            className="btn btn-dim wi-remove"
                                            onClick={() => setChanges(cs => cs.filter(x => x !== c))}
                                            aria-label={`Remove ${t.label}`}
                                        >✕</button>
                                    </div>
                                );
                            })}
                            {result && result.perChange.length > 1 && (
                                <p className="wi-hint" style={{ marginTop: 0 }}>
                                    Waves next to each change are what it adds on its own. Together they can add more
                                    or less, as each works on the others.
                                </p>
                            )}
                            <button className="btn btn-dim" onClick={() => setChanges([])}>Clear all</button>
                        </div>
                    )}
                </div>
            </div>

            {result && (
                <div className="section">
                    <div className="section-head"><h3>What happens</h3></div>
                    <div className="section-body">
                        <div className="wi-results">
                            <span className="wi-k">All damage (eDPS)</span>
                            <span className="wi-v">{pct(result.damagePct)}</span>
                            {gc && (<>
                                <span className="wi-k" title="Flat damage, with Enemy Health Level Skip counted as the damage that gains the same waves">
                                    Push (flat damage + skip)
                                </span>
                                <span className="wi-v">{pct(result.pushPct)}</span>
                            </>)}
                            {result.skipPoints !== 0 && (<>
                                <span className="wi-k">Enemy Health Level Skip</span>
                                <span className="wi-v">{result.skipPoints > 0 ? '+' : ''}{result.skipPoints.toFixed(2)} points</span>
                            </>)}
                            {result.waves && (<>
                                <span className="wi-k wi-strong">Waves gained</span>
                                <span className="wi-v wi-strong">
                                    {wavesText(result.waves.to - result.waves.from)}
                                </span>
                                {result.spread && (<>
                                    <span className="wi-k" title="Each of your recent deaths moved on its own: how much the gain changes from run to run">
                                        From run to run
                                    </span>
                                    <span className="wi-v">
                                        {wavesText(result.spread.min).replace(' waves', '')} to {wavesText(result.spread.max)}
                                    </span>
                                </>)}
                                <span className="wi-k">Waves reached</span>
                                <span className="wi-v">
                                    {result.waves.from.toLocaleString()} → {result.waves.to.toLocaleString()}
                                    {' '}({result.waves.to >= result.waves.from ? '+' : ''}{(result.waves.to - result.waves.from).toLocaleString()})
                                </span>
                            </>)}
                            {result.coinsRun && (<>
                                <span className="wi-k">Coins per run</span>
                                <span className="wi-v">
                                    {formatGameNumber(result.coinsRun.from)} → {formatGameNumber(result.coinsRun.to)}
                                    {' '}({pct((result.coinsRun.to / result.coinsRun.from - 1) * 100)})
                                </span>
                            </>)}
                            {result.coinsHour && (<>
                                <span className="wi-k" title="Playing each run to its end: the extra waves pay more than the early ones">
                                    Coins per hour
                                </span>
                                <span className="wi-v">
                                    {formatGameNumber(result.coinsHour.from)} → {formatGameNumber(result.coinsHour.to)}
                                    {' '}({pct((result.coinsHour.to / result.coinsHour.from - 1) * 100)})
                                </span>
                            </>)}
                            <span className="wi-k" title="Coin bonuses only: what the same waves would pay">
                                Coin income at the same wave
                            </span>
                            <span className="wi-v">{pct(result.coinsHourPct)}</span>
                            {result.survivalPct !== null && (<>
                                <span className="wi-k">Survival (eHP)</span>
                                <span className="wi-v">{pct(result.survivalPct)}</span>
                            </>)}
                            <span className="wi-k">Cost</span>
                            <span className="wi-v"><CostLine costs={result.costs} /></span>
                        </div>
                        {result.spread && (
                            <p className="wi-hint">
                                Your last {result.spread.runs} deaths ended between W{result.spread.endedMin.toLocaleString()} and
                                W{result.spread.endedMax.toLocaleString()} — runs already vary by{' '}
                                {(result.spread.endedMax - result.spread.endedMin).toLocaleString()} waves, so a gain smaller than
                                that shows over several runs, not one.
                            </p>
                        )}
                        {gc && !models.run && (
                            <p className="wi-hint">
                                Waves and coins per run need runs that ended in a death — use Import Game Data.
                            </p>
                        )}
                        <p className="wi-hint">
                            Coins per run and per hour include the longer run; income at the same wave is the coin
                            bonuses alone. Waves far past where your runs end now are rough.
                        </p>
                    </div>
                </div>
            )}

            {result && result.chain.length > 0 && (
                <div className="section" style={{ marginTop: '12px' }}>
                    <div className="section-head"><h3>How it adds up</h3></div>
                    <div className="section-body">
                        <p className="wi-hint" style={{ marginTop: 0 }}>
                            Everything that moved on the way. An upgrade that deals no damage itself — Chrono
                            Field, Chrono Loop (CF+), range — works by keeping enemies in range longer, so every
                            source gets more time on each enemy; Multishot, Bounce Shot and Rapid Fire give Chain
                            Lightning more hits to proc on. The percentage after a source is its share of your
                            run&apos;s damage; the waves after it are its part of the waves gained.
                        </p>
                        {CHAIN_GROUPS.filter(g => result.chain.some(l => l.group === g)).map(g => (
                            <div key={g} className="wi-chain">
                                <div className="wi-chain-head">{g}</div>
                                {result.chain.filter(l => l.group === g).map(l => (
                                    <div key={l.label} className="wi-chain-row">
                                        <span className="wi-k">
                                            {l.label}
                                            {l.share !== undefined && <span className="wi-share"> {(l.share * 100).toFixed(1)}%</span>}
                                        </span>
                                        <span className="wi-v">
                                            {linkText(l)}
                                            {l.waves !== undefined && Math.abs(l.waves) >= 0.05 && (
                                                <span className="wi-link-waves">≈ {wavesText(l.waves)}</span>
                                            )}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
