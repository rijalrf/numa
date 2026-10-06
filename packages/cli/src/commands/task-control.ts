// Kontrol task di luar alur normal: retry, block, dan daftar checkpoint.
import { api } from '../api-client.js';
import { requireSession, resolveTaskId } from '../session.js';

export async function runRetry(id?: string): Promise<void> {
  const cfg = await requireSession();
  const taskId = resolveTaskId(cfg, id);
  try {
    const r = await api.retry(cfg, taskId);
    console.log(`Task ${r.taskId} -> ${r.status}`);
    console.log('-> Lanjut: numa start');
  } catch (e: any) {
    console.error(`Error: ${e?.message || e}`);
    process.exit(1);
  }
}

export async function runBlock(id: string | undefined, opts: { reason?: string }): Promise<void> {
  const reason = opts.reason?.trim();
  if (!reason) {
    console.error('Alasan wajib diisi: numa block --reason "<alasan>"');
    process.exit(1);
  }
  const cfg = await requireSession();
  const taskId = resolveTaskId(cfg, id);
  try {
    const r = await api.block(cfg, taskId, reason);
    console.log(`Task ${r.taskId} -> ${r.status}`);
    console.log(`Alasan : ${r.blockedReason}`);
    console.log('Berhenti dan laporkan hambatan ini ke user. Task dapat diulang dengan: numa retry');
  } catch (e: any) {
    console.error(`Error: ${e?.message || e}`);
    process.exit(1);
  }
}

export async function runCheckpoint(): Promise<void> {
  const cfg = await requireSession();
  try {
    const r = await api.checkpoints(cfg);
    if (r.checkpoints.length === 0) {
      console.log('Tidak ada checkpoint yang menunggu approval.');
      return;
    }
    console.log(`${r.checkpoints.length} checkpoint menunggu approval:\n`);
    for (const c of r.checkpoints) {
      const mark = c.id === r.blockingId ? ' [MEMBLOKIR AGENT]' : '';
      console.log(`- ${c.type}${c.layer ? ` (layer ${c.layer})` : ''}${mark}`);
      if (c.message) console.log(`  ${c.message}`);
    }
    console.log('\nApproval hanya bisa dilakukan user lewat web Numa (halaman Board). Berhenti sampai disetujui.');
  } catch (e: any) {
    console.error(`Error: ${e?.message || e}`);
    process.exit(1);
  }
}
