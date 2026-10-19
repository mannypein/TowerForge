// ============================================================
//  TowerForge Companion — The account, ready to score
//  Builds the optimizer's snapshot from the saved account and sets it up
//  for a goal: the calibrations that goal needs (damage by source, coins,
//  survival), Run Length for waves, and coins for a run to any wave.
//  Shared by the Optimizer and the What If page so both score the same.
//  Pure functions — no store imports.
// ============================================================

import type { AppState, BuildType } from '../types/gameTypes';
import type { OptimizerSnapshot } from './optimizer';
import type { OptGoal } from '../constants/optimizerConfig';
import { pushGoalOf } from '../constants/optimizerConfig';
import { activeBattleReport } from './battleReport';
import type { BattleReport } from './battleReport';
import { readActiveModuleBonuses } from './modBonuses';
import { runRatesFrom } from './runRates';
import { packageChancePct } from './ttt';
import { enhForPreset } from './statHelpers';
import { botsForPreset } from '../constants/botData';
import { buildFarmCalibration } from './farming';
import { buildEhpCalibration } from './ehp';
import { buildEdpsCalibration } from './edps';
import { buildRunLengthModel, killerMix, skipWorth } from './runLength';
import type { RunLengthModel } from './runLength';
import { buildRunModel, projectRun, runSettingsFromCards } from './runCoins';
import type { RunProjection } from './runCoins';
import { defaultBattleIndex } from './gameExport';

export type AccountState = Pick<AppState,
    'activePreset' | 'profile' | 'perkData' | 'wsData' | 'enhData' | 'labData' | 'cardData' | 'uwData'
    | 'relicData' | 'botData' | 'moduleState' | 'battleReportText' | 'importedBattles' | 'battleReportChoice'>;

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// The chosen Battle Report (calibrates damage, coins and survival).
export const chosenReport = (s: AccountState): BattleReport | null =>
    activeBattleReport(s.battleReportText, s.importedBattles, s.battleReportChoice);

// The account as the optimizer scores it, for the active preset.
export function snapshotFromState(s: AccountState): OptimizerSnapshot {
    // Run rates (boss/elite kills, packages, cash…) from the chosen report
    // drive several unique module effects.
    const modBonuses = readActiveModuleBonuses(
        s.moduleState, s.perkData, s.labData, s.cardData, runRatesFrom(chosenReport(s)),
    );
    // The report's package rate belongs to today's package chance.
    modBonuses.run = {
        ...modBonuses.run,
        pkgChanceAtRun: packageChancePct(s.activePreset, s.wsData, s.labData, s.cardData, modBonuses),
    };
    return {
        presetIdx: s.activePreset,
        wsData: copy(s.wsData),
        enhData: copy(enhForPreset(s.enhData, s.activePreset)),
        labData: copy(s.labData),
        cardData: copy(s.cardData),
        perkData: copy(s.perkData),
        uwData: copy(s.uwData),
        relicData: copy(s.relicData),
        modBonuses,
        moduleState: copy(s.moduleState),
        botData: botsForPreset(s.botData, s.activePreset),
        excludedUWs: [...(s.profile.excludedUWs ?? [])],
        metric: s.profile.build === 'Farming' ? 'coins' : s.profile.build === 'eHP' ? 'ehp' : 'edps',
    };
}

export interface GoalModels {
    run: RunLengthModel | null;        // Run Length, from the deaths in the history
    worth: number;                     // skipWorth (0 without Run Length)
    coinsAt?: (wave: number) => number; // coins for a run to a wave (Coins per Run)
    projectAt?: (wave: number) => RunProjection;   // coins and real time for a run to a wave
}

// Run Length and Coins per Run, from the saved battle history, matching
// the chosen run: a tournament run is measured against your tournament
// deaths on the tournament curve (and has no Coins per Run — tournaments
// pay differently), a campaign run against deaths on its own tier.
export function runModels(s: Pick<AccountState, 'importedBattles' | 'cardData' | 'activePreset'
    | 'battleReportText' | 'battleReportChoice'>): GoalModels {
    const chosen = activeBattleReport(s.battleReportText, s.importedBattles, s.battleReportChoice);
    const tournament = !!chosen?.tournament;
    const run = buildRunLengthModel(s.importedBattles, { tournament, tier: chosen?.tier });
    const settings = runSettingsFromCards(s.cardData, s.activePreset);
    const coinModel = tournament ? null
        : buildRunModel(s.importedBattles, defaultBattleIndex(s.importedBattles), settings);
    const projectAt = coinModel && run
        ? (wave: number) => projectRun(coinModel.calibration, settings, wave, run.tier)
        : undefined;
    return {
        run,
        worth: run ? skipWorth(run) : 0,
        coinsAt: projectAt ? (wave: number) => projectAt(wave).coins : undefined,
        projectAt,
    };
}

// Sets the snapshot up to score `goal` (coinWeight is how much coins count
// in "coins and push", 0–1).
export function applyGoal(
    snap: OptimizerSnapshot, goal: OptGoal, build: BuildType, report: BattleReport | null,
    models: GoalModels, coinWeight = 0.5,
): void {
    const pushWaves = pushGoalOf(build) === 'waves';
    const wantsWaves = goal === 'waves' || (goal === 'blend' && pushWaves);
    const wantsEhp = goal === 'survival' || (goal === 'blend' && !pushWaves);
    snap.farm = goal === 'coins' || goal === 'blend' ? buildFarmCalibration(snap, report) : undefined;
    snap.ehp = wantsEhp ? buildEhpCalibration(snap, report) : undefined;
    snap.edps = goal === 'damage' || wantsWaves ? buildEdpsCalibration(snap, report) ?? undefined : undefined;
    snap.metric = goal === 'coins' ? 'coins' : wantsEhp && goal !== 'blend' ? 'ehp' : 'edps';
    // Waves need damage by source; without it eDPS stands in.
    snap.edpsMode = wantsWaves && snap.edps ? 'waves' : 'damage';
    snap.blend = goal === 'blend' ? { push: pushWaves ? 'waves' : 'ehp', coinWeight } : undefined;
    snap.skipWorth = wantsWaves && models.run ? models.worth : undefined;
    snap.killers = wantsWaves && models.run ? killerMix(models.run) : undefined;
}
