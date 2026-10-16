# Task 2: Spotlight Missiles Lab — Exact Data Needed

## What This Lab Does

**Spotlight Missiles Lab** makes Spotlight fire extra **Smart Missiles** with SM-level damage on a timer:
- Base: Fires 1 SM missile every 19 seconds
- Each level: Reduces the cooldown
- At max level: Cooldown reaches ~2 seconds (almost permanent fire)

---

## Data I Need (Three Options)

Pick whichever is easiest for you:

### Option A: Full Level Table (Most Helpful)

Go in-game to Labs → check "Spotlight Missiles" or "SL-Missiles" lab.

Give me:

| Level | Cooldown (seconds) |
|-------|-------------------|
| Lv0 (Base) | 19.0 |
| Lv1 | ? |
| Lv5 | ? |
| Lv10 | ? |
| Lv15 | ? |
| Lv18 (or max) | ? |

**Or just the range:**
- Base cooldown: 19s
- Max cooldown: ? (probably ~2s)
- Levels: ? (how many levels does this lab have?)

---

### Option B: Simple Formula

Check the lab description. It might say something like:
- **"-1 second per level"** → formula: cooldown = 19 - 1×level
- **"-0.75 seconds per level"** → formula: cooldown = 19 - 0.75×level
- **"-5% cooldown per level"** → formula: cooldown = 19 × 0.95^level

Just tell me: **"X seconds per level"** or **"X% reduction per level"**

---

### Option C: Just Two Data Points

If you can quickly check:
- **Lv0 cooldown:** (should be 19s)
- **Lv_MAX cooldown:** (approximately, e.g., "about 2 seconds at max level")
- **Max level:** (how many levels total?)

---

## What I'll Do With This Data

Once you provide the cooldown formula/values, I'll:

1. **Find the lab in gameData.ts** (locate LABS constant entry)
2. **Create a helper function** to calculate missiles fired per reference time:
   ```typescript
   function calcSpotlightMissileFire(labLevel: number): number {
       const cooldown = 19 - (0.X * labLevel);  // YOUR FORMULA HERE
       return refTTT / cooldown;  // missiles fired during fight
   }
   ```

3. **Calculate eDPS contribution:**
   ```
   SM_base_damage × missiles_fired × SL_coverage_multiplier
   ```

4. **Add to Spotlight damage calculation** so optimizer accounts for it

5. **Test:** Verify it's being scored correctly in the optimizer

---

## Quick Lab Lookup Tips

**In-game navigation:**
1. Go to Labs tab
2. Look for "Research" or "Utility" section
3. Find lab with "Spotlight" or "SL" in the name
4. Should say something about "Smart Missiles" or "fires missiles"

**What you'll see:**
```
Spotlight Missiles Lab
Level 0-18 (or however many)
Description: "Spotlight fires Smart Missiles every 19s..."
Effect per level: "-1s cooldown" (or similar)
```

---

## Format Examples I Can Use

**Example 1: Table**
```
Lv0: 19s
Lv5: 14s
Lv10: 9s
Lv18: 1s
Formula: 19 - 1×level
```

**Example 2: Description**
```
Base: 19 seconds
Max (Lv18): 2 seconds
Per level: 1 second reduction
```

**Example 3: Screenshot**
Just send a screenshot of the lab, I'll extract the numbers

---

## Why This Matters

**Current:** Spotlight Missiles lab is **not modeled** → optimizer ignores it
**After fix:** Optimizer will recommend SM lab at proper priority
**Impact:** Users won't miss an important damage source

Once you give me the data: **< 30 minutes to implement** 🚀

---

## Quick Checklist

- [ ] Found the "Spotlight Missiles" lab in-game
- [ ] Noted the base cooldown (should be 19s)
- [ ] Noted the max cooldown (at highest level)
- [ ] Found the per-level reduction amount
- [ ] OR took a screenshot of the lab description
- [ ] Ready to provide data! ✓

Let me know what you find! 📊
