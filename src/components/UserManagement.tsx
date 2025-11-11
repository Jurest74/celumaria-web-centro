import React, { useState, useEffect } from 'react';
import { Plus, Trash2, UserCheck, UserX, Mail, Shield, User, Search } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { collection, getDocs, updateDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { auth, db } from '../config/firebase';
import { AppUser, UserRole, UserPermissions } from '../types';
import { DEFAULT_PERMISSIONS } from '../utils/permissions';

interface CreateUserForm {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
}

export function UserManagement() {
  const { appUser } = useAuth();
  const { showSuccess, showError, showConfirm } = useNotification();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  
  // Estados para edición de permisos
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<UserPermissions | null>(null);
  const [savingPermissions, setSavingPermissions] = useState(false);

  const [createForm, setCreateForm] = useState<CreateUserForm>({
    email: '',
    password: '',
    displayName: '',
    role: 'employee'
  });

  // Verificar que el usuario actual sea admin
  if (appUser?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Acceso Denegado</h2>
          <p className="text-gray-600">Solo los administradores pueden gestionar usuarios.</p>
        </div>
      </div>
    );
  }

  // Cargar usuarios
  const loadUsers = async () => {
    try {
      setLoading(true);
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      const usersData = snapshot.docs.map(doc => ({
        ...doc.data(),
        uid: doc.data().uid || doc.id // Usar el uid del documento, fallback al id del documento
      })) as AppUser[];
      
      // Ordenar por fecha de creación
      usersData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setUsers(usersData);
    } catch (error) {
      console.error('Error loading users:', error);
      showError('Error', 'Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // Crear nuevo usuario
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingUser) return;

    try {
      setCreatingUser(true);

      // Crear una instancia secundaria de Firebase Auth para crear usuarios
      // sin afectar la sesión actual del administrador
      const secondaryApp = initializeApp({
        apiKey: "AIzaSyDc1KDOerTmt5Lq8M73r_0J-o3JrBiPs_E",
        authDomain: "celumaria-web.firebaseapp.com",
        projectId: "celumaria-web",
        storageBucket: "celumaria-web.firebasestorage.app",
        messagingSenderId: "917838775068",
        appId: "1:917838775068:web:cc5644825f6d26d8bdb0d9",
        measurementId: "G-NJXXNL2Z5L"
      }, 'Secondary');

      const secondaryAuth = getAuth(secondaryApp);

      // Crear usuario en la instancia secundaria (no afecta la sesión principal)
      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        createForm.email, 
        createForm.password
      );

      // Crear documento en Firestore
      const displayName = createForm.displayName.trim() || 
        createForm.email.split('@')[0].charAt(0).toUpperCase() + 
        createForm.email.split('@')[0].slice(1);
        
      const newUserData: Omit<AppUser, 'uid'> = {
        email: createForm.email,
        displayName: displayName,
        role: createForm.role,
        permissions: DEFAULT_PERMISSIONS[createForm.role],
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', userCredential.user.uid), {
        ...newUserData,
        uid: userCredential.user.uid
      });

      // Cerrar sesión en la instancia secundaria y eliminar la app
      await secondaryAuth.signOut();
      await deleteApp(secondaryApp);

      showSuccess('Éxito', 'Usuario creado exitosamente');
      setShowCreateForm(false);
      setCreateForm({
        email: '',
        password: '',
        displayName: '',
        role: 'employee'
      });
      loadUsers();
    } catch (error: any) {
      console.error('Error creating user:', error);
      if (error.code === 'auth/email-already-in-use') {
        showError('Error', 'Este email ya está registrado');
      } else if (error.code === 'auth/weak-password') {
        showError('Error', 'La contraseña debe tener al menos 6 caracteres');
      } else {
        showError('Error', 'Error al crear usuario: ' + error.message);
      }
    } finally {
      setCreatingUser(false);
    }
  };

  // Actualizar rol de usuario
  const handleUpdateUserRole = async (user: AppUser, newRole: UserRole) => {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      
      // Si se está degradando de admin a employee, usar permisos estándar pero quitar userManagement
      if (user.role === 'admin' && newRole === 'employee') {
        // Crear permisos de empleado estándar
        const updatedPermissions = { ...DEFAULT_PERMISSIONS[newRole] };
        
        await updateDoc(userDocRef, {
          role: newRole,
          permissions: updatedPermissions,
          updatedAt: new Date().toISOString()
        });
        
        showSuccess('Éxito', 'Usuario cambiado a empleado. Usa "Editar Permisos" para personalizar accesos.');
        loadUsers();
        return;
      }
      
      // Para promoción a admin o cambio normal, usar permisos estándar
      await updateDoc(userDocRef, {
        role: newRole,
        permissions: DEFAULT_PERMISSIONS[newRole],
        updatedAt: new Date().toISOString()
      });

      showSuccess('Éxito', `Usuario ${newRole === 'admin' ? 'convertido a administrador' : 'cambiado a empleado'}`);
      loadUsers();
    } catch (error) {
      console.error('Error updating user role:', error);
      showError('Error', 'Error al actualizar rol del usuario');
    }
  };

  // Cambiar estado activo
  const handleToggleUserStatus = async (user: AppUser) => {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        isActive: !user.isActive,
        updatedAt: new Date().toISOString()
      });

      showSuccess('Éxito', `Usuario ${!user.isActive ? 'activado' : 'desactivado'}`);
      loadUsers();
    } catch (error) {
      console.error('Error updating user status:', error);
      showError('Error', 'Error al cambiar estado del usuario');
    }
  };

  // Eliminar usuario
  const handleDeleteUser = async (user: AppUser) => {
    if (user.uid === appUser?.uid) {
      showError('Error', 'No puedes eliminar tu propia cuenta');
      return;
    }

    showConfirm(
      `¿Estás seguro de que quieres eliminar al usuario ${user.displayName}?`,
      'Esta acción no se puede deshacer.',
      async () => {
        try {
          await deleteDoc(doc(db, 'users', user.uid));
          showSuccess('Éxito', 'Usuario eliminado exitosamente');
          loadUsers();
        } catch (error) {
          console.error('Error deleting user:', error);
          showError('Error', 'Error al eliminar usuario');
        }
      }
    );
  };

  // Abrir modal de edición de permisos
  const handleEditPermissions = (user: AppUser) => {
    setEditingUser(user);
    setEditingPermissions({ ...user.permissions });
    setShowPermissionsModal(true);
  };

  // Guardar permisos editados
  const handleSavePermissions = async () => {
    if (!editingUser || !editingPermissions) return;

    try {
      setSavingPermissions(true);
      const userDocRef = doc(db, 'users', editingUser.uid);
      await updateDoc(userDocRef, {
        permissions: editingPermissions,
        updatedAt: new Date().toISOString()
      });

      showSuccess('Éxito', 'Permisos actualizados exitosamente');
      setShowPermissionsModal(false);
      setEditingUser(null);
      setEditingPermissions(null);
      loadUsers();
    } catch (error) {
      console.error('Error updating permissions:', error);
      showError('Error', 'Error al actualizar permisos');
    } finally {
      setSavingPermissions(false);
    }
  };

  // Alternar permiso específico
  const togglePermission = (permission: keyof UserPermissions) => {
    if (!editingPermissions) return;
    setEditingPermissions({
      ...editingPermissions,
      [permission]: !editingPermissions[permission]
    });
  };

  // Obtener descripción amigable de permisos
  const getPermissionLabel = (permission: keyof UserPermissions): string => {
    const labels: Record<keyof UserPermissions, string> = {
      dashboard: 'Panel de Control',
      inventory: 'Inventario',
      purchases: 'Compras',
      sales: 'Ventas',
      salesHistory: 'Gestión de Ventas',
      technicalServiceHistory: 'Historial de Servicios Técnicos',
      technicalServiceCenter: 'Centro de Servicios Técnicos',
      purchasesHistory: 'Gestión de Compras',
      layaway: 'Plan Separe',
      technicalService: 'Servicio Técnico',
      customers: 'Clientes',
      categories: 'Categorías',
      reports: 'Reportes',
      userManagement: 'Gestión de Usuarios',
      myDailySales: 'Mis Ventas del Día'
    };
    return labels[permission] || permission;
  };

  // Obtener descripción detallada de permisos
  const getPermissionDescription = (permission: keyof UserPermissions): string => {
    const descriptions: Record<keyof UserPermissions, string> = {
      dashboard: 'Ver estadísticas generales y resumen del sistema',
      inventory: 'Gestionar productos, stock y modificar inventario',
      purchases: 'Registrar compras a proveedores y gestionar entradas',
      sales: 'Realizar ventas y procesar transacciones',
      salesHistory: 'Ver historial completo de ventas realizadas',
      technicalServiceHistory: 'Ver historial completo de servicios técnicos realizados',
      technicalServiceCenter: 'Gestionar centro de servicios técnicos y reparaciones',
      purchasesHistory: 'Ver historial completo de compras realizadas',
      layaway: 'Gestionar el sistema de apartados y plan separe',
      technicalService: 'Crear y gestionar servicios técnicos y reparaciones',
      customers: 'Gestionar información de clientes',
      categories: 'Ver y gestionar categorías de productos',
      reports: 'Acceder a reportes detallados y analytics',
      userManagement: 'Gestionar usuarios, roles y permisos del sistema',
      myDailySales: 'Ver mis ventas realizadas en el día actual'
    };
    return descriptions[permission] || 'Sin descripción disponible';
  };

  // Cerrar modal de permisos
  const handleClosePermissionsModal = () => {
    setShowPermissionsModal(false);
    setEditingUser(null);
    setEditingPermissions(null);
  };

  // Filtrar usuarios
  const filteredUsers = users.filter(user => 
    (user.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleColor = (role: UserRole) => {
    return role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800';
  };

  const getRoleText = (role: UserRole) => {
    return role === 'admin' ? 'Administrador' : 'Empleado';
  };

  // Verificar si el usuario tiene permisos personalizados
  const hasCustomPermissions = (user: AppUser): boolean => {
    if (user.role === 'admin') return false; // Los admins siempre tienen todos los permisos
    
    const defaultEmployeePermissions = DEFAULT_PERMISSIONS.employee;
    return Object.keys(defaultEmployeePermissions).some(key => {
      const permission = key as keyof UserPermissions;
      return user.permissions[permission] !== defaultEmployeePermissions[permission];
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Usuarios</h1>
          <p className="text-gray-600">Administra usuarios, roles y permisos</p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2"
        >
          <Plus className="h-5 w-5" />
          <span>Crear Usuario</span>
        </button>
      </div>

      {/* Búsqueda */}
      <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            placeholder="Buscar usuarios por nombre o email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Lista de usuarios */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Usuarios ({filteredUsers.length})
          </h3>
        </div>
        
        <div className="divide-y divide-gray-200">
          {filteredUsers.map((user) => (
            <div key={user.uid} className="p-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                      <User className="h-6 w-6 text-gray-600" />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-medium text-gray-900">{user.displayName}</h4>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}>
                        {getRoleText(user.role)}
                      </span>
                      {hasCustomPermissions(user) && (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                          Permisos Personalizados
                        </span>
                      )}
                      {!user.isActive && (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Inactivo
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <Mail className="h-4 w-4" />
                      <span>{user.email}</span>
                    </div>
                    <p className="text-xs text-gray-400">
                      Creado: {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  {user.uid !== appUser?.uid && (
                    <>
                      {/* Cambiar rol */}
                      <button
                        onClick={() => handleUpdateUserRole(user, user.role === 'admin' ? 'employee' : 'admin')}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                          user.role === 'admin' 
                            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' 
                            : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                        }`}
                        title={user.role === 'admin' ? 'Cambiar a empleado' : 'Cambiar a administrador'}
                      >
                        {user.role === 'admin' ? 'Cambiar a Empleado' : 'Cambiar a Admin'}
                      </button>
                      
                      {/* Editar permisos (solo para empleados) */}
                      {user.role === 'employee' && (
                        <button
                          onClick={() => handleEditPermissions(user)}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                          title="Editar permisos"
                        >
                          <Shield className="h-4 w-4" />
                        </button>
                      )}
                      
                      {/* Cambiar estado */}
                      <button
                        onClick={() => handleToggleUserStatus(user)}
                        className={`p-2 rounded transition-colors ${
                          user.isActive 
                            ? 'text-red-600 hover:bg-red-50' 
                            : 'text-green-600 hover:bg-green-50'
                        }`}
                        title={user.isActive ? 'Desactivar usuario' : 'Activar usuario'}
                      >
                        {user.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                      </button>
                      
                      {/* Eliminar */}
                      <button
                        onClick={() => handleDeleteUser(user)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Eliminar usuario"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  {user.uid === appUser?.uid && (
                    <span className="text-xs text-gray-500 px-3 py-1">Tu cuenta</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {filteredUsers.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No se encontraron usuarios
          </div>
        )}
      </div>

      {/* Modal de crear usuario */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Crear Nuevo Usuario</h3>
            
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm({...createForm, email: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="usuario@ejemplo.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={createForm.password}
                  onChange={(e) => setCreateForm({...createForm, password: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo (opcional)</label>
                <input
                  type="text"
                  value={createForm.displayName}
                  onChange={(e) => setCreateForm({...createForm, displayName: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Si no se especifica, se usará el email"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({...createForm, role: e.target.value as UserRole})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="employee">Empleado</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              
              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {creatingUser ? 'Creando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de edición de permisos */}
      {showPermissionsModal && editingUser && editingPermissions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">Editar Permisos</h3>
                  <p className="text-sm text-gray-600">{editingUser.displayName} ({editingUser.email})</p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      // Habilitar todos los permisos
                      const allPermissions = Object.keys(editingPermissions).reduce((acc, key) => {
                        acc[key as keyof UserPermissions] = true;
                        return acc;
                      }, {} as UserPermissions);
                      setEditingPermissions(allPermissions);
                    }}
                    className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                  >
                    Habilitar Todo
                  </button>
                  <button
                    onClick={() => {
                      // Deshabilitar todos los permisos
                      const noPermissions = Object.keys(editingPermissions).reduce((acc, key) => {
                        acc[key as keyof UserPermissions] = false;
                        return acc;
                      }, {} as UserPermissions);
                      setEditingPermissions(noPermissions);
                    }}
                    className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                  >
                    Deshabilitar Todo
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.keys(editingPermissions).map((key) => {
                  const permission = key as keyof UserPermissions;
                  const isEnabled = editingPermissions![permission];
                  
                  return (
                    <div key={key} className={`border rounded-lg p-4 transition-colors ${
                      isEnabled ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium text-gray-900">{getPermissionLabel(permission)}</h4>
                          <p className="text-xs text-gray-500 mt-1">{getPermissionDescription(permission)}</p>
                        </div>
                        <button
                          onClick={() => togglePermission(permission)}
                          className={`w-12 h-6 rounded-full transition-colors relative ${
                            isEnabled ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                        >
                          <div className={`w-5 h-5 bg-white rounded-full transition-transform absolute top-0.5 ${
                            isEnabled ? 'translate-x-6' : 'translate-x-0.5'
                          }`} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="flex space-x-3 pt-4">
              <button
                onClick={handleClosePermissionsModal}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSavePermissions}
                disabled={savingPermissions}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {savingPermissions ? 'Guardando...' : 'Guardar Permisos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
