"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveBotConfig, type SettingsState } from "@/app/(dashboard)/settings/actions";
import type { BotConfig } from "@/lib/types";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Guardando..." : "Guardar cambios"}
    </Button>
  );
}

const initial: SettingsState = {};

const MENU_TEMPLATE = `{
  "start": "root",
  "invalid_message": "Opción no válida. Respondé con el número de una opción del menú.",
  "nodes": {
    "root": {
      "message": "¡Hola! Elegí una opción:\\n\\n1. Ventas\\n2. Soporte",
      "options": { "1": "ventas", "2": "soporte" }
    },
    "ventas": { "message": "Te derivo con ventas.", "handoff": true },
    "soporte": { "message": "Horario de soporte: L-V 9 a 18hs." }
  }
}`;

export function BotConfigForm({
  config,
  tenantId,
}: {
  config: BotConfig | null;
  tenantId?: string;
}) {
  const [state, formAction] = useFormState(saveBotConfig, initial);
  const [enabled, setEnabled] = useState(config?.enabled ?? true);
  const [flowType, setFlowType] = useState<"ai" | "menu">(
    config?.flow_type === "menu" ? "menu" : "ai",
  );

  const initialFlowJson = useMemo(() => {
    if (config?.flow_definition) {
      try {
        return JSON.stringify(config.flow_definition, null, 2);
      } catch {
        return "";
      }
    }
    return "";
  }, [config?.flow_definition]);

  const [flowJson, setFlowJson] = useState(initialFlowJson);

  useEffect(() => {
    if (state.ok) toast.success("Configuracion guardada");
    if (state.error) toast.error(state.error);
  }, [state]);

  // Valida el JSON en vivo (solo feedback visual).
  const jsonError = useMemo(() => {
    if (flowType !== "menu" || !flowJson.trim()) return null;
    try {
      JSON.parse(flowJson);
      return null;
    } catch {
      return "JSON inválido";
    }
  }, [flowType, flowJson]);

  return (
    <form action={formAction} className="space-y-6">
      {tenantId && <input type="hidden" name="tenant_id" value={tenantId} />}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label className="text-base">Bot habilitado</Label>
          <p className="text-sm text-muted-foreground">
            Responder automaticamente los mensajes entrantes.
          </p>
        </div>
        <input
          type="checkbox"
          name="enabled"
          checked={enabled}
          onChange={() => {}}
          className="hidden"
          readOnly
        />
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {/* Modo de flujo */}
      <div className="space-y-2">
        <Label>Modo del bot</Label>
        <input type="hidden" name="flow_type" value={flowType} />
        <Select
          value={flowType}
          onValueChange={(v) => setFlowType(v as "ai" | "menu")}
        >
          <SelectTrigger className="max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ai">IA (Claude responde libre)</SelectItem>
            <SelectItem value="menu">Menú guiado (árbol de opciones)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          IA: respuestas conversacionales. Menú: flujo determinístico por números.
        </p>
      </div>

      {flowType === "ai" && (
        <div className="space-y-2">
          <Label htmlFor="system_prompt">Personalidad / instrucciones</Label>
          <Textarea
            id="system_prompt"
            name="system_prompt"
            defaultValue={config?.system_prompt ?? ""}
            rows={8}
            placeholder="Sos el asistente de atencion al cliente de... Responde en espanol, breve y amable..."
          />
          <p className="text-xs text-muted-foreground">
            Se envia como system prompt a Claude (con prompt caching en n8n).
          </p>
        </div>
      )}

      {flowType === "menu" && (
        <div className="space-y-2">
          <Label htmlFor="flow_definition">Definición del flujo (JSON)</Label>
          <Textarea
            id="flow_definition"
            name="flow_definition"
            value={flowJson}
            onChange={(e) => setFlowJson(e.target.value)}
            rows={18}
            spellCheck={false}
            className="font-mono text-xs"
            placeholder={MENU_TEMPLATE}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Árbol de nodos: cada nodo tiene <code>message</code> y, si es menú,{" "}
              <code>options</code> (número → id de nodo). Acciones: <code>handoff</code>,{" "}
              <code>mute</code>.
            </p>
            {!flowJson.trim() ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setFlowJson(MENU_TEMPLATE)}
              >
                Cargar ejemplo
              </Button>
            ) : null}
          </div>
          {jsonError && (
            <p className="text-xs text-destructive">{jsonError}</p>
          )}
          {/* En modo menú no usamos system_prompt, pero lo preservamos. */}
          <input
            type="hidden"
            name="system_prompt"
            value={config?.system_prompt ?? ""}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="reply_delay_seconds">Delay de respuesta (segundos)</Label>
        <Input
          id="reply_delay_seconds"
          name="reply_delay_seconds"
          type="number"
          min={0}
          max={60}
          defaultValue={config?.reply_delay_seconds ?? 2}
          className="max-w-[140px]"
        />
        <p className="text-xs text-muted-foreground">
          Espera antes de enviar la respuesta automatica (0-60).
        </p>
      </div>

      <SaveButton />
    </form>
  );
}
