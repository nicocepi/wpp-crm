# Logo por tenant

Branding por cliente: el admin sube un logo por tenant y se muestra en el panel del member.

## Almacenamiento
- Bucket de **Supabase Storage** `tenant-logos` (**público**, límite 2MB, solo **PNG/JPG/WEBP**). Creado vía Storage API con service role.

## Seguridad (revisión)
- **SVG excluido a propósito**: un SVG servido inline desde un bucket público puede contener `<script>`/handlers → **XSS almacenado**. Solo se permiten formatos raster no ejecutables (PNG/JPG/WEBP).
- La action **valida los magic numbers** de los bytes reales (`sniffImage`) y no confía en el `content-type` del cliente; el `contentType` de subida se deriva del tipo detectado.
- El bucket también restringe `allowed_mime_types` a PNG/JPG/WEBP (defensa en profundidad).
- El archivo se guarda en `tenant-logos/{tenantId}/logo.{ext}`.
- La **URL pública** (con cache-buster `?v=timestamp`) se guarda en `tenants.logo_url`. DDL en `supabase/tenant-logo.sql` (reflejado en `schema.sql`/types).

## Subida (admin)
- En `/tenants/[tenantId]/settings` (arriba de la config del bot): componente `LogoUploader` (client) con vista previa, subir/cambiar y quitar.
- Server actions en `.../settings/logo-actions.ts`, **guardadas por `isAdmin()`**, usando el **cliente service role** (`createAdminClient`):
  - `uploadTenantLogo(tenantId, formData)`: valida tipo/tamaño, sube con `upsert`, obtiene URL pública, actualiza `tenants.logo_url`.
  - `removeTenantLogo(tenantId)`: borra los archivos del tenant en el bucket y pone `logo_url = null`.

## Visualización (member)
- En el **sidebar** del dashboard (esquina superior izquierda), en la **vista member** (member logueado o admin impersonando), se muestra `tenant.logo_url` en lugar del ícono genérico. `getCurrentProfile` ya trae `logo_url` (select `*` de tenants).
- Se usa `<img>` (URL pública externa) para evitar configurar `remotePatterns` de next/image.

## Pendiente
Correr `supabase/tenant-logo.sql` (columna `logo_url`). El bucket ya está creado.
