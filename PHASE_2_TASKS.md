# Phase 2: Core Gaps — Task Breakdown

**Goal:** Fill high-priority missing optimizer mechanics (2-3 hours)

---

## Task 1: High-Level Module Damage Calibration
**Priority:** HIGH | **Effort:** 1 hour | **Blocker:** Needs in-game data

**What's Missing:**
- Current: ×1.17 fudge factor for L160+ modules (temporary stopgap)
- Need: Real L160/L180/L201 module card readings
- Why: Derive actual high-level increment curve, remove approximation

**Current Formula:**
```typescript
calcModuleMainMult(rarity, type, level) = (BASE + Σ increments) × 1.17  // ← TEMP
```

**How to Fix:**
1. Go in-game with a high-level module (e.g., A5 rarity)
2. Screenshot the module card at levels:
   - L160 (see the ×multiplier value)
   - L180 (see the ×multiplier value)
   - L201 (see the ×multiplier value, if maxLv)
3. Record: `{ level, rarity, type, mainMult }`
4. Run linear regression to find real per-level increment past L160
5. Update MODULE_INCREMENT_BRACKETS or derive new curve

**Data Needed From You:**
```
Module (Rarity, Type, Level) → Main Effect ×Multiplier
Example: (A5, cannon, 201) → ×19.53
Example: (A5, cannon, 180) → ×17.8
Example: (A5, cannon, 160) → ×15.2
```

---

## Task 2: Spotlight Missiles Lab Modeling
**Priority:** HIGH | **Effort:** 1.5 hours | **Blocker:** Needs formula

**What's Missing:**
- Lab name: "SL-Missiles" (index in LABS constant)
- Effect: Spotlight fires SM-damage missiles every 19s → 2s (level dependent)
- Current: Not modeled at all

**How It Works:**
- Base: Fires 1 SM missile every 19 seconds
- Each lab level: Reduces cooldown
- Formula: cooldown(lv) = 19 - 0.X × lv (need to verify X)
- Missile damage: Same as current SM damage output
- eDPS contribution: (SM_damage × fire_rate × SL_coverage) × (1 + multipliers)

**Current Code Location:**
- `src/engine/uwdps.ts` → `calcUWDPS('SM', ...)` has SM damage logic
- Add new lab into the calcSmartMissilesDPS calculation
- Or add a new `calcSpotlightMissilesDPS()` function

**Data Needed From You:**
```
Spotlight Missiles Lab Level → Cooldown (seconds)
Example: Lv0 → 19s
Example: Lv5 → 15s
Example: Lv18 → 2s (or whatever maxLv is)
```

Or just the formula: `cooldown(lv) = 19 - X × lv` where X = ?

---

## Task 3: Super Tower UW Multiplier Verification
**Priority:** MEDIUM | **Effort:** 30 min | **Blocker:** Needs in-game check

**What's Uncertain:**
- Current: `calcSuperTowerUWMult()` uses ESTIMATED per-level constant
- Issue: ST card mastery scaling may be inaccurate

**Current Code:**
```typescript
function calcSuperTowerUWMult(cardData: CardData): number {
    const stCard = cardData.data['Super Tower']?.m ?? 0;
    return 1 + (stCard * 0.05);  // ← ESTIMATED 5% per mastery level
}
```

**How to Verify:**
1. Check in-game: Super Tower card at mastery level 0, 5, 10, 15, 20, etc.
2. Compare: Base UW damage vs. with ST at that mastery
3. Note: Effect is multiplicative, not additive
4. Derive: Real formula per mastery level

**Data Needed From You:**
```
Super Tower Card Mastery → UW Damage Multiplier
Example: M0 → ×1.0 (baseline)
Example: M5 → ×1.25
Example: M10 → ×1.50
Example: M20 → ×2.0 (?)
```

---

## Task 4: CL Sub-Effect Matching
**Priority:** LOW | **Effort:** 15 min | **Blocker:** None (code-only)

**What's Missing:**
- Current: `matchUWSub()` handles most UW subs
- Gap: CL "Quantity" and CL "Chance" not in the lookup

**Why It Matters:**
- When placing CL as an Assist module, sub-effects boost specific stats
- CL Chance (for chain lightning triggers) should be recognized

**Code Location:**
```typescript
// src/engine/modBonuses.ts → matchUWSub()
// Add these entries:
if (subName.includes('CL') && subName.includes('Quantity')) {
    return { uw: 'CL', type: 'qty', idx: ... };
}
if (subName.includes('CL') && subName.includes('Chance')) {
    return { uw: 'CL', type: 'chance', idx: ... };
}
```

**No Data Needed** — Just code update

---

## Recommended Approach

### Option A: Parallel (Recommended)
- You gather module L201 + SL-Missiles data in-game
- I implement Task 4 (CL subs) immediately  
- Once you return with data → I implement Tasks 1-3

### Option B: Sequential
- Complete Task 4 now (15 min)
- Then you gather data for Tasks 1-3 while I wait

### Option C: Pick Priority
- Which task do you want to fix first?
- Start with whichever has the biggest eDPS impact

---

## What Happens If You Don't Have Data?

**For Module Calibration:**
- ×1.17 fudge factor stays in place (works, but not perfect)
- High-level recommendations still accurate (just not precise)
- Can revisit once you get module cards

**For SL Missiles:**
- Lab doesn't contribute to eDPS scoring (conservative)
- SL build recommendations still valid, just might undervalue the lab
- Can add once you confirm cooldown formula

**For ST Multiplier:**
- 5% per mastery is reasonable estimate
- Recommendations work; may not be optimal
- Can fix once verified in-game

**For CL Subs:**
- Assist modules with CL subs work, just not recognized by name
- Low impact (most people use different subs anyway)

---

## Next Steps

**What would you like to do?**

1. **Gather data now** — Go in-game, screenshot modules/labs, come back with numbers
2. **I'll code Task 4** — CL sub-effects take 15 min, ready when you return
3. **Pick a focus** — Which of Tasks 1-3 is most important?

Your call! 🎯
