// ============================================================
//  TowerForge Companion — "Get from emulator" setup
//  Shown when TowerForge Link isn't running yet or reports a problem:
//  how to get the helper, the one-time emulator setting, and a retry.
// ============================================================

import { LINK_DOWNLOAD } from '../engine/linkClient';

interface Props {
    problem: string | null;     // the helper's own message, when it answered
    busy: boolean;
    onRetry: () => void;
    onClose: () => void;
}

export default function LinkModal({ problem, busy, onRetry, onClose }: Props) {
    return (
        <div className="lnk-overlay" role="dialog" aria-modal="true" aria-labelledby="lnk-title">
            <div className="lnk-modal">
                <div className="lnk-head">
                    <h2 id="lnk-title">Get your data from an emulator</h2>
                    <button className="lnk-close" onClick={onClose} aria-label="Close">✕</button>
                </div>
                <div className="lnk-body">
                    {problem ? (
                        <p className="lnk-problem">{problem}</p>
                    ) : (
                        <p className="lnk-lead">
                            Playing on BlueStacks (or MuMu, LDPlayer, MEmu, Nox) on this PC? TowerForge Link copies the
                            game&apos;s data export straight into this page — no hunting for the file.
                        </p>
                    )}
                    <ol className="lnk-steps">
                        <li>
                            <a className="btn btn-gold" href={LINK_DOWNLOAD} download>⬇ Download TowerForge Link</a>
                            <span className="lnk-sub">
                                Windows, 11 MB. It isn&apos;t signed yet, so Windows may say it protected your PC —
                                click <em>More info → Run anyway</em>.
                            </span>
                        </li>
                        <li>Run it and leave its window open.</li>
                        <li>
                            <strong>BlueStacks:</strong> Settings → Advanced → turn on <em>Android Debug Bridge (ADB)</em>,
                            then close BlueStacks and open it again (once).
                            <span className="lnk-sub">Other emulators: turn on ADB (&quot;local connection&quot;) in their settings.</span>
                        </li>
                        <li>In The Tower, export your data.</li>
                        <li>
                            Click <em>Try again</em>. The first time, your browser asks to let towerforge.net talk to apps on
                            this device — allow it.
                        </li>
                    </ol>
                    <p className="lnk-sub">
                        Your data goes from the emulator to this page only; nothing is uploaded. The link only answers
                        towerforge.net, and only ever reads that one file.
                    </p>
                    <div className="lnk-actions">
                        <button className="btn btn-accent" onClick={onRetry} disabled={busy}>
                            {busy ? '⏳ Getting your data…' : '↻ Try again'}
                        </button>
                        <button className="btn btn-dim" onClick={onClose}>Close</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
