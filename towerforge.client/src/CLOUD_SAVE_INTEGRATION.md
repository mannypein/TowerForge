# Cloud Save Integration — Complete Flow

## What Happens When User Signs In

### 1. **Authentication (towerAuth.ts)**
```
User enters email + password
    ↓
Firebase email/password auth → idToken + UID
    ↓
PlayFab CustomID login (UID) → PlayFab ID
    ↓
Firestore GET saves/<PlayFabID> (Bearer idToken) → raw JSON (732 fields)
```

**Raw JSON structure:** Flat Firestore document with array fields like:
- `CardLevel: [0, 5, 3, ...]` (array[40])
- `BotsUnlocked: [true, false, ...]` (array[4])
- `UltimateWeaponLevel: [5, 0, ...]` (array[9])
- `LabLevel: [10, 20, ...]` (array[100+])
- etc.

### 2. **Parsing (saveParser.ts)**
Raw Firestore JSON is converted to TowerForge's typed structure:

**Card Example:**
```javascript
// Raw: CardLevel[0] = 5, CardUnlocked[0] = true
// After: cardData.data['Damage'] = { s: 1, m: 0, mu: false }
```

**Bot Example:**
```javascript
// Raw: BotsUnlocked[0] = true, BotsLevel[0] = 10
// After: botData['Flame Bot'] = { owned: true, medals: [...], plusLv: 0 }
```

**UW Example:**
```javascript
// Raw: UltimateWeaponUnlocked[0] = true, UltimateWeaponLevel[0] = 15
// After: uwData.data['CL'] = { own: true, sv: [15, 0, 0], upOwn: false, upLvl: 0 }
```

**Lab Example:**
```javascript
// Raw: LabLevel[0] = 10
// After: labData['Damage'] = 10  (using LAB_NAMES map)
```

### 3. **Store Update & Persistence (App.tsx)**
Parsed data is:
1. Formatted as exportData() JSON shape
2. Passed to `importData()` which updates store + localStorage
3. All 11 tabs automatically render with live data

### 4. **Tab Population (Automatic)**
```
Profile Tab     ← profile.name, profile.highestTier, profile.league, etc.
Perks Tab       ← perkData.banned (perk IDs)
Tiers Tab       ← tierWaves (tier → highest wave reached)
Workshop Tab    ← wsData (preset stat levels)
Labs Tab        ← labData (lab name → current level)
Cards Tab       ← cardData (card name → {s, m, mu})
UW Tab          ← uwData (UW abbr → {own, sv, upOwn, upLvl})
pUWs Tab        ← (leave alone, calculated from UW data)
Relics Tab      ← relicData (relic key → level)
Bots Tab        ← botData (bot name → {owned, medals, plusLv})
Modules Tab     ← moduleState (minimal for now)
Optimizer Tab   ← (skip, as requested)
```

## Workshop Stats Parsing

**Structure:**
- Firestore stores 3 arrays, each with 100 values (5 presets × 20 stats each)
- `PresetUpgradeWorkshopLevel[100]` → attack levels
- `PresetUpgradeWorkshopDefenseLevel[100]` → defense levels
- `PresetUpgradeWorkshopUtilityLevel[100]` → utility levels

**Example:**
```javascript
// Raw indices 0-19 = Preset 0 stats, 20-39 = Preset 1, etc.
PresetUpgradeWorkshopLevel[0] = 6000   // Preset 0, Damage level
PresetUpgradeWorkshopLevel[1] = 99     // Preset 0, Attack Speed level
PresetUpgradeWorkshopLevel[20] = 6000  // Preset 1, Damage level

// After parsing:
wsData[0].attack = [6000, 99, 79, ...]  // Preset 0 attack levels
wsData[1].attack = [6000, 99, 79, ...]  // Preset 1 attack levels
```

## Module Inventory Parsing

**Structure:**
- `ModuleInventory` array contains all owned modules (up to 156+ in the save)
- Each module: `{ Guid, InfoIndex, Level, CurrentRarity, Effects[], CoinsSpent, ShardsSpent, EffectLocked[], ... }`
- `ModuleEquipped` array contains the 4 currently equipped modules (cannon, armor, generator, core)

**Current Limitation:**
- `InfoIndex` is a reference to the game's internal module definition table
- Without this mapping table, we can't resolve module names or types
- **Workaround:** Uses `Guid` as module ID and placeholder names like "Module (InfoIdx: 45)"

**What Works:**
- ✓ Module inventory parsing (all modules stored in library)
- ✓ Equipped modules mapping to slots (cannon/armor/generator/core)
- ✓ Module levels and rarity parsing
- ✓ Storing effect data and lock states

