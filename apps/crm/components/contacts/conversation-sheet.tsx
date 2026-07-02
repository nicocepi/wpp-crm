"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Phone,
  Send,
  UserCheck,
  Bot,
  Paperclip,
  X,
  FileText,
  Lock,
} from "lucide-react";
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
import {
  isHandoff,
  isOwnedByMe,
  isTaken,
  type ContactWithLabels,
  type Message,
} from "@/lib/types";
import {
  sendAgentMessage,
  sendAgentAttachment,
} from "@/app/(dashboard)/contacts/actions";

const ATTACH_BUCKET = "chat-attachments";
const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";

export function ConversationSheet({
  contact,
  open,
  onOpenChange,
  onToggleHandoff,
  currentUserId,
  canOverride,
}: {
  contact: ContactWithLabels | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleHandoff: (contact: ContactWithLabels, on: boolean) => Promise<void>;
  currentUserId: string;
  canOverride: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [togglingHandoff, setTogglingHandoff] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  // path del bucket -> URL firmada para mostrar la media.
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handoff = contact ? isHandoff(contact) : false;
  // Ownership de la conversación.
  const owned = contact ? isOwnedByMe(contact, currentUserId) : false;
  const taken = contact ? isTaken(contact) : false;
  const takenByOther = taken && !owned;
  const lockedForMe = takenByOther && !canOverride;
  // Para ESCRIBIR hay que ser el dueño (también el admin: primero toma el
  // control). El override solo habilita tomar/liberar ajenas, no escribir.
  const canCompose = owned;

  // Firma las URLs de los mensajes con media que aún no estén en cache.
  const ensureSignedUrls = useCallback(async (msgs: Message[]) => {
    const paths = msgs
      .map((m) => m.media_url)
      .filter((p): p is string => !!p);
    setMediaUrls((prev) => {
      const missing = paths.filter((p) => !prev[p]);
      if (missing.length === 0) return prev;
      const supabase = createClient();
      // Firma en paralelo y mergea al terminar (fuera del setState).
      Promise.all(
        missing.map(async (p) => {
          const { data } = await supabase.storage
            .from(ATTACH_BUCKET)
            .createSignedUrl(p, 3600);
          return [p, data?.signedUrl] as const;
        }),
      ).then((pairs) => {
        const add: Record<string, string> = {};
        for (const [p, url] of pairs) if (url) add[p] = url;
        if (Object.keys(add).length > 0)
          setMediaUrls((cur) => ({ ...cur, ...add }));
      });
      return prev;
    });
  }, []);

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
        if (data) ensureSignedUrls(data);
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
          if (msg.media_url) ensureSignedUrls([msg]);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [contact, open, ensureSignedUrls]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!contact || sending) return;
    if (!file && !draft.trim()) return;
    // try/finally: `sending` siempre se resetea, aunque la action falle
    // (evita que el botón quede trabado en disabled).
    setSending(true);
    try {
      // Con archivo: enviar adjunto (el texto va como caption). Sin archivo: texto.
      if (file) {
        const fd = new FormData();
        fd.set("file", file);
        if (draft.trim()) fd.set("caption", draft.trim());
        const res = await sendAgentAttachment(contact.id, fd);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setDraft("");
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (res.message) {
          const msg = res.message;
          if (msg.media_url && res.signedUrl) {
            setMediaUrls((cur) => ({ ...cur, [msg.media_url!]: res.signedUrl! }));
          }
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
          );
        }
        return;
      }

      const res = await sendAgentMessage(contact.id, draft);
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
    } catch {
      toast.error("No se pudo enviar. Probá de nuevo.");
    } finally {
      setSending(false);
    }
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f) {
      const okType = /^(image\/(png|jpeg|webp)|application\/pdf)$/.test(f.type);
      if (!okType) {
        toast.error("Formato no soportado (PNG, JPG, WEBP o PDF)");
        e.target.value = "";
        return;
      }
    }
    setFile(f);
  }

  async function handleToggleHandoff() {
    if (!contact || togglingHandoff) return;
    setTogglingHandoff(true);
    // Si la tengo yo -> liberar; si no -> tomar (claim; el admin puede forzar).
    await onToggleHandoff(contact, !owned);
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
              {lockedForMe ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled
                  className="shrink-0 gap-1"
                >
                  <Lock className="h-3.5 w-3.5" /> Atendido por{" "}
                  {contact.handoff_by_name ?? "un agente"}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant={owned ? "default" : "outline"}
                  onClick={handleToggleHandoff}
                  disabled={togglingHandoff}
                  className="shrink-0 gap-1"
                >
                  {owned ? (
                    <>
                      <Bot className="h-3.5 w-3.5" /> Reactivar bot
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-3.5 w-3.5" /> Tomar control
                    </>
                  )}
                </Button>
              )}
            </SheetHeader>

            {owned && (
              <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-800">
                Estás atendiendo este chat. El bot está en pausa hasta que
                reactivés.
              </div>
            )}
            {takenByOther && (
              <div className="border-b bg-zinc-100 px-4 py-2 text-xs text-zinc-600">
                Lo está atendiendo{" "}
                <strong>{contact.handoff_by_name ?? "otro agente"}</strong>.{" "}
                {canOverride ? "Podés tomar el control." : "Solo lectura."}
              </div>
            )}
            {handoff && !taken && (
              <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-800">
                Necesita agente. Tomá el control para responder.
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
                const url = m.media_url ? mediaUrls[m.media_url] : undefined;
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
                        "max-w-[80%] overflow-hidden whitespace-pre-wrap rounded-2xl text-sm",
                        m.media_url ? "p-1" : "px-3 py-2",
                        outbound
                          ? "rounded-br-sm bg-primary text-primary-foreground"
                          : "rounded-bl-sm bg-muted text-foreground",
                      )}
                    >
                      <MessageBody message={m} url={url} />
                    </div>
                    <span className="mt-0.5 text-[10px] text-muted-foreground">
                      {shortTime(m.sent_at)}
                    </span>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {!canCompose ? (
              <div className="border-t px-4 py-3 text-center text-xs text-muted-foreground">
                {lockedForMe
                  ? `Solo lectura — la está atendiendo ${contact.handoff_by_name ?? "otro agente"}.`
                  : "Tomá el control para responder."}
              </div>
            ) : (
            <div className="border-t p-3">
              {file && (
                <div className="mb-2 flex items-center gap-2 rounded-md border bg-muted/50 px-2 py-1.5 text-xs">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {(file.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="shrink-0 rounded p-0.5 hover:bg-muted"
                    aria-label="Quitar adjunto"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT}
                  onChange={onPickFile}
                  className="hidden"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                  className="shrink-0"
                  aria-label="Adjuntar archivo"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
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
                  placeholder={
                    file ? "Agregá un texto (opcional)..." : "Escribí una respuesta..."
                  }
                  className="max-h-32 min-h-[40px] resize-none"
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={handleSend}
                  disabled={sending || (!draft.trim() && !file)}
                  className="shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Enter envía · Shift+Enter nueva línea · 📎 imágenes o PDF. Sujeto a
                la ventana de 24h de WhatsApp.
              </p>
            </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Cuerpo de una burbuja: media (imagen/pdf/audio) o texto. */
function MessageBody({ message: m, url }: { message: Message; url?: string }) {
  const mime = m.media_mime ?? "";
  const isMedia = !!m.media_url;
  const isImage = m.message_type === "image" || mime.startsWith("image/");
  const isAudio = m.message_type === "audio" || mime.startsWith("audio/");
  // Caption real: quita el placeholder del inbound ("[imagen]", "[audio]",
  // "[documento]") y deja solo el texto que haya escrito el usuario.
  const caption = (m.content ?? "")
    .replace(/^\[(imagen|audio|documento)\]\s*/i, "")
    .trim();

  if (isMedia && !url) {
    // Firmando la URL (o sin permiso): placeholder.
    return (
      <div className="px-2 py-1.5 text-xs opacity-80">
        {isImage ? "Cargando imagen…" : isAudio ? "Cargando audio…" : "Cargando archivo…"}
      </div>
    );
  }

  if (isMedia && url && isImage) {
    return (
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <a href={url} target="_blank" rel="noreferrer">
          <img
            src={url}
            alt={caption || "imagen"}
            className="max-h-64 w-full rounded-xl object-cover"
          />
        </a>
        {caption && <p className="px-2 py-1">{caption}</p>}
      </div>
    );
  }

  if (isMedia && url && isAudio) {
    return (
      <div className="px-1 py-1">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio controls src={url} className="max-w-[240px]" />
        {caption && <p className="px-1 pt-1">{caption}</p>}
      </div>
    );
  }

  if (isMedia && url) {
    // Documento (PDF u otro): card con link + caption debajo si hay.
    return (
      <div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-2 py-1.5 underline-offset-2 hover:underline"
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {m.media_filename || "documento"}
          </span>
        </a>
        {caption && <p className="px-2 pb-1">{caption}</p>}
      </div>
    );
  }

  // Texto plano.
  return <>{m.content}</>;
}
