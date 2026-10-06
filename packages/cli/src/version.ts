// Versi CLI dibaca dari package.json agar satu sumber kebenaran (dist/ dan src/ sama-sama satu tingkat di bawah root paket).
import fs from 'node:fs';

export const CLI_VERSION: string = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();
