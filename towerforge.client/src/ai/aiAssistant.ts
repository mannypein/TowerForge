// ============================================================
//  TowerForge Companion — Ask AI: the assistant
//  A small open model (aiModels.ts) running in the player's own browser
//  with WebLLM on the graphics card (WebGPU): nothing is sent anywhere,
//  and it costs the site nothing. Downloaded once into the browser's
//  storage, loaded onto the graphics card when the page starts it.
//
//  Small models can't do the game's math and don't know the game well,
//  so each question takes two steps:
//   1. Route — the model picks which data answers it (JSON, held to a
//      schema): the Optimizer's next picks, What If for named upgrades,
//      current levels, the saved runs, another tier, the tournament
//      estimate, or the game notes.
//   2. Answer — the site works that data out (aiTools.ts, the same
//      engine the pages use) and the model answers from it and the
//      account summary, written out as it goes.
//  Kept outside the page, so the model and the chat survive switching tabs.
// ============================================================

import { create } from 'zustand';
import type { WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import { AI_MODELS, CONTEXT_TOKENS, modelByKey } from './aiModels';
import type { AiModel } from './aiModels';
import {
    accountSummary, bestUpgrades, levelsOf, runsReport, tierOutlook, tournamentOutlook, whatIfChanges,
} from './aiTools';
import type { AiAccount, AiChangeAsk, AiCurrency, AiRunKind, AiTourneySettings, ToolResult } from './aiTools';
import { budgetIn } from './aiTools';
import { TAB_PATHS } from '../routes';
import { notesText, searchNotes } from './aiKnowledge';

export interface AiMessage {
    role: 'user' | 'assistant';
    text: string;
    looked?: ToolResult[];     // the data the answer was written from
    route?: string;            // what step 1 asked for (shown with the data)
    routed?: RouteChoice;      // the same, as read (the test bench checks it)
    status?: string;           // while it works ("Reading your account…")
    done?: boolean;
}

// What a question is asked with (read fresh from the stores each time).
export interface AiContext {
    account: AiAccount;
    tourney: AiTourneySettings;
    goal?: string;             // the Optimizer page's goal
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface AiStore {
    modelKey: string;
    status: Status;
    progress: { pct: number; text: string } | null;
    error: string | null;
    loadedId: string | null;   // the WebLLM model id on the graphics card
    cached: Record<string, boolean>;
    messages: AiMessage[];
    busy: boolean;
    think: boolean;            // let Qwen3 think before answering (slower, often better)

    chooseModel: (key: string) => void;
    setThink: (on: boolean) => void;
    checkCache: () => Promise<void>;
    start: () => Promise<void>;
    stopModel: () => Promise<void>;
    removeModel: (key: string) => Promise<void>;
    ask: (question: string, ctx: AiContext) => Promise<void>;
    interrupt: () => void;
    clearChat: () => void;
}

const MODEL_KEY = 'tc_ai_model';
const readModel = () => { try { return localStorage.getItem(MODEL_KEY); } catch { return null; } };

let engine: WebWorkerMLCEngine | null = null;
let worker: Worker | null = null;

// ── Graphics card ─────────────────────────────────────────────
interface GpuAdapter { features: { has(f: string): boolean } }
interface Gpu { requestAdapter(o?: { powerPreference?: string }): Promise<GpuAdapter | null> }
const gpuOf = () => (navigator as Navigator & { gpu?: Gpu }).gpu;

export const hasWebGpu = () => !!gpuOf();

// ── The download ──────────────────────────────────────────────
// WebLLM keeps the weights in Cache Storage under their Hugging Face
// addresses (…/mlc-ai/<model id>/resolve/main/params_shard_N.bin). Looked
// up here directly: WebLLM's own check fetches each model's file list.
const MODEL_CACHE = 'webllm/model';
const isOf = (url: string, id: string) => url.includes(`/mlc-ai/${id}/`);

async function cachedUrls(): Promise<string[]> {
    try { return (await (await caches.open(MODEL_CACHE)).keys()).map(r => r.url); } catch { return []; }
}

// The model build this graphics card can run (16-bit floats or not).
async function modelIdFor(m: AiModel): Promise<string> {
    const adapter = await gpuOf()?.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No graphics card answered (WebGPU found no adapter).');
    return adapter.features.has('shader-f16') ? m.f16 : m.f32;
}

// ── Step 1: route ─────────────────────────────────────────────
export interface Route {
    tool: 'upgrades' | 'what_if' | 'levels' | 'runs' | 'tier' | 'tournament' | 'guide' | 'none';
    currency: AiCurrency;
    goal: 'default' | 'waves' | 'damage' | 'coins' | 'survival';
    changes: AiChangeAsk[];
    search: string;
    runs: AiRunKind;
    tier: number;
    budget: number;
}

const ROUTE_SCHEMA = JSON.stringify({
    type: 'object',
    properties: {
        tool: { type: 'string', enum: ['upgrades', 'what_if', 'levels', 'runs', 'tier', 'tournament', 'guide', 'none'] },
        currency: { type: 'string', enum: ['any', 'stones', 'coins', 'research', 'shards', 'medals', 'gems', 'bits'] },
        goal: { type: 'string', enum: ['default', 'waves', 'damage', 'coins', 'survival'] },
        changes: {
            type: 'array', maxItems: 4,
            items: {
                type: 'object',
                properties: { upgrade: { type: 'string' }, level: { type: 'string' } },
                required: ['upgrade', 'level'],
            },
        },
        search: { type: 'string' },
        runs: { type: 'string', enum: ['any', 'campaign', 'tournament'] },
        tier: { type: 'integer' },
        budget: { type: 'number' },
    },
    required: ['tool', 'currency', 'goal', 'changes', 'search', 'runs', 'tier', 'budget'],
});

const ROUTE_PROMPT = `You pick the data that answers a player's question about their account in the mobile game The Tower (idle tower defense). Reply with JSON only.
tool:
- "upgrades": what to upgrade or spend on next. currency: stones (UWs, UW+, card mastery, assist modules), coins (workshop, enhancements), research (labs), shards (module slots), medals (bots), gems (card slots), bits (Guardian chips), or any. goal: waves, damage, coins, survival, or default. runs: tournament when they ask about tournaments, campaign for farming or tiers, else any. budget: how much of that currency they say they have or are about to get (1500 for "I'm about to get 1500 stones"), else 0.
- "what_if": what specific upgrades would do (waves, damage, coins, cost). changes: each upgrade in the player's words and the level: "max", "+N" (N more levels) or a level number.
- "levels": the player's current level of specific upgrades. search: the upgrade names.
- "runs": the player's past runs: waves, what killed them, coins, damage by source (which UW or weapon did the damage), campaign against tournaments. runs: campaign, tournament or any.
- "tier": how far the player would get on another tier (farming or pushing a higher tier). tier: that tier's number.
- "tournament": tournaments: this week's battle conditions, how far tournament runs should get, past tournaments' waves and ranks, league moves.
- "guide": how a game mechanic works or how TowerForge calculates something. search: a few keywords.
- "none": greetings, or questions the account overview answers (tier, waves, what they own).
currency is what they want to spend; "any" when they name more than one (coins and stones) or none.
goal is "coins" whenever they want more coins, "waves" to push further, "survival" to survive longer.
Unused fields: currency "any", goal "default", changes [], search "", runs "any", tier 0, budget 0.
Examples:
"what should I spend my stones on" → {"tool":"upgrades","currency":"stones","goal":"default","changes":[],"search":"","runs":"any","tier":0,"budget":0}
"I'm about to get 1500 stones, how do I do better in tournaments" → {"tool":"upgrades","currency":"stones","goal":"waves","changes":[],"search":"","runs":"tournament","tier":0,"budget":1500}
"cheapest way to get more coins with coins and stones" → {"tool":"upgrades","currency":"any","goal":"coins","changes":[],"search":"","runs":"any","tier":0,"budget":0}
"how many waves would maxing CL and CF+ get me" → {"tool":"what_if","currency":"any","goal":"default","changes":[{"upgrade":"CL","level":"max"},{"upgrade":"CF+","level":"max"}],"search":"","runs":"any","tier":0,"budget":0}
"is 10 more levels of the damage lab worth it" → {"tool":"what_if","currency":"any","goal":"default","changes":[{"upgrade":"damage lab","level":"+10"}],"search":"","runs":"any","tier":0,"budget":0}
"why is my chain lightning weak in tournaments" → {"tool":"runs","currency":"any","goal":"default","changes":[],"search":"","runs":"tournament","tier":0,"budget":0}
"how far would I get farming T19" → {"tool":"tier","currency":"any","goal":"default","changes":[],"search":"","runs":"any","tier":19,"budget":0}
"how does Fast's Ultimate work" → {"tool":"guide","currency":"any","goal":"default","changes":[],"search":"Fast's Ultimate","runs":"any","tier":0,"budget":0}`;


// When the model's JSON can't be read: the same choice from keywords.
function guessRoute(q: string): Route {
    const l = q.toLowerCase();
    const base: Route = { tool: 'none', currency: 'any', goal: 'default', changes: [], search: '', runs: 'any', tier: 0, budget: budgetIn(q) };
    const spend = /upgrade|spend|next|should i|priorit|\bbuy\b|best (way|use|course)/.test(l);
    const tier = /\bt(?:ier)?\s?(\d{1,2})\b/.exec(l);
    if (tier && /farm|get to|make it|how far|move up|push/.test(l)) return { ...base, tool: 'tier', tier: Number(tier[1]) };
    if (/\bruns?\b|history|damage (by|from)|killed/.test(l)) return { ...base, tool: 'runs', runs: /tourn/.test(l) ? 'tournament' : 'any' };
    if (/tourn|tourney|bracket|battle condition/.test(l)) {
        if (spend) return { ...base, tool: 'upgrades', currency: currencyIn(l), goal: 'waves', runs: 'tournament' };
        return { ...base, tool: 'tournament' };
    }
    if (/what if|would .*(max|level)|\bmax(ing)?\b/.test(l)) return { ...base, tool: 'what_if', changes: [{ upgrade: q, level: 'max' }] };
    if (spend) return { ...base, tool: 'upgrades', currency: currencyIn(l) };
    if (/how (does|do|is)|what (is|does)|why/.test(l)) return { ...base, tool: 'guide', search: q };
    return base;
}

const currencyIn = (l: string): AiCurrency => (['stones', 'coins', 'research', 'shards', 'medals', 'gems', 'bits'] as const)
    .find(c => l.includes(c.replace(/s$/, ''))) ?? 'any';

export type RouteChoice = Route & { guessed?: boolean };

// Qwen3 starts every reply with its (here empty) <think></think>.
function readRoute(raw: string, q: string): RouteChoice {
    try {
        const body = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
        const r = JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1)) as Partial<Route>;
        if (!r.tool) return { ...guessRoute(q), guessed: true };
        return {
            tool: r.tool, currency: r.currency ?? 'any', goal: r.goal ?? 'default',
            changes: Array.isArray(r.changes) ? r.changes.filter(c => c?.upgrade) : [], search: r.search ?? '',
            runs: r.runs ?? 'any', tier: Number(r.tier) || 0,
            // The amount in the question itself wins: small models drop or round it.
            budget: budgetIn(q) || Math.max(0, Number(r.budget) || 0),
        };
    } catch {
        return { ...guessRoute(q), guessed: true };
    }
}

