import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
dotenv.config({ path: '../.env.local' });

import { migrationService } from '../src/server/services/migrationService.js';

async function main() {
  console.log('Démarrage de la migration SQLite → Supabase...');
  try {
    const result = await migrationService.migrateAll((progress) => {
      const done = progress.filter(p => p.status === 'completed').length;
      const total = progress.length;
      console.log(`Progression: ${done}/${total} tables`);
    });
    console.log('Résultat:', JSON.stringify(result, null, 2));
    if (result.success) {
      console.log('Migration terminée avec succès!');
    } else {
      console.error('Migration terminée avec des erreurs.');
      result.results.filter(r => r.status === 'failed').forEach(r => {
        console.error(`  ${r.table}: ${r.error}`);
      });
    }
    process.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error('Erreur fatale:', err);
    process.exit(1);
  }
}

main();
