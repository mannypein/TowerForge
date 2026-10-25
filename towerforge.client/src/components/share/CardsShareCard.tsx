// ============================================================
//  TowerForge Companion — Cards Share Card
//  The shown preset's card loadout (the cards it has equipped, out of
//  its slots — like the game's card screen), then every owned card
//  grouped by rarity: fewer across on narrow screens. The poster has
//  a two-line tile, 5 across, over Reddit-shaped pages (PosterPages).
// ============================================================

import type { Ref } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { CARDS, CARD_MASTERY_VALS } from '../../constants/gameData';
import type { CardData } from '../../types/gameTypes';
import { SHARE_COLORS, shareRootStyle } from './shareTheme';
import { ShareHeader, ShareFooter } from './shareCommon';
import PosterPages from './PosterPages';
import type { PosterBlock } from './PosterPages';

const RARITY_SECTIONS = [
    { rarity: 2, label: 'Epic', color: SHARE_COLORS.epic },
    { rarity: 1, label: 'Rare', color: SHARE_COLORS.rare },
    { rarity: 0, label: 'Common', color: SHARE_COLORS.common },
];
const rarityColor = (r: number) => RARITY_SECTIONS.find(s => s.rarity === r)?.color ?? SHARE_COLORS.common;

const GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))', gap: 12 } as const;

// A card's stars, value at those stars, and mastery when unlocked.
function cardFacts(name: string, cardData: CardData) {
    const def = CARDS.find(([n]) => n === name);
    if (!def) return null;
    const [, rarity, , , vals, unit] = def;
    const entry = cardData.data[name];
    const stars = entry?.s ?? 0;
    const masteryLv = entry?.m ?? 0;
    const mastVal = entry?.mu ? CARD_MASTERY_VALS[name]?.[masteryLv] : undefined;
    const curVal = vals[stars - 1];
    return { rarity, stars, masteryLv, mastVal, value: curVal !== undefined ? `${curVal}${unit}` : '—' };
}

function Stars({ stars, size }: { stars: number; size: number }) {
    return (
        <span style={{ fontSize: size, color: SHARE_COLORS.gold, letterSpacing: 1, whiteSpace: 'nowrap' }}>
            {'★'.repeat(stars)}
            <span style={{ color: SHARE_COLORS.locked }}>{'☆'.repeat(7 - stars)}</span>
        </span>
    );
}

