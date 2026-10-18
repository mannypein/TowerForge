// Tests for the game export import (engine/gameExport.ts), on made-up exports.
// The numbers pinned here (lab 0 = Damage Lab, effect code 1 = Common Attack
// Speed, the code-block ends 80/154/216/326, …) were confirmed against a real
// account — see docs/game-export-format.md. If a test fails after a game
// update, the export format probably changed.

import { describe, expect, it } from 'vitest';
import { defaultBattleIndex, isGameExport, isRealRun, parseGameExport } from './gameExport';
import { MAX_STORED_BATTLES, mergeBattles } from './battleReport';
import { LABS, UWS, WS_ENH, WS_STATS } from '../constants/gameData';
import { GAME_CARDS, MASTERY_LAB_CARDS, MASTERY_LAB_START, CARD_PRESET_SLOTS } from '../constants/gameExportMaps';
import { SUB_EFFECTS, SUB_RARITIES } from '../constants/moduleData';
import { battle, gameModule, labIndex, makeExport, research, zeros } from '../test/makeExport';

const labMax = (name: string) => LABS.flatMap(c => c.l).find(([n]) => n === name)![1];

describe('isGameExport', () => {
    it('accepts the game file and rejects others', () => {
        expect(isGameExport(makeExport())).toBe(true);
        expect(isGameExport({ Coins: 1, Gems: 2 })).toBe(false);
        expect(isGameExport(null)).toBe(false);
        expect(isGameExport({ version: 2, profile: {} })).toBe(false);   // a TowerForge backup
    });
});

describe('currencies and tiers', () => {
    it('reads currencies and the player name', () => {
        const imp = parseGameExport(makeExport());
        expect(imp.currencies).toMatchObject({ coins: 1e15, gems: 500, stones: 1200, medals: 300, cells: 40, keys: 2 });
        expect(imp.userName).toBe('TestPlayer');
    });

    it('finds the highest unlocked and completed tiers', () => {
        // Tiers 1–3 past wave 100 (unlocks the next tier), tier 4 at wave 80.
        const imp = parseGameExport(makeExport({ HighestWaveThisTier: [0, 4000, 1200, 350, 80] }));
        expect(imp.tierWaves).toEqual({ 1: 4000, 2: 1200, 3: 350, 4: 80 });
        expect(imp.completedTier).toBe(3);
        expect(imp.highestTier).toBe(4);
    });

    it('needs wave 300 to complete tier 15 and up', () => {
        const waves = zeros(17);
        for (let t = 1; t <= 14; t++) waves[t] = 1000;
        waves[15] = 299;
        const imp = parseGameExport(makeExport({ HighestWaveThisTier: waves }));
        expect(imp.completedTier).toBe(14);
        expect(imp.highestTier).toBe(15);
    });
});

describe('workshop and enhancements', () => {
    const attackMax = WS_STATS.attack.map(([, max]) => max);

    it('reads the loaded workshop preset from the live arrays and others from the preset arrays', () => {
        const live = [5000, 99, 79, 0, 0, 0];
        const saved = zeros(100);
        saved[40] = 1234;                                     // workshop preset 2, first attack stat
        const imp = parseGameExport(makeExport({
            UpgradeWorkshopLevel: live,
            PresetUpgradeWorkshopLevel: saved,
            CurrentWorkshopPreset: 0,
            GlobalPresets: [{ WorkshopIndex: 0 }, { WorkshopIndex: 2 }],
        }));
        expect(imp.workshop).toHaveLength(5);
        expect(imp.workshop![0].attack.slice(0, 3)).toEqual([Math.min(5000, attackMax[0]), Math.min(99, attackMax[1]), Math.min(79, attackMax[2])]);
        expect(imp.workshop![1].attack[0]).toBe(Math.min(1234, attackMax[0]));   // app preset 2 → game workshop preset 3
        expect(imp.fivePresets).toBe(true);                                     // workshop preset 3 holds upgrades
    });

    it('clamps workshop levels to each stat max', () => {
        const imp = parseGameExport(makeExport({ UpgradeWorkshopLevel: [1e9] }));
        expect(imp.workshop![0].attack[0]).toBe(attackMax[0]);
    });

    it('maps enhancements from the game order (Rend Armor is 2nd in game)', () => {
        const imp = parseGameExport(makeExport({ EnhancementLevel: [10, 20, 0, 0, 0, 0], EnhancementTierUnlocked: [true] }));
        expect(WS_ENH.attack[5][0]).toMatch(/Rend Armor/);
        expect(imp.enhancements!.d.attack![0]).toBe(10);
        expect(imp.enhancements!.d.attack![5]).toBe(20);
        expect(imp.enhancements!.u!.attack![0]).toBe(true);    // first enhancement is free
        expect(imp.enhancements!.u!.attack![5]).toBe(true);    // bought (TierUnlocked[0])
    });
});

