// ============================================================
//  TowerForge Companion — Account API
//  Register / sign in / sign out, synced stats, and the
//  player's own share codes.
// ============================================================

import { ApiError, apiRequest } from './http';
import type { ShareClaim } from './shareApi';

const BASE = '/api/account';

// A full TowerForge export (same shape as exportData()).
export type AccountSave = Record<string, unknown>;

export interface AccountShare {
    code: string;
    sections: string[];
    createdAt: string;
    expiresAt: string;
}

// The signed-in account: its username and the preview parts of the site
// it can see (server's features.json).
export interface Me {
    username: string;
    features?: string[];
}

// Returns the signed-in account, or null when not signed in.
export async function getMe(): Promise<Me | null> {
    try {
        return await apiRequest<Me>(`${BASE}/me`);
    } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
    }
}

export function register(username: string, password: string, save: AccountSave, claims: ShareClaim[]) {
    return apiRequest<Me>(`${BASE}/register`, {
        method: 'POST',
        body: JSON.stringify({ username, password, save, claims }),
    }, 'Could not create the account.');
}

export function login(username: string, password: string) {
    return apiRequest<Me & { save: AccountSave | null; updatedAt: string | null }>(`${BASE}/login`, {
        method: 'POST',
        body: JSON.stringify({ username, password }),
    }, 'Could not sign in.');
}

export function logout() {
    return apiRequest<void>(`${BASE}/logout`, { method: 'POST' });
}

export function getSave() {
    return apiRequest<{ save: AccountSave | null; updatedAt: string | null }>(`${BASE}/save`);
}

// keepalive lets the final save go out while the page is closing
// (browsers cap keepalive bodies at 64 KB; larger saves retry next visit).
export function putSave(save: AccountSave, keepalive = false) {
    return apiRequest<{ updatedAt: string }>(`${BASE}/save`, {
        method: 'PUT',
        body: JSON.stringify(save),
        keepalive,
    }, 'Could not save to your account.');
}

export function listShares() {
    return apiRequest<AccountShare[]>(`${BASE}/shares`, {}, 'Could not load your share codes.');
}
