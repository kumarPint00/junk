import { NextResponse } from 'next/server';
import { requireAuth, err } from '@/lib/api';
import { replaceAll } from '@/lib/store';
export async function POST(req:Request){ const no=await requireAuth(); if(no)return no; try{ if(req.headers.get('x-confirm-restore')!=='RESTORE') throw new Error('Restore confirmation missing'); const b=await req.json(); if(b.format!=='plot-to-ghar-backup-v1'||!b.state||!Array.isArray(b.transactions)) throw new Error('Invalid backup'); await replaceAll(b.state,b.transactions); return NextResponse.json({ok:true}); }catch(e){return err(e);} }
