// ============================================================
//  TowerForge Companion — NumericInput
//  A number input with visible − / + stepper buttons.
// ============================================================

interface Props {
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
    step?: number;
    className?: string;
    style?: React.CSSProperties;
    placeholder?: string;
    disabled?: boolean;
}

export default function NumericInput({
    value, onChange, min, max, step = 1,
    className, style, placeholder = '0', disabled = false,
}: Props) {
    const clamp = (v: number) => {
        let out = v;
        if (min !== undefined) out = Math.max(min, out);
        if (max !== undefined) out = Math.min(max, out);
        return out;
    };

    const isFloat = step % 1 !== 0;

    const decrement = () => onChange(clamp(parseFloat((value - step).toFixed(10))));
    const increment = () => onChange(clamp(parseFloat((value + step).toFixed(10))));

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value);
        onChange(clamp(isNaN(raw) ? (min ?? 0) : raw));
    };

    return (
        <div className={`num-input${className ? ` ${className}` : ''}`} style={style}>
            <button
                className="num-btn"
                tabIndex={-1}
                disabled={disabled || (min !== undefined && value <= min)}
                onClick={decrement}
            >−</button>
            <input
                type="number"
                value={value || ''}
                placeholder={placeholder}
                disabled={disabled}
                min={min}
                max={max}
                step={step}
                onChange={handleChange}
            />
            <button
                className="num-btn"
                tabIndex={-1}
                disabled={disabled || (max !== undefined && value >= max)}
                onClick={increment}
            >+</button>
        </div>
    );
}
