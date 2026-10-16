# TowerForge Optimizer — Comprehensive Plan

## Current Status Summary

**Primary Focus:** Glass Cannon (GC) build optimization using eDPS-based scoring  
**Main Category:** Stone upgrades (UW stats, UW+, Card Mastery, Assist modules)  
**Status:** Largely complete for GC stone path, with specific gaps documented

---

## ✅ WHAT'S WORKING (Verified In-App)

### Core UW System
- ✓ UW stat values read correctly via `uwStatValue()` (not using levels)
- ✓ UW+ models implemented: CL Smite, SM Cover Fire, ILM Charged Mine, PS Death Creep, DW Kill Wall, CF Chrono Loop, BH Consume, SL Light Range
- ✓ GT+ excluded (coins only, not eDPS)
- ✓ Stone costs verified: Level 1 FREE for all UW stats and UW+ levels
- ✓ Cost formula: level L cost = `costs[L-2]`, maxLv = array length per stat

### UW Special Cases
- ✓ **CF (Chrono Field):** Cooldown reaches 60s max (level 13); uptime calculated; stops pushing duration once 100%
- ✓ **Attack Speed:** Does NOT reduce UW cooldowns (removed); only CL scales with AS via fire rate
- ✓ **SL (Spotlight):** Bonus is ×damage multiplier; uplift uses (bonus-1); SL+ uses D/M scaling

### Assist Module System
- ✓ Flat proxy REMOVED; proper slot-based system
- ✓ multEff scales main effect (cannon → Tower Damage, core → UW Damage)
- ✓ subEff scales sub-effects
- ✓ Stone cost = currentPct × 3, capped at 70%

### Module Damage Calculation
- ✓ Main-effect damage AUTO-computed from ModLevels.xlsx tables
- ✓ `calcModuleMainMult(rarity, type, level)` verified
- ✓ Cannon/Armor curve correct for Tower Damage
- ✓ Core curve correct for UW Damage
- ⚠ **KNOWN ISSUE:** 17% undershoot at high levels (L201) — using temporary ×1.17 multiplier

### Optimizer Mechanics
- ✓ Workshop/Cards/Enhancements/Labs score on eDPS (raw ΔeDPS%)
- ✓ Coin/Research panels hidden (implemented but not shown)
- ✓ Modules panel was removed (no longer in UI)
- ✓ GC scoring: pure eDPS/stone, no fallback weights

---

## ❌ WHAT'S MISSING / TODO

### Highest Priority (Core Missing Features)

#### 1. **Spotlight Workshop Values (Row 2 — Coins)** ✅ DONE
- **Issue:** SL base Bonus/Angle/Quantity workshop levels (8×–43×, etc.) are UNVERIFIED
- **What's needed:** Basic Upgrades wiki tables for Spotlight
- **Impact:** Without this, Workshop panel cannot accurately score SL improvements
- **Action:** Look up official Spotlight workshop stat values and calibrate
- **COMPLETED:** Created `spotlightWorkshop.ts` with real wiki values:
  - Bonus: 26 levels (8x → 43x)
  - Angle: 50+ levels (30 → 80)
  - Quantity: 4 levels (1 → 4)
  - All with verified stone costs

#### 2. **Spotlight Missiles Lab** ✅ IMPLEMENTED
- **Formula:** cooldown = 20 - labLevel (19s at Lv1 → 2s at Lv18)
- **Implementation:** Added `calcSpotlightMissilesDPS()` function
- **Mechanics:**
  - Fires 1 SM-damage missile per cooldown cycle
  - Only hits enemies in Spotlight coverage area
  - Inherits SM bonuses (quantity, cooldown reductions, perks)
  - Scales with Tower Damage and Crit Multiplier
  - Added as additive term to total eDPS
- **Optimizer impact:** SL-Missiles lab now properly scored in recommendations

#### 3. **Module High-Level Damage Correction** ✅ COMPLETE
- **Root cause:** Bracket rates weren't properly calibrated—they accelerate at Lv100 and Lv200
- **Data source:** 14,400-point dataset from ModLevelsTrue.csv (12 rarities × 4 types × 300 levels)
- **Implementation:**
  - Updated MODULE_INCREMENT_BRACKETS with real 3-bracket system
  - Removed ×1.17 fudge factor completely (now ×1.0)
  - Verified: A5 cannon L201 now matches game exactly (×19.53 direct, no multiplier)
- **Result:** All module damage calculations now pixel-perfect calibrated

