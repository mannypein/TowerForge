// ============================================================
//  TowerForge Companion — Lab boosts (Labs page)
//  The fastest boosts the player's Elite Cells keep up on every lab
//  slot (engine/labBoosts.ts): cells an hour and hours a day in a run
//  from their runs (or typed over), the even plan, what the spare cells
//  do, the next steps up and how long the cells held keep each going —
//  then how long a lab's next level and the rest of it take at those
//  speeds (research time after Labs Speed and the Lab Speed relic).
// ============================================================

import { useMemo, useState } from 'react';
import { formatGameNumber } from '../../engine/gameNumbers';
import { MAX_LAB_SLOTS, hoursOnHand, labHours } from '../../engine/labBoosts';
import type { BoostSettings, CellIncome, LabBoostPlan } from '../../engine/labBoosts';
import { formatLabTime } from '../../engine/upgradeCosts';
import NumericInput from '../common/NumericInput';
import { CurrencyField } from '../common/CurrencyBar';
import type { LabData, LabProgress, Profile, RelicData } from '../../types/gameTypes';

// Cells as the game writes big numbers, with commas below a million.
const cells = (v: number) => (v < 1e6 ? Math.round(v).toLocaleString() : formatGameNumber(v));

function lastsText(hours: number): string {
    if (hours === Infinity) return 'kept up';
    if (hours < 1) return 'under an hour';
    return hours >= 48 ? `${Math.floor(hours / 24)} days` : `${Math.floor(hours)} h`;
}


