// ============================================================
//  TowerForge Companion — Cards Share Card
//  The shown preset's card loadout (the cards it has equipped, out of
//  its slots — like the game's card screen), then every owned card
//  grouped by rarity: 4 across on the poster, fewer on narrow screens.
// ============================================================

import type { Ref } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { CARDS, CARD_MASTERY_VALS } from '../../constants/gameData';
import type { CardData } from '../../types/gameTypes';
import { SHARE_COLORS, shareRootStyle } from './shareTheme';
import { ShareHeader, ShareFooter } from './shareCommon';

const RARITY_SECTIONS = [
    { rarity: 2, label: 'Epic', color: SHARE_COLORS.epic },
    { rarity: 1, label: 'Rare', color: SHARE_COLORS.rare },
    { rarity: 0, label: 'Common', color: SHARE_COLORS.common },
];
const rarityColor = (r: number) => RARITY_SECTIONS.find(s => s.rarity === r)?.color ?? SHARE_COLORS.common;

const GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: 12 } as const;

// One card: name, stars, value at those stars, mastery when unlocked.
function CardTile({ name, cardData }: { name: string; cardData: CardData }) {
    const def = CARDS.find(([n]) => n === name);
    if (!def) return null;
    const [, rarity, , , vals, unit] = def;
    const entry = cardData.data[name];
    const stars = entry?.s ?? 0;
    const masteryLv = entry?.m ?? 0;
    const mastVal = entry?.mu ? CARD_MASTERY_VALS[name]?.[masteryLv] : undefined;
    const curVal = vals[stars - 1];
    return (
        <div
            style={{
                background: SHARE_COLORS.panel,
                border: `1px solid ${SHARE_COLORS.border}`,
                borderLeft: `3px solid ${rarityColor(rarity)}`,
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
}

// `snapshot` lets a shared link render someone else's data; without it the
// card reads the logged-in player's store. `preset` / `presetName`: the
// loadout to show (the sender's preset); none = no loadout block.
export default function CardsShareCard({ ref, snapshot, poster, preset, presetName }: {
    ref?: Ref<HTMLDivElement>;
    snapshot?: CardData;
    poster?: boolean;
    preset?: number;
    presetName?: string;
}) {
    const storeCardData = useGameStore(s => s.cardData);
    const cardData = snapshot ?? storeCardData;

    const owned = CARDS.filter(([n]) => (cardData.data[n]?.s ?? 0) > 0);
    const maxed = owned.filter(([n]) => (cardData.data[n]?.s ?? 0) >= 7).length;
    const loadout = preset !== undefined
        ? (cardData.presets?.[preset] ?? []).filter(n => (cardData.data[n]?.s ?? 0) > 0)
        : null;

    return (
        <div ref={ref} style={shareRootStyle(poster)}>
            <ShareHeader
                title="Cards"
                subtitle={`${owned.length}/${CARDS.length} owned · ${maxed} at 7★`}
            />

            {loadout && (
                <div style={{ marginBottom: 26 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 10px', marginBottom: 10 }}>
                        <span style={{ fontSize: 20, fontWeight: 700, color: SHARE_COLORS.accent }}>
                            Card loadout{presetName ? ` — ${presetName}` : ''}
                        </span>
                        <span style={{ fontSize: 14, color: SHARE_COLORS.dim }}>
                            {loadout.length} equipped · {cardData.slots ?? loadout.length} slots
                        </span>
                    </div>
                    {loadout.length > 0 ? (
                        <div style={GRID}>
                            {loadout.map(name => <CardTile key={name} name={name} cardData={cardData} />)}
                        </div>
                    ) : (
                        <div style={{ fontSize: 15, color: SHARE_COLORS.dim }}>No cards equipped in this preset.</div>
                    )}
                </div>
            )}

            {RARITY_SECTIONS.map(({ rarity, label, color }) => {
                const group = owned.filter(([, r]) => r === rarity);
                if (group.length === 0) return null;
                return (
                    <div key={rarity} style={{ marginBottom: 22 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                            <span style={{ fontSize: 20, fontWeight: 700, color }}>{label}</span>
                            <span style={{ fontSize: 14, color: SHARE_COLORS.dim }}>{group.length} owned</span>
                        </div>
                        <div style={GRID}>
                            {group.map(([name]) => <CardTile key={name} name={name} cardData={cardData} />)}
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
