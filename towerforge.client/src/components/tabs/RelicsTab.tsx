// ============================================================
//  TowerForge Companion — Relics Tab
//  Enter total bonus per category as shown in-game.
// ============================================================

import { useGameStore } from '../../store/useGameStore';
import { RELICS } from '../../constants/gameData';
import NumericInput from '../common/NumericInput';

export default function RelicsTab() {
    const relicData = useGameStore(s => s.relicData);
    const setRelic = useGameStore(s => s.setRelic);

    // Count filled relics
    const filled = Object.values(RELICS)
        .flat()
        .filter(([key]) => (relicData[key] ?? 0) > 0).length;

    const total = Object.values(RELICS).flat().length;

    return (
        <div>
            {/* ── Note ── */}
            <div className="relics-note">
                <strong>Quick Entry:</strong> In game, open Profile → Relics and tap the ⓘ at
                the top left. It lists every relic bonus total in this same order — copy them
                top to bottom. (Relics don&apos;t come from Import Game Data yet: the game file
                only says which relic slots you own, not which relic each slot is.)
            </div>

            <div className="flex-row" style={{ marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                    {filled} / {total} filled
                </span>
            </div>

            {/* ── Relic Categories ── */}
            {Object.entries(RELICS).map(([catName, fields]) => (
                <div key={catName} className="section" style={{ marginBottom: '10px' }}>
                    <div className="section-head">
                        <h3>{catName}</h3>
                        <span className="s-badge">
                            {fields.filter(([key]) => (relicData[key] ?? 0) > 0).length}
                            {' / '}
                            {fields.length} filled
                        </span>
                    </div>
                    <div className="section-body">
                        {fields.map(([key, label, , , unit]) => {
                            const val = relicData[key] ?? 0;

                            return (
                                <div key={key} className="field-row">
                                    <label className="field-label">{label}</label>
                                    <NumericInput
                                        value={val}
                                        min={0}
                                        step={unit === '%' ? 1 : 0.1}
                                        onChange={v => setRelic(key, v)}
                                    />
                                    <span className="relic-unit">{unit}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}