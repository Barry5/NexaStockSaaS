# Rapport d'analyse — Synchronisation SQLite ↔ Supabase

**Projet :** NexaStock SaaS
**Branche :** `sync` (worktree `sqlite-supabase-sync-analysis`)
**Date :** 2026-08-04
**Objectif :** Évaluer la fiabilité de la synchronisation, proposer la meilleure option et planifier les corrections.

---

## 1. Verdict

> **La synchronisation n'est PAS fiable dans son état actuel.**
> Elle est *convergente par accident* (les données finissent souvent par être correctes), mais elle contient
> **deux vecteurs de perte de données silencieuse** (suppression de masse par snapshot périmé, records
> sautés par pagination à offset), une **double écriture systématique** de chaque changement vers
> PostgreSQL (inflation des versions, garde-fou de conflit neutralisé), et **aucune propagation des
> suppressions effectuées côté Supabase** vers SQLite.

Le problème n'est pas Supabase ni SQLite : c'est l'architecture du moteur de sync, qui superpose
**3 mécanismes de push concurrents**, **2 planificateurs indépendants** et **2 mécanismes de pull**
dont un qui ne lit même pas Supabase.

---

## 2. Architecture actuelle (constatée dans le code)

```
Client React (PWA)
  ├─ Dexie queue client (src/lib/syncQueue.ts)          → POST /api/sync/push  (deltas)
  ├─ Full-state POST /api/sync (DBContext.tsx fullSync) → merge INSERT OR REPLACE + inférence de DELETE
  └─ Pull 30 s via GET /api/sync/pull                    → lit SQLite du serveur (PAS Supabase !)
        │
        ▼
Serveur Express (SQLite = source de vérité)
  ├─ sync_queue      (écrite par baseService.enqueueSync + syncEngine.recordChange)
  ├─ sync_changelog  (écrite UNIQUEMENT par syncEngine.recordChange = chemins client)
  ├─ sync_deletions  (tombstones locaux → PG)
  ├─ sync_tracking   (watermarks last_sync_at par table)
  └─ sync_uuid_map   (mapping sqlite_id ↔ uuid PG)

  Planificateur A : syncService.startBackgroundSync(60 s)   [server.ts:47]
      → syncUp() (queue) + syncUpFromChangelog() + syncDown()
  Planificateur B : supabaseWorker.start() (15 s, backoff)  [server.ts:48]
      → processQueue() + processChangelog() + syncDown() + cleanup
        │
        ▼
Supabase (PostgreSQL) = réplica central (triggers version/updated_at)
```

### Les 3 chemins de push (même changement poussé plusieurs fois)

| Chemin | Déclencheur | Écrit PG ? |
|---|---|---|
| `sync_queue` → `syncUp()` / `processQueue()` | toute écriture service (baseService.enqueueSync) | oui |
| `sync_changelog` → `syncUpFromChangelog()` / `processChangelog()` | tout changement client (pushChanges) | oui — **re-pousse le même changement** |
| Full-state `POST /api/sync` + `enqueueStateDeletions()` | toute synchro "complète" du client | indirectement (file + changelog) |

Conséquence : **chaque changement venant du client est poussé 2 fois vers PG** (queue puis changelog),
et les 2 planificateurs tournent **simultanément** (60 s + 15 s) → jusqu'à **4 écritures** du même
record dans la même minute. Le trigger PG `trigger_set_updated_at_with_version`
(`supabase/migrations/001_full_schema.sql:21`) incrémente `version` à chaque écriture :
les versions PG sont donc **gonflées en permanence**, ce qui désactive le garde-fou de conflit du pull
(`syncService.ts:352` — `if (localVersion > 0 && remoteVersion > 0 && localVersion > remoteVersion) continue`).

---

## 3. Défauts identifiés (classés par gravité)

### 🔴 CRITIQUE — perte de données silencieuse

