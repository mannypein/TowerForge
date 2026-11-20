// ============================================================
//  TowerForge — Export diff
//  What changed in the game's tool_export.json between two files: fields
//  gone, fields new, and lists that changed length, at every depth. Prints
//  names, types and lengths only, never a value, so the output is safe to
//  paste anywhere. Run it on the export from before and after a game update
//  (docs/game-export-format.md, "When the game updates"):
//      npm run export-diff -- <older tool_export.json> <newer tool_export.json>
//  A field that's gone with a new one beside it (ModuleCannonShards →
//  ModuleCannonShards_v2) is a rename; plain …_vN renames are read already
//  (engine/gameExport.ts currentNames), anything else needs the importer.
// ============================================================

import { readFileSync } from 'node:fs';

const [olderPath, newerPath] = process.argv.slice(2);
if (!olderPath || !newerPath) {
    console.error('Usage: npm run export-diff -- <older tool_export.json> <newer tool_export.json>');
    process.exit(1);
}

const read = p => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));
const kind = v => (v === null ? 'null' : Array.isArray(v) ? 'list' : typeof v);

// Every path in the file → its kind (and length for lists). List items share
// one path ("BattleHistory[]"); objects keyed by numbers (Vault levels) keep
// their keys, so a new vault id shows up.
function shape(v, path = '', out = new Map()) {
    const k = kind(v);
    const prev = out.get(path);
    if (k === 'list') out.set(path, { kind: k, length: Math.max(v.length, prev?.length ?? 0) });
    else if (!prev || prev.kind === 'null') out.set(path, { kind: k });
    if (k === 'list') for (const x of v) shape(x, `${path}[]`, out);
    else if (k === 'object') for (const [key, x] of Object.entries(v)) shape(x, path ? `${path}.${key}` : key, out);
    return out;
}

const [older, newer] = [read(olderPath), read(newerPath)];
const [a, b] = [shape(older), shape(newer)];
const label = s => (s.kind === 'list' ? `list of ${s.length}` : s.kind);

const version = f => `build ${f.VersionNumber ?? '?'}, DataVersion ${f.DataVersion ?? '?'}, ExportVersion ${f.ExportVersion ?? '—'}`;
console.log(`Older: ${version(older)}\nNewer: ${version(newer)}\n`);

const gone = [...a.keys()].filter(p => p && !b.has(p));
const added = [...b.keys()].filter(p => p && !a.has(p));
const changed = [...a.keys()].filter(p => {
    const [x, y] = [a.get(p), b.get(p)];
    if (!p || !y || x.kind === 'null' || y.kind === 'null') return false;
    return x.kind !== y.kind || (x.kind === 'list' && !p.includes('[]') && x.length !== y.length);
});

const section = (title, paths, line) => {
    console.log(`${title} (${paths.length})`);
    for (const p of paths.sort()) console.log(`  ${line(p)}`);
    console.log('');
};
section('Gone', gone, p => `${p}  (${label(a.get(p))})`);
section('New', added, p => `${p}  (${label(b.get(p))})`);
section('Changed type or length', changed, p => `${p}  ${label(a.get(p))} → ${label(b.get(p))}`);

// Gone fields with a versioned twin in the newer file: read already.
const plain = p => p.replace(/_v\d+(?=$|\.|\[)/g, '');
const renamed = gone.filter(p => added.some(q => plain(q) === plain(p)));
if (renamed.length) console.log(`Renamed with a version (read by their plain name already): ${renamed.length}\n  ${renamed.sort().join('\n  ')}`);