describe('ultimate weapons', () => {
    it('reads ownership and turns 0-based levels into app levels', () => {
        const imp = parseGameExport(makeExport({
            UltimateWeaponUnlocked: [true, false],
            UltimateWeaponLevel: [4, 0, 2],
        }));
        const first = imp.uws![UWS[0].a]!;
        expect(first.own).toBe(true);
        expect(first.sv).toEqual([5, 1, 3]);
        expect(imp.uws![UWS[1].a]!.own).toBe(false);
    });
});

describe('cards', () => {
    it('reads stars, mastery and the cards in each preset', () => {
        const coins = Number(Object.entries(GAME_CARDS).find(([, n]) => n === 'Coins')![0]);
        const levels = zeros(40);
        const unlocked = Array(40).fill(false);
        const mastery = Array(40).fill(false);
        levels[coins] = 9;            // clamps to 7 stars
        unlocked[coins] = true;
        mastery[coins] = true;
        unlocked[0] = true;           // Damage, 1 star (level 0 still counts as owned)

        const slots = zeros(CARD_PRESET_SLOTS * 2);
        const assigned = Array(CARD_PRESET_SLOTS * 2).fill(false);
        slots[CARD_PRESET_SLOTS] = coins;            // card preset 2, slot 1
        assigned[CARD_PRESET_SLOTS] = true;
        const active = Array(40).fill(false);
        active[0] = true;                            // loaded preset: Damage

        const imp = parseGameExport(makeExport({
            CardLevel: levels, CardUnlocked: unlocked, CardMasteryUnlocked: mastery,
            ResearchLevel: research({ [MASTERY_LAB_START + MASTERY_LAB_CARDS.indexOf('Coins')]: 4 }),
            SlotPresetCardInt: slots, SlotPresetCardAssignedBool: assigned, CardActive: active,
            CurrentPreset: 0, GlobalPresets: [{ CardsIndex: 0 }, { CardsIndex: 1 }],
        }));
        expect(imp.cards!.data.Coins).toEqual({ s: 7, m: 4, mu: true });
        expect(imp.cards!.data.Damage.s).toBe(1);
        expect(imp.cards!.data.Damage.mu).toBe(false);
        expect(imp.cards!.presets[0]).toEqual(['Damage']);
        expect(imp.cards!.presets[1]).toEqual(['Coins']);
    });
});

describe('perks, league, preset names', () => {
    it('maps banned perks it knows and skips the rest', () => {
        const imp = parseGameExport(makeExport({ BannedPerksIndex: [3, 10, 40, 99, -1] }));
        expect(imp.bannedPerks).toEqual(['coins', 'to_dmg']);
    });

    it('reads the league, and leaves it unknown when the file has none', () => {
        expect(parseGameExport(makeExport({ HighestLeague: 6 })).league).toBe('Mythic');
        expect(parseGameExport(makeExport({ HighestLeague: 0 })).league).toBe('Copper');
        expect(parseGameExport(makeExport()).league).toBe('');
    });

    it('names presets from the global or workshop preset, skipping defaults and repeats', () => {
        const imp = parseGameExport(makeExport({
            GlobalPresets: [
                { PresetName: 'Preset 1', WorkshopIndex: 0 },
                { PresetName: 'Tourney', WorkshopIndex: 1 },
                { PresetName: 'Preset 3', WorkshopIndex: 0 },   // same workshop name as preset 1
                { PresetName: 'tourney', WorkshopIndex: 3 },    // repeat of preset 2
            ],
            WorkshopPresetName: ['GC Farm', 'tournament', 'Preset 3', 'eHP', 'Preset 5'],
        }));
        expect(imp.presetNames).toEqual(['GC Farm', 'Tourney', '', '', '']);
    });
});

