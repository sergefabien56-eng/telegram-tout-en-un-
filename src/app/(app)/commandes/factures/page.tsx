import { permanentRedirect } from "next/navigation";

/**
 * Ancienne adresse « Factures originales ».
 *
 * La page a été relogée sous la rubrique « À traiter » (rubrique B), sa
 * destination étant `/commandes/a-traiter/factures`. Rien n'est supprimé :
 * l'ancienne adresse répond par une redirection permanente vers la nouvelle.
 */
export default function FacturesRedirect() {
  permanentRedirect("/commandes/a-traiter/factures");
}
