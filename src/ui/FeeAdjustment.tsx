import { useEffect, useRef, useState } from "react";
import { AmountInput, tari } from "./AmountInput";
import type { FeeProblem } from "../core/fee-limit";
export function FeeAdjustment({
  problem,
  value,
  onChange,
  label,
  busy = false,
}: {
  problem?: FeeProblem;
  value: string;
  onChange: (value: string) => void;
  label: string;
  busy?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!problem || busy) return;
    panel.current?.scrollIntoView({ block: "center", behavior: "instant" });
    panel.current?.focus({ preventScroll: true });
  }, [problem, busy]);
  if (!problem) return null;
  return (
    <section
      ref={panel}
      tabIndex={-1}
      className="fee-warning"
      role="alert"
      aria-label={`${label} warning`}
    >
      <strong>Network fee needs attention</strong>
      {problem.mode === "locked" ? (
        <p>
          Keep the original request and check Activity or Sapient. A fee may
          already have been charged. Changing a fee cannot repair or replace an
          existing approval.
        </p>
      ) : problem.mode === "restore" ? (
        <>
          <p>
            This payment uses its original fee limit
            {problem.required
              ? ` of ${tari(problem.required)} TARI per attempt`
              : ""}
            . Restore that limit to resume the same approval.
          </p>
          {problem.required && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onChange(problem.required!)}
            >
              Restore original fee limit
            </button>
          )}
        </>
      ) : (
        <>
          <p>
            Nothing was submitted.{" "}
            {problem.required
              ? `Sapient’s check requires at least ${tari(problem.required)} TARI. `
              : ""}
            Your current limit is {tari(value)} TARI per attempt. Adjust it,
            then review and approve again.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(true)}
          >
            Adjust {label.toLowerCase()}
          </button>
          {editing && (
            <AmountInput
              label={label}
              value={value}
              disabled={busy}
              onChange={onChange}
            />
          )}
        </>
      )}
    </section>
  );
}
