// ============================================================
//  TowerForge Companion — Cards Share Card
//  Like the game's card screen: the shown preset's Active cards (out of
//  its slots), then every owned card in the Inventory, each drawn as the
//  game's card (GameCard) — picture, stars, Max / level and mastery.
//  Fluid on the shared-stats page; the Export Image poster has 8 cards
//  across over Reddit-shaped pages (PosterPages).
// ============================================================

import type { Ref } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { CARDS } from '../../constants/gameData';
import type { CardData } from '../../types/gameTypes';
import GameCard from '../common/GameCard';
import { SHARE_COLORS, shareRootStyle } from './shareTheme';
import { ShareHeader, ShareFooter } from './shareCommon';
import PosterPages from './PosterPages';
import type { PosterBlock } from './PosterPages';

const COLS = 8;
const POSTER_CARD = 116;

function Heading({ label, note, poster }: { label: string; note?: string; poster?: boolean }) {
    return (
        <div style={{ textAlign: 'center', paddingTop: poster ? 8 : 0, marginBottom: poster ? 0 : 10 }}>
            <div style={{ fontSize: poster ? 26 : 20, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: SHARE_COLORS.text }}>{label}</div>
            {note && <div style={{ fontSize: poster ? 17 : 14, color: SHARE_COLORS.dim }}>{note}</div>}
        </div>
    );
}

// `snapshot` lets a shared link render someone else's data; without it the
// card reads the logged-in player's store. `preset` / `presetName`: the
// loadout to show (the sender's preset); none = no Active block.
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
    const level = (n: string) => cardData.data[n]?.s ?? 0;
    const mastery = (n: string) => (cardData.data[n]?.mu && level(n) >= 7 ? cardData.data[n]?.m ?? 0 : null);

    const owned = CARDS.filter(([n]) => level(n) > 0).map(([n]) => n);
    const maxed = owned.filter(n => level(n) >= 7).length;
    const mastered = owned.filter(n => mastery(n) !== null).length;
    const active = preset !== undefined ? (cardData.presets?.[preset] ?? []).filter(n => level(n) > 0) : null;
    // The slot count only when it holds the loadout (a count the export
    // doesn't fully give would read "25/21").
    const slots = cardData.slots ?? 0;
    const activeNote = active ? `${presetName ? `${presetName} · ` : ''}${active.length}${slots >= active.length ? `/${slots}` : ''}` : '';
    const title = 'Cards';
    const subtitle = `${owned.length}/${CARDS.length} owned · ${maxed} max · ${mastered} mastered`;
    const card = (n: string, size?: number) => <GameCard key={n} name={n} level={level(n)} mastery={mastery(n)} size={size} />;
    const empty = <div style={{ fontSize: poster ? 20 : 16, color: SHARE_COLORS.dim, textAlign: 'center' }}>No cards owned yet.</div>;

    if (poster) {
        const rows = (key: string, label: string, names: string[]): PosterBlock[] => {
            const out: PosterBlock[] = [];
            for (let i = 0; i < names.length; i += COLS) {
                out.push({
                    key: `${key}:${i}`,
                    node: (
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, justifyItems: 'center', gap: 10 }}>
                            {names.slice(i, i + COLS).map(n => card(n, POSTER_CARD))}
                        </div>
                    ),
                    cont: <Heading label={label} note="continued" poster />,
                });
            }
            return out;
        };
        const blocks: PosterBlock[] = [
            ...(active ? [
                { key: 'active:h', keepWithNext: true, node: <Heading label="Active" note={activeNote} poster /> },
                ...(active.length > 0 ? rows('active', 'Active', active)
                    : [{ key: 'active:none', node: <div style={{ fontSize: 18, color: SHARE_COLORS.dim, textAlign: 'center' }}>No cards equipped in this preset.</div> }]),
            ] : []),
            ...(owned.length > 0 ? [
                { key: 'inv:h', keepWithNext: true, node: <Heading label="Inventory" note={`${owned.length}/${CARDS.length}`} poster /> },
                ...rows('inv', 'Inventory', owned),
            ] : [{ key: 'empty', node: empty }]),
        ];
        return <PosterPages ref={ref} title={title} subtitle={subtitle} onPages={onPages} blocks={blocks} />;
    }

    const grid = (names: string[]) => (
        <div className="cardg-grid">{names.map(n => card(n))}</div>
    );
    return (
        <div ref={ref} style={shareRootStyle(false)}>
            <ShareHeader title={title} subtitle={subtitle} />
            {active && (
                <div style={{ marginBottom: 22 }}>
                    <Heading label="Active" note={activeNote} />
                    {active.length > 0 ? grid(active)
                        : <div style={{ fontSize: 15, color: SHARE_COLORS.dim, textAlign: 'center' }}>No cards equipped in this preset.</div>}
                </div>
            )}
            {owned.length > 0 ? (
                <div>
                    <Heading label="Inventory" note={`${owned.length}/${CARDS.length}`} />
                    {grid(owned)}
                </div>
            ) : empty}
            <ShareFooter />
        </div>
    );
}
