// ============================================================
//  TowerForge Companion — Creator Codes Tab
//  Every content creator's code in one list: search by code or
//  name, copy a code with one tap, and open their channels. The
//  YouTube button is the creator's profile picture.
// ============================================================

import { useState } from 'react';
import { CREATORS, CREATOR_SITES, WEBSTORE_URL, creatorSlug } from '../../constants/creatorCodes';
import type { CreatorSite } from '../../constants/creatorCodes';
import { trackEvent } from '../../analytics';

const SITES = Object.keys(CREATOR_SITES) as CreatorSite[];

// YouTube profile pictures by code slug (saved by scripts/fetch-creator-avatars.mjs).
const AVATARS: Record<string, string> = Object.fromEntries(
    Object.entries(import.meta.glob('../../assets/creators/*.{jpg,png,webp}', { eager: true, import: 'default' }) as Record<string, string>)
        .map(([path, url]) => [path.split('/').pop()!.replace(/\.\w+$/, ''), url]),
);

// navigator.clipboard is missing or blocked in some in-app browsers (the
// ones Discord and Reddit open links in), so fall back to the older copy
// command.
async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const box = document.createElement('textarea');
        box.value = text;
        box.setAttribute('readonly', '');
        box.style.position = 'fixed';
        box.style.opacity = '0';
        document.body.appendChild(box);
        box.select();
        let ok: boolean;
        try {
            ok = document.execCommand('copy');
        } catch {
            ok = false;
        }
        box.remove();
        return ok;
    }
}

export default function CreatorCodesTab() {
    const [search, setSearch] = useState('');
    const [copied, setCopied] = useState<string | null>(null);

    const q = search.trim().toLowerCase();
    const shown = q
        ? CREATORS.filter(c => c.code.toLowerCase().includes(q) || c.player.toLowerCase().includes(q))
        : CREATORS;

    // Copies a code; if the browser won't, selects it on screen so the
    // player can copy it themselves.
    async function copy(code: string, codeEl: Element | null) {
        if (!await copyText(code)) {
            if (codeEl) window.getSelection()?.selectAllChildren(codeEl);
            return;
        }
        setCopied(code);
        trackEvent('Copy creator code', { code });
        setTimeout(() => setCopied(c => (c === code ? null : c)), 1500);
    }

    return (
        <div>
            <div className="relics-note cc-note">
                <strong>Support a creator:</strong> enter their code in the game&apos;s Settings, or on
                the <a href={WEBSTORE_URL} target="_blank" rel="noopener noreferrer">webstore</a>.
                They get 5% of what you spend in the game and 8% on the webstore, at no extra cost
                to you. A code stays active for 30 days.
            </div>

            <div className="modg-filters">
                <input
                    type="text"
                    className="search-bar"
                    style={{ margin: 0, flex: 1, minWidth: '160px' }}
                    placeholder="🔍  Search code or name..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <span className="cc-count">{shown.length} of {CREATORS.length} creators</span>
            </div>

            {shown.length === 0 && <div className="cc-empty">No creator matches “{search.trim()}”.</div>}

            <div className="cc-grid">
                {shown.map(c => {
                    const sites = SITES.filter(site => c.links[site]);
                    const avatar = AVATARS[creatorSlug(c.code)];
                    return (
                        <div key={c.code} className="cc-card">
                            <div className="cc-top">
                                <span className="cc-code">{c.code}</span>
                                <button
                                    className={`cc-copy ${copied === c.code ? 'done' : ''}`}
                                    onClick={e => copy(c.code, e.currentTarget.previousElementSibling)}
                                    aria-label={`Copy creator code ${c.code}`}
                                >
                                    {copied === c.code ? '✓ Copied' : 'Copy'}
                                </button>
                            </div>
                            <div className="cc-player">{c.player}</div>
                            <div className="cc-id">ID {c.playerId}</div>
                            {sites.length > 0 && (
                                <div className="cc-links">
                                    {sites.map(site => (
                                        site === 'youtube' && avatar ? (
                                            <a
                                                key={site}
                                                className="cc-avatar"
                                                href={c.links[site]}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={`${c.code} on YouTube`}
                                                aria-label={`${c.code} on YouTube`}
                                                onClick={() => trackEvent('Open creator link', { code: c.code, site })}
                                            >
                                                <img src={avatar} alt="" width={44} height={44} loading="lazy" />
                                            </a>
                                        ) : (
                                            <a
                                                key={site}
                                                className="cc-link"
                                                data-site={site}
                                                href={c.links[site]}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={() => trackEvent('Open creator link', { code: c.code, site })}
                                            >
                                                {CREATOR_SITES[site]}
                                            </a>
                                        )
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
