"use client";

import { useEffect, useRef, useState } from "react";
import { Phone, Send, UserCheck, Bot } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { initials, shortTime } from "@/lib/format";
import { isHandoff, type ContactWithLabels, type Message } from "@/lib/types";
import { sendAgentMessage } from "@/app/(dashboard)/contacts/actions";

export function ConversationSheet({
  contact,
  open,
  onOpenChange,
  onToggleHandoff,
}: {
  contact: ContactWithLabels | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleHandoff: (contact: ContactWithLabels, on: boolean) => Promise<void>;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [togglingHandoff, setTogglingHandoff] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const handoff = contact ? isHandoff(contact) : false;

  useEffect(() => {
    if (!contact || !open) return;
    const supabase = createClient();
    let active = true;

    setLoading(true);
    supabase
      .from("messages")
      .select("*")
      .eq("contact_id", contact.id)
      .order("sent_at", { ascending: true })
      .then(({ data }) => {
        if (!active) return;
        setMessages(data ?? []);
        setLoading(false);
      });

    // Realtime: nuevos mensajes de esta conversacion.
    const channel = supabase
      .channel(`conv-${contact.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `contact_id=eq.${contact.id}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
          );
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [contact, open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!contact || !draft.trim() || sending) return;
    setSending(true);
    const res = await sendAgentMessage(contact.id, draft);
    setSending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setDraft("");
    if (res.message) {
      setMessages((prev) =>
        prev.some((m) => m.id === res.message!.id) ? prev : [...prev, res.message!],
      );
    }
  }

  async function handleToggleHandoff() {
    if (!contact || togglingHandoff) return;
    setTogglingHandoff(true);
    await onToggleHandoff(contact, !handoff);
    setTogglingHandoff(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 sm:max-w-md"
      >
        {contact && (
          <>
            <SheetHeader className="flex-row items-center gap-3 space-y-0 border-b pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {initials(contact.name, contact.phone)}
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle>{contact.name ?? "Sin nombre"}</SheetTitle>
                <SheetDescription className="flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {contact.phone}
                </SheetDescription>
              </div>
              <Button
                type="button"
                size="sm"
                variant={handoff ? "default" : "outline"}
                onClick={handleToggleHandoff}
                disabled={togglingHandoff}
                className="shrink-0 gap-1"
              >
                {handoff ? (
                  <>
                    <Bot className="h-3.5 w-3.5" /> Reactivar bot
                  </>
                ) : (
                  <>
                    <UserCheck className="h-3.5 w-3.5" /> Tomar control
                  </>
                )}
              </Button>
            </SheetHeader>

            {handoff && (
              <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-800">
                Un agente está atendiendo este chat. El bot está en pausa hasta
                que reactivés.
              </div>
            )}

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {loading && (
                <p className="text-center text-sm text-muted-foreground">
                  Cargando conversacion...
                </p>
              )}
              {!loading && messages.length === 0 && (
                <p className="text-center text-sm text-muted-foreground">
                  Sin mensajes todavia.
                </p>
              )}
              {messages.map((m) => {
                const outbound = m.direction === "outbound";
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "flex flex-col",
                      outbound ? "items-end" : "items-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                        outbound
                          ? "rounded-br-sm bg-primary text-primary-foreground"
                          : "rounded-bl-sm bg-muted text-foreground",
                      )}
                    >
                      {m.content}
                    </div>
                    <span className="mt-0.5 text-[10px] text-muted-foreground">
                      {shortTime(m.sent_at)}
                    </span>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <div className="border-t p-3">
              <div className="flex items-end gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={1}
                  placeholder="Escribí una respuesta..."
                  className="max-h-32 min-h-[40px] resize-none"
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={handleSend}
                  disabled={sending || !draft.trim()}
                  className="shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Enter envía · Shift+Enter nueva línea. Sujeto a la ventana de 24h
                de WhatsApp.
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
