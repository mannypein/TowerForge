// ============================================================
//  TowerForge Companion — Poster images
//  Turns a poster's pages ([data-poster-page], PosterPages) into PNGs
//  at 2× and saves them. html-to-image draws each page into an SVG;
//  the SVG is loaded and drawn onto a canvas here rather than by
//  html-to-image's own loader, which waits on img.decode() — WebKit
//  (Safari, and every browser on an iPhone) can reject that for an
//  SVG image, and the export then never finished on iPhones. WebKit
//  also draws an SVG before the pictures inside it (module and bot
//  icons) are ready, so it gets a moment and a second draw.
// ============================================================

import { getFontEmbedCSS, toSvg } from 'html-to-image';
import { SHARE_COLORS } from './shareTheme';

const PIXEL_RATIO = 2;
const PAGE_TIMEOUT_MS = 45_000;

const isWebKit = () => /AppleWebKit/.test(navigator.userAgent) && !/Chrome\/|Chromium|Edg\//.test(navigator.userAgent);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
    return Promise.race([work, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);
}

// The poster's pages, or the node itself when it has none (the UW card).
export function posterPages(node: HTMLElement): HTMLElement[] {
    const found = Array.from(node.querySelectorAll<HTMLElement>('[data-poster-page]'));
    return found.length > 0 ? found : [node];
}

// name.png for one image; name-1.png, name-2.png… in order for more.
export const imageFileName = (name: string, index: number, count: number) =>
    (count > 1 ? `${name}-${index + 1}.png` : `${name}.png`);

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('The image could not be drawn.'));
        img.src = url;
    });
}

async function renderPage(page: HTMLElement, fontEmbedCSS: string | null): Promise<Blob> {
    const width = page.offsetWidth;
    const height = page.offsetHeight;
    const svg = await toSvg(page, {
        width,
        height,
        cacheBust: true,
        backgroundColor: SHARE_COLORS.bg,
        ...(fontEmbedCSS !== null ? { fontEmbedCSS } : { skipFonts: true }),
    });
    const img = await loadImage(svg);
    await img.decode?.().catch(() => undefined);
    const webKit = isWebKit();
    if (webKit) await sleep(400);

    // iPhones refuse a canvas over ~16.7M pixels; a page is far below it at 2×.
    const ratio = Math.min(PIXEL_RATIO, Math.sqrt(16_000_000 / (width * height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser can’t draw images.');
    const draw = () => {
        ctx.fillStyle = SHARE_COLORS.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    draw();
    if (webKit) {
        await sleep(250);
        draw();
    }
    return new Promise((resolve, reject) => canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('The image could not be saved.'))), 'image/png'));
}

// Every page as a PNG, one after another (a phone has memory for one
// canvas at a time); `onProgress(done, total)` after each.
export async function renderPosterPages(node: HTMLElement, onProgress?: (done: number, total: number) => void): Promise<Blob[]> {
    const pages = posterPages(node);
    // The fonts are embedded once for all pages; without them the system font draws.
    const fontEmbedCSS = await withTimeout(getFontEmbedCSS(pages[0]), 15_000, 'fonts').catch(() => null);
    const blobs: Blob[] = [];
    onProgress?.(0, pages.length);
    for (const page of pages) {
        blobs.push(await withTimeout(renderPage(page, fontEmbedCSS), PAGE_TIMEOUT_MS,
            'Making the image took too long. Please try again.'));
        onProgress?.(blobs.length, pages.length);
    }
    return blobs;
}

// Saves one image as a download (the Downloads folder; Files on an iPhone).
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// All of them, a moment apart (browsers drop downloads fired all at once).
export async function downloadAll(blobs: Blob[], name: string): Promise<void> {
    for (let i = 0; i < blobs.length; i++) {
        if (i > 0) await sleep(400);
        downloadBlob(blobs[i], imageFileName(name, i, blobs.length));
    }
}
