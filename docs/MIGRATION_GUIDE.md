# Guide de Migration NexaStock vers Supabase + PostgreSQL

## Architecture

```
Avant                          Après
─────────────────────────────────────────────────
React App                     React App (inchangé)
    │                              │
    ▼                              ▼
Express API                   Express API
    │                              │
    ▼                              ▼
SQLite (seul)              SQLite (local) ←→ Supabase (central)
                              ▲              │
                              │         [Sync Service]
                              │              │
                          [Repository]  [Sync Queue]
```

**Principe fondamental :** SQLite reste la source de vérité locale.
Toute opération est d'abord écrite dans SQLite, puis synchronisée vers Supabase.

---

## Fichiers Créés

### Base de Données

| Fichier | Description |
|---------|-------------|
| `supabase/migrations/001_full_schema.sql` | Script complet de création des tables PostgreSQL |

### Synchronisation

| Fichier | Description |
|---------|-------------|
| `src/server/sync/syncQueue.ts` | File d'attente de synchronisation (table sync_queue) |
| `src/server/sync/syncService.ts` | Moteur de synchronisation complet (up/down) |
| `src/server/sync/conflictResolver.ts` | Résolution des conflits (stratégies) |
| `src/server/sync/index.ts` | Re-export des services de sync |

### Repositories

| Fichier | Description |
|---------|-------------|
| `src/server/repositories/baseRepository.ts` | Interface Repository générique |
| `src/server/repositories/localRepository.ts` | Implémentation SQLite du Repository |
| `src/server/repositories/remoteRepository.ts` | Implémentation Supabase du Repository |
| `src/server/repositories/syncRepository.ts` | Repository synchronisé (local + remote) |
| `src/server/repositories/index.ts` | Instances partagées des repositories |

### Services

| Fichier | Description |
|---------|-------------|
| `src/server/services/supabase/supabaseService.ts` | Client Supabase (admin + anon) |
| `src/server/services/migrationService.ts` | Migration SQLite → Supabase |

### Types

| Fichier | Description |
|---------|-------------|
| `src/types/sync.ts` | Types pour la synchronisation |
| `src/types/supabase.ts` | Types pour Supabase |
| `src/types/conflict.ts` | Types pour la gestion de conflits |

### Configuration

| Fichier | Modification |
|---------|--------------|
| `package.json` | Ajout de `@supabase/supabase-js` et `uuid` |
| `.env.example` | Ajout des variables SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY |

---

## Installation

### 1. Installer les dépendances

```bash
npm install @supabase/supabase-js uuid
```

### 2. Configurer Supabase

1. Créez un projet sur [supabase.com](https://supabase.com)
2. Dans `Settings → Database`, récupérez les identifiants
3. Exécutez le script SQL de migration :
   ```bash
   # Via Supabase SQL Editor : copier-coller supabase/migrations/001_full_schema.sql
   # Ou via CLI :
   psql "$SUPABASE_DATABASE_URL" -f supabase/migrations/001_full_schema.sql
   ```

### 3. Configurer les variables d'environnement

```env
SUPABASE_URL="https://votre-projet.supabase.co"
SUPABASE_ANON_KEY="votre-clé-anon"
SUPABASE_SERVICE_ROLE_KEY="votre-clé-service"
```

### 4. Migrer les données existantes

```bash
# Route API pour déclencher la migration (superadmin uniquement)
POST /api/admin/migrate
```

---

## Intégration avec le Code Existant

### Étape 1: Initialiser le SyncService

Dans `server.ts`, ajoutez après `initializeDatabase()` :

```typescript
import { syncService } from './src/server/sync/syncService.js';

// Après initializeDatabase()
await syncService.initialize();
syncService.startBackgroundSync(300000); // 5 minutes
```

### Étape 2: Remplacer les accès directs à SQLite par des Repositories

**Avant :**
```typescript
import db from '../database/db.js';
const products = db.prepare('SELECT * FROM products WHERE tenantId = ?').all(tenantId);
```

**Après :**
```typescript
import { productRepository } from '../repositories/index.js';
const products = productRepository.getAll(tenantId);
```

Pour les créations :
```typescript
const newProduct = productRepository.create(productData, companyId, deviceId);
// La sync est automatique !
```

### Étape 3: Ajouter les endpoints de sync

```typescript
// Dans server.ts
import syncRouter from './src/server/routes/sync.js';
import { syncService } from './src/server/sync/syncService.js';

// Endpoint status sync
app.get('/api/sync/status', authenticate, (req, res) => {
  res.json(syncService.getStatus());
});

// Endpoint sync manuelle
app.post('/api/sync/now', authenticate, async (req, res) => {
  const result = await syncService.fullSync(req.body.direction || 'both');
  res.json(result);
});
```

---

## Structure des Fichiers Après Migration

```
src/
├── server/
│   ├── sync/
│   │   ├── index.ts
│   │   ├── syncQueue.ts
│   │   ├── syncService.ts
│   │   └── conflictResolver.ts
│   ├── repositories/
│   │   ├── index.ts
│   │   ├── baseRepository.ts
│   │   ├── localRepository.ts
│   │   ├── remoteRepository.ts
│   │   └── syncRepository.ts
│   ├── services/
│   │   ├── supabase/
│   │   │   └── supabaseService.ts
│   │   └── migrationService.ts
│   └── ... (existants inchangés)
├── types/
│   ├── index.ts                 (existant, enrichi)
│   ├── sync.ts                  (NOUVEAU)
│   ├── supabase.ts              (NOUVEAU)
│   └── conflict.ts              (NOUVEAU)
└── ... (existant inchangé)
```

---

## Flux de Données

### Création d'un enregistrement

```
1. App → productRepository.create(data)
2.     → LocalRepository.create(data)     → Écrit dans SQLite
3.     → SyncQueue.enqueue('CREATE')       → Ajoute à la file
4.     → syncService.syncUp()              → Pousse vers Supabase
5.         → ConflictResolver.resolve()    → Gère les conflits si besoin
6.         → RemoteRepository.upsert()     → Écrit dans PostgreSQL
```

### Lecture

```
1. App → productRepository.getAll()
2.     → LocalRepository.getAll()  → Lit depuis SQLite uniquement
```

### Synchronisation descendante

```
1. syncService.syncDown()
2.     → getChangesSince()         → Récupère les modifs Supabase
3.     → ConflictResolver.resolve() → Gère les conflits
4.     → upsertBatchToLocal()       → Met à jour SQLite
```

---

## Stratégie de Résolution des Conflits

| Stratégie | Description | Utilisation |
|-----------|-------------|-------------|
| `last_write_wins` | Le plus récent gagne (basé sur version + updated_at) | **Par défaut** |
| `local_wins` | La version locale est prioritaire | Mode hors-ligne forcé |
| `remote_wins` | La version serveur est prioritaire | Après restauration |
| `manual` | L'utilisateur choisit champ par champ | Conflits critiques |

---

## Checklist Pré-Production

- [ ] Supabase project créé et actif
- [ ] Script SQL exécuté (toutes les tables créées)
- [ ] RLS policies fonctionnelles
- [ ] Variables d'environnement configurées
- [ ] Dépendances installées (`npm install`)
- [ ] SyncService initialisé au démarrage
- [ ] Migration des données existantes réussie
- [ ] Tests de sync effectués (up + down)
- [ ] Mode offline fonctionnel (création sans Internet)
- [ ] Résolution de conflits testée
- [ ] Backup SQLite fonctionnel
- [ ] Performance validée (temps de sync)
- [ ] Rollback possible (script de fallback prêt)
