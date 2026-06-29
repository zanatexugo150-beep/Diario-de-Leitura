// ============================================================
// SEGURANÇA — Rate limiting, sanitização, validações
// ============================================================

// Rate limiter local (tentativas de login)
const attempts = {};

export function checkRateLimit(email) {
  const key = email.toLowerCase();
  const now = Date.now();
  if (!attempts[key]) attempts[key] = { count: 0, firstAt: now, blockedUntil: 0 };
  const a = attempts[key];

  // Se bloqueado, verifica se já expirou
  if (a.blockedUntil > now) {
    const mins = Math.ceil((a.blockedUntil - now) / 60000);
    throw new Error(`Muitas tentativas. Tente novamente em ${mins} minuto(s).`);
  }

  // Reseta se janela de 15 min expirou
  if (now - a.firstAt > 15 * 60 * 1000) {
    attempts[key] = { count: 1, firstAt: now, blockedUntil: 0 };
    return;
  }

  a.count++;

  // Bloqueia após 5 tentativas por 30 minutos
  if (a.count >= 5) {
    a.blockedUntil = now + 30 * 60 * 1000;
    throw new Error('Conta temporariamente bloqueada por 30 minutos devido a múltiplas tentativas.');
  }
}

export function resetRateLimit(email) {
  delete attempts[email.toLowerCase()];
}

// Sanitiza strings para evitar XSS
export function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim()
    .slice(0, 500); // limite de tamanho
}

// Valida força da senha
export function validatePassword(password) {
  const errors = [];
  if (password.length < 8)         errors.push('Mínimo 8 caracteres');
  if (!/[A-Z]/.test(password))     errors.push('Pelo menos 1 letra maiúscula');
  if (!/[a-z]/.test(password))     errors.push('Pelo menos 1 letra minúscula');
  if (!/[0-9]/.test(password))     errors.push('Pelo menos 1 número');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Pelo menos 1 caractere especial (!@#$%...)');
  return errors;
}

// Valida email
export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Gera token CSRF simples
export function generateCSRFToken() {
  const arr = new Uint8Array(32);
  window.crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

// Log de auditoria
export async function auditLog(db, userId, action, details = {}) {
  try {
    const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
    await addDoc(collection(db, 'audit_logs'), {
      userId,
      action,
      details,
      timestamp: serverTimestamp(),
      userAgent: navigator.userAgent.slice(0, 200),
    });
  } catch (e) {
    console.error('Audit log error:', e);
  }
}

// Mapeia erros do Firebase para português
export function firebaseError(code) {
  const map = {
    'auth/user-not-found':        'E-mail não encontrado.',
    'auth/wrong-password':        'Senha incorreta.',
    'auth/invalid-email':         'E-mail inválido.',
    'auth/user-disabled':         'Conta desativada. Entre em contato com o administrador.',
    'auth/too-many-requests':     'Muitas tentativas. Aguarde alguns minutos.',
    'auth/email-already-in-use':  'Este e-mail já está em uso.',
    'auth/weak-password':         'Senha muito fraca.',
    'auth/network-request-failed':'Erro de conexão. Verifique sua internet.',
    'auth/invalid-credential':    'E-mail ou senha inválidos.',
    'auth/requires-recent-login': 'Por segurança, faça login novamente.',
  };
  return map[code] || 'Erro inesperado. Tente novamente.';
}
