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
        d="M14 49V27a18 18 0 0 1 36 0v22l-7-5-6 6-6-5-8 5-5-5Z"
      />
      <ellipse className="ghost-mark-eye" cx="26" cy="27" rx="2.3" ry="3.4" />
      <ellipse className="ghost-mark-eye" cx="39" cy="27" rx="2.3" ry="3.4" />
      <g className="ghost-mark-letter">
        <rect x="23" y="35" width="21" height="13" rx="1" />
        <path className="ghost-mark-fold" d="M23 48 33.5 39 44 48" />
        <path className="ghost-mark-flap" d="M23 35H44L33.5 42.5Z" />
        <circle className="ghost-mark-seal" cx="33.5" cy="42.5" r="2" />
      </g>
      <path className="ghost-mark-spark" d="M9 10v8M5 14h8M55 22v6M52 25h6" />
    </svg>
  );
}