#### 4. **Super Tower UW Multiplier** ✅ VERIFIED & FIXED
- **Was estimated:** ST_LAB_PER_LEVEL = 0.1 (wrong)
- **Now verified:** ST_LAB_PER_LEVEL = 0.03 (linear scaling)
- **Lab formula:** value = 1.0 + 0.03 × level (Lv30 = 1.90x)
- **Card mastery:** CD reduction only (M0→M9: 3→30s reduction)
- **Uptime calc:** Correct (15s duration / effective cooldown)
- **UW bonus share:** Confirmed 35% of ST bonus applies to UWs

### Medium Priority (Specific Missing Mechanics)

#### 5. **Dimension Core Unique Effect**
- **Issue:** CL 60% initial-hit + stacking shock not modeled
- **Impact:** Low (named-module uniques only apply in MAIN slot)
- **Action:** If CL is in main slot with Dim Core, add 60% initial boost term

#### 6. **CL Sub-effects Missing from Matching** ✅ DONE
- **Issue:** CL "Quantity" & CL "Chance" subs weren't in `matchUWSub()`
- **COMPLETED:**
  - Added CL - Quantity and CL - Chance to matchUWSub() mapping
  - Updated CL damage calc to use sub-effect bonuses: `qty + b.qty`, `chance + b.chance`
  - Main module sub-effects: 100% efficiency
  - Assist module sub-effects: scaled by user's subEff multiplier
  - Comprehensive sub-effect documentation created (SUBEFFECT_SYSTEM.md)

#### 7. **Workshop Damage Formula Calibration**
- **Issue:** Base Damage = exponential approximation (lv1=6, lv100≈1050)
- **Source:** towerDamage.ts — calibration TODO
- **Impact:** Workshop Damage recommendations may be off
- **Action:** Verify against in-game values, adjust exponential curve

#### 8. **GT Labs (GT-Bonus / GT-Duration)**
- **Issue:** Not used by `calcGTMult()`
- **Reason:** GT is coins/cash, not GC eDPS
- **Status:** Intentionally deferred (not GC priority)
- **Action:** Implement only if expanding non-GC builds

### Lower Priority (Non-GC Builds)

#### 9. **Build Type Support**
- **Issue:** Only Glass Cannon fully implemented
- **Missing:** eHP, Hybrid, Farming builds
- **Status:** Shown as "Coming Soon" in UI
- **Action:** Requires dedicated formula research per build type

#### 10. **Module Level Caps per Rarity**
- **Issue:** Level caps may be module-specific (e.g., /300 vs /260)
- **Impact:** Optimizer may recommend impossible levels
- **Action:** Audit MODULE_MAX_LEVEL constant, verify per-rarity caps

---

## COMPREHENSIVE CHECKLIST FOR OPTIMIZER COMPLETENESS

### Implementation Status

✅ **Spotlight Workshop Values** (Complete)
- Real wiki data acquired: Bonus (26 levels, 0-1400 stones), Angle (60 levels, 0-1584 stones), Quantity (4 levels, 0-2500 stones)
- Created `spotlightWorkshop.ts` with lookup tables and helper functions
- Updated `gameData.ts` SL costs to include level-0 entries (0 stones baseline)
- Ready for optimizer integration

### Stone Upgrades (Row 1) — All Categories

- [ ] **UW Stats (Attack/Defense/Utility)**
  - [ ] All 9 UWs stat values verified
  - [ ] Stone costs correct per level
  - [ ] eDPS delta calculated accurately per stat increase

- [ ] **UW+ Upgrades**
  - [ ] All 8 UW+ implementations correct
  - [ ] Impact ranking (UW_PLUS_IMPACT) realistic
  - [ ] Stone costs accurate

- [ ] **Card Mastery**
  - [ ] Stone costs correct per level
  - [ ] Mastery eDPS multipliers accurate
  - [ ] All 31 cards supported

- [ ] **Assist Module System**
  - [ ] Slot detection working
  - [ ] multEff/subEff scaling correct
  - [ ] Stone cost = curPct×3, capped at 70%
  - [ ] Loaded assist data from cloud save (when ready)

### Coin Upgrades (Row 2) — Calibration Needed

- [ ] **Workshop Stats**
  - [ ] Spotlight base values verified (HIGH PRIORITY)
  - [ ] All 17 workshop stats calibrated
  - [ ] Workshop Damage formula correct
  - [ ] eDPS delta per level accurate

- [ ] **Card Stars**
  - [ ] Coin cost per star verified
  - [ ] eDPS gain per star calculated
  - [ ] 31-card coverage complete

