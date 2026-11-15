import type { MapInfo } from "../sim/maps";

interface Props {
  maps: MapInfo[];
  mapId: string; // "" while an imported floor plan is in use
  importedName: string | null; // file name of the imported floor plan, while it is the one in use
  onMap: (id: string) => void;
}

// Chooses the floor plan, shown on the 3D view while the layout can be edited.
export default function PlanPicker({ maps, mapId, importedName, onMap }: Props) {
  return (
    <label className="plan-picker">
      <span className="floor-picker-label">Floor plan</span>
      <select
        className="glass"
        value={mapId}
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
