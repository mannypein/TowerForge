// ============================================================
//  TowerForge Companion — Currency Bar
//  The game's currencies, shown under the header on every tab.
//  Filled by "Import Game Data" and editable by hand; values accept
//  the game's suffixes (e.g. "29.95Q").
// ============================================================

import { useRef, useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { formatGameNumber, parseGameNumber } from '../../engine/gameNumbers';
import stoneIcon from '../../assets/stone.png';
import type { Currencies } from '../../types/gameTypes';

const FIELDS: { key: keyof Currencies; label: string; icon: string | null }[] = [
    { key: 'coins', label: 'Coins', icon: '🪙' },
    { key: 'gems', label: 'Gems', icon: '💎' },
    { key: 'stones', label: 'Stones', icon: null },   // uses the stone image
    { key: 'medals', label: 'Medals', icon: '🏅' },
    { key: 'cells', label: 'Cells', icon: '🔋' },
    { key: 'keys', label: 'Keys', icon: '🔑' },
    { key: 'tokens', label: 'Tokens', icon: '🎟️' },
    { key: 'bits', label: 'Bits', icon: '💾' },
];

function CurrencyField({ label, value, onCommit }: { label: string; value: number; onCommit: (n: number) => void }) {
    const [draft, setDraft] = useState<string | null>(null);
    const cancelled = useRef(false);

    function commit() {
        if (!cancelled.current && draft !== null) {
            const n = parseGameNumber(draft);
            if (Number.isFinite(n) && n >= 0) onCommit(n);
        }
        cancelled.current = false;
        setDraft(null);
    }

    return (
        <input
            className="cur-input"
            aria-label={label}
            value={draft ?? formatGameNumber(value)}
            onFocus={e => { setDraft(formatGameNumber(value)); e.currentTarget.select(); }}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') { cancelled.current = true; e.currentTarget.blur(); }
            }}
        />
    );
}

export default function CurrencyBar() {
    const currencies = useGameStore(s => s.currencies);
    const setCurrency = useGameStore(s => s.setCurrency);

    return (
        <div className="currency-bar">
            {FIELDS.map(f => (
                <label key={f.key} className="cur-item" title={`${f.label} — click to edit (e.g. 29.95Q)`}>
                    {f.icon
                        ? <span className="cur-icon" aria-hidden="true">{f.icon}</span>
                        : <img src={stoneIcon} alt="" className="cur-icon-img" />}
                    <span className="cur-label">{f.label}</span>
                    <CurrencyField label={f.label} value={currencies[f.key]} onCommit={n => setCurrency(f.key, n)} />
                </label>
            ))}
        </div>
    );
}