**What Needs Module Definitions:**
- ⊘ Module display names (currently "Module (InfoIdx: N)")
- ⊘ Module type inference (currently defaults to 'cannon')
- ⊘ Module effect name resolution

**To Fix This:**
You need a mapping like:
```typescript
const MODULE_DEFINITIONS: Record<number, {name: string; type: ModuleType}> = {
    29: { name: 'Damage Boost', type: 'cannon' },
    30: { name: 'Shield Plus', type: 'armor' },
    37: { name: 'Coin Multiplier', type: 'generator' },
    45: { name: 'UW Power', type: 'core' },
    // ... all ~100 module indices
};
```

This can be extracted from:
1. mytower.app's source code (if open source)
2. The game client's assets
3. Manual inspection of your save (match InfoIndex to modules you recognize)

## Mapping Tables Used

### Cards (31 total, indices 0–30)
Extracted from `CARDS` constant in gameData.ts:
- 0: Damage
- 1: Attack Speed
- 2: Health
- ... (31 total)
- 30: Area of Effect

### Bots (5 total, indices 0–4)
Hard-coded from game knowledge:
- 0: Flame Bot
- 1: Thunder Bot
- 2: Golden Bot
- 3: Amplify Bot
- 4: Bot Bot

### UWs (9 total, indices 0–8)
From `UWS` constant in gameData.ts:
- 0: CL (Chain Lightning)
- 1: SM (Smart Missiles)
- 2: DW (Death Wave)
- 3: CF (Chrono Field)
- 4: ILM (Inner Land Mines)
- 5: GT (Golden Tower)
- 6: PS (Poison Swamp)
- 7: BH (Black Hole)
- 8: SL (Spotlight)

### Labs (100+, indexed 0–99+)
Built dynamically from `LABS` constant in gameData.ts (all categories combined in order).

### Perks (26+ total, indexed by PERKS array)
From `PERKS` constant in gameData.ts (IDs like 'dmg', 'atkspd', etc.).

### Relics (27 total, by category)
From `RELICS` constant in gameData.ts (keyed by Attack/Defense/Utility/Other).

## What Gets Auto-Filled vs. What's Skipped

### ✓ Auto-Filled
- Profile: name, league, build, tier, wave
- Perks: banned perk IDs
- Tiers/Waves: tier progression
- Labs: all lab levels
- Cards: unlocked, level, mastery
- UWs: owned, levels, Plus data
- Relics: equipped relic levels
- Bots: owned, medal levels, Plus levels
- Enhancements: level, tier unlock

### ✓ Now Auto-Filled (Updated)
- Workshop: attack/defense/utility levels per preset ✓
- Modules: inventory + equipped modules (with limitation) ✓

### ⊘ Minimal/Skipped
- pUWs: (left to app calculation)
- Optimizer: (skip entirely)

## Files Modified/Created

1. **towerAuth.ts** — Firebase → PlayFab → Firestore auth flow
2. **saveParser.ts** — Flat JSON → TowerForge types (NEW)
3. **LoginModal.tsx/css** — Sign-in UI (NEW)
4. **useGameStore.ts** — Added cloudSaveData state, storeCloudSave/getCloudSaveData/clearCloudSave methods
5. **gameTypes.ts** — Added CloudSaveData type
6. **App.tsx** — Added login button, modal, parser integration
7. **app.css** — Added .btn-cloud and .btn-primary styles

## Testing Checklist

- [ ] Build compiles (no TypeScript errors)
- [ ] Click "☁ Cloud Pull" button
- [ ] Modal appears
- [ ] Enter real Tower credentials
- [ ] "Signing in..." shows
- [ ] Save data pulls successfully
- [ ] Alert shows "✓ Cloud save loaded!"

### Profile & Progress
- [ ] Profile tab shows name, tier, wave from save
- [ ] Tiers tab shows highest wave per tier

### Cards & UWs
- [ ] Cards tab shows card levels and unlocked status
- [ ] UW tab shows owned UWs and levels

### Labs & Perks
- [ ] Labs tab shows all lab levels from save
- [ ] Perks tab shows banned perks

### Workshop & Bots
- [ ] Workshop tab shows attack/defense/utility levels across 5 presets
- [ ] Bots tab shows owned bots and medal levels

### Modules (Partial)
- [ ] Modules tab shows library with entries
- [ ] Equipped modules display in slots (with placeholder names until definitions added)
- [ ] ⚠ Module names show as "Module (InfoIdx: N)" until definitions are resolved

### Persistence
- [ ] All data persists in localStorage
- [ ] Closing and reopening app restores all data
- [ ] Cloud save raw JSON stored in `tc_cloud_save` key
