// ============================================================
//  TowerForge Companion — Bots Share Card
//  One preset's bots, drawn like the Bots tab (the game's Bots
//  screen): each bot's card with its icon and ON / OFF, its four
//  medal stats (gold once maxed) and Bot+. Values are the medal
//  levels' own — the viewer doesn't have the sender's labs or relics.
// ============================================================

import type { Ref } from 'react';
import type { BotData } from '../../types/gameTypes';
import { BOTS_CONFIG, isBotEntryOwned, isBotPlusOwned } from '../../constants/botData';
import BotBadge from '../common/BotBadge';
import { shareRootStyle } from './shareTheme';
import { ShareHeader, ShareFooter } from './shareCommon';

// `activeBots` (optional) marks which owned bots are on in the shown
// preset; without it (old shares) every owned bot shows as on.
export default function BotsShareCard({ ref, bots, title, activeBots, poster }: {
    ref?: Ref<HTMLDivElement>;
    bots: BotData;
    title: string;
    activeBots?: string[];
    poster?: boolean;
}) {
    const ownedCount = BOTS_CONFIG.filter(b => isBotEntryOwned(bots[b.name])).length;
    const isOn = (name: string) => isBotEntryOwned(bots[name]) && (activeBots?.includes(name) ?? true);
    const onCount = BOTS_CONFIG.filter(b => isOn(b.name)).length;

    return (
        <div ref={ref} style={shareRootStyle(poster)}>
            <ShareHeader title="Bots" subtitle={`${title} · ${onCount} on · ${ownedCount}/${BOTS_CONFIG.length} owned`} />

            <div className="shr-bots">
                {BOTS_CONFIG.map(bot => {
                    const entry = bots[bot.name];
                    const owned = isBotEntryOwned(entry);
                    const on = isOn(bot.name);
                    const medals = entry?.medals ?? [];
                    const plusOwned = isBotPlusOwned(entry);
                    const plusLv = Math.min(entry?.plusLv ?? 0, bot.plusMax);
                    const plusMaxed = plusLv >= bot.plusMax;

                    return (
                        <div key={bot.name} className={`botg-card ${on ? 'on' : ''} ${owned ? '' : 'shr-bot-locked'}`}>
                            <div className="botg-head">
                                <BotBadge name={bot.name} />
                                <span className="botg-name">{bot.name}</span>
                                {owned ? (
                                    <span className={`botg-switch ${on ? 'on' : ''}`} role="img" aria-label={on ? 'On' : 'Off'}>
                                        <span className="botg-switch-text">{on ? 'ON' : 'OFF'}</span>
                                        <span className="botg-switch-knob" />
                                    </span>
                                ) : <span className="botg-head-spacer" />}
                            </div>

                            {!owned ? (
                                <div className="shr-bot-note">Not unlocked</div>
                            ) : (
                                <>
                                    <div className="botg-stats">
                                        {bot.stats.map((stat, idx) => {
                                            const lv = medals[idx] ?? 0;
                                            const max = stat.values.length;
                                            const maxed = lv >= max;
                                            return (
                                                <div key={stat.label} className={`botg-stat ${maxed ? 'maxed' : ''}`}>
                                                    <span className="botg-stat-label">{stat.label}</span>
                                                    <span className="botg-stat-value">{lv > 0 ? stat.values[Math.min(lv, max) - 1] : stat.lv0}</span>
                                                    <span className="botg-stat-foot shr-stat-foot">{maxed ? 'Max' : `Lv ${lv}/${max}`}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {plusOwned && (
                                        <div className={`botg-plusbox shr-plusbox ${plusMaxed ? 'maxed' : ''}`}>
                                            <span className="botg-plusbox-label">Bot+ · {bot.plus.label}</span>
                                            <span className="botg-plusbox-value">
                                                {plusLv > 0 ? bot.plus.values[plusLv - 1] : bot.plus.lv0}
                                            </span>
                                            <span className="botg-plusbox-steps">{plusMaxed ? 'Max' : `Lv ${plusLv}/${bot.plusMax}`}</span>
                                        </div>
                                    )}
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