describe('labs', () => {
    it('reads labs by game number and clamps to the lab max', () => {
        const imp = parseGameExport(makeExport({ ResearchLevel: research({ 0: 5, 10: 9999 }) }));
        expect(labIndex('Damage Lab')).toBe(0);
        expect(labIndex('Health Lab')).toBe(10);
        expect(imp.labs!['Damage Lab']).toBe(5);
        expect(imp.labs!['Health Lab']).toBe(labMax('Health Lab'));
    });

    it('imports a lab group only when every number in it agrees', () => {
        const imp = parseGameExport(makeExport({
            ResearchLevel: research({ 132: 1, 133: 1, 150: 1, 151: 1, 134: 10, 193: 10, 199: 9 }),
        }));
        expect(imp.labs!['Unmerge Module']).toBe(1);
        expect(imp.labs!['Light Speed Shots']).toBe(1);
        expect(imp.labs!['Garlic Thorns']).toBeUndefined();
        expect(imp.labs!['BC Reduction']).toBeUndefined();
    });
});

describe('modules', () => {
    // Effect codes count through (effect, rarity) pairs: cannon Attack Speed
    // Common = 1 … Ancestral = 6, Crit Chance 7–12, Crit Factor 13–18.
    const subsOf = (imp: ReturnType<typeof parseGameExport>, guid: string) =>
        imp.modules!.state.library.find(m => m.id === guid)!.subs.map(s => `${s.rar} ${s.effect}`);

    it('names unique modules, decodes rarity and effects, skips generic ones', () => {
        const imp = parseGameExport(makeExport({
            ModuleEquipped: [gameModule('as', 45, 15, [18, 6, 1])],     // Amplifying Strike, Ancestral 5★
            ModuleInventory: [
                gameModule('gen', 3, 10, [1, 2]),                        // generic cannon — not imported
                gameModule('sr', 41, 6, [13, 7, 1]),                     // Shrink Ray, Legendary
            ],
        }));
        const lib = imp.modules!.state.library;
        expect(lib.map(m => m.name).sort()).toEqual(['Amplifying Strike', 'Shrink Ray']);
        expect(lib.find(m => m.id === 'as')).toMatchObject({ type: 'cannon', rarity: 'A5' });
        expect(lib.find(m => m.id === 'sr')!.rarity).toBe('L');
        expect(subsOf(imp, 'as')).toEqual(['Ancestral Crit Factor', 'Ancestral Attack Speed', 'Common Attack Speed']);
        expect(lib.find(m => m.id === 'as')!.subs[0].val).toBe('15x');
    });

    it('pins the ends of each type block and the later Max Recovery code', () => {
        const top = (type: 'cannon' | 'armor' | 'generator' | 'core', name: string) => {
            const vals = SUB_EFFECTS[type].find(([n]) => n === name)![2];
            return `${SUB_RARITIES[vals.length - 1 - [...vals].reverse().findIndex(v => v !== null)]} ${name}`;
        };
        const imp = parseGameExport(makeExport({
            ModuleInventory: [
                gameModule('c80', 7, 10, [80]),
                gameModule('a154', 17, 10, [154]),
                gameModule('g216', 27, 10, [216]),
                gameModule('k326', 37, 10, [326]),
                gameModule('g328', 30, 10, [328]),
            ],
        }));
        expect(subsOf(imp, 'c80')).toEqual([top('cannon', 'Max Rend Armor Multi')]);
        expect(subsOf(imp, 'a154')).toEqual([top('armor', 'Wall Rebuild')]);
        expect(subsOf(imp, 'g216')).toEqual([top('generator', 'Enemy HP Level Skip')]);
        expect(subsOf(imp, 'k326')).toEqual([top('core', 'Spotlight - Angle')]);
        expect(subsOf(imp, 'g328')).toEqual(['Epic Max Recovery']);
    });

    it('only shows effects whose slot the module has unlocked', () => {
        // Slots 4–6 unlock at levels 101 / 141 / 161, slot 8 at 241.
        const effects = [1, 7, 13, 2, 8, 14, 3, 9];
        const imp = parseGameExport(makeExport({
            ModuleInventory: [gameModule('low', 45, 6, effects, 120), gameModule('max', 41, 15, effects, 250)],
        }));
        // Lv 120: slots 1–3, 4 (101) and 7 (always open) — not 5, 6 or 8.
        expect(subsOf(imp, 'low')).toEqual([
            'Common Attack Speed', 'Common Crit Chance', 'Common Crit Factor', 'Rare Attack Speed', 'Epic Attack Speed',
        ]);
        expect(subsOf(imp, 'max')).toHaveLength(8);
    });

    it('keeps unique modules it cannot name as unnamed, typed from their effects', () => {
        const imp = parseGameExport(makeExport({ ModuleInventory: [gameModule('x', 49, 10, [90, 95])] }));
        expect(imp.modules!.state.library).toHaveLength(0);
        expect(imp.modules!.unnamed).toEqual([expect.objectContaining({ infoIndex: 49, type: 'armor', rarity: 'A' })]);
    });

    it('brings presets in game order with the equipped one active', () => {
        const mods = [
            gameModule('c1', 45, 15, [1]), gameModule('c2', 41, 15, [1]),
            gameModule('a1', 42, 10, [90]), gameModule('g1', 43, 10, [160]), gameModule('k1', 44, 10, [220]),
        ];
        const imp = parseGameExport(makeExport({
            ModuleEquipped: [mods[1], mods[2], mods[3], mods[4]],     // differs from saved preset 2
            ModuleInventory: [mods[0]],
            ModulePresets: [
                { PresetName: 'farm', PrimaryModuleGuids: ['c1', 'a1', 'g1', 'k1'], AssistModuleGuids: ['', '', '', ''] },
                { PresetName: 'push', PrimaryModuleGuids: ['c1', 'a1', 'g1', 'k1'], AssistModuleGuids: ['nope', '', '', ''] },
                { PresetName: 'Preset 3', PrimaryModuleGuids: [], AssistModuleGuids: [] },
            ],
            CurrentModulePreset: 1,
            SlotLevels: [217, 202, 216, 216],
        }));
        const ms = imp.modules!.state;
        expect(ms.loadouts.map(l => `${l.id}:${l.name}`)).toEqual(['game-0:farm', 'game-1:push', 'game-2:Preset 3']);
        expect(ms.activeLoadout).toBe('game-1');
        expect(ms.loadouts[1].slots.cannon).toEqual({ main: 'c2', assist: '' });   // what's equipped, unknown Guid dropped
        expect(ms.loadouts[0].slots.cannon.main).toBe('c1');
        expect(ms.loadouts[2].slots.core.main).toBe('');
        expect(ms.slotLevels.cannon.main).toBe(217);
    });

    it('reads assist slots: tier, efficiency (1 + stone levels + labs) and level', () => {
        const imp = parseGameExport(makeExport({
            ModuleEquipped: [gameModule('c1', 45, 15, [1])],
            AssistModuleSlots: [{
                Type: 0, Unlocked: true, Level: 150,
                UniqueEffectEfficiencyLevel: 2, MainEffectEfficiencyLevel: 10, SubstatEfficiencyLevel: 7,
                EquippedModule: gameModule('c2', 41, 15, [1]),
            }],
            ResearchLevel: research({ [labIndex('Assist-Cannon Substat')]: 9 }),
        }));
        const ms = imp.modules!.state;
        expect(ms.assistData.cannon).toEqual({ rarity: 'Mythic', multEff: 11, subEff: 17 });
        expect(ms.assistData.armor.rarity).toBe('locked');
        expect(ms.slotLevels.cannon.assist).toBe(150);
        expect(ms.library.map(m => m.id).sort()).toEqual(['c1', 'c2']);
    });
});

