// The layout tools, in the order the tool bars show them.

import type { IconName } from "../components/Icon";
import type { Tool } from "./layout";

export const TOOLS: { id: Tool; label: string; icon: IconName; hint: string }[] = [
  { id: "fire", label: "Fire", icon: "flame", hint: "Click a cell to start a fire there, or to put one out" },
  { id: "wall", label: "Wall", icon: "wall", hint: "Drag to build walls" },
  { id: "door", label: "Door", icon: "door", hint: "Drag to place doors" },
  { id: "exit", label: "Exit", icon: "exit", hint: "Drag to place exits" },
  { id: "table", label: "Table", icon: "desk", hint: "Drag to place tables and desks. People walk around them; fire spreads over them" },
  { id: "chair", label: "Chair", icon: "chair", hint: "Drag to place chairs. A chair faces the table next to it" },
  { id: "erase", label: "Erase", icon: "erase", hint: "Drag to clear cells back to open floor" },
];
