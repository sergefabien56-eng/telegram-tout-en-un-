import { permanentRedirect } from "next/navigation";

/**
 * Ancienne adresse « Factures originales ».
 *
 * La page a été relogée sous la rubrique « À traiter » (rubrique B), puis
 * **renommée** en « Étiquettes à imprimer » : l'API Vendor Center ne fournit
 * pas de factures, mais elle fournit les étiquettes d'expédition.
 *
 * Rien n'est supprimé : l'ancienne adresse répond par une redirection
 * permanente vers la nouvelle.
 */
export default function FacturesRedirect() {
  permanentRedirect("/commandes/a-traiter/etiquettes");
}
