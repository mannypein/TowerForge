// ============================================================
//  TowerForge Companion — Bots Share Card
//  Viewer/export poster: every bot's medal levels and Bot+.
// ============================================================

import type { Ref } from 'react';
import type { BotData } from '../../types/gameTypes';
import { BOTS_CONFIG, isBotEntryOwned } from '../../constants/botData';
import { SHARE_COLORS, SHARE_CARD_ROOT_STYLE } from './shareTheme';
import { ShareHeader, ShareFooter } from './shareCommon';

// `activeBots` (optional) marks which owned bots are on in the shown preset;
// owned bots missing from it are drawn dimmed as "Off in this preset".
export default function BotsShareCard({ ref, bots, title, activeBots }: {
    ref: Ref<HTMLDivElement>;
    bots: BotData;
    title: string;
    activeBots?: string[];
}) {
    const ownedCount = BOTS_CONFIG.filter(b => isBotEntryOwned(bots[b.name])).length;
    const activeCount = activeBots
        ? BOTS_CONFIG.filter(b => isBotEntryOwned(bots[b.name]) && activeBots.includes(b.name)).length
        : ownedCount;

    return (
        <div ref={ref} style={SHARE_CARD_ROOT_STYLE}>
            <ShareHeader title="Bots" subtitle={`${title} · ${activeCount} active · ${ownedCount}/${BOTS_CONFIG.length} owned`} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {BOTS_CONFIG.map(bot => {
                    const entry = bots[bot.name];
                    const owned = isBotEntryOwned(entry);
                    const off = owned && activeBots !== undefined && !activeBots.includes(bot.name);
                    const medals = entry?.medals ?? [];
                    const plusLv = entry?.plusLv ?? 0;

                    return (
                        <div
                            key={bot.name}
                            style={{
                                background: SHARE_COLORS.panel,
                                border: `1px solid ${SHARE_COLORS.border}`,
                                borderTop: `3px solid ${owned && !off ? SHARE_COLORS.accent : SHARE_COLORS.locked}`,
                                borderRadius: 10,
                                padding: 16,
                                opacity: owned && !off ? 1 : 0.5,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 19, fontWeight: 700 }}>{bot.name}</span>
                                {off && <span style={{ fontSize: 12, color: SHARE_COLORS.dim }}>Off in this preset</span>}
                            </div>

                            {!owned ? (
                                <div style={{ marginTop: 14, fontSize: 14, color: SHARE_COLORS.locked }}>Not owned</div>
                            ) : (
                                <>
                                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {bot.stats.map((stat, idx) => {
                                            const lv = medals[idx] ?? 0;
                                            const max = stat.values.length;
                                            const val = lv > 0 ? stat.values[lv - 1] : stat.lv0;
                                            return (
                                                <div key={stat.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                                                    <span style={{ color: SHARE_COLORS.dim }}>{stat.label}</span>
                                                    <span>
                                                        <strong style={{ color: lv >= max ? SHARE_COLORS.gold : SHARE_COLORS.text }}>{val}</strong>
                                                        <span style={{ color: SHARE_COLORS.dim, fontSize: 12 }}> · Lv {lv}/{max}</span>
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${SHARE_COLORS.border}`, fontSize: 14 }}>
                                        <span style={{ color: plusLv >= bot.plusMax ? SHARE_COLORS.gold : SHARE_COLORS.text }}>
                                            Bot+ {plusLv}/{bot.plusMax}
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>

            <ShareFooter />
        </div>
    );
}
