import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Postbox } from "../core/types";

export function RecipientPicker({
  value,
  groups,
  busy,
  onChange,
  favourites = [],
  onFavourite,
  extras,
}: {
  value: string;
  groups: { label: string; boxes: Postbox[] }[];
  busy: boolean;
  onChange: (id: string) => void;
  favourites?: string[];
  onFavourite?: (id: string) => void;
  extras?: ReactNode;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null),
    picker = useRef<HTMLDivElement>(null);
  const editing = useRef(false);
  const composing = useRef(false);
  const selected = groups.flatMap((g) => g.boxes).find((p) => p.id === value);
  const [query, setQuery] = useState(selected?.nickname || value);
  const [open, setOpen] = useState(false),
    [activeId, setActiveId] = useState<string | undefined>();
  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!picker.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  useEffect(() => {
    if (!editing.current) setQuery(selected?.nickname || value);
    editing.current = false;
  }, [value, selected?.nickname]);
  const filter =
    selected && query === selected.nickname ? "" : query.trim().toLowerCase();
  const matching = groups.map((g) => ({
    ...g,
    boxes: g.boxes
      .filter((p) => `${p.nickname} ${p.id}`.toLowerCase().includes(filter))
      .slice(0, 20),
  }));
  const results = matching.flatMap((g) => g.boxes);
  const active = results.findIndex((box) => box.id === activeId);
  useEffect(() => {
    if (open && active >= 0)
      document
        .getElementById(`${id}-option-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);
  function choose(box: Postbox) {
    editing.current = false;
    setQuery(box.nickname);
    onChange(box.id);
    setOpen(false);
    setActiveId(undefined);
    input.current?.focus();
  }
  return (
    <div
      className="recipient-picker"
      ref={picker}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOpen(false);
          if (selected) setQuery(selected.nickname);
        }
      }}
    >
      <div className="recipient-field">
        <label htmlFor={id}>To</label>
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-label="Recipient postbox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-matches`}
          aria-activedescendant={
            open && active >= 0 ? `${id}-option-${active}` : undefined
          }
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          value={query}
          data-recipient-id={value}
          title={selected ? `${selected.nickname} · ${selected.id}` : undefined}
          placeholder="Name or postbox ID"
          onFocus={(event) => {
            setOpen(true);
            event.currentTarget.select();
          }}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            editing.current = true;
            setQuery(event.target.value);
            setOpen(true);
            setActiveId(undefined);
            onChange("");
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          onKeyDown={(event) => {
            if (
              composing.current ||
              event.nativeEvent.isComposing ||
              event.nativeEvent.keyCode === 229
            ) {
              event.stopPropagation();
              return;
            }
            if (event.key === "Escape" && open) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              const next = results.length
                ? active < 0
                  ? event.key === "ArrowDown"
                    ? 0
                    : results.length - 1
                  : (active +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      results.length) %
                    results.length
                : -1;
              setActiveId(results[next]?.id);
            } else if (event.key === "Enter" && open) {
              event.preventDefault();
              const match =
                results[active] ||
                (results.length === 1
                  ? results[0]
                  : results.find((p) => p.id === query.trim()));
              if (match) choose(match);
            }
          }}
        />
        {selected && onFavourite && (
          <button
            type="button"
            className="recipient-favourite"
            disabled={busy}
            aria-label={`Favourite ${selected.nickname}`}
            aria-pressed={favourites.includes(selected.id)}
            title={
              favourites.includes(selected.id)
                ? "Remove from favourites"
                : "Add to favourites"
            }
            onClick={() => onFavourite(selected.id)}
          >
            {favourites.includes(selected.id) ? "★" : "☆"}
          </button>
        )}
      </div>
      {open && (
        <div className="recipient-popover">
          <div
            id={`${id}-matches`}
            role="listbox"
            aria-label="Matching postboxes"
          >
            {matching.map(
              (group, groupIndex) =>
                !!group.boxes.length && (
                  <div role="group" aria-label={group.label} key={group.label}>
                    <div className="recipient-group-title" aria-hidden="true">
                      {
                        [
                          "Favourites",
                          "Recent correspondents",
                          "Public directory",
                        ][groupIndex]
                      }
                    </div>
                    {group.boxes.map((box) => {
                      const index = results.indexOf(box);
                      return (
                        <button
                          type="button"
                          role="option"
                          id={`${id}-option-${index}`}
                          key={box.id}
                          aria-selected={value === box.id}
                          className={active === index ? "active" : ""}
                          tabIndex={-1}
                          disabled={busy}
                          title={box.id}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setActiveId(box.id)}
                          onClick={() => choose(box)}
                        >
                          <span>{box.nickname}</span>
                          <small>
                            {box.id.length > 26
                              ? `${box.id.slice(0, 16)}…${box.id.slice(-6)}`
                              : box.id}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                ),
            )}
          </div>
          {!results.length && (
            <p className="recipient-no-matches">
              No matching postboxes. Try a name or full ID.
            </p>
          )}
          {extras}
        </div>
      )}
    </div>
  );
}
