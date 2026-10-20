// ============================================================
//  TowerForge Companion — Tournament model
//  The account set up for tournaments, shared by the Tournament page and
//  What If's tournament mode:
//   • the build used for tournaments (a site preset and module loadout);
//   • calibrated on the newest tournament run, under the battle conditions
//     that run had (the player ticks them: store tourneyLog);
//   • waves from the tournament deaths (Run Length on the tournament curve);
//   • any other set of conditions read at the wave the run would end —
//     conditions get stronger with the wave and move where it ends, so
//     that's settled in a few rounds.
//  Pure functions — no store imports.
// ============================================================

import type { BuildType, League } from '../types/gameTypes';
import type { AccountState, GoalModels } from './accountModels';
import { applyGoal, runModels, snapshotFromState } from './accountModels';
import type { OptimizerSnapshot } from './optimizer';
import { goalScore, skipChanceOf } from './optimizer';
import type { RunLengthModel } from './runLength';
import { runWavesChange } from './runLength';
import { heatConditions, leagueConditions } from './battleConditions';
import type { TourneyConditions } from './battleConditions';
import { LEAGUE_HEAT } from '../constants/tournamentData';
import type { HeatKey, LeagueHeat } from '../constants/tournamentData';

export type Ticks = Partial<Record<HeatKey, boolean>>;

export interface TournamentSetup {
    league: League;            // this week's league
    week: Ticks;               // this week's random (and saver) conditions
    last: Ticks;               // the calibration run's conditions
    lastLeague?: League;       // the league that run was in (default: this week's)
    preset?: number;           // site preset used for tournaments
    loadout?: string;          // module loadout used for tournaments
}

export interface TournamentModel {
    calibIdx: number;                  // the calibration run in importedBattles
    account: AccountState;             // with the tournament build
    models: GoalModels;
    run: RunLengthModel | null;
    heat?: LeagueHeat;
    snap: OptimizerSnapshot;           // calibrated, scored under the last tournament's conditions
    baseline: TourneyConditions;       // the last tournament's, at the wave runs end
    // Conditions `set` at `wave` (this week's league unless `heatFor`).
    at(set: Ticks, wave: number, heatFor?: LeagueHeat): TourneyConditions;
    // Waves a score (and skip chance) gains against the calibration
    // (Glass Cannon only); scoreOf reads a snapshot.
    wavesOf: ((s: Scored) => number) | null;
    // Waves from the last tournament's conditions to `set`, settled at the
    // wave the run would end with them.
    settle: ((set: Ticks, heatFor?: LeagueHeat) => number) | null;
}

export interface Scored { score: number; skip: number }

// Where a run settles when the waves it gains (`gainAt(w)`, read with the
// conditions at `w` waves past where it starts) depend on how far it goes.
// Conditions only get stronger with the wave, so the further it's read,
// the less it gains: the answer is where gainAt(w) = w, between 0 and
// gainAt(0). Found by halving that range (plain repeats can swing back and
// forth when the conditions climb steeply).
export function settleGain(gainAt: (w: number) => number, steps = 7): number {
    const g0 = gainAt(0);
    if (Math.abs(g0) < 0.05) return g0;
    let lo = Math.min(0, g0);
    let hi = Math.max(0, g0);
    for (let i = 0; i < steps; i++) {
        const mid = (lo + hi) / 2;
        if (gainAt(mid) > mid) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}
export const scoreOf = (s: OptimizerSnapshot): Scored => ({ score: goalScore(s), skip: skipChanceOf(s) });

export const heatOf = (league: League | undefined) => LEAGUE_HEAT.find(l => l.league === league);

// The newest tournament run in the history (-1 when there's none).
export function newestTournament(state: Pick<AccountState, 'importedBattles'>): number {
    const idx = state.importedBattles.map((b, i) => ({ b, i })).filter(({ b }) => b.tournament)
        .sort((a, b) => (b.b.time ?? b.i) - (a.b.time ?? a.i))[0]?.i;
    return idx ?? -1;
}

// The account with the tournament build in place.
export function withTournamentBuild(state: AccountState, preset?: number, loadout?: string): AccountState {
    const presetOk = preset !== undefined && preset >= 0 && preset < (state.profile.presets || 2);
    const loadoutOk = loadout !== undefined && state.moduleState.loadouts.some(l => l.id === loadout);
    return {
        ...state,
        activePreset: presetOk ? preset : state.activePreset,
        moduleState: loadoutOk ? { ...state.moduleState, activeLoadout: loadout } : state.moduleState,
    };
}

export function buildTournamentModel(state: AccountState, setup: TournamentSetup, build: BuildType): TournamentModel | null {
    const calibIdx = newestTournament(state);
    if (calibIdx < 0) return null;
    const account: AccountState = {
        ...withTournamentBuild(state, setup.preset, setup.loadout),
        battleReportText: '', battleReportChoice: calibIdx,
    };
    const models = runModels(account);
    const run = models.run;
    const snap = snapshotFromState(account);
    const report = account.importedBattles[calibIdx];
    const heat = heatOf(setup.league);
    const lastHeat = heatOf(setup.lastLeague) ?? heat;
    const labs = account.labData;

    if (build !== 'Glass Cannon' || !run) {
        applyGoal(snap, 'survival', build, report, models);
        return {
            calibIdx, account, models, run, heat, snap, baseline: snap.conditions ?? {},
            at: () => snap.conditions ?? {}, wavesOf: null, settle: null,
        };
    }

    // The league's fixed conditions are in every tournament, at the wave
    // runs usually end; the random ones at the wave the run ends.
    const fixed = heat ? leagueConditions(heat, run.typicalWave, labs) : {};
    const at = (set: Ticks, wave: number, heatFor?: LeagueHeat): TourneyConditions => {
        const h = heatFor ?? heat;
        return h ? { ...fixed, ...heatConditions(h, set, wave, labs) } : {};
    };
    const baseline = at(setup.last, run.typicalWave, lastHeat);
    snap.conditions = baseline;
    applyGoal(snap, 'waves', build, report, models);
    const ref = scoreOf(snap);
    // An account with no damage to score (nothing owned yet) moves nothing.
    const logRatio = (s: Scored) => (s.score > 0 && ref.score > 0 ? Math.log(s.score / ref.score) : 0);
    const wavesOf = (s: Scored) =>
        runWavesChange(run, logRatio(s) - models.worth * (s.skip - ref.skip), s.skip - ref.skip);
    const settle = (set: Ticks, heatFor?: LeagueHeat) =>
        settleGain(w => wavesOf(scoreOf({ ...snap, conditions: at(set, run.typicalWave + w, heatFor) })));
    return { calibIdx, account, models, run, heat, snap, baseline, at, wavesOf, settle };
}
