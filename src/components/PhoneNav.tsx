import Icon, { type IconName } from "./Icon";

export type PhoneTab = "sim" | "results" | "overseer";

interface Props {
  tab: PhoneTab;
  onTab: (tab: PhoneTab) => void;
}

const TABS: { id: PhoneTab; icon: IconName; label: string }[] = [
  { id: "sim", icon: "play", label: "Simulate" },
  { id: "results", icon: "chart", label: "Results" },
  { id: "overseer", icon: "sparkle", label: "Overseer" },
];

// The floating tab bar at the bottom of the phone layout: the three sections, nothing else.
export default function PhoneNav({ tab, onTab }: Props) {
  const item = (t: (typeof TABS)[number]) => (
    <button key={t.id} className={t.id === tab ? "pn-item on" : "pn-item"} aria-label={t.label} aria-current={t.id === tab ? "page" : undefined} onClick={() => onTab(t.id)}>
      <Icon name={t.icon} size={20} />
      <span>{t.label}</span>
    </button>
  );
  return (
    <nav className="phone-nav" aria-label="Sections">
      {TABS.map(item)}
    </nav>
  );
}
