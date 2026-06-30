# Roles y vistas de admin

Control de acceso por rol y secciones exclusivas del admin (supervisión multi-tenant).

## Modelo de roles
- `profiles.role` ∈ `member` | `admin` (default `member`). DDL en `supabase/admin.sql` (reflejado en `schema.sql`).
- Helper SQL **`is_admin()`** (SECURITY INVOKER, lee la propia fila de `profiles`; sin recursión, igual que `current_tenant_id()`).
- Las policies RLS de `tenants`, `contacts`, `messages`, `labels`, `contact_labels`, `bot_configs`, `failed_messages` agregan **`OR is_admin()`** → el admin lee/edita **todos los tenants** con su sesión anon, **sin** meter service role en el CRM.
- `profiles_self` NO se modifica (evita recursión). Admin marcado por email en `admin.sql`.

> ⚠️ Hay que **correr `supabase/admin.sql`** en el SQL Editor (el MCP sigue caído). Antes de correrlo, el CRM asume `member` (no rompe: `getCurrentProfile` hace `select("*")`).

## CRM (Next.js)
- `lib/tenant.ts`: `getCurrentProfile()` → `{ userId, role, tenant }`, `isAdmin()`. `getCurrentTenant()` delega en él.
- **Nav según rol** (`layout.tsx` + `sidebar-nav.tsx`):
  - **member** → solo **Contactos**.
  - **admin** → **Contactos, Tenants, Estadísticas**.
- **Ruteo por rol**: `app/page.tsx` redirige admin→`/tenants`, member→`/contacts`; el middleware manda el login a `/`.
- **Contactos** filtra explícito por `tenant_id` (la RLS abierta del admin si no, mezclaría tenants).
- **Rutas admin** bajo route group `app/(dashboard)/(admin)/` con `layout.tsx` que redirige a `/contacts` si `!isAdmin()` (defensa + RLS):
  - `/tenants` — cards por tenant (nombre, número, modo IA/menú, bot on/off, #contactos, #necesita-agente, #urgentes) + Configurar / Estadísticas.
  - `/tenants/[tenantId]/settings` — reusa `BotConfigForm` (con `tenantId`). `saveBotConfig` acepta `tenant_id` y valida `isAdmin() || tenant propio`.
  - `/stats` — KPIs globales + tabla por tenant (volumen, atención humana, estado del bot, actividad reciente).
- **Configuración** dejó de ser ítem suelto: `/settings` ahora solo redirige (admin→/tenants, member→/contacts).
- KPIs calculados en `lib/admin-stats.ts` (`getTenantStats()`): agregación de contactos en JS + `count head` de mensajes/fallidos por tenant.

## Admin sin tenant
El admin **no pertenece a ningún tenant**: `profiles.tenant_id` pasó a ser **nullable** (`supabase/users-admin.sql`) y el admin queda con `tenant_id = null`. El layout permite admin sin tenant (nav = Tenants + Estadísticas, sin Contactos); un **member** sin tenant sí ve el aviso de "sin tenant asignado".

## ABM de usuarios por tenant
Desde Tenants → **Usuarios** (`/tenants/[tenantId]/users`): alta, baja y listado de los usuarios de ese tenant.
- Requiere operaciones de **Auth admin** (crear/borrar usuarios) → imposible con anon key. Se usa un **cliente service role** server-only: `lib/supabase/admin.ts` (`createAdminClient`), con la env `SUPABASE_SERVICE_ROLE_KEY` en el CRM.
- Acciones en `.../users/actions.ts`, **todas con guard `isAdmin()`** (defensa además del route group):
  - `createTenantUser(tenantId, email)`: crea el usuario de Auth (`email_confirm`, login por magic link) o reusa el existente, y lo asocia como `member` del tenant (`profiles` upsert).
  - `deleteTenantUser(tenantId, userId)`: borra el usuario de Auth (cascade borra el profile).
- UI: `users-manager.tsx` (client) con alta inline + borrar; no permite borrarse a uno mismo.

## Impersonación ("Ingresar como un tenant")
El admin puede **ver/usar lo mismo que un member** de un tenant, sin forjar sesión de Auth:
- Cookie httpOnly **`act_as_tenant`** (8h) seteada por `impersonateTenant` (Tenants → "Ingresar como"). `stopImpersonating` la borra.
- `getCurrentProfile()` (solo si `role==='admin'`) usa esa cookie como **tenant efectivo** y marca `impersonating=true`. Si un member forjara la cookie, se ignora (no es admin).
- En modo impersonación el CRM muestra la **vista member** (nav Contactos) + un **banner** "Estás viendo como X · Salir". Los writes funcionan porque la RLS del admin (`OR is_admin()`) ya permite todo.
- Seguro: no hay swap de sesión; es un "scoping" de la UI al tenant elegido.

## Publicación en GitHub
Repo: **https://github.com/nicocepi/wpp-crm** (rama `main`). El `.gitignore` excluye `.env*`, `permanent-token-WA.txt`, `ruvector.db`, `node_modules`, `.next/`, `dist/`, y tooling local (`.agents/`, `skills-lock.json`, `.claude/`). Se incluye la bóveda `obsidian/`. Verificado: ningún secreto real en el árbol.
