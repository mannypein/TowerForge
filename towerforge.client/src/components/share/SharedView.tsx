// ============================================================
//  TowerForge Companion — Shared Stats Viewer
//  Full-page, read-only view opened from a ?share= link.
//  Replaces the app shell, so it never touches the viewer's data.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { fetchShare } from '../../engine/shareApi';
import type { SharePayload } from '../../engine/shareApi';
import UWShareCard from './UWShareCard';
import CardsShareCard from './CardsShareCard';
import BotsShareCard from './BotsShareCard';
import ModulesShareCard from './ModulesShareCard';
import { exportNodeAsPng } from './shareTheme';
import { BOTS_CONFIG, botsForPreset, getPresetBots, isBotEntryOwned } from '../../constants/botData';
import { PRESET_NAMES } from '../../constants/gameData';

interface Props {
    code: string;
}

export default function SharedView({ code }: Props) {
    const [payload, setPayload] = useState<SharePayload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [botPreset, setBotPreset] = useState(0);
    const uwRef = useRef<HTMLDivElement>(null);
    const cardsRef = useRef<HTMLDivElement>(null);
    const botsRef = useRef<HTMLDivElement>(null);
    const modulesRef = useRef<HTMLDivElement>(null);

    // Bot presets mirror the Cards tab: fixed preset names, each with its own
    // set of active bots. Older shares without loadouts show levels only.
    const sharedBots = payload?.bots;
    const botPresetCount = sharedBots?.loadouts ? (sharedBots.presetCount ?? 2) : 0;
    const ownedBotNames = sharedBots
        ? BOTS_CONFIG.filter(b => isBotEntryOwned(sharedBots.current[b.name])).map(b => b.name)
        : [];
    const presetActiveBots = botPresetCount > 0
        ? getPresetBots(sharedBots?.loadouts, botPreset, ownedBotNames)
        : undefined;

    useEffect(() => {
        let cancelled = false;
        fetchShare(code)
            .then(data => { if (!cancelled) setPayload(data); })
            .catch(err => {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this share.');
            });
        return () => { cancelled = true; };
    }, [code]);

    function exit() {
        window.location.href = '/';
    }

    function exportCard(node: HTMLDivElement | null, filename: string) {
        if (!node) return;
        exportNodeAsPng(node, filename).catch(() => alert('Image export failed. Please try again.'));
    }

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg, #0f1117)', color: 'var(--text, #e8eaf0)' }}>
            <div className="flex-row" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border, #2a2f3d)' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-dim, #8a90a0)' }}>
                    Shared stats · code <strong style={{ letterSpacing: '2px' }}>{code.toUpperCase()}</strong>
                </span>
                <span style={{ flex: 1 }} />
                <button className="btn btn-dim" onClick={exit}>Back to TowerForge</button>
            </div>

            <div style={{ padding: '18px', maxWidth: '1140px', margin: '0 auto' }}>
                {error && (
                    <div className="empty-state">
                        <div className="icon">🔗</div>
                        <h3>{error}</h3>
                        <p>Check the code and try again, or ask the sender for a new link.</p>
                    </div>
                )}

                {!error && !payload && (
                    <p style={{ color: 'var(--text-dim, #8a90a0)' }}>Loading shared stats…</p>
                )}

                {payload?.uw && (
                    <section style={{ marginBottom: '28px' }}>
                        <div className="flex-row" style={{ marginBottom: '10px' }}>
                            <span style={{ flex: 1 }} />
                            <button className="btn btn-accent" onClick={() => exportCard(uwRef.current, 'towerforge-shared-uws.png')}>
                                📸 Export Image
                            </button>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <UWShareCard ref={uwRef} snapshot={payload.uw} />
                        </div>
                    </section>
                )}

                {payload?.cards && (
                    <section>
                        <div className="flex-row" style={{ marginBottom: '10px' }}>
                            <span style={{ flex: 1 }} />
                            <button className="btn btn-accent" onClick={() => exportCard(cardsRef.current, 'towerforge-shared-cards.png')}>
                                📸 Export Image
                            </button>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <CardsShareCard ref={cardsRef} snapshot={payload.cards} />
                        </div>
                    </section>
                )}

                {sharedBots && (
                    <section style={{ marginTop: '28px' }}>
                        <div className="flex-row" style={{ marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                            {Array.from({ length: botPresetCount }, (_, idx) => (
                                <button
                                    key={idx}
                                    className={`preset-btn ${botPreset === idx ? 'active' : ''}`}
                                    onClick={() => setBotPreset(idx)}
                                >
                                    {PRESET_NAMES[idx]}
                                </button>
                            ))}
                            <span style={{ flex: 1 }} />
                            <button className="btn btn-accent" onClick={() => exportCard(botsRef.current, 'towerforge-shared-bots.png')}>
                                📸 Export Image
                            </button>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <BotsShareCard
                                ref={botsRef}
                                bots={botsForPreset(sharedBots.current, botPreset)}
                                title={botPresetCount > 0 ? PRESET_NAMES[botPreset] : 'Medal levels'}
                                activeBots={presetActiveBots}
                            />
                        </div>
                    </section>
                )}

                {payload?.modules && (
                    <section style={{ marginTop: '28px' }}>
                        <div className="flex-row" style={{ marginBottom: '10px' }}>
                            <span style={{ flex: 1 }} />
                            <button className="btn btn-accent" onClick={() => exportCard(modulesRef.current, 'towerforge-shared-modules.png')}>
                                📸 Export Image
                            </button>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <ModulesShareCard
                                ref={modulesRef}
                                loadouts={payload.modules.loadouts ?? []}
                                library={payload.modules.library ?? []}
                                slotLevels={payload.modules.slotLevels}
                            />
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
