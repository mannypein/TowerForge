// ============================================================
//  TowerForge Companion — Share Tab
//  Creates a read-only share link from selected stats, and
//  opens a share code someone else sent you.
// ============================================================

import { useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { createShare, shareUrl } from '../../engine/shareApi';
import type { SharePayload } from '../../engine/shareApi';
import { useAccountStore } from '../../store/useAccountStore';
import MySharesList from '../share/MySharesList';
import { activeLoadout } from '../../engine/statHelpers';

type SectionKey = 'uw' | 'cards' | 'bots' | 'modules';

const SECTIONS: { key: SectionKey; label: string; hint: string }[] = [
    { key: 'uw', label: 'Ultimate Weapons', hint: 'Levels, UW+ status' },
    { key: 'cards', label: 'Card Library', hint: 'Stars, mastery levels' },
    { key: 'bots', label: 'Bots', hint: 'Medal levels, Bot+ and active bots per preset' },
    { key: 'modules', label: 'Modules', hint: 'Presets, equipped modules and slot levels' },
];

export default function ShareTab() {
    const uwData = useGameStore(s => s.uwData);
    const cardData = useGameStore(s => s.cardData);
    const botData = useGameStore(s => s.botData);
    const botLoadouts = useGameStore(s => s.botLoadouts);
    const presetCount = useGameStore(s => s.profile.presets || 2);
    const presetNames = useGameStore(s => s.profile.presetNames);
    const moduleState = useGameStore(s => s.moduleState);
    const accountStatus = useAccountStore(s => s.status);
    const sharesChanged = useAccountStore(s => s.sharesChanged);
    const setActiveTab = useGameStore(s => s.setActiveTab);

    const [selected, setSelected] = useState<Record<SectionKey, boolean>>({
        uw: true, cards: true, bots: true, modules: true,
    });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [code, setCode] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [openCode, setOpenCode] = useState('');

    const anySelected = SECTIONS.some(s => selected[s.key]);

    async function handleCreate() {
        const payload: SharePayload = {};
        if (selected.uw) payload.uw = uwData;
        if (selected.cards) payload.cards = cardData;
        if (selected.bots) payload.bots = { current: botData, loadouts: botLoadouts, presetCount, presetNames };
        if (selected.modules) {
            payload.modules = {
                loadouts: moduleState.loadouts,
                library: moduleState.library,
                slotLevels: moduleState.slotLevels,
                activeLoadout: activeLoadout(moduleState)?.id,
            };
        }

        setBusy(true);
        setError(null);
        setCopied(false);
        try {
            setCode(await createShare(payload));
            if (accountStatus === 'signedIn') sharesChanged();
        } catch (err) {
            setCode(null);
            setError(err instanceof Error ? err.message : 'Could not create the share link.');
        } finally {
            setBusy(false);
        }
    }

    async function handleCopy() {
        if (!code) return;
        try {
            await navigator.clipboard.writeText(shareUrl(code));
            setCopied(true);
        } catch {
            setError('Copy failed. Select the link and copy it manually.');
        }
    }

    function handleOpen() {
        const trimmed = openCode.trim();
        if (!trimmed) return;
        window.location.href = `/?share=${encodeURIComponent(trimmed.toUpperCase())}`;
    }

    return (
        <div>
            <div className="section" style={{ marginBottom: '10px' }}>
                <div className="section-head"><h3>Share My Stats</h3></div>
                <div className="section-body" style={{ padding: '10px 14px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '10px', lineHeight: 1.6 }}>
                        Creates a read-only snapshot of the sections you pick. Anyone with the link or code can view it.
                        Snapshots expire after 90 days. Your own data is never changed.
                    </p>
                    {accountStatus === 'signedOut' && (
                        <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '10px', lineHeight: 1.6 }}>
                            <button
                                className="btn btn-dim"
                                style={{ fontSize: '11px', padding: '2px 8px', marginRight: '6px' }}
                                onClick={() => setActiveTab('account')}
                            >
                                Create an account
                            </button>
                            to keep a list of your codes and delete them before they expire.
                        </p>
                    )}

                    {SECTIONS.map(s => (
                        <label key={s.key} className="field-row" style={{ cursor: 'pointer' }}>
                            <span className="field-label">
                                {s.label}
                                <span className="field-sub">{s.hint}</span>
                            </span>
                            <input
                                type="checkbox"
                                checked={selected[s.key]}
                                onChange={e => setSelected(prev => ({ ...prev, [s.key]: e.target.checked }))}
                            />
                        </label>
                    ))}

                    <div className="flex-row" style={{ marginTop: '10px' }}>
                        <button className="btn btn-accent" onClick={handleCreate} disabled={!anySelected || busy}>
                            {busy ? 'Creating…' : '🔗 Create Share Link'}
                        </button>
                    </div>

                    {error && (
                        <p style={{ fontSize: '12px', color: 'var(--red, #e74c3c)', marginTop: '8px' }}>{error}</p>
                    )}

                    {code && (
                        <div style={{ marginTop: '12px' }}>
                            <div className="field-label" style={{ marginBottom: '6px' }}>
                                Share code: <strong style={{ letterSpacing: '2px', fontSize: '16px' }}>{code}</strong>
                            </div>
                            <div className="flex-row">
                                <input
                                    readOnly
                                    value={shareUrl(code)}
                                    onFocus={e => e.target.select()}
                                    style={{ flex: 1, fontSize: '12px' }}
                                />
                                <button className="btn btn-dim" onClick={handleCopy}>
                                    {copied ? '✓ Copied' : 'Copy Link'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {accountStatus === 'signedIn' && (
                <div className="section" style={{ marginBottom: '10px' }}>
                    <div className="section-head"><h3>My Share Codes</h3></div>
                    <div className="section-body" style={{ padding: '10px 14px' }}>
                        <MySharesList />
                    </div>
                </div>
            )}

            <div className="section">
                <div className="section-head"><h3>View Someone's Stats</h3></div>
                <div className="section-body" style={{ padding: '10px 14px' }}>
                    <div className="flex-row">
                        <input
                            placeholder="Enter share code"
                            value={openCode}
                            maxLength={12}
                            onChange={e => setOpenCode(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleOpen(); }}
                            style={{ flex: 1, textTransform: 'uppercase' }}
                        />
                        <button className="btn btn-accent" onClick={handleOpen} disabled={!openCode.trim()}>
                            Open
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
