// ============================================================
//  TowerForge Companion — UW DPS Engine
//  Per-UW eDPS calculations and total tower eDPS.
//
//  UNIFIED FORMULA (DW, SM, ILM, PS, BH, CL):
//    UW_eDPS = UWMultiplier × TowerDamage × CritMult × [UW-specific term]
//
//  TowerDamage already includes: Workshop, Damage Lab, Card
//  Mastery, Relics, Cannon Modules (equipped + assist @ multEff),
//  Enhancements, Perks, Berserker.
//  Assist contribution: cannon module damage scales with multEff;
//  every module's sub-effects (UW bonuses) scale with subEff.
//  CritMult already includes: Crit Chance/Factor, Super Crit
//  Chance/Multi from Workshop + Labs + Enhancements + Cards.
//
//  SPOTLIGHT (SL) is NOT summed — it's a coverage-weighted
//  damage amplifier multiplying the total of the other 6 UWs:
//    SLMult = 1 + (SLBonus × coverage)
//    TotalEDPS = SLMult × Σ(CL, DW, SM, ILM, PS, BH)
//
//  Pure functions — no store imports.
// ============================================================

import {
    UW_PLUS_DATA,
    DW_NORM,
    UW_STAT_VALUES,
    WS_STATS,
} from '../constants/gameData';
import {
    multiverseNexusVariance, spaceDisplacerMinesPerSec, magneticHookMinesPerSec,
    dimensionCoreExtraHits, primordialCollapseExtraHoles,
    antiCubePortalMult, shockMult, omChipMult, deathPenaltyMult,
} from './moduleEffects';

import {
    calcUWActivations,
    calcGCompCDReduction,
    calcTowerRange,
} from './ttt';

import { calcCardMasteryBonuses } from './modBonuses';
import { calcTowerDamage, calcCritMult, calcAttackSpeed, calcDamageMeter, calcCoreUWDamageMult } from './towerDamage';

import type {
    UWData,
    WSPreset,
    LabData,
    CardData,
    RelicData,
    EnhData,
    ModBonuses,
    ModuleState,
    UWAbbr,
    AppState,
} from '../types/gameTypes';

// ── Effective Cooldown ────────────────────────────────────────
// UW cooldowns are independent of Attack Speed — they're fixed timers
// reduced only by the UW's own Cooldown stat (rawCD), cooldown sub-effects
// (bonusCD), and Galaxy Compressor (recovery packages).
export function calcEffCD(
    rawCD: number,
    bonusCD: number,
    modBonuses: ModBonuses,
    wsData: WSPreset[],
    labData: LabData,
    cardData: CardData,
    gcompApplies: boolean = true,
    presetIdx: number = 0,
): number {
    // Galaxy Compressor reduces every UW cooldown EXCEPT Poison Swamp.
    const gcReduction = gcompApplies
        ? calcGCompCDReduction(rawCD + bonusCD, modBonuses, wsData, labData, cardData, presetIdx)
        : 0;
    return Math.max(1, rawCD + bonusCD - gcReduction);
}

// ── UW Stat Value Lookup ──────────────────────────────────────
// ud.sv[statIdx] stores the 1-based LEVEL, not the magnitude. The real
// value lives in UW_STAT_VALUES as a display string ('7961x', '27.5%',
// '180s', '30m', '60°'). This converts a level → its parsed numeric
// value (suffix stripped). Returns 0 for level 0 / out-of-range.
export function uwStatValue(abbr: UWAbbr, statIdx: number, level: number): number {
    if (!level || level < 1) return 0;
    const raw = UW_STAT_VALUES[abbr]?.[statIdx]?.[level - 1];
    if (raw == null) return 0;
    return parseFloat(raw) || 0;
}

// Assist contributes to eDPS through real module effects only:
//   • multEff scales the assist module's MAIN stat (cannon damage →
//     calcCannonModuleMult / tower damage),
//   • subEff scales the assist module's SUB-effects (UW bonuses, via
//     readActiveModuleBonuses).
// There is no flat per-UW assist multiplier.

// ── Shared inputs bundle ────────────────────────────────────────
export interface DamageContext {
    towerDamage: number;
    critMult: number;
    attackSpeed: number;   // fire rate (attacks/sec) — only CL uses this
}

