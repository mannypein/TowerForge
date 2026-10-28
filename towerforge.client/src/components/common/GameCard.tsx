// ============================================================
//  TowerForge Companion — Game Card
//  A card drawn like the game's card screen: its name on top, its
//  picture on a dark panel glowing in one of four colors — blue, pink,
//  gold, green, which the game cycles through its card list (Damage
//  blue, Attack Speed pink, Health gold, Health Regen green, Range blue
//  again…) — and five stars under it. Levels 1–5 fill that many stars
//  and level 6 all five (how the game marks level 6 isn't confirmed);
//  level 7 turns them pink, and a mastered card's stars and frame go
//  green (the owner's card screen, 2026-10-28). In the game's colors,
//  not the theme's, so a card looks the same everywhere, share images
//  included. Styles: .gcard in tabs.css.
// ============================================================

import type { CSSProperties, ReactNode } from 'react';
import { CARDS } from '../../constants/gameData';
import { cardIcon } from '../../constants/gameIcons';

// The panel glows, sampled from the game's card screen.
const GLOWS = ['#1296a9', '#842f6a', '#89863b', '#12a274'];

function cardLevelLabel(level: number, mastery?: number | null): string {
    if (level >= 7) return mastery !== null && mastery !== undefined ? `Max · M${mastery}` : 'Max';
    return level > 0 ? `Lv ${level}` : 'Not owned';
}

export default function GameCard({ name, level, mastery, equipped, size = 104, onClick, label, title }: {
    name: string;
    level: number;               // 0 = not owned, 1–7
    mastery?: number | null;     // the mastery level when it's unlocked
    equipped?: boolean;          // in the preset shown: a green check
    size?: number;               // px wide
    onClick?: () => void;
    label?: ReactNode;           // under the card; default "Max" / "Lv 3"
    title?: string;
}) {
    const idx = Math.max(0, CARDS.findIndex(([n]) => n === name));
    const icon = cardIcon(name);
    const mastered = level >= 7 && mastery !== null && mastery !== undefined;
    const filled = level >= 6 ? 5 : Math.max(0, level);
    const tone = mastered ? 'mastered' : level >= 7 ? 'max' : level <= 0 ? 'unowned' : '';
    const style = { '--gc-w': `${size}px`, '--gc-glow': GLOWS[idx % GLOWS.length] } as CSSProperties;
    const glyph = name === 'Cash' ? '$' : name.split(/\s+/).map(w => w[0]).join('').slice(0, 2);
    const body = (
        <>
            <span className="gcard-frame">
                <span className="gcard-name">{name}</span>
                <span className="gcard-art">
                    {icon ? <img src={icon} alt="" draggable={false} /> : <span className="gcard-glyph">{glyph}</span>}
                </span>
                <span className="gcard-stars" aria-label={level > 0 ? `Level ${level} of 7` : 'Not owned'}>
                    {[0, 1, 2, 3, 4].map(i => <span key={i} className={i < filled ? '' : 'off'}>★</span>)}
                </span>
            </span>
            <span className="gcard-label">{label ?? cardLevelLabel(level, mastered ? mastery : null)}</span>
            {equipped && <span className="gcard-check" aria-label="Equipped">✓</span>}
        </>
    );
    return onClick
        ? <button type="button" className={`gcard ${tone}`} style={style} onClick={onClick} title={title ?? name}>{body}</button>
        : <div className={`gcard ${tone}`} style={style} title={title ?? name}>{body}</div>;
}