const routeText = (r: RouteChoice) => [
    r.tool,
    r.tool === 'upgrades' && `${r.currency}${r.goal !== 'default' ? `, goal ${r.goal}` : ''}${r.runs !== 'any' ? `, ${r.runs} runs` : ''}${r.budget ? `, budget ${r.budget.toLocaleString()}` : ''}`,
    r.tool === 'what_if' && r.changes.map(c => `${c.upgrade} → ${c.level}`).join('; '),
    (r.tool === 'levels' || r.tool === 'guide') && r.search && `"${r.search}"`,
    r.tool === 'runs' && r.runs,
    r.tool === 'tier' && `T${r.tier || '?'}`,
    r.guessed && '(from keywords: the model’s choice couldn’t be read)',
].filter(Boolean).join(' · ');

// ── Step 2: the data ──────────────────────────────────────────
function lookUp(route: Route, question: string, ctx: AiContext): ToolResult[] {
    const { account } = ctx;
    switch (route.tool) {
        case 'upgrades':
            return [bestUpgrades(account, route.currency, route.goal === 'default' ? ctx.goal : route.goal,
                { budget: route.budget, runs: route.runs, tourney: ctx.tourney })];
        case 'what_if': {
            const asks = route.changes.length ? route.changes : [{ upgrade: question, level: 'max' }];
            // Each on its own when there are several (to compare), then together.
            const each = asks.length > 1 ? asks.map(a => whatIfChanges(account, [a])) : [];
            const together = whatIfChanges(account, asks);
            return asks.length > 1
                ? [...each.map((r, i) => ({ ...r, title: `What If — ${asks[i].upgrade}` })), { ...together, title: 'What If — all together' }]
                : [together];
        }
        case 'levels':
            return [levelsOf(account, route.search || question)];
        case 'runs':
            return [runsReport(account, route.runs)];
        case 'tier':
            return [tierOutlook(account, route.tier)];
        case 'tournament':
            return [tournamentOutlook(account, ctx.tourney), runsReport(account, 'tournament')];
        case 'guide': {
            const found = searchNotes(`${route.search} ${question}`);
            return [{ title: `Game notes — ${found.map(p => p.heading).slice(0, 2).join(', ') || 'nothing found'}`, text: found.length ? notesText(found) : 'No notes matched.' }];
        }
        default:
            return [];
    }
}

