import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { ThemePicker } from "@/components/theme-picker";

export const dynamic = "force-dynamic";

/**
 * APPARENCE — le réglage d'affichage, isolé dans sa propre page.
 *
 * Le thème était accessible depuis deux endroits (barre du haut et
 * « Apparence » dans le tableau de bord) sans explication. Ici, un seul
 * endroit, avec trois choix explicites — dont « comme le système », qui
 * manquait.
 */
export default async function ApparencePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Apparence"
        description="Le rendu de l’interface. Ce réglage est propre à cet appareil : il ne change rien pour vos autres sessions."
      />

      <Section
        title="Thème"
        description="Le mode « Système » suit le réglage clair/sombre de votre téléphone ou de votre ordinateur."
      >
        <ThemePicker />
      </Section>

      <p className="text-xs text-muted">
        Le thème est enregistré dans ce navigateur uniquement. Aucun réglage n&apos;est stocké côté
        serveur, et personne d&apos;autre n&apos;est concerné par votre choix.
      </p>
    </div>
  );
}
