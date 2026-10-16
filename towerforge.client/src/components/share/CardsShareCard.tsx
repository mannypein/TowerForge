// ============================================================
//  TowerForge Companion — Cards Share Card
//  Off-screen poster: owned cards grouped by rarity.
// ============================================================

import type { Ref } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { CARDS, CARD_MASTERY_VALS } from '../../constants/gameData';
import type { CardData } from '../../types/gameTypes';
import { SHARE_COLORS, SHARE_CARD_ROOT_STYLE } from './shareTheme';
import { ShareHeader, ShareFooter } from './shareCommon';

const RARITY_SECTIONS = [
    { rarity: 2, label: 'Epic', color: SHARE_COLORS.epic },
    { rarity: 1, label: 'Rare', color: SHARE_COLORS.rare },
    { rarity: 0, label: 'Common', color: SHARE_COLORS.common },
];

// `snapshot` lets a shared link render someone else's data; without it the
// card reads the logged-in player's store.
export default function CardsShareCard({ ref, snapshot }: { ref: Ref<HTMLDivElement>; snapshot?: CardData }) {
    const storeCardData = useGameStore(s => s.cardData);
    const cardData = snapshot ?? storeCardData;

    const owned = CARDS.filter(([n]) => (cardData.data[n]?.s ?? 0) > 0);
    const maxed = owned.filter(([n]) => (cardData.data[n]?.s ?? 0) >= 7).length;

    return (
        <div ref={ref} style={SHARE_CARD_ROOT_STYLE}>
            <ShareHeader
                title="Card Library"
                subtitle={`${owned.length}/${CARDS.length} owned · ${maxed} at 7★`}
            />

            {RARITY_SECTIONS.map(({ rarity, label, color }) => {
                const group = owned.filter(([, r]) => r === rarity);
                if (group.length === 0) return null;

                return (
                    <div key={rarity} style={{ marginBottom: 22 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                            <span style={{ fontSize: 20, fontWeight: 700, color }}>{label}</span>
                            <span style={{ fontSize: 14, color: SHARE_COLORS.dim }}>{group.length} owned</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                            {group.map(([name, , , , vals, unit]) => {
                                const entry = cardData.data[name];
                                const stars = entry?.s ?? 0;
                                const masteryLv = entry?.m ?? 0;
                                const mUnlocked = entry?.mu ?? false;
                                const mastVal = mUnlocked ? CARD_MASTERY_VALS[name]?.[masteryLv] : undefined;
                                const curVal = vals[stars - 1];

                                return (
                                    <div
                                        key={name}
                                        style={{
                                            background: SHARE_COLORS.panel,
                                            border: `1px solid ${SHARE_COLORS.border}`,
                                            borderLeft: `3px solid ${color}`,
                                            borderRadius: 8,
                                            padding: '10px 12px',
                                        }}
                                    >
                                        <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {name}
                                        </div>
                                        <div style={{ marginTop: 4, fontSize: 13, color: SHARE_COLORS.gold, letterSpacing: 1 }}>
                                            {'★'.repeat(stars)}
                                            <span style={{ color: SHARE_COLORS.locked }}>{'☆'.repeat(7 - stars)}</span>
                                        </div>
                                        <div style={{ marginTop: 6, fontSize: 14, display: 'flex', justifyContent: 'space-between' }}>
                                            <strong>{curVal !== undefined ? `${curVal}${unit}` : '—'}</strong>
                                            {mastVal !== undefined && (
                                                <span style={{ color: SHARE_COLORS.gold, fontSize: 12, alignSelf: 'center' }}>
                                                    M{masteryLv} {mastVal}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            {owned.length === 0 && (
                <div style={{ fontSize: 16, color: SHARE_COLORS.dim }}>No cards owned yet.</div>
            )}

            <ShareFooter />
        </div>
    );
}
