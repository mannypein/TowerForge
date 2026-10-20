// ============================================================
//  TowerForge Companion — Share Image Shared Pieces
//  Header and footer shared by every poster-style share image.
// ============================================================

import { SHARE_COLORS } from './shareTheme';

export function ShareHeader({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div style={{ marginBottom: 'clamp(14px, 2.2cqw, 24px)', borderBottom: `2px solid ${SHARE_COLORS.accent}`, paddingBottom: 14 }}>
            <div style={{ fontSize: 14, letterSpacing: 3, color: SHARE_COLORS.accent, textTransform: 'uppercase' }}>
                TowerForge
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '2px 16px', marginTop: 4 }}>
                <div style={{ fontSize: 'clamp(26px, 3.5cqw, 38px)', fontWeight: 700 }}>{title}</div>
                <div style={{ fontSize: 'clamp(13px, 1.6cqw, 17px)', color: SHARE_COLORS.dim }}>{subtitle}</div>
            </div>
        </div>
    );
}

export function ShareFooter() {
    return (
        <div style={{ marginTop: 'clamp(14px, 2.2cqw, 24px)', paddingTop: 12, borderTop: `1px solid ${SHARE_COLORS.border}`, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, fontSize: 14, color: SHARE_COLORS.dim }}>
            <span>Made with TowerForge Companion</span>
            <span>towerforge.net</span>
        </div>
    );
}

