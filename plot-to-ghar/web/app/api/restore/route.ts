import { NextResponse } from 'next/server';
import { requireAuth, err } from '@/lib/api';
import { replaceAll } from '@/lib/store';
import { validateBackupData } from '@/lib/backup-validation';

export async function POST(req: Request) {
  const no = await requireAuth();
  if (no) return no;
  try {
    if (req.headers.get('x-confirm-restore') !== 'RESTORE') throw new Error('Restore confirmation missing');
    const backup = await req.json();
    if (!['plot-to-ghar-backup-v1', 'plot-to-ghar-backup-v2'].includes(backup.format)) {
      throw new Error('Unsupported backup format');
    }
    if (!backup.state || !Array.isArray(backup.transactions)) throw new Error('Invalid backup');
    if (backup.transactions.length > 100000) throw new Error('Backup is too large');

    // Older versions legitimately contain unlinked historical refunds and
    // unsplit EMIs. Keep them visible with integrity warnings, not deleted.
    const validated = validateBackupData(backup);
    await replaceAll(validated.state, validated.transactions);
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return err(e);
  }
}
