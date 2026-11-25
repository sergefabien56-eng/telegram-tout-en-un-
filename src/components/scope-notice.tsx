/** En-tête commun des écrans de consultation (rendu côté serveur). */
/** En-tête commun des écrans de consultation. */
export function ScopeNotice({ total, allowed }: { total: number; allowed: number }) {
  if (total === 0) {
    return (
      <p className="text-sm text-muted" role="status">
        Aucune boutique accessible. Créez d&apos;abord une boutique, puis rattachez-la à une
        boutique Jumia.
      </p>
    );
  }
  if (allowed === 0) {
    return (
      <p className="text-sm text-danger" role="status">
        Votre rôle ne permet pas d&apos;accéder à cette rubrique sur vos boutiques.
      </p>
    );
  }
  return null;
}
