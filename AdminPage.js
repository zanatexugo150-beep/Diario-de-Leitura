import React, { useState, useEffect } from 'react';
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword, sendEmailVerification,
  updatePassword, EmailAuthProvider, reauthenticateWithCredential,
} from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import { validateEmail, validatePassword, auditLog, sanitize } from '../utils/security';

const P = {
  bg: '#FEF6F0', white: '#FFFFFF', rose: '#F4A7B9', roseDark: '#E07A96',
  roseLight: '#FCE4EC', lavender: '#C9B8E8', lavenderDark: '#A990D4',
  lavenderLight: '#EDE7F6', mint: '#A8DCC8', mintDark: '#6CB89A', mintLight: '#E8F5EF',
  butter: '#FFE082', butterLight: '#FFF9E0', text: '#4A3F5C', textMid: '#7A6B8A',
  textMuted: '#B0A0C0', border: '#EDD8F0', danger: '#EF5350', dangerLight: '#FFEBEE',
};

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ color: P.textMid, fontSize: 12, fontWeight: 700 }}>{label}</label>}
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ background: P.bg, border: `1.5px solid ${P.border}`, borderRadius: 10, padding: '9px 12px', color: P.text, fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }}
        onFocus={e => e.target.style.borderColor = P.rose}
        onBlur={e => e.target.style.borderColor = P.border}
      />
    </div>
  );
}

