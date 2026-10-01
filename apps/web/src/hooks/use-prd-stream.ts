// Hook streaming PRD via SSE + load data project
import { useCallback, useRef, useState } from 'react';

export function usePrdStream(projectId: string | undefined, isLocked: boolean) {
  const [markdown, setMarkdown] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamingRef = useRef(false);

  const streamPrd = useCallback(async () => {
    if (!projectId || isLocked || generating || streamingRef.current) return;
    streamingRef.current = true;
    setGenerating(true);
    setError(null);
    setMarkdown('');

    let accumulated = '';
    let streamError: string | null = null;

    try {
      const resp = await fetch(`/api/projects/${projectId}/prd/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!resp.ok) {
        if (resp.status === 409) return;
        throw new Error('Gagal menghubungi server untuk generate PRD');
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('ReadableStream tidak didukung browser');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const block of parts) {
          for (const line of block.split('\n')) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.delta) accumulated += data.delta;
                if (data.error) {
                  console.error('Error dari SSE stream:', data.error);
                  streamError = data.error;
                }
              } catch {}
            }
          }
        }
      }

      if (accumulated) {
        setMarkdown(accumulated);
        setError(null);
      } else if (streamError) {
        setError(streamError);
      }
    } catch (err: any) {
      console.error('Error streaming PRD:', err);
      if (!accumulated) {
        setError(err?.message || 'Terjadi kesalahan saat menyusun PRD.');
      }
    } finally {
      streamingRef.current = false;
      setGenerating(false);
    }
  }, [projectId, isLocked, generating]);

  return { markdown, setMarkdown, generating, error, setError, streamPrd };
}
