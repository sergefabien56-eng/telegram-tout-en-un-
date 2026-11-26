import { permanentRedirect } from "next/navigation";

/**
 * Ancienne adresse « Factures à imprimer ».
 *
 * La page a été **renommée** : l'API Jumia Vendor Center ne fournit pas de
 * factures, mais elle fournit les **étiquettes d'expédition**
 * (`POST /orders/print-labels`). Le contenu réel est donc ailleurs.
 *
 * Rien n'est supprimé : l'ancienne adresse répond par une redirection
 * permanente vers `/commandes/a-traiter/etiquettes`.
 */
export default function FacturesRedirect() {
  permanentRedirect("/commandes/a-traiter/etiquettes");
}
