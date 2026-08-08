import dotenv from 'dotenv'; dotenv.config(); dotenv.config({path:'.env.local',override:true});
import { getAdminClient } from '../src/server/services/supabase/supabaseService.js';
const a = getAdminClient();
for (const t of ['invoices','invoice_items','invoice_affiliates','invoice_commission_items','affiliates','sales']){
  const {count,e} = await a.from(t).select('id',{count:'exact',head:true});
  console.log(t, e? 'ERR '+e.message.replace(/\n/g,' ') : (count+' rows'));
}
