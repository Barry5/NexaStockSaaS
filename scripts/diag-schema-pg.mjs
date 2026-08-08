import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const url = process.env.SUPABASE_URL.replace(/"/g, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY.replace(/"/g, '');

const res = await fetch(`${url}/rest/v1/?apikey=${key}`, {
  headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' },
});
const spec = await res.json();

const keys = Object.keys(spec.components?.schemas || {}).filter(k => /delivery_orders|user_roles/i.test(k));
console.log('Schémas trouvés:', keys.join(', '));

for (const k of keys) {
  const props = spec.components.schemas[k]?.properties;
  console.log(`\n${k}: ${props ? Object.keys(props).join(', ') : '(aucune propriété)'}`);
}
process.exit(0);
