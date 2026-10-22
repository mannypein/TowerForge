// ============================================================
//  TowerForge — Relic catalog
//  Writes src/constants/relicCatalog.ts from TheTowerSDK's save-index
//  relic catalog (MIT, npm `thetowersdk`, `RELIC_IMPORT_CATALOG`): every
//  relic by its slot in the export's RelicsUnlocked, with its bonus in the
//  site's Relics units (% as percent points, Wall Rebuild in seconds, Bot
//  Range in metres). Checked against a real account's in-game ⓘ totals —
//  docs/game-export-format.md (Relics).
//  Get the package, then point the script at it:
//      npm pack thetowersdk@0.12.0      (in a scratch folder)
//      tar -xzf thetowersdk-0.12.0.tgz
//      npm run relic-catalog -- <scratch folder>/package
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const sdk = process.argv[2];
if (!sdk) {
    console.error('Usage: npm run relic-catalog -- <path to the unpacked thetowersdk package>');
    process.exit(1);
}
const version = JSON.parse(readFileSync(join(sdk, 'package.json'), 'utf8')).version;
const { RELIC_IMPORT_CATALOG } = createRequire(import.meta.url)(join(sdk, 'dist/save/catalogs/indexes.data.js'));

// The game's benefit types, in its order, as the site's Relics keys
// (constants/gameData.ts RELICS). Read off each type's descriptions.
const KEYS = [
    'rDmg', 'rAtkSpd', 'rCrit', 'rCritFac', 'rDmgM', 'rSCrit', 'rSCritM', 'rRend',
    'rHP', 'rRegen', 'rDefPct', 'rDefAbs', 'rThorns', 'rKB', 'rOrb', 'rWall',
    'rCash', 'rCoins', 'rFAtk', 'rFDef', 'rFUtil', 'rRecov', 'rEAtkSkip', 'rEHPSkip',
    'rUWDmg', 'rLabSpd', 'rBotRange',
];
// Wall Rebuild (seconds) and Bot Range (metres) are stored as they show.
const AS_IS = new Set(['rWall', 'rBotRange']);

const rows = RELIC_IMPORT_CATALOG
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(r => {
        const key = KEYS[r.benefitType];
        if (!key) throw new Error(`Unknown benefit type ${r.benefitType} (${r.name})`);
        const value = AS_IS.has(key) ? r.benefit : Math.round(r.benefit * 10000) / 100;
        return `    [${r.index}, ${JSON.stringify(r.label ?? r.name)}, '${key}', ${value}],`;
    });

writeFileSync(new URL('../src/constants/relicCatalog.ts', import.meta.url), `// ============================================================
//  TowerForge Companion — Relic catalog (generated — don't edit)
//  Every relic by its slot in the export's RelicsUnlocked (2 = owned),
//  with its bonus as [slot, name, Relics key, value] in the Relics tab's
//  units. From TheTowerSDK ${version} (RELIC_IMPORT_CATALOG); rewrite with
//  \`npm run relic-catalog\` (scripts/relic-catalog.mjs).
// ============================================================

export const RELIC_CATALOG: [number, string, string, number][] = [
${rows.join('\n')}
];
`);
console.log(`relicCatalog.ts: ${rows.length} relics (TheTowerSDK ${version})`);