// Build the shared TowerDamage × CritMult context once per calculation
export function buildDamageContext(
    presetIdx: number,
    wsData: WSPreset[],
    labData: LabData,
    cardData: CardData,
    relicData: RelicData,
    enhData: EnhData,
    modBonuses: ModBonuses,
    moduleState: ModuleState,
    botData?: AppState['botData'],
): DamageContext {
    return {
        towerDamage: calcTowerDamage(presetIdx, wsData, labData, cardData, relicData, enhData, modBonuses, moduleState, botData),
        critMult: calcCritMult(presetIdx, wsData, labData, cardData, enhData, relicData, modBonuses),
        attackSpeed: calcAttackSpeed(presetIdx, wsData, labData, cardData, enhData, relicData, modBonuses),
    };
}

// ── PS Coverage ───────────────────────────────────────────────
// PS is a circle of radius psRadius centered PS_CENTER_OFFSET metres
// from the tower. Coverage = fraction of the tower's attack-range
// circle that overlaps the PS circle.
//
// Game data (reverse-engineered):
//   PS base diameter = 51.37m → radius 25.685m
//   Closest PS edge from tower = 22m → center offset = 25.685 - 22 = 3.685m
//
// psRadius already includes perk (psRadMult) and lab (psRadLabMult) scaling.
const PS_BASE_RADIUS = 25.685;
const PS_CENTER_OFFSET = PS_BASE_RADIUS - 22; // 3.685m — fixed placement

function calcPSCoverage(towerRange: number, psRadius: number): number {
    if (towerRange <= 0) return 0;
    const d = PS_CENTER_OFFSET;
    const r = towerRange;
    const R = psRadius;

    if (d + R <= r) return (R * R) / (r * r);  // PS fully inside tower range
    if (d + r <= R) return 1.0;                  // tower range fully inside PS
    if (d >= r + R) return 0;                    // no overlap (can't happen in practice)

    // Partial overlap — circular lens area formula
    const cosA = (d * d + r * r - R * R) / (2 * d * r);
    const cosB = (d * d + R * R - r * r) / (2 * d * R);
    const sinTerm = Math.sqrt(Math.max(0,
        (-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R),
    ));
    const area = r * r * Math.acos(Math.max(-1, Math.min(1, cosA)))
               + R * R * Math.acos(Math.max(-1, Math.min(1, cosB)))
               - 0.5 * sinTerm;
    return Math.min(1, area / (Math.PI * r * r));
}

// ── Multiverse Nexus: Shared Cooldown for DW/GT/BH ────────────
// With Multiverse Nexus equipped, Death Wave, Golden Tower and Black Hole
// always fire together on one cooldown: the average of their own cooldowns
// (stat + Cooldown sub-effects) ± the module's value, then Galaxy Compressor.
// Returns that effective cooldown, or 0 when Multiverse Nexus isn't active.
export function getMultiverseNexusCombinedCD(
    uwData: UWData,
    modBonuses: ModBonuses,
    labData: LabData,
    wsData: WSPreset[],
    cardData: CardData,
    presetIdx: number = 0,
): number {
    const variance = multiverseNexusVariance(modBonuses);
    if (variance === null) return 0;

    const own = (['DW', 'GT', 'BH'] as const).filter(a => uwData.data[a]?.own);
    if (own.length < 2) return 0;
    const cds = own.map(a => (uwStatValue(a, 2, uwData.data[a]!.sv[2]) || 999) + (modBonuses.uwBonus[a]?.cd ?? 0));
    const shared = cds.reduce((sum, cd) => sum + cd, 0) / cds.length + variance;
    return calcEffCD(Math.max(1, shared), 0, modBonuses, wsData, labData, cardData, true, presetIdx);
}

// Inner Land Mines landing per second outside the ILM's own cooldown:
// Space Displacer (from land mines) and Magnetic Hook (at bosses/fleets/elites).
function extraMinesPerSec(modBonuses: ModBonuses, wsData: WSPreset[], presetIdx: number) {
    const lmcIdx = WS_STATS.defense.findIndex(([n]) => n === 'Land Mine Chance');
    const lmcLv = wsData[presetIdx]?.defense[lmcIdx] ?? 0;
    return {
        displacer: spaceDisplacerMinesPerSec(modBonuses, lmcLv),
        hook: magneticHookMinesPerSec(modBonuses),
    };
}

