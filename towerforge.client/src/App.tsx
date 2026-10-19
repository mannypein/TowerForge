// ============================================================
//  TowerForge Companion — App Shell
//  Renders the header, tab bar, and active tab pane.
//  All state is loaded here on mount via the store.
// ============================================================

import { lazy, Suspense, useEffect, useState } from 'react';
import { useGameStore } from './store/useGameStore';
import type { TabName } from './types/gameTypes';
import { parseCloudSave } from './engine/saveParser';
import { isGameExport, parseGameExport, SUPPORTED_EXPORT_VERSION } from './engine/gameExport';
import { trackEvent, trackTabView } from './analytics';
import { isPdfFile, jsonFromPdf, looksLikePdf } from './engine/pdfImport';
import CurrencyBar from './components/common/CurrencyBar';

// ── Tab Components (stubs for now — filled in one by one) ────
import ProfileTab from './components/tabs/ProfileTab';
import LoginModal from './components/LoginModal';
import LinkModal from './components/LinkModal';
import { exportAge, linkExport } from './engine/linkClient';
import PerksTab from './components/tabs/PerksTab';
import TiersTab from './components/tabs/TiersTab';
import WorkshopTab from './components/tabs/WorkshopTab';
import LabsTab from './components/tabs/LabsTab';
import CardsTab from './components/tabs/CardsTab';
import UWTab from './components/tabs/UWTab';
import PUWsTab from './components/tabs/pUWsTab';
import RelicsTab from './components/tabs/RelicsTab';
import BotsTab from './components/tabs/BotsTab';
import GuardianTab from './components/tabs/GuardianTab';
import ModulesTab from './components/tabs/ModulesTab';
import ShareTab from './components/tabs/ShareTab';
import AccountTab from './components/tabs/AccountTab';
import { useAccountStore } from './store/useAccountStore';
import SharedView from './components/share/SharedView';

import './styles/app.css';

// Pages most visits never open load on first use, keeping the main bundle small.
const OptimizerTab = lazy(() => import('./components/tabs/OptimizerTab'));
const CreatorCodesTab = lazy(() => import('./components/tabs/CreatorCodesTab'));
const EnemyStatsTab = lazy(() => import('./components/tabs/EnemyStatsTab'));
const RunCoinsTab = lazy(() => import('./components/tabs/RunCoinsTab'));
const RunLengthTab = lazy(() => import('./components/tabs/RunLengthTab'));
const WhatIfTab = lazy(() => import('./components/tabs/WhatIfTab'));
const TournamentTab = lazy(() => import('./components/tabs/TournamentTab'));

// ── Tab Definitions ───────────────────────────────────────────
// The tabs, grouped into sections so the menu fits a phone: the top row
// picks a section, the row under it picks the tab inside it (no second row
// for a section with one tab). A section with a long name has a short one
// for phones.
interface TabGroup {
    id: string;
    label: string;
    short?: string;
    tabs: { id: TabName; label: string }[];
}
const TAB_GROUPS: TabGroup[] = [
    {
        id: 'player', label: 'Player', tabs: [
            { id: 'profile', label: 'Profile' },
            { id: 'tiers', label: 'Tiers' },
            { id: 'share', label: 'Share' },
            { id: 'account', label: 'Account' },
        ],
    },
    {
        id: 'upgrades', label: 'Upgrades', tabs: [
            { id: 'workshop', label: 'Workshop' },
            { id: 'labs', label: 'Labs' },
            { id: 'cards', label: 'Cards' },
            { id: 'perks', label: 'Perks' },
        ],
    },
    {
        id: 'uws', label: 'UWs', tabs: [
            { id: 'uw', label: 'Ultimate Weapons' },
            { id: 'puws', label: 'Permanent UWs' },
        ],
    },
    {
        id: 'gear', label: 'Gear', tabs: [
            { id: 'modules', label: 'Modules' },
            { id: 'bots', label: 'Bots' },
            { id: 'guardian', label: 'Guardian' },
            { id: 'relics', label: 'Relics' },
        ],
    },
    {
        id: 'optimizer', label: 'Optimizer', tabs: [
            { id: 'optimizer', label: 'Optimizer' },
            { id: 'whatif', label: 'What If' },
            { id: 'tournament', label: 'Tournament' },
            { id: 'enemies', label: 'Enemy Stats' },
            { id: 'runcoins', label: 'Coins per Run' },
            { id: 'runlength', label: 'Run Length' },
        ],
    },
    { id: 'creators', label: 'Creator Codes', short: 'Creators', tabs: [{ id: 'creators', label: 'Creator Codes' }] },
];

const groupOf = (tab: TabName): TabGroup => TAB_GROUPS.find(g => g.tabs.some(t => t.id === tab)) ?? TAB_GROUPS[0];

