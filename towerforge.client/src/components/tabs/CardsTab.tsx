// ============================================================
//  TowerForge Companion — Cards Tab
//  Like the game's card screen: the preset's Active cards on top, then
//  the Inventory, each card drawn like the game's (GameCard). Tapping a
//  card opens it — its level and value, mastery, and equipping it in
//  the preset. Card slots, Max / Clear and Export Image sit above.
// ============================================================

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGameStore } from '../../store/useGameStore';
import { CARDS, CARD_MASTERY_VALS, presetLabel } from '../../constants/gameData';
import NumericInput from '../common/NumericInput';
import GameCard from '../common/GameCard';
import { milestoneReached } from '../../engine/statHelpers';
import { vaultCardSlots } from '../../engine/vault';
import CardsShareCard from '../share/CardsShareCard';
import { SHARE_OFFSCREEN_STYLE } from '../share/shareTheme';
import { openExportDialog } from '../share/exportImages';

const RARITY_LABELS = ['Common', 'Rare', 'Epic'];

export default function CardsTab() {
    const [open, setOpen] = useState<string | null>(null);
    const profile = useGameStore(s => s.profile);
    const tierWaves = useGameStore(s => s.tierWaves);
    const activePreset = useGameStore(s => s.activePreset);
    const setActivePreset = useGameStore(s => s.setActivePreset);
    const cardData = useGameStore(s => s.cardData);
    const vaultSlots = vaultCardSlots(useGameStore(s => s.vaultLevels));
    const setCardStars = useGameStore(s => s.setCardStars);
    const setCardMastery = useGameStore(s => s.setCardMastery);
    const setCardMasteryUnlocked = useGameStore(s => s.setCardMasteryUnlocked);
    const setCardSlots = useGameStore(s => s.setCardSlots);
    const setCardPreset = useGameStore(s => s.setCardPreset);

    const presetCount = profile.presets || 2;
    const slots = cardData.slots ?? 1;
    const active = (cardData.presets[activePreset] ?? []).filter(n => (cardData.data[n]?.s ?? 0) > 0);

    // A card unlocks at its Tier / Wave milestone (same rule as labs).
    const unlocked = CARDS.filter(([, , lockTier, lockWave]) =>
        milestoneReached(lockTier, lockWave, profile.completedTier || 0, tierWaves));
    const owned = CARDS.filter(([n]) => (cardData.data[n]?.s ?? 0) > 0);
    const maxed = owned.filter(([n]) => (cardData.data[n]?.s ?? 0) >= 7).length;
    const level = (name: string) => cardData.data[name]?.s ?? 0;
    const mastery = (name: string) => (cardData.data[name]?.mu && level(name) >= 7 ? cardData.data[name]?.m ?? 0 : null);

    // ── Max / Clear ──
    // Mastery unlocked at the given level, or left locked (no bonus).
    function maxAllCards(masteryLv: number, unlockMastery: boolean) {
        CARDS.forEach(([name]) => {
            setCardStars(name, 7);
            setCardMasteryUnlocked(name, unlockMastery);
            setCardMastery(name, unlockMastery ? masteryLv : 0);
        });
    }
    function clearAllCards() {
        CARDS.forEach(([name]) => {
            setCardStars(name, 0);
            setCardMasteryUnlocked(name, false);
            setCardMastery(name, 0);
        });
    }

    function toggleEquip(name: string) {
        const current = cardData.presets[activePreset] ?? [];
        if (current.includes(name)) setCardPreset(activePreset, current.filter(c => c !== name));
        else if (current.length < slots) setCardPreset(activePreset, [...current, name]);
    }

    // ── Share image export ──
    const shareRef = useRef<HTMLDivElement>(null);
    const [sharePages, setSharePages] = useState(1);
    const handleExport = () => openExportDialog(shareRef.current, 'towerforge-cards', 'Cards');

    const shown = open ? CARDS.find(([n]) => n === open) : undefined;

    return (
        <div>
            {/* Off-screen share card (rendered for export only) */}
            <div style={SHARE_OFFSCREEN_STYLE} aria-hidden="true">
                <CardsShareCard ref={shareRef} poster preset={activePreset} presetName={presetLabel(profile.presetNames, activePreset)} onPages={setSharePages} />
            </div>

            <div className="cardg-bar">
                <label className="cardg-slots">
                    <span>Card slots{vaultSlots > 0 ? ` (${vaultSlots} from the Vault)` : ''}</span>
                    <NumericInput value={slots} min={1} max={28} onChange={v => setCardSlots(v)} />
                </label>
                <span className="cardg-count">{owned.length} owned · {maxed} max</span>
                <span style={{ flex: 1 }} />
                <button className="btn btn-gold" onClick={() => maxAllCards(9, true)}>⭐ Max All + M9</button>
                <button className="btn btn-accent" onClick={() => maxAllCards(0, false)}>Max All</button>
                <button className="btn btn-dim" onClick={clearAllCards}>Clear All</button>
                <button className="btn btn-accent" onClick={handleExport}
                    title={sharePages > 1 ? 'Saves your cards as one image per page, sized for a Reddit post' : undefined}>
                    📸 {sharePages > 1 ? `Export ${sharePages} Images` : 'Export Image'}
                </button>
            </div>

            {presetCount > 1 && (
                <div className="preset-tabs cardg-presets">
                    {Array.from({ length: presetCount }, (_, i) => (
                        <button key={i} className={`preset-btn ${activePreset === i ? 'active' : ''}`} onClick={() => setActivePreset(i)}>
                            {presetLabel(profile.presetNames, i)}
                        </button>
                    ))}
                </div>
            )}

            <div className="cardg-panel">
                <div className="cardg-head">Active <span>{active.length}/{slots}</span></div>
                {active.length > 0 ? (
                    <div className="cardg-grid">
                        {active.map(n => <GameCard key={n} name={n} level={level(n)} mastery={mastery(n)} onClick={() => setOpen(n)} />)}
                    </div>
                ) : (
                    <p className="cardg-empty">No cards in {presetLabel(profile.presetNames, activePreset)} yet — tap a card below to equip it.</p>
                )}

                <div className="cardg-head">Inventory <span>{owned.length}/{CARDS.length}</span></div>
                <div className="cardg-grid">
                    {unlocked.map(([n]) => (
                        <GameCard key={n} name={n} level={level(n)} mastery={mastery(n)} equipped={active.includes(n)} onClick={() => setOpen(n)} />
                    ))}
                </div>
                {unlocked.length < CARDS.length && (
                    <p className="cardg-empty">{CARDS.length - unlocked.length} more cards unlock at later milestones.</p>
                )}
            </div>

            {shown && createPortal(
                <div className="modal-overlay" onClick={() => setOpen(null)}>
                    <div className="modal-box cardg-detail" onClick={e => e.stopPropagation()}>
                        {(() => {
                            const [name, rarity, , , vals, unit] = shown;
                            const lv = level(name);
                            const entry = cardData.data[name] ?? { s: 0, m: 0 };
                            const mUnlocked = entry.mu ?? false;
                            const mastVals = CARD_MASTERY_VALS[name];
                            const equipped = (cardData.presets[activePreset] ?? []).includes(name);
                            const full = !equipped && (cardData.presets[activePreset] ?? []).length >= slots;
                            return (
                                <>
                                    <div className="cardg-detail-top">
                                        <GameCard name={name} level={lv} mastery={mastery(name)} size={132} />
                                        <div className="cardg-detail-info">
                                            <h3>{name}</h3>
                                            <span className={`cardg-rarity r${rarity}`}>{RARITY_LABELS[rarity]}</span>
                                            <div className="cardg-vals">
                                                {vals.map((v, i) => (
                                                    <span key={i} className={i + 1 === lv ? 'on' : ''}>{v}{unit}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="field-row">
                                        <label className="field-label">Level<span className="field-sub">0 = not owned · 7 = max</span></label>
                                        <NumericInput value={lv} min={0} max={7} onChange={v => {
                                            setCardStars(name, v);
                                            // Mastery needs a max card — lock it back down.
                                            if (v < 7) { setCardMasteryUnlocked(name, false); setCardMastery(name, 0); }
                                            if (v === 0 && equipped) toggleEquip(name);
                                        }} />
                                    </div>

                                    <div className="field-row">
                                        <label className="field-label">
                                            Mastery
                                            <span className="field-sub">
                                                {lv < 7 ? 'Unlocks once the card is max (level 7)'
                                                    : mUnlocked && mastVals ? `Lv ${entry.m ?? 0}: ${mastVals[entry.m ?? 0] ?? '—'}` : 'Locked'}
                                            </span>
                                        </label>
                                        {lv >= 7 && (mUnlocked ? (
                                            <>
                                                <NumericInput value={entry.m ?? 0} min={0} max={9} onChange={v => setCardMastery(name, v)} />
                                                <button className="btn btn-dim" onClick={() => setCardMasteryUnlocked(name, false)}>Lock</button>
                                            </>
                                        ) : (
                                            <button className="btn btn-gold" onClick={() => { setCardMasteryUnlocked(name, true); setCardMastery(name, entry.m ?? 0); }}>
                                                Unlock mastery
                                            </button>
                                        ))}
                                    </div>

                                    <div className="modal-actions">
                                        <button className={`btn ${equipped ? 'btn-dim' : 'btn-accent'}`} disabled={lv === 0 || full}
                                            onClick={() => toggleEquip(name)}>
                                            {equipped ? `Unequip from ${presetLabel(profile.presetNames, activePreset)}`
                                                : full ? 'All card slots are full' : `Equip in ${presetLabel(profile.presetNames, activePreset)}`}
                                        </button>
                                        <button className="btn btn-dim" onClick={() => setOpen(null)}>Done</button>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}
