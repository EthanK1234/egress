interface Props<T extends string | number> {
  label: string; // what the group chooses, for screen readers
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
}

// A row of options where exactly one is chosen: a well with the chosen option raised.
// A mouse click doesn't move keyboard focus onto it (Tab still does), so Space keeps meaning play/pause.
export default function Segmented<T extends string | number>({ label, options, value, onChange }: Props<T>) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          className={o.value === value ? "segment on" : "segment"}
          aria-pressed={o.value === value}
          disabled={o.disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
