// ============================================================
//  TowerForge Companion — Shared Stats Viewer
//  Full-page, read-only view opened from a ?share= link.
//  Replaces the app shell, so it never touches the viewer's data.
//  Each section is drawn to fit the screen (phones included); Export
//  Image saves it as the fixed-width poster kept off-screen next to
//  it, so an export looks the same from any screen (shareTheme).
//  Bots and Modules switch between the sender's presets, like the
//  Bots and Modules tabs.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchShare } from '../../engine/shareApi';
import type { SharePayload } from '../../engine/shareApi';
import UWShareCard from './UWShareCard';
import CardsShareCard from './CardsShareCard';
import BotsShareCard from './BotsShareCard';
import ModulesShareCard from './ModulesShareCard';
import { exportNodeAsPng, SHARE_OFFSCREEN_STYLE } from './shareTheme';
import { BOTS_CONFIG, botsForPreset, getPresetBots, isBotEntryOwned } from '../../constants/botData';
import { presetLabel } from '../../constants/gameData';

interface Props {
    code: string;
}

function exportCard(node: HTMLDivElement | null, filename: string) {
    if (!node) return;
    exportNodeAsPng(node, filename).catch(() => alert('Image export failed. Please try again.'));
}

// One section: its preset buttons, Export Image, the on-page card, and
// the off-screen poster that Export Image saves.
function ShareSection({ controls, onExport, poster, children }: {
    controls?: ReactNode;
    onExport: () => void;
    poster: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className="shr-section">
            <div className="shr-toolbar">
                {controls}
                <span className="shr-spacer" />
                <button className="btn btn-accent" onClick={onExport}>📸 Export Image</button>
            </div>
            {children}
            <div style={SHARE_OFFSCREEN_STYLE} aria-hidden="true">{poster}</div>
        </section>
    );
}

export default function SharedView({ code }: Props) {
    const [payload, setPayload] = useState<SharePayload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [botPreset, setBotPreset] = useState(0);
    const [loadoutId, setLoadoutId] = useState<string | null>(null);
    const uwRef = useRef<HTMLDivElement>(null);
    const cardsRef = useRef<HTMLDivElement>(null);
    const botsRef = useRef<HTMLDivElement>(null);
    const modulesRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let cancelled = false;
        fetchShare(code)
            .then(data => { if (!cancelled) setPayload(data); })
            .catch(err => {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this share.');
            });
        return () => { cancelled = true; };
    }, [code]);

    // Bots: the sender's presets, each with its own levels and active bots.
    // Older shares without loadouts show one set of levels.
    const sharedBots = payload?.bots;
    const botPresetCount = sharedBots?.loadouts ? (sharedBots.presetCount ?? 2) : 0;
    const ownedBotNames = sharedBots
        ? BOTS_CONFIG.filter(b => isBotEntryOwned(sharedBots.current[b.name])).map(b => b.name)
        : [];
    const presetActiveBots = botPresetCount > 0
        ? getPresetBots(sharedBots?.loadouts, botPreset, ownedBotNames)
        : undefined;
    const botProps = sharedBots ? {
        bots: botsForPreset(sharedBots.current, botPreset),
        title: botPresetCount > 0 ? presetLabel(sharedBots.presetNames, botPreset) : 'Medal levels',
        activeBots: presetActiveBots,
    } : null;

    // Modules: one preset at a time, the equipped one first.
    const sharedModules = payload?.modules;
    const loadouts = sharedModules?.loadouts ?? [];
    const equippedId = sharedModules?.activeLoadout;
    const loadout = loadouts.find(l => l.id === loadoutId)
        ?? loadouts.find(l => l.id === equippedId) ?? loadouts[0];
    // Assist slots show when the sender uses them anywhere.
    const showAssists = loadouts.some(l => Object.values(l.slots).some(s => s?.assist))
        || Object.values(sharedModules?.slotLevels ?? {}).some(s => (s?.assist ?? 0) > 0);
    const moduleProps = sharedModules && loadout ? {
        loadout,
        library: sharedModules.library ?? [],
        slotLevels: sharedModules.slotLevels,
        assistData: sharedModules.assistData,
        equipped: loadout.id === equippedId,
        showAssists,
    } : null;

    return (
        <div className="shr-page">
            <header className="shr-top">
                <span className="app-logo shr-logo">Tower<span className="logo-forge">Forge</span></span>
                <span className="shr-code">Shared stats · code <strong>{code.toUpperCase()}</strong></span>
                <span className="shr-spacer" />
                <a className="btn btn-dim" href="/">Open TowerForge</a>
            </header>

            <main className="shr-body">
                {error && (
                    <div className="empty-state">
                        <div className="icon">🔗</div>
                        <h3>{error}</h3>
                        <p>Check the code and try again, or ask the sender for a new link.</p>
                    </div>
                )}

                {!error && !payload && <p className="shr-loading">Loading shared stats…</p>}

                {payload?.uw && (
                    <ShareSection
                        onExport={() => exportCard(uwRef.current, 'towerforge-shared-uws.png')}
                        poster={<UWShareCard ref={uwRef} snapshot={payload.uw} poster />}
                    >
                        <UWShareCard snapshot={payload.uw} />
                    </ShareSection>
                )}

                {payload?.cards && (
                    <ShareSection
                        onExport={() => exportCard(cardsRef.current, 'towerforge-shared-cards.png')}
                        poster={<CardsShareCard ref={cardsRef} snapshot={payload.cards} poster />}
                    >
                        <CardsShareCard snapshot={payload.cards} />
                    </ShareSection>
                )}

                {botProps && (
                    <ShareSection
                        controls={botPresetCount > 1 && (
                            <div className="preset-tabs shr-presets">
                                {Array.from({ length: botPresetCount }, (_, idx) => (
                                    <button
                                        key={idx}
                                        className={`preset-btn ${botPreset === idx ? 'active' : ''}`}
                                        onClick={() => setBotPreset(idx)}
                                    >
                                        {presetLabel(sharedBots?.presetNames, idx)}
                                    </button>
                                ))}
                            </div>
                        )}
                        onExport={() => exportCard(botsRef.current, 'towerforge-shared-bots.png')}
                        poster={<BotsShareCard ref={botsRef} {...botProps} poster />}
                    >
                        <BotsShareCard {...botProps} />
                    </ShareSection>
                )}

                {moduleProps && (
                    <ShareSection
                        controls={loadouts.length > 1 && (
                            <div className="modg-presets shr-presets">
                                {loadouts.map(lo => (
                                    <button
                                        key={lo.id}
                                        className={`modg-preset ${lo.id === loadout?.id ? 'viewing' : ''} ${lo.id === equippedId ? 'equipped' : ''}`}
                                        onClick={() => setLoadoutId(lo.id)}
                                        title={lo.id === equippedId ? 'Equipped' : undefined}
                                    >
                                        {lo.name || 'Preset'}
                                    </button>
                                ))}
                            </div>
                        )}
                        onExport={() => exportCard(modulesRef.current, 'towerforge-shared-modules.png')}
                        poster={<ModulesShareCard ref={modulesRef} {...moduleProps} poster />}
                    >
                        <ModulesShareCard {...moduleProps} />
                    </ShareSection>
                )}
            </main>
        </div>
    );
}
