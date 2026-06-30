import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_META, normalizeStatus } from "@/lib/format";

export function StatusBadge({ status }: { status: string | null }) {
  const meta = STATUS_META[normalizeStatus(status)];
  return (
    <Badge variant="outline" className={cn("border", meta.className)}>
      {meta.label}
    </Badge>
  );
}