// ── Per-UW eDPS Calculations ───────────────────────────────────
// Returns 0 for SL (handled separately as a multiplier) and CF
// (handled via TTT, not summed).
export function calcUWDPS(
    uwAbbr: UWAbbr,
    uwData: UWData,
    modBonuses: ModBonuses,
    refTTT: number,
    presetIdx: number,
    wsData: WSPreset[],
    labData: LabData,
    cardData: CardData,
    dmgCtx: DamageContext,
): number {
    const ud = uwData.data[uwAbbr];
    if (!ud?.own) return 0;

    const b = modBonuses.uwBonus[uwAbbr] ?? {};
    const pk = modBonuses.perks;
    const { towerDamage, critMult, attackSpeed } = dmgCtx;

    switch (uwAbbr) {

        case 'CL': {
            // CL_eDPS = CLDamageStat × TowerDamage × CritMult × qty × procChance
            //         × dimCoreMult × fireRate × assistMult
            // CL procs once per tower shot, so it scales with attack speed
            // (fire rate). It's the only UW affected by attack speed.
            // Module sub-effects:
            //   b.dmg = "Chain Lightning - Damage" fractional boost (e.g. +15%)
            //   b.qty = "Chain Lightning - Quantity" flat count bonus (e.g. +1)
            //   b.chance = "Chain Lightning - Chance" percentage bonus (e.g. +5%)
            // Damage sub-effects add to the multiplier (+250x → +250).
            const uwMult = uwStatValue('CL', 0, ud.sv[0]) + (b.dmg ?? 0);       // Damage multiplier (2x…7961x)
            // Dimension Core: 60% chance to also hit the first target.
            const qty = uwStatValue('CL', 1, ud.sv[1]) + (b.qty ?? 0) + dimensionCoreExtraHits(modBonuses);
            const chance = (uwStatValue('CL', 2, ud.sv[2]) + (b.chance ?? 0) * 100) / 100;  // Chance (5%…27.5%) + module bonus
            const cardMastery = calcCardMasteryBonuses(presetIdx, cardData);
            const critMastAdd = cardMastery.critMastAdd / 100;
            const clDmgMult = pk.clDmgMult ?? 1;

            return uwMult * towerDamage * critMult * clDmgMult
                * qty * (chance + critMastAdd) * attackSpeed;
        }

        case 'SM': {
            // SM_eDPS = SMDamageStat × TowerDamage × CritMult × totalMissiles × assistMult
            const uwMult = uwStatValue('SM', 0, ud.sv[0]) + (b.dmg ?? 0);                    // Damage (10x…3021x)
            const qty = uwStatValue('SM', 1, ud.sv[1]) + (pk.smExtraQty ?? 0) + (b.qty ?? 0); // Quantity (5…20)
            const rawCD = uwStatValue('SM', 2, ud.sv[2]) || 999;                              // Cooldown (180s…20s)
            const effCD = calcEffCD(rawCD, b.cd ?? 0, modBonuses, wsData, labData, cardData, true, presetIdx);
            const acts = calcUWActivations(refTTT, effCD);

            // Cover Fire (SM+): launches 1 extra missile every X seconds on its
            // own timer, independent of the main volley cooldown.
            const smPlus = UW_PLUS_DATA['SM'];
            const smLv = ud.upOwn ? Math.min(ud.upLvl ?? 0, (smPlus?.vals.length ?? 1) - 1) : -1;
            const coverFireInterval = smLv >= 0 ? (parseFloat(smPlus?.vals[smLv] ?? '0') || 0) : 0;
            const coverFireMissiles = coverFireInterval > 0 ? refTTT / coverFireInterval : 0;

            const totalMissiles = qty * acts + coverFireMissiles;
            return uwMult * towerDamage * critMult * totalMissiles;
        }

        case 'DW': {
            // DW_eDPS = DWDamageStat × TowerDamage × CritMult × DW_NORM × killWallAmp × acts × assistMult
            const uwMult = uwStatValue('DW', 0, ud.sv[0]) + (b.dmg ?? 0);       // Damage (2x…9119x)
            const ewCount = uwStatValue('DW', 1, ud.sv[1]) + (pk.dwExtraWave ?? 0) + (b.qty ?? 0); // Effect Waves (1…5)
            const rawCD = uwStatValue('DW', 2, ud.sv[2]) || 999;                // Cooldown (300s…50s)

            // Multiverse Nexus: DW/GT/BH share one cooldown.
            const mvnCD = getMultiverseNexusCombinedCD(uwData, modBonuses, labData, wsData, cardData, presetIdx);
            const effCD = mvnCD > 0 ? mvnCD : calcEffCD(rawCD, b.cd ?? 0, modBonuses, wsData, labData, cardData, true, presetIdx);

            const EW_INTERVAL = 10;
            const wavesLanding = Math.min(ewCount, Math.floor(effCD / EW_INTERVAL));
            const kwData = UW_PLUS_DATA['DW'];
            const kwLv = ud.upOwn ? Math.min(ud.upLvl ?? 0, (kwData?.vals.length ?? 1) - 1) : -1;
            const kwVal = kwLv >= 0 ? (parseFloat(kwData?.vals[kwLv] ?? '1') || 1) : 1;
            const kwAmp = 1 + (wavesLanding * kwVal);

            const acts = calcUWActivations(refTTT, effCD);

            return uwMult * towerDamage * critMult * DW_NORM * kwAmp * acts;
        }

        case 'ILM': {
            // ILM_eDPS = ILMDamageStat × TowerDamage × CritMult × mines, where mines =
            //   qty × acts × chargedVal                 (the UW's own volleys)
            // + Space Displacer mines × chargedVal      (land mines turned into ILMs)
            // + Magnetic Hook mines                     (fired straight at bosses/fleets/elites)
            const uwMult = uwStatValue('ILM', 0, ud.sv[0]) + (b.dmg ?? 0); // Damage (10x…3021x)
            const qty = uwStatValue('ILM', 1, ud.sv[1]) + (b.qty ?? 0); // Quantity (3…6)
            const rawCD = uwStatValue('ILM', 2, ud.sv[2]) || 999;       // Cooldown (200s…50s)
            const effCD = calcEffCD(rawCD, b.cd ?? 0, modBonuses, wsData, labData, cardData, true, presetIdx);

            // Charged Mine (ILM+): a mine's damage grows by `chargePerSec`× every
            // second and never resets until detonated. In the late game a mine
            // typically survives until a boss reaches it — roughly the boss
            // interval — so damageMult = 1 + chargePerSec × ILM_CHARGE_TIME_S.
            const ILM_CHARGE_TIME_S = 100; // assumed avg charge time (boss interval)
            const ilmPlus = UW_PLUS_DATA['ILM'];
            const ilmLv = ud.upOwn ? Math.min(ud.upLvl ?? 0, (ilmPlus?.vals.length ?? 1) - 1) : -1;
            const chargePerSec = ilmLv >= 0 ? (parseFloat(ilmPlus?.vals[ilmLv] ?? '0') || 0) : 0;
            const chargedVal = 1 + chargePerSec * ILM_CHARGE_TIME_S;

            const acts = calcUWActivations(refTTT, effCD);
            const extra = extraMinesPerSec(modBonuses, wsData, presetIdx);
            const mines = (qty * acts + extra.displacer * refTTT) * chargedVal + extra.hook * refTTT;

            return uwMult * towerDamage * critMult * mines;
        }

        case 'PS': {
            // PS_eDPS = PSDamageStat × TowerDamage × CritMult
            //         × psCoverage (fraction of tower range inside PS)
            //         × duration × creepMult × harmonyMult
            //         × rendMult × stunMult × acts × assistMult
            const uwMult = uwStatValue('PS', 0, ud.sv[0]) + (b.dmg ?? 0);  // Damage (10x…3021x)
            const duration = uwStatValue('PS', 1, ud.sv[1]) + (b.dur ?? 0); // Duration (30s…100s)
            const rawCD = uwStatValue('PS', 2, ud.sv[2]) || 999;           // Cooldown (125s…50s)
            // PS cooldown is NOT reduced by Galaxy Compressor.
            const effCD = calcEffCD(rawCD, b.cd ?? 0, modBonuses, wsData, labData, cardData, false, presetIdx);

            // Coverage: what fraction of tower attack range overlaps the PS circle.
            // Radius upgrades expand PS until it fully envelopes the tower range (→ 1.0).
            const psRadMult = pk.psRadMult ?? 1;
            const psRadLabMult = 1 + (labData['PS-Radius'] ?? 0) * 0.04;
            const psRadius = PS_BASE_RADIUS * psRadMult * psRadLabMult;
            const towerRange = calcTowerRange(presetIdx, wsData, labData, cardData);
            const psCoverage = calcPSCoverage(towerRange, psRadius);

            // Death Creep (PS+): each 1s tick deals +creepPerTick of base damage,
            // additively (tick n = base × (1 + (n-1)·creepPerTick)). Over `duration`
            // ticks the average tick = base × (1 + creepPerTick·(duration-1)/2), so
            // that average is the multiplier on the flat-tick PS eDPS.
            const psPlus = UW_PLUS_DATA['PS'];
            const psLv = ud.upOwn ? Math.min(ud.upLvl ?? 0, (psPlus?.vals.length ?? 1) - 1) : -1;
            const creepPerTick = psLv >= 0 ? (parseFloat(psPlus?.vals[psLv] ?? '0') || 0) / 100 : 0;
            const creepMult = 1 + creepPerTick * Math.max(0, duration - 1) / 2;

            // Swamp Rend: +3% damage per lab level (max +90% at lv 30).
            // Swamp Rend Extra: extends rend to 1 additional enemy type per level
            // (basic = 1 type, +11 = all 12 types after the Tier 22–24 Fleet enemies
            // Scatter/Ray/Saboteur/Commander/Overcharge were added). Modelled as
            // fractional coverage assuming equal enemy-type distribution.
            const rendLv = labData['PS-Swamp Rend'] ?? 0;
            const rendExtraLv = labData['PS-Swamp Rend Extra'] ?? 0;
            const rendCoverage = rendLv > 0 ? (1 + rendExtraLv) / 12 : 0;
            const rendMult = 1 + rendLv * 0.03 * rendCoverage;

            // Stun: enemies frozen on swamp entry can't escape, extending their
            // effective exposure. Expected extra seconds = pStun × tStun.
            // Divided by PS_BASE_EXPOSURE (2s) — estimated avg time a moving enemy
            // spends inside the swamp without stun. Adjust if game data shows otherwise.
            const stunUnlocked = (labData['PS-Stun(unlock)'] ?? 0) >= 1;
            const pStun = stunUnlocked ? (0.05 + (labData['PS-Stun Chance'] ?? 0) * 0.025) : 0;
            const tStun = stunUnlocked ? (1 + (labData['PS-Stun Time'] ?? 0) * 0.3) : 0;
            const PS_BASE_EXPOSURE_S = 2;
            const psStunMult = 1 + (pStun * tStun) / PS_BASE_EXPOSURE_S;

            const acts = calcUWActivations(refTTT, effCD);

            return uwMult * towerDamage * critMult
                * psCoverage
                * duration * creepMult
                * rendMult * psStunMult * acts;
        }

        case 'BH': {
            // BH_eDPS = BHSizeStat × TowerDamage × CritMult × duration × consumeMult × harnessMult × acts × assistMult
            const uwMult = uwStatValue('BH', 0, ud.sv[0]) + (b.size ?? 0);                  // Size (30m…70m)
            const dur = uwStatValue('BH', 1, ud.sv[1]) + (pk.bhExtraDur ?? 0) + (b.dur ?? 0); // Duration (15s…38s)
            const rawCD = uwStatValue('BH', 2, ud.sv[2]) || 999;                             // Cooldown (200s…50s)

            // Multiverse Nexus: DW/GT/BH share one cooldown.
            const mvnCD = getMultiverseNexusCombinedCD(uwData, modBonuses, labData, wsData, cardData, presetIdx);
            const effCD = mvnCD > 0 ? mvnCD : calcEffCD(rawCD, b.cd ?? 0, modBonuses, wsData, labData, cardData, true, presetIdx);

            const bhPlus = UW_PLUS_DATA['BH'];
            const bhLv = ud.upOwn ? Math.min(ud.upLvl ?? 0, (bhPlus?.vals.length ?? 1) - 1) : -1;
            const consumeMult = bhLv >= 0
                ? (parseFloat(bhPlus?.vals[bhLv]?.replace('%', '') ?? '0') / 100 + 1)
                : 1;
            // Extra holes: the BH-Extra lab and Primordial Collapse.
            const holes = 1 + ((labData['BH-Extra(unlock)'] ?? 0) >= 1 ? 1 : 0) + primordialCollapseExtraHoles(modBonuses);

            const acts = calcUWActivations(refTTT, effCD);

            return uwMult * towerDamage * critMult * dur * consumeMult * holes * acts;
        }

        // SL and CF are not summed directly — handled in calcTowerEDPS
        case 'SL':
        case 'CF':
        default:
            return 0;
    }
}

