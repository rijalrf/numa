// Halaman awal baru: ganti dashboard, hanya ada teks tengah + 1 card fitur BRD
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/http';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import { useState } from 'react';

export function HomePage() {
  const navigate = useNavigate();
  const [creatingSession, setCreatingSession] = useState(false);

  const createChatSession = async () => {
    setCreatingSession(true);
    try {
      const json = await api<{ sessionId: string }>('/api/chat/sessions', {
        method: 'POST',
      });
      if (json.sessionId) {
        navigate(`/chat/${json.sessionId}`);
      } else {
        console.error('Gagal membuat sesi chat:', json);
      }
    } catch (err) {
      console.error('Error creating session:', err);
      alert('Terjadi kesalahan saat memulai sesi chat.');
    } finally {
      setCreatingSession(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center gap-8 px-6">
      {/* Teks tengah */}
      <h1 className="text-4xl font-semibold text-center text-foreground">
        Mau Numa buat apa?
      </h1>

      {/* 1 Card BRD */}
      <Card className="w-full max-w-md border-primary shadow-lg hover:shadow-xl transition-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Susun BRD & Rencana Aplikasi
          </CardTitle>
          <CardDescription>
            Ceritakan ide aplikasi Anda ke AI pake.ai. AI akan membantu memperjelas tujuan, fitur, dan kebutuhan aplikasi sebelum disusun menjadi BRD yang lengkap.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Tidak ada content tambahan — cukup deskripsi di header */}
        </CardContent>
        <CardFooter>
          <Button onClick={createChatSession} disabled={creatingSession} size="lg" className="w-full">
            {creatingSession ? 'Memulai...' : 'Mulai Brainstorming'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