// The poster's tile: the name on its own line (5 across leaves no room
// beside it), then the value with the stars as "7★" and the mastery.
function PosterCardTile({ name, cardData }: { name: string; cardData: CardData }) {
    const f = cardFacts(name, cardData);
    if (!f) return null;
    return (
        <div style={{
            background: SHARE_COLORS.panel,
            border: `1px solid ${SHARE_COLORS.border}`,
            borderLeft: `4px solid ${rarityColor(f.rarity)}`,
            borderRadius: 8,
            padding: '8px 11px',
            minWidth: 0,
        }}>
            <div style={{ fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
            <div style={{ marginTop: 2, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0 8px' }}>
                <strong style={{ fontSize: 17, whiteSpace: 'nowrap' }}>{f.value}</strong>
                <span style={{ fontSize: 14, color: SHARE_COLORS.gold, whiteSpace: 'nowrap' }}>
                    {f.stars}★{f.mastVal !== undefined && <> · M{f.masteryLv} {f.mastVal}</>}
                </span>
            </div>
        </div>
    );
}

// One card: name, stars, value at those stars, mastery when unlocked.
function CardTile({ name, cardData }: { name: string; cardData: CardData }) {
    const f = cardFacts(name, cardData);
    if (!f) return null;
    const { rarity, stars, masteryLv, mastVal } = f;
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
            <div style={{ marginTop: 4 }}><Stars stars={stars} size={13} /></div>
            <div style={{ marginTop: 6, fontSize: 14, display: 'flex', justifyContent: 'space-between' }}>
                <strong>{f.value}</strong>
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
export default function CardsShareCard({ ref, snapshot, poster, preset, presetName, onPages }: {
    ref?: Ref<HTMLDivElement>;
    snapshot?: CardData;
    poster?: boolean;
    preset?: number;
    presetName?: string;
    onPages?: (count: number) => void;
}) {
    const storeCardData = useGameStore(s => s.cardData);
    const cardData = snapshot ?? storeCardData;

    const owned = CARDS.filter(([n]) => (cardData.data[n]?.s ?? 0) > 0);
    const maxed = owned.filter(([n]) => (cardData.data[n]?.s ?? 0) >= 7).length;
    const loadout = preset !== undefined
        ? (cardData.presets?.[preset] ?? []).filter(n => (cardData.data[n]?.s ?? 0) > 0)
        : null;
    const title = 'Cards';
    const subtitle = `${owned.length}/${CARDS.length} owned · ${maxed} at 7★`;
    const loadoutLabel = `Card loadout${presetName ? ` — ${presetName}` : ''}`;
    // The slot count only when it holds the loadout (a count the export
    // doesn't fully give would read "25 equipped · 21 slots").
    const slots = cardData.slots ?? 0;
    const loadoutNote = loadout ? `${loadout.length} equipped${slots >= loadout.length ? ` · ${slots} slots` : ''}` : '';
    const groups = RARITY_SECTIONS
        .map(s => ({ ...s, cards: owned.filter(([, r]) => r === s.rarity).map(([n]) => n) }))
        .filter(s => s.cards.length > 0);

    if (poster) {
        const COLS = 5;
        const heading = (key: string, label: string, note: string, color: string): PosterBlock => ({
            key: `${key}:h`,
            keepWithNext: true,
            node: (
                <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 10px', paddingTop: 8 }}>
                    <span style={{ fontSize: 23, fontWeight: 700, color }}>{label}</span>
                    <span style={{ fontSize: 16, color: SHARE_COLORS.dim }}>{note}</span>
                </div>
            ),
        });
        const rows = (key: string, label: string, color: string, names: string[]): PosterBlock[] => {
            const out: PosterBlock[] = [];
            for (let i = 0; i < names.length; i += COLS) {
                out.push({
                    key: `${key}:${i}`,
                    node: (
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gap: 10 }}>
                            {names.slice(i, i + COLS).map(n => <PosterCardTile key={n} name={n} cardData={cardData} />)}
                        </div>
                    ),
                    cont: heading(key, label, 'continued', color).node,
                });
            }
            return out;
        };
        const blocks: PosterBlock[] = [
            ...(loadout ? [
                heading('loadout', loadoutLabel, loadoutNote, SHARE_COLORS.accent),
                ...(loadout.length > 0
                    ? rows('loadout', loadoutLabel, SHARE_COLORS.accent, loadout)
                    : [{ key: 'loadout:none', node: <div style={{ fontSize: 18, color: SHARE_COLORS.dim }}>No cards equipped in this preset.</div> }]),
            ] : []),
            ...groups.flatMap(g => [
                heading(g.label, g.label, `${g.cards.length} owned`, g.color),
                ...rows(g.label, g.label, g.color, g.cards),
            ]),
        ];
        return (
            <PosterPages ref={ref} title={title} subtitle={subtitle} onPages={onPages}
                blocks={blocks.length > 0 ? blocks : [{ key: 'empty', node: <div style={{ fontSize: 20, color: SHARE_COLORS.dim }}>No cards owned yet.</div> }]} />
        );
    }

    return (
        <div ref={ref} style={shareRootStyle(false)}>
            <ShareHeader title={title} subtitle={subtitle} />

            {loadout && (
                <div style={{ marginBottom: 26 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 10px', marginBottom: 10 }}>
                        <span style={{ fontSize: 20, fontWeight: 700, color: SHARE_COLORS.accent }}>{loadoutLabel}</span>
                        <span style={{ fontSize: 14, color: SHARE_COLORS.dim }}>{loadoutNote}</span>
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

            {groups.map(({ rarity, label, color, cards }) => (
                <div key={rarity} style={{ marginBottom: 22 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                        <span style={{ fontSize: 20, fontWeight: 700, color }}>{label}</span>
                        <span style={{ fontSize: 14, color: SHARE_COLORS.dim }}>{cards.length} owned</span>
                    </div>
                    <div style={GRID}>
                        {cards.map(name => <CardTile key={name} name={name} cardData={cardData} />)}
                    </div>
                </div>
            ))}

            {owned.length === 0 && (
                <div style={{ fontSize: 16, color: SHARE_COLORS.dim }}>No cards owned yet.</div>
            )}

            <ShareFooter />
        </div>
    );
}
