// ============================================================
//  TowerForge Companion — Bot Badge
//  A bot's round icon as on the game's Bots screen: its art from
//  assets/bots, or a glyph in the bot's color when there's no icon.
//  Used by the Bots tab and the shared-stats Bots card.
// ============================================================

import { botIcon } from '../../constants/gameIcons';

// Stand-in badges for bots without a game icon in assets/bots.
const BOT_LOOK: Record<string, { glyph: string; color: string }> = {
    'Flame Bot': { glyph: '🔥', color: '#5b8cff' },
    'Thunder Bot': { glyph: '⚡', color: '#ff5a5a' },
    'Golden Bot': { glyph: 'C', color: '#f2a93b' },
    'Amplify Bot': { glyph: '✦', color: '#9d8cff' },
    'Bot Bot': { glyph: '⚙', color: '#a9c1d6' },
};

export default function BotBadge({ name }: { name: string }) {
    const icon = botIcon(name);
    if (icon) return <img className="botg-icon-img" src={icon} alt="" />;
    const look = BOT_LOOK[name] ?? { glyph: '●', color: 'var(--accent)' };
    return <span className="botg-icon" style={{ color: look.color }}>{look.glyph}</span>;
}
