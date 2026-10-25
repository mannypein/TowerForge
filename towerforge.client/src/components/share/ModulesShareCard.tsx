// ============================================================
//  TowerForge Companion — Modules Share Card
//  One module preset, drawn like the Modules tab (the game's Modules
//  screen): the tower with its primary and assist slots around it,
//  each module's badge in its rarity's glow with the slot level, and
//  next to it the modules by name, rarity and stars with what they do —
//  the main effect (×value at the slot's level), the unique effect (an
//  assist's at its slot's tier) and the substats. Then the Assist
//  panel: each type's assist tier, Main and Substat efficiency, and what
//  the assist module gives at those efficiencies.
//  The ×value is the module card's own; the sender's primary efficiency
//  labs aren't part of the share.
// ============================================================

import type { Ref } from 'react';
import type { AssistData, Loadout, ModuleEntry, ModuleType, SlotLevels } from '../../types/gameTypes';
import { RARITIES, moduleMaxLevel, rarityColor, rarityStars } from '../../constants/moduleRarities';
import { MAIN_EFFECT_LABELS, RARITY_TIER, subEffectValue, uniqueDescription } from '../../constants/moduleData';
import type { SubRarity } from '../../constants/moduleData';
import { BOARD } from '../../constants/moduleBoard';
import type { SlotKey } from '../../constants/moduleBoard';
import { calcModuleDamageMult } from '../../engine/towerDamage';
import ModuleBadge from '../common/ModuleBadge';
import TowerArt from '../common/TowerArt';
import { shareRootStyle } from './shareTheme';
import { ShareHeader, ShareFooter } from './shareCommon';

const TYPE_ORDER: ModuleType[] = ['cannon', 'armor', 'generator', 'core'];
const TYPE_LABELS: Record<ModuleType, string> = { cannon: 'Cannon', armor: 'Armor', generator: 'Generator', core: 'Core' };
const SUB_COLOR: Record<string, string> = { Common: 'C', Rare: 'R', Epic: 'E', Legendary: 'L', Mythic: 'M', Ancestral: 'A' };

// An assist runs its unique effect at the slot's tier, never above the
// module's own (engine/modBonuses getActiveUniques).
const TIERS = ['Epic', 'Legendary', 'Mythic', 'Ancestral'] as const;
const TIER_CODE: Record<typeof TIERS[number], ModuleEntry['rarity']> = { Epic: 'E', Legendary: 'L', Mythic: 'M', Ancestral: 'A' };
function uniqueAt(mod: ModuleEntry, assistTier?: string): string | null {
    if (!assistTier) return uniqueDescription(mod.type, mod.name, mod.rarity);
    const own = TIERS.indexOf(RARITY_TIER[mod.rarity] ?? 'Epic');
    const slot = TIERS.indexOf(assistTier as typeof TIERS[number]);
    if (slot < 0) return null;
    return uniqueDescription(mod.type, mod.name, TIER_CODE[TIERS[Math.min(own, slot)]]);
}

const fmtMult = (v: number) => `×${v >= 10 ? v.toFixed(2) : v.toFixed(3)}`;
// A number inside a substat value ("12%", "1.5x") scaled by an efficiency.
const scaled = (val: string, eff: number) => val.replace(/-?\d+(\.\d+)?/, n => String(Math.round(Number(n) * eff * 100) / 100));

// A module's substats, scaled by the assist's Substat efficiency (1 for primaries).
function Substats({ mod, eff }: { mod: ModuleEntry; eff: number }) {
    const subs = (mod.subs ?? []).filter(s => s.effect);
    if (subs.length === 0) return null;
    return (
        <div className="shr-mod-subs">
            {subs.map((s, i) => {
                const base = subEffectValue(mod.type, s.effect, s.rar as SubRarity) ?? s.val;
                const color = rarityColor((SUB_COLOR[s.rar] ?? 'C') as ModuleEntry['rarity']);
                return (
                    <span key={i} className="shr-mod-sub" style={{ color, borderColor: color }}>
                        {base ? `+${eff < 1 ? scaled(base, eff) : base} ` : ''}{s.effect}
                    </span>
                );
            })}
            {eff < 1 && <span className="shr-mod-sub-note">at {Math.round(eff * 100)}% Substats</span>}
        </div>
    );
}

