'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Usuario o contraseña incorrectos');
        return;
      }
      const params = new URLSearchParams(window.location.search);
      router.push(params.get('from') || '/');
      router.refresh();
    } catch {
      setError('No se pudo conectar. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card card-blanca" onSubmit={handleSubmit}>
        <div className="login-logo">⚽ Parrilla del DT</div>
        <div className="login-subtitulo">Inicia sesión para continuar</div>

        <div className="filtro-campo">
          <label htmlFor="loginUsername">Usuario</label>
          <input
            id="loginUsername"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="filtro-campo">
          <label htmlFor="loginPassword">Contraseña</label>
          <input
            id="loginPassword"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <div className="login-error">{error}</div>}

        <button className="btn btn-naranja" type="submit" disabled={enviando}>
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
