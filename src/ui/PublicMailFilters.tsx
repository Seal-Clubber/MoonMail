import type { SampleMailFilter } from "./sample-office";
import { UiIcon } from "./UiIcon";

export function PublicMailFilters({
  value,
  onChange,
}: {
  value: SampleMailFilter;
  onChange: (value: SampleMailFilter) => void;
}) {
  const filters: { value: SampleMailFilter; label: string }[] = [
    { value: "all", label: "All mail" },
    { value: "public", label: "Public letters" },
    { value: "gifts", label: "Public gifts" },
    { value: "link", label: "Private invitations" },
  ];
  return (
    <div className="public-mail-filters" role="group" aria-label="Show mail">
      {filters.map((filter) => (
        <button
          type="button"
          key={filter.value}
          aria-pressed={value === filter.value}
          onClick={() => onChange(filter.value)}
        >
          {filter.value === "gifts" && <UiIcon name="gift" />}
          {filter.label}
        </button>
      ))}
    </div>
  );
}