// ── Spotlight Multiplier ────────────────────────────────────────
// SL is a coverage-weighted damage amplifier on the total eDPS,
// not its own additive term.
//   SLCoverage = min(1, (angle × qty) / 360)
//   SLMult     = 1 + (SLBonus × SLCoverage)
export function calcSpotlightMult(
    uwData: UWData,
    modBonuses: ModBonuses,
    damageMeter: number,
    range: number,
): number {
    const ud = uwData.data['SL'];
    if (!ud?.own) return 1;

    const b = modBonuses.uwBonus['SL'] ?? {};
    const bonus = uwStatValue('SL', 0, ud.sv[0]) + (b.bonus ?? 0); // Bonus (8x…43x)
    const angle = uwStatValue('SL', 1, ud.sv[1]) + (b.angle ?? 0);  // Angle (30°…90°)
    const qty = uwStatValue('SL', 2, ud.sv[2]);                     // Quantity (1…4)

    const slBonusPerk = modBonuses.perks.slBonusMult ?? 1;

    // Light Range (SL+): "Spotlight damage bonus boosted by X × your
    // Damage/Meter". Damage/Meter is range-scaled (DPM% per meter × range),
    // so the bonus gains lrVal × damageMeter × range.
    const slPlus = UW_PLUS_DATA['SL'];
    const slLv = ud.upOwn ? Math.min(ud.upLvl ?? 0, (slPlus?.vals.length ?? 1) - 1) : -1;
    const lrVal = slLv >= 0 ? (parseFloat(slPlus?.vals[slLv]?.replace('x', '') ?? '0') || 0) : 0;
    const lightRangeBonus = lrVal * damageMeter * range;

    // Bonus is a "multiplier to damage received" (e.g. 8× = ×8 damage in the
    // light), so the time-averaged uplift is coverage × (multiplier − 1).
    const inLightMult = (bonus * slBonusPerk) + lightRangeBonus;
    const coverage = Math.min(1, (angle * qty) / 360);

    return 1 + Math.max(0, inLightMult - 1) * coverage;
}

