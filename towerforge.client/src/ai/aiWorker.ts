// ============================================================
//  TowerForge Companion — Ask AI: the model's worker
//  The model runs here, off the page's thread, so the site stays
//  responsive while it loads and writes. WebLLM's handler does the work;
//  the page talks to it through CreateWebWorkerMLCEngine (aiAssistant.ts).
// ============================================================

import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => handler.onmessage(msg);
