// ============================================================
//  TowerForge Companion — App Shell
//  Renders the header, tab bar, and active tab pane.
//  All state is loaded here on mount via the store.
// ============================================================

import { useEffect, useState } from 'react';
import { useGameStore } from './store/useGameStore';
import type { TabName } from './types/gameTypes';
import { parseCloudSave } from './engine/saveParser';
import { isGameExport, parseGameExport } from './engine/gameExport';
import CurrencyBar from './components/common/CurrencyBar';

// ── Tab Components (stubs for now — filled in one by one) ────
import ProfileTab from './components/tabs/ProfileTab';
import LoginModal from './components/LoginModal';
import PerksTab from './components/tabs/PerksTab';
import TiersTab from './components/tabs/TiersTab';
import WorkshopTab from './components/tabs/WorkshopTab';
import LabsTab from './components/tabs/LabsTab';
import CardsTab from './components/tabs/CardsTab';
import UWTab from './components/tabs/UWTab';
import PUWsTab from './components/tabs/pUWsTab';
import RelicsTab from './components/tabs/RelicsTab';
import BotsTab from './components/tabs/BotsTab';
import ModulesTab from './components/tabs/ModulesTab';
import OptimizerTab from './components/tabs/OptimizerTab';
import ShareTab from './components/tabs/ShareTab';
import AccountTab from './components/tabs/AccountTab';
import { useAccountStore } from './store/useAccountStore';
import SharedView from './components/share/SharedView';

import './styles/app.css';

// ── Tab Definitions ───────────────────────────────────────────
const TABS: { id: TabName; label: string }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'perks', label: 'Perks' },
    { id: 'tiers', label: 'Tiers' },
    { id: 'workshop', label: 'Workshop' },
    { id: 'labs', label: 'Labs' },
    { id: 'cards', label: 'Cards' },
    { id: 'uw', label: 'UW' },
    { id: 'puws', label: 'pUWs' },
    { id: 'relics', label: 'Relics' },
    { id: 'bots', label: 'Bots' },
    { id: 'modules', label: 'Modules' },
    { id: 'optimizer', label: 'Optimizer' },
    { id: 'share', label: 'Share' },
    { id: 'account', label: 'Account' },
];

