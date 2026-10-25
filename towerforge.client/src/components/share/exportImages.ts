// ============================================================
//  TowerForge Companion — Export Image
//  What every Export Image button calls: opens the Export Images
//  window (ExportDialog) over the page for a poster — its own small
//  React root, so the share page and the tabs open it the same way.
// ============================================================

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import ExportDialog from './ExportDialog';

// `node`: the poster (its pages, or one card); `name`: file name without
// .png; `label`: the section ("Labs").
export function openExportDialog(node: HTMLElement | null, name: string, label: string): void {
    if (!node) return;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const close = () => {
        root.unmount();
        host.remove();
    };
    root.render(createElement(ExportDialog, { node, name, label, onClose: close }));
}
