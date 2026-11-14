import MapCanvas from "./components/MapCanvas";
import { testMap } from "./sim/testMap";

export default function App() {
  return (
    <main className="app">
      <h1>Egress</h1>
      <MapCanvas building={testMap} />
    </main>
  );
}
