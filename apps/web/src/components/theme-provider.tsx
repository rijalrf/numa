// ThemeProvider: kelola mode tampilan Terang / Gelap / Sistem.
// Mode adaptif berlaku di semua halaman kecuali landing page ('/') dan login ('/login') yang selalu light mode.
import { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

type Theme = 'light' | 'dark' | 'system';

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  setTheme: () => {},
});

const STORAGE_KEY = 'vite-ui-theme';

function resolveSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme, isForceLight: boolean) {
  if (typeof document === 'undefined') return;
  if (isForceLight) {
    document.documentElement.classList.remove('dark');
    return;
  }
  const resolved = theme === 'system' ? resolveSystemTheme() : theme;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isForceLight = location.pathname === '/' || location.pathname === '/login';

  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
  });

  useEffect(() => {
    applyTheme(theme, isForceLight);
    if (isForceLight || theme !== 'system') return;

    // Ikuti perubahan tema OS saat mode Sistem aktif di halaman aplikasi
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system', false);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme, isForceLight]);

  const setTheme = (next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
