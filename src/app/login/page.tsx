"use client";

import { useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [registering, setRegistering] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(registering ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? "Não foi possível entrar.");
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Não foi possível conectar ao servidor local. Verifique se ele está em execução e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <img className="login-logo" src="/brand/behemoth-logo.png" alt="Behemoth" />
        <p className="eyebrow">SISTEMA OPERACIONAL INTELIGENTE</p>
        <h1>Clareza para decidir melhor.</h1>
        <p className="subtitle">A Behemoth mostra o que está acontecendo na sua empresa, o que merece atenção e qual pode ser o próximo passo.</p>
        <form onSubmit={submit} className="login-form">
          <label htmlFor="email">E-mail</label>
          <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" required />
          <label htmlFor="password">Senha</label>
          <input id="password" type="password" placeholder="Senha" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required />
          {error && <p className="form-error">{error}</p>}
          <button className="btn btn-primary" disabled={loading} type="submit">
            <LockKeyhole size={16} /> {loading ? "Aguarde..." : registering ? "Criar conta" : "Entrar"} <ArrowRight size={16} />
          </button>
        </form>
        <button className="login-switch" onClick={() => { setRegistering(!registering); setError(""); }}>
          {registering ? "Já tenho uma conta" : "Ainda não tenho conta"}
        </button>
        <div className="login-promise" aria-label="Promessa da Behemoth">
          <span><b>01</b>Números claros</span>
          <span><b>02</b>Prioridades definidas</span>
          <span><b>03</b>Decisões mais rápidas</span>
        </div>
        <p className="small muted login-note">Entre para acessar o workspace da sua empresa.</p>
      </div>
    </main>
  );
}
