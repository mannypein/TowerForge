// ============================================================
//  TowerForge Companion — Tower Cloud Save Authentication
//  Mirrors playfab_pull.py logic: Firebase → PlayFab → Firestore
//
//  Flow:
//    1. Email + password → Firebase Auth → idToken + UID
//    2. Firebase UID → PlayFab LoginWithCustomID → PlayFab ID
//    3. Firestore GET saves/<PlayFabId> → raw save document (Firestore-typed)
//    4. fs_obj() converts Firestore types to plain JSON
// ============================================================

// The game's Firebase web key, kept out of the repo: set it in
// towerforge.client/.env.local (see .env.example).
const FIREBASE_KEY: string | undefined = import.meta.env.VITE_TOWER_FIREBASE_KEY;
const FIREBASE_PROJECT = "the-tower-4f99a";
const TITLE_ID = "9C1B0";

interface AuthSession {
    idToken: string;
    uid: string;
    playfabId: string;
    email: string;
}

interface FirebaseError {
    error?: {
        code?: string;
        message?: string;
    };
}

// Convert Firestore typed values to plain JSON
function fsVal(v: unknown): unknown {
    if (!v || typeof v !== 'object') {
        return v;
    }
    const obj = v as Record<string, unknown>;
    if ('stringValue' in obj) return obj.stringValue;
    if ('integerValue' in obj) return parseInt(String(obj.integerValue), 10);
    if ('doubleValue' in obj) return obj.doubleValue;
    if ('booleanValue' in obj) return obj.booleanValue;
    if ('nullValue' in obj) return null;
    if ('timestampValue' in obj) return obj.timestampValue;
    if ('bytesValue' in obj) return obj.bytesValue;
    if ('arrayValue' in obj) {
        const arr = obj.arrayValue as Record<string, unknown>;
        return ((arr.values as unknown[]) || []).map((x: unknown) => fsVal(x));
    }
    if ('mapValue' in obj) {
        const map = obj.mapValue as Record<string, unknown>;
        return fsObj((map.fields as Record<string, unknown>) || {});
    }
    return v;
}

function fsObj(fields: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [k, val] of Object.entries(fields || {})) {
        result[k] = fsVal(val);
    }
    return result;
}

async function firebaseSignIn(email: string, password: string): Promise<{ idToken: string; uid: string }> {
    if (!FIREBASE_KEY) throw new Error('Cloud login is not set up on this build (missing VITE_TOWER_FIREBASE_KEY).');
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_KEY}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email,
            password,
            returnSecureToken: true,
        }),
    });

    if (!res.ok) {
        const err = (await res.json()) as FirebaseError;
        throw new Error(`Firebase login failed: ${err.error?.message || 'Unknown error'}`);
    }

    const data = await res.json();
    return {
        idToken: data.idToken,
        uid: data.localId,
    };
}

async function playfabLogin(uid: string): Promise<string> {
    const url = `https://${TITLE_ID}.playfabapi.com/Client/LoginWithCustomID`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            TitleId: TITLE_ID,
            CustomId: uid,
            CreateAccount: false,
        }),
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(`PlayFab login failed: ${err.error || 'Unknown error'}`);
    }

    const data = await res.json();
    return data.data.PlayFabId;
}

async function firestoreSaveGet(playfabId: string, idToken: string): Promise<Record<string, any>> {
    const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/saves/${playfabId}`;
    const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${idToken}` },
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(`Firestore fetch failed (HTTP ${res.status}): ${err.error || 'Unknown error'}`);
    }

    const doc = await res.json();
    if (!doc.fields) {
        throw new Error('Firestore document missing fields');
    }

    return fsObj(doc.fields);
}

export async function authenticateAndPullSave(email: string, password: string): Promise<Record<string, any>> {
    // 1. Firebase sign-in
    console.log('1/3 Firebase sign-in...');
    const { idToken, uid } = await firebaseSignIn(email, password);
    console.log(`    Firebase OK, uid=${uid}`);

    // 2. PlayFab session
    console.log('2/3 PlayFab session...');
    const playfabId = await playfabLogin(uid);
    console.log(`    PlayFabId=${playfabId}`);

    // 3. Firestore save document
    console.log(`3/3 Reading Firestore saves/${playfabId} ...`);
    const save = await firestoreSaveGet(playfabId, idToken);
    console.log(`Fetched ${Object.keys(save).length} fields from save`);

    return save;
}

export function storeAuthSession(session: AuthSession): void {
    localStorage.setItem('tc_auth_session', JSON.stringify(session));
}

export function loadAuthSession(): AuthSession | null {
    const stored = localStorage.getItem('tc_auth_session');
    if (!stored) return null;
    try {
        return JSON.parse(stored);
    } catch {
        return null;
    }
}

export function clearAuthSession(): void {
    localStorage.removeItem('tc_auth_session');
}
