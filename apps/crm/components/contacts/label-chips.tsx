import { X } from "lucide-react";
import type { Label } from "@/lib/types";

export function LabelChips({
  labels,
  onRemove,
}: {
  labels: Label[];
  onRemove?: (label: Label) => void;
}) {
  if (labels.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((label) => (
        <span
          key={label.id}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
          style={{ backgroundColor: label.color ?? "#6366f1" }}
        >
          {label.name}
          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(label);
              }}
              className="opacity-80 hover:opacity-100"
              aria-label={`Quitar ${label.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