describe('battle history', () => {
    it('turns a battle into a report', () => {
        const [r] = parseGameExport(makeExport({
            BattleHistory: [battle({
                TotalBoss: 40, TotalElites: 900, TotalCommanders: 5, TotalSaboteurs: 6, TotalOvercharges: 7,
                DestroyedInGoldenBot: 600000, RealTime: 3600, CoinsEarned: 2e14, IsTournament: true,
            })],
        })).battles;
        expect(r).toMatchObject({ tier: 18, wave: 8000, bossKills: 40, eliteKills: 900, fleetKills: 18, tournament: true });
        expect(r.coinsPerHour / 2e14).toBeCloseTo(1, 9);
        expect(r.killedWithEffect.goldenBot).toBe(1);    // share capped at 100%
    });

    it('picks the newest full run on the usual farming tier by default', () => {
        const { battles } = parseGameExport(makeExport({
            BattleHistory: [
                battle({ Tier: 18, Wave: 8000 }),
                battle({ Tier: 18, Wave: 8200 }),
                battle({ Tier: 18, Wave: 9000, IsTournament: true }),
                battle({ Tier: 18, Wave: 120 }),                     // quit early
                battle({ Tier: 20, Wave: 3000 }),
                battle({ Tier: 18, Wave: 1, TotalEnemies: 0 }),      // restart
            ],
        }));
        expect(isRealRun(battles[5])).toBe(false);
        expect(defaultBattleIndex(battles)).toBe(1);
        expect(defaultBattleIndex([])).toBe(-1);
    });

    it('keeps every field the game stored for a run, and when it was played', () => {
        const [r] = parseGameExport(makeExport({
            BattleHistory: [battle({ KilledBy: 3, DamageTakenWall: 5e15, SomeList: [1, 2], Nested: { a: 1 } })],
        })).battles;
        expect(r.time).toBe(Date.parse('2026-10-01T12:00:00Z'));
        expect(r.raw).toMatchObject({ KilledBy: 3, DamageTakenWall: 5e15, SomeList: [1, 2], Tier: 18, IsTournament: false });
        expect(r.raw).not.toHaveProperty('Nested');
    });
});

