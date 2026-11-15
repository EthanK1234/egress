import { useEffect, useState } from "react";

// Phone-sized screens get the phone layout. A phone turned sideways still counts as a phone
// (the layout stays upright and asks to be turned back), but a tablet or desktop doesn't.
const PHONE = "(max-width: 700px), (pointer: coarse) and (orientation: landscape) and (max-height: 500px)";

export function usePhone(): boolean {
  const [phone, setPhone] = useState(() => typeof matchMedia === "function" && matchMedia(PHONE).matches);
  useEffect(() => {
    const query = matchMedia(PHONE);
    const update = () => setPhone(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return phone;
}