**C1. `enqueueStateDeletions` : inférence de suppression depuis un snapshot client périmé**
`src/server/routes/sync.ts:208-230` (appelé ligne 1005).
À chaque POST d'état complet, le serveur compare les IDs reçus aux IDs en SQLite et **enfile des DELETE
pour tout ID absent du payload client**. Tout client avec un cache Dexie effacé, ou qui n'a pas encore
récupéré l'état serveur (mode offline), écrase la base avec un état partiel → **suppression de masse
sur SQLite puis sur PostgreSQL**. C'est le risque de destruction le plus grave de l'application.
Exemple : cache client vide + réseau perdu → l'utilisateur crée 3 produits → retour en ligne →
`POST /api/sync` avec 3 produits → les 500 produits existants sont détectés "supprimés" → supprimés partout.

**C2. Pagination à offset sur `updated_at` identiques → records sautés au pull**
`src/server/services/supabase/supabaseService.ts:129-142` (`getChangesSince`) : `.order('updated_at')`
sans clé de départage + `.range(offset, offset+99)` + `.gte(since)`.
Les triggers PG utilisent `NOW()` (horodatage de transaction) : **tous les records d'un même batch
d'upsert (50) portent le même `updated_at`**. Quand un lot chevauche une frontière de page, l'ordre est
indéterministe → des records sont **sautés définitivement** (le watermark avance quand même,
`syncService.ts:173`). Données jamais récupérées sans fullPull manuel.

**C3. Le merge full-state `INSERT OR REPLACE` efface les colonnes locales non listées**
`src/server/routes/sync.ts:565-996`. Chaque table a une liste fixe de colonnes ; tout le reste
(`version`, `updatedAt`, `deletedAt`, `sync_status`, colonnes ajoutées par migration 010) est
**remis à sa valeur par défaut** à chaque sync client. Ex : `version` repasse à 1 →
le mécanisme de résolution de conflit par version est invalidé, et un record localement supprimé
(soft-delete `deletedAt`) est **ressuscité** par un client qui envoie l'ancien snapshot.
De plus, plusieurs tables ne sont **pas du tout** couvertes par ce merge : `sale_affiliates`,
`sale_commission_items`, `roles`, `permissions`, `user_roles`, `module_definitions`, `plan_modules`,
`delivery_note_audit` → les changements client sur ces tables sont **silencieusement perdus**.

### 🟠 MAJEUR — incohérences / corruption de convergence

**M1. Double push systématique + double planificateur**
- `server.ts:47-48` démarre `startBackgroundSync(60000)` **et** `supabaseWorker.start()` (15 s) → 2 boucles
  indépendantes qui font chacune queue + changelog + down.
- `syncService.ts:51` (`syncUp`, queue) et `syncService.ts:88` (`syncUpFromChangelog`) poussent le même
  record ; le worker fait pareil (`supabaseWorker.ts:113` et `:118`).
- Inflation des versions PG (trigger) → garde-fou `syncService.ts:352` **ne se déclenche plus**
  (local toujours < remote) → le pull écrase systématiquement le local par le remote.
- Sur les DELETEs, double `delete` idempotent mais qui masque les erreurs réelles.

**M2. Course sur `sync_queue` (pas de réservation atomique)**
`dequeue` (`syncQueue.ts:46`) sélectionne les items `pending` **sans les réserver** ; `markProcessing`
(`syncService.ts:67`) intervient *après*. Deux workers (A et B) peuvent donc déqueue les mêmes items
simultanément → double envoi concurrent → versions PG incrémentées en double.