// ── Golden Tower Bonus (display/multiplier proxy, not summed) ──
export function calcGTMult(
    uwData: UWData,
    modBonuses: ModBonuses,
    refTTT: number,
    wsData: WSPreset[],
    labData: LabData,
    cardData: CardData,
): number {
    const ud = uwData.data['GT'];
    if (!ud?.own) return 1;

    const b = modBonuses.uwBonus['GT'] ?? {};
    const mult = uwStatValue('GT', 0, ud.sv[0]);             // Multiplier (5.0x…21.0x)
    const dur = uwStatValue('GT', 1, ud.sv[1]) + (b.dur ?? 0); // Duration (15s…53s)
    const rawCD = uwStatValue('GT', 2, ud.sv[2]) || 999;     // Cooldown (300s…100s)

    // Multiverse Nexus: DW/GT/BH share one cooldown.
    const mvnCD = getMultiverseNexusCombinedCD(uwData, modBonuses, labData, wsData, cardData);
    const effCD = mvnCD > 0 ? mvnCD : calcEffCD(rawCD, b.cd ?? 0, modBonuses, wsData, labData, cardData);
    const gtBonus = modBonuses.perks.gtBonusMult ?? 1;
    const acts = calcUWActivations(refTTT, effCD);
    const effMult = mult * gtBonus;
    const uptime = Math.min(1, (dur * acts) / Math.max(0.1, refTTT));

    return 1 + (effMult - 1) * uptime;
}

