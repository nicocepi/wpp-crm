"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadTenantLogo, removeTenantLogo } from "./logo-actions";

export function LogoUploader({
  tenantId,
  logoUrl,
}: {
  tenantId: string;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(logoUrl);
  const [pending, startTransition] = useTransition();

  function onFile(file: File) {
    setPreview(URL.createObjectURL(file));
    const fd = new FormData();
    fd.append("logo", file);
    startTransition(async () => {
      const res = await uploadTenantLogo(tenantId, fd);
      if (!res.ok) {
        toast.error(res.error);
        setPreview(logoUrl);
        return;
      }
      toast.success("Logo actualizado");
      setPreview(res.url);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await removeTenantLogo(tenantId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPreview(null);
      toast.success("Logo eliminado");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Logo del cliente</p>
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Logo"
              className="h-full w-full object-contain"
            />
          ) : (
            <ImageUp className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
            >
              <ImageUp className="h-4 w-4" />
              {preview ? "Cambiar" : "Subir logo"}
            </Button>
            {preview && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={remove}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" /> Quitar
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            PNG, JPG o WEBP. Máx 2MB. Se muestra en el panel del cliente.
          </p>
        </div>
      </div>
    </div>
  );
}