export default function App() {
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [pdfBusy, setPdfBusy] = useState(false);
    // "Get from emulator": TowerForge Link's setup dialog (with its message, if it answered).
    const [linkBusy, setLinkBusy] = useState(false);
    const [linkModal, setLinkModal] = useState<{ problem: string | null } | null>(null);
    // The tab last opened in each section, so going back to a section returns to it.
    const [lastInGroup, setLastInGroup] = useState<Record<string, TabName>>({});
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
        e.target.value = '';
        if (!file) return;
        if (isPdfFile(file)) {
            void importPdf(file);
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            let json: unknown;
            try {
                json = JSON.parse(text);
            } catch {
                // A PDF saved with a .json name — offer to read it as a PDF.
                if (looksLikePdf(text)) void importPdf(file);
                else alert('Import failed — that file isn’t valid JSON.');
                return;
            }
            importJson(json, text, 'json');
        };
        reader.readAsText(file);
    }

    // The game's data file can end up as a PDF (printed or "saved as PDF" on
    // a phone). Warn, then try to read the JSON text back out of it.
    async function importPdf(file: File) {
        const tryIt = confirm(
            'This is a PDF file. Import is made for the game’s data file (tool_export.json), so reading a PDF might not work, or might miss some data.\n\n'
            + 'Try it anyway?',
        );
        if (!tryIt) return;
        setPdfBusy(true);
        try {
            const json = await jsonFromPdf(await file.arrayBuffer());
            importJson(json, JSON.stringify(json), 'pdf');
        } catch (err) {
            const why = err instanceof Error ? err.message : String(err);
            alert(
                'Couldn’t read your game data from that PDF.\n\n'
                + `${why}\n\n`
                + 'Tip: when you export from the game, save or share the file itself (tool_export.json) instead of printing it or saving it as a PDF.',
            );
        } finally {
            setPdfBusy(false);
        }
    }

    // The export straight off an emulator, through TowerForge Link (a
    // small helper on this PC — engine/linkClient.ts). If the helper isn't
    // running or reports a problem, the setup dialog says what to do.
    async function getFromEmulator() {
        setLinkBusy(true);
        try {
            const r = await linkExport();
            if (r.ok) {
                let json: unknown;
                try {
                    json = JSON.parse(r.text);
                } catch {
                    setLinkModal({ problem: 'The export file didn’t read as game data. Export your data again in the game, then try again.' });
                    return;
                }
                setLinkModal(null);
                const when = r.modified ? `, exported ${exportAge(r.modified)}` : '';
                importJson(json, r.text, 'link', `Read from ${r.source}${when}. Export again in the game whenever you want fresh data.`);
                return;
            }
            trackEvent(r.reason === 'unreachable' ? 'Emulator link not running' : `Emulator link: ${r.code}`);
            setLinkModal({ problem: r.reason === 'problem' ? r.message : null });
        } finally {
            setLinkBusy(false);
        }
    }

    // Imports parsed data: the game's export, else a TowerForge backup.
    function importJson(json: unknown, text: string, source: 'json' | 'pdf' | 'link', note?: string) {
        if (isGameExport(json)) {
            const imp = parseGameExport(json);
            applyGameImport(imp, json);
            trackEvent(source === 'pdf' ? 'Import game data (PDF)' : source === 'link' ? 'Import game data (emulator)' : 'Import game data');
            const lines = [
                '✓ Imported from your game data:',
                '• Currencies',
                `• Tier progress${imp.highestTier ? ` (up to Tier ${imp.highestTier})` : ''}`,
                ...(imp.userName ? [`• Player name${imp.league ? `, ${imp.league} league` : ''}${imp.currentLeague && imp.currentLeague !== imp.league ? ` (now in ${imp.currentLeague})` : ''}${imp.presetNames.some(n => n) ? ', preset names' : ''}`] : []),
                `• ${imp.battles.length} recent battles — used to calibrate the Farming and eHP optimizer`,
                ...(imp.workshop ? ['• Workshop upgrades for all 5 presets (matched to your game presets)'] : []),
                ...(imp.enhancements ? ['• Workshop enhancements (per preset)'] : []),
                ...(imp.uws ? ['• Ultimate weapons and UW+ levels'] : []),
                ...(imp.cards ? [`• Cards: stars, masteries and presets${imp.cardSlots > 0 ? ` (${imp.cardSlots} slots)` : ''}`] : []),
                ...(imp.bannedPerks ? ['• Banned perks'] : []),
                ...(imp.labs ? [`• ${Object.keys(imp.labs).length} labs${imp.labsRunning?.length ? `, ${imp.labsRunning.length} being researched` : ''}`] : []),
                ...(imp.modules ? [
                    `• Modules: ${imp.modules.state.library.length} unique modules, ${imp.modules.state.loadouts.length} presets, assist slots and slot levels`,
                ] : []),
                ...(imp.modules?.unnamed.length ? [
                    `  (${imp.modules.unnamed.length} more unique modules aren’t identified yet — those were skipped)`,
                ] : []),
                ...(imp.bots ? ['• Bots: medal levels and which bots run, per preset'] : []),
                ...(imp.guardian?.unlocked ? [
                    `• Guardian: chips, presets and skins${imp.guardian.inGuild === false
                        ? ' (the file says you weren’t in a guild — the Guardian only fights in one; the game also says this if your guild hadn’t loaded yet)'
                        : ''}`,
                ] : []),
                '',
                ...(imp.bots ? [
                    'Not imported yet: Bot+ levels and relics.',
                    'We’re still confirming those, so what you entered there was left as it is.',
                ] : [
                    'Not imported yet: bots and relics.',
                    'Bots come with the game’s 29.1.3 export, and we’re still confirming relics, so what you entered there was left as it is.',
                ]),
                ...(imp.exportVersion !== null && imp.exportVersion > SUPPORTED_EXPORT_VERSION ? [
                    '',
                    `⚠ This file is a newer export format (version ${imp.exportVersion}) than TowerForge reads (version ${SUPPORTED_EXPORT_VERSION}). Some fields may have changed — check your numbers.`,
                ] : []),
                ...(imp.exportedAt && source !== 'link' ? ['', `Exported ${exportAge(imp.exportedAt / 1000)}.`] : []),
                ...(source === 'pdf' ? ['', 'Read from a PDF — if something looks off, import the tool_export.json file itself.'] : []),
                ...(note ? ['', note] : []),
            ];
            alert(lines.join('\n'));
            return;
        }

        if (!importData(text)) alert('Import failed — this isn’t a game data export or a TowerForge backup.');
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

    const activeGroup = groupOf(activeTab);
    function openTab(tab: TabName) {
        setActiveTab(tab);
        setLastInGroup(last => ({ ...last, [groupOf(tab).id]: tab }));
        trackTabView(tab);
    }

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
            case 'guardian': return <GuardianTab />;
            case 'modules': return <ModulesTab />;
            case 'optimizer': return <OptimizerTab />;
            case 'enemies': return <EnemyStatsTab />;
            case 'runcoins': return <RunCoinsTab />;
            case 'runlength': return <RunLengthTab />;
            case 'whatif': return <WhatIfTab />;
            case 'tournament': return <TournamentTab />;
            case 'creators': return <CreatorCodesTab />;
            case 'share': return <ShareTab />;
            case 'account': return <AccountTab />;
            default: return null;
        }
    }

    return (
        <div className="app-shell">
            {pdfBusy && (
                <div className="opt-apply-toast" role="status">Reading the PDF… this can take a few seconds.</div>
            )}
            {linkBusy && !linkModal && (
                <div className="opt-apply-toast" role="status">Getting your data from the emulator…</div>
            )}
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
                    <button
                        className="btn btn-dim lnk-btn"
                        onClick={() => void getFromEmulator()}
                        disabled={linkBusy}
                        title="Copy the game's data export straight from BlueStacks or another emulator on this PC"
                    >
                        🖥 Get from emulator
                    </button>
                    <label className="btn btn-gold" style={{ cursor: 'pointer' }} title="Import the data export from The Tower (tool_export.json)">
                        ⬆ Import Game Data
                        <input
                            type="file"
                            accept=".json,application/json,.pdf,application/pdf"
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

            {/* ── Sections, then the tabs of the open section ── */}
            <nav className="tab-bar" aria-label="Sections">
                {TAB_GROUPS.map(group => (
                    <button
                        key={group.id}
                        className={`tab-btn tab-group ${activeGroup.id === group.id ? 'active' : ''}`}
                        onClick={() => openTab(lastInGroup[group.id] ?? group.tabs[0].id)}
                    >
                        {group.short
                            ? <><span className="tab-long">{group.label}</span><span className="tab-short">{group.short}</span></>
                            : group.label}
                    </button>
                ))}
            </nav>
            {activeGroup.tabs.length > 1 && (
                <nav className="tab-subbar" aria-label={activeGroup.label}>
                    {activeGroup.tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`tab-sub ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => openTab(tab.id)}
                        >
                            {tab.id === 'account' && accountUsername ? `👤 ${accountUsername}` : tab.label}
                        </button>
                    ))}
                </nav>
            )}

            {/* ── Content ── */}
            <main className="tab-content">
                <Suspense fallback={null}>{renderTab()}</Suspense>
            </main>

            {linkModal && (
                <LinkModal
                    problem={linkModal.problem}
                    busy={linkBusy}
                    onRetry={() => void getFromEmulator()}
                    onClose={() => setLinkModal(null)}
                />
            )}

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