describe('battle history across imports', () => {
    // The file only holds the last 5 runs; each import adds to what's kept.
    const runs = (...fields: Record<string, unknown>[]) =>
        parseGameExport(makeExport({ BattleHistory: fields.map(f => battle(f)) })).battles;

    it('adds new runs, replaces runs seen again, and keeps them oldest first', () => {
        const first = runs(
            { BattleDate: '2026-10-01T00:00:00Z', Wave: 100 },
            { BattleDate: '2026-10-02T00:00:00Z', Wave: 200 },
        );
        const second = runs(
            { BattleDate: '2026-10-02T00:00:00Z', Wave: 200, KilledBy: 2 },   // same run, fresh copy
            { BattleDate: '2026-10-03T00:00:00Z', Wave: 300 },
        );
        const merged = mergeBattles(first, second);
        expect(merged.map(b => b.wave)).toEqual([100, 200, 300]);
        expect(merged[1].raw?.KilledBy).toBe(2);
        expect(mergeBattles(merged, second)).toEqual(merged);
    });

    it('puts runs kept before times were stored first, and caps the history', () => {
        const old = { ...runs({ Wave: 50 })[0], time: undefined, raw: undefined };
        const fresh = runs({ BattleDate: '2026-10-05T00:00:00Z', Wave: 60 });
        expect(mergeBattles(fresh, [old]).map(b => b.wave)).toEqual([50, 60]);

        const many = runs(...Array.from({ length: MAX_STORED_BATTLES + 7 }, (_, i) => ({
            BattleDate: new Date(Date.UTC(2026, 0, 1) + i * 864e5).toISOString(), Wave: 1000 + i,
        })));
        const kept = mergeBattles([], many);
        expect(kept).toHaveLength(MAX_STORED_BATTLES);
        expect(kept[0].wave).toBe(1007);     // the oldest 7 drop off
    });
});
