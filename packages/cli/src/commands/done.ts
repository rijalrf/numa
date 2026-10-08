// Logic command `done` — tandai task selesai + runtime scope guard + optional auto-commit.
import fs from 'node:fs';
import path from 'node:path';
import { api, type GuardReportPayload } from '../api-client.js';
import { runGuard, GuardError, generateConventionalCommit, gitCommit } from '../guard.js';
import { requireSession, resolveTaskId } from '../session.js';
import { loadTaskState } from '../task-state.js';
import { CLI_VERSION } from '../version.js';

export type DoneOptions = {
  force?: boolean;
  dir?: string;
  summary?: string;
  commit?: boolean;
  allowUnlisted?: boolean;
};

export async function runDone(id?: string, opts?: DoneOptions): Promise<void> {
  const cfg = await requireSession();
  const taskId = resolveTaskId(cfg, id);
  const cwd = opts?.dir ?? process.cwd();

  let guardReport: GuardReportPayload | undefined;
  const forced = opts?.force === true;

  if (!forced) {
    // Ambil guard spec dari context endpoint
    const ctx = await api.context(cfg, taskId);
    if (ctx.guard) {
      try {
        guardReport = await runGuard(ctx.guard, cwd, taskId, {
          state: loadTaskState(cwd, taskId),
          allowUnlisted: opts?.allowUnlisted,
        });
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
    console.log('--force: runtime scope guard dilewati. Penggunaan --force akan tercatat di server.');
    guardReport = { baseline: null, changedFiles: [], outOfScopeFiles: [], commands: [], cliVersion: CLI_VERSION };
  }

  if (opts?.commit) {
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

  const r = await api.done(cfg, taskId, { outputSummary: opts?.summary, forced, guardReport });
  console.log(`Task ${r.taskId} -> ${r.status}`);
  if (r.allTasksDone) {
    console.log(`\nSemua task project sudah selesai (layer ${r.layer} adalah yang terakhir).`);
    console.log('-> Lanjut: jalankan aplikasi seperti di Master Prompt, lalu numa sync.');
  } else if (r.layerCompleted) {
    // Informasi netral: mode eksekusi di Master Prompt menentukan berhenti (konfirmasi per layer) atau lanjut (otomatis penuh).
    console.log(`\nLayer ${r.layer} selesai (tidak ada task tersisa di layer ini).`);
    console.log('-> Ikuti mode eksekusi di Master Prompt: konfirmasi per layer = berhenti dan minta konfirmasi user; otomatis penuh = lanjut dengan: numa next');
  } else {
    console.log(`-> Lanjut: numa next`);
  }
}
