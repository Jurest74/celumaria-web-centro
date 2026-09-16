import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService, User } from '../services/firebase/auth';
import { AppUser, UserPermissions } from '../types';
import { DEFAULT_PERMISSIONS, createPermissionHelpers } from '../utils/permissions';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { bogotaDateKey } from '../utils/dateUtils';

interface AuthContextType {
  user: User | null;
  appUser: AppUser | null;
  permissions: UserPermissions | null;
  permissionHelpers: ReturnType<typeof createPermissionHelpers> | null;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  showBirthdayNotification: boolean;
  dismissBirthdayNotification: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [permissionHelpers, setPermissionHelpers] = useState<ReturnType<typeof createPermissionHelpers> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showBirthdayNotification, setShowBirthdayNotification] = useState(false);

  // Función para verificar si mostrar notificaciones de cumpleaños
  const checkBirthdayNotification = (isGenuineLogin = false) => {
    // Solo mostrar notificaciones en login genuino, no en refresh/restauración de sesión
    if (!isGenuineLogin) {
      return;
    }
    
    setTimeout(async () => {
      // Verificar si realmente hay cumpleaños próximos
      try {
        const { customersService } = await import('../services/firebase/firestore');
        const customers = await customersService.getAll();
        
        // Usar la misma lógica que useBirthdayNotifications
        const hasUpcomingBirthdays = customers.some(customer => {
          if (!customer.birthDate) return false;
          
          try {
            const birthDateParts = customer.birthDate.split('-');
            if (birthDateParts.length !== 3) return false;
            
            const currentYear = new Date().getFullYear();
            const birthMonth = parseInt(birthDateParts[1], 10) - 1;
            const birthDay = parseInt(birthDateParts[2], 10);
            
            let birthdayThisYear = new Date(currentYear, birthMonth, birthDay);
            
            if (birthdayThisYear < new Date()) {
              birthdayThisYear = new Date(currentYear + 1, birthMonth, birthDay);
            }
            
            const timeDifference = birthdayThisYear.getTime() - new Date().getTime();
            const daysUntilBirthday = Math.ceil(timeDifference / (1000 * 60 * 60 * 24));
            
            return daysUntilBirthday >= 0 && daysUntilBirthday <= 5;
          } catch (error) {
            return false;
          }
        });
        
        if (hasUpcomingBirthdays) {
          setShowBirthdayNotification(true);
        }
      } catch (error) {
        console.error('Error checking birthday notifications:', error);
      }
    }, 3000); // Dar tiempo para que se carguen los clientes
  };

  // Función para cargar datos del usuario desde Firestore
  const loadUserData = async (firebaseUser: User) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.id));
      
      if (userDoc.exists()) {
        const userData = userDoc.data() as AppUser;
        // Un permiso que no existe en el documento no tiene decision guardada
        // (se agrego despues de crear el usuario): se cae al default del rol.
        const permisosEfectivos = {
          ...DEFAULT_PERMISSIONS[userData.role],
          ...userData.permissions,
        };
        setAppUser({ ...userData, permissions: permisosEfectivos });
        setPermissions(permisosEfectivos);
        setPermissionHelpers(createPermissionHelpers(permisosEfectivos));
        
        // No verificar cumpleaños aquí - se hace solo en login genuino
      } else {
        // Si no existe el documento del usuario, crear uno con permisos básicos
        const newUserData: AppUser = {
          uid: firebaseUser.id,
          email: firebaseUser.email || '',
          displayName: firebaseUser.username || firebaseUser.email?.split('@')[0] || '',
          role: 'employee', // Por defecto employee
          permissions: DEFAULT_PERMISSIONS.employee,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString()
        };

        // Guardar el nuevo usuario en Firestore
        await setDoc(doc(db, 'users', firebaseUser.id), newUserData);
        
        setAppUser(newUserData);
        setPermissions(newUserData.permissions);
        setPermissionHelpers(createPermissionHelpers(newUserData.permissions));
        
        // No verificar cumpleaños aquí - se hace solo en login genuino
      }
    } catch (error) {
      console.error('Error loading user data:', error);
      // En caso de error, usar permisos mínimos
      const minimalPermissions = DEFAULT_PERMISSIONS.employee;
      setPermissions(minimalPermissions);
      setPermissionHelpers(createPermissionHelpers(minimalPermissions));
    }
  };

  useEffect(() => {
    // Cierre de sesión diario automático
    const checkSessionDate = async (user: User | null) => {
      if (user) {
        const today = bogotaDateKey();
        const lastLoginDate = localStorage.getItem('lastLoginDate');
        // Solo forzar logout si lastLoginDate existe y es diferente a hoy
        if (lastLoginDate && lastLoginDate !== today) {
          await authService.signOut();
          setUser(null);
          setAppUser(null);
          setPermissions(null);
          setPermissionHelpers(null);
          localStorage.removeItem('lastLoginDate');
          setIsLoading(false);
          localStorage.setItem('sessionExpiredMsg', 'Por seguridad, debes volver a iniciar sesión.');
          return;
        }
        setUser(user);
        // Cargar datos del usuario desde Firestore
        await loadUserData(user);
        setIsLoading(false);
      } else {
        setUser(null);
        setAppUser(null);
        setPermissions(null);
        setPermissionHelpers(null);
        setIsLoading(false);
      }
    };

    // Subscribe to auth state changes
    const unsubscribe = authService.onAuthStateChanged((user) => {
      checkSessionDate(user);
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string): Promise<string | null> => {
    try {
      setIsLoading(true);
      const user = await authService.signIn(email, password);
      if (user) {
        setUser(user);
        // Guardar la fecha de login en localStorage (formato YYYY-MM-DD)
        const today = bogotaDateKey();
        localStorage.setItem('lastLoginDate', today);
        
        // Verificar notificaciones de cumpleaños solo en login genuino
        checkBirthdayNotification(true);
        
        return null;
      }
      return 'Email o contraseña incorrectos';
    } catch (error: any) {
      console.error('Login error:', error);
      // Manejar error de Firebase REST API
      if (error && error.message === 'INVALID_LOGIN_CREDENTIALS') {
        return 'Email o contraseña incorrectos';
      }
      if (error && error.code) {
        switch (error.code) {
          case 'auth/user-not-found':
            return 'Usuario no encontrado';
          case 'auth/wrong-password':
            return 'Contraseña incorrecta';
          case 'auth/invalid-email':
            return 'Email inválido';
          case 'auth/invalid-credential':
            return 'Email o contraseña incorrectos';
          default:
            return error.message || 'Error desconocido al iniciar sesión';
        }
      }
      // Si el error es un objeto con message
      if (error && typeof error.message === 'string') {
        return error.message;
      }
      // Si el error es un objeto con errors[0].message
      if (error && error.errors && Array.isArray(error.errors) && error.errors[0]?.message === 'INVALID_LOGIN_CREDENTIALS') {
        return 'Email o contraseña incorrectos';
      }
      // Si el error es un objeto con error.message
      if (error && error.error && typeof error.error.message === 'string') {
        if (error.error.message === 'INVALID_LOGIN_CREDENTIALS') {
          return 'Email o contraseña incorrectos';
        }
        return error.error.message;
      }
      return 'Error desconocido al iniciar sesión';
    } finally {
      setIsLoading(false);
    }
  };

  const dismissBirthdayNotification = () => {
    setShowBirthdayNotification(false);
    // La notificación puede aparecer de nuevo en el próximo login
  };

  // Función de debug para forzar la notificación
  const forceBirthdayNotification = () => {
    console.log('🔧 Forzando notificación de cumpleaños...');
    setShowBirthdayNotification(true);
  };

  // Exponer función de debug globalmente (solo en desarrollo)
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    (window as any).forceBirthdayNotification = forceBirthdayNotification;
    (window as any).debugUpcomingBirthdays = async () => {
      try {
        const { customersService } = await import('../services/firebase/firestore');
        const customers = await customersService.getAll();
        const today = new Date();
        
        console.log('🎂 Verificando cumpleaños próximos...');
        console.log(`📅 Fecha actual: ${today.toLocaleDateString()}`);
        
        const upcomingBirthdays = customers.filter(customer => {
          if (!customer.birthDate) return false;
          
          try {
            const birthDateParts = customer.birthDate.split('-');
            if (birthDateParts.length !== 3) return false;
            
            const currentYear = today.getFullYear();
            const birthMonth = parseInt(birthDateParts[1], 10) - 1;
            const birthDay = parseInt(birthDateParts[2], 10);
            
            let birthdayThisYear = new Date(currentYear, birthMonth, birthDay);
            
            if (birthdayThisYear < today) {
              birthdayThisYear = new Date(currentYear + 1, birthMonth, birthDay);
            }
            
            const timeDifference = birthdayThisYear.getTime() - today.getTime();
            const daysUntilBirthday = Math.ceil(timeDifference / (1000 * 60 * 60 * 24));
            
            if (daysUntilBirthday >= 0 && daysUntilBirthday <= 5) {
              console.log(`🎈 ${customer.name} cumple en ${daysUntilBirthday} días (${customer.birthDate})`);
              return true;
            }
            return false;
          } catch (error) {
            console.warn(`❌ Error procesando fecha de ${customer.name}:`, error);
            return false;
          }
        });
        
        console.log(`🎯 Total cumpleaños próximos: ${upcomingBirthdays.length}`);
        return upcomingBirthdays;
      } catch (error) {
        console.error('Error debuggeando cumpleaños:', error);
      }
    };
  }

  const logout = async () => {
    try {
      await authService.signOut();
      setUser(null);
      setAppUser(null);
      setPermissions(null);
      setPermissionHelpers(null);
      localStorage.removeItem('lastLoginDate');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const value = {
    user,
    appUser,
    permissions,
    permissionHelpers,
    login,
    logout,
    isAuthenticated: !!user,
    isLoading,
    showBirthdayNotification,
    dismissBirthdayNotification
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}