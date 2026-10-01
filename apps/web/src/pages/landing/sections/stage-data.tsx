import { GitBranch } from 'lucide-react';

export type Stage = {
  name: string;
  status: string;
  renderPreview: () => JSX.Element;
};

export const STAGE_COUNT = 5;

export const stageData: Stage[] = [
  {
    name: 'NUMA BRIEF',
    status: 'Memahami kebutuhan produk',
    renderPreview: () => (
      <>
        <p className="preview-kicker">MULAI DARI SATU PERCAKAPAN</p>
        <div className="idea-bubble">Aku ingin bikin platform booking ruang kerja untuk tim kecil.</div>
        <div className="ai-reply">
          <span className="ai-symbol">
            <GitBranch />
          </span>
          <div>
            <p>
              Kita mulai dari penggunanya.
              <br />
              Siapa yang akan memesan ruang kerja ini?
            </p>
            <div className="reply-options">
              <span className="reply-chip">Tim startup</span>
              <span className="reply-chip">Freelancer</span>
              <span className="reply-chip">Komunitas</span>
            </div>
          </div>
        </div>
      </>
    ),
  },
  {
    name: 'NUMA BLUEPRINT',
    status: 'Fondasi produk terdokumentasi',
    renderPreview: () => (
      <>
        <p className="preview-kicker">IDE MENJADI FONDASI</p>
        <div className="blueprint-file">
          <div className="file-meta">
            <span>PRD.md</span>
            <span>VERSI 1.0</span>
          </div>
          <h4>Ruang Kerja / Blueprint</h4>
          <p>Platform booking ruang kerja untuk tim kecil. Fokus versi pertama: ketersediaan ruang dan reservasi.</p>
          <div className="code-lines">
            <span className="key">frontend</span> &nbsp; Next.js
            <br />
            <span className="key">database</span> &nbsp; PostgreSQL
            <br />
            <span className="key">cakupan</span> &nbsp;&nbsp; Cari · Pilih · Booking
          </div>
        </div>
      </>
    ),
  },
  {
    name: 'NUMA FLOW',
    status: 'Dependency terpetakan',
    renderPreview: () => (
      <>
        <p className="preview-kicker">SETIAP FITUR PUNYA TEMPAT</p>
        <div className="flow-tree">
          <div className="flow-node main">Ruang Kerja</div>
          <div className="flow-branches">
            <div className="flow-node">Autentikasi</div>
            <div className="flow-node">Katalog</div>
            <div className="flow-node">Booking</div>
          </div>
          <div className="flow-branches">
            <div className="flow-node">API reservasi</div>
            <div className="flow-node">Konfirmasi</div>
          </div>
          <p className="flow-dependencies">3 fitur utama · dependency terarah</p>
        </div>
      </>
    ),
  },
  {
    name: 'NUMA FORGE',
    status: 'Task memiliki konteks dan batas kerja',
    renderPreview: () => (
      <>
        <p className="preview-kicker">DARI FITUR KE PEKERJAAN KONKRET</p>
        <div className="task-board">
          <div>
            <p className="task-column-title">SIAP DIKERJAKAN / 02</p>
            <div className="task-card">
              <small>NMF-012</small>
              <p>Buat endpoint booking</p>
              <span className="task-badge">Backend</span>
            </div>
            <div className="task-card">
              <small>NMF-013</small>
              <p>Form reservasi ruang</p>
              <span className="task-badge">Frontend</span>
            </div>
          </div>
          <div>
            <p className="task-column-title">SELESAI / 01</p>
            <div className="task-card">
              <small>NMF-011</small>
              <p>Skema data ruang</p>
              <span className="task-badge">Tervalidasi</span>
            </div>
          </div>
        </div>
      </>
    ),
  },
  {
    name: 'NUMA AGENT',
    status: 'Task siap diambil agent lokal',
    renderPreview: () => (
      <>
        <p className="preview-kicker">LANJUTKAN DI TERMINALMU</p>
        <div className="mini-terminal">
          <strong>$ numa next</strong>
          <br />
          → NMF-012 · Endpoint booking
          <br />
          <br />
          <strong>$ numa context</strong>
          <br />
          1 file scope · 3 acceptance criteria
          <br />
          Dependency tervalidasi
          <br />
          <br />
          <strong>Siap dieksekusi di repo lokal.</strong>
        </div>
      </>
    ),
  },
];
