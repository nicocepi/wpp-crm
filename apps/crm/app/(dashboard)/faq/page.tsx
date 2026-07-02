import { ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

// Contenido estático compartido por todos los tenants: reglas esenciales de
// WhatsApp Cloud API para no perder el número + buen uso de la plataforma.

const GOLDEN = [
  "Respondé solo DENTRO de las 24 horas del último mensaje del cliente. Fuera de ese plazo, WhatsApp solo permite plantillas aprobadas por Meta.",
  "Escribí únicamente a quien te contactó primero o te dio permiso explícito de recibirte por WhatsApp. Nunca uses listas compradas.",
  "Nada de envíos masivos a contactos fríos: es la forma más rápida de que te reporten y te limiten el número.",
  "Sé relevante y no abuses de la frecuencia. Cada bloqueo o reporte de spam baja la calidad de tu número.",
  "Respondé rápido: tomá el control del chat (handoff) para no dejar a nadie esperando.",
  "Mantené los bloqueos y reportes bien bajos (idealmente menos del 2-3%). Es lo que decide si podés seguir escribiendo.",
];

type QA = { q: string; a: string };

const AVOID_BAN: QA[] = [
  {
    q: "¿Por qué WhatsApp podría limitar o banear mi número?",
    a: "Meta mide la “calidad” de tu número según cuánta gente te bloquea, te reporta como spam o no interactúa. Si muchos te bloquean/reportan, tu calidad baja, se te limita cuántos mensajes podés enviar y, en casos graves, se suspende el número. La causa más común de problemas es escribir a gente que no te pidió nada o mandar mensajes masivos.",
  },
  {
    q: "¿Qué es la “ventana de 24 horas”?",
    a: "Es el período en el que podés responder libremente. Empieza cada vez que el cliente te escribe y dura 24 horas desde su último mensaje. Dentro de esa ventana escribís lo que quieras (texto, imágenes, PDF). Pasadas las 24 horas, WhatsApp solo permite enviar plantillas aprobadas por Meta. El CRM ya respeta esto: si intentás responder fuera de ventana, el mensaje no se envía y queda registrado como fallido.",
  },
  {
    q: "¿Cómo le escribo a alguien fuera de las 24 horas?",
    a: "Solo con una plantilla de mensaje (template) previamente aprobada por Meta (por ejemplo, un aviso o recordatorio). No se puede iniciar una conversación fuera de ventana con texto libre. El envío de plantillas todavía no está habilitado en el CRM (está en el roadmap).",
  },
  {
    q: "¿A quién puedo escribirle? (opt-in)",
    a: "Solo a personas que te escribieron primero o que dieron su consentimiento explícito para recibir mensajes tuyos por WhatsApp (por ejemplo, marcaron una casilla o te dejaron su número para ese fin). No importás contactos de otras fuentes ni comprás bases: eso dispara bloqueos y reportes.",
  },
  {
    q: "¿Qué es la calidad del número (verde / amarillo / rojo)?",
    a: "Es un semáforo que Meta le asigna a tu número según bloqueos, reportes y engagement en los últimos días. Verde = saludable. Amarillo = advertencia. Rojo = en riesgo. En rojo no te suben los límites y tenés que corregir el comportamiento. Podés verlo en el WhatsApp Manager de Meta.",
  },
  {
    q: "¿Cuántos mensajes puedo enviar por día?",
    a: "Depende de tu “tier”: 250 clientes/día si no verificaste el negocio, y luego 1.000 → 10.000 → 100.000 → ilimitado a medida que mantenés buena calidad y volumen. Para pasar de 250 tenés que verificar tu negocio en Meta Business. Importante: desde octubre 2025 el límite se comparte entre todos los números del mismo Business Portfolio.",
  },
  {
    q: "¿Cómo evito que me reporten como spam?",
    a: "Escribí solo a quien te pidió contacto, con mensajes útiles y esperados. No repitas envíos ni satures. Si vas a llegar a muchos, empezá gradualmente por tus contactos más comprometidos, no por una lista fría enorme de golpe. Mantené la tasa de bloqueos por debajo de ~2-3%.",
  },
  {
    q: "¿Qué contenido está prohibido?",
    a: "Todo lo que viole las políticas de Meta (Commerce Policy, Business Messaging Policy y Acceptable Use): productos ilegales, drogas, armas, tabaco/alcohol sin restricción, contenido sexual, estafas, y pedir datos sensibles innecesarios (contraseñas, datos de tarjeta completos, etc.). Ante la duda, no lo mandes.",
  },
  {
    q: "¿Qué hago si mi número quedó en amarillo o rojo?",
    a: "Bajá la frecuencia de envíos, escribí solo a contactos que interactúan, depurá a los que no responden y evitá cualquier envío masivo por unos días. La calidad se recupera sola si el comportamiento mejora. No intentes “forzar” volumen en ese estado: empeora la situación.",
  },
];

const GOOD_USE: QA[] = [
  {
    q: "¿Para qué sirve “tomar el control” (handoff)?",
    a: "Cuando el cliente necesita atención humana, tocás “Tomar control” y el bot se pausa: respondés vos desde el chat. Al terminar, “Reactivar bot” devuelve la conversación al flujo automático. Responder rápido y no dejar mensajes sin contestar mejora tu calidad y la experiencia del cliente.",
  },
  {
    q: "¿Puedo enviar imágenes y PDF?",
    a: "Sí, desde el chat con el botón de clip 📎: imágenes (hasta 5 MB) y PDF (hasta 16 MB). También recibís y ves las imágenes, PDF y audios que te manda el cliente. Todo dentro de la ventana de 24 horas.",
  },
  {
    q: "¿El bot me ayuda a no perder el número?",
    a: "Sí: responde al instante (mejor engagement), respeta la ventana de 24 horas automáticamente y deriva a un agente cuando hace falta. Eso mantiene conversaciones sanas y bien calificadas. Igual, el buen criterio humano en el handoff es clave.",
  },
  {
    q: "¿Importa el nombre y el perfil del negocio?",
    a: "Sí. Un nombre para mostrar aprobado y un perfil completo (foto, descripción, horarios) generan confianza: la gente te reconoce, te bloquea menos y responde más. Identificate siempre como tu empresa al iniciar la conversación.",
  },
  {
    q: "¿Puedo comprar o importar listas de contactos para escribirles?",
    a: "No. Escribir a gente que no dio consentimiento es la vía más rápida a reportes de spam, caída de calidad y bloqueo del número. Construí tu base con opt-in real (gente que te deja su número para que la contactes).",
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Preguntas frecuentes</h1>
        <p className="text-sm text-muted-foreground">
          Buen uso de WhatsApp para no perder el número y aprovechar la
          plataforma.
        </p>
      </div>

      {/* Reglas de oro */}
      <div className="mb-8 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <ShieldCheck className="h-4 w-4" /> Reglas de oro para no perder el
          número
        </div>
        <ul className="ml-1 list-disc space-y-1.5 pl-4 text-sm text-emerald-900">
          {GOLDEN.map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ul>
      </div>

      <Section title="Evitar el bloqueo o baneo del número" items={AVOID_BAN} />
      <Section title="Buen uso de la plataforma" items={GOOD_USE} />

      <p className="mt-8 text-xs text-muted-foreground">
        Basado en las políticas de WhatsApp Business Platform (Cloud API):
        Business Messaging Policy, Commerce Policy y Acceptable Use, y en los
        límites de mensajería y calidad vigentes de Meta.
      </p>
    </div>
  );
}

function Section({ title, items }: { title: string; items: QA[] }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
        {title}
      </h2>
      <div className="divide-y rounded-lg border bg-background">
        {items.map((it, i) => (
          <details key={i} className="group px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
              {it.q}
              <span className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {it.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
