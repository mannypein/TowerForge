// ============================================================
//  TowerForge Companion — Auto import (header toggle)
//  Keeps the site up to date with the game's Auto export through
//  TowerForge Link while the page is open (engine/autoImport.ts for
//  when; engine/linkClient.ts for Link). Off until the player turns it
//  on; remembered per browser. Quiet: a short note when it imports, no
//  pop-ups. Waits for the account to load first, so a signed-in
//  account's saved stats don't land on top of a fresh import.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { useAccountStore } from '../../store/useAccountStore';
import { isGameExport } from '../../engine/gameExport';
import { exportAge, linkExport } from '../../engine/linkClient';
import {
    askNewerThan, AUTO_OFF, AUTO_POLL_MS, newestRunInExport, shouldImport,
} from '../../engine/autoImport';
import type { AutoImportState } from '../../engine/autoImport';
import { trackEvent } from '../../analytics';

const KEY = 'tc_link_auto';

function load(): AutoImportState {
    try {
        const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
        return s && typeof s === 'object' ? { ...AUTO_OFF, ...s } : AUTO_OFF;
    } catch {
        return AUTO_OFF;
    }
}
function save(s: AutoImportState): void {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* not remembered */ }
}

interface Props {
    // Imports a game export (no message: the toggle shows its own note).
    onImport: (raw: Record<string, unknown>) => void;
    // TowerForge Link isn't running: show its setup dialog.
    onNeedsLink: () => void;
}

export default function AutoImport({ onImport, onNeedsLink }: Props) {
    const [on, setOn] = useState(() => load().on);
    const [status, setStatus] = useState('');
    const [note, setNote] = useState<string | null>(null);
    const accountReady = useAccountStore(s => s.status !== 'loading');
    // Latest callbacks without restarting the loop.
    const props = useRef({ onImport, onNeedsLink });
    useEffect(() => { props.current = { onImport, onNeedsLink }; });

    useEffect(() => {
        if (!on || !accountReady) return;
        let stopped = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let firstTry = true;
        const tick = async () => {
            if (document.visibilityState === 'visible') {
                const s = load();
                const now = Date.now();
                const r = await linkExport(askNewerThan(s, now));
                if (stopped) return;
                if (r.ok) {
                    let raw: unknown = null;
                    try { raw = JSON.parse(r.text); } catch { /* reported below */ }
                    if (!isGameExport(raw)) {
                        setStatus('The export file didn’t read as game data.');
                    } else {
                        const file = r.modified ?? Math.floor(now / 1000);
                        const siteRun = useGameStore.getState().importedBattles.reduce((t, b) => Math.max(t, b.time ?? 0), 0);
                        const next: AutoImportState = { ...s, seen: file };
                        if (shouldImport(s, newestRunInExport(raw), siteRun, now)) {
                            props.current.onImport(raw);
                            next.imported = file;
                            next.importedAt = now;
                            setNote(`✓ Auto import: your game data from ${r.source}, exported ${exportAge(file, now)}`);
                        }
                        save(next);
                        setStatus(`Up to date with ${r.source}.`);
                    }
                } else if (r.reason === 'unchanged') {
                    setStatus('Up to date — waiting for the game’s next export.');
                } else if (r.reason === 'unreachable') {
                    setStatus('TowerForge Link isn’t running.');
                    if (firstTry) props.current.onNeedsLink();
                } else {
                    setStatus(r.message);
                }
                firstTry = false;
            }
            if (!stopped) timer = setTimeout(() => void tick(), AUTO_POLL_MS);
        };
        void tick();
        return () => { stopped = true; clearTimeout(timer); };
    }, [on, accountReady]);

    // The note fades after a few seconds.
    useEffect(() => {
        if (!note) return;
        const t = setTimeout(() => setNote(null), 5000);
        return () => clearTimeout(t);
    }, [note]);

    const toggle = () => {
        const next = !on;
        save({ ...load(), on: next });
        setOn(next);
        setStatus('');
        trackEvent(next ? 'Auto import on' : 'Auto import off');
    };

    // On, but something's in the way (Link not running, no export…).
    const warn = on && !!status && !status.startsWith('Up to date');
    const title = on
        ? `Auto import is on: the site reads your newest game data from the emulator while it's open. ${status}`
        : 'Read your game data by itself whenever the game exports it, from an emulator on this PC or an Android phone on the same Wi-Fi. In the game: Settings → External Tools Export → Auto. Needs TowerForge Link running.';

    return (
        <>
            <button
                className={`btn btn-dim lnk-btn lnk-auto ${on ? 'on' : ''} ${warn ? 'warn' : ''}`}
                aria-pressed={on}
                onClick={toggle}
                title={title}
            >
                ⟳ Auto import {on ? 'on' : 'off'}
            </button>
            {note && <div className="opt-apply-toast" role="status">{note}</div>}
        </>
    );
}
