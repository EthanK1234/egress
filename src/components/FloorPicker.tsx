import { MAX_FLOORS } from "../editor/layout";
import Icon from "./Icon";

interface Props {
  count: number;
  level: number; // index of the floor being shown; 0 is the ground floor
  onSelect: (level: number) => void;
  onAdd: () => void;
  onRemove: () => void;
}

// Moves between floors, like a lift panel: the top floor is at the top.
export default function FloorPicker({ count, level, onSelect, onAdd, onRemove }: Props) {
  const levels = Array.from({ length: count }, (_, k) => count - 1 - k);
  return (
    <div className="floor-picker" role="group" aria-label="Floors">
      <span className="floor-picker-label">Floor</span>
      <button
        className="glass square"
        aria-label="Add a floor on top"
        title="Add a floor on top, copied from this one"
        disabled={count >= MAX_FLOORS}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onAdd}
      >
        <Icon name="plus" size={16} />
      </button>
      {levels.map((i) => (
        <button
          key={i}
          className={i === level ? "glass square on" : "glass square"}
          aria-pressed={i === level}
          aria-label={`Floor ${i + 1}`}
          title={`Floor ${i + 1}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(i)}
        >
          {i + 1}
        </button>
      ))}
      <button
        className="glass square"
        aria-label="Remove this floor"
        title="Remove this floor"
        disabled={count <= 1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onRemove}
      >
        <Icon name="minus" size={16} />
      </button>
    </div>
  );
}
