import type { CSSProperties } from "react";

interface Props {
  label: string; // read out by screen readers and shown on hover
  checked: boolean;
  color?: string; // track color when on; light gray if not given
  onChange: (on: boolean) => void;
}

// A small on/off switch. A mouse click doesn't move keyboard focus onto it (Tab still does),
// so Space keeps meaning play/pause after a switch is clicked.
export default function Switch({ label, checked, color, onChange }: Props) {
  return (
    <span className="switch" style={color ? ({ "--on": color } as CSSProperties) : undefined}>
      <input
        type="checkbox"
        aria-label={label}
        title={label}
        checked={checked}
        onMouseDown={(e) => e.preventDefault()}
        onChange={(e) => onChange(e.target.checked)}
      />
      <i />
    </span>
  );
}
