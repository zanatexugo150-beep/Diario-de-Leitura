import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { checkRateLimit, resetRateLimit, firebaseError, auditLog } from '../utils/security';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null); // dados do Firestore (role, nome etc)
  const [loading, setLoading] = useState(true);

  // Escuta mudanças de autenticação
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        // Carrega perfil do Firestore
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          // Verifica se conta está bloqueada pelo admin
          if (data.blocked) {
            await signOut(auth);
            setUser(null); setProfile(null);
          } else {
            setProfile(data);
          }
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // Login com rate limiting
  const login = async (email, password) => {
    checkRateLimit(email); // lança erro se bloqueado
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      resetRateLimit(email);
      await auditLog(db, cred.user.uid, 'LOGIN', { email });
      return cred;
    } catch (err) {
      await auditLog(db, 'anonymous', 'LOGIN_FAILED', { email, code: err.code });
      throw new Error(firebaseError(err.code));
    }
  };

  // Logout
  const logout = async () => {
    if (user) await auditLog(db, user.uid, 'LOGOUT', {});
    await signOut(auth);
  };

  // Recuperação de senha
  const resetPassword = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      throw new Error(firebaseError(err.code));
    }
  };

  // Verifica se é admin
  const isAdmin = profile?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, logout, resetPassword, isAdmin, db, auth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