// ── CL+ Smite (separate from tower eDPS) ──────────────────────
// Smite deals a fraction of *current wave HP* per CL hit (not tower damage),
// up to 100 hits per enemy. We assume the 100-hit cap is reached for enemies
// that matter, so per-enemy Smite damage = 100 × perHitFraction of wave HP.
// Returned as a 0–1 fraction of wave HP. Because this scales with enemy HP
// (not tower damage), it is reported separately rather than summed into eDPS.
const SMITE_HIT_CAP = 100;
// Black Hole deals a share of each enemy's health (the BH Damage lab),
// not tower damage, so its damage grows with how much of the run the
// holes cover: holes × uptime × size (the same reach the farming model
// uses for Black Hole coins). Relative units — only ratios matter.
export function calcBlackHoleReach(
    uwData: UWData,
    modBonuses: ModBonuses,
    presetIdx: number,
    wsData: WSPreset[],
    labData: LabData,
    cardData: CardData,
): number {
    const ud = uwData.data['BH'];
    if (!ud?.own) return 0;
    const b = modBonuses.uwBonus['BH'] ?? {};
    const size = uwStatValue('BH', 0, ud.sv[0]) + (b.size ?? 0);
    const dur = uwStatValue('BH', 1, ud.sv[1]) + (modBonuses.perks.bhExtraDur ?? 0) + (b.dur ?? 0);
    const rawCD = uwStatValue('BH', 2, ud.sv[2]) || 999;
    const mvnCD = getMultiverseNexusCombinedCD(uwData, modBonuses, labData, wsData, cardData, presetIdx);
    const effCD = mvnCD > 0 ? mvnCD : calcEffCD(rawCD, b.cd ?? 0, modBonuses, wsData, labData, cardData, true, presetIdx);
    const holes = 1 + ((labData['BH-Extra(unlock)'] ?? 0) >= 1 ? 1 : 0) + primordialCollapseExtraHoles(modBonuses);
    return holes * Math.min(1, dur / Math.max(1, effCD)) * size;
}

