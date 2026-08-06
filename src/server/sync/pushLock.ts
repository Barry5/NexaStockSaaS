// Verrou de sérialisation des push vers Supabase (M1 audit).
// Le SupabaseWorker (15 s), les fire-and-forget (SyncRepository, POST /api/sync)
// et les endpoints manuels (/trigger) peuvent appeler syncUpFromChangelog
// concurrentment. Sans verrou, deux exécuteurs lisent les MÊMES items du
// changelog et les poussent deux fois (versions PG gonflées, DELETE vs UPDATE
// en course). Ce verrou en mémoire sérialise tous les exécuteurs d'un process.

let chain: Promise<unknown> = Promise.resolve();

// Exécute `fn` de manière exclusive : les appels concurrents sont mis en file
// et exécutés l'un après l'autre. Retourne la promesse de `fn`.
export function withPushLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(() => fn());
  // La chaîne continue même si `fn` rejette (l'appelant gère l'erreur).
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
