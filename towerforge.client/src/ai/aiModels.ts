// ============================================================
//  TowerForge Companion — Ask AI: the models to choose from
//  Open models WebLLM has ready-built for the browser (WebGPU), each
//  downloaded once from Hugging Face into the browser's storage. Sizes
//  are the weights' download (each model's ndarray-cache.json, checked
//  2026-10-21). q4f16 needs the GPU's 16-bit floats ("shader-f16"); the
//  q4f32 build is the same model for GPUs without them (more memory).
// ============================================================

export interface AiModel {
    key: string;        // remembered choice
    label: string;
    f16: string;        // WebLLM model ids
    f32: string;
    download: string;
    note: string;
}

export const AI_MODELS: AiModel[] = [
    {
        key: 'qwen3-4b', label: 'Qwen3 4B',
        f16: 'Qwen3-4B-q4f16_1-MLC', f32: 'Qwen3-4B-q4f32_1-MLC',
        download: '2.3 GB', note: 'Recommended: good answers on most gaming PCs (about 4 GB of graphics memory).',
    },
    {
        key: 'qwen3-8b', label: 'Qwen3 8B',
        f16: 'Qwen3-8B-q4f16_1-MLC', f32: 'Qwen3-8B-q4f32_1-MLC',
        download: '4.6 GB', note: 'Smarter but slower: needs a graphics card with 8 GB or more.',
    },
    {
        key: 'qwen3-1.7b', label: 'Qwen3 1.7B',
        f16: 'Qwen3-1.7B-q4f16_1-MLC', f32: 'Qwen3-1.7B-q4f32_1-MLC',
        download: '1 GB', note: 'Small and quick, for laptops: weaker answers.',
    },
];

// The context the model works in (tokens): the prompt, the account, the
// data for the question, the last few messages and the answer. The models
// were built with 4,096; Qwen3 handles far more, and 8,192 leaves room for
// the data (about 0.6 GB more graphics memory on the 4B).
export const CONTEXT_TOKENS = 8192;

export const modelByKey = (key: string | null | undefined): AiModel =>
    AI_MODELS.find(m => m.key === key) ?? AI_MODELS[0];
