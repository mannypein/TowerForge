// ============================================================
//  TowerForge Companion — Stats Share Card
//  A share card of named values in groups — Profile, Workshop, Labs,
//  Relics, Guardian (components/share/shareSections.ts builds them):
//  each group a heading and a grid of tiles, maxed values in gold.
//  Fluid on the shared-stats page, fixed width as the Export Image
//  poster (shareTheme).
// ============================================================

import type { Ref } from 'react';
import { SHARE_COLORS, shareRootStyle } from './shareTheme';
import { ShareHeader, ShareFooter } from './shareCommon';

export interface StatTile {
    name: string;
    value: string;
    note?: string;       // under the value (levels, "equipped")
    maxed?: boolean;     // drawn in gold
}

export interface StatGroup {
    label: string;
    note?: string;       // next to the heading
    tiles: StatTile[];
}

export default function StatsShareCard({ ref, title, subtitle, groups, empty, poster }: {
    ref?: Ref<HTMLDivElement>;
    title: string;
    subtitle: string;
    groups: StatGroup[];
    empty?: string;      // shown when no group has a tile
    poster?: boolean;
}) {
    const shown = groups.filter(g => g.tiles.length > 0);
    return (
        <div ref={ref} style={shareRootStyle(poster)}>
            <ShareHeader title={title} subtitle={subtitle} />

            {shown.map(group => (
                <div key={group.label} style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '2px 10px', marginBottom: 8 }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: SHARE_COLORS.accent }}>{group.label}</span>
                        {group.note && <span style={{ fontSize: 13, color: SHARE_COLORS.dim }}>{group.note}</span>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 200px), 1fr))', gap: 8 }}>
                        {group.tiles.map(t => (
                            <div
                                key={t.name}
                                style={{
                                    background: SHARE_COLORS.panel,
                                    border: `1px solid ${t.maxed ? SHARE_COLORS.gold : SHARE_COLORS.border}`,
                                    borderRadius: 8,
                                    padding: '8px 10px',
                                    minWidth: 0,
                                }}
                            >
                                <div style={{ fontSize: 13, color: SHARE_COLORS.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {t.name}
                                </div>
                                <div style={{ marginTop: 2, fontSize: 17, fontWeight: 700, color: t.maxed ? SHARE_COLORS.gold : SHARE_COLORS.text, overflowWrap: 'anywhere' }}>
                                    {t.value}
                                </div>
                                {t.note && <div style={{ marginTop: 1, fontSize: 12, color: SHARE_COLORS.dim }}>{t.note}</div>}
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            {shown.length === 0 && <div style={{ fontSize: 16, color: SHARE_COLORS.dim }}>{empty ?? 'Nothing to show yet.'}</div>}

            <ShareFooter />
        </div>
    );
}
