import { ScanLine, GitPullRequest, Terminal, RefreshCcw } from 'lucide-react';

export function KendaliSection() {
  return (
    <section id="kendali" className="control-section">
      <div className="control-grid page-shell scroll-reveal">
        <div className="control-heading">
          <p className="eyebrow">
            <span className="tiny-line"></span>02 / KONTEKS JELAS. KENDALI PENUH.
          </p>
          <h2 className="section-title">
            Agent yang bekerja.
            <br />
            Kamu yang memegang arah.
          </h2>
          <p className="body-copy">
            Lebih sedikit menebak, lebih banyak membangun. Beri agent konteks yang tepat, dengan batas yang bisa
            kamu percaya.
          </p>
        </div>
        <div className="control-features">
          <article className="control-feature">
            <ScanLine />
            <h3>Batas kerja yang tegas</h3>
            <p>File yang boleh diubah, larangan, dan kriteria selesai ada di setiap task.</p>
          </article>
          <article className="control-feature">
            <GitPullRequest />
            <h3>Checkpoint, bukan tebak-tebakan</h3>
            <p>Review hasil di setiap pergantian layer. Lanjut setelah kamu setuju.</p>
          </article>
          <article className="control-feature">
            <Terminal />
            <h3>Tetap di lingkunganmu</h3>
            <p>Eksekusi di repo lokal dengan coding agent dan terminal pilihanmu.</p>
          </article>
          <article className="control-feature">
            <RefreshCcw />
            <h3>Perubahan tetap terencana</h3>
            <p>Ide berkembang? Change Cycle menyusun task baru setelah siklus selesai.</p>
          </article>
        </div>
      </div>
    </section>
  );
}
