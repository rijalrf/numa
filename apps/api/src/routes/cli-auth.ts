// Login CLI lewat browser (device code). start/poll dipanggil CLI tanpa sesi; approve/deny dipanggil web dengan sesi user.
import { Router } from 'express';
import { z } from 'zod';
import { recordAudit } from '../lib/audit.js';
import { getPublicWebUrl } from '../lib/config.js';
import { describeCliAuth, pollCliAuth, resolveCliAuth, startCliAuth } from '../lib/cli-auth.js';
import { requireUser, type AuthedRequest } from '../middleware/require-user.js';

export const cliAuthRouter = Router();

const StartBody = z.object({ clientName: z.string().max(200).optional() });
const PollBody = z.object({ deviceCode: z.string().min(16).max(200) });
const CodeBody = z.object({ code: z.string().min(4).max(20) });

cliAuthRouter.post('/api/cli-auth/start', async (req, res) => {
  const { clientName } = StartBody.parse(req.body ?? {});
  const started = await startCliAuth(clientName);
  const verificationUrl = `${getPublicWebUrl()}/cli-login`;
  res.status(201).json({
    ...started,
    verificationUrl,
    verificationUrlComplete: `${verificationUrl}?code=${encodeURIComponent(started.userCode)}`,
  });
});

cliAuthRouter.post('/api/cli-auth/poll', async (req, res) => {
  const { deviceCode } = PollBody.parse(req.body ?? {});
  const result = await pollCliAuth(deviceCode);
  switch (result.state) {
    case 'approved':
      await recordAudit({
        action: 'token.create',
        actorUserId: result.userId,
        targetType: 'AgentToken',
        targetId: result.tokenId,
        metadata: { via: 'cli_device_login', allProjects: true, expiresAt: result.expiresAt },
        req,
      });
      return res.json({ status: 'approved', token: result.token, expiresAt: result.expiresAt });
    case 'pending':
      return res.status(202).json({ status: 'pending' });
    case 'slow_down':
      return res.status(429).json({ status: 'slow_down', error: 'Polling terlalu rapat. Ikuti interval yang diberikan.' });
    case 'denied':
      return res.status(403).json({ status: 'denied', error: 'Permintaan login ditolak di browser.' });
    default:
      return res.status(410).json({ status: 'expired', error: 'Kode login kedaluwarsa atau sudah dipakai. Jalankan ulang perintah.' });
  }
});

cliAuthRouter.get('/api/cli-auth/request', requireUser, async (req: AuthedRequest, res) => {
  const code = String(req.query.code ?? '');
  const info = code ? await describeCliAuth(code) : null;
  if (!info) return res.status(404).json({ error: 'Kode login tidak ditemukan.' });
  res.json({ userCode: info.userCode, clientName: info.clientName, status: info.status, expiresAt: info.expiresAt, expired: info.expired });
});

for (const decision of ['approved', 'denied'] as const) {
  cliAuthRouter.post(`/api/cli-auth/${decision === 'approved' ? 'approve' : 'deny'}`, requireUser, async (req: AuthedRequest, res) => {
    const { code } = CodeBody.parse(req.body ?? {});
    const resolved = await resolveCliAuth(code, req.userId, decision);
    if (!resolved) {
      return res.status(404).json({ error: 'Kode login tidak ditemukan, sudah diproses, atau kedaluwarsa.', code: 'cli_auth_unavailable' });
    }
    await recordAudit({
      action: decision === 'approved' ? 'cli.login.approve' : 'cli.login.deny',
      actorUserId: req.userId,
      targetType: 'CliAuthRequest',
      targetId: resolved.id,
      metadata: { clientName: resolved.clientName },
      req,
    });
    res.json({ ok: true, status: decision, clientName: resolved.clientName });
  });
}
