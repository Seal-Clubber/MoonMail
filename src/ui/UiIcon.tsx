import { useId } from "react";
/** Small, consistent local icons. Labels belong to the surrounding control. */
export type IconName =
  | "inbox"
  | "mail"
  | "compose"
  | "sent"
  | "star"
  | "archive"
  | "gift"
  | "check"
  | "unread"
  | "settings"
  | "globe"
  | "privacy"
  | "back"
  | "refresh"
  | "search"
  | "cards"
  | "list"
  | "activity";
const paths: Record<IconName, string> = {
  inbox: "M4 4h16l2 12v4H2v-4L4 4ZM2 15h6l2 3h4l2-3h6",
  mail: "M3 5h18v14H3V5Zm0 1 9 7 9-7",
  compose: "m15 4 5 5M4 20l4-1L21 6l-5-5L3 14l-1 7 6-2",
  sent: "m3 3 19 9-19 9 4-9-4-9Zm4 9h15",
  star: "m12 2 3.1 6.3 7 1-5 4.9 1.2 6.9-6.3-3.3-6.3 3.3 1.2-6.9-5-4.9 7-1L12 2Z",
  archive: "M3 3h18v5H3V3Zm2 5v13h14V8M9 12h6",
  gift: "M3 8h18v5H3V8Zm2 5v8h14v-8M12 8v13M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z",
  check: "m5 12 4 4L20 5",
  unread: "M3 8v13h18V8M3 8l9-6 9 6M3 8l9 7 9-7",
  settings:
    "m9 3 1-2h4l1 2 3 2 2-1 2 4-1 2v4l1 2-2 4-2-1-3 2-1 2h-4l-1-2-3-2-2 1-2-4 1-2v-4L2 8l2-4 2 1 3-2ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  globe:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM2 12h20M12 2c-6 6-6 14 0 20M12 2c6 6 6 14 0 20",
  privacy: "M5 10h14v11H5V10Zm3 0V6a4 4 0 0 1 8 0v4M12 14v3",
  back: "m14 5-7 7 7 7",
  refresh: "M20 5v6h-6M4 19v-6h6M20 11a8 8 0 0 0-14-6M4 13a8 8 0 0 0 14 6",
  search: "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm6 14 5 5",
  cards: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z",
  list: "M3 5h2m3 0h13M3 12h2m3 0h13M3 19h2m3 0h13",
  activity: "M6 9a6 6 0 0 1 12 0v6l3 3H3l3-3V9Zm4 12h4M12 1v2",
};
export function UiIcon({ name }: { name: IconName }) {
  return (
    <svg
      className="ui-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function MoonlitScene() {
  const prefix = useId().replaceAll(":", "");
  const sky = `${prefix}-sky`,
    lake = `${prefix}-lake`,
    tree = `${prefix}-tree`,
    glow = `${prefix}-glow`;
  return (
    <svg
      className="moonlit-scene"
      viewBox="0 0 300 200"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={sky} x2="0" y2="1">
          <stop stopColor="#0a1428" />
          <stop offset="1" stopColor="#152d50" />
        </linearGradient>
        <linearGradient id={lake} x2="0" y2="1">
          <stop stopColor="#29496b" />
          <stop offset="1" stopColor="#0a1428" />
        </linearGradient>
        <radialGradient id={glow}>
          <stop stopColor="#7da4db" stopOpacity=".25" />
          <stop offset="1" stopColor="#7da4db" stopOpacity="0" />
        </radialGradient>
        <path
          id={tree}
          d="M0 0-8 16h5l-12 20h8l-14 21h11l-16 21h23v19h6V78h23L10 57h11L7 36h8L3 16h5Z"
        />
      </defs>
      <path fill={`url(#${sky})`} d="M0 0h300v200H0Z" />
      <ellipse cx="145" cy="70" rx="106" ry="73" fill={`url(#${glow})`} />
      <path fill="#dce9ff" d="M156 22a28 28 0 1 0 20 46 27 27 0 0 1-20-46Z" />
      <g fill="#b9d5fc" opacity=".7">
        {[
          [25, 35],
          [61, 18],
          [103, 49],
          [209, 29],
          [262, 18],
          [239, 63],
          [79, 72],
          [181, 8],
        ].map(([cx, cy]) => (
          <circle key={cx} cx={cx} cy={cy} r=".8" />
        ))}
      </g>
      <path
        fill="#203f65"
        d="m0 124 36-25 22 9 32-29 17 15 33-23 42 40 22-18 31 19 34-17 31 27v78H0Z"
      />
      <path
        fill="#142d4e"
        d="m0 125 56-8 37 18 40-16 51 14 54-27 62 18v76H0Z"
      />
      <path
        fill={`url(#${lake})`}
        d="M107 135h85l-28 15 38 14-76 13 94 23H45l90-37-36-10 38-8Z"
      />
      <g stroke="#9dbdeb" strokeWidth="1" opacity=".5">
        <path d="M125 143h34m-25 7h22m-31 10h43m-48 11h53m-68 15h87" />
      </g>
      <g fill="#0a1b31" opacity=".8">
        {[
          [21, 86, 0.5],
          [52, 91, 0.55],
          [79, 108, 0.3],
          [218, 94, 0.45],
          [254, 80, 0.6],
          [280, 87, 0.55],
        ].map(([x, y, s]) => (
          <use
            key={x}
            href={`#${tree}`}
            transform={`translate(${x} ${y}) scale(${s})`}
          />
        ))}
      </g>
      <g fill="#071326">
        {[
          [3, 64, 1.2],
          [33, 109, 0.8],
          [66, 137, 0.6],
          [242, 127, 0.75],
          [284, 60, 1.3],
          [308, 92, 1.1],
        ].map(([x, y, s]) => (
          <use
            key={x}
            href={`#${tree}`}
            transform={`translate(${x} ${y}) scale(${s})`}
          />
        ))}
      </g>
      <path
        fill="#081426"
        d="M0 175q43-13 93 10l35 15H0Zm300-3q-29-1-81 24l-13 4h94Z"
      />
    </svg>
  );
}
