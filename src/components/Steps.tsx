import Icon from "./Icon";

export type Step = "setup" | "simulate" | "diagnose" | "prove";

const STEPS: { id: Step; label: string }[] = [
  { id: "setup", label: "Set up" },
  { id: "simulate", label: "Simulate" },
  { id: "diagnose", label: "Diagnose" },
  { id: "prove", label: "Prove" },
];

// Where the user is in the pipeline. It only shows progress; it is not a control.
export default function Steps({ current }: { current: Step }) {
  const at = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="steps" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s.id} className={i < at ? "step done" : i === at ? "step current" : "step"} aria-current={i === at ? "step" : undefined}>
          <span className="step-mark">{i < at ? <Icon name="check" size={12} /> : i + 1}</span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}
