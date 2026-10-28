// ============================================================
//  TowerForge Companion — Module shard icons
//  Each module currency's icon, simplified from the game's: Reroll
//  Shards, and each type's shards in its module shape (cannon circle,
//  armor square, generator triangle, core diamond). Styled by
//  .modg-shard in tabs.css.
// ============================================================

import type { ModuleType } from '../../types/gameTypes';

export default function ShardIcon({ kind }: { kind: 'reroll' | ModuleType }) {
    const shape = {
        reroll: <><polygon points="12,2 21,7 21,17 12,22 3,17 3,7" /><circle cx="12" cy="12" r="3.5" /></>,
        cannon: <circle cx="12" cy="12" r="8.5" />,
        armor: <rect x="4" y="4" width="16" height="16" rx="2.5" />,
        generator: <polygon points="12,3.5 21,19.5 3,19.5" />,
        core: <polygon points="12,2.5 21.5,12 12,21.5 2.5,12" />,
    }[kind];
    return <svg className="modg-shard" viewBox="0 0 24 24" aria-hidden="true">{shape}</svg>;
}
