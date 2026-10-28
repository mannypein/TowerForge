// ============================================================
//  TowerForge Companion — UW Panel
//  An Ultimate Weapon drawn like the game's UW screen: its name on a
//  bar, its glowing picture, a box per stat with the value and, under
//  it, the next level's stone cost (or Max, the box gold), and its UW+
//  along the bottom. On the UW page each box is a level picker (tap it)
//  and the UW+ row unlocks and levels it; read-only in share images.
//  The SL Angle stops at 60° (more adds nothing). Styles: .uwg in
//  tabs.css.
// ============================================================

import { UWS, UW_PLUS_DATA, UW_STONE_COSTS, uwStatValues } from '../../constants/gameData';
import { uwIcon } from '../../constants/gameIcons';
import type { UWStat } from '../../types/gameTypes';
import stoneIcon from '../../assets/stone.png';

type UWDef = typeof UWS[number];

export interface UWPanelEdit {
    onStat: (statIdx: number, level: number) => void;
    onOwned: (owned: boolean) => void;
    onPlus: (level: number) => void;     // -1 = locked, 0 = Lv 1 …
}

function Cost({ value }: { value: number | null | undefined }) {
    if (value === null || value === undefined) return <>—</>;
    return <>{value.toLocaleString()}<img src={stoneIcon} alt="stones" className="uwg-stone" /></>;
}

export default function UWPanel({ uw, data, showPlus, plusUnlockCost, unlockCost, effective, edit }: {
    uw: UWDef;
    data?: UWStat;
    showPlus: boolean;                   // UW+ opens once all nine UWs are owned
    plusUnlockCost?: number;
    unlockCost?: number | null;          // stones for this UW when it isn't owned
    effective?: (string | null)[];       // per stat, with module and lab bonuses
    edit?: UWPanelEdit;
}) {
    const a = uw.a;
    const owned = data?.own ?? false;
    const plus = UW_PLUS_DATA[a];
    const upOwn = data?.upOwn ?? false;
    const upLvl = data?.upLvl ?? 0;
    const icon = uwIcon(a);

    return (
        <div className={`uwg ${owned ? '' : 'locked'}`}>
            <div className="uwg-head">
                {uw.n}
                {edit && owned && (
                    <button type="button" className="uwg-own" onClick={() => edit.onOwned(false)} title="Mark as not owned">✓ Owned</button>
                )}
            </div>
            <div className="uwg-body">
                <div className="uwg-icon">{icon ? <img src={icon} alt="" draggable={false} /> : <span>{a}</span>}</div>
                {owned ? (
                    <div className="uwg-stats">
                        {uw.s.map(([name], i) => {
                            const vals = uwStatValues(a, i);
                            const lv = Math.max(1, data?.sv[i] ?? 1);
                            const max = lv >= vals.length;
                            const value = vals[lv - 1] ?? vals[vals.length - 1] ?? '—';
                            const next = max ? null : UW_STONE_COSTS[a]?.[i]?.[lv - 1];
                            return (
                                <label key={name} className={`uwg-stat ${max ? 'max' : ''} ${edit ? 'edit' : ''}`}>
                                    <span className="uwg-stat-name">{name}</span>
                                    <span className="uwg-stat-val">{value}</span>
                                    {effective?.[i] && <span className="uwg-stat-eff">Eff {effective[i]}</span>}
                                    <span className="uwg-stat-cost">{max ? 'Max' : <Cost value={next} />}</span>
                                    {edit && (
                                        <select value={lv} aria-label={`${uw.n} ${name} level`} onChange={e => edit.onStat(i, Number(e.target.value))}>
                                            {vals.map((v, k) => {
                                                const c = k > 0 ? UW_STONE_COSTS[a]?.[i]?.[k - 1] : undefined;
                                                return <option key={k} value={k + 1}>Lv {k + 1} — {v}{c ? ` (${c.toLocaleString()} stones)` : ''}</option>;
                                            })}
                                        </select>
                                    )}
                                </label>
                            );
                        })}
                    </div>
                ) : (
                    <div className="uwg-unlock">
                        {edit ? (
                            <button type="button" className="uwg-unlock-btn" onClick={() => edit.onOwned(true)}>
                                Unlock {unlockCost !== null && unlockCost !== undefined && <span className="uwg-cost-pill"><Cost value={unlockCost} /></span>}
                            </button>
                        ) : (
                            <span className="uwg-dim">Not owned</span>
                        )}
                    </div>
                )}
            </div>
            {owned && plus && (showPlus || upOwn) && (
                <label className={`uwg-plus ${upOwn && upLvl >= uw.upMax ? 'max' : ''} ${edit ? 'edit' : ''}`}>
                    <span className="uwg-plus-name">{plus.name}</span>
                    <span className="uwg-plus-state">
                        {upOwn ? <>Lv {upLvl + 1}/{uw.upMax + 1} · <strong>{plus.vals[upLvl] ?? '—'}</strong></> : 'Unlock'}
                    </span>
                    <span className="uwg-plus-cost">
                        {upOwn ? (upLvl >= uw.upMax ? 'Max' : <Cost value={plus.costs[upLvl]} />) : <Cost value={plusUnlockCost} />}
                    </span>
                    {edit && (
                        <select value={upOwn ? upLvl : -1} aria-label={`${plus.name} level`} onChange={e => edit.onPlus(Number(e.target.value))}>
                            <option value={-1}>Locked{plusUnlockCost ? ` (unlock: ${plusUnlockCost.toLocaleString()} stones)` : ''}</option>
                            {plus.vals.slice(0, uw.upMax + 1).map((v, k) => (
                                <option key={k} value={k}>Lv {k + 1} — {v}{k > 0 && plus.costs[k - 1] ? ` (${plus.costs[k - 1].toLocaleString()} stones)` : ''}</option>
                            ))}
                        </select>
                    )}
                </label>
            )}
        </div>
    );
}
