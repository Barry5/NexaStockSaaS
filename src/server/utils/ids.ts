import { randomUUID } from 'crypto';

// UUID v4 (audit §2.6, S7) : les IDs précédents (Date.now()+random) pouvaient
// entrer en collision à la même milliseconde entre appareils (deux postes de
// caisse, mobile + desktop). Le préfixe est conservé pour la lisibilité des
// logs et le mapping legacy_id -> id côté Supabase.
export function genId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}