**M3. Suppressions côté Supabase jamais propagées vers SQLite**
`syncDown` (`syncService.ts:124`) ne récupère que des changements (`updated_at`), jamais de tombstones.
Une ligne supprimée directement dans PG (admin, fullPush d'un autre environnement, wipe partiel) reste
**fantôme en SQLite** indéfiniment. Côté client, `pullChanges` (`syncEngine.ts:195`) lit
`sync_deletions` local — le sens inverse n'existe pas.

**M4. Retry incohérents entre les deux chemins**
- Queue : plafond `max_retries = 5` (`syncQueue.ts:50`) puis abandon silencieux (donnée jamais poussée).
- Changelog : **aucun plafond** (`getChangesForSupabase`, `syncEngine.ts:226`) → un item défaillant est
  retenté **à l'infini** (chaque cycle, spam réseau, pas de dead-letter).

**M5. Le pull client ne lit pas Supabase**
`GET /api/sync/pull` (`routes/sync.ts:525`) lit **SQLite local** via `syncEngine.pullChanges`
(`syncEngine.ts:195`). Le client dépend donc du serveur, qui lui-même tire de PG → chaîne de 2 étages,
avec watermark `sync_tracking` local au serveur : si le serveur n'a pas encore fini son propre
syncDown, le client tire du périmé ; aucun mécanisme de rattrapage.

**M6. Watermark = `now()` au lieu de `max(updated_at)` des records reçus**
`updateLastSyncTime` (`syncQueue.ts:98`) est appelé avec l'heure courante (`syncService.ts:173`) :
les records insérés dans PG pendant le pull (entre deux pages) et avec `updated_at < now()` peuvent être
**sautés jusqu'à la synchro suivante**, et définitivement s'ils tombent juste après la dernière page.

**M7. Écriture locale + enqueue non atomique**
`baseService.enqueueSync` (`baseService.ts:57-62`) appelle `enqueue` **après** l'écriture SQLite,
hors transaction : si l'enqueue échoue (ou crash entre les deux), le changement n'est **jamais poussé**.

**M8. Payload de file = snapshot périmé**
`enqueue` sérialise le record au moment de l'écriture (`syncQueue.ts:38-41`). Si le record est modifié
à nouveau avant le push, la file pousse **l'ancien état** ; si le dernier item échoue (5 retries),
PG reste avec une valeur obsolète que le pull ré-écrira ensuite en local (car version PG > locale).
Le changelog a le même défaut (`new_values` = snapshot).

### 🟡 MINEUR

- **m1.** `transformFromPostgres` (`transform.ts:241-246`) : FK UUID non résolue → `null` ; si l'ordre
  de pull d'une table seule casse les dépendances, les FK locales sont nullées.
- **m2.** Conflits : `pushChanges` utilise `remote_wins` codé en dur (`syncEngine.ts:130`, `:352-363`) ;
  `conflictResolver.ts` (LWW) n'est **jamais utilisé** par le pipeline réel.
- **m3.** `extractChanges` client (`api/sync.ts:178-214`) : diff `JSON.stringify` d'états entiers —
  des champs dérivés déclenchent de faux UPDATE ; un changement de type (nombre↔chaîne) régénère des deltas
  en boucle.
- **m4.** `getChangesSinceByCreatedAt` (tables sans `updated_at`) ne capture pas les UPDATE
  (`supabaseService.ts:149-162`) — assumé, mais = divergence permanente possible.
- **m5.** `wipeLocalData` (`routes/sync.ts:447`) vide `sync_tracking`/`sync_changelog` mais conserve
  `sync_uuid_map` (volontaire) — après wipe, les items de queue résiduels d'une autre table peuvent
  référencer des records disparus.
- **m6.** `incrementVersion` (`syncEngine.ts:80-87`) : `catch {}` silencieux — sur les tables sans
  colonne `updatedAt`, la version en base n'est pas incrémentée mais le changelog la croit incrémentée.
- **m7.** Aucun locking multi-process : si Fly scale > 1, les 2 workers par instance dédoublent les
  écritures et les `sync_uuid_map` divergent par instance → FK cassées. (`fly.toml` force
  `min_machines_running = 1` — fragile, à verrouiller.)
- **m8.** `cleanupPushedRecords` (`syncEngine.ts:296`) purge les changelog poussés > 7 j — ok, mais les
  items `failed` de la queue restent **à vie** (pas de purge) → tables de sync en croissance.

### ✅ Ce qui est déjà solide (à conserver)

1. `sync_uuid_map` : mapping stable sqlite_id ↔ UUID PG — indispensable, bien fait (avec fallback `CREATE IF NOT EXISTS`).
2. Priorité de tables par dépendance FK (`TABLE_SYNC_PRIORITY`, `syncTables.ts:65`) : excellente idée, à garder.
3. Tombstones locaux `sync_deletions` + propagation des DELETE même si le record a disparu (`syncEngine.ts:105-120`).
4. Backoff exponentiel du worker (`supabaseWorker.ts:36-53`).
5. Tableau de bord superadmin (overview/failed/retry-failed) : bonne base de supervision.
6. Tests E2E existants (`syncService.e2e.test.ts`, `syncScenario.test.ts`).

---

## 4. Options de synchronisation comparées

| Option | Effort | Fiabilité | Offline réel | Adapté au projet ? |
|---|---|---|---|---|
| **A. Réparer le pipeline actuel (recommandé)** | 2-4 sem | Haute (une fois les 4 bugs critiques corrigés) | Déjà gérée (SQLite serveur = cache unique) | ✅ Oui — reste dans l'existant |
| B. Full push/pull périodique (supprimer les deltas) | 1-2 sem | Moyenne (correcte à petit volume, ne scale pas) | Oui | ⚠️ Acceptable < 100 k lignes |
| C. PowerSync / ElectricSQL (SDK de sync offline-first) | 6-10 sem | Haute (éprouvé) | Oui (client réel) | ❌ Surcharge : le client lit déjà via API serveur ; le "offline" n'existe que côté serveur |
| D. Supabase Realtime seul | 2 sem | Faible (canal d'événements, pas une sync) | Non | ❌ Ne résout rien seul |
| E. Abandonner SQLite, tout écrire dans PG | 3-6 sem | Élevée (une seule source) | Non (dépendance réseau) | ⚠️ Contre l'ADN du projet (mode offline garantit l'usage POS en Guinée) |

**Contexte décisif :** l'application a **un seul serveur Express** avec un SQLite partagé (les PWA
clientes passent toutes par l'API du serveur). Il n'y a pas de multi-client SQLite à synchroniser entre
eux : le problème de sync est **uniquement serveur ↔ PostgreSQL**. Adopter PowerSync/ElectricSQL pour
résoudre un problème qui n'existe que sur un seul nœud serait une sur-ingénierie.

### Recommandation : Option A — un pipeline unique, correct et idempotent

**Principe :** SQLite reste la source de vérité d'écriture ; PG devient un réplica de secours (reprise
sur crash, restauration, supervision). **Un seul mécanisme de push (changelog), un seul planificateur
(worker), un seul mécanisme de pull (watermark + curseur).** Le client ne communique qu'avec le
serveur, jamais avec PG.