// Chain Lightning's proc chance (0–1) and chain count, with module bonuses.
export function calcCLChanceQty(uwData: UWData, modBonuses: ModBonuses): { chance: number; qty: number } {
    const ud = uwData.data['CL'];
    if (!ud?.own) return { chance: 0, qty: 0 };
    const b = modBonuses.uwBonus['CL'] ?? {};
    return {
        chance: (uwStatValue('CL', 2, ud.sv[2]) + (b.chance ?? 0) * 100) / 100,
        qty: uwStatValue('CL', 1, ud.sv[1]) + (b.qty ?? 0) + dimensionCoreExtraHits(modBonuses),
    };
}

// Consume (BH+): each hole ends by dealing this share of the wave's enemy
// health to every enemy inside (0.05 = 5%). 0 without BH+.
export function calcConsumeFraction(uwData: UWData): number {
    const ud = uwData.data['BH'];
    if (!ud?.own || !ud.upOwn) return 0;
    const plus = UW_PLUS_DATA['BH'];
    const lv = Math.min(ud.upLvl ?? 0, (plus?.vals.length ?? 1) - 1);
    return (parseFloat(plus?.vals[lv] ?? '0') || 0) / 100;
}

// Smite (CL+): share of the wave's enemy health dealt per proc (0.0005 = 0.05%).
export function calcSmitePerProc(uwData: UWData): number {
    const cl = uwData.data['CL'];
    if (!cl?.own || !cl?.upOwn) return 0;
    const smite = UW_PLUS_DATA['CL'];
    const lv = Math.min(cl.upLvl ?? 0, (smite?.vals.length ?? 1) - 1);
    return (parseFloat(smite?.vals[lv] ?? '0') || 0) / 100;
}

export function calcSmiteWaveHPFraction(uwData: UWData): number {
    const cl = uwData.data['CL'];
    if (!cl?.own || !cl?.upOwn) return 0;
    const smite = UW_PLUS_DATA['CL'];
    const lv = Math.min(cl.upLvl ?? 0, (smite?.vals.length ?? 1) - 1);
    const perHitPct = parseFloat(smite?.vals[lv] ?? '0') || 0; // e.g. '0.60%' → 0.60
    return Math.min(1, (perHitPct / 100) * SMITE_HIT_CAP);     // 0.006 × 100 = 0.60
}

// ── Spotlight Missiles Lab Contribution ──────────────────────
// SL-Missiles lab makes Spotlight fire Smart Missiles on a timer.
// Cooldown = 20 - labLevel (19s at Lv1 → 2s at Lv18)
// Each missile does SM-damage, hits only enemies in SL coverage.
export function calcSpotlightMissilesDPS(
    uwData: UWData,
    modBonuses: ModBonuses,
    refTTT: number,
    _presetIdx: number,
    wsData: WSPreset[],
    labData: LabData,
    cardData: CardData,
    _moduleState: ModuleState,
    _relicData: RelicData,
    _enhData: EnhData,
    dmgCtx: DamageContext,
): number {
    const sl = uwData.data['SL'];
    if (!sl?.own) return 0;

    // Get SL coverage (used to weight missile hits)
    const b = modBonuses.uwBonus['SL'] ?? {};
    const angle = uwStatValue('SL', 1, sl.sv[1]) + (b.angle ?? 0);
    const qty = uwStatValue('SL', 2, sl.sv[2]);
    const coverage = Math.min(1, (angle * qty) / 360);
    if (coverage <= 0) return 0;

    // Calculate cooldown: cooldown = 20 - labLevel
    const slMissilesLabLv = labData['SL-Missiles'] ?? 0;
    if (slMissilesLabLv <= 0) return 0;
    const cooldown = Math.max(2, 20 - slMissilesLabLv);  // Min 2s at Lv18

    // Calculate missiles fired per reference time
    const missilesPerRef = refTTT / cooldown;

    // SM damage (same as Smart Missiles UW damage)
    const smUW = uwStatValue('SM', 0, uwData.data['SM']?.sv[0] ?? 0);
    const smBonus = modBonuses.uwBonus['SM'] ?? {};
    const smDamage = smUW * (1 + (smBonus.dmg ?? 0));

    // Missiles inherit SM quantity/cooldown bonuses for full scaling
    const smQty = (uwStatValue('SM', 1, uwData.data['SM']?.sv[1] ?? 0) || 1) + (modBonuses.perks.smExtraQty ?? 0) + (smBonus.qty ?? 0);
    const rawCD = uwStatValue('SM', 2, uwData.data['SM']?.sv[2] ?? 0) || 999;
    const effCD = calcEffCD(rawCD, smBonus.cd ?? 0, modBonuses, wsData, labData, cardData);
    const smActs = calcUWActivations(refTTT, effCD);
    const totalSMPower = smDamage * smQty * smActs;

    // SL missiles: inherit tower damage/crit from dmgCtx, scale by coverage
    return totalSMPower * dmgCtx.towerDamage * dmgCtx.critMult * missilesPerRef * coverage;
}

