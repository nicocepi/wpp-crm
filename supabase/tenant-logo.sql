-- ============================================================================
-- WhatsApp CRM — LOGO POR TENANT
-- Correr en Supabase -> SQL Editor.
--
-- Guarda la URL publica del logo del tenant (el archivo vive en el bucket
-- de Storage "tenant-logos", publico). La subida la hace el admin desde la
-- configuracion del tenant.
-- ============================================================================

alter table public.tenants
  add column if not exists logo_url text;

-- Nota: el bucket "tenant-logos" (publico) se crea via Storage API/Dashboard.
-- Si preferis crearlo por SQL:
--   insert into storage.buckets (id, name, public)
--   values ('tenant-logos','tenant-logos', true)
--   on conflict (id) do nothing;
