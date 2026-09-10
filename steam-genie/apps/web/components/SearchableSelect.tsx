'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';

export type SearchableSelectOption = {
  id: string;
  label: string;
  keywords?: string;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const MAX_RESULTS = 40;

type SearchableSelectProps = {
  id?: string;
  value: string;
  options: SearchableSelectOption[];
  onChange: (id: string) => void;
  placeholder?: string;
  emptyHint?: string;
  disabled?: boolean;
};

export function SearchableSelect({
  id,
  value,
  options,
  onChange,
  placeholder = 'Buscar…',
  emptyHint = 'Sin coincidencias',
  disabled = false,
}: SearchableSelectProps) {
  const selected = options.find((option) => option.id === value) ?? null;
  const [query, setQuery] = useState(selected?.label ?? '');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    setQuery(selected?.label ?? '');
  }, [value, selected?.label]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    const list = !q
      ? options
      : options.filter((option) =>
          normalize(`${option.label} ${option.keywords ?? ''}`).includes(q),
        );
    return list.slice(0, MAX_RESULTS);
  }, [options, query]);

  function choose(nextId: string) {
    const option = options.find((item) => item.id === nextId);
    setQuery(option?.label ?? '');
    setOpen(false);
    onChange(nextId);
  }

  function handleQueryChange(next: string) {
    setQuery(next);
    setOpen(true);
    setHighlight(0);
  }

  function handleBlur() {
    window.setTimeout(() => {
      setOpen(false);
      if (!query.trim()) {
        if (value) onChange('');
        setQuery('');
        return;
      }
      setQuery(options.find((option) => option.id === value)?.label ?? '');
    }, 150);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && open && filtered[highlight]) {
      event.preventDefault();
      choose(filtered[highlight].id);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setQuery(selected?.label ?? '');
    }
  }

  return (
    <div className="searchable-select worker-search-field">
      <input
        id={id}
        type="search"
        className="input"
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(event) => handleQueryChange(event.target.value)}
        onFocus={() => {
          setOpen(true);
          setHighlight(0);
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      {open ? (
        filtered.length > 0 ? (
          <ul className="worker-search-suggestions searchable-select-list" role="listbox">
            {filtered.map((option, index) => (
              <li key={option.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.id === value || index === highlight}
                  className={index === highlight ? 'is-active' : undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => choose(option.id)}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <span className="muted worker-search-hint">{emptyHint}</span>
        )
      ) : null}
    </div>
  );
}