export default function ModulesShareCard({ ref, loadout, library, slotLevels, assistData, equipped, showAssists, poster }: {
    ref?: Ref<HTMLDivElement>;
    loadout: Loadout;
    library: ModuleEntry[];
    slotLevels: SlotLevels;
    assistData?: AssistData;
    equipped?: boolean;
    showAssists: boolean;   // the sender has assist slots (an assist module or slot level anywhere)
    poster?: boolean;
}) {
    const byId = new Map(library.map(m => [m.id, m]));
    const modAt = (type: ModuleType, slot: SlotKey) => byId.get(loadout.slots[type]?.[slot] ?? '') ?? null;
    // A slot's level, shown no higher than the module's rarity allows (as in game).
    const levelAt = (type: ModuleType, slot: SlotKey, mod: ModuleEntry | null) => {
        const lv = slotLevels?.[type]?.[slot] ?? 0;
        return mod ? Math.min(lv, moduleMaxLevel(mod.rarity)) : lv;
    };
    const assistOf = (type: ModuleType) => {
        const ad = assistData?.[type];
        return ad && ad.rarity !== 'locked' ? ad : null;
    };

    function slot(type: ModuleType, key: SlotKey) {
        const isAssist = key === 'assist';
        if (isAssist && !showAssists) return <span key={`${type}-${key}`} className="modg-slot small" />;
        const mod = modAt(type, key);
        return (
            <div key={`${type}-${key}`} className={`modg-slot ${isAssist ? 'small' : 'big'}`}>
                <ModuleBadge type={type} module={mod} size={isAssist ? 'var(--slot-small)' : 'var(--slot-big)'}
                    title={`${TYPE_LABELS[type]} ${isAssist ? 'assist' : 'primary'}${mod ? ` — ${mod.name}` : ' — empty'}`} />
                <span className="modg-slot-lv">Lv.{levelAt(type, key, mod)}</span>
            </div>
        );
    }

    // The list: every primary, then the assists that hold a module.
    const rows = TYPE_ORDER.flatMap(type => (['main', 'assist'] as SlotKey[])
        .filter(key => key === 'main' || modAt(type, key))
        .map(key => ({ type, key, mod: modAt(type, key) })));
    const assists = TYPE_ORDER.filter(t => assistOf(t));

    return (
        <div ref={ref} style={shareRootStyle(poster)}>
            <ShareHeader title="Modules" subtitle={`${loadout.name || 'Preset'}${equipped ? ' · equipped' : ''}`} />

            <div className="shr-mod">
                <div className="modg-board">
                    <div className="modg-side">
                        <div className="modg-pair">{BOARD[0].map(([t, s]) => slot(t, s))}</div>
                        <div className="modg-pair">{BOARD[2].map(([t, s]) => slot(t, s))}</div>
                    </div>
                    <TowerArt />
                    <div className="modg-side">
                        <div className="modg-pair">{BOARD[1].map(([t, s]) => slot(t, s))}</div>
                        <div className="modg-pair">{BOARD[3].map(([t, s]) => slot(t, s))}</div>
                    </div>
                </div>

                <div className="shr-mod-list">
                    {rows.map(({ type, key, mod }) => {
                        const color = rarityColor(mod?.rarity);
                        const stars = rarityStars(mod?.rarity);
                        const lv = levelAt(type, key, mod);
                        const ad = key === 'assist' ? assistOf(type) : null;
                        const value = mod ? calcModuleDamageMult(mod, lv) : 1;
                        const unique = mod ? uniqueAt(mod, key === 'assist' ? ad?.rarity : undefined) : null;
                        return (
                            <div key={`${type}-${key}`} className="shr-mod-row">
                                <ModuleBadge type={type} module={mod} size={44} />
                                <div className="shr-mod-info">
                                    <div className="shr-mod-name" style={{ color: mod ? color : undefined }}>{mod?.name ?? 'Empty'}</div>
                                    <div className="shr-mod-meta">
                                        {TYPE_LABELS[type]}{key === 'assist' ? ' assist' : ''}
                                        {mod && <> · <span style={{ color }}>{RARITIES.find(r => r.k === mod.rarity)?.label ?? mod.rarity}</span></>}
                                        {stars > 0 && <span className="shr-mod-stars" style={{ color }}> {'★'.repeat(stars)}</span>}
                                    </div>
                                    {mod && (
                                        <div className="shr-mod-meta shr-mod-main">
                                            {fmtMult(value)} {MAIN_EFFECT_LABELS[type]}
                                            {ad && <> → {fmtMult(1 + (value - 1) * Math.min(1.3, ad.multEff / 100))} at {ad.multEff}% Main</>}
                                        </div>
                                    )}
                                    {unique && <div className="shr-mod-unique">{unique}</div>}
                                    {mod && <Substats mod={mod} eff={ad ? Math.min(1, ad.subEff / 100) : 1} />}
                                </div>
                                <span className="shr-mod-lv">Lv.{lv}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {assists.length > 0 && (
                <div className="shr-assists">
                    <div className="shr-assists-title">Assist slots</div>
                    <div className="shr-assist-grid">
                        {assists.map(type => {
                            const ad = assistOf(type)!;
                            const mod = modAt(type, 'assist');
                            const lv = levelAt(type, 'assist', mod);
                            const value = mod ? calcModuleDamageMult(mod, lv) : null;
                            return (
                                <div key={type} className="shr-assist">
                                    <div className="shr-assist-head">
                                        <strong>{TYPE_LABELS[type]} assist</strong>
                                        <span>Lv.{lv}</span>
                                    </div>
                                    <div className="shr-assist-row"><span>Unique-effect tier</span><strong>{ad.rarity}</strong></div>
                                    <div className="shr-assist-row"><span>Main effect</span><strong>{ad.multEff}%</strong></div>
                                    <div className="shr-assist-row"><span>Substats</span><strong>{ad.subEff}%</strong></div>
                                    <div className="shr-assist-mod" style={{ color: mod ? rarityColor(mod.rarity) : undefined }}>
                                        {mod ? mod.name : 'No module in this preset'}
                                    </div>
                                    {mod && value !== null && (
                                        <div className="shr-mod-meta">
                                            {fmtMult(1 + (value - 1) * Math.min(1.3, ad.multEff / 100))} {MAIN_EFFECT_LABELS[type]}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <ShareFooter />
        </div>
    );
}
