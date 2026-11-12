import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastFn = (message: string, bad?: boolean) => void;
const Ctx = createContext<ToastFn>(() => {});

/** One short message at a time in the corner of the screen. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const timer = useRef<number>();
  const toast = useCallback<ToastFn>((text, bad = false) => {
    setMsg({ text, bad });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 3800);
  }, []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      {msg && <div className={`toast${msg.bad ? ' bad' : ''}`} role="status">{msg.text}</div>}
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);

/** Copies text, with a fallback message when the browser blocks the clipboard. */
export function useCopy() {
  const toast = useToast();
  return useCallback((text: string, message = 'Copied') => {
    navigator.clipboard?.writeText(text).then(() => toast(message), () => toast('Copying is blocked here. Select the text and copy it yourself.', true));
  }, [toast]);
}