export default function LabBoostPanel({ settings, income, plan, profile, cellsHeld, openLabs, defaultLab, labData, labProgress, relicData, onProfile }: {
    settings: BoostSettings;
    income: CellIncome | null;
    plan: LabBoostPlan;
    profile: Profile;
    cellsHeld: number;
    openLabs: string[];           // labs that are open and not maxed
    defaultLab?: string;
    labData: LabData;
    labProgress: LabProgress;
    relicData: RelicData;
    onProfile: (patch: Partial<Profile>) => void;
}) {
    const [picked, setPicked] = useState<string | null>(null);
    const lab = picked && openLabs.includes(picked) ? picked
        : defaultLab && openLabs.includes(defaultLab) ? defaultLab : openLabs[0];
    const hours = useMemo(() => (lab ? labHours(lab, labData, relicData, labProgress) : null), [lab, labData, relicData, labProgress]);
    const { best, spare, higher, part } = plan;
    const speeds = [...new Set([1, ...best.speeds])].sort((a, b) => a - b);
    const typed = profile.cellsPerHour !== undefined || profile.runHoursPerDay !== undefined;

    return (
        <div className="section" style={{ marginBottom: '10px' }}>
            <div className="section-head">
                <h3>Lab boosts — Elite Cells</h3>
                <span className="s-badge">{settings.slots} lab{settings.slots === 1 ? '' : 's'}</span>
            </div>
            <div className="section-body labb">
                <div className="labb-inputs">
                    <label className="labb-field">
                        <span>Cells an hour in a run</span>
                        <CurrencyField label="Cells an hour in a run" value={settings.perRunHour}
                            onCommit={v => onProfile({ cellsPerHour: v })} />
                    </label>
                    <label className="labb-field">
                        <span>Hours a day in a run</span>
                        <NumericInput value={Math.round(settings.hoursPerDay * 10) / 10} min={0} max={24} step={0.5}
                            onChange={v => onProfile({ runHoursPerDay: v })} />
                    </label>
                    <label className="labb-field">
                        <span>Lab slots</span>
                        <NumericInput value={settings.slots} min={1} max={MAX_LAB_SLOTS}
                            onChange={v => onProfile({ labSlots: v })} />
                    </label>
                </div>
                <p className="labb-note">
                    {income
                        ? <>From your {income.runs} run{income.runs === 1 ? '' : 's'} in the last 7 days: {cells(income.perRunHour)} cells
                            an hour in a run, in a run about {Math.round(24 * income.share * 10) / 10} hours a day.</>
                        : <>Import your game data to read these from your runs, or type them in.</>}
                    {typed && income && (
                        <button className="labb-reset" onClick={() => onProfile({ cellsPerHour: undefined, runHoursPerDay: undefined })}>
                            Use my runs
                        </button>
                    )}
                </p>

                <div className="labb-best">
                    <div className="labb-best-head">
                        Best for {cells(settings.budget)} cells an hour
                    </div>
                    <div className="labb-chips">
                        {best.speeds.map((s, i) => (
                            <span key={i} className={`labb-chip${s > 1 ? ' on' : ''}`}>{s > 1 ? `×${s}` : 'none'}</span>
                        ))}
                    </div>
                    <div className="labb-sub">
                        {best.cellsPerHour > 0
                            ? <>{cells(best.cellsPerHour)} cells an hour · {cells(best.cellsPerHour * 24)} a day</>
                            : <>Not enough cells yet for ×1.5 on a lab (15 an hour).</>}
                        {spare >= 1 && best.cellsPerHour > 0 && <> · {cells(spare)} spare</>}
                    </div>
                    {part && (
                        <div className="labb-sub">
                            The spare runs one more lab at ×{part.speed} about {Math.floor(part.hoursPerDay)} hours a day.
                        </div>
                    )}
                </div>

                {higher.length > 0 && (
                    <table className="labb-table">
                        <thead>
                            <tr><th>Higher</th><th>Cells an hour</th><th>{cellsHeld > 0 ? `Your ${cells(cellsHeld)} cells last` : 'Short by'}</th></tr>
                        </thead>
                        <tbody>
                            {higher.map(h => (
                                <tr key={h.cellsPerHour}>
                                    <td className="labb-speeds">{h.speeds.map(s => (s > 1 ? `×${s}` : '—')).join(' ')}</td>
                                    <td>{cells(h.cellsPerHour)}</td>
                                    <td>
                                        {cellsHeld > 0
                                            ? lastsText(hoursOnHand(h.cellsPerHour, settings.budget, cellsHeld))
                                            : `${cells(h.cellsPerHour - settings.budget)} an hour`}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                <p className="labb-note">
                    Raising every lab evenly gets the most research for the cells: each step up costs more per unit of
                    speed than the one below it (wiki Lab Upgrades). Boosts are bought for 1, 8 or 24 hours and only run
                    while a lab is researching
                    {best.cellsPerHour > 0 && <> — 24-hour boosts on every lab take {cells(best.cellsPerHour * 24)} cells
                        at once{cellsHeld > 0 ? ` (you have ${cells(cellsHeld)})` : ''}</>}.
                </p>

                {lab && hours && (
                    <div className="labb-time">
                        <div className="labb-best-head">How long a lab takes</div>
                        <select value={lab} onChange={e => setPicked(e.target.value)} aria-label="Lab">
                            {openLabs.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <table className="labb-table">
                            <thead>
                                <tr><th />{speeds.map(s => <th key={s}>{s > 1 ? `×${s}` : 'No boost'}</th>)}</tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>Lv {hours.cur} → {hours.cur + 1}{hours.done > 0 && ` (${Math.floor(hours.done * 100)}% done)`}</td>
                                    {speeds.map(s => <td key={s}>{hours.next !== null ? formatLabTime(hours.next / s) : '—'}</td>)}
                                </tr>
                                {hours.max > hours.cur + 1 && (
                                    <tr>
                                        <td>To max (Lv {hours.max})</td>
                                        {speeds.map(s => <td key={s}>{hours.toMax !== null ? formatLabTime(hours.toMax / s) : '—'}</td>)}
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        <p className="labb-note">After your Labs Speed lab and Lab Speed relic, with the boost kept up the whole time.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
