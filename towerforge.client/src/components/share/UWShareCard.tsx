// ============================================================
//  TowerForge Companion — UW Share Card
//  The nine Ultimate Weapons: 3×3 on the poster, fewer columns on
//  narrow screens.
// ============================================================

import type { Ref } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { UWS, UW_STAT_VALUES, UW_PLUS_DATA } from '../../constants/gameData';
import type { UWAbbr, UWData } from '../../types/gameTypes';
import { SHARE_COLORS, shareRootStyle } from './shareTheme';
import { ShareHeader, ShareFooter } from './shareCommon';

// `snapshot` lets a shared link render someone else's data; without it the
// card reads the logged-in player's store.
export default function UWShareCard({ ref, snapshot, poster }: { ref?: Ref<HTMLDivElement>; snapshot?: UWData; poster?: boolean }) {
    const storeUwData = useGameStore(s => s.uwData);
    const uwData = snapshot ?? storeUwData;

    const ownedCount = UWS.filter(u => uwData.data[u.a]?.own).length;
    const plusCount = UWS.filter(u => uwData.data[u.a]?.upOwn).length;

    return (
        <div ref={ref} style={shareRootStyle(poster)}>
            <ShareHeader
                title="Ultimate Weapons"
                subtitle={`${ownedCount}/9 owned · ${plusCount}/9 UW+ unlocked`}
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 290px), 1fr))', gap: 16 }}>
                {UWS.map(uw => {
                    const ud = uwData.data[uw.a];
                    const owned = ud?.own ?? false;
                    const plusDef = UW_PLUS_DATA[uw.a as UWAbbr];
                    const upOwn = ud?.upOwn ?? false;
                    const upLvl = ud?.upLvl ?? 0;

                    return (
                        <div
                            key={uw.a}
                            style={{
                                background: SHARE_COLORS.panel,
                                border: `1px solid ${owned ? SHARE_COLORS.border : 'transparent'}`,
                                borderTop: `3px solid ${owned ? SHARE_COLORS.accent : SHARE_COLORS.locked}`,
                                borderRadius: 10,
                                padding: 16,
                                opacity: owned ? 1 : 0.5,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 19, fontWeight: 700 }}>{uw.n}</span>
                                <span style={{ fontSize: 13, color: SHARE_COLORS.dim }}>{uw.a}</span>
                            </div>

                            {!owned ? (
                                <div style={{ marginTop: 14, fontSize: 14, color: SHARE_COLORS.locked }}>Not owned</div>
                            ) : (
                                <>
                                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {uw.s.map(([statName, maxLv], statIdx) => {
                                            const lv = ud?.sv[statIdx] ?? 1;
                                            const val = UW_STAT_VALUES[uw.a as UWAbbr]?.[statIdx]?.[lv - 1] ?? '—';
                                            const isMax = lv >= maxLv;
                                            return (
                                                <div key={statName} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                                                    <span style={{ color: SHARE_COLORS.dim }}>{statName}</span>
                                                    <span>
                                                        <strong style={{ color: isMax ? SHARE_COLORS.gold : SHARE_COLORS.text }}>{val}</strong>
                                                        <span style={{ color: SHARE_COLORS.dim, fontSize: 12 }}> · Lv {lv}/{maxLv}</span>
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${SHARE_COLORS.border}`, fontSize: 14 }}>
                                        {upOwn && plusDef ? (
                                            <span>
                                                <span style={{ color: SHARE_COLORS.gold }}>{plusDef.name}</span>
                                                <span style={{ color: SHARE_COLORS.dim }}> · Lv {upLvl + 1}/{uw.upMax + 1} · </span>
                                                <strong>{plusDef.vals[upLvl] ?? '—'} {plusDef.unit}</strong>
                                            </span>
                                        ) : (
                                            <span style={{ color: SHARE_COLORS.locked }}>{plusDef?.name ?? uw.up} locked</span>
                                        )}
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
