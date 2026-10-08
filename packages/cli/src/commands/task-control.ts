// Kontrol task di luar alur normal: retry dan block.
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
