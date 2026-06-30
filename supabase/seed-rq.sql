-- ============================================================================
-- WhatsApp CRM — SETUP RQ Administración (modo menú)
-- Correr en Supabase -> SQL Editor. Idempotente.
-- ============================================================================

-- 1) Columnas de soporte multi-flow (aditivas; tenants existentes quedan en ai)
alter table public.bot_configs add column if not exists flow_type text not null default 'ai' check (flow_type in ('ai','menu'));
alter table public.bot_configs add column if not exists flow_definition jsonb;
alter table public.contacts add column if not exists flow_state jsonb not null default '{}'::jsonb;

-- 2) Renombrar el tenant demo -> RQ Administración
update public.tenants set name = 'RQ Administración' where id = '00000000-0000-0000-0000-0000000000a1';

-- 3) Activar modo menú + cargar el árbol del flujo de RQ
update public.bot_configs
set flow_type = 'menu',
    flow_definition = $flow${
  "start": "root",
  "invalid_message": "Opción no válida. Por favor, respondé con el número de una de las opciones del menú.",
  "nodes": {
    "root": {
      "message": "👋 ¡Hola! Bienvenido/a a RQ Administración.\nGracias por comunicarte con nosotros. Por favor, seleccioná una opción respondiendo con el número correspondiente:\n\n1. Soy proveedor\n2. Soy propietario/inquilino",
      "options": { "1": "aguarde", "2": "menu_prop" }
    },
    "menu_prop": {
      "message": "Seleccioná una opción:\n\n3. Expensas\n4. Reclamos y mantenimiento\n5. Contactos de emergencia\n6. Hablar con un representante\n7. Horarios y datos de contacto\n\n0. Volver a empezar",
      "options": {
        "3": "menu_expensas",
        "4": "menu_reclamos",
        "5": "menu_emergencias",
        "6": "aguarde",
        "7": "horarios",
        "0": "root"
      }
    },
    "menu_expensas": {
      "message": "Seleccioná una opción:\n\n8. Solicitar copia de liquidación\n9. Informar pago realizado\n\n0. Volver a empezar",
      "options": { "8": "ph_liquidacion", "9": "ph_pago", "0": "root" }
    },
    "menu_reclamos": {
      "message": "Seleccioná una opción:\n\n10. Reclamar desperfectos en espacios comunes o en tu UF\n11. Informar urgencias\n\n0. Volver a empezar",
      "options": { "10": "ph_desperfectos", "11": "ph_urgencias", "0": "root" }
    },
    "menu_emergencias": {
      "message": "Seleccioná una opción:\n\n12. Ascensores\n13. Plomería\n14. Gas\n15. Electricidad\n\n0. Volver a empezar",
      "options": {
        "12": "tel_ascensores",
        "13": "tel_plomeria",
        "14": "tel_gas",
        "15": "tel_electricidad",
        "0": "root"
      }
    },
    "aguarde": {
      "message": "Aguarde en línea y en breve será atendido.",
      "mute": true
    },
    "horarios": {
      "message": "Nuestros horarios de atención son de lunes a viernes de 10 a 16hs. Sábado y Domingo cerrado."
    },
    "ph_liquidacion": {
      "message": "[PLACEHOLDER] Solicitud de copia de liquidación. (Definir respuesta final)"
    },
    "ph_pago": {
      "message": "[PLACEHOLDER] Informar pago realizado. (Definir respuesta final)"
    },
    "ph_desperfectos": {
      "message": "[PLACEHOLDER] Reclamo de desperfectos en espacios comunes o UF. (Definir respuesta final)"
    },
    "ph_urgencias": {
      "message": "[PLACEHOLDER] Informar urgencias. (Definir respuesta final)"
    },
    "tel_ascensores": {
      "message": "🛗 Ascensores — Tel: [PLACEHOLDER +54 11 0000-0001]"
    },
    "tel_plomeria": {
      "message": "🔧 Plomería — Tel: [PLACEHOLDER +54 11 0000-0002]"
    },
    "tel_gas": {
      "message": "🔥 Gas — Tel: [PLACEHOLDER +54 11 0000-0003]"
    },
    "tel_electricidad": {
      "message": "💡 Electricidad — Tel: [PLACEHOLDER +54 11 0000-0004]"
    }
  }
}$flow$::jsonb
where tenant_id = '00000000-0000-0000-0000-0000000000a1';
