// ============================================================
//  TowerForge Companion — Ask AI: game notes it can look up
//  The site's own notes on the game — the mechanics checked against the
//  wiki and the game (docs/*.md) and the battle conditions' texts — cut
//  into short passages, and a plain keyword search over them (BM25) for
//  "how does X work" questions. The model only sees the few passages
//  that match, so its small context isn't filled with the whole lot.
//  Pure functions — no store imports.
// ============================================================

import uwDoc from '../../../docs/ultimate-weapons.md?raw';
import optimizerDoc from '../../../docs/optimizer.md?raw';
import runDoc from '../../../docs/run-simulation.md?raw';
import moduleDoc from '../../../docs/module-effects.md?raw';
import coverageDoc from '../../../docs/coverage.md?raw';
import { HEAT_CONDITIONS } from '../constants/tournamentData';
import { UWS } from '../constants/gameData';
import { wordsOf } from './aiTools';

export interface Passage {
    source: string;    // which notes
    heading: string;   // section path ("Chain Lightning › Smite")
    text: string;
}

const MAX_PASSAGE = 1400;

// Question words that say nothing about the topic.
const ASKING = new Set(['how', 'does', 'do', 'what', 'why', 'is', 'are', 'work', 'works', 'when', 'which', 'can',
    'it', 'i', 'in', 'for', 'with', 'on', 'this', 'that', 'get', 'me']);

// Sections by heading, long ones cut between paragraphs and list items.
function passagesOf(source: string, md: string): Passage[] {
    const out: Passage[] = [];
    const path: string[] = [];
    let body: string[] = [];
    const flush = () => {
        const text = body.join('\n').trim();
        body = [];
        if (!text) return;
        const heading = path.filter(Boolean).join(' › ');
        let chunk = '';
        for (const block of text.split(/\n(?=\s*\n|- |\* |\d+\. |\|)/)) {
            if (chunk && chunk.length + block.length > MAX_PASSAGE) {
                out.push({ source, heading, text: chunk.trim() });
                chunk = '';
            }
            chunk += `${block}\n`;
        }
        if (chunk.trim()) out.push({ source, heading, text: chunk.trim() });
    };
    for (const line of md.split(/\r?\n/)) {
        const h = /^(#{1,4})\s+(.*)$/.exec(line);
        if (h) {
            flush();
            path.length = h[1].length - 1;
            path.push(h[2].replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, ''));
        } else {
            body.push(line);
        }
    }
    flush();
    return out;
}

function conditionPassages(): Passage[] {
    return HEAT_CONDITIONS.map(c => ({
        source: 'Tournament battle conditions',
        heading: c.name,
        text: [c.text, c.how && `How TowerForge counts it: ${c.how}`, c.why && `Why it's not counted: ${c.why}`]
            .filter(Boolean).join('\n'),
    }));
}

let index: { passages: Passage[]; terms: Map<string, number>[]; df: Map<string, number>; avgLen: number } | null = null;

function buildIndex() {
    const passages = [
        ...passagesOf('Ultimate Weapons notes', uwDoc),
        ...passagesOf('Optimizer notes', optimizerDoc),
        ...passagesOf('Run notes', runDoc),
        ...passagesOf('Module notes', moduleDoc),
        ...passagesOf('What TowerForge models', coverageDoc),
        ...conditionPassages(),
    ];
    const df = new Map<string, number>();
    const terms = passages.map(p => {
        const tf = new Map<string, number>();
        // The heading counts twice: it says what the passage is about.
        for (const w of [...wordsOf(p.heading), ...wordsOf(p.heading), ...wordsOf(p.text)]) tf.set(w, (tf.get(w) ?? 0) + 1);
        for (const w of tf.keys()) df.set(w, (df.get(w) ?? 0) + 1);
        return tf;
    });
    const avgLen = terms.reduce((s, t) => s + [...t.values()].reduce((a, b) => a + b, 0), 0) / Math.max(1, terms.length);
    return { passages, terms, df, avgLen };
}

// The passages that best match the words, up to about `budget` characters.
export function searchNotes(query: string, top = 3, budget = 3200): Passage[] {
    index ??= buildIndex();
    const { passages, terms, df, avgLen } = index;
    // A UW+ by its own name (Smite) is written up under its UW (Chain Lightning).
    const uwOf = UWS.filter(u => query.toLowerCase().includes(u.up.toLowerCase())).map(u => u.n).join(' ');
    const q = [...new Set(wordsOf(`${query} ${uwOf}`))].filter(w => w !== '+' && !ASKING.has(w));
    if (!q.length) return [];
    const n = passages.length;
    const k1 = 1.2, b = 0.75;
    const scored = terms.map((tf, i) => {
        const len = [...tf.values()].reduce((a, c) => a + c, 0);
        let score = 0;
        for (const w of q) {
            const f = tf.get(w);
            if (!f) continue;
            const idf = Math.log(1 + (n - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
            score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + (b * len) / avgLen));
        }
        // A passage named in the question (a battle condition, a UW) first.
        const named = wordsOf(passages[i].heading).filter(w => w !== '+');
        if (named.length && named.every(w => q.includes(w))) score *= 2;
        return { i, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
    const out: Passage[] = [];
    let used = 0;
    for (const { i } of scored) {
        const p = passages[i];
        if (out.length >= top) break;
        if (used + p.text.length > budget) continue;
        out.push(p);
        used += p.text.length;
    }
    return out;
}

export function notesText(passages: Passage[]): string {
    return passages.map(p => `[${p.source} — ${p.heading}]\n${p.text}`).join('\n\n');
}
