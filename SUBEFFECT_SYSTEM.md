# Module Sub-Effect System — Complete Documentation

## Overview

TowerForge's optimizer accounts for both **main module effects** and **assist module sub-effects**. Sub-effects are scaled by the user's current Assist Sub-Effect Multiplier (subEff), so higher levels = better assist bonuses.

---

## Architecture

### 1. Module Types

**Main Slot Modules**
- Equipped in: Cannon, Armor, Generator, Core (one per slot)
- Sub-effects: Applied at **100% efficiency** (full value)
- Main effect: Scaled by multEff (efficiency multiplier for level)

**Assist Slot Modules** (one per type)
- Equipped in: Cannon-Assist, Armor-Assist, Generator-Assist, Core-Assist
- Sub-effects: Applied at **subEff% efficiency** (capped at 100%)
- Main effect: Scaled by multEff (for level)

### 2. Sub-Effect Efficiency Calculation

**Code Location:** `modBonuses.ts` → `getActiveModules()`

```typescript
// Main slot (efficiency = 1.0)
results.push({ module: mod, efficiency: 1.0 });

// Assist slot (efficiency = subEff%)
const eff = ad ? Math.min(1, (ad.subEff ?? 0) / 100) : 0;
results.push({ module: mod, efficiency: eff });
```

**Example:**
- User has subEff = 75 (from upgrades)
- Main module with "+15% Damage" sub-effect → gets +15%
- Assist module with "+15% Damage" sub-effect → gets 75% × 15% = +11.25%

### 3. Sub-Effect Value Parsing

**Code Location:** `modBonuses.ts` → `readActiveModuleBonuses()`

```typescript
// Parse: "15%" → 15, "3.5s" → 3.5, "2x" → 2, "4m" → 4
const isPercent = sub.val.includes('%');
const rawVal = parseFloat(sub.val.replace('%', '').replace('s', '').replace('x', '').replace('m', '')) || 0;
const val = (isPercent ? rawVal / 100 : rawVal) * efficiency;
```

**Examples:**
- "+15%" → rawVal = 15, isPercent = true → val = 0.15 × efficiency
- "+3.5s" → rawVal = 3.5, isPercent = false → val = 3.5 × efficiency
- "+2x" → rawVal = 2, isPercent = false → val = 2 × efficiency

---

## UW Bonus Types

All UW sub-effects are mapped in `matchUWSub()` to a stat key that's used in the respective UW damage calculations.

### Chain Lightning (CL) Sub-Effects ✅ COMPLETE

**Stat Keys:** `dmg`, `qty`, `chance`

| Sub-Effect | Type | Key | Application |
|-----------|------|-----|-------------|
| CL - Damage | % multiplier | `dmg` | Multiplies base damage: `dmg × (1 + b.dmg)` |
| CL - Quantity | Flat count | `qty` | Adds to chain count: `base_qty + b.qty` |
| CL - Chance | % bonus | `chance` | Adds to proc chance: `base_chance + b.chance` |

**Code:** `uwdps.ts` lines 173-190

```typescript
const uwMult = uwStatValue('CL', 0, ud.sv[0]) * (1 + (b.dmg ?? 0));
const qty = uwStatValue('CL', 1, ud.sv[1]) + (b.qty ?? 0);
const chance = (uwStatValue('CL', 2, ud.sv[2]) + (b.chance ?? 0) * 100) / 100;
```

---

### Smart Missiles (SM) Sub-Effects ✅

**Stat Keys:** `cd`, `qty`

| Sub-Effect | Type | Key | Application |
|-----------|------|-----|-------------|
| SM - Cooldown | Reduction (s) | `cd` | Via `calcEffCD()` function |
| SM - Quantity | Flat count | `qty` | Adds missiles: `base_qty + pk.smExtraQty + b.qty` |

---

### Chrono Field (CF) Sub-Effects ✅

**Stat Keys:** `slow`, `dur`, `cd`

| Sub-Effect | Type | Key | Application |
|-----------|------|-----|-------------|
| CF - Speed Red. | % reduction | `slow` | Increases enemy slow effect |
| CF - Duration | Flat seconds | `dur` | Extends effect: `base_dur + b.dur` |
| CF - Cooldown | Reduction (s) | `cd` | Via `calcEffCD()` function |

---

### Death Wave (DW) Sub-Effects ✅

**Stat Keys:** `cd`

| Sub-Effect | Type | Key | Application |
|-----------|------|-----|-------------|
| DW - Cooldown | Reduction (s) | `cd` | Via `calcEffCD()` function |

---

### Inner Land Mines (ILM) Sub-Effects ✅

**Stat Keys:** `cd`, `qty`

| Sub-Effect | Type | Key | Application |
|-----------|------|-----|-------------|
| ILM - Cooldown | Reduction (s) | `cd` | Via `calcEffCD()` function |
| ILM - Quantity | Flat count | `qty` | Adds mines: `base_qty + b.qty` |

---

### Black Hole (BH) Sub-Effects ✅

**Stat Keys:** `dur`, `cd`

| Sub-Effect | Type | Key | Application |
|-----------|------|-----|-------------|
| BH - Duration | Flat seconds | `dur` | Extends effect: `base_dur + b.dur` |
| BH - Cooldown | Reduction (s) | `cd` | Via `calcEffCD()` function |

