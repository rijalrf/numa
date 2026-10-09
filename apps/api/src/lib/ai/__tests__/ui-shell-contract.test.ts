import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveStackContract } from '../stack-contract.js';
import {
  findSharedFile,
  isEndpointFile,
  renderUiShellContract,
  resolveUiCheck,
  resolveUiShellContract,
  summarizeUiShell,
} from '../ui-shell-contract.js';

const stack = (frontend: string, backend: string, styling = 'Tailwind CSS') =>
  ({ ...resolveStackContract([]), frontend: { framework: frontend, version: null }, backend: { framework: backend, version: null }, styling });

test('resolveUiShellContract: kunci berdasarkan framework FRONTEND dengan fallback generic', () => {
  assert.equal(resolveUiShellContract(stack('Next.js', 'Next.js')).key, 'nextjs');
  assert.equal(resolveUiShellContract(stack('React', 'Express')).key, 'react-spa');
  assert.equal(resolveUiShellContract(stack('Vue', 'NestJS')).key, 'vue-spa');
  assert.equal(resolveUiShellContract(stack('Blade', 'Laravel')).key, 'laravel-blade');
  assert.equal(resolveUiShellContract(stack('Svelte', 'Express')).key, 'generic');
  assert.equal(resolveUiShellContract(undefined).key, 'react-spa');
});

test('kontrak Next.js: layout publik dan aplikasi, pemilik file bersama jelas', () => {
  const c = resolveUiShellContract(stack('Next.js', 'Next.js'));
  assert.equal(findSharedFile(c, 'src/app/layout.tsx')?.owner, 'BOOTSTRAP');
  assert.equal(findSharedFile(c, 'src/app/providers.tsx')?.owner, 'FONDASI_UI');
  assert.equal(findSharedFile(c, 'src/lib/api-client.ts')?.owner, 'FONDASI_UI');
  assert.equal(findSharedFile(c, 'src/components/ui/Button.tsx')?.owner, 'FONDASI_UI');
  assert.equal(findSharedFile(c, 'src/lib/validations/auth.schema.ts')?.owner, 'BACKEND');
  assert.equal(findSharedFile(c, 'src/app/(app)/appointments/page.tsx'), undefined);
  const text = renderUiShellContract(c);
  assert.match(text, /Layout publik/);
  assert.match(text, /dibuat oleh task Fondasi UI/);
  assert.match(summarizeUiShell(c).join('\n'), /File bersama: src\/middleware\.ts/);
});

test('isEndpointFile mengenali file endpoint per stack', () => {
  const next = resolveUiShellContract(stack('Next.js', 'Next.js'));
  assert.equal(isEndpointFile(next, 'src/app/api/doctors/route.ts'), true);
  assert.equal(isEndpointFile(next, 'src/app/(app)/doctors/page.tsx'), false);
  assert.equal(isEndpointFile(resolveUiShellContract(stack('React', 'Express')), 'apps/api/src/routes/x.ts'), true);
  assert.equal(isEndpointFile(resolveUiShellContract(stack('Blade', 'Laravel')), 'routes/api.php'), true);
  assert.equal(isEndpointFile(resolveUiShellContract(stack('Svelte', 'Express')), 'src/app/api/x/route.ts'), false);
});

test('resolveUiCheck: hanya untuk stack Tailwind yang dikenali', () => {
  const cfg = resolveUiCheck(stack('Next.js', 'Next.js'));
  assert.deepEqual(cfg?.extensions, ['.tsx', '.jsx']);
  assert.ok(cfg?.exempt.includes('src/components/ui/**'));
  assert.equal(resolveUiCheck(stack('Next.js', 'Next.js', 'CSS Modules')), null);
  assert.equal(resolveUiCheck(stack('Svelte', 'Express')), null);
  assert.equal(resolveUiCheck(undefined), null);
});
