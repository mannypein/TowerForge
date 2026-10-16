// ============================================================
//  TowerForge — Module Definitions
//  Maps InfoIndex → module name + type
//
//  These definitions resolve module names and types from the save.
//  Without these mappings, modules show as "Module (InfoIdx: N)".
//
//  TODO: Extract from mytower.app source, game assets, or manual inspection.
//
//  How to get these:
//  1. Check mytower.app GitHub if public
//  2. Reverse-engineer from the game client
//  3. Manually match InfoIndex values to modules in your save
// ============================================================

import type { ModuleType } from '../types/gameTypes';

export interface ModuleDefinition {
    name: string;
    type: ModuleType;
}

/**
 * Maps InfoIndex (0-99+) to module definition.
 * Currently empty — add entries as you discover module mappings.
 *
 * Example:
 *   0: { name: 'Damage I', type: 'cannon' },
 *   1: { name: 'Armor I', type: 'armor' },
 *   ...
 */
export const MODULE_DEFINITIONS: Record<number, ModuleDefinition> = {
    // TODO: Fill in module definitions
    // InfoIndex → { name, type }
};

/**
 * Helper: Get module definition by InfoIndex.
 * Returns fallback name if definition not found.
 */
export function getModuleDefinition(infoIndex: number): ModuleDefinition {
    return MODULE_DEFINITIONS[infoIndex] || {
        name: `Module ${infoIndex}`,
        type: 'cannon', // default
    };
}

/**
 * Helper: Build definitions from raw mytower data.
 * If you export modules from mytower, use this to create the mapping.
 *
 * Usage:
 *   const myTowerModules = [...]; // array of mytower module objects
 *   const defs = buildDefinitionsFromMyTower(myTowerModules);
 */
export function buildDefinitionsFromMyTower(modules: any[]): Record<number, ModuleDefinition> {
    const result: Record<number, ModuleDefinition> = {};
    for (const mod of modules) {
        if (mod.infoIndex !== undefined) {
            result[mod.infoIndex] = {
                name: mod.name || `Module ${mod.infoIndex}`,
                type: normalizeModuleType(mod.type),
            };
        }
    }
    return result;
}

/** Normalize module type strings to our type system */
function normalizeModuleType(type: string): ModuleType {
    const lower = String(type).toLowerCase();
    if (lower.includes('cannon') || lower.includes('attack')) return 'cannon';
    if (lower.includes('armor') || lower.includes('defense')) return 'armor';
    if (lower.includes('generator') || lower.includes('economy')) return 'generator';
    if (lower.includes('core') || lower.includes('ult')) return 'core';
    return 'cannon';
}
