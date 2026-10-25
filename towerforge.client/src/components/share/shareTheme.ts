// ============================================================
//  TowerForge Companion — Share Image Theme
//  Palette, poster sizing, and PNG export helper for the share
//  images. Colors are hardcoded (not CSS vars) so exports look the
//  same in light and dark theme. Each card draws two ways: fluid on
//  the shared-stats page (fits a phone), and as a fixed-width poster
//  kept off-screen for Export Image, so an export looks the same from
//  any screen. Cards are size containers: inside them, cqw units and
//  @container rules follow the card's width, not the screen's. Long
//  posters are cut into Reddit-shaped pages (PosterPages).
// ============================================================

import type { CSSProperties } from 'react';
import { toPng } from 'html-to-image';

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

// Renders a node to a 2x PNG and triggers a download.
export async function exportNodeAsPng(node: HTMLElement, filename: string): Promise<void> {
    const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: SHARE_COLORS.bg,
    });
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
}

// Saves a poster's pages (PosterPages), one image each: name.png for one
// page, name-1.png, name-2.png… for more (in order, for a Reddit gallery).
// A poster without pages is saved as one image.
export async function exportPosterPages(node: HTMLElement, name: string): Promise<void> {
    const found = Array.from(node.querySelectorAll<HTMLElement>('[data-poster-page]'));
    const pages = found.length > 0 ? found : [node];
    for (let i = 0; i < pages.length; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 400));   // browsers drop downloads fired all at once
        await exportNodeAsPng(pages[i], pages.length > 1 ? `${name}-${i + 1}.png` : `${name}.png`);
    }
}

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
