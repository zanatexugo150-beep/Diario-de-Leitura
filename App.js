import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage  from './pages/LoginPage';
import AdminPage  from './pages/AdminPage';
import DiarioPage from './pages/DiarioPage';

// ── Tela de carregamento ──────────────────────────────────────
function Loading() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #FCE4EC, #EDE7F6)', gap: 16 }}>
      <div style={{ fontSize: 52 }}>📖</div>
      <div style={{ width: 40, height: 40, border: '4px solid #F4A7B9', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <div style={{ color: '#7A6B8A', fontSize: 14 }}>Carregando...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Roteador interno ─────────────────────────────────────────
function Router() {
  const { user, profile, loading } = useAuth();

  if (loading) return <Loading />;

  // Não logado → tela de login
  if (!user) return <LoginPage />;

  // Logado como admin → painel admin
  if (profile?.role === 'admin') return <AdminPage />;

  // Conta bloqueada (segurança extra no front)
  if (profile?.blocked) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FEF6F0', padding: 20 }}>
        <div style={{ background: '#FFEBEE', borderRadius: 20, padding: '32px 28px', textAlign: 'center', maxWidth: 360, border: '2px solid #EF5350' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <div style={{ color: '#4A3F5C', fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Conta bloqueada</div>
          <div style={{ color: '#7A6B8A', fontSize: 13, lineHeight: 1.6 }}>Sua conta foi bloqueada pelo administrador.<br />Entre em contato com Ademir para mais informações.</div>
        </div>
      </div>
    );
  }

  // Usuário normal → diário de leitura
  return <DiarioPage />;
}

// ── App raiz com contexto ────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
