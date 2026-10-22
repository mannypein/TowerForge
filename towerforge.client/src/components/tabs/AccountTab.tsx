// ============================================================
//  TowerForge Companion — Account Tab
//  Create an account / sign in, sync status, and the player's
//  share codes.
// ============================================================

import { useState } from 'react';
import { useAccountStore } from '../../store/useAccountStore';
import MySharesList from '../share/MySharesList';

type Mode = 'register' | 'signin';

function formatSyncTime(ts: number | null): string {
    if (!ts) return '';
    const secs = Math.round((Date.now() - ts) / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.round(secs / 60);
    return mins < 60 ? `${mins} min ago` : new Date(ts).toLocaleTimeString();
}

export default function AccountTab() {
    const status = useAccountStore(s => s.status);
    const username = useAccountStore(s => s.username);
    const syncState = useAccountStore(s => s.syncState);
    const lastSyncedAt = useAccountStore(s => s.lastSyncedAt);
    const notice = useAccountStore(s => s.notice);
    const register = useAccountStore(s => s.register);
    const login = useAccountStore(s => s.login);
    const logout = useAccountStore(s => s.logout);

    const [mode, setMode] = useState<Mode>('register');
    const [user, setUser] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (mode === 'register' && password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        setBusy(true);
        try {
            if (mode === 'register') await register(user.trim(), password);
            else await login(user.trim(), password);
            setPassword('');
            setConfirmPassword('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong.');
        } finally {
            setBusy(false);
        }
    }

    async function handleLogout() {
        if (!confirm('Sign out? Your stats stay saved in your account and will be removed from this device.')) return;
        setBusy(true);
        setError(null);
        try {
            await logout();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not sign out.');
        } finally {
            setBusy(false);
        }
    }

    if (status === 'loading') {
        return <p style={{ padding: '14px', color: 'var(--text-dim)' }}>Checking your account…</p>;
    }

    // ── Signed in ──
    if (status === 'signedIn') {
        const syncText =
            syncState === 'saving' ? 'Saving…'
                : syncState === 'error' ? 'Couldn’t save the latest changes — will retry on your next edit.'
                    : lastSyncedAt ? `All changes saved to your account · ${formatSyncTime(lastSyncedAt)}`
                        : 'Your stats are saved to your account.';

        return (
            <div>
                <div className="section" style={{ marginBottom: '10px' }}>
                    <div className="section-head"><h3>Account</h3></div>
                    <div className="section-body" style={{ padding: '10px 14px' }}>
                        <div className="flex-row">
                            <span style={{ fontSize: '14px' }}>
                                Signed in as <strong>{username}</strong>
                            </span>
                            <span style={{ flex: 1 }} />
                            <button className="btn btn-dim" onClick={handleLogout} disabled={busy}>
                                {busy ? 'Signing out…' : 'Sign Out'}
                            </button>
                        </div>
                        <p style={{
                            fontSize: '12px', marginTop: '8px',
                            color: syncState === 'error' ? 'var(--red, #e74c3c)' : 'var(--text-dim)',
                        }}>
                            {syncText}
                        </p>
                        {error && (
                            <p style={{ fontSize: '12px', color: 'var(--red, #e74c3c)', marginTop: '6px' }}>{error}</p>
                        )}
                    </div>
                </div>

                <div className="section">
                    <div className="section-head"><h3>My Share Codes</h3></div>
                    <div className="section-body" style={{ padding: '10px 14px' }}>
                        <MySharesList />
                    </div>
                </div>
            </div>
        );
    }

    // ── Signed out ──
    return (
        <div>
            <div className="sub-tab-bar">
                <button
                    className={`sub-tab-btn ${mode === 'register' ? 'active' : ''}`}
                    onClick={() => { setMode('register'); setError(null); }}
                >
                    ✨ Create Account
                </button>
                <button
                    className={`sub-tab-btn ${mode === 'signin' ? 'active' : ''}`}
                    onClick={() => { setMode('signin'); setError(null); }}
                >
                    🔑 Sign In
                </button>
            </div>

            <div className="section">
                <div className="section-body" style={{ padding: '14px' }}>
                    {notice && (
                        <p style={{ fontSize: '12px', color: 'var(--gold)', marginBottom: '10px' }}>{notice}</p>
                    )}

                    <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '12px', lineHeight: 1.6 }}>
                        {mode === 'register'
                            ? 'An account saves your stats and keeps track of your share codes, so you can delete them early. Everything you’ve already entered on this device moves into your new account.'
                            : 'Signing in loads the stats saved in your account onto this device, replacing what’s here now.'}
                    </p>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '360px' }}>
                        <label className="field-label">
                            Username
                            <input
                                value={user}
                                onChange={e => setUser(e.target.value)}
                                autoComplete="username"
                                required
                                minLength={3}
                                maxLength={24}
                                style={{ display: 'block', width: '100%', marginTop: '4px' }}
                            />
                        </label>
                        <label className="field-label">
                            Password
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                                required
                                minLength={mode === 'register' ? 8 : undefined}
                                style={{ display: 'block', width: '100%', marginTop: '4px' }}
                            />
                        </label>
                        {mode === 'register' && (
                            <label className="field-label">
                                Confirm Password
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    autoComplete="new-password"
                                    required
                                    style={{ display: 'block', width: '100%', marginTop: '4px' }}
                                />
                            </label>
                        )}

                        {mode === 'register' && (
                            <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                                Usernames are 3–24 letters, numbers, _ or -. Passwords need 8+ characters.
                                There&apos;s no password reset yet, so keep it somewhere safe.
                            </p>
                        )}

                        {error && (
                            <p style={{ fontSize: '12px', color: 'var(--red, #e74c3c)' }}>{error}</p>
                        )}

                        <div>
                            <button type="submit" className="btn btn-accent" disabled={busy}>
                                {busy ? 'Please wait…' : mode === 'register' ? 'Create Account' : 'Sign In'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
