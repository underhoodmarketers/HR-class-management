"use client";

import { useEffect, useState } from "react";

export default function CustomerMultiSelect({
  customers,
  onSelectionChange,
}: {
  customers: { id: number; name: string; email: string }[];
  onSelectionChange?: (count: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    onSelectionChange?.(selected.size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? customers.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
    : customers;

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visible = filtered.slice(0, 50);
  const visibleIds = new Set(visible.map((c) => c.id));
  // Selected customers scrolled out of the current search filter still need
  // to submit with the form, even though their checkbox isn't rendered.
  const hiddenSelectedIds = [...selected].filter((id) => !visibleIds.has(id));

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search customers by name or email…"
        className="input"
      />
      {selected.size > 0 ? (
        <p className="mt-1.5 text-xs text-ink/50">{selected.size} selected</p>
      ) : null}
      {hiddenSelectedIds.map((id) => (
        <input key={id} type="hidden" name="customerIds" value={id} />
      ))}
      <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-ink/10">
        {visible.length === 0 ? (
          <p className="p-3 text-sm text-ink/40">No matches.</p>
        ) : (
          visible.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-2 border-b border-ink/5 px-3 py-2 text-sm last:border-b-0 hover:bg-blush/20"
            >
              <input
                type="checkbox"
                name="customerIds"
                value={c.id}
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
              />
              <span className="flex-1">{c.name}</span>
              <span className="text-xs text-ink/40">{c.email}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
