// ============================================================
//  TowerForge Companion — Ask AI test bench: grading
//  Checks each answer against what it was asked and the data it was
//  given, without a second model:
//   • route — step 1 picked the right data (tool and the fields that
//     matter);
//   • numbers — every number in the answer is in the data, the account
//     summary or the question (game letters and rounding allowed);
//     anything else is listed to read by hand (it may be made up, or
//     sums the model did);
//   • headline — the answer carries the data's main result (the first
//     pick, the plan, the waves);
//   • links — only towerforge.net pages;
//   • words — no code names, no known misreadings, not empty.
//  Pure functions.
// ============================================================

import type { RouteChoice } from '../aiAssistant';
import type { BenchAccountKey, BenchQuestion } from './benchQuestions';

export interface BenchRecord {
    account: BenchAccountKey;
    id: string;
    q: string;
    routed: RouteChoice | null;
    route: string;          // as shown under the answer
    data: string;           // the account summary and every tool result the answer was written from
    answer: string;
    ms: number;
}

export interface BenchGrade {
    routeOk: boolean;
    routeWhy: string[];
    unverified: string[];   // numbers in the answer found nowhere in the data
    headlineOk: boolean | null;   // null: the data has no headline to check
    headlineWhy: string;
    badLinks: string[];
    wordIssues: string[];
    pass: boolean;          // route, headline, links and words (numbers are read by hand)
}

// ── Numbers ───────────────────────────────────────────────────
// The game's letters (q quadrillion, Q quintillion — case matters).
const LETTERS: Record<string, number> = {
    K: 1e3, k: 1e3, M: 1e6, B: 1e9, T: 1e12, q: 1e15, Q: 1e18, s: 1e21, S: 1e24, O: 1e27, N: 1e30, D: 1e33,
};

// Every number in a text with its value: "1,500", "+5.7", "W8,600", "4.67Q",
// "23%", "12h 30m" (each part). Dates and list markers ("1.") are skipped.
export function numbersIn(text: string): { raw: string; value: number }[] {
    const out: { raw: string; value: number }[] = [];
    const clean = text.replace(/\b\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?\b/g, ' ').replace(/^\s*\d+\.\s/gm, ' ');
    const re = /(\d[\d,]*(?:\.\d+)?)(\s?(?:K|M|B|T|q|Q|s|S|O|N|D)(?![a-zA-Z]))?/g;
    for (let m = re.exec(clean); m; m = re.exec(clean)) {
        const n = Number(m[1].replace(/,/g, ''));
        if (!Number.isFinite(n)) continue;
        const letter = m[2]?.trim();
        out.push({ raw: m[0].trim(), value: letter ? n * LETTERS[letter] : n });
    }
    return out;
}

// Same within rounding: "5.7" for 5.66, "99q" for 98.9q, "3,190" for 3,190.
function close(a: number, b: number): boolean {
    if (a === b) return true;
    const big = Math.max(Math.abs(a), Math.abs(b));
    return big > 0 && Math.abs(a - b) / big <= 0.011;
}

// Numbers in the answer that aren't in the data or the question. Small
// counts (1–12) pass: "3 picks", "top 2", tier numbers in passing.
export function unverifiedNumbers(answer: string, data: string, question: string): string[] {
    const known = [...numbersIn(data), ...numbersIn(question)].map(n => n.value);
    return numbersIn(answer)
        .filter(n => !(Number.isInteger(n.value) && n.value <= 12))
        .filter(n => !known.some(k => close(k, n.value)))
        .map(n => n.raw);
}

// ── Route ─────────────────────────────────────────────────────
const anyOf = <T>(v: T | T[]) => (Array.isArray(v) ? v : [v]);

export function gradeRoute(qn: BenchQuestion, account: BenchAccountKey, r: RouteChoice | null): string[] {
    if (!r) return ['no route read'];
    const e = qn.expect;
    const why: string[] = [];
    if (!anyOf(e.tool).includes(r.tool)) return [`tool ${r.tool}, wanted ${anyOf(e.tool).join(' or ')}`];
    if (r.guessed) why.push('the model\'s JSON couldn\'t be read (keywords picked)');
    if (e.currency && !anyOf(e.currency).includes(r.currency)) why.push(`currency ${r.currency}, wanted ${anyOf(e.currency).join(' or ')}`);
    if (e.goal && !anyOf(e.goal).includes(r.goal)) why.push(`goal ${r.goal}, wanted ${anyOf(e.goal).join(' or ')}`);
    if (e.runs && !anyOf(e.runs).includes(r.runs)) why.push(`runs ${r.runs}, wanted ${anyOf(e.runs).join(' or ')}`);
    if (e.budget !== undefined && !close(r.budget, e.budget)) why.push(`budget ${r.budget}, wanted ${e.budget}`);
    const tiers = typeof e.tier === 'number' ? [e.tier] : e.tier?.[account];
    if (tiers && !tiers.includes(r.tier)) why.push(`tier ${r.tier}, wanted ${tiers.join(' or ')}`);
    const named = (want: string) => r.changes.some(c => new RegExp(`\\b(${want})`, 'i').test(c.upgrade));
    for (const want of e.upgrades ?? []) {
        if (!named(want)) why.push(`no change names ${want.split('|')[0]} (got ${r.changes.map(c => c.upgrade).join(', ') || 'none'})`);
    }
    for (const not of e.notUpgrades ?? []) if (named(not)) why.push(`still asks about ${not.split('|')[0]}`);
    return why;
}

