// ============================================================
//  TowerForge Companion — Vault Tab
//  The game's Vault (Legends league and up): its Harmony, Power and
//  Enemy tabs with every upgrade, what it gives at your level, what
//  the next level and the rest cost in Keys, and which sections are
//  unlocked. Import Game Data fills the levels and unlocks in
//  (Vault.UpgradesLevel / UnlockedGroups); they can be set here too.
//  Data: constants/vaultData.ts; key sums: engine/vault.ts.
// ============================================================

import { useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { VAULT_SECTIONS, VAULT_TREES, VAULT_USED, vaultGroupKey } from '../../constants/vaultData';
import type { VaultSection, VaultTree, VaultUpgrade } from '../../constants/vaultData';
import { sectionUnlocked, vaultKeys, vaultLevel } from '../../engine/vault';
import NumericInput from '../common/NumericInput';

const KEY = '🔑';
const n = (v: number) => v.toLocaleString();
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function UpgradeRow({ u, levels, onLevel }: {
    u: VaultUpgrade;
    levels: Record<string, number>;
    onLevel: (v: number) => void;
}) {
    const lv = vaultLevel(levels, u);
    const max = u.costs.length;
    const single = max === 1;
    const maxed = lv >= max;
    const left = sum(u.costs.slice(lv));
    return (
        <div className={`vlt-row ${lv > 0 ? 'owned' : ''} ${maxed ? 'maxed' : ''}`}>
            <div className="vlt-info">
                <div className="vlt-name">{u.name}</div>
                <div className="vlt-effect">
                    {single ? (
                        lv > 0 ? <strong>{u.effect(1)}</strong> : <span className="vlt-dim">{u.effect(1)}</span>
                    ) : (
                        <>
                            {lv > 0 ? <strong>{u.effect(lv)}</strong> : <span className="vlt-dim">Not bought</span>}
                            {!maxed && <span className="vlt-next"> · next {u.effect(lv + 1)} for {n(u.costs[lv])} {KEY}</span>}
                        </>
                    )}
                </div>
                <div className="vlt-cost">
                    {single ? (lv > 0 ? null : `${n(u.costs[0])} ${KEY}`) : maxed ? 'Maxed' : `${n(left)} ${KEY} to max`}
                    {u.note && <span className="vlt-note">{u.note}</span>}
                    {VAULT_USED[u.id] && <span className="vlt-used">{VAULT_USED[u.id]}</span>}
                </div>
            </div>
            <div className="vlt-level">
                {max > 1 ? (
                    <>
                        <NumericInput value={lv} min={0} max={max} onChange={onLevel} />
                        <span className="vlt-of">/ {max}</span>
                    </>
                ) : (
                    <label className="vlt-check">
                        <input type="checkbox" checked={lv > 0} onChange={e => onLevel(e.target.checked ? 1 : 0)} />
                        Bought
                    </label>
                )}
            </div>
        </div>
    );
}

// A section's head: its name, what it cost or costs to unlock, and the unlock.
function SectionHead({ section, sections, levels, onUnlock }: {
    section: VaultSection;
    sections: VaultSection[];   // the Enemy tab's three enemies share one unlock
    levels: Record<string, number>;
    onUnlock: (on: boolean) => void;
}) {
    const unlocked = sectionUnlocked(levels, section);
    const bought = sections.some(s => s.upgrades.some(u => vaultLevel(levels, u) > 0));
    const upgrades = sections.flatMap(s => s.upgrades);
    const spent = sum(upgrades.map(u => sum(u.costs.slice(0, vaultLevel(levels, u)))));
    const maxed = upgrades.filter(u => vaultLevel(levels, u) >= u.costs.length).length;
    return (
        <div className="section-head vlt-head">
            <h3>{section.name}</h3>
            <span className="s-badge">{maxed} / {upgrades.length} maxed · {n(spent)} {KEY}</span>
            <span className="vlt-spacer" />
            {section.unlock === 0 ? (
                <span className="vlt-open">Open from the start</span>
            ) : (
                <label className="vlt-check" title={bought ? 'Upgrades are bought here, so it is unlocked' : undefined}>
                    <input type="checkbox" checked={unlocked} disabled={bought} onChange={e => onUnlock(e.target.checked)} />
                    {unlocked ? `Unlocked (${section.unlock} ${KEY})` : `Unlock: ${section.unlock} ${KEY}`}
                </label>
            )}
        </div>
    );
}

export default function VaultTab() {
    const levels = useGameStore(s => s.vaultLevels);
    const keys = useGameStore(s => s.currencies.keys);
    const setVaultLevel = useGameStore(s => s.setVaultLevel);
    const [tree, setTree] = useState<VaultTree>('harmony');

    const all = vaultKeys(levels);
    const shown = VAULT_TREES.find(t => t.id === tree)!;
    const treeKeys = vaultKeys(levels, tree);
    const sections = VAULT_SECTIONS.filter(s => s.tree === tree);
    // One panel per section; the Enemy tab's three enemies go together.
    const panels = [...new Set(sections.map(s => s.group))].map(g => sections.filter(s => s.group === g));
    const onLevel = (u: VaultUpgrade) => (v: number) => setVaultLevel(String(u.id), v);

    return (
        <div>
            <div className="relics-note">
                <strong>The Vault</strong> opens in the Legends league: upgrades bought with Keys, which
                Legends and Mythic tournaments give. <em>Import Game Data</em> fills in your levels and the
                sections you&apos;ve unlocked, or set them here. Each section is unlocked once, then each
                upgrade is bought level by level.
            </div>

            <div className="vlt-summary">
                <div className="vlt-stat"><span>Keys</span><strong>{n(keys ?? 0)}</strong></div>
                <div className="vlt-stat"><span>Spent in the Vault</span><strong>{n(all.spent)} {KEY}</strong></div>
                <div className="vlt-stat"><span>Left to max it all</span><strong>{n(all.toMax)} {KEY}</strong></div>
            </div>

            <div className="sub-tab-bar">
                {VAULT_TREES.map(t => (
                    <button key={t.id} className={`sub-tab-btn ${tree === t.id ? 'active' : ''}`} onClick={() => setTree(t.id)}>
                        {t.label}
                    </button>
                ))}
            </div>

            <p className="vlt-about">
                {shown.about} <span className="vlt-dim">{n(treeKeys.spent)} {KEY} spent here, {n(treeKeys.toMax)} {KEY} to max.</span>
            </p>

            {panels.map(group => {
                const first = group[0];
                return (
                    <div key={first.group} className="section vlt-section">
                        <SectionHead section={first} sections={group} levels={levels}
                            onUnlock={on => setVaultLevel(vaultGroupKey(first.group), on ? 1 : 0)} />
                        <div className="section-body">
                            {group.map(s => (
                                <div key={`${s.group}-${s.enemy ?? s.name}`} className="vlt-enemy">
                                    {s.enemy && <div className="vlt-enemy-name">{s.enemy}</div>}
                                    {s.upgrades.map(u => <UpgradeRow key={u.id} u={u} levels={levels} onLevel={onLevel(u)} />)}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
