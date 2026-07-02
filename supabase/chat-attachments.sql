-- ============================================================================
-- WhatsApp CRM — ADJUNTOS EN EL CHAT (PDF / imágenes / audios)
-- Correr en Supabase -> SQL Editor, DESPUES de impersonation-rls.sql
-- (paso #12 del orden canónico; ver MIGRATIONS.md). Idempotente.
--
-- Permite:
--  - Enviar PDF/imágenes desde el CRM al cliente (el agente adjunta).
--  - Recibir y mostrar PDF/imágenes/audios que manda el cliente (n8n los baja
--    de Meta y los sube al bucket).
--
-- Los archivos viven en el bucket PRIVADO `chat-attachments`. En `messages`
-- se guarda solo el PATH (no una URL pública); el CRM firma una URL temporal
-- on-demand para verlos, y para enviar a Meta se usa una URL firmada corta.
-- ============================================================================

-- 1) Columnas de media en messages (aditivas, nullable).
alter table public.messages
  add column if not exists media_url text,        -- path en el bucket chat-attachments (NO url pública)
  add column if not exists media_mime text,       -- ej image/png, application/pdf, audio/ogg
  add column if not exists media_filename text;    -- nombre original (documentos)

-- 2) Bucket privado para los adjuntos.
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

-- 3) Storage RLS. El path es {tenant_id}/{archivo}, así que el primer segmento
--    identifica al tenant. Reusa los helpers de RLS (incluye impersonación: el
--    admin impersonando queda acotado al tenant, igual que en las tablas).
--    n8n sube la media entrante con service role (bypassa RLS), así que su
--    escritura no depende de estas policies.

-- 3a) LEER (firmar URL) los objetos del propio tenant.
drop policy if exists "chat_attachments_read" on storage.objects;
create policy "chat_attachments_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (
      (storage.foldername(name))[1] = public.current_tenant_id()::text
      or (public.is_admin() and not public.is_impersonating())
    )
  );

-- 3b) SUBIR adjuntos solo bajo la carpeta del propio tenant (el agente adjunta
--     desde el CRM con su sesión; NO se usa service role en el flujo del member).
drop policy if exists "chat_attachments_insert" on storage.objects;
create policy "chat_attachments_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );
