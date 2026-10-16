// ============================================================
//  TowerForge Companion — Cloud Save Login Modal
//  Email/password form to authenticate with Tower cloud saves.
// ============================================================

import { useState } from 'react';
import { authenticateAndPullSave } from '../engine/towerAuth';
import './LoginModal.css';

interface LoginModalProps {
    onClose: () => void;
    onSuccess: (save: Record<string, any>) => void;
}

export default function LoginModal({ onClose, onSuccess }: LoginModalProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const save = await authenticateAndPullSave(email, password);
            onSuccess(save);
            onClose();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError(msg);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="login-modal-overlay">
            <div className="login-modal">
                <div className="login-modal-head">
                    <h2>Tower Cloud Save</h2>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>

                <form onSubmit={handleLogin} className="login-form">
                    <div className="form-group">
                        <label htmlFor="email">Tower Email</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="your@email.com"
                            disabled={loading}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            disabled={loading}
                            required
                        />
                    </div>

                    {error && (
                        <div className="error-message">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary login-submit"
                        disabled={loading || !email || !password}
                    >
                        {loading ? '🔄 Signing in...' : '🔑 Sign In & Pull Save'}
                    </button>
                </form>

                <div className="login-info">
                    <p>
                        Uses your Tower game credentials to authenticate with Firebase and PlayFab,
                        then pulls your latest save from Firestore. No password is stored.
                    </p>
                </div>
            </div>
        </div>
    );
}