// ── Headline ──────────────────────────────────────────────────
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim();

// The data's main result, and whether the answer carries it.
export function gradeHeadline(data: string, answer: string): { ok: boolean | null; why: string } {
    const a = ` ${norm(answer)} `;
    // Most of the name's words ("Chain Lightning's Damage" names "Chain Lightning Damage").
    const has = (label: string) => {
        const words = norm(label).split(' ').filter(w => w.length > 2 && !['the', 'and', 'for'].includes(w));
        return words.filter(w => a.includes(` ${w}`)).length >= Math.ceil(words.length * 0.6);
    };
    // "Headline: the best next stones buy is Golden Tower Multiplier 9 → 10 for 400 stones (+3.2 waves)."
    // Every "best next" counts: currency "any" gives one per currency.
    const bests = [...data.matchAll(/Headline: the best next (.+?) buy is (.+?)(?: for [^(]+)? \(/g)]
        .map(m => m[2].replace(/\s+\d.*$/, '').replace(/\s+(Lv|lv)\b.*$/, ''));
    if (bests.length) {
        return bests.some(has) ? { ok: true, why: '' } : { ok: false, why: `doesn't name a first pick ("${bests.join('" or "')}")` };
    }
    // "Headline: with 500 stones, buy A 1 → 3; B 2 → 4 — 480 stones in all"
    const plan = /Headline: with (.+?), buy (.+?) — /.exec(data);
    if (plan) {
        const first = plan[2].split('; ')[0].replace(/\s+\d.*$/, '');
        return has(first) ? { ok: true, why: '' } : { ok: false, why: `doesn't name the plan's first buy "${first}"` };
    }
    // What If: "gives about +4.2 waves" / "gives +12.30% damage".
    const gain = /Headline: .+? gives (?:about )?([+−-]?[\d.,]+)/.exec(data);
    if (gain) {
        const want = Number(gain[1].replace(/[−,]/g, m => (m === '−' ? '-' : '')));
        const ok = numbersIn(answer).some(n => close(n.value, Math.abs(want)));
        return ok ? { ok: true, why: '' } : { ok: false, why: `doesn't give the gain ${gain[1]}` };
    }
    // Another tier: "would end around W6,400".
    const tier = /Headline: .+? would end around W([\d,]+)/.exec(data);
    if (tier) {
        const want = Number(tier[1].replace(/,/g, ''));
        return numbersIn(answer).some(n => close(n.value, want)) ? { ok: true, why: '' } : { ok: false, why: `doesn't give W${tier[1]}` };
    }
    return { ok: null, why: '' };
}

// ── Links and words ───────────────────────────────────────────
export function badLinks(answer: string, pagePaths: string[]): string[] {
    const urls = answer.match(/https?:\/\/[^\s)\]>"']+/g) ?? [];
    const bare = answer.match(/\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|gg)\b(?:\/[^\s)\]]*)?/gi) ?? [];
    const ok = (u: string) => {
        const m = /^https?:\/\/towerforge\.net(\/[^?#]*)?/.exec(u);
        return !!m && pagePaths.includes((m[1] ?? '/').replace(/\/$/, '') || '/');
    };
    const okBare = (u: string) => /^(?:www\.)?towerforge\.net/i.test(u);
    return [...urls.filter(u => !ok(u.replace(/[.,;:]+$/, ''))), ...bare.filter(u => !okBare(u) && !urls.some(x => x.includes(u)))];
}

const CODE_WORDS = /\b(aiTools|scorePct|subLabel|costKnown|Headline:|\.tsx?\b|\.md\b|ToolResult|undefined|NaN)\b/;
// The data's own section names, which the player never sees as such.
const DATA_WORDS = /\b(Cheapest first|Plan for \d|the data (?:above|below|provided|shows|says)|in the data|\[The player's account\])/i;

export function wordIssues(answer: string, qn: BenchQuestion): string[] {
    const out: string[] = [];
    if (!answer.trim() || /^\(No answer|^Something went wrong/.test(answer)) out.push('no answer');
    const code = CODE_WORDS.exec(answer);
    if (code) out.push(`code word "${code[0]}"`);
    const data = DATA_WORDS.exec(answer);
    if (data) out.push(`points at the data ("${data[0]}")`);
    for (const re of qn.mustNot ?? []) if (re.test(answer)) out.push(`says ${re.source}`);
    return out;
}

export function grade(qn: BenchQuestion, rec: BenchRecord, pagePaths: string[]): BenchGrade {
    const routeWhy = gradeRoute(qn, rec.account, rec.routed);
    const head = gradeHeadline(rec.data, rec.answer);
    const links = badLinks(rec.answer, pagePaths);
    const words = wordIssues(rec.answer, qn);
    return {
        routeOk: routeWhy.length === 0,
        routeWhy,
        unverified: unverifiedNumbers(rec.answer, rec.data, rec.q),
        headlineOk: head.ok,
        headlineWhy: head.why,
        badLinks: links,
        wordIssues: words,
        pass: routeWhy.length === 0 && head.ok !== false && links.length === 0 && words.length === 0,
    };
}
