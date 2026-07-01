"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  ATTENTION_LABEL,
  URGENT_LABEL,
  isHandoff,
  isUrgent,
  readFlowState,
  type ContactWithLabels,
  type Contact,
  type Label,
} from "@/lib/types";
import { normalizeStatus, type Status } from "@/lib/format";
import { playAttentionChime } from "@/lib/sound";
import { setHandoff } from "@/app/(dashboard)/contacts/actions";
import { ContactCard } from "./contact-card";
import { ConversationSheet } from "./conversation-sheet";
import {
  FiltersSidebar,
  EMPTY_FILTERS,
  type Filters,
} from "./filters-sidebar";

export function ContactsView({
  tenantId,
  initialContacts,
  labels,
}: {
  tenantId: string;
  initialContacts: ContactWithLabels[];
  labels: Label[];
}) {
  const [contacts, setContacts] = useState<ContactWithLabels[]>(initialContacts);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<ContactWithLabels | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  // Labels automáticas del tenant (para reflejarlas en vivo).
  const attentionLabel = useMemo(
    () => labels.find((l) => l.name === ATTENTION_LABEL) ?? null,
    [labels],
  );
  const urgentLabel = useMemo(
    () => labels.find((l) => l.name === URGENT_LABEL) ?? null,
    [labels],
  );

  // Estado espejo para que el handler de realtime lea el valor previo.
  const contactsRef = useRef(contacts);
  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);
  // Labels en refs: el handler de realtime las lee sin re-suscribir el canal.
  const attentionLabelRef = useRef(attentionLabel);
  const urgentLabelRef = useRef(urgentLabel);
  useEffect(() => {
    attentionLabelRef.current = attentionLabel;
    urgentLabelRef.current = urgentLabel;
  }, [attentionLabel, urgentLabel]);
  // Contactos cuyo handoff fue iniciado por este agente -> no sonar campanita.
  const suppressChime = useRef<Set<string>>(new Set());

  // Agrega/quita una label automática de la lista según un flag.
  function toggleLabelIn(
    current: Label[],
    label: Label | null,
    on: boolean,
  ): Label[] {
    if (!label) return current;
    const has = current.some((l) => l.id === label.id);
    if (on && !has) return [...current, label];
    if (!on && has) return current.filter((l) => l.id !== label.id);
    return current;
  }

  // Refleja las labels automáticas (atención + urgente). Lee de refs para no
  // quedar con closures viejas en el handler de realtime.
  function withAutoLabels(
    current: Label[],
    handoff: boolean,
    urgent: boolean,
  ): Label[] {
    let next = toggleLabelIn(current, attentionLabelRef.current, handoff);
    next = toggleLabelIn(next, urgentLabelRef.current, urgent && handoff);
    return next;
  }

  // ---- Realtime: altas/cambios/bajas de contactos del tenant --------------
  useEffect(() => {
    const channel = supabase
      .channel(`contacts-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contacts",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as Contact).id;
            setContacts((prev) => prev.filter((c) => c.id !== id));
            return;
          }

          const row = payload.new as Contact;
          const prevContact = contactsRef.current.find((c) => c.id === row.id);
          const wasHandoff = prevContact ? isHandoff(prevContact) : false;
          const nowHandoff = isHandoff(row);
          const nowUrgent = isUrgent(row);

          // Transición a handoff -> campanita (salvo que lo haya iniciado el agente).
          if (nowHandoff && !wasHandoff) {
            if (suppressChime.current.has(row.id)) {
              suppressChime.current.delete(row.id);
            } else {
              playAttentionChime();
            }
          }

          setContacts((prev) => {
            const existing = prev.find((c) => c.id === row.id);
            const baseLabels = existing ? existing.labels : [];
            const nextLabels = withAutoLabels(baseLabels, nowHandoff, nowUrgent);
            if (existing) {
              return prev.map((c) =>
                c.id === row.id ? { ...c, ...row, labels: nextLabels } : c,
              );
            }
            return [{ ...row, labels: nextLabels }, ...prev];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, tenantId]);

  // ---- Handoff: tomar/soltar control desde el CRM -------------------------
  async function onToggleHandoff(contact: ContactWithLabels, on: boolean) {
    if (on) suppressChime.current.add(contact.id);
    // Optimista: columna handoff + reset de sesión al reactivar + labels.
    setContacts((prev) =>
      prev.map((c) => {
        if (c.id !== contact.id) return c;
        const fs = readFlowState(c);
        const nextFs = on
          ? fs
          : { ...fs, current_menu: null, muted_date: null, urgent: false };
        return {
          ...c,
          handoff: on,
          flow_state: nextFs,
          // Tomar control manual: marca atención, no urgencia. Reactivar: limpia ambas.
          labels: withAutoLabels(c.labels, on, false),
        };
      }),
    );
    const res = await setHandoff(contact.id, on);
    if (!res.ok) {
      toast.error(res.error);
      if (on) suppressChime.current.delete(contact.id);
    } else {
      toast.success(on ? "Tomaste el control del chat" : "Bot reactivado");
    }
  }

  // ---- Mutaciones (RLS via sesion del usuario) ----------------------------
  const patchLocal = (id: string, patch: Partial<ContactWithLabels>) =>
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );

  async function updateField(
    id: string,
    patch: Partial<Pick<Contact, "name" | "needs" | "status">>,
  ) {
    const prevContact = contacts.find((c) => c.id === id);
    patchLocal(id, patch);
    const { error } = await supabase.from("contacts").update(patch).eq("id", id);
    if (error) {
      toast.error("No se pudo guardar el cambio");
      // Rollback por-campo: revierte solo las claves tocadas (no pisa updates
      // de realtime que hayan llegado entremedio).
      if (prevContact) {
        const revert = Object.fromEntries(
          Object.keys(patch).map((k) => [k, prevContact[k as keyof typeof prevContact]]),
        ) as Partial<ContactWithLabels>;
        patchLocal(id, revert);
      }
    }
  }

  const onRename = (id: string, name: string) =>
    updateField(id, { name: name.trim() || null });
  const onNeeds = (id: string, needs: string) =>
    updateField(id, { needs: needs.trim() || null });
  const onStatus = (id: string, status: Status) => updateField(id, { status });

  async function onToggleLabel(contact: ContactWithLabels, label: Label) {
    const assigned = contact.labels.some((l) => l.id === label.id);
    const nextLabels = assigned
      ? contact.labels.filter((l) => l.id !== label.id)
      : [...contact.labels, label];
    patchLocal(contact.id, { labels: nextLabels });

    const { error } = assigned
      ? await supabase
          .from("contact_labels")
          .delete()
          .eq("contact_id", contact.id)
          .eq("label_id", label.id)
      : await supabase
          .from("contact_labels")
          .insert({ contact_id: contact.id, label_id: label.id });

    if (error) {
      toast.error("No se pudo actualizar la label");
      patchLocal(contact.id, { labels: contact.labels });
    }
  }

  function openContact(contact: ContactWithLabels) {
    setSelected(contact);
    setSheetOpen(true);
  }

  // ---- Filtrado -----------------------------------------------------------
  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const fromTs = filters.from ? new Date(filters.from).getTime() : null;
    const toTs = filters.to
      ? new Date(filters.to).getTime() + 24 * 60 * 60 * 1000 - 1
      : null;

    return contacts.filter((c) => {
      if (q) {
        const hay = `${c.name ?? ""} ${c.phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.status !== "all" && normalizeStatus(c.status) !== filters.status) {
        return false;
      }
      if (filters.labelIds.length > 0) {
        const ids = new Set(c.labels.map((l) => l.id));
        if (!filters.labelIds.some((id) => ids.has(id))) return false;
      }
      if (fromTs || toTs) {
        const ts = c.last_message_at
          ? new Date(c.last_message_at).getTime()
          : null;
        if (ts === null) return false;
        if (fromTs && ts < fromTs) return false;
        if (toTs && ts > toTs) return false;
      }
      return true;
    });
  }, [contacts, filters]);

  // mantener el contacto abierto sincronizado con el estado
  const selectedLive = selected
    ? contacts.find((c) => c.id === selected.id) ?? selected
    : null;

  return (
    <div className="flex h-screen flex-col lg:flex-row">
      <aside className="shrink-0 border-b bg-background lg:w-64 lg:border-b-0 lg:border-r">
        <FiltersSidebar filters={filters} labels={labels} onChange={setFilters} />
      </aside>

      <section className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Contactos</h1>
          <span className="text-sm text-muted-foreground">
            {visible.length} de {contacts.length}
          </span>
        </div>

        {visible.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            No hay contactos que coincidan con los filtros.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visible.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                allLabels={labels}
                onOpen={openContact}
                onRename={onRename}
                onNeeds={onNeeds}
                onStatus={onStatus}
                onToggleLabel={onToggleLabel}
              />
            ))}
          </div>
        )}
      </section>

      <ConversationSheet
        contact={selectedLive}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onToggleHandoff={onToggleHandoff}
      />
    </div>
  );
}
