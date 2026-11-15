import type { MapInfo } from "../sim/maps";

interface Props {
  maps: MapInfo[];
  mapId: string; // "" while an imported floor plan is in use
  importedName: string | null; // file name of the imported floor plan, while it is the one in use
  onMap: (id: string) => void;
  disabled?: boolean;
}

// Chooses the floor plan. Shown in the Set up panel only, so the plan can't change once a run exists.
export default function PlanPicker({ maps, mapId, importedName, onMap, disabled }: Props) {
  return (
    <label className="plan-picker">
      <span className="field-label">Floor plan</span>
      <select
        value={mapId}
        disabled={disabled}
        onChange={(e) => {
          onMap(e.target.value);
          e.target.blur(); // so Space goes back to meaning run
        }}
      >
        {importedName && <option value="">{importedName}</option>}
        {maps.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}
