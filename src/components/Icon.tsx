import type { ReactNode } from "react";

// Small inline icons. All are drawn on a 24px grid with the same round 2px stroke,
// so they look like one family at any size.
const SHAPES = {
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />,
  pause: <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none" />,
  replay: (
    <>
      <path d="M5 12a7 7 0 1 0 2.2-5.1" />
      <path d="M4.5 4.5v4.3h4.3" />
    </>
  ),
  skip: <path d="M5.5 5.5v13l8.5-6.5zM16 5.5h2.5v13H16z" fill="currentColor" stroke="none" />,
  grid: <path d="M9 4v16M15 4v16M4 9h16M4 15h16" />,
  back: <path d="M15 5l-7 7 7 7" />,
  chart: <path d="M4 20h16M7 16v-5M12 16V7M17 16v-8" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <path d="M15.5 5.2a3 3 0 0 1 0 5.6M17.5 14.3c1.6.7 2.6 2.3 3 4.7" />
    </>
  ),
  sparkle: <path d="M12 3.5l1.9 5.2 5.1 1.8-5.1 1.9-1.9 5.1-1.9-5.1-5.1-1.9 5.1-1.8zM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />,
  pencil: (
    <>
      <path d="M4.5 19.5l1-4L15.8 5.2a1.8 1.8 0 0 1 2.5 0l.5.5a1.8 1.8 0 0 1 0 2.5L8.5 18.5z" />
      <path d="M13.5 7.5l3 3" />
    </>
  ),
  focus: (
    <>
      <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  rotate: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V4" />
      <path d="M7.5 8.5L12 4l4.5 4.5" />
      <path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="M7.5 10.5L12 15l4.5-4.5" />
      <path d="M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4 4l16 16" />
      <path d="M10 5.7a9.6 9.6 0 0 1 2-.2c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.7 3.4" />
      <path d="M6.3 7.5A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 3.5-.7" />
    </>
  ),
  path: (
    <>
      <circle cx="5.5" cy="18" r="1.8" />
      <circle cx="18.5" cy="6" r="1.8" />
      <path d="M7.5 17.5c5-.5 2-8 6.5-9.5 1.5-.5 2.5-.7 3-1" />
    </>
  ),
  flame: <path d="M12 3.5c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.2 1.5.9 2.5 1.8 2.7C11.3 9 10.8 6 12 3.5z" />,
  wall: <path d="M4 6h16v12H4zM4 12h16M10 6v6M14 12v6" />,
  door: (
    <>
      <path d="M7 20V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15" />
      <path d="M4.5 20h15" />
      <path d="M14 12v.5" />
    </>
  ),
  exit: (
    <>
      <path d="M13 4H7a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h6" />
      <path d="M11 12h9.5" />
      <path d="M17 8.5l3.5 3.5-3.5 3.5" />
    </>
  ),
  desk: <path d="M3.5 9h17M5.5 9v9.5M18.5 9v9.5M5.5 13.5h6.5v5" />,
  chair: <path d="M7.5 4v15.5M7.5 12.5h9v7M7.5 16.5h9" />,
  erase: (
    <>
      <path d="M9 19h10.5" />
      <path d="M5.4 15.4l8.8-8.8a1.5 1.5 0 0 1 2.1 0l3.1 3.1a1.5 1.5 0 0 1 0 2.1L13 18.2H8.2z" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof SHAPES;

export default function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {SHAPES[name]}
    </svg>
  );
}
