"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Sparkles } from "lucide-react";

type Tone = "info" | "success" | "error";
type ToastState = { message: string; tone: Tone } | null;

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((message: string, tone: Tone = "info") => {
    setToast({ message, tone });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const value = useMemo(() => notify, [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div className={`toast ${toast.tone}`} role="status">
          {toast.tone === "success" ? (
            <CircleCheck size={16} />
          ) : toast.tone === "error" ? (
            <CircleAlert size={16} />
          ) : (
            <Sparkles size={16} />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </ToastContext.Provider>
  );
}
