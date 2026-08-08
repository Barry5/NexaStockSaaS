import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const { transformToPostgres } = await import('../src/server/services/supabase/transform.js');
const db = (await import('../src/server/database/db.js')).default;
const { getAdminClient } = await import('../src/server/services/supabase/supabaseService.js');

const doRow = db.prepare(`SELECT * FROM delivery_orders WHERE id = ?`).get('do-1784793627584-630');
console.log('SQLite row keys:', Object.keys(doRow));
const pg = transformToPostgres('delivery_orders', doRow);
console.log('Transformé ->', JSON.stringify(pg, null, 1));

const urRow = db.prepare(`SELECT * FROM user_roles WHERE id = ?`).get('ur-u-1-role-owner');
const urPg = transformToPostgres('user_roles', urRow);
console.log('user_roles transformé ->', JSON.stringify(urPg, null, 1));

const client = getAdminClient();
const { data: cols, error } = await client.from('delivery_orders').select('*').limit(1);
console.log('delivery_orders PG error:', error?.message || 'aucune, colonnes:', cols?.[0] ? Object.keys(cols[0]).join(',') : '(table vide)');
const { data: ur, error: urErr } = await client.from('user_roles').select('*').limit(1);
console.log('user_roles PG error:', urErr?.message || 'aucune, colonnes:', ur?.[0] ? Object.keys(ur[0]).join(',') : '(table vide)');
process.exit(0);
