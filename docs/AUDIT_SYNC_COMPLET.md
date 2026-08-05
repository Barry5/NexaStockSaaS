# Audit complet — Architecture Offline-First SQLite ↔ Supabase (NexaStock SaaS)

**Projet :** NexaStock SaaS — Gestion de stock & ventes
**Branche :** `sync` (worktree `sqlite-supabase-sync-analysis`)
**Date :** 2026-08-05
**Portée :** Audit exhaustif en 14 sections du moteur de synchronisation, de la persistance locale (better-sqlite3), du réplica central (Supabase/PostgreSQL), des files d'attente, de la sécurité, des performances et des stratégies de conflit. Corrections proposées sans modification de l'interface utilisateur.

**Références lues :** `server.ts`, `db.ts`, `init.ts`, migrations 001→015, `sync/{syncService,syncEngine,syncQueue,supabaseWorker,syncTables,conflictResolver}.ts`, `routes/sync.ts`, `services/supabase/{supabaseService,transform}.ts`, `services/domain/{baseService,saleService,invoiceService,productService}.ts`, `repositories/*`, `middleware/{auth}.ts`, `supabase/migrations/{001_full_schema,002_unique_legacy_id_indexes,003_sync_indexes}.sql`, client `context/DBContext.tsx`, `api/sync.ts`, `lib/syncQueue.ts`, `docs/RAPPORT_ANALYSE_SYNC.md` (rapport antérieur), tests E2E.

---

## 1. Vue d'ensemble de l'architecture actuelle

### 1.1 Topologie

```
                        ┌─────────────────────────────────────────────┐
                        │          Client React (PWA)                 │
                        │  État mémoire DBState + cache Dexie         │
                        │  (nexastock_sync : file de deltas client)   │
                        │                                             │
                        │  ┌─ POST /api/sync       (full-state)       │
                        │  ├─ POST /api/sync/push  (deltas versionnés)│
                        │  ├─ GET  /api/sync/pull  (deltas + tombstones)
                        │  └─ GET  /api/sync       (bootstrap total)  │
                        └───────────────┬─────────────────────────────┘
                                        │ HTTP/JSON (Express)
                        ┌───────────────▼─────────────────────────────┐
                        │     Serveur Express (NexaStock)             │
                        │   SQLite better-sqlite3 = SOURCE DE VÉRITÉ  │
                        │   (WAL, foreign_keys ON)                    │
                        │                                             │
                        │  Tables métier + tables de sync :           │
                        │   sync_changelog  (journal push, retry borné)│
                        │   sync_deletions  (tombstones locaux)       │
                        │   sync_queue      (LEGACY, drain au boot)   │
                        │   sync_tracking   (watermarks last_sync_at) │
                        │   sync_uuid_map   (sqlite_id ↔ uuid PG)     │
                        │                                             │
                        │  SupabaseWorker (SEUL planificateur, 15 s)  │
                        │   lock fichier .supabase-worker.lock        │
                        │   tick : changelog→PG + pull PG→SQLite      │
                        │          + réconciliation (20 cycles)       │
                        │          + cleanup (10 cycles)              │
                        └───────────────┬─────────────────────────────┘
                                        │ REST (PostgREST, clé service_role)
                        ┌───────────────▼─────────────────────────────┐
                        │   Supabase (PostgreSQL) = RÉPLICA CENTRAL   │
                        │   triggers version/updated_at/created_at    │
                        │   RLS tenant_isolation (sans effet client)  │
                        │   index keyset (updated_at, id) ~37 tables  │
                        └─────────────────────────────────────────────┘
```

### 1.2 Déroulement d'un cycle de sync

