// ============================================================
//  TowerForge Companion — Guardian board and chips
//  Drawn like the game's Guardian screen: the Guardian in the middle
//  with its chip slots around it — slot 1 top left, 2 top right, 3
//  bottom left (a "New Slot" with its Bits price until bought), the
//  fourth spot locked as in the game — and chips as the game's rounded
//  tiles, the name in light blue over the chip's picture, a green check
//  when equipped. Game colors, so share images match every theme.
//  Styles: .grdg in tabs.css.
// ============================================================

import { CHIPS, GUARDIAN_MAX_SLOTS, GUARDIAN_SLOT_BITS } from '../../constants/guardianData';
import type { ChipDef } from '../../constants/guardianData';
import { chipIcon } from '../../constants/gameIcons';

export function ChipTile({ chip, owned = true, equipped, onClick, note }: {
    chip: ChipDef;
    owned?: boolean;
    equipped?: boolean;
    onClick?: () => void;
    note?: string;                 // under the picture (e.g. "Not owned")
}) {
    const icon = chipIcon(chip.id);
    const body = (
        <>
            <span className="grdg-chip-name">{chip.name}</span>
            <span className="grdg-chip-art">{icon ? <img src={icon} alt="" draggable={false} /> : chip.name[0]}</span>
            {note && <span className="grdg-chip-note">{note}</span>}
            {equipped && <span className="grdg-check" aria-label="Equipped">✓</span>}
        </>
    );
    const cls = `grdg-chip ${owned ? '' : 'unowned'}`;
    return onClick
        ? <button type="button" className={cls} onClick={onClick} title={chip.text}>{body}</button>
        : <div className={cls} title={chip.text}>{body}</div>;
}

// The Guardian and its slots: `chips` by slot (game chip index, -1 empty),
// `open` slots bought (1–3).
export default function GuardianBoard({ chips, open, title, sub, onSlot, onNewSlot }: {
    chips: number[];
    open: number;
    title: string;
    sub?: string;
    onSlot?: (slot: number) => void;
    onNewSlot?: () => void;
}) {
    const spot = (slot: number) => {
        if (slot >= GUARDIAN_MAX_SLOTS) {
            return <div key={slot} className="grdg-slot locked" aria-label="Locked"><span className="grdg-lock">🔒</span></div>;
        }
        if (slot >= open) {
            const price = GUARDIAN_SLOT_BITS[slot - 1];
            const label = <><span className="grdg-chip-name">New Slot</span><span className="grdg-price">{price ?? '—'} bits</span></>;
            return onNewSlot && slot === open
                ? <button key={slot} type="button" className="grdg-slot new" onClick={onNewSlot}>{label}</button>
                : <div key={slot} className="grdg-slot new">{label}</div>;
        }
        const chip = CHIPS.find(c => c.index === chips[slot]);
        const inner = chip ? <ChipTile chip={chip} /> : <span className="grdg-empty">Empty</span>;
        return onSlot
            ? <button key={slot} type="button" className="grdg-slot" onClick={() => onSlot(slot)} title="Change this slot's chip">{inner}</button>
            : <div key={slot} className="grdg-slot">{inner}</div>;
    };
    return (
        <div className="grdg-board">
            {spot(0)}
            <div className="grdg-center">
                <span className="grdg-title">{title}</span>
                {sub && <span className="grdg-sub">{sub}</span>}
            </div>
            {spot(1)}
            {spot(2)}
            {spot(3)}
        </div>
    );
}
