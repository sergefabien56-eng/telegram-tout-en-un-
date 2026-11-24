# Sauvegarde et restauration (R5)

Objectif : pouvoir **exporter** les données à tout moment et **restaurer** la base
après une perte, sans outil payant. Tout est scripté en Node (aucun `pg_dump`
requis) pour fonctionner sur l'offre gratuite.

## 1. Ce qui est sauvegardé

La base PostgreSQL contient aujourd'hui **14 tables** :
`users`, `sessions`, `password_reset_tokens`, `app_settings`, `shops`,
`shop_members`, `shop_invites`, `account_link_codes`, `telegram_accounts`,
`user_notification_prefs`, `notifications`, `jobs`, `audit_logs`, `login_attempts`.

Les tables des commandes, produits et mouvements de stock seront ajoutées quand
les modules correspondants seront branchés (Phase 2). Le dump les inclura alors
automatiquement, sans changer la procédure.

Un dump comprend :

- le DDL reconstruit depuis `information_schema` (tables, colonnes, types, clés, séquences) ;
- les données en `INSERT` (échappement SQL correct, `jsonb` inclus) ;
- un en-tête avec la date, l'origine et un **checksum SHA-256**.

Les secrets ne sont **jamais** dans le dépôt : `DATABASE_URL`, `ENCRYPTION_KEY`,
`SESSION_SECRET` restent hors git (`.env.local`, secrets GitHub/Render).

> ⚠️ Le dump contient des données personnelles (e-mails, noms). Il ne doit pas être
> commité ni partagé publiquement : `backups/` est dans `.gitignore`.

## 2. Export depuis l'application (aucun secret à configurer)

Le plus simple : connecté en **propriétaire**, ouvrir **Santé** dans le menu puis
cliquer **« Télécharger le dump (.sql.gz) »**.

- le serveur possède déjà la base : **aucune variable `DATABASE_URL` à copier**
  dans GitHub ;
- le fichier est le même format que celui du script ;
- l&apos;action est inscrite au journal d&apos;audit (`admin.database_export`) et
  téléchargeable une seule fois par clic ;
- réservé aux rôles propriétaires (403 sinon).

## 3. Sauvegarde manuelle en ligne de commande

```bash
export $(grep -E '^DATABASE_URL' .env.local | xargs)   # si la variable n'est pas déjà en place
node scripts/backup.mjs                # backups/backup-AAAA-MMJJ-HHMMSS.sql
node scripts/backup.mjs --compress     # + gzip (recommandé)
```

Vérification rapide :

```bash
gzip -t backups/backup-….sql.gz && echo "gzip OK"
sha256sum backups/backup-….sql.gz
```

## 4. Sauvegarde planifiée (gratuit, optionnel)

`.github/workflows/backup.yml` s'exécute :

| Fréquence                      | Action                                            |
| ------------------------------ | ------------------------------------------------- |
| tous les jours à **03:37 UTC** | dump compressé + vérification du checksum         |
| dimanche (même heure)          | + test de restauration complet sur schéma jetable |
| à la demande                   | bouton **Run workflow** de l'onglet Actions       |

Le fichier est conservé **14 jours** comme artefact GitHub (`backup-sql`),
téléchargeable depuis l'onglet Actions → « Sauvegarde quotidienne ».

### Prérequis : le secret `DATABASE_URL` (seulement pour cette automatisation)

L'export depuis l'application (§2) n'a besoin de rien. Le workflow, lui, ne peut
pas lire la base tant que ce secret n'est pas créé :

1. Dépôt → **Settings → Secrets and variables → Actions → New repository secret** ;
2. nom `DATABASE_URL`, valeur = l'URI Postgres copiée depuis Neon (ou depuis
   Render → service → onglet **Environment** → variable `DATABASE_URL`) ;
3. sans lui, le job se termine avec « aucune sauvegarde » et reste vert.

Le job affiche une ligne `URL : protocole=… hôte=… base=… mot de passe=présent`
avant de se connecter (jamais le mot de passe) : si `hôte=` ne contient pas
`neon.tech`, c'est que la valeur collée est incomplète.

> Un dump produit par le workflow et un dump produit par l'application sont
> strictement identiques : les deux passent par `scripts/lib/dump-sql.mjs`.

### Copie sur Cloudflare R2 (optionnel, gratuit 10 Go)

Si l'on veut une copie hors de GitHub, ajouter en **variables** `R2_BUCKET` et en
**secrets** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
(Cloudflare → R2 → Manage API Tokens). L'étape est ignorée automatiquement tant
que `R2_BUCKET` est vide.

### Copie sur Google Drive

Le connecteur Google Drive de cette session permet d'envoyer un dump existant :

```
upload_file(name = "backup-….sql.gz", file_path = "backups/backup-….sql.gz")
```

L'envoi est manuel (ou à la demande) : GitHub Actions ne peut pas appeler ce
connecteur. C'est volontaire — pas d'identifiants Google stockés dans le dépôt.

## 5. Restauration

```bash
# 1. valider le dump sans rien écrire
node scripts/restore.mjs backups/backup-….sql.gz --dry-run

# 2. restaurer réellement (demande confirmation)
node scripts/restore.mjs backups/backup-….sql.gz
node scripts/restore.mjs backups/backup-….sql.gz --yes      # sans confirmation
```

La restauration **écrase** les tables présentes dans le dump ; les clés étrangères
sont désactivées le temps de l'écriture, puis réactivées.

Pour s'entraîner sans risque sur la production :

```bash
node scripts/restore.mjs backups/backup-….sql.gz --schema restore_test --yes
```

## 6. Test de restauration automatisé

```bash
node scripts/backup-test.mjs
```

Sauvegarde → restauration dans un schéma jetable `restore_test` → comparaison du
nombre de lignes par table → suppression du schéma. Aucune donnée de production
n'est modifiée. Exécuté chaque dimanche par le workflow.

## 7. Limites honnêtes

- Pas de sauvegarde des **fichiers** stockés sur R2 (module non branché) : la
  restauration ne rétablit pas les fichiers ;
- pas de PITR fin : on restaure au moment du dump, pas à la seconde près ;
- l'artefact GitHub expire au bout de 14 jours : une copie externe (R2 ou Drive)
  est recommandée pour l'archivage.
