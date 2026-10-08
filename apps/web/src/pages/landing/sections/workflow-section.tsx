import { ArrowUpRight, GitBranch, Box, ArrowRight } from 'lucide-react';
import { stageData } from './stage-data';

const steps = [
  {
    num: '01',
    title: 'Numa Brief',
    desc: 'Mulai dari percakapan. Pertajam masalah, kenali pengguna, dan temukan kebutuhan yang benar-benar penting.',
  },
  {
    num: '02',
    title: 'Blueprint',
    desc: 'Pilih tech stack yang selaras. Susun PRD dengan kebutuhan, batasan, dan kontrak arsitektur yang jelas.',
  },
  {
    num: '03',
    title: 'Flow',
    desc: 'Pecah produk jadi fitur. Lihat dependency dan urutan pengerjaan dalam roadmap yang saling terhubung.',
  },
  {
    num: '04',
    title: 'Forge',
    desc: 'Setiap task punya file scope, acceptance criteria, dan perintah validasi. Agent tahu persis batas pekerjaannya.',
  },
  {
    num: '05',
    title: 'Agent',
    desc: 'Jalankan task dengan coding agent di komputermu. Pilih mode: konfirmasi di setiap akhir layer, atau otomatis sampai semua task selesai.',
  },
];

type Props = {
  selectedStage: number;
  onSelectStage: (index: number) => void;
  onTabKeyDown: (e: React.KeyboardEvent, index: number) => void;
};

export function WorkflowSection({ selectedStage, onSelectStage, onTabKeyDown }: Props) {
  return (
    <section id="alur" className="workflow-section page-shell">
      <div className="section-heading scroll-reveal">
        <div className="heading-with-index">
          <span className="section-index">01</span>
          <h2 className="section-title">
            Bukan sekadar prompt.
            <br />
            Sebuah proses berpikir.
          </h2>
        </div>
        <p className="body-copy">
          Ide yang baik butuh konteks yang utuh. Numa menghubungkan setiap keputusan, dari percakapan pertama sampai
          task terakhir.
        </p>
      </div>

      <div className="workflow-grid scroll-reveal">
        <div>
          <div className="step-list" role="tablist" aria-label="Tahapan kerja Numa">
            {steps.map((step, idx) => {
              const isActive = selectedStage === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  className={`step-tab ${isActive ? 'active' : ''}`}
                  id={`step-${idx}`}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls="workflow-panel"
                  tabIndex={isActive ? 0 : -1}
                  data-step={idx}
                  onClick={() => onSelectStage(idx)}
                  onKeyDown={(e) => onTabKeyDown(e, idx)}
                >
                  <span className="step-header">
                    <span className="step-num">{step.num}</span>
                    <strong>{step.title}</strong>
                    <ArrowUpRight />
                  </span>
                  <span className="step-description">{step.desc}</span>
                </button>
              );
            })}
          </div>
          <p className="step-meta">
            <GitBranch />
            Konteks tetap terhubung di setiap tahap.
          </p>
        </div>

        <div>
          <div
            className="workflow-preview"
            id="workflow-panel"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby={`step-${selectedStage}`}
          >
            <div className="preview-toolbar">
              <span className="preview-project">
                <Box />
                Proyek / Ruang Kerja
              </span>
              <span id="preview-stage" className="preview-tag">
                {stageData[selectedStage].name}
              </span>
            </div>
            <div className="preview-content" id="preview-content" key={selectedStage}>
              {stageData[selectedStage].renderPreview()}
            </div>
            <div className="preview-footer">
              <span>
                <span className="status-dot"></span>
                <span id="preview-status">{stageData[selectedStage].status}</span>
              </span>
              <span>ILUSTRASI WORKSPACE</span>
            </div>
          </div>

          <div className="workflow-note">
            <span>Klik tahap untuk menjelajahi alurnya.</span>
            <button type="button" id="next-step" onClick={() => onSelectStage(selectedStage + 1)}>
              Tahap berikutnya
              <ArrowRight />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
