// ============================================================
//  TowerForge Companion — Share Image Theme
//  Palette and poster sizing for the share images. Colors are
//  hardcoded (not CSS vars) so exports look the same in every theme.
//  Each card draws two ways: fluid on the shared-stats page (fits a
//  phone), and as a fixed-width poster kept off-screen for Export
//  Image, so an export looks the same from any screen. Cards are size
//  containers: inside them, cqw units and @container rules follow the
//  card's width, not the screen's. Long posters are cut into
//  Reddit-shaped pages (PosterPages); posterImages.ts turns them into
//  PNGs and the Export Images window (exportImages.ts) hands them over.
// ============================================================

import type { CSSProperties } from 'react';

export const SHARE_CARD_WIDTH = 1100;

export const SHARE_COLORS = {
    bg: '#0f1117',
    panel: '#181b24',
    border: '#2a2f3d',
    text: '#e8eaf0',
    dim: '#8a90a0',
    accent: '#4fd1c5',
    gold: '#f5c542',
    common: '#9aa0a6',
    rare: '#3b82f6',
    epic: '#a855f7',
    locked: '#5a6070',
};

const FONT_STACK = "'Segoe UI', system-ui, -apple-system, sans-serif";

// Wrapper that holds the poster root. Positioned far off-screen so
// it is rendered (and measurable) but never visible to the user.
export const SHARE_CARD_ROOT_STYLE: CSSProperties = {
    width: SHARE_CARD_WIDTH,
    background: SHARE_COLORS.bg,
    color: SHARE_COLORS.text,
    fontFamily: FONT_STACK,
    padding: 40,
    boxSizing: 'border-box',
};

// The card's root: the poster (fixed width) or the on-page card (fluid).
export function shareRootStyle(poster = false): CSSProperties {
    return poster
        ? { ...SHARE_CARD_ROOT_STYLE, containerType: 'inline-size' }
        : {
            ...SHARE_CARD_ROOT_STYLE,
            containerType: 'inline-size',
            width: '100%',
            padding: 'clamp(12px, 3.5vw, 40px)',
            border: `1px solid ${SHARE_COLORS.border}`,
            borderRadius: 12,
        };
}

export const SHARE_OFFSCREEN_STYLE: CSSProperties = {
    position: 'fixed',
    left: -10000,
    top: 0,
    pointerEvents: 'none',
};
