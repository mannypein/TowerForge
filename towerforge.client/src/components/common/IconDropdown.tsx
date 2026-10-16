// ============================================================
//  TowerForge Companion — Icon Dropdown
//  Custom dropdown that renders an icon (e.g. stone/medal cost)
//  inline next to each option — something a native <select>
//  cannot do. Styled to match the app's native select inputs.
//
//  The open menu is rendered through a portal with fixed
//  positioning so it can never be clipped by an ancestor's
//  `overflow: hidden` (e.g. .uw-section) or the scrollable tab
//  container — it always floats above the page and can open
//  upward when there isn't room below.
// ============================================================

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface IconDropdownOption {
    value: number;
    label: string;
    cost?: number | null;
}

interface IconDropdownProps {
    value: number;
    options: IconDropdownOption[];
    onChange: (value: number) => void;
    icon: string;
    iconAlt?: string;
    style?: React.CSSProperties;
}

interface MenuPos {
    left: number;
    width: number;
    top?: number;     // anchored below the trigger
    bottom?: number;  // anchored above the trigger (opens upward)
    maxHeight: number;
}

const GAP = 4;            // px gap between trigger and menu
const VIEWPORT_PAD = 8;   // keep the menu this far from the viewport edge
const DESIRED_MAX = 260;  // preferred menu height before scrolling

export default function IconDropdown({
    value, options, onChange, icon, iconAlt = 'cost', style,
}: IconDropdownProps) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<MenuPos | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Measure the trigger and decide whether the menu opens down or up,
    // and how tall it can be before it needs to scroll internally.
    const updatePosition = useCallback(() => {
        const el = triggerRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const spaceBelow = window.innerHeight - r.bottom - VIEWPORT_PAD;
        const spaceAbove = r.top - VIEWPORT_PAD;
        const openUp = spaceBelow < Math.min(DESIRED_MAX, spaceAbove) && spaceAbove > spaceBelow;
        const avail = openUp ? spaceAbove : spaceBelow;
        const maxHeight = Math.max(120, Math.min(DESIRED_MAX, avail - GAP));

        setPos(openUp
            ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + GAP, maxHeight }
            : { left: r.left, width: r.width, top: r.bottom + GAP, maxHeight });
    }, []);

    useLayoutEffect(() => {
        if (open) updatePosition();
    }, [open, updatePosition]);

    useEffect(() => {
        if (!open) return;

        function onOutsideClick(e: MouseEvent) {
            const t = e.target as Node;
            if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
            setOpen(false);
        }
        // Reposition while open if the page scrolls or resizes. Capture phase
        // so we also catch scrolling inside ancestor containers (the tab body).
        function onReflow() { updatePosition(); }

        document.addEventListener('mousedown', onOutsideClick);
        window.addEventListener('scroll', onReflow, true);
        window.addEventListener('resize', onReflow);
        return () => {
            document.removeEventListener('mousedown', onOutsideClick);
            window.removeEventListener('scroll', onReflow, true);
            window.removeEventListener('resize', onReflow);
        };
    }, [open, updatePosition]);

    const current = options.find(o => o.value === value);

    return (
        <div className="icon-dropdown" style={style}>
            <button
                type="button"
                ref={triggerRef}
                className="icon-dropdown-trigger"
                onClick={() => setOpen(o => !o)}
            >
                <span className="icon-dropdown-label">{current?.label ?? '—'}</span>
                {current?.cost != null && (
                    <span className="icon-dropdown-cost">
                        {current.cost.toLocaleString()}
                        <img src={icon} alt={iconAlt} className="cost-icon" />
                    </span>
                )}
                <span className="icon-dropdown-caret">▾</span>
            </button>

            {open && pos && createPortal(
                <div
                    ref={menuRef}
                    className="icon-dropdown-menu"
                    style={{
                        left: pos.left,
                        width: pos.width,
                        top: pos.top,
                        bottom: pos.bottom,
                        maxHeight: pos.maxHeight,
                    }}
                >
                    {options.map(o => (
                        <div
                            key={o.value}
                            className={`icon-dropdown-option ${o.value === value ? 'active' : ''}`}
                            onClick={() => { onChange(o.value); setOpen(false); }}
                        >
                            <span className="icon-dropdown-label">{o.label}</span>
                            {o.cost != null && (
                                <span className="icon-dropdown-cost">
                                    {o.cost.toLocaleString()}
                                    <img src={icon} alt={iconAlt} className="cost-icon" />
                                </span>
                            )}
                        </div>
                    ))}
                </div>,
                document.body,
            )}
        </div>
    );
}
