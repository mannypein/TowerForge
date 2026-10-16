// ============================================================
//  TowerForge Companion — Modules Share Card
//  Viewer/export poster: each loadout with its main and assist modules.
// ============================================================

import type { Ref } from 'react';
import type { ModuleType, SlotLevels, Loadout, ModuleEntry } from '../../types/gameTypes';
import { RARITIES } from '../../constants/moduleRarities';
import { SHARE_COLORS, SHARE_CARD_ROOT_STYLE } from './shareTheme';
import { ShareHeader, ShareFooter } from './shareCommon';

const TYPE_ORDER: ModuleType[] = ['cannon', 'armor', 'generator', 'core'];

export default function ModulesShareCard({ ref, loadouts, library, slotLevels }: {
    ref: Ref<HTMLDivElement>;
    loadouts: Loadout[];
    library: ModuleEntry[];
    slotLevels: SlotLevels;
}) {
    const byId = new Map(library.map(m => [m.id, m]));

    function slotText(modId: string, type: ModuleType, pos: 'main' | 'assist') {
        const mod = byId.get(modId);
        if (!mod) return { name: '—', meta: '', lvl: '' };
        const rarity = RARITIES.find(r => r.k === mod.rarity)?.label ?? mod.rarity;
        return {
            name: mod.name,
            meta: rarity,
            lvl: `Lv ${slotLevels?.[type]?.[pos] ?? 0}`,
        };
    }

    return (
        <div ref={ref} style={SHARE_CARD_ROOT_STYLE}>
            <ShareHeader title="Module Loadouts" subtitle={`${loadouts.length} loadout${loadouts.length === 1 ? '' : 's'}`} />

            {loadouts.length === 0 ? (
                <div style={{ fontSize: 16, color: SHARE_COLORS.dim }}>No loadouts saved.</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                    {loadouts.map(lo => (
                        <div
                            key={lo.id}
                            style={{
                                background: SHARE_COLORS.panel,
                                border: `1px solid ${SHARE_COLORS.border}`,
                                borderRadius: 10,
                                padding: 16,
                            }}
                        >
                            <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 10 }}>{lo.name}</div>

                            {TYPE_ORDER.map(type => (
                                <div key={type} style={{ marginBottom: 8 }}>
                                    <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: SHARE_COLORS.dim }}>
                                        {type}
                                    </div>
                                    {(['main', 'assist'] as const).map(pos => {
                                        const t = slotText(lo.slots[type]?.[pos] ?? '', type, pos);
                                        const color = pos === 'assist' ? SHARE_COLORS.gold : SHARE_COLORS.accent;
                                        return (
                                            <div key={pos} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginTop: 3 }}>
                                                <span>
                                                    <span style={{ color, marginRight: 8, fontSize: 12 }}>{pos === 'main' ? 'Main' : 'Asst'}</span>
                                                    {t.name}
                                                    {t.meta && <span style={{ color: SHARE_COLORS.dim, fontSize: 12 }}> · {t.meta}</span>}
                                                </span>
                                                <span style={{ color: SHARE_COLORS.dim, fontSize: 12 }}>{t.lvl}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}

            <ShareFooter />
        </div>
    );
}
