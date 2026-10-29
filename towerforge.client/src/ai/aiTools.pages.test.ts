// Ask AI: the tools for the Labs page's Lab boosts, Modules → Shard plan,
// What If's tournament mode and the fuller account summary, on the test
// bench's made-up accounts (bench/benchAccounts.ts).

import { describe, expect, it } from 'vitest';
import { useGameStore } from '../store/useGameStore';
import { parseGameExport } from '../engine/gameExport';
import { BENCH_ACCOUNTS } from './bench/benchAccounts';
import { accountSummary, farmTiersReport, guardianReport, labBoostsReport, runsReport, shardPlanReport, whatIfChanges } from './aiTools';
import type { AiAccount } from './aiTools';

function load(key: 'early' | 'mid' | 'late'): AiAccount {
    const a = BENCH_ACCOUNTS.find(x => x.key === key)!;
    useGameStore.getState().resetAll();
    useGameStore.getState().applyGameImport(parseGameExport(a.raw));
    if (a.build) useGameStore.getState().updateProfile({ build: a.build });
    return useGameStore.getState();
}

describe('lab boosts', () => {
    it('gives the even boosts the cells keep up, and each lab researching at its boost', () => {
        const r = labBoostsReport(load('late'));
        // 210,000 cells an hour in a run, 6.8 hours a day → about 59,400 an hour.
        expect(r.text).toMatch(/^Headline: with about 59,\d{3} cells an hour, your 5 labs can all run at ×5, ×5, ×5, ×5, ×4/);
        expect(r.text).toMatch(/Labs researching .*Enemy HP Lvl Skip Lab Lv 17: 12d 1[12]h left, 2d \d+h at ×5/);
    });

    it('times a lab named in the question at each speed', () => {
        const r = labBoostsReport(load('mid'), 'how long until my damage lab is maxed');
        expect(r.text).toMatch(/Damage Lab \(level 20 of 100\): the next level takes .* unboosted, .* at ×2/);
    });

    it('says so when it doesn\'t know the cells', () => {
        const s = load('mid');
        expect(labBoostsReport({ ...s, importedBattles: [] }).text).toMatch(/^Headline: TowerForge doesn't know how many cells you make yet/);
    });
});

describe('shard plan', () => {
    it('plans each type\'s own shards, the type asked for first', () => {
        const r = shardPlanReport(load('late'), 'how should I spend my armor shards');
        expect(r.title).toBe('Shard plan — armor');
        expect(r.text).toMatch(/^Headline: your armor shards: main slot \(Anti-Cube Portal\) Lv 220 \(no change\), assist slot \(Negative Mass Projector\) Lv 120 → \d+ — [\d,]+ shards/);
        expect(r.text).toMatch(/Best levels for all [\d,]+ armor shards .*Restore the main slot/);
        expect(r.text).not.toMatch(/\d\.\d armor shards/);   // whole shards
    });

    it('says a slot past its rarity cap adds nothing', () => {
        expect(shardPlanReport(load('mid')).text).toMatch(/The main slot is 10 levels past its module's rarity cap/);
    });
});

describe('What If for tournaments', () => {
    it('uses the tournament run and says so', () => {
        const r = whatIfChanges(load('late'), [{ upgrade: 'CL damage', level: 'max' }], { league: '', week: {}, recent: {} });
        expect(r.title).toBe('What If — tournament');
        expect(r.text).toMatch(/^Headline: maxing CL damage gives about \+[\d.]+ tournament waves this week \(runs end around W4\d\d now/);
    });

    it('falls back to campaign runs without a tournament run', () => {
        const r = whatIfChanges(load('early'), [{ upgrade: 'damage lab', level: '+10' }], { league: '', week: {}, recent: {} });
        expect(r.title).toBe('What If');
        expect(r.text).toMatch(/There are no tournament runs saved yet, so this is for campaign runs\./);
    });
});

describe('which tier to farm', () => {
    it('compares coins an hour on the tiers around the one farmed, up to the highest unlocked', () => {
        const r = farmTiersReport(load('late'));
        expect(r.text).toMatch(/^Headline: for coins an hour, T19 is your best tier to farm — about [\d.]+q coins an hour, \d+% more an hour than T18/);
        expect(r.text).toMatch(/^T18: runs end around W8,946, [\d.]+q coins a run in /m);
        expect(r.text).toMatch(/Tiers past T19 aren't unlocked yet\./);
        expect(farmTiersReport(load('mid')).text).toMatch(/^Headline: for coins an hour, T10 is your best tier to farm — .*the tier you farm now\./);
    });
});

describe('Guardian chips', () => {
    it('gives the best set for the goal and for coins, ties as just as good', () => {
        const r = guardianReport(load('late'));
        expect(r.text).toMatch(/^Headline: equip .*Scout.* for push further.*: \+[\d.]+% over the chips you have on now \(Attack, Bounty, Fetch\)\./);
        expect(r.text).toMatch(/For more coins \(econ\): equip .*Summon/);
        expect(r.text).toMatch(/Just as good for /);
        expect(guardianReport(load('mid')).text).toMatch(/^Headline: the Guardian isn't unlocked/);
    });
});

describe('campaign against tournaments', () => {
    it('lists what the runs show differs, the only reasons an answer may give', () => {
        const r = runsReport(load('late'), 'tournament');
        expect(r.text).toMatch(/What TowerForge can see that differs between your campaign and tournament runs/);
        expect(r.text).toMatch(/- Enemies Chain Lightning reached: \d+% campaign, \d+% tournaments\./);
        expect(r.text).toMatch(/- What ended the runs: campaign Ray \d+%.*; tournaments /);
        expect(r.text).toMatch(/none ticked for your tournament runs/);
    });
});

describe('the account summary', () => {
    it('has the labs, the Vault and the Guardian chips', () => {
        const t = accountSummary(load('late'));
        expect(t).toMatch(/Labs: \d+ researched, \d+ maxed; Damage Lab 47\/100, /);
        expect(t).toMatch(/Vault: 5 upgrades bought \(2 maxed\), [\d,]+ keys spent: .*Ad Gem Stack 2\/4/);
        expect(t).toMatch(/Guardian chips equipped: Attack \(.*\); Bounty \(.*\); Fetch \(/);
    });
});
