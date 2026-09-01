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
    const response = await fetch(registering ? "/api/auth/signup" : "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? "Não foi possível entrar.");
      setLoading(false);
      return;
    }
    window.location.href = "/";
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <img className="login-logo" src="/brand/behemoth-logo.png" alt="Behemoth" />
        <p className="eyebrow">CENTRO DE CONTROLE</p>
        <h1>Entre no seu workspace</h1>
        <p className="subtitle">Acesse seus clientes, finanças, reuniões e automações.</p>
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
        <p className="small muted login-note">Ambiente local de demonstração. Os dados ficam separados por workspace.</p>
      </div>
    </main>
  );
}
