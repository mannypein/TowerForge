// Ask AI: the data the assistant reads — upgrades named in words, levels,
// the account summary, What If and the Optimizer's picks on a made-up
// account, and the game notes search.

import { describe, expect, it } from 'vitest';
import { useGameStore } from '../store/useGameStore';
import { parseGameExport } from '../engine/gameExport';
import { snapshotFromState } from '../engine/accountModels';
import { upgradeTargets } from '../engine/whatIf';
import { UWS } from '../constants/gameData';
import { battle, makeExport } from '../test/makeExport';
import { accountSummary, bestUpgrades, findTargets, levelFor, levelsOf, whatIfChanges, wordsOf } from './aiTools';
import type { AiAccount } from './aiTools';
import { searchNotes } from './aiKnowledge';

// Five T18 deaths to Rays with damage by source (made up).
const runs = parseGameExport(makeExport({
    BattleHistory: [8100, 8200, 8402, 8500, 8501].map((wave, i) => battle({
        BattleDate: `2026-10-1${i}T12:00:00Z`, Wave: wave, KilledBy: 9,
        HealthLevelSkips: Math.floor(wave * 0.58), AttackLevelSkips: Math.floor(wave * 0.577),
        DamageDealt: 1000, ChainLightningDamage: 300, OrbDamage: 400, BlackHoleDamage: 200, ProjectilesDamage: 100,
        ProjectilesCount: 10000, EnemiesHitByChainLightningThisRound: 500, DestroyedInBlackhole: 900,
    })),
})).battles;

function account(): AiAccount {
    const st = useGameStore.getState();
    return {
        ...st,
        profile: { ...st.profile, build: 'Glass Cannon', highestTier: 18 },
        labData: { 'Damage Lab': 40 },
        uwData: { stones: 0, data: Object.fromEntries(UWS.map(u => [u.a, { own: true, sv: [10, 3, 10], upOwn: true, upLvl: 2 }])) },
        importedBattles: runs,
        battleReportChoice: runs.length - 1,
    };
}

describe('upgrades named in words', () => {
    const targets = upgradeTargets(snapshotFromState(account()));
    const labels = (q: string) => findTargets(targets, q).map(t => t.label);

    it('reads UW short names and UW+', () => {
        expect(wordsOf('max CF+')).toEqual(['+', 'chrono', 'field']);
        expect(labels('CL')).toEqual(['Chain Lightning — Damage', 'Chain Lightning — Quantity', 'Chain Lightning — Chance']);
        expect(labels('CL damage')).toEqual(['Chain Lightning — Damage']);
        expect(labels('CF+')).toEqual(['Chrono Field+ — Chrono Loop']);
        expect(labels('chrono loop')).toEqual(['Chrono Field+ — Chrono Loop']);
    });

    it('tells the workshop from labs', () => {
        expect(labels('damage')).toEqual(['Damage']);
        expect(findTargets(targets, 'damage')[0].kind).toBe('workshop');
        expect(labels('damage lab')).toEqual(['Damage Lab']);
    });

    it('finds nothing for words that match nothing', () => {
        expect(findTargets(targets, 'banana')).toEqual([]);
    });

    it('reads levels: max, more, next or a number (within the max)', () => {
        const t = { kind: 'uw' as const, key: 'CL|0', group: '', label: '', current: 10, max: 32 };
        expect(levelFor(t, 'max')).toBe(32);
        expect(levelFor(t, '+5')).toBe(15);
        expect(levelFor(t, '+50')).toBe(32);
        expect(levelFor(t, 'next')).toBe(11);
        expect(levelFor(t, 'level 20')).toBe(20);
        expect(levelFor(t, 'lots')).toBeNull();
    });
});

describe('what the assistant reads', () => {
    it('summarizes the account', () => {
        const text = accountSummary(account());
        expect(text).toContain('Build: Glass Cannon');
        expect(text).toContain('Chain Lightning (Damage 10/32, Quantity 3/5, Chance 10/16; Smite (UW+) 3/12)');
        expect(text).toContain('T18 W8,501, killed by Ray');
    });

    it('looks up current levels', () => {
        expect(levelsOf(account(), 'damage lab').text).toBe('Damage Lab (Labs — Attack Research): level 40 of 100');
    });

    it('works out What If for named upgrades, with costs and waves', () => {
        const r = whatIfChanges(account(), [{ upgrade: 'CL damage', level: '+5' }]);
        expect(r.text).toContain('Chain Lightning — Damage: 10 → 15 (max 32), costs');
        expect(r.text).toMatch(/^Headline: CL damage \+5 levels gives about \+[\d.]+ waves \(runs end around W[\d,]+ now, W[\d,]+ after\), for [\d,]+ Power Stones\./);
        expect(r.text).toContain('Total cost:');
        expect(whatIfChanges(account(), [{ upgrade: 'banana', level: 'max' }]).text).toContain('Couldn\'t find "banana"');
    });

    it('lists the Optimizer\'s next Power Stone picks', () => {
        const r = bestUpgrades(account(), 'stones');
        expect(r.text).toContain('Goal: Push further');
        expect(r.text).toMatch(/Next Power Stones:\n1\. /);
    });
});

describe('game notes search', () => {
    it('finds a battle condition by name', () => {
        const hits = searchNotes('How does Fast’s Ultimate work?');
        expect(hits[0].heading).toBe('Fast’s Ultimate');
    });

    it('finds UW notes and stays within the budget', () => {
        const hits = searchNotes('chrono field slow duration', 3, 3200);
        expect(hits.length).toBeGreaterThan(0);
        expect(hits.some(h => /chrono/i.test(h.heading + h.text))).toBe(true);
        expect(hits.reduce((a, h) => a + h.text.length, 0)).toBeLessThanOrEqual(3200);
    });
});
