// ============================================================
//  TowerForge Companion — Error Boundary
//  A page that fails to draw shows this message in its place instead
//  of taking the whole site down with it (a blank screen). Around each
//  tab (reset when the tab changes) and the shared-stats page. React
//  needs a class component for this.
// ============================================================

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface State {
    error: Error | null;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('TowerForge: a page failed to draw', error, info.componentStack);
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        return (
            <div className="empty-state">
                <div className="icon">⚠️</div>
                <h3>Something went wrong on this page</h3>
                <p>Your data is safe. Try again, or open another tab.</p>
                <p style={{ fontSize: 12, opacity: 0.7, overflowWrap: 'anywhere' }}>{error.message}</p>
                <button className="btn btn-accent" onClick={() => this.setState({ error: null })}>Try again</button>
            </div>
        );
    }
}
