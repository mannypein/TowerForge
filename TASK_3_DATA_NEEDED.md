# Task 3: Super Tower UW Multiplier — Exact Data Needed

## Current Implementation Issues

**Location:** `src/engine/modBonuses.ts` → `calcSuperTowerUWMult()`

**Current Formula:**
```typescript
const stCard = 0;  // ← HARDCODED PLACEHOLDER!
const stLabLv = labData['Super Tower Bonus'] ?? 0;
const stMult = stCard + stLabLv * 0.1;  // 0.1 is ESTIMATED
const stMastCDRedux = cardMastery.stMastCDRedux ?? 0;  // [3,6,9,12,15,18,21,24,27,30] per level
const effectiveCD = Math.max(0.1, 30 - stMastCDRedux);
const stUptime = Math.min(1.0, 15 / effectiveCD);
return 1 + (stMult - 1) * 0.35 * stUptime;
```

**Known Issues:**
1. `stCard = 0` is a placeholder — should read from ST card mastery
2. `ST_LAB_PER_LEVEL = 0.1` is estimated — needs verification
3. No data on how ST card mastery actually scales

---

## What I Need From You (In-Game Verification)

### Part 1: Super Tower Card Mastery Effect

**Question:** What does Super Tower card mastery actually do?

Go in-game and check the Super Tower card at different mastery levels. Look for:
- **Damage bonus** (e.g., ×1.5, ×2.0, etc.)
- **Duration boost** (extra seconds of uptime)
- **Cooldown reduction** (we already have this: 3→30 seconds)
- **Multiplier on the tower itself** (e.g., Tower damage increase)

**Data I need:**

| Mastery Level | Effect Description | Numeric Value |
|---|---|---|
| M0 (Lv1) | Example: "ST bonus ×2.5" or "Tower damage ×1.2" | 2.5 or 1.2 |
| M1 (Lv2) | ... | ? |
| M2 (Lv3) | ... | ? |
| M9 (Lv10) | ... | ? |

**Alternative:** Just tell me:
- Does ST card mastery provide a **damage multiplier** or just CD reduction?
- If damage: what are the values at M0, M5, M9?

### Part 2: Super Tower Bonus Lab

**Question:** What does the "Super Tower Bonus" lab do?

Check the lab upgrades. It should show:
- **Per-level scaling** (e.g., +5% per level, +0.2x per level, etc.)
- **Max level** and **total effect at max**

**Data I need:**

| Lab Level | Effect |
|---|---|
| Lv0 (base) | Example: "×1.0" |
| Lv1 | "×1.05" or "+5%" |
| Lv5 | ? |
| Lv30 (or max) | ? |
| **Formula** | `effect = 1 + X × level` or `effect = base × (1 + X)^level`? |

**Or just tell me:**
- Lab level → Total multiplier
- Example: "Lv0=1.0, Lv5=1.25, Lv10=1.50, Lv30=2.0"

---

## Part 3: How Super Tower Damage Works (Understanding Context)

**Background Question:** When ST fires and boosts tower damage, does that:
1. **Apply ONLY to the tower itself** (the tower damage stat increases)?
2. **Apply to ALL UWs** (all UW damage increases)?
3. **Apply as a multiplier** on top of existing damage?
4. **Something else?**

The code currently assumes: **35% of ST's total bonus applies to UWs**

If ST gives ×2.0 bonus, then UWs get ×1.35 (35% of the 2.0 = 0.7, so 1 + 0.7 = 1.7... wait that math doesn't work).

Actually, the formula is: `1 + (stMult - 1) × 0.35 × stUptime`

So if stMult = 2.0 (×2.0), then:
- UW bonus = 1 + (2.0 - 1) × 0.35 × uptime = 1 + 0.35 × uptime

At 100% uptime: UW get ×1.35 (35% of ST's boost)

**Is this correct?** Or do UWs get the full ST multiplier?

---

## Exact Data Format I Can Use

**Option A: Clearest Format**
```
Super Tower Card Mastery:
  M0: ×1.0
  M3: ×1.5
  M9: ×2.0

Super Tower Bonus Lab (per level):
  Level 0: ×1.0
  Level 5: ×1.25
  Level 30: ×2.0
  
Formula: linear (1 + 0.0333 × level) or exponential?
```

**Option B: Minimal Format**
```
ST card M0→M9: 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.0

ST lab formula: 0.05 per level (so Lv30 = 1 + 0.05×30 = 2.5x)

ST bonus applies to: UWs at 35% or 100%?
```

**Option C: Screenshots**
Just send me screenshots of:
1. Super Tower card at M0, M5, M9 (showing the card effect)
2. Super Tower Bonus lab description

---

## How This Data Will Be Used

Once I have the data, I'll:

1. **Replace the placeholder:**
   ```typescript
   const stCard = 0;  // WRONG
   ```
   with the actual ST card mastery values

2. **Update the lab scaling:**
   ```typescript
   const ST_LAB_PER_LEVEL = 0.1;  // ESTIMATED
   ```
   with verified per-level value

3. **Verify the 35% bonus share:**
   - If it's 100%, change `ST_UW_BONUS_SHARE = 0.35` to `1.0`
   - If it's different, update to correct value

4. **Test:** Verify calculations match in-game tower damage + UW damage

---

## Timeline

Once you provide the data: **< 5 minutes to implement**

Just need the three numbers/formulas above!

---

## Quick In-Game Checklist

- [ ] Open game, go to Cards
- [ ] Find Super Tower card
- [ ] Check card description at mastery level 0
- [ ] Check card description at mastery level 9
- [ ] Note: What does the card text say it does?
- [ ] Go to Labs → Research or Utility
- [ ] Find "Super Tower Bonus" lab
- [ ] Check: Lv0, Lv5, Lv10, Lv30 (if available)
- [ ] Note: Per-level scaling formula

Send me the results! 📊
