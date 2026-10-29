import { requireAuth } from '@/lib/api';
import { getState, listTransactions } from '@/lib/store';
export async function GET(){ const no=await requireAuth(); if(no)return no; const payload={format:'plot-to-ghar-backup-v1',exportedAt:new Date().toISOString(),state:await getState(),transactions:await listTransactions()}; return new Response(JSON.stringify(payload,null,2),{headers:{'Content-Type':'application/json','Content-Disposition':`attachment; filename="plot-to-ghar-backup-${new Date().toISOString().slice(0,10)}.json"`}}); }
