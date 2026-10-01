import type { RefObject } from 'react';
import { Terminal, LockKeyhole, Copy, RotateCcw } from 'lucide-react';

type Props = {
  terminalRef: RefObject<HTMLDivElement>;
  onReplayTerminal: () => void;
  onCopyCommand: () => void;
};

export function AgentTerminalSection({ terminalRef, onReplayTerminal, onCopyCommand }: Props) {
  return (
    <section id="agent" className="agent-section page-shell scroll-reveal">
      <div className="agent-copy">
        <p className="eyebrow">
          <span className="status-dot"></span>DARI WORKSPACE KE TERMINALMU
        </p>
        <h2>
          Rencana yang bisa
          <br />
          langsung dikerjakan.
        </h2>
        <p>
          Hubungkan Numa ke coding agent lokal. Ambil task, baca konteks, validasi hasil. Semua dalam satu alur
          yang bisa ditelusuri.
        </p>
        <button
          type="button"
          className="button button-lime button-small"
          id="replay-terminal"
          onClick={onReplayTerminal}
        >
          Jalankan simulasi
          <Terminal />
        </button>
        <p className="agent-footnote">
          <LockKeyhole />
          Kode dikerjakan di repo lokalmu.
        </p>
      </div>

      <div className="terminal-window">
        <div className="terminal-title">
          <div className="terminal-dots" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span>numa-agent — simulasi</span>
          <div className="terminal-actions">
            <button
              type="button"
              id="copy-command"
              aria-label="Salin perintah numa next"
              onClick={onCopyCommand}
            >
              <Copy />
            </button>
            <button
              type="button"
              id="reset-terminal"
              aria-label="Ulangi simulasi terminal"
              onClick={onReplayTerminal}
            >
              <RotateCcw />
            </button>
          </div>
        </div>
        <div className="terminal-code" id="terminal-code" ref={terminalRef}>
          <p className="terminal-line">
            <span className="prompt">$</span>numa next
          </p>
          <p className="terminal-line dim" style={{ '--delay': '.5s' } as React.CSSProperties}>
            Mengambil task berikutnya…
          </p>
          <p className="terminal-line gap" style={{ '--delay': '1.1s' } as React.CSSProperties}>
            <span className="pass">→</span>NMF-012 · Buat endpoint booking
          </p>
          <p className="terminal-line dim" style={{ '--delay': '1.6s' } as React.CSSProperties}>
            &nbsp;&nbsp;scope &nbsp; <span className="task-file">src/api/bookings.ts</span>
          </p>
          <p className="terminal-line dim" style={{ '--delay': '2.1s' } as React.CSSProperties}>
            &nbsp;&nbsp;layer &nbsp; Backend / API
          </p>
          <p className="terminal-line gap" style={{ '--delay': '2.6s' } as React.CSSProperties}>
            <span className="pass">✓</span>Dependency sudah terpenuhi
          </p>
          <p className="terminal-line" style={{ '--delay': '3.1s' } as React.CSSProperties}>
            <span className="pass">✓</span>3 acceptance criteria tersedia
          </p>
          <p className="terminal-line" style={{ '--delay': '3.6s' } as React.CSSProperties}>
            <span className="prompt">$</span>
            <span className="terminal-cursor"></span>
          </p>
        </div>
      </div>
    </section>
  );
}
