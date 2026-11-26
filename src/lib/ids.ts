/**
 * Identifiants locaux — validation.
 *
 * Les identifiants viennent des URL, des corps de requête ou des
 * paramètres d'interface : ils peuvent donc être malformés. Or les
 * colonnes concernées sont de type `uuid` : une valeur invalide fait
 * échouer la requête SQL.
 *
 * Plutôt que de renvoyer une erreur 500 à l'utilisateur, on **refuse
 * l'entrée** : la ressource est traitée comme inexistante.
 */

/** Format UUID (version 1 à 5), insensible à la casse. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** La valeur est-elle un identifiant local utilisable ? */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}
