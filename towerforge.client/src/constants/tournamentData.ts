// ============================================================
//  TowerForge Companion — Tournament leagues and battle conditions
//  Each league's fixed heat, and the battle conditions a tournament can
//  draw, in the game's words. Sources: the wiki's Tournaments page and
//  battle-conditions list, TheTowerSDK v0.12 (v29 TournamentHeatDataByLeague).
//  The game shows each condition's strength during the run; it grows with
//  the wave (heat), so the player enters what it shows — none of the
//  strengths below are defaults.
// ============================================================

import type { League } from '../types/gameTypes';

export interface LeagueHeat {
    league: Exclude<League, ''>;
    tierPlus: number;          // enemy scaling base: "tier +" (Copper T1+ … Mythic T23+)
    bossEvery: number;         // More Bosses: a boss every N waves (fixed, doesn't ramp)
    randomConditions: number;  // random battle conditions a week
    saverDown: boolean;        // Death Defy Down or Energy Shields Down (Platinum and up)
}

export const LEAGUE_HEAT: LeagueHeat[] = [
    { league: 'Copper', tierPlus: 1, bossEvery: 10, randomConditions: 0, saverDown: false },
    { league: 'Silver', tierPlus: 3, bossEvery: 9, randomConditions: 1, saverDown: false },
    { league: 'Gold', tierPlus: 5, bossEvery: 8, randomConditions: 2, saverDown: false },
    { league: 'Platinum', tierPlus: 8, bossEvery: 7, randomConditions: 3, saverDown: true },
    { league: 'Champion', tierPlus: 12, bossEvery: 6, randomConditions: 4, saverDown: true },
    { league: 'Legend', tierPlus: 17, bossEvery: 5, randomConditions: 5, saverDown: true },
    { league: 'Mythic', tierPlus: 23, bossEvery: 4, randomConditions: 6, saverDown: true },
];

// The conditions the simulator counts, and what the player types in.
export type ConditionKey = 'enemySpeed' | 'uwDurations' | 'skipMultiply' | 'skipDecay' | 'bossUltimate';

export interface CountedCondition {
    key: ConditionKey;
    name: string;
    text: string;              // the game's description
    unit: string;              // shown next to the strength box
    max: number;               // the box won't take more
    step: number;
    every?: boolean;           // Skip Decay also takes "every N waves"
}

export const COUNTED_CONDITIONS: CountedCondition[] = [
    { key: 'enemySpeed', name: 'Enemy Speed', text: 'Enemies move x% faster', unit: '% faster', max: 500, step: 1 },
    {
        key: 'uwDurations', name: 'Ultimate Weapon Durations',
        text: 'Durations of Chrono Field, Golden Tower, Poison Swamp and Black Hole cut by x s', unit: 's shorter', max: 60, step: 0.5,
    },
    {
        key: 'skipMultiply', name: 'Skip Reduction - Multiply',
        text: 'Enemy health and attack level skip chances are multiplied by x', unit: '× skip chance', max: 1, step: 0.01,
    },
    {
        key: 'skipDecay', name: 'Skip Decay',
        text: 'Enemy health and attack level skip chances are reduced by x% every N waves', unit: '% off', max: 100, step: 0.1, every: true,
    },
    { key: 'bossUltimate', name: "Boss's Ultimate", text: 'Bosses spawn overhealed by x%', unit: '% more health', max: 1000, step: 1 },
];

// Conditions a tournament can draw that the simulator can't count yet, and why.
export const UNCOUNTED_CONDITIONS: { name: string; why: string }[] = [
    { name: 'Orb Resistance', why: 'Orbs kill what they touch whatever its health, so they aren’t in the damage that decides how far a run gets; dealing a share of health instead isn’t modeled.' },
    { name: 'Death Ray Resistance', why: 'Same as orbs: Death Ray kills outright, so it isn’t in that damage.' },
    { name: 'Thorns Resistance', why: 'Thorns only hurt enemies that reach the tower — for Glass Cannon that hit already ends the run.' },
    { name: 'Plasma Cannon Resistance', why: 'Plasma Cannon isn’t modeled.' },
    { name: 'Armored Enemies', why: 'Blocks a number of hits per enemy, not a share of damage — needs how many hits each enemy takes.' },
    { name: 'More Enemies', why: 'More enemies in the same time; the model’s limit is the toughest enemy you can kill, not how many.' },
    { name: 'More Bosses', why: 'Your league’s boss spacing is already in your tournament deaths; a different spacing isn’t modeled.' },
    { name: 'Enemy Attack Speed', why: 'One hit ends a Glass Cannon run either way.' },
    { name: 'Ranged Ultimate', why: 'Ranged shots stop the tower firing — needs how often they land.' },
    { name: 'Death Defy Down', why: 'Death Defy isn’t in waves yet (killing hits near the end aren’t measured).' },
    { name: 'Energy Shields Down', why: 'Energy Shield isn’t in waves yet.' },
    { name: 'Knockback Resistance', why: 'Knockback isn’t modeled.' },
    { name: 'Mass Enforcement', why: 'Enemy mass only matters for knockback, which isn’t modeled.' },
    { name: 'Fast’s Ultimate', why: 'The model already times the Fast enemy; others matching its speed doesn’t change that.' },
    { name: 'Tank’s Ultimate', why: 'Tanks acting as bosses isn’t modeled.' },
    { name: 'Protector’s Ultimate', why: 'Protector shields blocking knockback, shockwave and Black Hole damage isn’t modeled.' },
    { name: 'Basic’s Ultimate', why: 'Basics spawning as other enemies isn’t modeled.' },
];