1. **Écriture métier** (route REST ou client) → SQLite + `syncEngine.logChange()` (changelog) dans le flux métier (l'atomicité write+changelog est **partielle**, voir §6.4).
2. **Déclenchement** : `baseService.enqueueSyncFor` lance un `syncUpFromChangelog()` *fire-and-forget* si en ligne, **en plus** du cycle du worker → double exécution possible (voir §6.3).
3. **Push** (`SupabaseWorker.processChangelog` / `syncService.syncUpFromChangelog`) : lit `sync_changelog` (pushed_to_supabase = 0, status != dead, retry_count < max_retries), relit l'état courant par `SELECT *` (`getCurrentRecordForPush`), transforme (camel→snake, UUID mapping, exclusion colonnes), `batchUpsert` par 50 sur `legacy_id` (ou clé naturelle), DELETE → `deleteFromRemote`.
4. **Pull** (`syncService.syncDown`) : pagination keyset `(updated_at, id)` par 100, watermark `max(updated_at)` mis à jour **dans la même transaction** que les upserts locaux, insertion locale par `INSERT OR REPLACE` filtré sur colonnes existantes, skip si `localVersion > remoteVersion`.
5. **Réconciliation** (tous les 20 cycles ≈ 5 min) : `countRemoteRows` vs comptage local, purge des lignes locales absentes de PG + repull de la table (voir §2.4 pour le risque destructeur).
6. **Client** : `POST /api/sync` (full-state versionné) ou `/api/sync/push` (deltas) ; pull 30 s via `/api/sync/pull` qui lit **SQLite serveur** (chaîne à 2 étages, voir §6.2).

### 1.3 État des corrections du rapport antérieur (RAPPORT_ANALYSE_SYNC.md)

| Référence | Correction | Statut |
|---|---|---|
| C1 — inférence de DELETE par snapshot | `enqueueStateDeletions` supprimé | ✅ corrigé (full-state) — ⚠️ **partiel pour enfants embarqués** (§2.3) |
| C2 — pagination offset | curseur keyset `(updated_at,id)` | ✅ corrigé |
| C3 — merge INSERT OR REPLACE | `buildStateChanges` → `pushChanges` versionné | ✅ corrigé |
| M1 — double push / 2 planificateurs | `startBackgroundSync` = no-op, worker unique | ✅ corrigé — ⚠️ **course résiduelle fire-and-forget vs worker** (§6.3) |
| M2 — course sync_queue | `dequeue` avec réservation atomique | ✅ corrigé (queue legacy) |
| M3 — suppressions PG jamais propagées | `reconcileLocalWithRemote` | ✅ corrigé — ⚠️ **effet destructeur sur dead-letter** (§2.4) |
| M4 — retry illimité changelog | retry_count/max_retries/dead (013) | ✅ corrigé |
| M5 — pull client ne lit pas PG | conservé (choix) | ⚠️ **toujours présent**, atténué par réconciliation |
| M6 — watermark now() | watermark = max(updated_at) dans la transaction | ✅ corrigé |
| M7 — write + enqueue non atomique | **non fait** | ❌ **toujours présent** (§2.2) |
| m2 — conflictResolver inutilisé | garde-fou LWW version intégré à `pushChanges` | ✅ partiel (le `conflictResolver.ts` reste inutilisé) |

---

## 2. Scénarios de perte de données

### 2.1 🔴 P1 — Réconciliation destructrice sur changement en « dead » (bug actif)

**Fichier :** `src/server/sync/syncService.ts:445-450` (`reconcileLocalWithRemote`) + `syncEngine.ts:337-343` (`hasPendingChangesForTable`).

Un changement local dont le push a échoué 10 fois passe en `status = 'dead'` (dead-letter). La requête `hasPendingChangesForTable` filtre `status != 'dead'` :

```sql
SELECT COUNT(*) FROM sync_changelog
WHERE table_name = ? AND pushed_to_supabase = 0 AND status != 'dead'
```

→ une ligne locale **en dead est invisible** pour la réconciliation. Au cycle suivant, `reconcileLocalWithRemote` compare les comptages : la ligne existe localement mais pas côté PG → `localCount > pgCount` → `pruneLocalRowsMissingFromRemote` **la supprime localement** pour « réparer » un écart.

**Conséquence :** toute donnée créée localement dont le push échoue définitivement (erreur de schéma, FK cassée, colonne NOT NULL, validation Supabase…) est **supprimée du serveur local** par la « réparation » automatique, alors qu'elle était intacte dans la dead-letter. Le dead reste dans le changelog (visible 30 j via `/api/sync/failed`) mais la donnée réelle est détruite.

**Scénario concret :** un utilisateur crée une facture avec un champ non mappé côté PG (violation) → `max_retries = 10` épuisées en ~10 cycles (2,5 min) → `dead` → au 20e cycle (~5 min) la facture est **supprimée de SQLite**. Le client la voit disparaître. La sauvegarde `/data/backups` est le seul recours.

**Correctif proposé (§14.1) :** exclure de la réconciliation toute table ayant ≥ 1 changement `dead` non purgé (et non résolu), OU ne jamais purger une ligne locale protégée par un changelog (toute opération non `pushed_to_supabase = 1`).

### 2.2 🔴 P2 — Atomicité write + logChange toujours non garantie (M7)

**Fichier :** `baseService.ts:61-69`, `saleService.ts:137`, `invoiceService.ts:173`.

`enqueueSyncFor` (qui appelle `logChange`) est appelé **après** l'écriture SQLite (ou dans la transaction mais pour des enfants seulement, ex. `sale_items`). La vente principale est journalisée **hors transaction** (`saleService.create` ligne 137 : `this.enqueueSync('CREATE', saleId, ...)` après le `runInTransaction`).

Si le process crashe (ou l'écriture de `sync_changelog` échoue) entre l'INSERT métier et le `logChange` :
- la ligne existe en SQLite, **aucun** changelog ;
- le push ne la propagera jamais ;
- la réconciliation (§2.1) la supprimera **localement** à terme (PG n'a pas la ligne).

**Correctif (§14.2) :** `db.transaction(() => { ...écriture métier...; logChange(...); })` — le `logChange` (avec son UPDATE version) et l'écriture métier dans la **même** transaction. C'est faisable dans `baseService.runInTransaction` en le passant en paramètre, sans toucher à l'UI.

### 2.3 🔴 P3 — Inférence de DELETE toujours active pour les enfants embarqués (C1 partiel)

**Fichier :** `routes/sync.ts:245-271` (`buildStateChanges`, blocs `EMBEDDED_CHILDREN`).

Le full-state client ne supprime plus de lignes racines, mais il **infère toujours la suppression des enfants** : pour chaque parent reçu (produit, vente, facture, BL, retour, prêt), tout enfant local absent du snapshot client est converti en opération `DELETE` (lignes 264-269).

**Scénario de perte :** appareil A (cache vide/périmé) et appareil B créent chacun un enfant du même parent (ex. deux variantes du même produit, deux items sur la même facture en brouillon). B pousse son état → A poste son snapshot (sans la variante de B) → la variante de B est déclarée orpheline → `DELETE` local + propagation PG. **La donnée de B est détruite silencieusement.**

Ce chemin est encore emprunté par le client (`DBContext.fullSync` → `POST /api/sync`). Le chemin `POST /api/sync/push` (deltas explicites) est sûr ; le full-state ne l'est pas pour les enfants.

**Correctif (§14.3) :** supprimer l'inférence des orphelins enfants dans `buildStateChanges`, ou la limiter au bootstrap initial (lorsque le client déclare explicitement `mode: 'bootstrap'`). Les DELETEs enfants passent par `/api/sync/push`.

### 2.4 🟠 P4 — Fuite inter-tenant : GET /api/sync, /pull, /changes, /push ne filtrent pas par tenant

**Fichier :** `routes/sync.ts:16-184` (`compileCompleteState` : `SELECT * FROM products/customers/sales/...` **sans `WHERE tenantId`**), `syncEngine.pullChanges` (toutes les tables, aucune condition tenant), `buildStateChanges`/`pushChanges` (les records reçus ne sont pas vérifiés contre `req.user.tenantId`).

Les routes CRUD métier (`products.ts`, `customers.ts`, …) filtrent via `productService.getAll(tenantId)`. Les routes de sync, elles, renvoient **tout** et **acceptent tout** :
- `GET /api/sync` : un utilisateur authentifié de n'importe quel tenant reçoit les données de **tous** les tenants (ventes, factures, commissions, users avec hash de mot de passe — `compileCompleteState` inclut `password` !).
- `GET /api/sync/pull?since=...` : idem, toutes les tables entières au-delà de `since`.
- `POST /api/sync/push` : les deltas ne sont pas validés `tenantId === req.user.tenantId` → un client peut écraser/créer des records d'un autre tenant (il connaît les `legacy_id` car ils sont typés `sa-…`, `inv-…`, etc.).

**Gravité : haute.** C'est la faille de sécurité la plus importante constatée (détaillée §11).

### 2.5 🟠 P5 — Générateur de numéros par COUNT+1 (factures, BL, retours)

**Fichier :** `invoiceService.ts:17-33`.

`generateInvoiceNumber` = `COUNT(*) + 1` sur `invoices` : doublon dès qu'une facture est supprimée, course en multi-instance (2 process → même numéro), et aucune contrainte UNIQUE sur `invoice_number` (SQLite ni PG). Pour un ERP, des numéros de facture dupliqués sont un risque comptable et légal.

**Correctif (§14.4) :** compteur persistant par tenant (`invoice_counters` : tenant_id, type, prefix, last_number) + transaction, ou numérotation `Date.now()` + séquence, et **contrainte UNIQUE** sur `invoice_number` côté PG.

### 2.6 🟡 P6 — IDs métier non-UUID générés par le client

`sa-${Date.now()}-${random(7)}`, `inv-…`, `pay-…`, `aud-…`, `chg-…`, `del-…` : risque de collision faible mais réel quand deux appareils créent un record à la même milliseconde (générateurs indépendants). Une collision au push → `INSERT OR REPLACE` sur `legacy_id` PG → **écrasement d'un record légitime** ou doublon de vente. La probabilité est faible (7 chars aléatoires ≈ 36⁷) mais l'impact est une vente dupliquée.

**Correctif (§14.5) :** UUID v4 pour les nouvelles entités côté serveur (`genId` → `crypto.randomUUID()`), et vérification d'unicité avant INSERT client (le serveur reste le point de contrôle).

---

## 3. Scénarios de conflits

### 3.1 Mécanisme actuel

Le pipeline implémente un **LWW par version** :

| Situation | Comportement `pushChanges` | Comportement `upsertBatchToLocal` (pull) |
|---|---|---|
| CREATE avec `id` existant localement, `clientVersion < serverVersion` | conflit `server_wins` journalisé, état local conservé | — |
| CREATE avec `id` existant, versions non pertinentes | `remote_wins` codé en dur (client ignoré) + changelog UPDATE | — |
| UPDATE avec `clientVersion < serverVersion` (les deux > 0) | conflit `server_wins`, **rien n'est appliqué** (l'état local récent gagne) | — |
| UPDATE avec `clientVersion = 0` ou `>=` | merge `{...old, ...data}` + version = `max+1` | — |
| Pull : `localVersion > remoteVersion` | — | **skip** (l'état local récent gagne) |
| Pull : cas normal | — | `INSERT OR REPLACE` (version PG écrasée) |

Le `conflictResolver.ts` (LWW par `updatedAt` ISO, `local_wins`, `remote_wins`, `manual`) existe mais **n'est appelé nulle part** dans le pipeline réel.

### 3.2 Scénarios couverts

1. **Snapshot périmé (client plus vieux que serveur)** : `server_wins` — OK (l'écriture du client est rejetée, conflit visible `/api/sync/status`).
2. **Édits simultanés sur 2 appareils** : le dernier push en version atteint le serveur gagne via le merge UPDATE ; le second enversion inférieure est rejeté → **perte silencieuse du second éditeur** (conflit journalisé mais aucune résolution automatique de type merge de champs).

### 3.3 Scénarios NON couverts (limites)

3. **Conflit DELETE vs UPDATE** : si le serveur local a supprimé un record et qu'un client pousse un UPDATE dessus, `pushChanges` le recrée (`UPDATE` sur ligne inexistante → `CREATE` implicite, `syncEngine.ts:207-213`). Le DELETE en attente dans le changelog sera ensuite rejoué → la ligne est supprimée en PG mais **recréée localement** par le pull suivant si le watermark l'expose → **valeur instable/duplication** possible (DELETE puis pull qui réinsère). La réconciliation finit par trancher (supprime la ligne locale) mais avec un cycle de résurrection visible côté client.
4. **Conflit CREATE/CREATE (même legacy_id généré par 2 appareils)** : voir §2.6 — le second écrase le premier (INSERT OR REPLACE).
5. **Conflit sur tables SANS `updated_at`** (RBAC/audit) : aucun signal de version exploitable → le pull `INSERT OR REPLACE` écrase toujours le local (assumé, cf. `TABLES_WITHOUT_UPDATED_AT`).
6. **Conflits sur `deleted_at` (soft delete)** : SQLite supprime **en dur** (pas de soft-delete côté serveur) alors que PG possède `deleted_at` + `trigger_soft_delete` (non appliqué : les DELETEs passent par `deleteFromRemote` en dur). Divergence de modèle : un soft-delete PG (fait manuellement) serait « fantôme local » détecté par la réconciliation… qui le supprime en dur. Le soft-delete n'est **jamais utilisé** ni propagé.
7. **`remote_wins` codé en dur sur CREATE collision** : la donnée client est silencieusement jetée (le `conflictResolver` n'intervient pas).

**Conclusion :** la stratégie LWW/version est correcte pour le cas 99 % (édits successifs), mais les cas DELETE-vs-UPDATE, CREATE-vs-CREATE et soft-delete restent non maîtrisés (voir plan §12, items S-3 et S-4).

---

## 4. Audit de la base SQLite (better-sqlite3)

### 4.1 Configuration

- `journal_mode = WAL`, `foreign_keys = ON` (`db.ts`).
- Sauvegardes automatiques (backup + nettoyage à 30 jours, `db.ts`).
- Migration 010 : `version/updatedAt/createdAt/deletedAt` ajoutés aux tables principales.
- Migrations 011 (sync_queue/tracking), 012 (sync_uuid_map), 013 (retry changelog) : cohérentes.

### 4.2 Constats

| # | Constat | Gravité |
|---|---|---|
| S1 | **Fichiers de backup de 4096 octets** dans `data/backups` (observés) : taille d'une base vide (un seul header). Ils sont probablement issus d'un `VACUUM INTO`/copy sur base **vide** (DB non initialisée au moment du backup) → les backups ne contiennent aucune donnée alors qu'ils sont censés être la protection N°1. À vérifier en production (le comportement `backup()` de better-sqlite3 doit être audité : si la base est vide au boot, chaque backup écrase le précédent par un fichier vide). | Haute |
| S2 | `PRAGMA foreign_keys` désactivé puis réactivé dans `snapshot.ts` import (foreign_keys = OFF pendant le chargement) : acceptable pour un import contrôlé, mais `snapshot.json` contient des mots de passe hachés + données complètes en clair sur disque. | Moyenne |
| S3 | Aucun index sur `sync_changelog(record_id, table_name)` pour les requêtes de `hasPendingChangesForTable` / résolution — requêtes plein scan sur une table à forte croissance (purgée à 7 j, mais volume important en période de prod). Index présents : PK id, `created_at` (implicite via PK suffixe ? non — vérifier). | Faible |
| S4 | `version`/`updatedAt` mis à jour par `logChange` via UPDATE séparé dans sa propre transaction : cohérent avec l'INSERT changelog (même transaction), mais **découplé de l'écriture métier** (§2.2). | Haute |
| S5 | Tables RBAC (`roles`, `permissions`, `user_roles`, …) sans colonne `version` : le `try/catch` silencieux de `logChange` (`syncEngine.ts:96`) les laisse sans version locale → LWW inopérant sur ces tables. Assumé (quasi statiques) mais la divergence n'est jamais détectée. | Faible |
| S6 | `sales`/`sale_items` : FK `ON DELETE SET NULL` sur `productId` (migration 008) → après suppression d'un produit, les items historiques perdent la référence produit mais gardent `productName`. Acceptable ; à noter pour les rapports. | Info |
| S7 | La purge `cleanupPushedRecords` supprime les changelog poussés > 7 j et les dead > 30 j : OK, mais le changement « dead » lié à une ligne toujours absente de PG (cf. §2.1) devient alors définitivement non traçable après 30 j. | Moyenne |

### 4.3 Recommandations SQLite

1. Indexer `sync_changelog(pushed_to_supabase, table_name, status, retry_count)` et `sync_deletions(table_name, deleted_at)` (requêtes hot path).
2. Audit du mécanisme de backup : ne jamais écraser un backup non vide par une base vide (protéger par taille/age/checksum), ou exécuter le backup **après** l'initialisation complète + migrations.
3. Ajouter des colonnes `version` aux tables RBAC (migration 014) si le LWW doit y être appliqué (optionnel).
4. Passer `snapshot.ts` en export chiffré (ou au moins hors arborescence web).

---

## 5. Audit de la base PostgreSQL / Supabase

### 5.1 Schéma et migrations

- `001_full_schema.sql` (1752 lignes) : extensions (uuid-ossp, pgcrypto, pg_trgm), triggers `trigger_set_updated_at_with_version` / `..._without_version` / `set_created_at` / `trigger_soft_delete`, audit columns (`company_id`, `created_by`, `sync_status`, `device_id`), RLS activée sur 27 tables, policies `tenant_isolation` génériques + spécifiques (tenants/users/roles), seeds (settings, 15 modules, 47 permissions, 7 rôles système).
- `002_unique_legacy_id_indexes.sql` : index UNIQUE sur `legacy_id` pour 38 tables (idempotent, garde `information_schema`).
- `003_sync_indexes.sql` : index keyset `(updated_at, id)` et `(created_at, id)` (~37 tables).

### 5.2 Constats

| # | Constat | Gravité |
|---|---|---|
| P1 | **RLS inopérante pour l'application** : toutes les écritures/lectures passent par le client `service_role` (`getAdminClient`), qui **bypass RLS**. La RLS est un filet passif (utile seulement si une clé anon/authenticated fuit). L'isolation réelle repose entièrement sur Express — qui ne filtre pas les routes sync (§2.4). | Haute |
| P2 | **`get_changes_since` et `upsert_with_version` (SQL) obsolètes/incohérents** avec le pipeline actuel : la fonction SQL `get_changes_since` pagine sur `updated_at > since ORDER BY updated_at LIMIT` **sans curseur keyset** (le code Node n'utilise plus ces fonctions — elles sont mortes mais `SECURITY DEFINER` avec `EXECUTE format` : risque de surface d'attaque SQLi si jamais exposées via RPC). À supprimer ou réécrire en keyset. | Moyenne |
| P3 | `trigger_set_updated_at_with_version` : `NEW.version = OLD.version + 1` — les versions PG **ne reflètent pas** les versions SQLite (la version est exclue du push, `ALWAYS_EXCLUDED_COLUMNS`) : chaque push PG incrémente une version « fantôme ». La cohérence locale est restaurée par le pull (réécriture de la version PG), mais toute comparaison directe local/PG est impossible et le double push (§6.3) gonfle les versions sans effet de bord visible. | Moyenne |
| P4 | `trigger_soft_delete` défini mais **aucun trigger ne l'utilise** : les DELETEs passent par suppression dure (`deleteFromRemote`). Le modèle soft-delete est donc mort côté PG (seulement 2 tables avec `deleted_at` utilisées). | Moyenne |
| P5 | Pas d'index UNIQUE sur `invoices.invoice_number` (ni BL/retour) — cohérent avec §2.5. | Haute |
| P6 | **Pas de contrainte d'intégrité inter-table au niveau tenant** : RLS `tenant_isolation` appliquée sur les FK renvoyant à un tenant différent n'est pas vérifiable par PostgREST avec service_role. Le contrôle doit être applicatif (Express) — défaillant pour /sync (voir §2.4). | Haute |
| P7 | Tables `invoice_items`, `sale_items`, `delivery_order_items`, `return_items`, `repayments`, `loan_installments`, `role_permissions`, `user_roles`, `pricing_plans`, `plan_modules`, `module_definitions`, `global_saas_settings` : **RLS non activée** (absentes de la liste `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`). En cas d'usage futur de clé `authenticated`, ces tables seraient exposées. | Faible (RLS de toute façon bypassée) |
| P8 | `sync_deletions` n'existe pas côté PG : les suppressions PG→SQLite sont gérées par réconciliation (comptages) — coûteux à grande échelle (`countRemoteRows` exact sur chaque table tous les 20 cycles) et sans mécanisme de tombstone PG pour les DELETEs faites côté PG (ex. wipe partiel). | Moyenne |

### 5.3 Recommandations Supabase

1. Ajouter une migration `004` : `CREATE UNIQUE INDEX` sur `invoices(tenant_id, invoice_number)`, `delivery_orders(tenant_id, delivery_number)`, `returns(tenant_id, return_number)`.
2. Supprimer (ou réécrire en keyset + autoriser uniquement via RPC authentifié) `get_changes_since` et `upsert_with_version`.
3. Optionnel : activer RLS sur les tables restantes + policy sur les clés naturelles (`id = current_company_id()` pour `global_saas_settings`).
4. Ajouter une table `sync_deletions_pg(table_name, legacy_id, deleted_at)` si l'on veut des DELETEs PG traçables (alternative à la réconciliation par comptage).

---

## 6. Audit du moteur de synchronisation

### 6.1 Vue générale (post Phases 1-4)

**Pipeline unique de push :** `sync_changelog` → `processChangelog`/`syncUpFromChangelog` → `batchUpsert(50)`.
**Pull :** `syncDown` keyset par table, 100/page, watermark transactionnel.
**Planification :** `SupabaseWorker` seul (15 s, backoff exponentiel 15 s→300 s, batch 25, verrou fichier stale 10 min).
**Réconciliation :** cycle 20 (comptage + prune + repull).
**Cleanup :** cycle 10 (purge 7 j / 30 j).

### 6.2 🟠 Course résiduelle : fire-and-forget vs worker (M1 résiduel)

`baseService.enqueueSyncFor` (`baseService.ts:66-68`) :

```ts
syncEngine.logChange(...);
if (syncService.isOnline()) {
  syncService.syncUpFromChangelog().catch(() => {});
}
```

Ce `syncUpFromChangelog` tourne **concurremment** au `processChangelog` du worker. `getChangesForSupabase` sélectionne `pushed_to_supabase = 0` **sans verrou** → les deux exécuteurs peuvent lire les **mêmes** items et les pousser deux fois. Idempotence : `batchUpsert` sur `legacy_id` (ON CONFLICT) et `deleteFromRemote` idempotents → pas de corruption, mais **double écriture** (versions PG gonflées, coût réseau doublé, et risque de course DELETE-vs-UPDATE entre les deux exécuteurs : A pousse l'UPDATE, B pousse le DELETE, ordre variable).

**Correctif (§14.6) :** supprimer le fire-and-forget et laisser le worker (15 s) faire le travail, OU mettre un verrou en mémoire (`isRunning`) partagé entre `syncUpFromChangelog` et le worker (mutex).

### 6.3 Pull à 2 étages (M5 conservé)

`GET /api/sync/pull` lit SQLite (l'état déjà synchronisé par le serveur). Un client connecté juste après une écriture locale voit son changement seulement après : (1) push local → changelog, (2) worker push PG, (3) worker pull PG, (4) client pull. Latence 2 × 15 s ≈ 30-60 s. **Acceptable** pour cette application (le client pousse et re-pull immédiatement après le push : `flushNow` → `pullRemoteChanges`), mais attention : le pull client **renvoie toutes les tables depuis `since`** (pas de limite) — avec le temps et de gros volumes, réponse volumineuse toutes les 30 s (voir §10).

### 6.4 Atomicité (rappel §2.2) et incohérence de version

Le « noyau dur » du pipeline est correct (LWW par version, relecture de l'état courant au push, watermark transactionnel, dead-letter bornée). Les trois défauts résiduels du moteur sont : **l'atomicité** (§2.2), la **course fire-and-forget** (§6.2) et l'**inférence de DELETE enfants** (§2.3).

### 6.5 `syncEngine.recordChange` vs `logChange` : double chemin résiduel

`recordChange` (utilisé par `pushChanges` pour les changements venant du client) **n'incrémente pas** `version` localement (contrairement à `logChange`). Les changements client → `pushChanges` → `recordChange` gardent donc la version du merge local déjà réalisé — cohérent (le merge applique déjà la version). OK.

### 6.6 Cas limite : `pushChanges` UPDATE sur ligne inexistante recrée un CREATE

`syncEngine.ts:207-213` : UPDATE sur `!existing` → CREATE implicite (version 1). Si le client envoie un UPDATE d'un record supprimé localement (snapshot), il **ressuscite** le record local (puis le DELETE éventuellement en attente sera rejoué). Comportement risqué (§3.3-3) : à documenter ou restreindre (refuser l'UPDATE si la ligne n'existe pas et qu'un tombstone local existe).

---

## 7. Audit des files d'attente

### 7.1 `sync_queue` (LEGACY)

- Écrite **plus** par les services (pipeline unique) — uniquement drainée au démarrage (`server.ts` : `syncUp()` avant `fullPush`/worker).
- `dequeue` : réservation atomique `UPDATE ... WHERE status = 'pending'` (corrigé, M2).
- `sync_tracking` (watermarks) : toujours utilisée par `syncDown`/`fullPush`/`upsertBatchToLocal`.
- `getStatus`/`/api/sync/status` continuent d'afficher la queue (pending/failed) : légère confusion opérationnelle (une queue vide mais des changelog en attente). `/api/sync/overview` donne les deux vues — bien.

**Recommandation :** garder `sync_tracking` (watermarks) ; supprimer `sync_queue` à terme (migration 014), après validation en prod, pour éviter la confusion et le code mort (`processQueue` dans le worker, `recordChange` DELETE du queue).

### 7.2 `sync_changelog` (file de push effective)

- Retry borné : `CHANGELOG_MAX_RETRIES = 10`, `status` (pending/failed/dead/pushed), visible `/api/sync/failed`, rejouable `/api/sync/retry-failed`.
- **Problème principal :** l'interaction dead-letter ↔ réconciliation (§2.1) — le plus gros bug actif.
- Nettoyage 7 j / 30 j : OK.
- `getChangesForSupabase` : LIMIT 200, priorité de table (FK parents d'abord) : bien pensé (les parents sont poussés avant les enfants → FK valides).
- Pas de limite par table dans `getChangesForSupabase` : une table avec 1000 changements occupe 5 cycles entiers → latence sur les autres tables (les DELETEs d'une table de priorité élevée passent avant). Acceptable, à surveiller.

### 7.3 File client (Dexie `nexastock_sync`)

- `enqueueChange`/`enqueueBatch`, flush via `/api/sync/push` : deltas versionnés, vérification 401, retry timer 2 s, batch.
- `extractChanges` : diff par JSON.stringify des états — déclenche des faux UPDATE sur champs dérivés (m3 du rapport antérieur, non corrigé). Impact : des writes redondants (pas de perte).
- Rétention : si le flush échoue, les changements restent dans Dexie (persistants) → bon comportement offline.
- **Risque :** pas de borne de taille de la file Dexie (croissance infinie en offline long) et pas de priorité entre le flush de file et le full-state → le full-state `POST /api/sync` peut être envoyé avec un état plus récent que la file (double écriture, généralement idempotente).

---

## 8. Stratégies de résolution de conflit

### 8.1 État actuel

- **LWW par version** (anti-régression) : `pushChanges` refuse `clientVersion < serverVersion`, le pull refuse `localVersion > remoteVersion`. Efficace pour les édits séquentiels.
- **`conflictResolver.ts` inutilisé** : les stratégies `local_wins`, `remote_wins`, `last_write_wins` (par `updatedAt` ISO) et `manual` existent mais ne sont branchées nulle part. Le LWW du moteur est codé en dur dans `syncEngine.ts`.
- **Conflits journalisés** : `SyncConflict` remonté dans `PushResult.conflicts` → visible via les routes (mais pas persistant : un conflit `server_wins` est journalisé en mémoire seulement, aucune table de conflits côté SQLite).

### 8.2 Recommandations

1. **Persister les conflits** : table `sync_conflicts(id, table, record_id, client_version, server_version, client_data, server_data, resolved_data, strategy, resolved_at, company_id)` pour la supervision et l'audit (répond au besoin « qui a gagné et pourquoi »).
2. **Unifier la stratégie** : appliquer `last_write_wins` par `updatedAt` ISO comme ordre total de référence, version en backup — le LWW par version est fragile quand les horodatages servent déjà de watermark (égalité possible).
3. **DELETE vs UPDATE** : règle « un record avec un tombstone `sync_deletions` non poussé ne peut pas être recréé par un push UPDATE » (retour `409 Conflict`).
4. **CREATE/CREATE collision** : détecter au push (le `legacy_id` PG est UNIQUE) → retourner le conflit au client plutôt qu'écraser silencieusement.

---

## 9. Bonnes pratiques offline-first (évaluation du respect)

| Bonne pratique | État | Commentaire |
|---|---|---|
| Source de vérité unique pour l'écriture | ✅ | SQLite serveur, PG = réplica |
| Journal d'opérations (outbox) | ✅ | `sync_changelog` (outbox pattern) |
| Idempotence des opérations de sync | ✅ | upsert ON CONFLICT legacy_id, DELETE idempotent |
| Résolution de conflit explicite et supervisée | ⚠️ | LWW version en dur, conflits non persistés |
| Tombstones de suppression (2 sens) | ⚠️ | Sens local→PG : ✅ ; sens PG→local : par réconciliation uniquement |
| Watermark transactionnel | ✅ | max(updated_at) dans la même transaction |
| Retry borné + dead-letter visible | ✅ | 10 retries, `/api/sync/failed`, rejeu manuel |
| Verrou mono-écrivain (multi-process) | ⚠️ | Lock fichier sans refresh (mtime) : un worker sain qui tourne >10 min sans tick réseau ne rafraîchit pas le lock → un second worker peut le prendre (cas backoff 300 s + cycle long). À améliorer : `touch()` du lock à chaque tick. |
| Purging / rétention des journaux | ✅ | 7 j / 30 j |
| Détection de divergence (réconciliation) | ✅ mais destructrice | cf. §2.1 |
| Atomicité write + journal | ❌ | §2.2 — à corriger |
| Tests automatisés du pipeline | ✅ | `npm test` 141/141 (dont tests Phase 3/4) |
| Migration de schéma versionnée (2 côtés) | ✅ | Migrations 001-013 SQLite + 001-003 PG (⚠️ pas de versioning formel côté Supabase/CLI : fichiers SQL manuels) |

---

## 10. Performances

| Point | Constat | Impact |
|---|---|---|
| Pull serveur | 44 tables × pages de 100, en séquence, toutes les 15 s (`syncDown()` complet à chaque tick) — **même sans changements** (chaque table requête PG même quand rien n'a bougé). Coût : ~44 requêtes réseau par cycle, ×4/min, ×240/h. À optimiser : ne puller que les tables « actives » ou utiliser le watermark pour sauter les tables vides (déjà le cas : `since` = dernier watermark → requête vide mais quand même effectuée). | Élevé à grande échelle |
| Pull client | `GET /api/sync/pull` : toutes les tables depuis `since` sans limite (page entière par table) toutes les 30 s + après chaque flush. Payload croît avec le volume de données → mémoire client + réseau. | Moyen à élevé |
| Push | `batchUpsert` 50/lot — OK. Relecture `SELECT *` par record avant push : OK à petit volume, devient coûteux (1 SELECT × 200 records/cycle). | Faible |
| Réconciliation | `countRemoteRows` (COUNT exact) sur ~39 tables + `fetchAllLegacyIds` (pagination 1000) + repull complet des tables en écart, tous les 20 cycles : lourd sur les tables volumineuses (sale_items, audit_logs). | Moyen |
| Index | Keyset PG ✅ ; SQLite : index manquants sur les tables de sync (S3). | Faible |
| Transactions | Chaque cycle envoie ~44 requêtes PG séquentielles — latence globale du tick élevée si un sous-ensemble ralentit (un `syncDown` de table qui prend 30 s retarde le cycle, `isRunning` bloque le suivant). Pas de timeout global. | Moyen |
| Dead-letter | Un item dead bloque sa table dans les comptages tant qu'il n'est pas résolu (visible 30 j) — minime. | Faible |

**Recommandations :**
1. `syncDown` parallèle par table (Promise.all, limite 4-6) ou pull uniquement si `hasRemoteChanges` (requête COUNT légère) ;
2. Pagination du pull client par table (`/api/sync/pull?table=&since=&limit=500` + page suivante) ;
3. Cache du `countRemoteRows` (une fois par heure) pour la réconciliation ;
4. Timeout global par tick (ex. 60 s) + mesure `lastRunAt` (déjà exposée).

---

## 11. Sécurité

### 11.1 Constats

| # | Constat | Fichier | Gravité |
|---|---|---|---|
| SEC-1 | **Fuite inter-tenant** : `GET /api/sync` renvoie les données de tous les tenants (y compris hashs `password` dans `users`) à tout utilisateur authentifié | `routes/sync.ts:16-184` | 🔴 Critique |
| SEC-2 | **Écriture inter-tenant** : `POST /api/sync/push` et `POST /api/sync` n'appliquent aucun contrôle `tenantId` sur les records reçus (INSERT OR REPLACE de n'importe quel id) | `routes/sync.ts:593-617, 620-688` ; `syncEngine.pushChanges` | 🔴 Critique |
| SEC-3 | `GET /api/sync/pull` renvoie toutes les tables de tous les tenants depuis `since` | `routes/sync.ts:580-590` ; `syncEngine.pullChanges` | 🔴 Critique |
| SEC-4 | `GET /api/sync/changes` idem (endpoint legacy) | `routes/sync.ts:285-314` | 🟠 Élevé |
| SEC-5 | Endpoints de réinitialisation (`/reset-app` GET avec clé en query string, `/clear-local`, `/wipe-all`, `/reset-from-cloud`) : protégés par `requireRole(['superadmin'])` — la clé `RESET_KEY` par défaut est **en dur dans le code** (`'nexastock-reset-2026'`) | `routes/sync.ts:338-380, 524-550` | 🟠 Élevé (clé par défaut connue) |
| SEC-6 | La réponse full-state inclut les hashs bcrypt des mots de passe : pas de fuite de mot de passe clair mais surface inutile (offline-cracking) | `routes/sync.ts:25` | 🟠 Moyen |
| SEC-7 | Les routes CRUD métier filtrent bien par `tenantId` (bonne base) ; `requirePermission` sur RBAC ; `requireActiveTenant` (statut d'abonnement) — **mais les routes /sync ne passent que `authenticateToken`** | routes métier vs routes sync | 🟠 Élevé |
| SEC-8 | `hashPassword` appliqué sur les users entrants (plaintext → bcrypt) avant stockage : correct | `routes/sync.ts:628-634` | ✅ OK |
| SEC-9 | RLS activée mais bypassée par service_role (filet passif) — toute l'isolation repose sur Express | `001_full_schema.sql:1499-1586` | 🟠 Élevé (conséquence de SEC-1/2/3) |
| SEC-10 | Aucune validation `tenantId` dans `buildStateChanges`/`pushChanges` (record.tenantId non comparé à req.user.tenantId) | `routes/sync.ts` | 🔴 Critique (avec SEC-2) |
| SEC-11 | `sync_uuid_map` et `getOrCreateUuid` créent des UUID à la volée pour toute FK non mappée : un client peut créer des FK fantômes vers des records inexistants (integrité) | `transform.ts:106-112` | 🟡 Faible |
| SEC-12 | Pas de rate limiting / bruteforce sur `/api/auth/login` ni sur `/api/sync` | — | 🟡 Moyen |

### 11.2 Correctifs recommandés (minimaux, sans toucher l'UI)

1. **Filtrer par tenant côté serveur** : dans `compileCompleteState` et `pullChanges` (via `company_id`/`tenantId` en paramètre), toutes les requêtes `WHERE tenantId = req.user.tenantId` (sauf superadmin).
2. **Valider les deltas entrants** : dans `pushChanges`, vérifier `record.tenantId === req.user.tenantId` (ou le dériver du token pour les tables sans tenantId) et rejeter sinon (403).
3. **Retirer `password` de `compileCompleteState`** (ou le remplacer par un flag `hasPassword`).
4. **Retirer la clé par défaut** : exiger `RESET_KEY` dans l'environnement, interdire le fallback, ou utiliser un POST avec corps.
5. **Ajouter `requireActiveTenant`** sur les routes /sync en lecture/écriture.

---

## 12. Plan de correction priorisé

| Priorité | Correctif | Effort | Réf. |
|---|---|---|---|
| P0 | **Filtrer/valider le tenant sur toutes les routes /sync** (lecture + écriture) — faille critique de fuite et d'écriture inter-tenant | 1 j | SEC-1/2/3/10 |
| P0 | **Ne plus laisser la réconciliation détruire les lignes en dead-letter** (exclure les tables avec dead non résolu ; ou ne purger que si le changelog confirme le record absent ET poussé) | 0,5 j | §2.1 |
| P1 | **Atomicité write + logChange** (transaction unique) dans les services de domaine | 1 j | §2.2 |
| P1 | **Supprimer l'inférence de DELETE des enfants embarqués** dans `buildStateChanges` (full-state) | 0,5 j | §2.3 |
| P1 | **Supprimer le fire-and-forget `syncUpFromChangelog`** (ou le protéger par un mutex) pour éliminer la course | 0,5 j | §6.2 |
| P2 | **Numérotation comptable sûre** (compteur persistant + UNIQUE PG) | 1 j | §2.5 |
| P2 | **UUID v4 pour les IDs générés** (ventes, factures, paiements, retours, audits) + vérif d'unicité au push | 0,5 j | §2.6 |
| P2 | **Persister les conflits** (`sync_conflicts`) + unifier la stratégie LWW updatedAt | 1-2 j | §8 |
| P2 | **Retirer `RESET_KEY` en dur** + `password` de `compileCompleteState` | 0,5 j | SEC-5/6 |
| P3 | **Verrou worker avec refresh du mtime à chaque tick** | 0,2 j | §9 |
| P3 | **Index SQLite sur tables de sync** ; index UNIQUE numéros PG (migration 004) | 0,5 j | §4/§5 |
| P3 | **Optimiser le pull** (tables actives, parallélisme, pagination client) | 1-2 j | §10 |
| P3 | **Nettoyer le code mort** (sync_queue, processQueue, get_changes_since SQL, recordChange de la queue) | 0,5 j | §7 |
| P4 | Supprimer `/api/sync/changes` legacy ou le corriger ; confirmer le backup 4096 octets ; `snapshot.ts` chiffré | 0,5 j | §4/§7 |

**Rappel :** aucune modification de l'interface utilisateur nécessaire — les correctifs P0-P1 sont 100 % côté serveur.

---

## 13. Architecture cible (schéma ASCII)

```
                    ┌──────────────────────────────────────────────────┐
                    │            Client React (PWA)                    │
                    │  DBState + Dexie (file deltas persistants)       │
                    │  ─ bootstrap : GET /api/sync (tenant filtré)     │
                    │  ─ écritures : POST /api/sync/push (deltas)      │
                    │  ─ pull : GET /api/sync/pull (paginé, tenant)    │
                    └───────────────┬──────────────────────────────────┘
                                    │
     ┌──────────────────────────────▼──────────────────────────────┐
     │                 Express — API multi-tenant                  │
     │                                                             │
     │  Middleware : authenticateToken → requireActiveTenant      │
     │               → tenantScope(req) (superadmin = all)         │
     │                                                             │
     │  Routes CRUD (filtrent tenantId) + Routes sync (FILTRÉES)   │
     │                                                             │
     │  Services de domaine (transaction unique) :                │
     │    db.transaction(() => {  écriture métier                 │
     │                             + syncEngine.logChange(...) })  │
     │                                                             │
     │  SQLite (source de vérité)                                  │
     │   ├─ tables métier (+ version/updatedAt, soft delete)       │
     │   ├─ sync_changelog  (outbox : retry borné, dead-letter)    │
     │   ├─ sync_deletions  (tombstones locaux → PG)               │
     │   ├─ sync_tracking   (watermarks)                           │
     │   ├─ sync_uuid_map   (sqlite_id ↔ uuid)                     │
     │   ├─ sync_conflicts  (persistance des conflits)  [NEW]      │
     │   └─ invoice_counters (numéros comptables)      [NEW]       │
     │                                                             │
     │  SupabaseWorker (SEUL planificateur, 15 s, backoff)         │
     │   ├─ lock fichier + touch() à chaque tick                   │
     │   ├─ push : changelog → PG (ordre FK, relecture état)       │
     │   ├─ pull : keyset (updated_at,id), watermark transactionnel│
     │   ├─ réconciliation NON destructrice (jamais sur dead)      │
     │   └─ cleanup 7 j / 30 j                                     │
     └───────────────┬──────────────────────────────────────────────┘
                     │
     ┌───────────────▼──────────────────────────────────────────────┐
     │  Supabase (PostgreSQL) — réplica de secours                  │
     │   ├─ index keyset (updated_at, id)                           │
     │   ├─ UNIQUE legacy_id ; UNIQUE (tenant_id, invoice_number)   │
     │   ├─ RLS tenant_isolation (filet, toutes tables)             │
     │   ├─ triggers version/updated_at (version = miroir si voulu) │
     │   └─ [option] sync_deletions_pg pour tombstones PG→local     │
     └──────────────────────────────────────────────────────────────┘
```

**Principes préservés :** SQLite reste la source de vérité d'écriture ; le client ne parle jamais à PG ; un seul planificateur ; outbox unique ; LWW versionné + conflits persistés ; réconciliation non destructive ; toutes les routes filtrées par tenant.

---

## 14. Corrections de code (sans toucher l'UI)

> Extraits ciblés. Aucun fichier UI modifié. Interface publique des modules conservée.

### 14.1 P0 — Réconciliation non destructive (dead-letter protégée)

`src/server/sync/syncService.ts` — `reconcileLocalWithRemote` :

```ts
for (const mapping of TABLE_MAPPINGS) {
  if (NO_LEGACY_ID_TABLES.has(mapping.sqliteName)) continue;
  // Ne JAMAIS réconcilier une table avec des changements en attente…
  if (syncEngine.hasPendingChangesForTable(mapping.sqliteName)) continue;
  // …NI une table avec des changements en dead-letter non résolus :
  // la purge de lignes locales absentes de PG détruirait des données
  // légitimes dont le push a simplement échoué (max_retries atteint).
  if (syncEngine.hasDeadChangesForTable(mapping.sqliteName)) continue;
  …
}
```

`src/server/sync/syncEngine.ts` — ajout :

```ts
hasDeadChangesForTable(tableName: string): boolean {
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM sync_changelog
    WHERE table_name = ? AND status = 'dead'
  `).get(tableName) as { count: number };
  return row.count > 0;
}
```

### 14.2 P1 — Atomicité write + logChange

`src/server/services/domain/saleService.ts` — `create` (le même principe pour `invoiceService.create/update` et les autres services) :

```ts
create(data: any, tenantId: string, userId: string, userName: string): any {
  const saleId = data.id || `sa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const result = this.runInTransaction(() => {
    db.prepare(`INSERT INTO sales …`).run(/* … */);

    for (const item of data.items) {
      // … insert sale_items …
      // logChange DANS la transaction (déjà le cas pour les enfants)
      this.enqueueSyncFor('sale_items', saleItem.id, 'CREATE', { … }, tenantId);
    }

    // … mise à jour stock, crédit, audit …

    // ⚠️ NOUVEAU : la vente principale est journalisée DANS la même
    // transaction que l'écriture métier (avant, enqueueSync était
    // appelé après runInTransaction → fenêtre de crash → perte).
    this.enqueueSync('CREATE', saleId, { …sale, legacy_id: saleId }, tenantId);

    return { id: saleId, ...data };
  });

  return this.getById(saleId);
}
```

Note : `enqueueSyncFor` → `logChange` ouvre une transaction imbriquée (savepoint) — sans risque ici puisque tous deux dans la transaction englobante.

### 14.3 P1 — Suppression de l'inférence de DELETE des enfants (full-state)

`src/server/routes/sync.ts` — `buildStateChanges` : supprimer le bloc « purge des orphelins locaux » (lignes 264-269) pour les parents reçus en full-state, sauf mode bootstrap :

```ts
const bootstrap = clientState.__mode === 'bootstrap'; // déclaré par le client
…
const localChildren = db.prepare(`SELECT id FROM ${child.childTable} WHERE ${child.parentColumn} = ?`).all(record.id) as { id: string }[];
for (const local of localChildren) {
  if (!childIds.has(local.id)) {
    // Suppression d'enfants inférée uniquement en bootstrap explicite
    if (bootstrap) {
      changes.push({ table: child.childTable, recordId: local.id, operation: 'DELETE', data: { id: local.id }, version: 1 });
    }
  }
}
```

### 14.4 P2 — Numérotation comptable sûre

`src/server/services/domain/invoiceService.ts` :

```ts
private nextNumber(tenantId: string, type: 'FAC' | 'BL' | 'RET'): string {
  // Compteur persistant : immune aux suppressions et aux courses multi-instance
  const row = db.prepare(`
    INSERT INTO invoice_counters (tenantId, type, counter, year)
    VALUES (?, ?, 1, ?)
    ON CONFLICT (tenantId, type, year)
    DO UPDATE SET counter = invoice_counters.counter + 1
    RETURNING counter
  `).get(tenantId, type, new Date().getFullYear()) as { counter: number };
  const year = new Date().getFullYear();
  return `${type}-${year}-${String(row.counter).padStart(4, '0')}`;
}
```

Migration 014 (SQLite) + migration 004 (Supabase) :

```sql
-- SQLite
CREATE TABLE IF NOT EXISTS invoice_counters (
  tenantId TEXT NOT NULL,
  type TEXT NOT NULL,
  year INTEGER NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenantId, type, year)
);
-- PostgreSQL
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_tenant_number ON public.invoices (tenant_id, invoice_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_orders_tenant_number ON public.delivery_orders (tenant_id, delivery_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_returns_tenant_number ON public.returns (tenant_id, return_number);
```

### 14.5 P2 — UUID v4 pour les nouveaux IDs

`src/server/services/domain/invoiceService.ts` :

```ts
function genId(prefix: string) {
  // UUID v4 : élimine les collisions entre appareils
  return `${prefix}-${crypto.randomUUID()}`;
}
```

(Le préfixe est conservé pour la lisibilité des logs/legacy_id ; la longueur devient 36+chars → risque de collision quasi nul. Même changement dans `saleService` pour les `sa-…` et `syncEngine` pour `chg-…`/`del-…` si voulu.)

### 14.6 P1 — Suppression de la course fire-and-forget

`src/server/services/domain/baseService.ts` :

```ts
protected enqueueSyncFor(…): void {
  syncEngine.logChange(tableName, recordId, operation, payload, companyId, deviceId);
  // Le SupabaseWorker (15 s) est l'UNIQUE planificateur : plus de
  // syncUpFromChangelog fire-and-forget → fin de la course double-push.
}
```

### 14.7 P0 — Filtrage tenant sur les routes /sync

`src/server/routes/sync.ts` :

```ts
// GET / — compileCompleteState doit être scopé au tenant de l'utilisateur
router.get('/', authenticateToken, (req: AuthenticatedRequest, res, next) => {
  const tenantId = req.user!.tenantId;                       // null = superadmin
  const state = compileCompleteState(tenantId ?? undefined); // WHERE tenantId = ? si défini
  res.json(state);
});

// GET /pull — même scope
router.get('/pull', authenticateToken, (req: AuthenticatedRequest, res, next) => {
  const since = req.query.since as string;
  if (!since) return res.status(400).json({ error: 'Paramètre since requis (ISO timestamp).' });
  const tenantId = req.user!.tenantId ?? undefined;
  const result = syncEngine.pullChanges(since, req.query.table as string | undefined, tenantId);
  res.json(result);
});

// POST /push et POST / — validation tenant des records entrants
function isTenantRecord(userTenantId: string | null, record: any): boolean {
  if (!userTenantId) return true; // superadmin
  const rt = (record && record.tenantId) || (record && record.tenant_id);
  return !rt || rt === userTenantId; // tenantId absent → on dérive du token (voir applyRecord)
}
```

`src/server/sync/syncEngine.ts` — `pushChanges` : après le garde `SYNC_TABLE_SET`, appliquer le scope :

```ts
// validation tenant (paramètre tenantScope passé par la route)
if (tenantScope && !isTenantRecord(tenantScope, data)) {
  result.errors.push({ table, recordId, error: 'tenant mismatch' });
  continue;
}
```

Et `pullChanges(since, tableName?, tenantScope?)` : ajouter `WHERE tenantId = ?` (ou `company_id`) aux requêtes quand le scope est défini (les tables sans colonne tenant — RBAC/système — restent restreintes à la lecture superadmin ou sont exclues).

### 14.8 P2 — Sécurité résiduelle

```ts
// routes/sync.ts — compileCompleteState : ne plus exposer les hashs
const formattedUsers = users.map(u => {
  const { password, ...safe } = u;
  return { ...safe, hasPassword: !!u.password, active: !!u.active, firstLoginReset: !!u.firstLoginReset };
});

// Reset-key : pas de valeur par défaut en code
const RESET_KEY = process.env.RESET_KEY;
if (!RESET_KEY) throw new Error('RESET_KEY manquante dans l\'environnement');
```

### 14.9 P3 — Lock worker avec refresh

`src/server/sync/supabaseWorker.ts` — dans `tick()` (début) :

```ts
private touchLock(): void {
  try { fs.utimesSync(this.lockPath, new Date(), new Date()); } catch { /* ignore */ }
}
```

(appelé à chaque tick → le lock ne devient jamais « stale » tant que le process vit.)

### 14.10 🔴 Correctif prod — 5 échecs `pricing_plans` (doublon de `legacy_id` au push)

**Symptôme :** sur le dashboard admin `/api/sync`, 5 changements `pricing_plans` en dead-letter/failed après une modification de forfait. Exactement 5 = les 5 forfaits seedés (Free, Standard, Pro, Business, Entreprise).

**Cause racine :** `transformToPostgres` (`transform.ts:211-212`) génère `pg.id = getOrCreateUuid(legacy_id)` ; `getOrCreateUuid` **crée un nouvel UUID** quand `sync_uuid_map` n'a pas le mapping local. Or l'upsert conflite sur `id` (`getConflictColumn`, défaut), et PG a un **UNIQUE sur `legacy_id`** (`002_unique_legacy_id_indexes.sql`, y compris `pricing_plans`). Pour une ligne déjà présente en PG (forfait seedé poussé depuis un autre appareil) dont le mapping local est absent (appareil/DB n'ayant jamais pullé ces lignes), l'upsert devenait un INSERT de doublon → `duplicate key value violates unique constraint "idx_pricing_plans_legacy_id_unique"` → retry épuisé → dead-letter.

**Correctif (réalignement du mapping AVANT le push) :**

1. `supabaseService.ts` — `ensureUuidMappingForPush(tableName, recordId)` : si le mapping local est absent, `SELECT id WHERE legacy_id = ?` en PG et enregistre le mapping (best-effort, try/catch) ; `fetchUuidMappings(tableName)` : variante batch (legacy_id → id) pour `fullPush`.
2. `syncService.syncUpFromChangelog` et `supabaseWorker.processChangelog` : appellent `ensureUuidMappingForPush` **avant** `transformToPostgres` (push non-DELETE). `fullPush` : `fetchUuidMappings` + `recordUuidMapping` pour chaque table avant le batch upsert.
3. **Diagnostic :** migration SQLite `015_changelog_last_error` (colonne `last_error`) ; `markChangeFailed(changeId, error)` persiste le message ; `getDeadChanges` le retourne → visible `/api/sync/failed`.

**Test :** `uuidMappingPush.test.ts` (nouveau) — reproduit le scénario (mapping absent + ligne PG existante) et vérifie que le push cible l'UUID PG (`id = <uuid existant>`, jamais un nouveau) + mapping enregistré localement. Suite complète : **142/142 tests verts**.

---

## Annexe A — Liste des tables synchronisées (44)

tenants, users, products, customers, suppliers, warehouses, product_variants, sales, sale_items, expenses, loans, repayments, loan_installments, stock_transfers, invoices, invoice_items, delivery_orders, delivery_order_items, payments, returns, return_items, invoice_audit_log, affiliates, commission_rules, commission_ledger, commission_payments, commission_audit, sale_affiliates, sale_commission_items, audit_logs, delivery_note_audit, roles, permissions, role_permissions, user_roles, module_definitions, plan_modules, tenant_modules, pricing_plans, subscription_invoices, subscription_payments, global_saas_settings, gdrive_tokens. (Priorité FK : `TABLE_SYNC_PRIORITY`.)

## Annexe B — Endpoints /api/sync exposés

| Méthode | Path | Auth | Filtre tenant | Commentaire |
|---|---|---|---|---|
| GET | `/api/sync` | token | ❌ | Bootstrap client — **filtrage requis** (SEC-1) |
| POST | `/api/sync` | token | ❌ | Full-state merge — **validation tenant requise** (SEC-2) |
| POST | `/api/sync/push` | token | ❌ | Deltas — **validation tenant requise** (SEC-2) |
| GET | `/api/sync/pull` | token | ❌ | Pull client — **filtrage requis** (SEC-3) |
| GET | `/api/sync/changes` | token | ❌ | Legacy — filtrer ou supprimer (SEC-4) |
| POST | `/api/sync/full-push` | superadmin | n/a | Push complet |
| POST | `/api/sync/reset-from-cloud` | superadmin | n/a | Repull complet |
| GET | `/api/sync/reset-app` | superadmin + clé | n/a | Reset one-click (clé en dur ⚠️) |
| POST | `/api/sync/clear-local` | superadmin | n/a | Vide SQLite |
| POST | `/api/sync/wipe-all` | superadmin | n/a | SQLite + PG (confirmation WIPE-ALL) |
| GET | `/api/sync/status` / `/overview` / `/failed` | superadmin | n/a | Supervision |
| POST | `/api/sync/retry-failed` | superadmin | n/a | Rejeu dead/failed |
| POST | `/api/sync/trigger` | superadmin | n/a | Cycle manuel |

## Annexe C — Priorités du push (extrait)

0 : tenants, roles, permissions, module_definitions, pricing_plans, global_saas_settings — 1 : users, warehouses, suppliers, customers, products, gdrive_tokens, affiliates, subscription_*, expenses, audit_logs, invoices, loans, role_permissions, tenant_modules, plan_modules — 2 : sales, product_variants, stock_transfers, commission_*, repayments, loan_installments, invoice_items, delivery_orders, payments, returns, invoice_audit_log — 3 : sale_items, sale_affiliates, sale_commission_items, delivery_order_items, return_items, delivery_note_audit.
