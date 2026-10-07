import { useEffect, useId, useRef, useState } from "react";

// A copy failure must never hide the value or claim it was saved.
export function CopyField({
  value,
  label,
  buttonLabel,
  copiedMessage = "Copied.",
  disabled = false,
  multiline = false,
}: {
  value: string;
  label: string;
  buttonLabel: string;
  copiedMessage?: string;
  disabled?: boolean;
  multiline?: boolean;
}) {
  const id = useId();
  const field = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const revision = useRef(0);
  const [notice, setNotice] = useState("");
  const [copying, setCopying] = useState(false);
  useEffect(() => {
    revision.current++;
    setNotice("");
    setCopying(false);
    return () => {
      revision.current++;
    };
  }, [value]);
  async function copy() {
    const current = revision.current;
    setCopying(true);
    setNotice("");
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      if (current === revision.current) setNotice(copiedMessage);
    } catch {
      if (current === revision.current) {
        setNotice(
          "Copying is unavailable here. Select the field and copy it manually.",
        );
        field.current?.focus();
        field.current?.select();
      }
    } finally {
      if (current === revision.current) setCopying(false);
    }
  }
  const shared = {
    id,
    readOnly: true,
    value,
    onFocus: (
      event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => event.target.select(),
    ref: (element: HTMLInputElement | HTMLTextAreaElement | null) => {
      field.current = element;
    },
  };
  return (
    <div className="copy-field">
      <label htmlFor={id}>{label}</label>
      {multiline ? <textarea {...shared} rows={3} /> : <input {...shared} />}
      <button
        type="button"
        disabled={disabled || copying}
        onClick={() => void copy()}
      >
        {copying ? "Copying…" : buttonLabel}
      </button>
      {notice && (
        <p role="status" className="copy-notice">
          {notice}
        </p>
      )}
    </div>
  );
}