// The pages the answer may point to, with their real addresses.
const PAGE_LINKS = ([
    ['Optimizer', 'optimizer'], ['What If', 'whatif'], ['Tournament', 'tournament'], ['Run Length', 'runlength'],
    ['Coins per Run', 'runcoins'], ['Enemy Stats', 'enemies'], ['Labs', 'labs'], ['Workshop', 'workshop'],
] as const).map(([name, tab]) => `${name} https://towerforge.net${TAB_PATHS[tab]}`).join(', ');

const ANSWER_PROMPT = `You are TowerForge's assistant for the mobile idle tower defense game The Tower (by Tech Tree Games). You answer the player's questions about their own account from the data below, which TowerForge worked out from their game data.
Rules:
- Only use numbers that are in the data, copied exactly. When the data has a "Headline:" line, start from it. When it has a "Plan for" list, answer with that plan in its order: those buys fit what the player has to spend, so never suggest a buy outside it as something they can afford. Gains given in waves stay in waves. Never make up levels, costs, waves or percentages. If the data doesn't answer the question, say so and name the TowerForge page that does (Optimizer, What If, Tournament, Run Length, Coins per Run, Enemy Stats).
- Use the game's own words: stones, Ultimate Weapons (UWs), UW+, labs, workshop, enhancements, cards, modules, bots, Bot+, Guardian, tiers, waves.
- Be brief and direct: answer first in a sentence or two, then a few short bullet points if they help.
- If the data says an upgrade couldn't be found, or doesn't have the answer, say so plainly and don't guess.
- Game notes are TowerForge's own notes: explain them in plain words and leave out code names and file names.
- In the account, "Damage 13/32" is an upgrade's level (13 of 32), not damage dealt.
- Big numbers use the game's letters, smallest to largest: K (thousand), M (million), B (billion), T (trillion), q (quadrillion), Q (quintillion), s, S, O, N, D, then aa, ab… So 61.00K is far less than 4.67Q, and q is less than Q. When the data has a "Cheapest first" line, use it to compare costs.
- To point to a page, use these addresses exactly (no others): ${PAGE_LINKS}.`;

