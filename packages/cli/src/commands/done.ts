// Logic command `done` — tandai task selesai + runtime scope guard + optional auto-commit.
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { api, ensureActiveProject } from '../api-client.js';
import { runGuard, GuardError, generateConventionalCommit, gitCommit } from '../guard.js';

export type DoneOptions = {
  force?: boolean;
  dir?: string;
  summary?: string;
  commit?: boolean;
};

export async function runDone(id?: string, opts?: DoneOptions): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.token) {
    console.error('Belum login. Jalankan: numa login <token>');
    process.exit(1);
  }
  if (!(await ensureActiveProject(cfg))) {
    process.exit(1);
  }
  const taskId = id ?? cfg.activeTaskId;
  if (!taskId) {
    console.error('Tidak ada task aktif. Jalankan: numa next');
    process.exit(1);
  }

  if (!opts?.force) {
    // Ambil guard spec dari context endpoint
    const ctx = await api.context(cfg, taskId);
    if (ctx.guard) {
      const cwd = opts?.dir ?? process.cwd();
      try {
        await runGuard(ctx.guard, cwd, taskId);
      } catch (e) {
        if (e instanceof GuardError) {
          console.error(e.message);
          if (e.failureContext) {
            try {
              const dir = path.join(cwd, '.numa');
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(
                path.join(dir, 'failure-context.json'),
                JSON.stringify(e.failureContext, null, 2),
                'utf-8'
              );
            } catch {}
            console.error('\n=== FAILURE CONTEXT (STRUCTURED JSON) ===');
            console.error(JSON.stringify(e.failureContext, null, 2));

            try {
              await api.fail(cfg, taskId, e.failureContext);
            } catch {}
          }
          process.exit(1);
        }
        throw e;
      }
    } else {
      console.log('Task ini tidak memiliki guard spec. Lewati validasi lokal.');
    }
  } else {
    console.log('--force: lewati runtime scope guard.');
  }

  if (opts?.commit) {
    const cwd = opts?.dir ?? process.cwd();
    try {
      const taskCtx = await api.context(cfg, taskId);
      const match = taskCtx.markdown.match(/^###\s*\[TASK\s*(\d+)\]\s*(.+)$/m);
      const order = match ? Number(match[1]) : undefined;
      const title = match ? match[2].trim() : 'Selesaikan task';
      const layerMatch = taskCtx.markdown.match(/\*\*Layer\*\*:\s*([A-Za-z0-9_]+)/i);
      const layer = layerMatch ? layerMatch[1] : (taskCtx.guard?.layer ?? 'feat');

      const commitMessage = generateConventionalCommit({ title, layer, order });
      console.log(`\nMenjalankan git commit otomatis:`);
      console.log(`> ${commitMessage.split('\n')[0]}`);
      const commitOut = await gitCommit(commitMessage, cwd);
      if (commitOut) console.log(commitOut);
      console.log('Berhasil membuat commit git.');
    } catch (commitErr: any) {
      console.warn(`Peringatan: Git commit otomatis gagal: ${commitErr?.message ?? commitErr}`);
    }
  }

  const r = await api.done(cfg, taskId, { outputSummary: opts?.summary });
  console.log(`Task ${r.taskId} -> ${r.status}`);
  if (r.checkpointPending) {
    console.log(`\n!!! CHECKPOINT PENDING !!!`);
    console.log(`Layer ${r.layer} selesai. Berhenti dan minta approval user sebelum lanjut ke layer berikutnya.`);
  } else {
    console.log(`-> Lanjut: numa next`);
  }
}