---

## 5. Plan d'implémentation des corrections

### Phase 1 — Éliminer les chemins redondants (0,5 sem, supprime C1 partiellement + M1/M2/M4/M7)

1. **Désactiver `syncService.startBackgroundSync`** (`server.ts:47`) → seul `supabaseWorker.start()`
   pilote la sync. (`server.ts:52` aussi en mode dégradé).
2. **Supprimer le chemin queue du push** : `syncUp()`/`processQueue`/`enqueue` ne servent plus —
   tout passe par `sync_changelog` (les services `baseService.enqueueSync` → appellent
   `syncEngine.recordChange` à la place, dans la **même transaction SQLite** que l'écriture métier).
   - *Conséquence* : plus de double push, plus de course, plus de snapshot périmé dans la file
     (le changelog est poussé avec l'état courant via un `SELECT *` au moment du push, pas un snapshot).
   - Fichiers : `server.ts`, `baseService.ts:57-62`, `syncService.ts:51-86`, `supabaseWorker.ts:162-195`,
     `syncQueue.ts` (garder uniquement `sync_tracking`), `syncEngine.recordChange`.
3. **Retry borné sur le changelog** : colonne `retry_count`/`max_retries` sur `sync_changelog`
   (migration 013) ; au-delà → `status = 'dead'`, visible dans `/api/sync/failed` (dead-letter).
4. **`dequeue` avec réservation atomique** si la queue est conservée pour compat :
   `UPDATE ... SET status='processing' WHERE id = ? AND status='pending'` (check `changes === 1`).

### Phase 2 — Sécuriser le pull (0,5 sem, corrige C2, M3, M6)

5. **Pagination par curseur** : `.order('updated_at').order('id').gt('updated_at', since).or(...)` —
   en pratique : requête `(updated_at, id) > (since, lastId)` avec `order('updated_at').order('id')`
   et filtrage composite (`gt` sur updated_at **ou** égalité + `gt` sur id), via RPC PostgreSQL
   dédiée (voir `supabase/migrations/003_sync_rpc.sql` ci-dessous) pour rester simple et indexé.
6. **Watermark correct** : `last_sync_at = max(updated_at)` des records réellement reçus pour la
   table (jamais `now()`), mis à jour **dans la même transaction** que l'écriture locale.
7. **Propagation des suppressions PG → SQLite** : ajouter un tombstone PG par table
   (`deleted_at` soft-delete partout — la colonne existe déjà en local) + détection au pull :
   pour les tables concernées, requête des records `deleted_at >= since` → soft-delete local.
   Alternative immédiate : dans `syncDown`, comparer les comptages et lancer un
   `fullPull` ciblé de la table en cas d'écart (réconciliation périodique).

### Phase 3 — Éliminer le full-state client (1 sem, corrige C1, C3, m1)

8. **Désactiver l'inférence de suppression par snapshot** : `enqueueStateDeletions`
   (`routes/sync.ts:208-230`) est **supprimé** (ou strictement restreint au cas
   `bootstrap initial`, jamais en continu).
9. **Le `POST /api/sync` full-state devient un point d'entrée de bootstrap uniquement**
   (réinitialisation du cache client), remplacé par le delta push existant
   (`/api/sync/push` → `pushChanges`), qui est correct et versionné.
10. **Supprimer le `POST /api/sync` merge INSERT OR REPLACE** (routes/sync.ts:565-996) au profit
    d'une réécriture via le moteur commun (`upsertBatchToLocal` versionné — déjà utilisé par
    `syncDown`), qui préserve toutes les colonnes et la version.
11. **Client** (`DBContext.tsx`) : retirer `fullSync`/`syncWithServer` du flux normal ; ne garder que
    `fetchServerState()` (bootstrap) + flush/pull incrémental existants.

### Phase 4 — Fiabiliser la convergence (1 sem, corrige M8, m2, m6, m7)

12. **Résolution de conflit unifiée** : remplacer le `remote_wins` codé en dur (`syncEngine.ts:130`,
    `:352-363`) par le `ConflictResolver` existant (LWW : `updatedAt` ISO comme ordre total,
    version en backup) appliqué **à l'identique** sur push et pull, avec enregistrement des conflits
    dans le changelog (`conflict_resolved` existe déjà).
13. **Atomicité write+changelog** : `db.transaction(() => { write; recordChange; })` dans
    `baseService`/`pushChanges`.
14. **Défense contre le wipe client** : côté serveur, tout DELETE émis par un client ne peut cibler
    que des IDs que ce client a **créés** (champs `device_id`/`created_by` existants) — sinon refus.
15. **Sécurité multi-process** : lock file (`process`/`flight`) dans `supabaseWorker` pour garantir
    un seul worker actif par volume de données.
16. **Nettoyage** : purge des `failed`/`dead` > 30 j (superadmin confirmé).

### Phase 5 — Vérification (0,5 sem)

17. Tests à écrire / compléter (`src/server/sync/`):
    - Double worker → **une seule** écriture PG (mock `batchUpsert` compté).
    - Batch de 50 records à `updated_at` identique chevauchant 2 pages → aucun record perdu.
    - Cache client vide → aucun DELETE dérivé d'un snapshot partiel.
    - Record modifié localement puis pull → le local gagne (version + updatedAt).
    - Suppression PG → soft-delete local dans les 2 cycles.
    - Crash entre write et changelog → aucun changement non journalisé (transaction).
18. Scénario de reprise : `fullPull` ciblé + `retry-failed` après déploiement.

### Migration SQL suggérée (Phase 2)

```sql
-- supabase/migrations/003_sync_rpc.sql
CREATE OR REPLACE FUNCTION public.sync_changes_after(
  p_table text, p_since timestamptz, p_last_id uuid, p_limit int
) RETURNS SETOF record AS $$
DECLARE
  r record;
BEGIN
  FOR r IN EXECUTE format(
    'SELECT * FROM %I WHERE updated_at > %L
       OR (updated_at = %L AND id > %L)
     ORDER BY updated_at, id LIMIT %L', p_table, p_since, p_since, p_last_id, p_limit)
  LOOP
    RETURN NEXT r;
  END LOOP;
END $$ LANGUAGE plpgsql STABLE;
```

---

## 6. Ordre de priorité pour le déploiement

| # | Correction | Impact | Effort |
|---|---|---|---|
| 1 | Supprimer l'inférence de DELETE par snapshot (C1) | 🔴 **évite la perte de masse** | 1 j |
| 2 | Un seul planificateur + un seul chemin de push (M1/M2) | 🟠 stabilité, versions | 1 j |
| 3 | Pagination curseur + watermark max(updated_at) (C2/M6) | 🔴 évite les records sautés | 1 j |
| 4 | Merge full-state → upsert versionné (C3) | 🟠 fin du wipe de colonnes | 1-2 j |
| 5 | Retry borné + dead-letter changelog (M4) | 🟠 visibilité | 0,5 j |
| 6 | Tombstones PG → SQLite (M3) | 🟠 cohérence | 1-2 j |
| 7 | Atomicité write+journal, conflits LWW unifiés (M7/m2) | 🟠 convergence | 1 j |
| 8 | Tests E2E du pipeline unique (Phase 5) | 🟢 régression | 1-2 j |

**Total estimé : 8-10 jours** pour un moteur de sync fiable, sans changer l'architecture
fondamentale du projet.

---

## 7. État d'avancement — Phases 1 et 2 implémentées (2026-08-04)

### Phase 1 — Pipeline unique (fait)

| Correction | Fichiers | Détail |
|---|---|---|
| Un seul planificateur | `server.ts`, `sync/supabaseWorker.ts` | `startBackgroundSync` = no-op (`syncService.ts`). `tick()` = `processChangelog` + `syncDown` + réconciliation (`%20`) + cleanup (`%10`). Plus de `processQueue` dans le tick. |
| Un seul chemin de push | `services/domain/baseService.ts`, `repositories/syncRepository.ts`, `sync/syncEngine.ts` | Les écritures métier appellent `syncEngine.logChange()` (changelog) au lieu de `enqueue` (queue). Déclenchement immédiat fire-and-forget de `syncUpFromChangelog` si en ligne. La queue `sync_queue` n'est plus écrite que par le drain legacy unique au démarrage (`server.ts`). |
| Retry borné + dead-letter | `database/migrations/013_changelog_retry.ts`, `syncEngine.ts` | `retry_count`/`max_retries`(10)/`status`(`pending/failed/dead/pushed`). `getChangesForSupabase` filtre `status != 'dead' AND retry_count < max_retries`. `markChangeFailed` incrémente et passe `dead` au-delà. `resetDeadChanges`/`getDeadChanges` branchés sur `/api/sync/retry-failed` et `/failed`. |
| Réservation atomique `dequeue` | `sync/syncQueue.ts` | `UPDATE sync_queue SET status='processing' WHERE id IN (...) AND status='pending'` (ordre de dépendance conservé). |
| Index PostgreSQL | `supabase/migrations/003_sync_indexes.sql` | Index composés `(updated_at, id)` / `(created_at, id)` pour la pagination curseur (avec gardes `information_schema`). |

### Phase 2 — Pull sécurisé (fait)

| Correction | Fichiers | Détail |
|---|---|---|
| Pagination curseur keyset | `services/supabase/supabaseService.ts`, `sync/syncService.ts` | `getChangesSince`/`getChangesSinceByCreatedAt(table, since, limit, cursor)` : `.order(col).order('id')`, page 1 `gt(col, since)`, suivantes `.or('and(col.eq.X,id.gt.Y),col.gt.X')`. `syncDown` boucle curseur par pages de 100, `cursor = { updatedAt, id }` du dernier record. |
| Watermark correct | `sync/syncQueue.ts`, `sync/syncService.ts` | `updateLastSyncTime(table, watermark)` : `last_sync_at = max(updated_at)` des records **réellement reçus**, avancé **dans la même transaction** que les upserts locaux, jamais régressé. |
| Propagation des suppressions PG → SQLite | `sync/syncService.ts`, `sync/upabaseWorker.ts` | `reconcileLocalWithRemote()` tous les 20 cycles : `countRemoteRows` vs comptage local, purge des lignes locales absentes de PG (`fetchAllLegacyIds` + tombstone `sync_deletions` à `pushed=1`), puis `syncDown` ciblé. Jamais sur `NO_LEGACY_ID_TABLES` ni tables avec changements en attente. |
| Push d'état courant | `sync/syncService.ts`, `sync/supabaseWorker.ts` | `getCurrentRecordForPush` : relecture `SELECT *` au moment du push (jamais de snapshot périmé). |

### Modifications d'API

- `getChangesSince(table, since, limit=100, cursor?)` — l'ancienne signature avec offset disparaît.
- `sync_changelog` : nouvelles colonnes `retry_count`, `max_retries`, `status` (migration 013, DEFAULTs).
- `startBackgroundSync` : no-op (avertissement console).

### Phase 3 — Full-state sécurisé (fait, côté serveur)

| Correction | Détail |
|---|---|
| **C1 supprimé** : fin de l'inférence de DELETE par snapshot | `enqueueStateDeletions` (`routes/sync.ts`) supprimé. Un état client partiel ne peut plus provoquer de suppression de masse. Les DELETEs ne sont propagés que s'ils sont déclarés **explicitement** (`deletions: [{table, recordId}]` ou chemin delta `/api/sync/push`). |
| **C3 corrigé** : merge versionné via le moteur commun | Les 24 blocs INSERT OR REPLACE bruts (~400 lignes) sont remplacés par `buildStateChanges()` → `syncEngine.pushChanges()` : LWW par version, journalisation `sync_changelog` (propagation PG), enfants embarqués (variants, items, repayments, installments) en deltas enfants + purge des orphelins locaux. |
| Garde-fou anti-régression (Phase 4, M8 partiel) | `pushChanges` : tout UPDATE/CREATE dont `clientVersion < serverVersion` (les deux > 0) est refusé — conflit journalisé `strategy: 'server_wins'`, l'état local plus récent n'est jamais écrasé par un snapshot périmé. |

### Phase 4 — Convergence (partiel)

| Correction | Détail |
|---|---|
| Verrou multi-process (M5) | `supabaseWorker.acquireLock()` : lock fichier `.supabase-worker.lock` (à côté de la DB), stale > 10 min récupérable, libéré sur `stop()`. Un seul worker actif par volume de données. |
| Purge des diagnostics (m6) | `cleanupPushedRecords` : `failed` (queue) et `dead` (changelog) purgés après 30 j (7 j pour le reste), toujours visibles via `/api/sync/failed` entre-temps. |

### Reste à faire (non approuvé)

- Client (`DBContext.tsx`) : retirer `fullSync`/`syncWithServer` du flux normal (bootstrap uniquement) — le POST full-state reste compatible mais n'est plus indispensable.
- Conflits LWW par `updatedAt` ISO (le garde-fou actuel est LWW par *version*), atomicité write+changelog dans `baseService` (écriture métier + `logChange` dans une même transaction), défense contre le wipe client (DELETE restreint aux IDs créés par le client).
- Tests E2E réseau réel (pagination curseur sur `updated_at` identiques, double worker → une seule écriture PG).

**Statut :** `npm run lint` OK, `npm test` 141/141 OK (dont 5 nouveaux tests Phase 3/4 : pas de DELETE inféré, LWW anti-régression, suppressions explicites, lock worker, purge 30 j).
