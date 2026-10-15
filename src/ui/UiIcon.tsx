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
  | "search";
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
  return (
    <svg
      className="moonlit-scene"
      viewBox="0 0 240 135"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        opacity=".9"
        d="M119 13a23 23 0 1 0 19 36 22 22 0 0 1-19-36Z"
      />
      <path
        stroke="currentColor"
        opacity=".55"
        d="M32 24h3m-1.5-1.5v3M185 17h3m-1.5-1.5v3M207 53h2M60 55h2M159 60h2"
      />
      <path
        fill="#203a60"
        d="m0 102 42-29 27 18 43-22 41 28 30-14 57 24v28H0Z"
      />
      <path fill="#152b49" d="m0 117 62-17 40 12 44-20 49 22 45-13v34H0Z" />
      <path
        fill="#0a1428"
        d="m18 58-13 25h8L0 106h13v29h10v-29h12L23 83h8L18 58Zm195-12-14 29h9l-17 29h16v31h10v-31h17l-18-29h10l-13-29ZM49 91l-11 21h7l-11 17h12v6h7v-6h10l-11-17h7L49 91Z"
      />
      <path
        stroke="currentColor"
        opacity=".2"
        d="M88 118h50m-37 6h60m-48 6h25"
      />
    </svg>
  );
}
