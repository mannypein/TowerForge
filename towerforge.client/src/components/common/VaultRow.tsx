// ============================================================
//  TowerForge Companion — Vault Row
//  A Vault upgrade drawn like the game's Vault list: its picture, name
//  and what it gives, with "MAX", "Lv. 1/4" or "1 Level" in the corner
//  — gold when maxed, light blue when partly bought, lavender when not
//  bought (the owner's Vault screen, 2026-10-28). On the Vault page it
//  also shows what the next level costs and − / + to set the level;
//  read-only in share images. Styles: .vltg in tabs.css.
// ============================================================

import type { VaultUpgrade } from '../../constants/vaultData';
import { vaultIcon } from '../../constants/gameIcons';

const n = (v: number) => v.toLocaleString();

export default function VaultRow({ u, level, fallback, used, onLevel }: {
    u: VaultUpgrade;
    level: number;
    fallback?: string;                   // drawn when there's no picture (e.g. the enemy's initial)
    used?: string;                       // where the site's models count it
    onLevel?: (level: number) => void;   // the Vault page: − / + and the costs
}) {
    const max = u.costs.length;
    const lv = Math.max(0, Math.min(max, level));
    const maxed = lv >= max;
    const state = maxed ? 'maxed' : lv > 0 ? 'partial' : 'none';
    const icon = vaultIcon(u.id, lv);
    const badge = maxed ? 'MAX' : max === 1 ? '1 Level' : `Lv. ${lv}/${max}`;
    const left = u.costs.slice(lv).reduce((a, b) => a + b, 0);
    return (
        <div className={`vltg ${state}`}>
            <div className="vltg-icon">
                {icon ? <img src={icon} alt="" draggable={false} /> : <span>{fallback ?? u.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2)}</span>}
            </div>
            <div className="vltg-text">
                <div className="vltg-top">
                    <span className="vltg-name">{u.name}</span>
                    <span className="vltg-badge">{badge}</span>
                </div>
                <div className="vltg-desc">{u.effect(Math.max(1, lv))}</div>
                {onLevel && (
                    <div className="vltg-edit">
                        <span className="vltg-cost">
                            {maxed ? 'Maxed' : max === 1 ? `${n(u.costs[0])} 🔑` : `Next ${n(u.costs[lv])} 🔑 · ${n(left)} 🔑 to max`}
                            {u.note && <span className="vltg-note"> · {u.note}</span>}
                            {used && <span className="vltg-used"> · {used}</span>}
                        </span>
                        <span className="vltg-btns">
                            <button type="button" disabled={lv <= 0} onClick={() => onLevel(lv - 1)} aria-label={`${u.name}: one level less`}>−</button>
                            <button type="button" disabled={maxed} onClick={() => onLevel(lv + 1)} aria-label={`${u.name}: one level more`}>+</button>
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
