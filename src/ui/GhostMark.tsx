/** A local vector mark shared by the masthead and the haunted mail hall. */
export function GhostMark() {
  return (
    <svg
      className="ghost-mark"
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="ghost-mark-body"
        d="M9 49c9-5 7-13 7-23a17 17 0 0 1 34 0v17c0 8-6 13-12 11l-5-3-6 5-6-4-8 1Z"
      />
      <ellipse className="ghost-mark-eye" cx="27" cy="25" rx="2.3" ry="3.2" />
      <ellipse className="ghost-mark-eye" cx="39" cy="25" rx="2.3" ry="3.2" />
      <g className="ghost-mark-letter">
        <rect x="33" y="35" width="23" height="15" rx="2" />
        <path className="ghost-mark-fold" d="M33 50 44.5 40 56 50" />
        <path className="ghost-mark-flap" d="M33 35H56L44.5 43.5Z" />
        <circle className="ghost-mark-seal" cx="44.5" cy="43.5" r="1.5" />
      </g>
      <path className="ghost-mark-spark" d="M9 10v8M5 14h8M55 22v6M52 25h6" />
    </svg>
  );
}
