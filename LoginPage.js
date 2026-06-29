import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { validateEmail } from '../utils/security';

const P = {
  bg: '#FEF6F0', rose: '#F4A7B9', roseDark: '#E07A96', roseLight: '#FCE4EC',
  lavender: '#C9B8E8', lavenderDark: '#A990D4', lavenderLight: '#EDE7F6',
  text: '#4A3F5C', textMid: '#7A6B8A', textMuted: '#B0A0C0',
  border: '#EDD8F0', white: '#FFFFFF', danger: '#EF5350', dangerLight: '#FFEBEE',
  mint: '#A8DCC8', mintDark: '#6CB89A',
};

export default function LoginPage() {
  const { login, resetPassword } = useAuth();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [info, setInfo]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (!validateEmail(email)) { setError('E-mail inválido.'); return; }
    if (!forgotMode && !password) { setError('Digite a senha.'); return; }
    setLoading(true);
    try {
      if (forgotMode) {
        await resetPassword(email);
        setInfo('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
        setForgotMode(false);
      } else {
        await login(email, password);
        // AuthContext redireciona automaticamente
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(135deg, ${P.roseLight} 0%, ${P.lavenderLight} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: P.white, borderRadius: 24, width: '100%', maxWidth: 400, padding: '36px 32px', boxShadow: '0 24px 64px rgba(74,63,92,.18)' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>📖</div>
          <div style={{ color: P.text, fontSize: 22, fontWeight: 900 }}>Diário de Leitura</div>
          <div style={{ color: P.textMuted, fontSize: 13, marginTop: 4 }}>
            {forgotMode ? 'Recuperar senha' : 'Entre na sua conta'}
          </div>
        </div>

        {/* Mensagens */}
        {error && (
          <div style={{ background: P.dangerLight, border: `1px solid ${P.danger}30`, borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: P.danger, fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>⚠️</span> {error}
          </div>
        )}
        {info && (
          <div style={{ background: '#E8F5EF', border: '1px solid #A8DCC8', borderRadius: 10, padding: '10px 14px', marginBottom: 16, color: P.mintDark, fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>✓</span> {info}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Email */}
          <div>
            <label style={{ color: P.textMid, fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>E-mail</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value.trim())}
              placeholder="seu@email.com" autoComplete="email" required
              style={{ width: '100%', background: P.bg, border: `1.5px solid ${P.border}`, borderRadius: 12, padding: '12px 14px', color: P.text, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = P.rose}
              onBlur={e => e.target.style.borderColor = P.border}
            />
          </div>

          {/* Senha */}
          {!forgotMode && (
            <div>
              <label style={{ color: P.textMid, fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Senha</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Sua senha" autoComplete="current-password" required
                  style={{ width: '100%', background: P.bg, border: `1.5px solid ${P.border}`, borderRadius: 12, padding: '12px 44px 12px 14px', color: P.text, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                  onFocus={e => e.target.style.borderColor = P.rose}
                  onBlur={e => e.target.style.borderColor = P.border}
                />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: P.textMuted, padding: 4 }}>
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          )}

          {/* Botão principal */}
          <button type="submit" disabled={loading}
            style={{ background: loading ? P.border : `linear-gradient(135deg, ${P.rose}, ${P.roseDark})`, color: '#fff', border: 'none', borderRadius: 14, padding: '14px 0', fontWeight: 800, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', boxShadow: loading ? 'none' : `0 4px 16px ${P.rose}60`, marginTop: 4, transition: 'all .2s' }}>
            {loading ? '⏳ Aguarde...' : forgotMode ? '📧 Enviar e-mail' : '🔐 Entrar'}
          </button>

          {/* Esqueci / Voltar */}
          <button type="button" onClick={() => { setForgotMode(f => !f); setError(''); setInfo(''); }}
            style={{ background: 'none', border: 'none', color: P.lavenderDark, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', textAlign: 'center', padding: 4 }}>
            {forgotMode ? '← Voltar ao login' : 'Esqueci minha senha'}
          </button>
        </form>

        <div style={{ marginTop: 24, padding: '14px 16px', background: P.lavenderLight, borderRadius: 12, fontSize: 11, color: P.textMid, textAlign: 'center', lineHeight: 1.6 }}>
          🔒 Conexão criptografada · Sessão segura<br />
          Novas contas são criadas pelo administrador
        </div>
      </div>
    </div>
  );
}
