import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

async function main() {
  console.log('Démarrage de la migration SQLite -> Supabase...');
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'configured' : 'missing');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'configured' : 'missing');

  const { migrationService } = await import('../src/server/services/migrationService.js');
  const result = await migrationService.migrateAll((progress) => {
    const done = progress.filter(p => p.status === 'completed' || p.status === 'failed').length;
    const total = progress.length;
    console.log(`Progression: ${done}/${total} tables`);
    for (const p of progress) {
      if (p.status === 'running') process.stdout.write(`  \r-> ${p.table}: ${p.migrated}/${p.total}`);
      if (p.status === 'failed') console.error(`  X ${p.table}: ${p.error}`);
    }
  }, true);
  console.log('\nResultat final:');
  for (const r of result.results) {
    const icon = r.status === 'completed' ? 'OK' : r.status === 'failed' ? 'FAIL' : '?';
    console.log(`  ${icon} ${r.table}: ${r.migrated}/${r.total} (${r.status})`);
  }
  console.log(`\nTotal: ${result.totalMigrated} migres, ${result.totalErrors} erreurs`);
  process.exit(result.success ? 0 : 1);
}

main();
