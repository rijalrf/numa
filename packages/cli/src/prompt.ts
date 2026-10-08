// Prompt interaktif sederhana tanpa dependency: konfirmasi y/N dan deteksi sesi interaktif.
import readline from 'node:readline';

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export async function confirm(question: string): Promise<boolean> {
  if (!isInteractive()) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}
