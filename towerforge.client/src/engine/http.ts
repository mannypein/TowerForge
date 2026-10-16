// ============================================================
//  TowerForge Companion — HTTP helpers
//  Small fetch wrapper shared by the share and account APIs.
//  Requests are same-origin, so the session cookie rides along.
// ============================================================

export class ApiError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

async function readError(res: Response, fallback: string): Promise<string> {
    try {
        const body = await res.json();
        if (typeof body?.error === 'string') return body.error;
    } catch {
        // Non-JSON error body — fall through to the generic message.
    }
    return fallback;
}

// JSON request. Throws ApiError (with the server's message) on non-2xx.
export async function apiRequest<T>(url: string, init: RequestInit = {}, fallbackError = 'Something went wrong.'): Promise<T> {
    let res: Response;
    try {
        res = await fetch(url, {
            ...init,
            headers: { 'Content-Type': 'application/json', ...init.headers },
        });
    } catch {
        throw new ApiError('Could not reach TowerForge. Check your connection and try again.', 0);
    }

    if (!res.ok) throw new ApiError(await readError(res, fallbackError), res.status);
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
}
