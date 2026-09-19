// Halaman chat: Brainstorming ide aplikasi dengan AI Numa
import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Send, Loader2, ArrowRight, RefreshCw, Sparkles, MessageSquare } from 'lucide-react';
import { ChatBubble } from '@/components/chat/chat-bubble';
import { StructuredForm } from '@/components/chat/structured-form';
import { TypingIndicator } from '@/components/chat/typing-indicator';
import { api } from '@/lib/http';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  kind: 'text' | 'form' | 'done';
  content: string;
  payload?: any;
  createdAt: Date;
};

function parsePayload(val: any) {
  if (!val) return undefined;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return undefined;
  }
}

export function ChatPage() {
  const { sessionId: routeSessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(routeSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showFinishButton, setShowFinishButton] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveSessionId(routeSessionId);
  }, [routeSessionId]);

  // Load pesan saat mount
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      setShowFinishButton(false);
      return;
    }

    const loadMessages = async () => {
      try {
        const json = await api<{ messages?: any[] }>(`/api/chat/sessions/${activeSessionId}/messages`);
        const rawMsgs = json.messages || [];
        const msgs = rawMsgs.map((m: any) => ({
          ...m,
          payload: parsePayload(m.payload),
        }));
        setMessages(msgs);
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg?.role === 'assistant' && lastMsg?.kind === 'done') {
          setShowFinishButton(true);
        }
      } catch (err) {
        console.error('Gagal load pesan:', err);
      }
    };

    loadMessages();
  }, [activeSessionId]);

  // Auto-scroll ke bawah saat ada pesan baru
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const textToSend = inputText.trim();
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      kind: 'text',
      content: textToSend,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);
    setIsTyping(true);
    setShowFinishButton(false);

    let targetSessionId = activeSessionId;
    if (!targetSessionId) {
      try {
        const sessionRes = await api<{ sessionId: string }>('/api/chat/sessions', {
          method: 'POST',
        });
        if (!sessionRes.sessionId) {
          throw new Error('Sesi gagal dibuat.');
        }
        targetSessionId = sessionRes.sessionId;
        setActiveSessionId(targetSessionId);
        window.history.replaceState(null, '', `/chat/${targetSessionId}`);
      } catch (err) {
        console.error('Gagal membuat sesi chat:', err);
        setIsLoading(false);
        setIsTyping(false);
        alert('Terjadi kesalahan saat memulai sesi chat.');
        return;
      }
    }

    try {
      const aiResponse = await api<any>(`/api/chat/sessions/${targetSessionId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: textToSend }),
      });

      const aiMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        kind: aiResponse.kind || 'text',
        content: aiResponse.content,
        payload: parsePayload(aiResponse.payload),
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);
      setIsTyping(false);
      setShowFinishButton(aiResponse.kind === 'done');
    } catch (err) {
      console.error('Error mengirim pesan:', err);
      setIsTyping(false);
      alert('Terjadi kesalahan saat mengirim pesan.');
    } finally {
      setIsLoading(false);
    }
  };

  const retryLastMessage = async () => {
    if (!activeSessionId) return;
    setIsLoading(true);
    setIsTyping(true);
    setShowFinishButton(false);
    try {
      const aiResponse = await api<any>(`/api/chat/sessions/${activeSessionId}/retry`, {
        method: 'POST',
      });
      setMessages((prev) => {
        const next = [...prev];
        if (next.length > 0 && next[next.length - 1].role === 'assistant') {
          next.pop();
        }
        return [
          ...next,
          {
            id: aiResponse.id || `ai-${Date.now()}`,
            role: 'assistant',
            kind: aiResponse.kind || 'text',
            content: aiResponse.content,
            payload: parsePayload(aiResponse.payload),
            createdAt: new Date(),
          },
        ];
      });
      setShowFinishButton(aiResponse.kind === 'done');
    } catch (err) {
      console.error('Error saat retry:', err);
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  const handleFormSubmit = async (answers: Record<string, string>) => {
    if (!activeSessionId) return;
    const serialized = Object.entries(answers)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');

    const userMessage: ChatMessage = {
      id: `form-${Date.now()}`,
      role: 'user',
      kind: 'text',
      content: serialized,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setIsTyping(true);
    setShowFinishButton(false);

    try {
      const aiResponse = await api<any>(`/api/chat/sessions/${activeSessionId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: serialized, formAnswers: answers }),
      });

      const aiMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        kind: aiResponse.kind || 'text',
        content: aiResponse.content,
        payload: parsePayload(aiResponse.payload),
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);
      setIsTyping(false);
      setShowFinishButton(aiResponse.kind === 'done');
    } catch (err) {
      console.error('Error mengirim jawaban form:', err);
      setIsTyping(false);
    } finally {
      setIsLoading(false);
    }
  };

  const finalizeProject = async () => {
    if (!activeSessionId) return;
    setIsFinalizing(true);

    try {
      const json = await api<{ projectId?: string }>(`/api/chat/sessions/${activeSessionId}/finalize`, {
        method: 'POST',
      });

      if (json.projectId) {
        navigate(`/projects/${json.projectId}/techstack`);
      } else {
        setIsFinalizing(false);
        console.error('Gagal finalisasi project:', json);
        alert('Terjadi kesalahan saat membuat project.');
      }
    } catch (err) {
      setIsFinalizing(false);
      console.error('Error finalisasi:', err);
      alert('Terjadi kesalahan saat membuat project.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col bg-background">
      {/* Tampilan awal: Jika belum ada pesan, kolom chat muncul di tengah layar */}
      {messages.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12">
          <div className="max-w-2xl w-full text-center space-y-6">
            <div className="space-y-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-2">
                <Sparkles className="h-6 w-6" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                Mulai Brainstorming Ide
              </h1>
              <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
                Ceritakan konsep, fitur utama, atau masalah yang ingin diselesaikan oleh aplikasi Anda.
                AI Numa akan membantu memperjelas kebutuhan sebelum disusun menjadi BRD.
              </p>
            </div>

            {/* Kotak chat di tengah */}
            <div className="rounded-xl border border-border bg-card p-3 shadow-sm focus-within:ring-1 focus-within:ring-primary text-left transition-all">
              <Textarea
                placeholder="Contoh: Saya ingin buat aplikasi manajemen toko kelontong dengan kasir POS dan inventaris barang..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                rows={3}
                className="resize-none border-0 focus-visible:ring-0 shadow-none p-2 text-sm bg-transparent"
                autoFocus
              />
              <div className="flex items-center justify-between pt-2 border-t border-border mt-2">
                <span className="text-[11px] text-muted-foreground">
                  Tekan <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">Enter</kbd> untuk kirim, <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px]">Shift+Enter</kbd> untuk baris baru
                </span>
                <Button
                  onClick={sendMessage}
                  disabled={isLoading || !inputText.trim()}
                  size="sm"
                  className="gap-1.5"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Mulai
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Tampilan percakapan: list pesan di atas, input di bawah dalam wrap container */
        <>
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
            <div className="max-w-4xl mx-auto space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className="space-y-2">
                  <ChatBubble message={msg} />
                  {msg.role === 'assistant' && msg.content.includes('Maaf, saya mengalami kesalahan') && (
                    <div className="flex justify-start ml-11">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={retryLastMessage}
                        disabled={isLoading}
                        className="gap-2 text-xs"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Coba Lagi
                      </Button>
                    </div>
                  )}
                  {msg.kind === 'form' && msg.payload && (
                    <div className="ml-11 max-w-2xl">
                      <StructuredForm
                        questions={msg.payload.questions}
                        onSubmit={handleFormSubmit}
                        disabled={isLoading}
                      />
                    </div>
                  )}
                </div>
              ))}

              {isTyping && <TypingIndicator />}

              {showFinishButton && (
                <div className="flex flex-col items-center gap-3 pt-6 pb-2 text-center">
                  <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 max-w-lg">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Kebutuhan aplikasi sudah dirumuskan secara detail. Anda masih bisa melanjutkan percakapan jika ada detail tambahan, atau langsung klik tombol di bawah untuk memilih tech stack.
                    </p>
                  </div>
                  <Button
                    size="lg"
                    onClick={finalizeProject}
                    disabled={isLoading || isFinalizing}
                    className="gap-2 font-medium"
                  >
                    {isFinalizing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                    Lanjut ke Tech Stack
                  </Button>
                </div>
              )}

              <div ref={scrollRef} />
            </div>
          </div>

          {/* Input area yang dibungkus container */}
          <div className="border-t border-border px-4 sm:px-6 py-4 bg-background">
            <div className="max-w-4xl mx-auto">
              <div className="flex gap-3 items-end rounded-xl border border-border bg-card p-2 shadow-sm focus-within:ring-1 focus-within:ring-primary">
                <Textarea
                  placeholder={
                    showFinishButton
                      ? 'Masih ada yang ingin dikonfirmasi atau diubah? Ketik di sini...'
                      : 'Tulis pesan Anda... (Shift+Enter untuk baris baru)'
                  }
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isLoading}
                  rows={2}
                  className="flex-1 resize-none border-0 focus-visible:ring-0 shadow-none p-2 text-sm bg-transparent"
                />
                <Button
                  onClick={sendMessage}
                  disabled={isLoading || !inputText.trim()}
                  size="icon"
                  className="shrink-0 mb-0.5"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 text-center">
                Tekan Enter untuk kirim, Shift+Enter untuk baris baru
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
