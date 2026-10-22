// ============================================================
//  TowerForge Companion — Modules Share Card
//  One module preset, drawn like the Modules tab (the game's Modules
//  screen): the tower with its primary and assist slots around it,
//  each module's badge in its rarity's glow with the slot level, and
//  next to it the modules by name, rarity and stars — an assist with its
//  slot's unique-effect tier and Main / Substat efficiency.
// ============================================================

import type { Ref } from 'react';
import type { AssistData, Loadout, ModuleEntry, ModuleType, SlotLevels } from '../../types/gameTypes';
import { RARITIES, moduleMaxLevel, rarityColor, rarityStars } from '../../constants/moduleRarities';
import { BOARD } from '../../constants/moduleBoard';
import type { SlotKey } from '../../constants/moduleBoard';
import ModuleBadge from '../common/ModuleBadge';
import TowerArt from '../common/TowerArt';
import { shareRootStyle } from './shareTheme';
import { ShareHeader, ShareFooter } from './shareCommon';

const TYPE_ORDER: ModuleType[] = ['cannon', 'armor', 'generator', 'core'];
const TYPE_LABELS: Record<ModuleType, string> = { cannon: 'Cannon', armor: 'Armor', generator: 'Generator', core: 'Core' };

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
                                    {key === 'assist' && assistData?.[type] && assistData[type].rarity !== 'locked' && (
                                        <div className="shr-mod-meta">
                                            {assistData[type].rarity} tier · Main {assistData[type].multEff}% · Substats {assistData[type].subEff}%
                                        </div>
                                    )}
                                </div>
                                <span className="shr-mod-lv">Lv.{levelAt(type, key, mod)}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            <ShareFooter />
        </div>
    );
}
