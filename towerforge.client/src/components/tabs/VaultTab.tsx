// ============================================================
//  TowerForge Companion — Vault Tab
//  The game's Vault (Legends league and up), drawn like its Vault
//  screen: Harmony, Power and Enemy tabs, each section's upgrades as the
//  game's rows (VaultRow) — what each gives, MAX / Lv. 1/4 / 1 Level —
//  with what the next level and the rest cost in Keys, − / + to set a
//  level, and each section's unlock. Import Game Data fills the levels
//  and unlocks in (Vault.UpgradesLevel / UnlockedGroups).
//  Data: constants/vaultData.ts; key sums: engine/vault.ts.
// ============================================================

import { useRef, useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { VAULT_SECTIONS, VAULT_TREES, VAULT_USED, vaultGroupKey } from '../../constants/vaultData';
import type { VaultSection, VaultTree } from '../../constants/vaultData';
import { sectionUnlocked, vaultKeys, vaultLevel } from '../../engine/vault';
import VaultRow from '../common/VaultRow';
import VaultShareCard from '../share/VaultShareCard';
import { SHARE_OFFSCREEN_STYLE } from '../share/shareTheme';
import { openExportDialog } from '../share/exportImages';

const KEY = '🔑';
const n = (v: number) => v.toLocaleString();
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// A section's head: its name, what's maxed and spent, and its unlock.
function SectionHead({ section, sections, levels, onUnlock }: {
    section: VaultSection;
    sections: VaultSection[];   // the Enemy tab's three enemies share one unlock
    levels: Record<string, number>;
    onUnlock: (on: boolean) => void;
}) {
    const unlocked = sectionUnlocked(levels, section);
    const upgrades = sections.flatMap(s => s.upgrades);
    const bought = upgrades.some(u => vaultLevel(levels, u) > 0);
    const spent = sum(upgrades.map(u => sum(u.costs.slice(0, vaultLevel(levels, u)))));
    const maxed = upgrades.filter(u => vaultLevel(levels, u) >= u.costs.length).length;
    return (
        <div className="vltg-head">
            <h3>{section.name}</h3>
            <span className="vltg-head-sub">{maxed}/{upgrades.length} max · {n(spent)} {KEY}</span>
            <span className="vltg-spacer" />
            {section.unlock === 0 ? (
                <span className="vltg-head-sub">Open from the start</span>
            ) : (
                <label className="vltg-unlock" title={bought ? 'Upgrades are bought here, so it is unlocked' : undefined}>
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

    const shareRef = useRef<HTMLDivElement>(null);
    const [sharePages, setSharePages] = useState(1);

    return (
        <div>
            <div style={SHARE_OFFSCREEN_STYLE} aria-hidden="true">
                <VaultShareCard ref={shareRef} poster onPages={setSharePages} />
            </div>

            <div className="relics-note">
                <strong>The Vault</strong> opens in the Legends league: upgrades bought with Keys, which
                Legends and Mythic tournaments give. <em>Import Game Data</em> fills in your levels and the
                sections you&apos;ve unlocked, or set them here with − and +.
            </div>

            <div className="vlt-summary">
                <div className="vlt-stat"><span>Keys</span><strong>{n(keys ?? 0)}</strong></div>
                <div className="vlt-stat"><span>Spent in the Vault</span><strong>{n(all.spent)} {KEY}</strong></div>
                <div className="vlt-stat"><span>Left to max it all</span><strong>{n(all.toMax)} {KEY}</strong></div>
                <span style={{ flex: 1 }} />
                <button className="btn btn-accent" onClick={() => openExportDialog(shareRef.current, 'towerforge-vault', 'Vault')}
                    title={sharePages > 1 ? 'Saves your Vault as one image per page, sized for a Reddit post' : undefined}>
                    📸 {sharePages > 1 ? `Export ${sharePages} Images` : 'Export Image'}
                </button>
            </div>

            <div className="vltg-tabs" role="tablist">
                {VAULT_TREES.map(t => (
                    <button key={t.id} role="tab" aria-selected={tree === t.id} className={`vltg-tab ${tree === t.id ? 'active' : ''}`}
                        onClick={() => setTree(t.id)}>
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="vltg-panel">
                <p className="vltg-about">
                    {shown.about} <span className="vltg-dim">{n(treeKeys.spent)} {KEY} spent here, {n(treeKeys.toMax)} {KEY} to max.</span>
                </p>

                {panels.map(group => {
                    const first = group[0];
                    return (
                        <div key={first.group} className="vltg-section">
                            <SectionHead section={first} sections={group} levels={levels}
                                onUnlock={on => setVaultLevel(vaultGroupKey(first.group), on ? 1 : 0)} />
                            {group.map(s => (
                                <div key={`${s.group}-${s.enemy ?? s.name}`}>
                                    {s.enemy && <div className="vltg-enemy">{s.enemy}</div>}
                                    <div className="vltg-rows">
                                        {s.upgrades.map(u => (
                                            <VaultRow key={u.id} u={u} level={vaultLevel(levels, u)} fallback={s.enemy?.[0]}
                                                used={VAULT_USED[u.id]} onLevel={v => setVaultLevel(String(u.id), v)} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
