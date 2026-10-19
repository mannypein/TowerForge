// ============================================================
//  TowerForge Companion — Guardian Tab
//  The Guardian (Guild → Guardian) and its chips: which Guardian
//  preset this site preset uses, its slots and equipped chips, each
//  stat's level, next cost and Bits to max, and what each chip does in
//  the models (engine/guardian.ts). Filled by Import Game Data; every
//  value can be set by hand.
// ============================================================

import { useMemo } from 'react';
import { useGameStore } from '../../store/useGameStore';
import type { GuardianData, GuardianPreset } from '../../types/gameTypes';
import { GUARDIAN_MAX_SLOTS, RELEASED_CHIPS, SKIN_COIN_BONUS, statBits } from '../../constants/guardianData';
import type { ChipDef } from '../../constants/guardianData';
import {
    activeChips, bountyExtra, damageMeterFactor, fetchRate, guardianPreset, summonExtra, withChipLevel,
} from '../../engine/guardian';
import { calcDamageMeter } from '../../engine/towerDamage';
import { calcTowerRange } from '../../engine/ttt';
import { runRatesFrom } from '../../engine/runRates';
import { activeBattleReport, rawField } from '../../engine/battleReport';

const fmtX = (v: number) => `×${v < 10 ? v.toFixed(2) : v.toFixed(1)}`;
const pctText = (v: number) => `+${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

// Loot the Guardian fetched in a run, by the battle report's own fields.
const FETCH_FIELDS: [string, string[]][] = [
    ['Gems', ['guardian', 'gems']], ['Medals', ['guardian', 'medals']], ['Reroll Shards', ['guardian', 'reroll']],
    ['Cannon Shards', ['guardian', 'cannon']], ['Armor Shards', ['guardian', 'armor']],
    ['Generator Shards', ['guardian', 'generator']], ['Core Shards', ['guardian', 'core']],
    ['Common Modules', ['guardian', 'common']], ['Rare Modules', ['guardian', 'rare']],
];

export default function GuardianTab() {
    const g = useGameStore(s => s.guardianData);
    const setGuardianData = useGameStore(s => s.setGuardianData);
    const activePreset = useGameStore(s => s.activePreset);
    const wsData = useGameStore(s => s.wsData);
    const labData = useGameStore(s => s.labData);
    const enhData = useGameStore(s => s.enhData);
    const relicData = useGameStore(s => s.relicData);
    const cardData = useGameStore(s => s.cardData);
    const bits = useGameStore(s => s.currencies.bits);
    const battleReportText = useGameStore(s => s.battleReportText);
    const importedBattles = useGameStore(s => s.importedBattles);
    const battleReportChoice = useGameStore(s => s.battleReportChoice);

    const report = useMemo(
        () => activeBattleReport(battleReportText, importedBattles, battleReportChoice),
        [battleReportText, importedBattles, battleReportChoice],
    );
    const killsPerSec = runRatesFrom(report).killsPerSec;
    const dpm = calcDamageMeter(activePreset, wsData, labData, enhData, relicData);
    const range = calcTowerRange(activePreset, wsData, labData, cardData);

    const presetIdx = Math.min(Math.max(0, g.presetFor[activePreset] ?? 0), g.presets.length - 1);
    const preset = guardianPreset(g, activePreset);
    const chips = activeChips(g, activePreset);

    const update = (patch: Partial<GuardianData>) => setGuardianData(patch);
    const updatePreset = (fn: (p: GuardianPreset) => GuardianPreset) =>
        update({ presets: g.presets.map((p, i) => (i === presetIdx ? fn(p) : p)) });

    // What a chip does in the models, at its current levels.
    function effect(chip: ChipDef): string {
        switch (chip.id) {
            case 'scout': {
                const without = damageMeterFactor({ ...g, unlocked: false }, activePreset, dpm, range);
                const withIt = damageMeterFactor(g, activePreset, dpm, range);
                return dpm > 0
                    ? `Tower shots ${fmtX(withIt / without)} on average through Damage/Meter (${fmtX(without)} → ${fmtX(withIt)}).`
                    : 'Works through Damage/Meter, which is 0 on this preset — no effect.';
            }
            case 'bounty':
                return `${pctText(bountyExtra(g, activePreset, killsPerSec))} kill coins (tagged non-Common enemies × its Multiplier).`;
            case 'summon':
                return `${pctText(summonExtra(g, activePreset, killsPerSec))} kills, and their coins. Its Cash Bonus is in-run cash, not counted.`;
            case 'fetch':
                return `${(3600 * fetchRate(g, activePreset)).toFixed(1)} finds per hour of game time; its coins and loot scale with that.`;
            case 'attack':
                return 'Not counted: it deals a share of the health an enemy has already lost, so it doesn’t move the damage that decides how far a run gets.';
            case 'ally':
                return 'Not counted: how its Max Recovery combines with the usual overheal cap isn’t confirmed.';
            default:
                return '';
        }
    }

    const fetched = report ? FETCH_FIELDS
        .map(([label, words]) => [label, rawField(report, words)] as [string, number | null])
        .filter(([, v]) => (v ?? 0) > 0) : [];
    const hours = report && report.realTimeSec > 0 ? report.realTimeSec / 3600 : 0;

    const toMax = chips.reduce((sum, a) => sum + a.chip.stats.reduce((t, st, k) => t + statBits(st, a.levels[k], st.max), 0), 0);

    return (
        <div>
            <div className="relics-note">
                <strong>The Guardian</strong> (Guild → Guardian) fights next to the tower with its equipped chips; each
                chip has three stats bought with Bits. Import Game Data fills this in from the game, by your presets.
                What each chip does here: <em>Scout</em> boosts tower shots through Damage/Meter, <em>Bounty</em> and{' '}
                <em>Summon</em> add coins, <em>Fetch</em> finds loot — the Optimizer ranks their upgrades per Bit.
            </div>

            <div className="section" style={{ marginBottom: '12px' }}>
                <div className="section-head"><h3>Guardian</h3></div>
                <div className="section-body grd-settings">
                    <label className="grd-check">
                        <input type="checkbox" checked={g.unlocked} onChange={e => update({ unlocked: e.target.checked })} />
                        Guardian unlocked
                    </label>
                    {g.unlocked && (
                        <>
                            <label className="grd-field">
                                Guardian preset for site preset {activePreset + 1}
                                <select
                                    value={presetIdx}
                                    onChange={e => update({ presetFor: g.presetFor.map((v, i) => (i === activePreset ? Number(e.target.value) : v)) })}
                                >
                                    {g.presets.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
                                </select>
                            </label>
                            <label className="grd-field">
                                Chip slots
                                <select
                                    value={1 + (preset?.extraSlots ?? 0)}
                                    onChange={e => updatePreset(p => ({ ...p, extraSlots: Number(e.target.value) - 1 }))}
                                >
                                    {Array.from({ length: GUARDIAN_MAX_SLOTS }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                                </select>
                            </label>
                            <label className="grd-field">
                                Skins owned
                                <input
                                    type="number" min={1} max={40} value={g.skinsOwned}
                                    onChange={e => update({ skinsOwned: Math.max(1, Math.min(40, Number(e.target.value) || 1)) })}
                                />
                                <span className="en-sub">{pctText(SKIN_COIN_BONUS * g.skinsOwned)} coins, always on</span>
                            </label>
                        </>
                    )}
                </div>
            </div>

            {g.unlocked && preset && (
                <div className="section" style={{ marginBottom: '12px' }}>
                    <div className="section-head">
                        <h3>Equipped chips</h3>
                        <span className="s-badge">{bits.toLocaleString()} Bits</span>
                    </div>
                    <div className="section-body">
                        <div className="grd-slots">
                            {Array.from({ length: 1 + preset.extraSlots }, (_, slot) => (
                                <label key={slot} className="grd-field">
                                    Slot {slot + 1}
                                    <select
                                        value={preset.chips[slot] ?? -1}
                                        onChange={e => updatePreset(p => {
                                            const next = [...p.chips];
                                            const v = Number(e.target.value);
                                            // A chip sits in one slot only.
                                            for (let i = 0; i < next.length; i++) if (next[i] === v) next[i] = -1;
                                            next[slot] = v;
                                            return { ...p, chips: next };
                                        })}
                                    >
                                        <option value={-1}>Empty</option>
                                        {RELEASED_CHIPS.filter(c => g.chipsOwned[c.index]).map(c => (
                                            <option key={c.id} value={c.index}>{c.name}</option>
                                        ))}
                                    </select>
                                </label>
                            ))}
                        </div>

                        {chips.length === 0 && <p className="en-note">No chip equipped in this Guardian preset.</p>}
                        <div className="grd-chips">
                            {chips.map(a => (
                                <div key={a.chip.id} className="grd-chip">
                                    <div className="grd-chip-head">{a.chip.name}</div>
                                    <div className="en-sub">{a.chip.text}</div>
                                    {a.chip.stats.map((st, k) => {
                                        const lv = a.levels[k];
                                        const maxed = lv >= st.max;
                                        return (
                                            <div key={st.name + k} className="grd-stat">
                                                <span className="grd-stat-name">{st.name}</span>
                                                <input
                                                    type="number" min={0} max={st.max} value={lv}
                                                    aria-label={`${a.chip.name} ${st.name} level`}
                                                    onChange={e => setGuardianData(withChipLevel(g, activePreset, a.chip.index, k, Number(e.target.value) || 0))}
                                                />
                                                <span className="grd-stat-val">
                                                    {st.fmt(st.value(lv))}
                                                    <span className="en-sub">
                                                        {maxed ? 'max' : `next ${st.fmt(st.value(lv + 1))} · ${st.cost(lv + 1)} bits · ${statBits(st, lv, st.max).toLocaleString()} to max`}
                                                    </span>
                                                </span>
                                            </div>
                                        );
                                    })}
                                    <p className="grd-effect">{effect(a.chip)}</p>
                                </div>
                            ))}
                        </div>
                        {toMax > 0 && (
                            <p className="en-note">
                                {toMax.toLocaleString()} Bits to max every equipped chip. The Optimizer&apos;s Bits panel ranks
                                which stat to buy next for your goal.
                            </p>
                        )}
                        {fetched.length > 0 && (
                            <p className="en-note">
                                Fetch in your chosen run: {fetched.map(([label, v]) =>
                                    `${Math.round(v!).toLocaleString()} ${label}${hours > 0 ? ` (${(v! / hours).toFixed(1)}/h)` : ''}`).join(' · ')}.
                            </p>
                        )}
                    </div>
                </div>
            )}

            {g.unlocked && (
                <div className="section">
                    <div className="section-head"><h3>Chips owned</h3></div>
                    <div className="section-body grd-owned">
                        {RELEASED_CHIPS.map(c => (
                            <label key={c.id} className="grd-check">
                                <input
                                    type="checkbox"
                                    checked={!!g.chipsOwned[c.index]}
                                    onChange={e => update({ chipsOwned: g.chipsOwned.map((v, i) => (i === c.index ? e.target.checked : v)) })}
                                />
                                {c.name}
                            </label>
                        ))}
                        <p className="en-note" style={{ flexBasis: '100%' }}>
                            Attack and Ally come with the Guardian; the others are bought in the Guild Store with Tokens.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
