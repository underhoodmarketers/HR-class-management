"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function CustomersFilterBar({
  studios,
  showWaiver = true,
}: {
  studios?: { id: number; name: string }[];
  showWaiver?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(searchParams.get("q") ?? "");

  // Debounce the search box so we're not navigating on every keystroke.
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (q === current) return;
    const timeout = setTimeout(() => updateParam("q", q), 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="card flex flex-wrap items-center gap-3 p-4">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name, email, or phone…"
        className="input min-w-[220px] flex-1"
      />
      {studios ? (
        <select
          value={searchParams.get("studio") ?? ""}
          onChange={(e) => updateParam("studio", e.target.value)}
          className="input w-auto"
        >
          <option value="">All studios</option>
          <option value="none">No studio</option>
          {studios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      ) : null}
      <select
        value={searchParams.get("membership") ?? ""}
        onChange={(e) => updateParam("membership", e.target.value)}
        className="input w-auto"
      >
        <option value="">Any membership</option>
        <option value="active">Active membership</option>
        <option value="none">No active membership</option>
      </select>
      {showWaiver ? (
        <select
          value={searchParams.get("waiver") ?? ""}
          onChange={(e) => updateParam("waiver", e.target.value)}
          className="input w-auto"
        >
          <option value="">Any waiver status</option>
          <option value="signed">Signed</option>
          <option value="missing">Missing</option>
        </select>
      ) : null}
      {searchParams.toString() ? (
        <button
          type="button"
          onClick={() => {
            setQ("");
            router.push(pathname);
          }}
          className="text-xs font-semibold text-magenta hover:underline"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
