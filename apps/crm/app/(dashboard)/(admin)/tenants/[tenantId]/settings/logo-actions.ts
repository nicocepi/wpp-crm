"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/tenant";
import { createAdminClient } from "@/lib/supabase/admin";

export type LogoActionResult = { ok: true; url: string } | { ok: false; error: string };

const BUCKET = "tenant-logos";
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

// Solo formatos raster (no ejecutables). SVG queda EXCLUIDO a proposito:
// un SVG servido inline desde el bucket publico puede contener <script> y
// derivar en XSS almacenado. PNG/JPG/WEBP son seguros de servir inline.
type ImgKind = "png" | "jpg" | "webp";

/** Detecta el tipo por los magic numbers (no confiar en file.type del cliente). */
function sniffImage(b: Uint8Array): ImgKind | null {
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // WEBP
  )
    return "webp";
  return null;
}

const CONTENT_TYPE: Record<ImgKind, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

/** Sube/reemplaza el logo del tenant y guarda su URL publica. Solo admin. */
export async function uploadTenantLogo(
  tenantId: string,
  formData: FormData,
): Promise<LogoActionResult> {
  if (!(await isAdmin())) return { ok: false, error: "No autorizado" };

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Elegí un archivo de imagen" };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "El logo supera 2MB" };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Valida los bytes reales, no el content-type declarado por el cliente.
  const kind = sniffImage(bytes);
  if (!kind) {
    return { ok: false, error: "Formato no soportado (PNG, JPG o WEBP)" };
  }

  const admin = createAdminClient();
  const path = `${tenantId}/logo.${kind}`;

  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: CONTENT_TYPE[kind],
    upsert: true,
  });
  if (upErr) return { ok: false, error: upErr.message };

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  // cache-buster para que el navegador tome el nuevo archivo al reemplazar.
  const url = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: dbErr } = await admin
    .from("tenants")
    .update({ logo_url: url })
    .eq("id", tenantId);
  if (dbErr) return { ok: false, error: dbErr.message };

  revalidatePath(`/tenants/${tenantId}/settings`);
  revalidatePath("/tenants");
  return { ok: true, url };
}

/** Quita el logo del tenant. Solo admin. */
export async function removeTenantLogo(
  tenantId: string,
): Promise<LogoActionResult> {
  if (!(await isAdmin())) return { ok: false, error: "No autorizado" };

  const admin = createAdminClient();
  // Borra cualquier archivo del tenant en el bucket.
  const { data: list } = await admin.storage.from(BUCKET).list(tenantId);
  if (list && list.length > 0) {
    await admin.storage
      .from(BUCKET)
      .remove(list.map((f) => `${tenantId}/${f.name}`));
  }
  const { error } = await admin
    .from("tenants")
    .update({ logo_url: null })
    .eq("id", tenantId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/tenants/${tenantId}/settings`);
  revalidatePath("/tenants");
  return { ok: true, url: "" };
}
