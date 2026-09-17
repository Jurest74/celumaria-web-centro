import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../config/firebase';
import { COLLECTIONS } from './collections';

export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'user';
  isActive: boolean;
}

export const MENSAJE_USUARIO_DESACTIVADO = 'Tu usuario está desactivado. Habla con el administrador.';

// Create user profile in Firestore
const createUserProfile = async (firebaseUser: FirebaseUser, additionalData: any = {}) => {
  const userRef = doc(db, COLLECTIONS.USERS, firebaseUser.uid);
  const userDoc = await getDoc(userRef);

  if (!userDoc.exists()) {
    const { email } = firebaseUser;
    const createdAt = new Date().toISOString();

    try {
      await setDoc(userRef, {
        email,
        createdAt,
        role: 'user', // Default role
        ...additionalData
      });
    } catch (error) {
      console.error('Error creating user profile:', error);
    }
  }

  return userRef;
};

// Get user profile from Firestore
const getUserProfile = async (uid: string): Promise<User | null> => {
  try {
    const userRef = doc(db, COLLECTIONS.USERS, uid);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const data = userDoc.data();
      return {
        id: uid,
        username: data.username || data.email?.split('@')[0] || 'Usuario',
        email: data.email,
        role: data.role || 'user',
        // Solo un false explícito desactiva: los usuarios antiguos no traen el campo.
        isActive: data.isActive !== false
      };
    }
  } catch (error) {
    console.error('Error getting user profile:', error);
  }
  
  return null;
};

export const authService = {
  // Sign in with email and password
  async signIn(email: string, password: string): Promise<User | null> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userProfile = await getUserProfile(userCredential.user.uid);
      // Desactivar un usuario en Gestión de Usuarios guardaba isActive: false,
      // pero nada lo revisaba: la persona podía seguir entrando y vendiendo.
      if (userProfile && !userProfile.isActive) {
        await signOut(auth);
        throw Object.assign(new Error(MENSAJE_USUARIO_DESACTIVADO), { code: 'auth/usuario-desactivado' });
      }
      return userProfile;
    } catch (error) {
      console.error('Error signing in:', error);
      throw error;
    }
  },

  // Sign up with email and password
  async signUp(email: string, password: string, username: string, role: 'admin' | 'user' = 'user'): Promise<User | null> {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await createUserProfile(userCredential.user, { username, role });
      
      return {
        id: userCredential.user.uid,
        username,
        email,
        role,
        isActive: true
      };
    } catch (error) {
      console.error('Error signing up:', error);
      throw error;
    }
  },

  // Sign out
  async signOut(): Promise<void> {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  },

  // Subscribe to auth state changes
  onAuthStateChanged(callback: (user: User | null) => void) {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userProfile = await getUserProfile(firebaseUser.uid);
        // Una sesión guardada de un usuario que ya fue desactivado no se restaura.
        if (userProfile && !userProfile.isActive) {
          localStorage.setItem('sessionExpiredMsg', MENSAJE_USUARIO_DESACTIVADO);
          await signOut(auth);
          callback(null);
          return;
        }
        callback(userProfile);
      } else {
        callback(null);
      }
    });
  },

  // Get current user
  async getCurrentUser(): Promise<User | null> {
    const firebaseUser = auth.currentUser;
    if (firebaseUser) {
      return await getUserProfile(firebaseUser.uid);
    }
    return null;
  }
};