export default function AdminPage() {
  const { user, profile, db, auth, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [logs, setLogs]   = useState([]);
  const [tab, setTab]     = useState('users'); // users | logs | newuser | password
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]     = useState({ type: '', text: '' });

  // Novo usuário
  const [newName, setNewName]     = useState('');
  const [newEmail, setNewEmail]   = useState('');
  const [newPass, setNewPass]     = useState('');
  const [newRole, setNewRole]     = useState('user');
  const [passErrors, setPassErrors] = useState([]);

  // Trocar própria senha
  const [oldPass, setOldPass]     = useState('');
  const [newMyPass, setNewMyPass] = useState('');
  const [myPassErrors, setMyPassErrors] = useState([]);

  const showMsg = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg({ type: '', text: '' }), 5000); };

  // Carrega usuários
  const loadUsers = async () => {
    const snap = await getDocs(collection(db, 'users'));
    setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  // Carrega logs de auditoria
  const loadLogs = async () => {
    const snap = await getDocs(collection(db, 'audit_logs'));
    const sorted = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))
      .slice(0, 50);
    setLogs(sorted);
  };

  useEffect(() => { loadUsers(); }, []);
  useEffect(() => { if (tab === 'logs') loadLogs(); }, [tab]);

  // Criar novo usuário
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setMsg({ type: '', text: '' });
    if (!validateEmail(newEmail)) { showMsg('error', 'E-mail inválido.'); return; }
    const errs = validatePassword(newPass);
    setPassErrors(errs);
    if (errs.length) return;
    setLoading(true);
    try {
      // Cria no Firebase Auth
      const cred = await createUserWithEmailAndPassword(auth, newEmail, newPass);
      // Envia verificação de e-mail
      await sendEmailVerification(cred.user);
      // Salva perfil no Firestore
      await setDoc(doc(db, 'users', cred.user.uid), {
        name:      sanitize(newName),
        email:     newEmail.toLowerCase(),
        role:      newRole,
        blocked:   false,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await auditLog(db, user.uid, 'CREATE_USER', { email: newEmail, role: newRole });
      showMsg('ok', `Usuário "${newEmail}" criado! E-mail de verificação enviado.`);
      setNewName(''); setNewEmail(''); setNewPass(''); setNewRole('user');
      setPassErrors([]);
      loadUsers();
    } catch (err) {
      showMsg('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Alterar role
  const changeRole = async (uid, role) => {
    await updateDoc(doc(db, 'users', uid), { role, updatedAt: serverTimestamp() });
    await auditLog(db, user.uid, 'CHANGE_ROLE', { targetUid: uid, role });
    showMsg('ok', 'Papel alterado com sucesso!');
    loadUsers();
  };

  // Bloquear/desbloquear
  const toggleBlock = async (uid, blocked) => {
    await updateDoc(doc(db, 'users', uid), { blocked: !blocked, updatedAt: serverTimestamp() });
    await auditLog(db, user.uid, blocked ? 'UNBLOCK_USER' : 'BLOCK_USER', { targetUid: uid });
    showMsg('ok', blocked ? 'Usuário desbloqueado!' : 'Usuário bloqueado!');
    loadUsers();
  };

  // Deletar usuário
  const deleteUser = async (uid, email) => {
    if (!window.confirm(`Remover permanentemente o usuário ${email}?`)) return;
    await deleteDoc(doc(db, 'users', uid));
    await auditLog(db, user.uid, 'DELETE_USER', { targetUid: uid, email });
    showMsg('ok', 'Usuário removido.');
    loadUsers();
  };

  // Trocar própria senha
  const handleChangePassword = async (e) => {
    e.preventDefault();
    const errs = validatePassword(newMyPass);
    setMyPassErrors(errs);
    if (errs.length) return;
    setLoading(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, oldPass);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newMyPass);
      await auditLog(db, user.uid, 'CHANGE_PASSWORD', {});
      showMsg('ok', 'Senha alterada com sucesso!');
      setOldPass(''); setNewMyPass(''); setMyPassErrors([]);
    } catch (err) {
      showMsg('error', 'Senha atual incorreta ou erro de autenticação.');
    } finally {
      setLoading(false);
    }
  };

  const TABS = [
    { id: 'users',    label: '👥 Usuários' },
    { id: 'newuser',  label: '➕ Novo usuário' },
    { id: 'logs',     label: '📋 Logs' },
    { id: 'password', label: '🔑 Minha senha' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: P.bg, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${P.roseLight}, ${P.lavenderLight})`, padding: '0 20px', borderBottom: `1px solid ${P.border}`, position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, height: 56 }}>
          <span style={{ fontSize: 20 }}>🛡️</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: P.text, fontSize: 15, fontWeight: 900 }}>Painel Administrador</div>
            <div style={{ color: P.textMuted, fontSize: 11 }}>{profile?.name || user?.email}</div>
          </div>
          <button onClick={logout}
            style={{ background: P.dangerLight, color: P.danger, border: 'none', borderRadius: 10, padding: '7px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            Sair
          </button>
        </div>
        {/* Tabs */}
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: tab === t.id ? P.roseDark : P.textMid, fontWeight: tab === t.id ? 800 : 600, fontSize: 13, borderBottom: `3px solid ${tab === t.id ? P.rose : 'transparent'}`, whiteSpace: 'nowrap', transition: 'all .2s' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 60px' }}>
        {/* Mensagem */}
        {msg.text && (
          <div style={{ background: msg.type === 'ok' ? P.mintLight : P.dangerLight, color: msg.type === 'ok' ? P.mintDark : P.danger, border: `1px solid ${msg.type === 'ok' ? P.mint : P.danger}30`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, fontWeight: 600 }}>
            {msg.type === 'ok' ? '✓ ' : '⚠️ '}{msg.text}
          </div>
        )}

        {/* ── LISTA DE USUÁRIOS ── */}
        {tab === 'users' && (
          <div>
            <div style={{ color: P.text, fontSize: 17, fontWeight: 900, marginBottom: 16 }}>👥 Usuários cadastrados ({users.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {users.map(u => (
                <div key={u.id} style={{ background: P.white, borderRadius: 14, padding: '14px 18px', border: `1.5px solid ${u.blocked ? P.danger : P.border}`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ color: P.text, fontSize: 14, fontWeight: 700 }}>{u.name || '(sem nome)'}</span>
                      <span style={{ background: u.role === 'admin' ? P.lavenderLight : P.mintLight, color: u.role === 'admin' ? P.lavenderDark : P.mintDark, fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99 }}>
                        {u.role === 'admin' ? '🛡️ Admin' : '👤 Usuário'}
                      </span>
                      {u.blocked && <span style={{ background: P.dangerLight, color: P.danger, fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99 }}>🔒 Bloqueado</span>}
                      {u.id === user?.uid && <span style={{ background: P.butterLight, color: '#B8860B', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 99 }}>Você</span>}
                    </div>
                    <div style={{ color: P.textMuted, fontSize: 12, marginTop: 3 }}>{u.email}</div>
                    <div style={{ color: P.textMuted, fontSize: 11, marginTop: 2 }}>
                      Criado: {u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString('pt-BR') : '—'}
                    </div>
                  </div>
                  {/* Ações */}
                  {u.id !== user?.uid && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <select value={u.role} onChange={e => changeRole(u.id, e.target.value)}
                        style={{ background: P.lavenderLight, color: P.lavenderDark, border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        <option value="user">👤 Usuário</option>
                        <option value="admin">🛡️ Admin</option>
                      </select>
                      <button onClick={() => toggleBlock(u.id, u.blocked)}
                        style={{ background: u.blocked ? P.mintLight : P.dangerLight, color: u.blocked ? P.mintDark : P.danger, border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {u.blocked ? '🔓 Desbloquear' : '🔒 Bloquear'}
                      </button>
                      <button onClick={() => deleteUser(u.id, u.email)}
                        style={{ background: P.dangerLight, color: P.danger, border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        🗑️ Remover
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {!users.length && <div style={{ color: P.textMuted, textAlign: 'center', padding: '32px 0' }}>Nenhum usuário cadastrado ainda.</div>}
            </div>
          </div>
        )}

        {/* ── NOVO USUÁRIO ── */}
        {tab === 'newuser' && (
          <div style={{ maxWidth: 480 }}>
            <div style={{ color: P.text, fontSize: 17, fontWeight: 900, marginBottom: 20 }}>➕ Criar novo usuário</div>
            <form onSubmit={handleCreateUser} style={{ background: P.white, borderRadius: 18, padding: 24, border: `1.5px solid ${P.border}`, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Nome completo" value={newName} onChange={setNewName} placeholder="Nome do usuário" />
              <Field label="E-mail *" value={newEmail} onChange={setNewEmail} type="email" placeholder="email@exemplo.com" />
              <Field label="Senha inicial *" value={newPass} onChange={v => { setNewPass(v); setPassErrors(validatePassword(v)); }} type="password" placeholder="Mínimo 8 caracteres" />
              {passErrors.length > 0 && (
                <div style={{ background: P.dangerLight, borderRadius: 10, padding: '10px 12px' }}>
                  {passErrors.map((e, i) => <div key={i} style={{ color: P.danger, fontSize: 12 }}>• {e}</div>)}
                </div>
              )}
              <div>
                <label style={{ color: P.textMid, fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>Papel</label>
                <select value={newRole} onChange={e => setNewRole(e.target.value)}
                  style={{ width: '100%', background: P.bg, border: `1.5px solid ${P.border}`, borderRadius: 10, padding: '9px 12px', color: P.text, fontSize: 13, fontFamily: 'inherit', outline: 'none' }}>
                  <option value="user">👤 Usuário comum</option>
                  <option value="admin">🛡️ Administrador</option>
                </select>
              </div>
              <button type="submit" disabled={loading}
                style={{ background: loading ? P.border : `linear-gradient(135deg,${P.rose},${P.roseDark})`, color: '#fff', border: 'none', borderRadius: 12, padding: '13px 0', fontWeight: 800, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', marginTop: 4 }}>
                {loading ? '⏳ Criando...' : '✨ Criar usuário'}
              </button>
              <div style={{ color: P.textMuted, fontSize: 11, textAlign: 'center', lineHeight: 1.6 }}>
                O usuário receberá um e-mail de verificação.<br />
                A senha deve ser alterada no primeiro acesso.
              </div>
            </form>
          </div>
        )}

        {/* ── LOGS ── */}
        {tab === 'logs' && (
          <div>
            <div style={{ color: P.text, fontSize: 17, fontWeight: 900, marginBottom: 16 }}>📋 Logs de auditoria (últimos 50)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {logs.map(l => (
                <div key={l.id} style={{ background: P.white, borderRadius: 10, padding: '10px 14px', border: `1px solid ${P.border}`, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ color: P.text, fontWeight: 700 }}>{l.action}</span>
                    <span style={{ color: P.textMuted, fontSize: 11, whiteSpace: 'nowrap' }}>
                      {l.timestamp?.toDate ? l.timestamp.toDate().toLocaleString('pt-BR') : '—'}
                    </span>
                  </div>
                  <div style={{ color: P.textMid, marginTop: 3 }}>
                    Usuário: <code style={{ background: P.bg, padding: '1px 5px', borderRadius: 4 }}>{l.userId?.slice(0, 12)}...</code>
                  </div>
                  {l.details && Object.keys(l.details).length > 0 && (
                    <div style={{ color: P.textMuted, marginTop: 3, fontSize: 11 }}>
                      {JSON.stringify(l.details)}
                    </div>
                  )}
                </div>
              ))}
              {!logs.length && <div style={{ color: P.textMuted, textAlign: 'center', padding: '32px 0' }}>Nenhum log registrado ainda.</div>}
            </div>
          </div>
        )}

        {/* ── MINHA SENHA ── */}
        {tab === 'password' && (
          <div style={{ maxWidth: 400 }}>
            <div style={{ color: P.text, fontSize: 17, fontWeight: 900, marginBottom: 20 }}>🔑 Alterar minha senha</div>
            <form onSubmit={handleChangePassword} style={{ background: P.white, borderRadius: 18, padding: 24, border: `1.5px solid ${P.border}`, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Senha atual *" value={oldPass} onChange={setOldPass} type="password" placeholder="Sua senha atual" />
              <Field label="Nova senha *" value={newMyPass} onChange={v => { setNewMyPass(v); setMyPassErrors(validatePassword(v)); }} type="password" placeholder="Nova senha forte" />
              {myPassErrors.length > 0 && (
                <div style={{ background: P.dangerLight, borderRadius: 10, padding: '10px 12px' }}>
                  {myPassErrors.map((e, i) => <div key={i} style={{ color: P.danger, fontSize: 12 }}>• {e}</div>)}
                </div>
              )}
              <button type="submit" disabled={loading}
                style={{ background: loading ? P.border : `linear-gradient(135deg,${P.rose},${P.roseDark})`, color: '#fff', border: 'none', borderRadius: 12, padding: '13px 0', fontWeight: 800, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {loading ? '⏳ Salvando...' : '🔑 Alterar senha'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