---

### Poison Swamp (PS) Sub-Effects ✅

**Stat Keys:** `dur`, `cd`

| Sub-Effect | Type | Key | Application |
|-----------|------|-----|-------------|
| PS - Duration | Flat seconds | `dur` | Extends effect: `base_dur + b.dur` |
| PS - Cooldown | Reduction (s) | `cd` | Via `calcEffCD()` function |

---

### Golden Tower (GT) Sub-Effects ✅

**Stat Keys:** `dur`, `cd`

| Sub-Effect | Type | Key | Application |
|-----------|------|-----|-------------|
| GT - Duration | Flat seconds | `dur` | Extends effect: `base_dur + b.dur` |
| GT - Cooldown | Reduction (s) | `cd` | Via `calcEffCD()` function |

---

### Spotlight (SL) Sub-Effects ✅

**Stat Keys:** `bonus`, `angle`

| Sub-Effect | Type | Key | Application |
|-----------|------|-----|-------------|
| SL - Bonus | % multiplier | `bonus` | Adds to SL damage mult: `bonus + b.bonus` |
| SL - Angle | Flat degrees | `angle` | Adds to coverage: `angle + b.angle` |

---

## Assist Sub-Effect Multiplier Scaling

### How It Works

1. **User upgrades "Assist Multiplier" labs**
   - Each level increases subEff percentage
   - Max: 100% (full assist effectiveness)

2. **Assist modules get subEff-scaled bonuses**
   - Example: +15% damage sub-effect at subEff=60 → gets 0.15 × 0.60 = 0.09 (+9%)

3. **Main modules get full bonuses**
   - Example: +15% damage sub-effect in main slot → gets 0.15 (+15%)

### Code Flow

```
User Data (ModuleState)
    ↓
getActiveModules()
    ├─ Main module: efficiency = 1.0
    └─ Assist module: efficiency = min(1.0, subEff / 100)
    ↓
readActiveModuleBonuses()
    ├─ Parse sub.val: "+15%" → 0.15
    ├─ Apply efficiency: 0.15 × efficiency = scaled value
    ├─ Accumulate into uwBonus[uw][statKey]
    └─ Return uwBonus to damage calculators
    ↓
uwdps.ts calcUWDPS()
    ├─ Get bonus: b = modBonuses.uwBonus[uw]
    ├─ Apply bonus: (stat + b.key) or (stat × (1 + b.key))
    └─ Calculate final eDPS
```

---

## Example: CL with Assist Damage Module

**Scenario:**
- User has subEff = 80
- Assist Cannon module with "+20% Chain Lightning Damage" sub-effect
- Base CL damage multiplier: 482x

**Calculation:**
```
Sub-effect value parsing:
  rawVal = 20, isPercent = true
  val = 20 / 100 × efficiency = 0.20 × 0.80 = 0.16

Bonus accumulation:
  uwBonus['CL']['dmg'] = 0.16 (collected from all modules)

CL damage calculation:
  uwMult = 482 × (1 + 0.16) = 482 × 1.16 = 559.12x

Result:
  User gets 482 → 559.12x = +15.9% damage boost (not the full +20%)
  Because: 20% × 80% subEff = 16% effective boost
```

---

## Example: CL with Main Cannon Module

**Scenario:**
- Equipped Main Cannon module with "+20% Chain Lightning Damage" sub-effect
- Base CL damage multiplier: 482x

**Calculation:**
```
Sub-effect value parsing:
  rawVal = 20, isPercent = true
  val = 20 / 100 × efficiency = 0.20 × 1.0 = 0.20

Bonus accumulation:
  uwBonus['CL']['dmg'] = 0.20

CL damage calculation:
  uwMult = 482 × (1 + 0.20) = 482 × 1.20 = 578.4x

Result:
  User gets full +20% damage boost (100% efficiency)
```

---

## Optimizer Integration

The optimizer automatically accounts for sub-effect bonuses when scoring upgrades:

1. **Sim mode:** Creates clone of game state with candidate upgrade applied
2. **Reads bonuses:** Calls `readActiveModuleBonuses()` to get current bonuses
3. **Calculates eDPS:** Passes bonuses to `buildDamageContext()` and UW damage functions
4. **Scores:** Compares before/after eDPS to rank upgrade

**Example: Upgrading Assist Sub-Effect Multiplier**
```
Current: subEff = 75, total eDPS = 1.5M
Upgrade: subEff = 76
After: all assist module bonuses increase by 1%
New: total eDPS = 1.5025M
Score: +0.17% eDPS for cost X stones
```

---

## Checklist: Sub-Effects Status

- ✅ CL - Damage
- ✅ CL - Quantity (NEW)
- ✅ CL - Chance (NEW)
- ✅ SM - Cooldown
- ✅ SM - Quantity
- ✅ CF - Speed Red.
- ✅ CF - Duration
- ✅ CF - Cooldown
- ✅ DW - Cooldown
- ✅ ILM - Cooldown
- ✅ ILM - Quantity
- ✅ BH - Duration
- ✅ BH - Cooldown
- ✅ PS - Duration
- ✅ PS - Cooldown
- ✅ GT - Duration
- ✅ GT - Cooldown
- ✅ SL - Bonus
- ✅ SL - Angle

**All UW sub-effects are now properly mapped and optimizer-aware.** ✅
