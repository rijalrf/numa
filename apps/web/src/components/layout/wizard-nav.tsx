// WizardNav: Bar navigasi sticky top (di bawah Header) di luar kontainer halaman
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';

export interface WizardNavAction {
  label?: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  hideIcon?: boolean;
}

export interface WizardNavConfig {
  back?: WizardNavAction | null;
  next?: WizardNavAction | null;
  extra?: React.ReactNode;
  headerTitle?: string;
  headerSubtitle?: string;
}

interface WizardNavContextType {
  config: WizardNavConfig | null;
  setConfig: React.Dispatch<React.SetStateAction<WizardNavConfig | null>>;
  callbacksRef: React.MutableRefObject<{
    onBack?: () => void;
    onNext?: () => void;
  }>;
}

const WizardNavContext = createContext<WizardNavContextType>({
  config: null,
  setConfig: () => {},
  callbacksRef: { current: {} },
});

export function WizardNavProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<WizardNavConfig | null>(null);
  const callbacksRef = useRef<{ onBack?: () => void; onNext?: () => void }>({});

  return (
    <WizardNavContext.Provider value={{ config, setConfig, callbacksRef }}>
      {children}
    </WizardNavContext.Provider>
  );
}

export function useWizardNav(config: WizardNavConfig | null) {
  const { setConfig, callbacksRef } = useContext(WizardNavContext);

  // Selalu perbarui callback ref agar tidak terjadi stale closure saat dipanggil
  callbacksRef.current.onBack = config?.back?.onClick;
  callbacksRef.current.onNext = config?.next?.onClick;

  useEffect(() => {
    setConfig(config);
    return () => {
      setConfig(null);
    };
  }, [
    config?.back?.label,
    config?.back?.disabled,
    config?.back?.loading,
    config?.back?.variant,
    config?.next?.label,
    config?.next?.disabled,
    config?.next?.loading,
    config?.next?.variant,
    config?.extra,
    config?.headerTitle,
    config?.headerSubtitle,
  ]);
}

export function useWizardNavContext() {
  return useContext(WizardNavContext);
}

export function WizardNav() {
  const { config, callbacksRef } = useContext(WizardNavContext);

  if (!config || (!config.back && !config.next && !config.extra)) {
    return null;
  }

  return (
    <nav aria-label="Navigasi Tahap Wizard" className="w-full border-b bg-background/95 backdrop-blur-md px-6 py-2 flex items-center justify-between gap-4 transition-all">
      {/* Sisi Kiri: Tombol Back */}
      <div>
        {config.back ? (
          <Button
            type="button"
            variant={config.back.variant || 'outline'}
            size="sm"
            onClick={() => callbacksRef.current.onBack?.()}
            disabled={config.back.disabled || config.back.loading}
            className="gap-1.5 text-xs h-8 font-medium cursor-pointer"
          >
            {config.back.loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : !config.back.hideIcon ? (
              <ArrowLeft className="h-3.5 w-3.5" />
            ) : null}
            <span>{config.back.label || 'Kembali'}</span>
          </Button>
        ) : <div />}
      </div>

      {/* Sisi Kanan: Extra Node + Tombol Lanjut */}
      <div className="flex items-center gap-2.5">
        {config.extra}

        {config.next ? (
          <Button
            type="button"
            variant={config.next.variant || 'default'}
            size="sm"
            onClick={() => callbacksRef.current.onNext?.()}
            disabled={config.next.disabled || config.next.loading}
            className="gap-1.5 text-xs h-8 font-medium cursor-pointer"
          >
            {config.next.loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>{config.next.label || 'Lanjut'}</span>
            {!config.next.loading && !config.next.hideIcon && (
              <ArrowRight className="h-3.5 w-3.5" />
            )}
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