// ── Total Tower eDPS ──────────────────────────────────────────
// Sums the 6 damage UWs (CL, DW, SM, ILM, PS, BH) using the
// unified formula, then applies SL's coverage multiplier.
// Also adds Spotlight Missiles lab contribution (if present).
// GT and CF are excluded from the sum (handled via multiplier/TTT).
export function calcTowerEDPS(
    uwData: UWData,
    modBonuses: ModBonuses,
    refTTT: number,
    presetIdx: number,
    wsData: WSPreset[],
    labData: LabData,
    cardData: CardData,
    moduleState: ModuleState,
    relicData: RelicData = {},
    enhData: EnhData = { d: {}, u: {} },
    botData?: AppState['botData'],
): number {
    const dmgCtx = buildDamageContext(
        presetIdx, wsData, labData, cardData, relicData, enhData, modBonuses, moduleState, botData,
    );

    const sumUWs: UWAbbr[] = ['CL', 'SM', 'DW', 'ILM', 'PS', 'BH'];

    const baseSum = sumUWs.reduce((total, abbr) => {
        return total + calcUWDPS(
            abbr, uwData, modBonuses, refTTT,
            presetIdx, wsData, labData, cardData, dmgCtx,
        );
    }, 0);

    const damageMeter = calcDamageMeter(presetIdx, wsData, labData, enhData, relicData);
    const range = calcTowerRange(presetIdx, wsData, labData, cardData);
    const slMult = calcSpotlightMult(uwData, modBonuses, damageMeter, range);

    // Core modules' "Ultimate Weapon Damage" main effect multiplies the UW sum.
    const coreUWMult = calcCoreUWDamageMult(moduleState);

    // Ultimate Damage relic (rUWDmg, max +40%) also multiplies all UW damage.
    const relicUWMult = 1 + (relicData['rUWDmg'] ?? 0) / 100;

    // Spotlight Missiles lab adds an independent damage source
    const slMissilesDPS = calcSpotlightMissilesDPS(
        uwData, modBonuses, refTTT, presetIdx, wsData, labData, cardData,
        moduleState, relicData, enhData, dmgCtx,
    );

    return (baseSum * coreUWMult * relicUWMult * slMult + slMissilesDPS)
        * calcDamageTakenMult(uwData, modBonuses, refTTT, presetIdx, wsData, labData);
}

// ── Enemy Damage-Taken Multiplier ─────────────────────────────
// Effects that make enemies take more damage from everything (or clear them
// faster): Anti-Cube Portal, Chain Lightning shock (Dimension Core), Om Chip
// and Death Penalty. See moduleEffects.ts for each formula.
export function calcDamageTakenMult(
    uwData: UWData,
    modBonuses: ModBonuses,
    refTTT: number,
    presetIdx: number,
    wsData: WSPreset[],
    labData: LabData,
): number {
    const swIdx = WS_STATS.defense.findIndex(([n]) => n === 'Shockwave Frequency');
    const swFreqLv = wsData[presetIdx]?.defense[swIdx] ?? 0;
    return antiCubePortalMult(modBonuses, swFreqLv)
        * shockMult(modBonuses, labData, !!uwData.data['CL']?.own)
        * omChipMult(modBonuses, refTTT, !!uwData.data['SL']?.own)
        * deathPenaltyMult(modBonuses);
}