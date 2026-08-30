"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/* -------------------------------------------------------------------------- */
/*  Invalidação global                                                        */
/*                                                                            */
/*  Qualquer escrita bem-sucedida marca os dados como velhos. Todo componente  */
/*  que usa `useResource` recarrega sozinho — inclusive em outras abas.        */
/* -------------------------------------------------------------------------- */

let version = 0;
const listeners = new Set<() => void>();
const CHANNEL_NAME = "behemoth-sync";

let channel: BroadcastChannel | null = null;
function getChannel() {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = () => bump();
  }
  return channel;
}

function bump() {
  version += 1;
  for (const listener of listeners) listener();
}

/** Recarrega todos os recursos montados. `broadcast` avisa as outras abas. */
export function invalidate({ broadcast = true }: { broadcast?: boolean } = {}) {
  bump();
  if (broadcast) getChannel()?.postMessage("invalidate");
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDataVersion() {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
}

/* -------------------------------------------------------------------------- */
/*  Requisições                                                               */
/* -------------------------------------------------------------------------- */

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const response = await fetch(input, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error ?? "Não foi possível completar a operação.");
  }

  // Escritas cascateiam automações no servidor: tudo que está na tela precisa recarregar.
  if (method !== "GET") invalidate();
  return payload as T;
}

/* -------------------------------------------------------------------------- */
/*  Hooks                                                                     */
/* -------------------------------------------------------------------------- */

export function useResource<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);
  const dataVersion = useDataVersion();

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const payload = await apiFetch<T>(url);
      if (id !== requestId.current) return;
      setData(payload);
      setError(null);
    } catch (cause) {
      if (id === requestId.current) setError(cause instanceof Error ? cause.message : "Erro inesperado.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void load();
  }, [load, dataVersion]);

  return { data, error, loading, reload: load, setData };
}

/**
 * Mantém a aba atual sincronizada sem intervenção: revalida ao voltar o foco,
 * ao reconectar e em um intervalo curto enquanto a página está visível.
 */
export function useAutoRevalidate(intervalMs = 45_000) {
  useEffect(() => {
    const revalidate = () => invalidate({ broadcast: false });

    const onVisibility = () => {
      if (document.visibilityState === "visible") revalidate();
    };

    window.addEventListener("focus", revalidate);
    window.addEventListener("online", revalidate);
    document.addEventListener("visibilitychange", onVisibility);

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") revalidate();
    }, intervalMs);

    getChannel();

    return () => {
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("online", revalidate);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(timer);
    };
  }, [intervalMs]);
}
