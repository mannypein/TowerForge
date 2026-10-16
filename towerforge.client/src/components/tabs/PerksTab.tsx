// ============================================================
//  TowerForge Companion — Perks Tab
//  Toggle banned perks. All non-banned perks are assumed
//  active at max quantity each run.
// ============================================================

import { useGameStore } from '../../store/useGameStore';
import { PERKS } from '../../constants/gameData';

export default function PerksTab() {
    const perkData = useGameStore(s => s.perkData);
    const labData = useGameStore(s => s.labData);
    const togglePerk = useGameStore(s => s.togglePerk);

    const banned = new Set(perkData.banned ?? []);
    const spb = labData['Standard Perk Bonus'] ?? 0;

    const uwPerks = PERKS.filter(p => p.type === 'uw');
    const standardPerks = PERKS.filter(p => p.type === 'standard');
    const tradeoffPerks = PERKS.filter(p => p.type === 'tradeoff');

    function PerkButton({ id, name }: { id: string; name: string }) {
        const isBanned = banned.has(id);
        return (
            <button
                className={`perk-btn ${isBanned ? 'perk-banned' : 'perk-active'}`}
                onClick={() => togglePerk(id)}
                title={isBanned ? 'Click to un-ban' : 'Click to ban'}
            >
                {isBanned ? '✗' : '✓'} {name}
            </button>
        );
    }

    return (
        <div>
            <div className="section">
                <div className="section-head">
                    <h3>Perks</h3>
                </div>
                <div className="section-body">

                    <p className="perks-note">
                        Toggle perks you have <strong style={{ color: 'var(--danger)' }}>banned</strong>.
                        All non-banned perks are assumed active at max quantity each run.
                    </p>

                    <div className="perks-spb">
                        Standard Perk Bonus lab:{' '}
                        <strong style={{ color: 'var(--accent)' }}>
                            {spb} levels ({spb}% bonus)
                        </strong>
                    </div>

                    {/* UW Perks */}
                    <div className="perks-group">
                        <div className="perks-group-label">⚔ UW Perks</div>
                        <div className="perks-group-body">
                            {uwPerks.map(p => (
                                <PerkButton key={p.id} id={p.id} name={p.name} />
                            ))}
                        </div>
                    </div>

                    {/* Standard Perks */}
                    <div className="perks-group">
                        <div className="perks-group-label">★ Standard Perks</div>
                        <div className="perks-group-body">
                            {standardPerks.map(p => (
                                <PerkButton key={p.id} id={p.id} name={p.name} />
                            ))}
                        </div>
                    </div>

                    {/* Trade-off Perks */}
                    <div className="perks-group">
                        <div className="perks-group-label">⚡ Trade-off Perks</div>
                        <div className="perks-group-body">
                            {tradeoffPerks.map(p => (
                                <PerkButton key={p.id} id={p.id} name={p.name} />
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}