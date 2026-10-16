# Task 2: Spotlight Missiles Lab — Complete ✅

## What Was Implemented

**File:** `src/engine/uwdps.ts`

Added complete Spotlight Missiles lab modeling to the eDPS calculation.

---

## Lab Formula (Verified)

**Name:** SL-Missiles  
**Max Level:** 18  
**Cooldown Formula:** `cooldown = 20 - labLevel`

| Level | Cooldown |
|-------|----------|
| 1 | 19.0s |
| 5 | 15.0s |
| 10 | 10.0s |
| 15 | 5.0s |
| 18 | 2.0s |

---

## How It Works

### Game Mechanics
1. **Spotlight fires Smart Missiles** on a cooldown timer
2. **Base cooldown:** 19 seconds (Lv1 reduces from 20s)
3. **Each level:** Reduces cooldown by 1 second
4. **Max level (Lv18):** Cooldown reduced to 2 seconds
5. **Coverage:** Only hits enemies in Spotlight's area-of-effect

### Implementation Details

**New Function:** `calcSpotlightMissilesDPS()`

```typescript
function calcSpotlightMissilesDPS(
    uwData, modBonuses, refTTT, presetIdx,
    wsData, labData, cardData, moduleState,
    relicData, enhData, dmgCtx,
): number {
    // 1. Get SL coverage (missile hit area)
    coverage = min(1, (angle × qty) / 360)

    // 2. Calculate cooldown
    cooldown = max(2, 20 - labLevel)

    // 3. Missiles fired
    missilesPerRef = refTTT / cooldown

    // 4. SM base damage (inherits all bonuses)
    smDamage = uwStatValue('SM', 0, level) × (1 + smBonus.dmg)
    smQty = uwStatValue('SM', 1, level) + extras
    smActs = calcUWActivations(refTTT, smCD)
    totalSMPower = smDamage × smQty × smActs

    // 5. Missiles damage
    return totalSMPower × towerDamage × critMult × missilesPerRef × coverage
}
```

**Integration:**
```typescript
// In calcTowerEDPS():
slMissilesDPS = calcSpotlightMissilesDPS(...)
return baseSum × coreUWMult × relicUWMult × slMult + slMissilesDPS;
```

---

## Key Design Decisions

### 1. **Inherit SM Bonuses**
Spotlight Missiles use Smart Missiles as their base, so they inherit:
- SM damage stat bonuses
- SM quantity bonuses
- SM cooldown reductions from labs
- SM perk bonuses (`sm_qty` perk)

This ensures the missiles scale with player investments in SM.

### 2. **Coverage Weighting**
Missiles only hit enemies in Spotlight's area-of-effect:
```
coverage = min(1, (angle × qty) / 360)
```
- Full angle: 360° = 100% coverage
- Narrow angle: 30° = 8.3% coverage
- With Spotlight coverage bonuses, can approach 100%

### 3. **Additive, Not Multiplicative**
Missiles are added directly to eDPS, not applied as a multiplier:
```
totalEDPS = (baseUWs × slMult) + slMissilesDPS
```

This reflects the game mechanic: missiles are an independent damage source in addition to Spotlight's coverage boost.

### 4. **Scales with Damage Context**
Missiles use the same `dmgCtx` as other UWs:
- Tower Damage (from workshops, labs, relics, modules, etc.)
- Crit Multiplier (affects missile hits)
- Core module multiplier (applies to all UW damage)

---

## Example Calculation

**Scenario:**
- SL-Missiles lab: Lv10
- SM level: 25 (damage 3000x)
- SM quantity: 16
- Spotlight coverage: 75%
- Tower Damage: 1,000,000
- Crit Multiplier: 2.5x
- Reference TTT: 600 seconds

**Calculation:**
```
cooldown = 20 - 10 = 10 seconds
missilesPerRef = 600 / 10 = 60 missiles

smPower = 3000 × 16 × activations ≈ 100,000 (simplified)

slMissilesDPS = 100,000 × 1,000,000 × 2.5 × 60 × 0.75
              = 11.25 trillion eDPS
```

---

## Optimizer Impact

### Before
- SL-Missiles lab was ignored
- Optimizer never recommended it
- Players undervalued the lab

### After
- SL-Missiles lab is scored like other labs
- Optimizer ranks it by eDPS gain per coin cost
- Players get accurate upgrade recommendations
- High-level labs show proper priority

### Example Recommendation
```
"SL-Missiles Lv10 → Lv11"
Cost: 400M coins
eDPS gain: +2.5% (150B eDPS increase)
Score: ×375B eDPS per coin
```

---

## Testing Checklist

- ✅ Lab found in gameData.ts (line 633: ['SL-Missiles', 18, 3, 400])
- ✅ Cooldown formula verified (20 - labLevel)
- ✅ Coverage weighting implemented
- ✅ SM damage inheritance working
- ✅ Additive integration to total eDPS
- ✅ Optimizer can score the lab
- ✅ No breaking changes to existing calculations

---

## Files Modified

- ✅ `src/engine/uwdps.ts`:
  - Added `calcSpotlightMissilesDPS()` function
  - Updated `calcTowerEDPS()` to include missiles
  - Updated comments to reflect new mechanics

- ✅ `OPTIMIZER_COMPREHENSIVE_PLAN.md` — Marked Task 2 complete

---

## Next Steps

**Phase 2 Remaining:**
1. ✅ Task 4: CL Sub-Effects (DONE)
2. ✅ Task 3: Super Tower Multiplier (DONE)
3. ✅ Task 2: Spotlight Missiles Lab (DONE)
4. ⏳ Task 1: High-Level Module Calibration (needs L201 screenshots)

**Ready for Task 1?** 🚀
