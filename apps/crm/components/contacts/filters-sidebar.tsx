"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label as UiLabel } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { Label } from "@/lib/types";
import { STATUS_META, STATUS_ORDER, type Status } from "@/lib/format";

export interface Filters {
  q: string;
  status: Status | "all";
  labelIds: string[];
  from: string;
  to: string;
}

export const EMPTY_FILTERS: Filters = {
  q: "",
  status: "all",
  labelIds: [],
  from: "",
  to: "",
};

export function FiltersSidebar({
  filters,
  labels,
  onChange,
}: {
  filters: Filters;
  labels: Label[];
  onChange: (next: Filters) => void;
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  const toggleLabel = (id: string) => {
    const has = filters.labelIds.includes(id);
    set({
      labelIds: has
        ? filters.labelIds.filter((x) => x !== id)
        : [...filters.labelIds, id],
    });
  };

  const hasActive =
    filters.q ||
    filters.status !== "all" ||
    filters.labelIds.length > 0 ||
    filters.from ||
    filters.to;

  return (
    <div className="flex w-full flex-col gap-5 p-4">
      <div className="space-y-2">
        <UiLabel>Buscar</UiLabel>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Nombre o telefono"
            className="pl-8"
          />
        </div>
      </div>

      <div className="space-y-2">
        <UiLabel>Estado</UiLabel>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => set({ status: "all" })}
            className={chip(filters.status === "all")}
          >
            Todos
          </button>
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => set({ status: s })}
              className={chip(filters.status === s)}
            >
              {STATUS_META[s].label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <UiLabel>Labels</UiLabel>
        <div className="flex flex-col gap-1.5">
          {labels.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin labels definidas</p>
          )}
          {labels.map((label) => (
            <label
              key={label.id}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                checked={filters.labelIds.includes(label.id)}
                onChange={() => toggleLabel(label.id)}
                className="h-4 w-4"
              />
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: label.color ?? "#6366f1" }}
              />
              {label.name}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <UiLabel>Ultimo mensaje</UiLabel>
        <div className="grid grid-cols-1 gap-2">
          <Input
            type="date"
            value={filters.from}
            onChange={(e) => set({ from: e.target.value })}
          />
          <Input
            type="date"
            value={filters.to}
            onChange={(e) => set({ to: e.target.value })}
          />
        </div>
      </div>

      {hasActive && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="justify-start text-muted-foreground"
        >
          <X className="h-4 w-4" /> Limpiar filtros
        </Button>
      )}
    </div>
  );
}

function chip(active: boolean) {
  return [
    "rounded-full border px-2.5 py-1 text-xs transition-colors",
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "hover:bg-accent",
  ].join(" ");
}