// Rough token count (about 3.5 characters a token for this text).
const tokens = (s: string) => Math.ceil(s.length / 3.5);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const visible = (s: string) => s.replace(/<think>[\s\S]*?<\/think>\s*/g, '').replace(/<think>[\s\S]*$/, '').trimStart();

export const useAiStore = create<AiStore>((set, get) => {
    const patchLast = (patch: Partial<AiMessage>) => set(s => ({
        messages: s.messages.map((m, i) => (i === s.messages.length - 1 ? { ...m, ...patch } : m)),
    }));

    return {
        modelKey: modelByKey(readModel()).key,
        status: 'idle',
        progress: null,
        error: null,
        loadedId: null,
        cached: {},
        messages: [],
        busy: false,
        think: false,

        chooseModel: (key) => {
            try { localStorage.setItem(MODEL_KEY, key); } catch { /* not remembered */ }
            set({ modelKey: modelByKey(key).key });
        },
        setThink: (on) => set({ think: on }),

        // Which models are already downloaded (both builds count).
        checkCache: async () => {
            const urls = await cachedUrls();
            set({
                cached: Object.fromEntries(AI_MODELS.map(m => [m.key,
                    urls.some(u => (isOf(u, m.f16) || isOf(u, m.f32)) && u.endsWith('/params_shard_0.bin'))])),
            });
        },

        start: async () => {
            if (get().status === 'loading') return;
            const model = modelByKey(get().modelKey);
            set({ status: 'loading', error: null, progress: { pct: 0, text: 'Starting…' } });
            try {
                const id = await modelIdFor(model);
                if (engine && get().loadedId !== id) await get().stopModel();
                if (!engine) {
                    const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
                    worker = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' });
                    engine = await CreateWebWorkerMLCEngine(worker, id, {
                        initProgressCallback: r => set({ progress: { pct: r.progress, text: r.text } }),
                    }, { context_window_size: CONTEXT_TOKENS });
                }
                set({ status: 'ready', loadedId: id, progress: null });
                void get().checkCache();
            } catch (e) {
                worker?.terminate();
                engine = null;
                worker = null;
                set({ status: 'error', loadedId: null, progress: null, error: e instanceof Error ? e.message : String(e) });
            }
        },

        // Frees the graphics card (the download stays).
        stopModel: async () => {
            try { await engine?.unload(); } catch { /* worker already gone */ }
            worker?.terminate();
            engine = null;
            worker = null;
            set({ status: 'idle', loadedId: null, busy: false });
        },

        // Deletes a model's download from this browser.
        removeModel: async (key) => {
            const m = modelByKey(key);
            const loaded = get().loadedId;
            if (loaded === m.f16 || loaded === m.f32) await get().stopModel();
            const { deleteModelAllInfoInCache } = await import('@mlc-ai/web-llm');
            for (const id of [m.f16, m.f32]) {
                try { await deleteModelAllInfoInCache(id); } catch { /* wasn't there */ }
            }
            // WebLLM leaves each build's file list (tensor-cache.json) behind.
            try {
                const cache = await caches.open(MODEL_CACHE);
                for (const req of await cache.keys()) if (isOf(req.url, m.f16) || isOf(req.url, m.f32)) await cache.delete(req);
            } catch { /* storage unavailable */ }
            await get().checkCache();
        },

        ask: async (question, ctx) => {
            const q = question.trim();
            if (!q || !engine || get().busy) return;
            // Earlier questions only: a small model copies its own earlier
            // answers' numbers into new ones, so it never sees them.
            const earlier = get().messages.filter(m => m.role === 'user').slice(-2).map(m => clip(m.text, 300));
            set(s => ({
                busy: true,
                messages: [...s.messages, { role: 'user', text: q, done: true },
                    { role: 'assistant', text: '', status: 'Working out what to look at…' }],
            }));
            try {
                // Follow-ups ("and CF+ instead?") read with the question before.
                const asked = earlier.length ? `Earlier question, for context: ${earlier[earlier.length - 1]}\nQuestion: ${q}` : q;
                const routed = await engine.chat.completions.create({
                    messages: [{ role: 'system', content: ROUTE_PROMPT }, { role: 'user', content: asked }],
                    temperature: 0, max_tokens: 200,
                    response_format: { type: 'json_object', schema: ROUTE_SCHEMA },
                    extra_body: { enable_thinking: false },
                });
                const route = readRoute(routed.choices[0]?.message?.content ?? '', q);

                patchLast({ status: 'Reading your account…' });
                await new Promise(r => setTimeout(r, 30));   // let the page show it
                const looked = lookUp(route, q, ctx);
                const summary = accountSummary(ctx.account);
                let data = looked.map(r => `[${r.title}]\n${r.text}`).join('\n\n');
                // Keep everything inside the context with room for the answer.
                const answerTokens = get().think ? 2048 : 900;
                const context = earlier.length ? `\n\n[Earlier questions in this chat]\n${earlier.join('\n')}` : '';
                const room = CONTEXT_TOKENS - answerTokens - tokens(ANSWER_PROMPT) - tokens(summary) - tokens(context) - 300;
                if (tokens(data) > room) data = clip(data, Math.floor(room * 3.5));

                const system = `${ANSWER_PROMPT}\n\n[The player's account]\n${summary}${data ? `\n\n${data}` : ''}${context}`;
                patchLast({ looked, route: routeText(route), routed: route, status: get().think ? 'Thinking…' : 'Writing…' });
                const stream = await engine.chat.completions.create({
                    messages: [{ role: 'system', content: system }, { role: 'user', content: q }],
                    stream: true, temperature: 0.2, top_p: 0.8, max_tokens: answerTokens,
                    extra_body: { enable_thinking: get().think },
                });
                let raw = '';
                for await (const chunk of stream) {
                    raw += chunk.choices[0]?.delta?.content ?? '';
                    const shown = visible(raw);
                    patchLast({ text: shown, status: shown ? undefined : 'Thinking…' });
                }
                patchLast({ text: visible(raw) || '(No answer — try asking another way.)', status: undefined, done: true });
            } catch (e) {
                patchLast({ text: `Something went wrong: ${e instanceof Error ? e.message : String(e)}`, status: undefined, done: true });
            } finally {
                set({ busy: false });
            }
        },

        interrupt: () => { void engine?.interruptGenerate(); },
        clearChat: () => { if (!get().busy) set({ messages: [] }); },
    };
});
