// ============================================================
//  TowerForge Companion — Cards Tab
//  Card library (star + mastery levels) and preset loadouts.
// ============================================================

import { useRef, useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { CARDS, CARD_MASTERY_VALS } from '../../constants/gameData';
import NumericInput from '../common/NumericInput';
import { milestoneReached } from '../../engine/statHelpers';
import { presetLabel } from '../../constants/gameData';
import CardsShareCard from '../share/CardsShareCard';
import { exportNodeAsPng, SHARE_OFFSCREEN_STYLE } from '../share/shareTheme';

const RARITY_LABELS = ['Common', 'Rare', 'Epic'];
const RARITY_COLORS = ['var(--text-dim)', 'var(--blue)', 'var(--purple)'];

export default function CardsTab() {
    const [activeSub, setActiveSub] = useState<'library' | 'loadout'>('library');
    const profile = useGameStore(s => s.profile);
    const tierWaves = useGameStore(s => s.tierWaves);
    const activePreset = useGameStore(s => s.activePreset);
    const setActivePreset = useGameStore(s => s.setActivePreset);
    const cardData = useGameStore(s => s.cardData);
    const setCardStars = useGameStore(s => s.setCardStars);
    const setCardMastery = useGameStore(s => s.setCardMastery);
    const setCardMasteryUnlocked = useGameStore(s => s.setCardMasteryUnlocked);
    const setCardSlots = useGameStore(s => s.setCardSlots);
    const setCardPreset = useGameStore(s => s.setCardPreset);

    const presetCount = profile.presets || 2;
    const presets = Array.from({ length: presetCount }, (_, i) => i);

    // A card unlocks at its Tier / Wave milestone (same rule as labs).
    function isCardUnlocked(lockTier: number, lockWave: number): boolean {
        return milestoneReached(lockTier, lockWave, profile.completedTier || 0, tierWaves);
    }

    // ── Max / Clear helpers ──
    // unlockMastery=true sets each card to 7★ with mastery unlocked at the
    // given in-game level; false leaves mastery locked (no bonus).
    function maxAllCards(stars: number, masteryLv: number, unlockMastery: boolean) {
        CARDS.forEach(([name]) => {
            setCardStars(name, stars);
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

    // ── Loadout toggle ──
    function toggleCardInPreset(presetIdx: number, cardName: string) {
        const current = cardData.presets[presetIdx] ?? [];
        const slots = cardData.slots ?? 1;
        if (current.includes(cardName)) {
            setCardPreset(presetIdx, current.filter(c => c !== cardName));
        } else {
            if (current.length >= slots) return; // slot limit reached
            setCardPreset(presetIdx, [...current, cardName]);
        }
    }

    // ── Summary ──
    const ownedCards = CARDS.filter(([n]) => (cardData.data[n]?.s ?? 0) > 0).length;
    const maxedCards = CARDS.filter(([n]) => (cardData.data[n]?.s ?? 0) >= 7).length;
    const activeInPreset = (cardData.presets[activePreset] ?? []).length;

    // ── Share image export ──
    const shareRef = useRef<HTMLDivElement>(null);
    function handleExport() {
        if (!shareRef.current) return;
        exportNodeAsPng(shareRef.current, 'towerforge-cards.png')
            .catch(() => alert('Image export failed. Please try again.'));
    }

    return (
        <div>
            {/* ── Sub-tab bar ── */}
            <div className="sub-tab-bar">
                <button
                    className={`sub-tab-btn ${activeSub === 'library' ? 'active' : ''}`}
                    onClick={() => setActiveSub('library')}
                >
                    📚 Card Library
                </button>
                <button
                    className={`sub-tab-btn ${activeSub === 'loadout' ? 'active' : ''}`}
                    onClick={() => setActiveSub('loadout')}
                >
                    ⚡ Active Loadouts
                </button>
            </div>

            {/* ══════════════════════════════════════
          LIBRARY SUB-TAB
      ══════════════════════════════════════ */}
            {activeSub === 'library' && (
                <div>
                    {/* Off-screen share card (rendered for export only) */}
                    <div style={SHARE_OFFSCREEN_STYLE} aria-hidden="true">
                        <CardsShareCard ref={shareRef} poster />
                    </div>

                    {/* Card slots */}
                    <div className="section" style={{ marginBottom: '10px' }}>
                        <div className="section-body" style={{ padding: '10px 14px' }}>
                            <div className="field-row">
                                <label className="field-label">
                                    Card Slots
                                    <span className="field-sub">Total active card slots (1–28)</span>
                                </label>
                                <NumericInput
                                    value={cardData.slots ?? 1}
                                    min={1}
                                    max={28}
                                    onChange={v => setCardSlots(v)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Actions + summary */}
                    <div className="flex-row" style={{ marginBottom: '12px' }}>
                        <button className="btn btn-gold" onClick={() => maxAllCards(7, 9, true)}>
                            ⭐ Max All (7★ + M9)
                        </button>
                        <button className="btn btn-accent" onClick={() => maxAllCards(7, 0, false)}>
                            Max All 7★
                        </button>
                        <button className="btn btn-dim" onClick={clearAllCards}>
                            Clear All
                        </button>
                        <span style={{ flex: 1 }} />
                        <button className="btn btn-accent" onClick={handleExport}>
                            📸 Export Image
                        </button>
                        <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                            {ownedCards} owned · {maxedCards} at 7★
                        </span>
                    </div>

                    {/* Card grid */}
                    {/* Card grid */}
                    <div className="cards-grid">
                        {CARDS.filter(([, , lockTier, lockWave]) =>
                            isCardUnlocked(lockTier, lockWave),
                        ).map(([name, rarity, lockTier, lockWave, vals, unit]) => {
                            const entry = cardData.data[name] ?? { s: 0, m: 0 };
                            const stars = entry.s ?? 0;
                            const masteryLv = entry.m ?? 0;          // in-game level 0–9
                            const mUnlocked = entry.mu ?? false;
                            const curVal = stars > 0 ? vals[stars - 1] : null;
                            const mastVals = CARD_MASTERY_VALS[name];
                            // Value applies straight off the level index once unlocked.
                            const mastVal = mUnlocked && mastVals ? (mastVals[masteryLv] ?? null) : null;
                            const canMast = stars >= 7;

                            return (
                                <div
                                    key={name}
                                    className={`card-item rarity-${rarity}`}
                                    style={{
                                        borderLeft: `3px solid ${RARITY_COLORS[rarity]}`,
                                    }}
                                >
                                    <div className="card-header">
                                        <span className="card-name">{name}</span>
                                        <span
                                            className="card-rarity-tag"
                                            style={{ color: RARITY_COLORS[rarity] }}
                                        >
                                            {RARITY_LABELS[rarity]}
                                        </span>
                                        {lockTier > 0 && (
                                            <span className="card-lock">T{lockTier} W{lockWave}</span>
                                        )}
                                    </div>

                                    <div className="card-controls">
                                        {/* Stars */}
                                        <div className="card-control-group">
                                            <span className="card-control-label">Stars</span>
                                            <NumericInput
                                                value={stars}
                                                min={0}
                                                max={7}
                                                className="num-sm"
                                                onChange={v => {
                                                    setCardStars(name, v);
                                                    if (v < 7) {
                                                        // Mastery requires 7★ — lock it back down.
                                                        setCardMasteryUnlocked(name, false);
                                                        setCardMastery(name, 0);
                                                    }
                                                }}
                                            />
                                            <span className="star-display">
                                                {'★'.repeat(stars)}{'☆'.repeat(7 - stars)}
                                            </span>
                                        </div>

                                        {/* Card value display */}
                                        {curVal !== null && (
                                            <span className="card-effect">
                                                {curVal}{unit}
                                            </span>
                                        )}

                                        {/* Mastery — locked until 7★; one toggle to unlock, then Lv 0–9 */}
                                        <div className="card-control-group">
                                            <span
                                                className="card-control-label"
                                                style={{ color: canMast && mUnlocked ? 'var(--gold)' : 'var(--text-dim)' }}
                                            >
                                                Mastery
                                            </span>

                                            {!canMast ? (
                                                <span className="card-mastery-hint">7★ required</span>
                                            ) : !mUnlocked ? (
                                                <button
                                                    className="mastery-toggle locked"
                                                    title="Unlock mastery"
                                                    onClick={() => {
                                                        setCardMasteryUnlocked(name, true);
                                                        setCardMastery(name, masteryLv);
                                                    }}
                                                >
                                                    🔒 Unlock
                                                </button>
                                            ) : (
                                                <>
                                                    <button
                                                        className="mastery-toggle unlocked"
                                                        title="Lock mastery"
                                                        onClick={() => setCardMasteryUnlocked(name, false)}
                                                    >
                                                        🔓
                                                    </button>
                                                    <NumericInput
                                                        value={masteryLv}
                                                        min={0}
                                                        max={9}
                                                        className="num-sm"
                                                        onChange={v => setCardMastery(name, v)}
                                                    />
                                                    {mastVal !== null && (
                                                        <span className="card-effect" style={{ color: 'var(--gold)' }}>
                                                            {mastVal}
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════
          LOADOUT SUB-TAB
      ══════════════════════════════════════ */}
            {activeSub === 'loadout' && (
                <div>
                    <div className="section" style={{ marginBottom: '10px' }}>
                        <div className="section-body" style={{ padding: '10px 14px' }}>
                            <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '10px', lineHeight: 1.6 }}>
                                Select which cards are active for each preset. Only owned cards (≥1★) can be equipped.
                                Active cards feed directly into the Optimizer.
                            </p>

                            {/* Preset tabs */}
                            <div className="preset-tabs">
                                {presets.map(i => (
                                    <button
                                        key={i}
                                        className={`preset-btn ${activePreset === i ? 'active' : ''}`}
                                        onClick={() => setActivePreset(i)}
                                    >
                                        {presetLabel(profile.presetNames, i)}
                                    </button>
                                ))}
                            </div>

                            <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '6px' }}>
                                {activeInPreset} / {cardData.slots ?? 1} slots used
                            </p>
                        </div>
                    </div>

                    {/* Card toggles for active preset */}
                    <div className="cards-loadout-grid">
                        {CARDS.filter(([name]) => (cardData.data[name]?.s ?? 0) > 0).map(([name, rarity]) => {
                            const isActive = (cardData.presets[activePreset] ?? []).includes(name);
                            const entry = cardData.data[name];
                            const stars = entry?.s ?? 0;
                            const slots = cardData.slots ?? 1;
                            const atLimit = (cardData.presets[activePreset] ?? []).length >= slots;

                            return (
                                <button
                                    key={name}
                                    className={`card-loadout-btn ${isActive ? 'active' : ''} ${!isActive && atLimit ? 'disabled' : ''}`}
                                    onClick={() => toggleCardInPreset(activePreset, name)}
                                    disabled={!isActive && atLimit}
                                    style={{
                                        borderColor: isActive ? RARITY_COLORS[rarity] : 'var(--border)',
                                        color: isActive ? RARITY_COLORS[rarity] : 'var(--text-dim)',
                                    }}
                                >
                                    <span className="card-loadout-name">{name}</span>
                                    <span className="card-loadout-stars">
                                        {'★'.repeat(Math.min(stars, 7))}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {CARDS.filter(([name]) => (cardData.data[name]?.s ?? 0) > 0).length === 0 && (
                        <div className="empty-state">
                            <div className="icon">🃏</div>
                            <h3>No cards owned yet</h3>
                            <p>Go to the Card Library tab and set your star levels first.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}