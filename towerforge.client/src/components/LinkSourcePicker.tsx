// ============================================================
//  TowerForge Companion — Import from… (TowerForge Link 0.4+)
//  When Link sees more than one emulator, phone or iPhone backup,
//  "Get from emulator or phone" asks which one to read: each with its
//  export's age, or what's in the way (MuMu's ADB off, no export yet…)
//  in Link's own words. The pick is remembered for next time and for
//  Auto import (engine/linkClient.ts).
// ============================================================

import { useEffect, useState } from 'react';
import { defaultSource, exportAge, rememberedSource } from '../engine/linkClient';
import type { LinkSource } from '../engine/linkClient';

const ICON: Record<LinkSource['kind'], string> = { emulator: '🖥', phone: '📱', iphone: '📱' };

export default function LinkSourcePicker({ sources, onPick, onClose }: {
    sources: LinkSource[];
    onPick: (id: string) => void;
    onClose: () => void;
}) {
    const [picked, setPicked] = useState(() => defaultSource(sources, rememberedSource()));
    const anyReady = sources.some(s => s.state === 'ready');

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="lnk-overlay" onClick={onClose}>
            <div className="lnk-modal" role="dialog" aria-modal="true" aria-labelledby="lnk-src-title" onClick={e => e.stopPropagation()}>
                <div className="lnk-head">
                    <h2 id="lnk-src-title">Import from…</h2>
                    <button className="lnk-close" onClick={onClose} aria-label="Close">✕</button>
                </div>
                <div className="lnk-body">
                    <p className="lnk-lead">
                        TowerForge Link found more than one place with The Tower. Pick the one to import from —
                        it&apos;s remembered for next time, and Auto import reads from it too.
                    </p>
                    <div className="lnk-src-list" role="radiogroup" aria-label="Where to import from">
                        {sources.map(s => {
                            const ready = s.state === 'ready';
                            return (
                                <label key={s.id} className={`lnk-src ${ready ? '' : 'off'} ${picked === s.id ? 'on' : ''}`}>
                                    <input type="radio" name="lnk-src" value={s.id} disabled={!ready}
                                        checked={picked === s.id} onChange={() => setPicked(s.id)} />
                                    <span className="lnk-src-icon" aria-hidden="true">{ICON[s.kind] ?? '🖥'}</span>
                                    <span className="lnk-src-text">
                                        <strong>{s.name}</strong>
                                        <span>{ready ? `Exported ${s.modified ? exportAge(s.modified) : 'at an unknown time'}` : s.message}</span>
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                    {!anyReady && <p className="lnk-problem">None of them has an export to read yet — see what each one says above.</p>}
                    <div className="lnk-actions">
                        <button className="btn btn-accent" disabled={!picked} onClick={() => picked && onPick(picked)}>
                            ⬇ Import
                        </button>
                        <button className="btn btn-dim" onClick={onClose}>Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
