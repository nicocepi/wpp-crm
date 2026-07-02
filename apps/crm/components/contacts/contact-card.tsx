"use client";

import { useEffect, useRef, useState } from "react";
import { Phone, Clock, Tag, ChevronDown, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserCheck } from "lucide-react";
import { StatusBadge } from "./status-badge";
import { LabelChips } from "./label-chips";
import { isHandoff, type ContactWithLabels, type Label } from "@/lib/types";
import {
  initials,
  relativeTime,
  STATUS_META,
  STATUS_ORDER,
  normalizeStatus,
  type Status,
} from "@/lib/format";

interface Props {
  contact: ContactWithLabels;
  allLabels: Label[];
  /** La tomó otro agente y yo no soy dueño ni admin -> solo lectura. */
  locked: boolean;
  onOpen: (contact: ContactWithLabels) => void;
  onRename: (id: string, name: string) => void;
  onNeeds: (id: string, needs: string) => void;
  onStatus: (id: string, status: Status) => void;
  onToggleLabel: (contact: ContactWithLabels, label: Label) => void;
}

export function ContactCard({
  contact,
  allLabels,
  locked,
  onOpen,
  onRename,
  onNeeds,
  onStatus,
  onToggleLabel,
}: Props) {
  const [name, setName] = useState(contact.name ?? "");
  const [needs, setNeeds] = useState(contact.needs ?? "");
  const nameRef = useRef<HTMLInputElement>(null);
  const needsRef = useRef<HTMLTextAreaElement>(null);
  const assignedIds = new Set(contact.labels.map((l) => l.id));

  // Sincroniza con cambios que llegan por realtime (ej: el resumen IA que
  // escribe n8n en `needs`), sin pisar lo que el usuario esté editando.
  useEffect(() => {
    if (document.activeElement !== nameRef.current) setName(contact.name ?? "");
  }, [contact.name]);
  useEffect(() => {
    if (document.activeElement !== needsRef.current) setNeeds(contact.needs ?? "");
  }, [contact.needs]);

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => onOpen(contact)}
    >
      <CardContent className="space-y-3 p-4">
        {isHandoff(contact) &&
          (contact.handoff_by ? (
            <div
              className={
                "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium " +
                (locked
                  ? "bg-zinc-100 text-zinc-600"
                  : "bg-indigo-100 text-indigo-800")
              }
            >
              {locked ? (
                <Lock className="h-3 w-3" />
              ) : (
                <UserCheck className="h-3 w-3" />
              )}{" "}
              Atendido por {contact.handoff_by_name ?? "un agente"}
            </div>
          ) : (
            <div className="flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800">
              <UserCheck className="h-3 w-3" /> Necesita agente · sin asignar
            </div>
          ))}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {initials(contact.name, contact.phone)}
          </div>
          <div className="min-w-0 flex-1">
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => {
                if (name !== (contact.name ?? "")) onRename(contact.id, name);
              }}
              readOnly={locked}
              placeholder="Sin nombre"
              className="w-full truncate bg-transparent text-sm font-semibold outline-none focus:rounded focus:bg-muted focus:px-1"
            />
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" /> {contact.phone}
            </p>
          </div>
          <StatusMenu
            status={normalizeStatus(contact.status)}
            disabled={locked}
            onChange={(s) => onStatus(contact.id, s)}
          />
        </div>

        {contact.last_message_preview && (
          <p className="line-clamp-2 rounded bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
            {contact.last_message_preview}
          </p>
        )}

        <div onClick={(e) => e.stopPropagation()}>
          <textarea
            ref={needsRef}
            value={needs}
            onChange={(e) => setNeeds(e.target.value)}
            onBlur={() => {
              if (needs !== (contact.needs ?? "")) onNeeds(contact.id, needs);
            }}
            readOnly={locked}
            rows={2}
            placeholder="Necesidad del contacto (autollenada por IA)..."
            className="w-full resize-none rounded border border-dashed bg-transparent px-2 py-1 text-xs outline-none focus:border-solid focus:bg-muted"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <LabelChips
            labels={contact.labels}
            onRemove={(label) => onToggleLabel(contact, label)}
          />
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={locked}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
              >
                <Tag className="h-3 w-3" /> Labels
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Asignar labels</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {allLabels.length === 0 && (
                  <DropdownMenuItem disabled>Sin labels</DropdownMenuItem>
                )}
                {allLabels.map((label) => (
                  <DropdownMenuCheckboxItem
                    key={label.id}
                    checked={assignedIds.has(label.id)}
                    onSelect={(e) => {
                      e.preventDefault();
                      onToggleLabel(contact, label);
                    }}
                  >
                    <span
                      className="mr-2 inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: label.color ?? "#6366f1" }}
                    />
                    {label.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="h-3 w-3" /> {relativeTime(contact.last_message_at)}
        </p>
      </CardContent>
    </Card>
  );
}

function StatusMenu({
  status,
  disabled,
  onChange,
}: {
  status: Status;
  disabled?: boolean;
  onChange: (s: Status) => void;
}) {
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          className="inline-flex items-center gap-1 disabled:opacity-60"
        >
          <StatusBadge status={status} />
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {STATUS_ORDER.map((s) => (
            <DropdownMenuItem key={s} onSelect={() => onChange(s)}>
              {STATUS_META[s].label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
