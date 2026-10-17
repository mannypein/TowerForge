// ============================================================
//  TowerForge — Creator profile pictures
//  Downloads each creator's YouTube profile picture (the channel
//  page's og:image, at 120px) into src/assets/creators/<code>.<ext>
//  for the Creator Codes tab, and removes pictures of creators who
//  no longer have a YouTube link. The site serves its own copies,
//  so visitors' browsers never contact YouTube for them.
//  Run it after adding a YouTube link, or when a creator changes
//  their picture:   npm run creator-avatars
// ============================================================

import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { CREATORS, creatorLink, creatorSlug } from '../src/constants/creatorCodes.ts';

const OUT = new URL('../src/assets/creators/', import.meta.url);
const SIZE = 120;   // shown at 44px; sharp on 2–3× phone screens
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    'Accept-Language': 'en-US',
};
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const meta = (html, prop) => html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`))?.[1] ?? null;

await mkdir(OUT, { recursive: true });
const wanted = new Set();
let failed = 0;

for (const creator of CREATORS) {
    const channel = creatorLink(creator, 'youtube');
    if (!channel) continue;
    const slug = creatorSlug(creator.code);
    try {
        const html = await (await fetch(channel, { headers: HEADERS })).text();
        const image = meta(html, 'og:image');
        if (!image?.includes('googleusercontent.com')) throw new Error('no profile picture on the channel page');
        // The URL ends in "=s900-c-k-…": ask for the size we show.
        const res = await fetch(image.replace(/=s\d+/, `=s${SIZE}`), { headers: HEADERS });
        const ext = EXT[res.headers.get('content-type')?.split(';')[0]];
        if (!res.ok || !ext) throw new Error(`picture download failed (${res.status} ${res.headers.get('content-type')})`);
        const bytes = Buffer.from(await res.arrayBuffer());
        // Drop an older copy saved under another extension.
        for (const other of Object.values(EXT)) if (other !== ext) await unlink(new URL(`${slug}.${other}`, OUT)).catch(() => {});
        await writeFile(new URL(`${slug}.${ext}`, OUT), bytes);
        wanted.add(`${slug}.${ext}`);
        console.log(`${creator.code.padEnd(16)} ${String(bytes.length).padStart(6)} B  channel "${meta(html, 'og:title')}"`);
    } catch (err) {
        failed++;
        console.error(`${creator.code.padEnd(16)} FAILED: ${err.message} (${channel})`);
        // Keep the picture already there, if any.
        for (const ext of Object.values(EXT)) wanted.add(`${slug}.${ext}`);
    }
}

for (const file of await readdir(OUT)) {
    if (!wanted.has(file)) {
        await unlink(new URL(file, OUT));
        console.log(`removed ${file} (no YouTube link)`);
    }
}
if (failed) process.exitCode = 1;
