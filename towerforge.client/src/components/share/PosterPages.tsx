// ============================================================
//  TowerForge Companion — Poster Pages
//  The Export Image poster as one or more pages for Reddit (shapes
//  and why in posterLayout.ts). Every block is measured in a hidden
//  copy at poster width, then laid out page by page, each page with
//  the header ("Labs · 2/3") and footer, the pages filled evenly and
//  one height (the fullest page's). Export Image saves each
//  [data-poster-page] as its own image (posterImages.ts).
//  Heights are measured again when they change (fonts loading,
//  new data), so the pages always match what's drawn.
// ============================================================

import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, Ref } from 'react';
import { SHARE_CARD_WIDTH, shareRootStyle } from './shareTheme';
import { ShareHeader, ShareFooter } from './shareCommon';
import { paginateEvenly, POSTER_MAX_RATIO } from './posterLayout';
import type { PagePlan } from './posterLayout';

export interface PosterBlock {
    key: string;
    node: ReactNode;
    keepWithNext?: boolean;   // a heading: kept on the page of what follows it
    cont?: ReactNode;         // drawn first on a page this block opens when its heading is on an earlier one
}

const GAP = 10;
// Contains the children's margins, so a measured height is the drawn one.
const BOX: CSSProperties = { display: 'flow-root', minWidth: 0 };

interface Layout {
    pages: PagePlan[];
    height: number | undefined;   // shared page height when there's more than one
}

export default function PosterPages({ ref, title, subtitle, blocks, onPages }: {
    ref?: Ref<HTMLDivElement>;
    title: string;
    subtitle: string;
    blocks: PosterBlock[];
    onPages?: (count: number) => void;
}) {
    const measureRef = useRef<HTMLDivElement>(null);
    const [layout, setLayout] = useState<Layout | null>(null);
    const signature = `${title}|${subtitle}|${blocks.map(b => b.key).join(',')}`;

    useLayoutEffect(() => {
        const root = measureRef.current;
        if (!root) return;
        const measure = () => {
            const h = (name: string) => (root.querySelector<HTMLElement>(`[data-m="${name}"]`)?.offsetHeight ?? 0);
            const pad = parseFloat(getComputedStyle(root).paddingTop) || 0;
            const frame = 2 * pad + h('header') + h('footer');
            const heights = blocks.map((_, i) => h(`b${i}`));
            const pages = paginateEvenly({
                heights,
                keepWithNext: blocks.map(b => !!b.keepWithNext),
                contHeights: blocks.map((b, i) => (b.cont ? h(`c${i}`) : null)),
                avail: SHARE_CARD_WIDTH * POSTER_MAX_RATIO - frame,
                gap: GAP,
            });
            const height = pages.length > 1 ? Math.ceil(frame + Math.max(...pages.map(p => p.used))) : undefined;
            const next: Layout = { pages, height };
            setLayout(prev => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(root);
        return () => observer.disconnect();
        // blocks are rebuilt every render; their keys (in signature) say when the layout can change
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature]);

    const count = layout?.pages.length ?? 1;
    useLayoutEffect(() => { onPages?.(count); }, [count, onPages]);

    // Before the first measurement: everything on one page.
    const pages: PagePlan[] = layout?.pages ?? [{ cont: null, blocks: blocks.map((_, i) => i), used: 0 }];

    return (
        <>
            <div ref={measureRef} style={{ ...shareRootStyle(true), position: 'absolute', top: 0, left: 0, visibility: 'hidden' }} aria-hidden="true">
                <div data-m="header" style={BOX}><ShareHeader title={title} subtitle={`${subtitle} · 9/9`} /></div>
                {blocks.map((b, i) => <div key={b.key} data-m={`b${i}`} style={BOX}>{b.node}</div>)}
                {blocks.map((b, i) => b.cont && <div key={`${b.key}-c`} data-m={`c${i}`} style={BOX}>{b.cont}</div>)}
                <div data-m="footer" style={BOX}><ShareFooter /></div>
            </div>

            <div ref={ref}>
                {pages.map((page, n) => (
                    <div
                        key={n}
                        data-poster-page=""
                        style={{ ...shareRootStyle(true), display: 'flex', flexDirection: 'column', height: layout?.height, marginBottom: 24 }}
                    >
                        <div style={BOX}>
                            <ShareHeader title={title} subtitle={pages.length > 1 ? `${subtitle} · ${n + 1}/${pages.length}` : subtitle} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, flex: 1 }}>
                            {page.cont !== null && <div style={BOX}>{blocks[page.cont].cont}</div>}
                            {page.blocks.map(i => <div key={blocks[i].key} style={BOX}>{blocks[i].node}</div>)}
                        </div>
                        <div style={BOX}><ShareFooter /></div>
                    </div>
                ))}
            </div>
        </>
    );
}
