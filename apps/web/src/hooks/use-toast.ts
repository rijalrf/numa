// Toast notifikasi sementara (auto-hide 3.5 detik)
import { useEffect, useRef, useState } from 'react';

export function useToast() {
  const [toastMessage, setToastMessage] = useState('');
  const [isToastShow, setIsToastShow] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const notify = (msg: string) => {
    setToastMessage(msg);
    setIsToastShow(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setIsToastShow(false);
    }, 3500);
  };

  return { toastMessage, isToastShow, notify };
}
