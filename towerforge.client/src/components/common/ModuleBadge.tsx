// ============================================================
//  TowerForge Companion — Module Badge
//  A module drawn like in game: its type's frame (cannon circle,
//  armor octagon, generator triangle, core diamond) glowing in its
//  rarity color, with the module's art inside when there's an icon
//  in assets/modules (else its initials). Empty slots draw a dashed frame.
// ============================================================

import type { CSSProperties } from 'react';
import type { ModuleEntry, ModuleType } from '../../types/gameTypes';
import { moduleIcon } from '../../constants/gameIcons';
import { rarityColor } from '../../constants/moduleRarities';

const FRAMES: Record<ModuleType, string> = {
    cannon: 'M50 6 A44 44 0 1 1 49.9 6 Z',
    armor: 'M33 7 L67 7 L93 33 L93 67 L67 93 L33 93 L7 67 L7 33 Z',
    generator: 'M50 6 L95 88 L5 88 Z',
    core: 'M50 4 L96 50 L50 96 L4 50 Z',
};

// The frame's paint, set on the shape itself rather than in CSS so the
// share image export (html-to-image) keeps it: a rarity-colored outline,
// or a dashed one for an empty slot.
const framePaint = (color: string, empty: boolean) => (empty
    ? { fill: 'rgba(8, 10, 14, 0.5)', stroke: '#566074', strokeWidth: 3, strokeDasharray: '8 6' }
    : { fill: 'rgba(8, 10, 14, 0.85)', stroke: color, strokeWidth: 5 });

// How much of the badge the art fills, and how far down it sits, so it
// fits inside each frame shape. Icons are trimmed to their art and
// centered (import-icons.ps1), so these boxes are what the art fills.
// The triangle's art is smaller and lower so it fits the wide base.
const ART: Record<ModuleType, { size: string; top: string }> = {
    cannon: { size: '66%', top: '0%' },
    armor: { size: '70%', top: '0%' },
    generator: { size: '54%', top: '8%' },
    core: { size: '62%', top: '0%' },
};

// `size` is in px, or any CSS length (e.g. a CSS variable that changes
// with screen width).
export default function ModuleBadge({ type, module, size, title }: {
    type: ModuleType;
    module?: ModuleEntry | null;
    size: number | string;
    title?: string;
}) {
    const color = rarityColor(module?.rarity);
    const icon = module ? moduleIcon(module.name) : null;
    const initials = module?.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2) ?? '';
    const style = {
        '--badge-size': typeof size === 'number' ? `${size}px` : size,
        '--mod-color': color,
    } as CSSProperties;
    return (
        <span className={`modg-badge ${module ? '' : 'empty'}`} style={style} title={title ?? module?.name}>
            <svg viewBox="0 0 100 100" className="modg-badge-frame" aria-hidden="true">
                <path d={FRAMES[type]} {...framePaint(color, !module)} />
            </svg>
            {module && (icon
                ? <img src={icon} alt="" className="modg-badge-art"
                    style={{ width: ART[type].size, height: ART[type].size, top: ART[type].top }} />
                : <span className="modg-badge-initials" style={{ paddingTop: ART[type].top }}>{initials}</span>)}
        </span>
    );
}
