import { useEffect, useRef, useState } from "react";

// Keep ledger amounts as integer microTARI; never convert money through floats.
export function toMicroTari(value: string): string {
  if (!/^\d+(?:\.\d{0,6})?$/.test(value))
    throw new Error("Enter a TARI amount with up to six decimal places");
  const [whole, fraction = ""] = value.split(".");
  const result = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (result > 18_446_744_073_709_551_615n)
    throw new Error("Amount is too large");
  return result.toString();
}
export function tari(value: string): string {
  if (!/^\d+$/.test(value)) return "—";
  const n = BigInt(value);
  const fraction = (n % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `${n / 1_000_000n}${fraction ? `.${fraction}` : ""}`;
}
export function AmountInput({
  value,
  onChange,
  disabled,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label: string;
}) {
  const [draft, setDraft] = useState(tari(value));
  const emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) setDraft(tari(value));
  }, [value]);
  return (
    <label>
      {label}
      <span className="amount-field">
        <input
          value={draft}
          inputMode="decimal"
          disabled={disabled}
          required
          pattern="[0-9]+([.][0-9]{0,6})?"
          title="Use up to six decimal places"
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            try {
              emitted.current = toMicroTari(next);
            } catch {
              emitted.current = "";
            }
            onChange(emitted.current);
          }}
        />
        <span aria-hidden="true">TARI</span>
      </span>
    </label>
  );
}
