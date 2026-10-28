// ============================================================
//  TowerForge Companion — UW Share Card
//  The nine Ultimate Weapons drawn like the game's UW screen (UWPanel):
//  each stat's value with its next cost or Max, and the UW+ along the
//  bottom. Two across on the poster (Reddit-shaped pages, PosterPages),
//  fewer on narrow screens.
// ============================================================

import type { Ref } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { UWS } from '../../constants/gameData';
import type { UWData } from '../../types/gameTypes';
import UWPanel from '../common/UWPanel';
import { shareRootStyle } from './shareTheme';
import { ShareHeader, ShareFooter } from './shareCommon';
import PosterPages from './PosterPages';
import type { PosterBlock } from './PosterPages';

const COLS = 2;

// `snapshot` lets a shared link render someone else's data; without it the
// card reads the logged-in player's store.
export default function UWShareCard({ ref, snapshot, poster, onPages }: {
    ref?: Ref<HTMLDivElement>;
    snapshot?: UWData;
    poster?: boolean;
    onPages?: (count: number) => void;
}) {
    const storeUwData = useGameStore(s => s.uwData);
    const uwData = snapshot ?? storeUwData;

    const ownedCount = UWS.filter(u => uwData.data[u.a]?.own).length;
    const plusCount = UWS.filter(u => uwData.data[u.a]?.upOwn).length;
    const title = 'Ultimate Weapons';
    const subtitle = `${ownedCount}/9 owned · ${plusCount}/9 UW+ unlocked`;
    // UW+ rows only where unlocked (a share has no stones to show prices with).
    const panel = (uw: typeof UWS[number]) => (
        <UWPanel key={uw.a} uw={uw} data={uwData.data[uw.a]} showPlus={false} />
    );

    if (poster) {
        const blocks: PosterBlock[] = [];
        for (let i = 0; i < UWS.length; i += COLS) {
            blocks.push({
                key: `uw:${i}`,
                node: (
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`, gap: 12 }}>
                        {UWS.slice(i, i + COLS).map(panel)}
                    </div>
                ),
            });
        }
        return <PosterPages ref={ref} title={title} subtitle={subtitle} onPages={onPages} blocks={blocks} />;
    }

    return (
        <div ref={ref} style={shareRootStyle(false)}>
            <ShareHeader title={title} subtitle={subtitle} />
            <div className="uwg-list">{UWS.map(panel)}</div>
            <ShareFooter />
        </div>
    );
}
