// Prompt interaktif sederhana tanpa dependency: input rahasia (tidak di-echo) dan konfirmasi y/N.
import readline from 'node:readline';

export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/** Baca satu baris dari stdin non-TTY (mis. `echo $TOKEN | numa login`). */
async function readLineFromPipe(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin });
  return new Promise((resolve) => {
    let done = false;
    rl.once('line', (line) => {
      done = true;
      rl.close();
      resolve(line.trim());
    });
    rl.once('close', () => {
      if (!done) resolve('');
    });
  });
}

export async function readSecret(question: string): Promise<string> {
  if (!process.stdin.isTTY) return readLineFromPipe();

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Sembunyikan echo: tulis prompt sendiri lalu bisukan output readline.
    const rlAny = rl as unknown as { _writeToOutput: (s: string) => void };
    process.stdout.write(question);
    rlAny._writeToOutput = () => {};
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
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