export default function App() {
    const [showLoginModal, setShowLoginModal] = useState(false);
    // ?share=CODE opens the read-only viewer instead of the app shell.
    const [shareCode] = useState(() => new URLSearchParams(window.location.search).get('share'));
    const activeTab = useGameStore(s => s.activeTab);
    const setActiveTab = useGameStore(s => s.setActiveTab);
    const loadAll = useGameStore(s => s.loadAll);
    const profile = useGameStore(s => s.profile);
    const uwData = useGameStore(s => s.uwData);
    const labData = useGameStore(s => s.labData);
    const applyGameImport = useGameStore(s => s.applyGameImport);
    const importData = useGameStore(s => s.importData);
    const storeCloudSave = useGameStore(s => s.storeCloudSave);

    const accountUsername = useAccountStore(s => s.username);

    // Load saved state on mount, then check the account (which may sync
    // stats down from the server). The shared-stats viewer skips the account.
    useEffect(() => {
        loadAll();
        if (!shareCode) void useAccountStore.getState().init();
    }, [loadAll, shareCode]);   // both stable — runs once on mount

    // ── Summary bar values ───────────────────────────────────────
    const ownedUWs = Object.values(uwData.data).filter(u => u?.own).length;
    const labsDone = Object.values(labData).filter(v => v > 0).length;

    // ── Import handler ───────────────────────────────────────────
    // Takes the game's own data export (tool_export.json). Older TowerForge
    // backup files still import too.
    function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            let json: unknown;
            try {
                json = JSON.parse(text);
            } catch {
                alert('Import failed — that file isn’t valid JSON.');
                return;
            }

            if (isGameExport(json)) {
                const imp = parseGameExport(json);
                applyGameImport(imp, json);
                const lines = [
                    '✓ Imported from your game data:',
                    '• Currencies',
                    `• Tier progress${imp.highestTier ? ` (up to Tier ${imp.highestTier})` : ''}`,
                    ...(imp.userName ? [`• Player name${imp.league ? `, ${imp.league} league` : ''}${imp.presetNames.some(n => n) ? ', preset names' : ''}`] : []),
                    `• ${imp.battles.length} recent battles — used to calibrate the Farming and eHP optimizer`,
                    ...(imp.workshop ? ['• Workshop upgrades for all 5 presets (matched to your game presets)'] : []),
                    ...(imp.enhancements ? ['• Workshop enhancements (per preset)'] : []),
                    ...(imp.uws ? ['• Ultimate weapons and UW+ levels'] : []),
                    ...(imp.cards ? [`• Cards: stars, masteries and presets${imp.cardSlots > 0 ? ` (${imp.cardSlots} slots)` : ''}`] : []),
                    ...(imp.bannedPerks ? ['• Banned perks'] : []),
                    ...(imp.labs ? [`• ${Object.keys(imp.labs).length} labs`] : []),
                    ...(imp.modules ? [
                        `• Modules: ${imp.modules.state.library.length} unique modules, ${imp.modules.state.loadouts.length} presets, assist slots and slot levels`,
                    ] : []),
                    ...(imp.modules?.unnamed.length ? [
                        `  (${imp.modules.unnamed.length} more unique modules aren’t identified yet — those were skipped)`,
                    ] : []),
                    '',
                    'Not imported yet: bots and relics.',
                    'The game file doesn’t include bots, and we’re still confirming the rest, so what you entered there was left as it is.',
                ];
                alert(lines.join('\n'));
                return;
            }

            if (!importData(text)) alert('Import failed — this isn’t a game data export or a TowerForge backup.');
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    // ── Cloud save pull handler ──────────────────────────────────
    function handleCloudSavePull(rawSave: Record<string, unknown>) {
        try {
            // Parse raw Firestore JSON → TowerForge structures
            const parsed = parseCloudSave(rawSave);

            // Format as exportData() shape for importData()
            const importPayload = JSON.stringify({
                version: 2,
                exportedAt: new Date().toISOString(),
                profile: parsed.profile,
                perkData: parsed.perkData,
                tierWaves: parsed.tierWaves,
                wsData: parsed.wsData,
                enhData: parsed.enhData,
                labData: parsed.labData,
                cardData: parsed.cardData,
                uwData: parsed.uwData,
                relicData: parsed.relicData,
                botData: parsed.botData,
                moduleState: parsed.moduleState,
            });

            // Use importData to update store and persist
            const ok = importData(importPayload);
            if (!ok) {
                throw new Error('Failed to import parsed data');
            }

            // Also store the raw save
            storeCloudSave(rawSave);

            alert('✓ Cloud save loaded! All tabs updated automatically.');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            alert(`✗ Failed to parse cloud save: ${msg}`);
        }
    }

    if (shareCode) return <SharedView code={shareCode} />;

    // ── Active tab renderer ──────────────────────────────────────
    function renderTab() {
        switch (activeTab) {
            case 'profile': return <ProfileTab />;
            case 'perks': return <PerksTab />;
            case 'tiers': return <TiersTab />;
            case 'workshop': return <WorkshopTab />;
            case 'labs': return <LabsTab />;
            case 'cards': return <CardsTab />;
            case 'uw': return <UWTab />;
            case 'puws': return <PUWsTab />;
            case 'relics': return <RelicsTab />;
            case 'bots': return <BotsTab />;
            case 'modules': return <ModulesTab />;
            case 'optimizer': return <OptimizerTab />;
            case 'share': return <ShareTab />;
            case 'account': return <AccountTab />;
            default: return null;
        }
    }

    return (
        <div className="app-shell">
            {/* ── Header ── */}
            <header className="app-header">
                <div className="app-logo">
                    Tower<span className="logo-forge">Forge</span>
                    <span className="logo-sub"> Companion</span>
                </div>
                <span className="app-version">v{__APP_VERSION__}</span>

                <div className="header-actions">
                    {/* TODO: Re-enable cloud save button after testing */}
                    {/* <button className="btn btn-cloud" onClick={() => setShowLoginModal(true)}>
                        ☁ Cloud Pull
                    </button> */}
                    <label className="btn btn-gold" style={{ cursor: 'pointer' }} title="Import the data export from The Tower (tool_export.json)">
                        ⬆ Import Game Data
                        <input
                            type="file"
                            accept=".json"
                            style={{ display: 'none' }}
                            onChange={handleImport}
                        />
                    </label>
                </div>

                <div className="summary-bar">
                    <div className="sum-item">
                        <span className="sum-label">Tier</span>
                        <span className="sum-val green">
                            {profile.highestTier ? `T${profile.highestTier}` : '—'}
                        </span>
                    </div>
                    <div className="sum-item">
                        <span className="sum-label">League</span>
                        <span className="sum-val">{profile.league || '—'}</span>
                    </div>
                    <div className="sum-item">
                        <span className="sum-label">Build</span>
                        <span className="sum-val">{profile.build || '—'}</span>
                    </div>
                    <div className="sum-item">
                        <span className="sum-label">UWs</span>
                        <span className="sum-val">{ownedUWs}/9</span>
                    </div>
                    <div className="sum-item">
                        <span className="sum-label">Labs</span>
                        <span className="sum-val">{labsDone}</span>
                    </div>
                </div>
            </header>

            {/* ── Currencies ── */}
            <CurrencyBar />

            {/* ── Tab Bar ── */}
            <nav className="tab-bar">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.id === 'account' && accountUsername ? `👤 ${accountUsername}` : tab.label}
                    </button>
                ))}
            </nav>

            {/* ── Content ── */}
            <main className="tab-content">
                {renderTab()}
            </main>

            {/* ── Login Modal ── */}
            {showLoginModal && (
                <LoginModal
                    onClose={() => setShowLoginModal(false)}
                    onSuccess={handleCloudSavePull}
                />
            )}

        </div>
    );
}