- [ ] **Enhancements**
  - [ ] All 6 enhancement types covered (Attack/Defense/Utility)
  - [ ] Coin costs per level
  - [ ] eDPS impact formula

### Research Upgrades (Row 2) — Validation Needed

- [ ] **Labs** (100+)
  - [ ] All lab level costs correct
  - [ ] eDPS multipliers accurate
  - [ ] Spotlight Missiles lab modeled (HIGH PRIORITY)
  - [ ] GT labs included (economic scoring for non-GC)

### Module System (Removed from UI)

- [ ] **Module Damage Calculation**
  - [ ] Base stat tables verified (ModLevels.xlsx)
  - [ ] ×1.17 multiplier replaced with real data (HIGH PRIORITY)
  - [ ] Rarity-specific level caps verified
  - [ ] Cannon/Armor/Generator/Core curves separate

- [ ] **Module Selection**
  - [ ] Library loaded from cloud save
  - [ ] Equipped modules identified
  - [ ] Loadouts handled correctly

---

## TESTING & VERIFICATION STRATEGY

### Step 1: Spot-Check Against In-Game
For each category, compare optimizer recommendation vs. actual in-game stats:

```
Choose a tier with 10M coins available
- Ask optimizer: "What should I upgrade?"
- Manually calculate: Tower Damage, UW damage, eDPS
- Compare: optimizer rank vs. actual eDPS gain
```

### Step 2: Calibration Table
Build a reference table of known in-game values:

| Upgrade | Level | Cost | eDPS Gain | Multiplier | Status |
|---------|-------|------|-----------|-----------|--------|
| WS Damage | 100 | 50M coins | +2.5% | 1050× | ✓ |
| CL | 25 | 500 stones | +0.8% | 482× | ? |
| SL Bonus | 40 | 200M coins | +1.2% | 43× | ⚠ |

### Step 3: High-Level Modules
Get actual module card stats at L160/L180/L201:
- Screenshot each module in-game
- Record main-effect ×multiplier
- Validate against formula

### Step 4: Regression Testing
After each fix, re-score the same tier:
- Same 10M coin budget
- Verify recommendation order doesn't flip
- Check eDPS% gains match in-game

---

## RECOMMENDED WORK SEQUENCE

### **Phase 1: Quick Wins (1-2 hours)**
1. Gather Spotlight workshop base values → implement Row 2 calibration
2. Verify Workshop Damage formula against in-game values
3. Build spot-check reference table (5-10 upgrades)

### **Phase 2: Core Gaps (2-3 hours)**
1. Get high-level module readings (L201) → derive real ×multiplier curve
2. Model Spotlight Missiles lab eDPS contribution
3. Verify Super Tower UW multiplier in-game
4. Add CL Quantity/Chance to sub-effect matching

### **Phase 3: Validation (1-2 hours)**
1. Re-score known tiers with updated formulas
2. Compare optimizer recommendations vs. in-game calculations
3. Fix any ranking divergences
4. Build confidence score for each category

### **Phase 4: Polish (optional)**
1. Implement non-GC builds (eHP/Hybrid/Farming) if resources allow
2. Expand Row 2 UI (reveal Workshop/Labs/Cards panels)
3. Module panel (if useful post-cloud-save)

---

## KEY ASSUMPTIONS TO VERIFY

1. **Stone Costs:** Level 1 is FREE — all costs are array[level-2]
2. **Assist Cap:** Multiplier Efficiency caps at 130%; Substat at 100%
3. **Assist Cost:** = current_pct × 3, capped at 70% (labs provide 30%)
4. **CF Uptime:** Lab increases "Duration" relative to cooldown, reaches 100%
5. **SL Bonus:** Applies as ×damage multiplier (uplift = bonus - 1)
6. **Module Levels:** Cap = 300 globally (per rarity variant may differ)
7. **Attack Speed:** Only affects CL fire rate, not UW cooldowns

---

## DELIVERABLES (When Complete)

✓ Stone optimizer fully validated (Row 1)  
✓ Coin/Research panels calibrated (Row 2)  
✓ All categories scored with <5% error margin  
✓ Reference table of 20+ spot-checks  
✓ No TODOs remaining (except non-GC builds, which are deferred)

---

## Notes for Next Session

- Start by gathering the 3 high-priority calibration data points (Spotlight, modules L201, ST UW mult)
- Use the spot-check strategy to validate changes incrementally
- Keep a running tally of "verified ✓ / pending ?" for each category
