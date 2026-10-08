import { Plus } from 'lucide-react';

export function FaqSection() {
  return (
    <section id="faq" className="faq-section page-shell scroll-reveal">
      <div className="faq-heading">
        <p className="eyebrow">
          <span className="tiny-line"></span>SEBELUM MULAI
        </p>
        <h2>
          Mungkin ini
          <br />
          yang kamu pikirkan.
        </h2>
      </div>

      <div className="faq-list">
        <details>
          <summary>
            Apakah Numa langsung menulis kode?
            <Plus />
          </summary>
          <p>
            Numa menyiapkan konteks, PRD, roadmap, dan task. Coding agent di komputermu yang mengeksekusi task
            melalui Numa CLI. Kamu tetap meninjau hasil implementasinya dan bisa memilih konfirmasi di setiap akhir layer.
          </p>
        </details>
        <details>
          <summary>
            Bisa pakai coding agent yang sudah kupakai?
            <Plus />
          </summary>
          <p>
            Numa menyediakan Master Prompt dan CLI untuk coding agent yang bisa menjalankan perintah terminal,
            seperti Claude Code. Ikuti panduan koneksi pada proyek untuk memberikan agent akses ke konteks dan task.
          </p>
        </details>
        <details>
          <summary>
            Bagaimana kalau kebutuhanku berubah di tengah jalan?
            <Plus />
          </summary>
          <p>
            Setelah semua task pada siklus aktif selesai, kamu bisa memulai Change Cycle. Numa meninjau perubahan PRD
            dan dampaknya, lalu menyiapkan siklus task baru.
          </p>
        </details>
        <details>
          <summary>
            Apakah cocok untuk proyek pertamaku?
            <Plus />
          </summary>
          <p>
            Free Trial memberi ruang untuk 1 proyek dan 1 putaran survey. Numa ditujukan untuk developer dan
            technical founder yang memahami dasar pengembangan software serta memakai coding agent di terminal.
          </p>
        </details>
      </div>
    </section>
  );
}
