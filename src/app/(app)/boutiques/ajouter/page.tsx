import Link from "next/link";
import { ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react";
import { JumiaShopOnboarding } from "@/components/jumia-shop-onboarding";
import { ShopCreateForm } from "@/components/shop-create-form";

/**
 * « Ajouter une boutique Jumia ».
 *
 * Le parcours complet tient dans cette page :
 * 1. le guide « Self Authorization » (Vendor Center) ;
 * 2. la saisie des identifiants, vérifiés **par Jumia** côté serveur ;
 * 3. le choix de la boutique parmi celles que Jumia autorise ;
 * 4. la synchronisation initiale des commandes sur une période choisie.
 *
 * Aucun identifiant n'est demandé en clair dans le code : le formulaire vit
 * dans les composants clients, la vérification et le chiffrement sont côté
 * serveur.
 */
export default function AjouterBoutiqueJumiaPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/boutiques"
          className="focusable inline-flex items-center gap-1.5 text-xs text-muted hover:text-night"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Toutes les boutiques
        </Link>
        <h1 className="mt-3 text-2xl font-semibold text-night">Ajouter une boutique Jumia</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Rattachez une boutique de votre compte vendeur Jumia. L&apos;identifiant de la boutique
          vient de Jumia : vous le choisissez dans la liste, vous ne le saisissez pas. Les
          permissions sont vérifiées côté serveur.
        </p>
      </div>

      <section className="card p-5" aria-labelledby="guide-self-authorization">
        <h2 id="guide-self-authorization" className="text-sm font-semibold text-night">
          Guide — créer une application « Self Authorization » dans Jumia Vendor Center
        </h2>
        <ol className="mt-3 space-y-2 text-sm text-muted">
          <li>
            <strong className="text-night">1.</strong> Connectez-vous à{" "}
            <a
              href="https://vendorcenter.jumia.com"
              target="_blank"
              rel="noreferrer noopener"
              className="focusable inline-flex items-center gap-1 text-primary-600 underline"
            >
              Vendor Center
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>{" "}
            puis <strong className="text-night">Paramètres → Applications</strong>.
          </li>
          <li>
            <strong className="text-night">2.</strong> Créez une application et choisissez le type
            d&apos;autorisation <strong className="text-night">« Self Authorization »</strong>{" "}
            (autorisation propre). C&apos;est ce type qui permet à une application serveur de lire
            les données sans intervention humaine à chaque appel.
          </li>
          <li>
            <strong className="text-night">3.</strong> Utilisez « Generate Token » pour obtenir le{" "}
            <strong className="text-night">Client ID</strong> et le{" "}
            <strong className="text-night">Refresh Token</strong>.
          </li>
          <li>
            <strong className="text-night">4.</strong> Collez ces deux valeurs dans le formulaire
            ci-dessous.
          </li>
        </ol>

        <div className="mt-4 rounded-lg border border-border bg-surface px-4 py-3">
          <p className="flex items-start gap-2 text-sm text-night">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            <span>
              <strong className="text-night">Aucun « client secret » n&apos;est demandé.</strong>{" "}
              Une application Self Authorization n&apos;en a pas : seuls le Client ID et le Refresh
              Token sont utilisés.
            </span>
          </p>
          <p className="mt-2 text-xs text-muted">
            Ces identifiants sont envoyés au serveur, vérifiés par Jumia (un identifiant erroné ou
            un token expiré est refusé avec sa cause), puis stockés{" "}
            <strong className="text-night">chiffrés (AES-256-GCM)</strong>. Ils ne sont jamais
            renvoyés au navigateur, jamais écrits dans les journaux et jamais exportés. Le Refresh
            Token tourne à chaque appel Jumia : sa rotation est gérée automatiquement, et son
            expiration est signalée (« reconnecter »).
          </p>
        </div>
      </section>

      <JumiaShopOnboarding />

      <section className="card p-5" aria-labelledby="boutique-sans-jumia">
        <h2 id="boutique-sans-jumia" className="text-sm font-semibold text-night">
          Créer une boutique sans connexion Jumia
        </h2>
        <p className="mt-2 text-sm text-muted">
          Pour une boutique suivie ailleurs (place de marché, import manuel), vous pouvez créer une
          fiche sans identifiants Jumia. Elle restera sans données réelles tant qu&apos;aucune
          synchronisation n&apos;est possible.
        </p>
        <div className="mt-4">
          <ShopCreateForm idPrefix="ajouter-shop" />
        </div>
      </section>
    </div>
  );
}
