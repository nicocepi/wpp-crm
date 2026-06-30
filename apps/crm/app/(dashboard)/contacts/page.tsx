import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import type { ContactWithLabels, Label } from "@/lib/types";
import { ContactsView } from "@/components/contacts/contacts-view";

export const dynamic = "force-dynamic";

type ContactRow = ContactWithLabels & {
  contact_labels?: { labels: Label | null }[];
};

export default async function ContactsPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) return null; // el layout ya maneja este caso

  const supabase = await createClient();

  // Filtro explicito por tenant: con RLS de admin (OR is_admin) la consulta
  // traeria todos los tenants; aca queremos solo el tenant actual.
  const [{ data: contactsData }, { data: labelsData }] = await Promise.all([
    supabase
      .from("contacts")
      .select("*, contact_labels(labels(*))")
      .eq("tenant_id", tenant.id)
      .order("last_message_at", { ascending: false, nullsFirst: false }),
    supabase.from("labels").select("*").eq("tenant_id", tenant.id).order("name"),
  ]);

  const contacts: ContactWithLabels[] = (
    (contactsData ?? []) as ContactRow[]
  ).map((c) => ({
    ...c,
    labels: (c.contact_labels ?? [])
      .map((cl) => cl.labels)
      .filter((l): l is Label => Boolean(l)),
  }));

  const labels: Label[] = labelsData ?? [];

  return (
    <ContactsView
      tenantId={tenant.id}
      initialContacts={contacts}
      labels={labels}
    />
  );
}
