import { useEffect, useRef } from "react";

// Disabling a focused button can move focus to the body. Recover only that lost
// focus after failure; never activate the action or steal deliberately moved focus.
export function useActionFocus(busy: boolean, failed: boolean) {
  const ref = useRef<HTMLButtonElement>(null);
  const requested = useRef(false);
  useEffect(() => {
    if (busy || !requested.current) return;
    requested.current = false;
    if (
      failed &&
      ref.current &&
      !ref.current.disabled &&
      document.activeElement === document.body
    )
      ref.current.focus({ preventScroll: true });
  }, [busy, failed]);
  return {
    ref,
    remember: () => {
      requested.current = document.activeElement === ref.current;
    },
    clear: () => {
      requested.current = false;
    },
  };
}
