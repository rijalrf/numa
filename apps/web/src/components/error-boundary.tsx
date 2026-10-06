// Penangkap error render React: mencegah layar putih total dan memberi jalan pulih bagi pengguna.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error render aplikasi:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <AlertCircle className="h-10 w-10 mx-auto text-destructive" />
          <h1 className="text-lg font-semibold">Terjadi kesalahan pada aplikasi</h1>
          <p className="text-sm text-muted-foreground">Halaman gagal ditampilkan. Muat ulang halaman; bila masalah berlanjut, hubungi admin.</p>
          <div className="flex justify-center gap-2">
            <Button type="button" onClick={() => window.location.reload()} className="cursor-pointer">
              Muat ulang
            </Button>
            <Button type="button" variant="outline" onClick={() => window.location.assign('/chat')} className="cursor-pointer">
              Ke beranda
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
