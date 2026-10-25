// ============================================================
//  TowerForge Companion — Modules Share Card
//  One module preset, drawn like the Modules tab (the game's Modules
//  screen): the tower with its primary and assist slots around it,
//  each module's badge in its rarity's glow with the slot level. Under
//  it each type's primary beside its assist, by name, rarity and stars
//  with what they do — the main effect (×value at the slot's level),
//  the unique effect (an assist's at its slot's tier) and the
//  substats. An assist also shows its slot: the unique-effect tier and
//  the Main and Substat efficiency its values are scaled by.
//  The ×value is the module card's own; the sender's primary efficiency
//  labs aren't part of the share. The poster is the same in bigger
//  type, over Reddit-shaped pages when it runs long (PosterPages).
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
import PosterPages from './PosterPages';
import type { PosterBlock } from './PosterPages';

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
// A number inside a substat value ("12%", "-100s") scaled by an efficiency,
// to 3 significant figures so a low efficiency doesn't round to 0.
const scaled = (val: string, eff: number) => val.replace(/-?\d+(\.\d+)?/, n => String(Number((Number(n) * eff).toPrecision(3))));
// Substat values carry their own sign when they lower something (cooldowns).
const signed = (val: string) => (/^[+-]/.test(val) ? val : `+${val}`);

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
                        {base ? `${signed(eff < 1 ? scaled(base, eff) : base)} ` : ''}{s.effect}
                    </span>
                );
            })}
        </div>
    );
}

export default function ModulesShareCard({ ref, loadout, library, slotLevels, assistData, equipped, showAssists, poster, onPages }: {
    ref?: Ref<HTMLDivElement>;
    loadout: Loadout;
    library: ModuleEntry[];
    slotLevels: SlotLevels;
    assistData?: AssistData;
    equipped?: boolean;
    showAssists: boolean;   // the sender has assist slots (an assist module or slot level anywhere)
    poster?: boolean;
    onPages?: (count: number) => void;
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

    const board = (
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
    );

    // One slot's module: name, rarity, main and unique effect, substats; an
    // assist with its slot's tier and efficiencies (also when it's empty).
    function card(type: ModuleType, key: SlotKey) {
        const mod = modAt(type, key);
        const isAssist = key === 'assist';
        const ad = isAssist ? assistOf(type) : null;
        const color = rarityColor(mod?.rarity);
        const stars = rarityStars(mod?.rarity);
        const lv = levelAt(type, key, mod);
        const value = mod ? calcModuleDamageMult(mod, lv) : 1;
        const unique = mod ? uniqueAt(mod, ad?.rarity) : null;
        const locked = isAssist && !ad;
        return (
            <div key={`${type}-${key}`} className={`shr-mod-row ${mod ? '' : 'empty'}`}>
                <ModuleBadge type={type} module={mod} size="var(--shr-badge)" />
                <div className="shr-mod-info">
                    <div className="shr-mod-name" style={{ color: mod ? color : undefined }}>
                        {mod?.name ?? (locked ? 'Locked' : 'Empty')}
                    </div>
                    <div className="shr-mod-meta">
                        {TYPE_LABELS[type]}{isAssist ? ' assist' : ''}
                        {mod && <> · <span style={{ color }}>{RARITIES.find(r => r.k === mod.rarity)?.label ?? mod.rarity}</span></>}
                        {stars > 0 && <span className="shr-mod-stars" style={{ color }}> {'★'.repeat(stars)}</span>}
                    </div>
                    {ad && (
                        <div className="shr-mod-slot">
                            <span>{ad.rarity} tier</span><span>Main {ad.multEff}%</span><span>Substats {ad.subEff}%</span>
                        </div>
                    )}
                    {mod && (
                        <div className="shr-mod-meta shr-mod-main">
                            {fmtMult(value)} {MAIN_EFFECT_LABELS[type]}
                            {ad && <> → <strong>{fmtMult(1 + (value - 1) * Math.min(1.3, ad.multEff / 100))}</strong></>}
                        </div>
                    )}
                    {unique && <div className="shr-mod-unique">{unique}</div>}
                    {mod && <Substats mod={mod} eff={ad ? Math.min(1, ad.subEff / 100) : 1} />}
                </div>
                {(mod || !locked) && <span className="shr-mod-lv">Lv.{lv}</span>}
            </div>
        );
    }

    // Each type's primary beside its assist; without assists, two primaries a row.
    const rows: ModuleType[][] = showAssists ? TYPE_ORDER.map(t => [t]) : [TYPE_ORDER.slice(0, 2), TYPE_ORDER.slice(2)];
    const rowNode = (types: ModuleType[]) => (
        <div className="shr-mod-pairs">
            {types.flatMap(t => (showAssists ? [card(t, 'main'), card(t, 'assist')] : [card(t, 'main')]))}
        </div>
    );
    const title = 'Modules';
    const subtitle = `${loadout.name || 'Preset'}${equipped ? ' · equipped' : ''}`;

    if (poster) {
        const blocks: PosterBlock[] = [
            { key: 'board', node: <div className="shr-mod shr-mod-poster">{board}</div> },
            ...rows.map((types): PosterBlock => ({ key: types.join('-'), node: <div className="shr-mod shr-mod-poster">{rowNode(types)}</div> })),
        ];
        return <PosterPages ref={ref} title={title} subtitle={subtitle} blocks={blocks} onPages={onPages} />;
    }

    return (
        <div ref={ref} style={shareRootStyle(false)}>
            <ShareHeader title={title} subtitle={subtitle} />
            <div className="shr-mod">
                {board}
                {rows.map(types => <div key={types.join('-')}>{rowNode(types)}</div>)}
            </div>
            <ShareFooter />
        </div>
    );
}
