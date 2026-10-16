// ============================================================
//  TowerForge Companion — Share Image Shared Pieces
//  Header and footer shared by every poster-style share image.
// ============================================================

import { SHARE_COLORS } from './shareTheme';

export function ShareHeader({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div style={{ marginBottom: 24, borderBottom: `2px solid ${SHARE_COLORS.accent}`, paddingBottom: 14 }}>
            <div style={{ fontSize: 14, letterSpacing: 3, color: SHARE_COLORS.accent, textTransform: 'uppercase' }}>
                TowerForge
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
                <div style={{ fontSize: 38, fontWeight: 700 }}>{title}</div>
                <div style={{ fontSize: 17, color: SHARE_COLORS.dim }}>{subtitle}</div>
            </div>
        </div>
    );
}

export function ShareFooter() {
    return (
        <div style={{ marginTop: 24, paddingTop: 12, borderTop: `1px solid ${SHARE_COLORS.border}`, display: 'flex', justifyContent: 'space-between', fontSize: 14, color: SHARE_COLORS.dim }}>
            <span>Made with TowerForge Companion</span>
            <span>towerforge.net</span>
        </div>
    );
}

