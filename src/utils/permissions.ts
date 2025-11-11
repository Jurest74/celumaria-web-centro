import { UserRole, UserPermissions } from '../types';

// Permisos por defecto para cada rol
export const DEFAULT_PERMISSIONS: Record<UserRole, UserPermissions> = {
  admin: {
    dashboard: true,
    inventory: true,
    purchases: true,
    sales: true,
    salesHistory: true,
    technicalServiceHistory: true,
    technicalServiceCenter: true, // Centro de Servicios Técnicos
    purchasesHistory: true,
    layaway: true,
    technicalService: true,
    customers: true,
    categories: true,
    reports: true,
    userManagement: true, // Solo admins pueden gestionar usuarios
    technicianManagement: true, // Solo admins pueden gestionar técnicos
    technicianLiquidation: true, // Solo admins pueden gestionar liquidaciones
    myDailySales: false, // Los admins no necesitan ver esta sección
    courtesies: true, // ✅ Acceso a historial de cortesías
  },

  employee: {
    dashboard: false, // Sin acceso al panel de control
    inventory: false, // Sin acceso al inventario
    purchases: false, // Sin acceso a compras
    sales: true, // ✅ Acceso a ventas
    salesHistory: false, // Sin acceso al historial de ventas
    technicalServiceHistory: false, // Sin acceso al historial de servicios técnicos
    technicalServiceCenter: false, // Sin acceso al centro de servicios técnicos
    purchasesHistory: false, // Sin acceso al historial de compras
    layaway: true, // ✅ Acceso a plan separé
    technicalService: true, // ✅ Acceso a servicio técnico
    customers: true, // ✅ Acceso a clientes
    categories: false, // Sin acceso a categorías/configuración
    reports: false, // Sin acceso a reportes/análisis
    userManagement: false, // Sin acceso a gestión de usuarios
    technicianManagement: false, // Sin acceso a gestión de técnicos
    technicianLiquidation: false, // Sin acceso a liquidación de técnicos
    myDailySales: true, // ✅ Acceso a mis ventas del día
    courtesies: false, // Sin acceso a historial de cortesías
  }
};

// Hook para verificar permisos
export const usePermissions = (userPermissions: UserPermissions) => {
  const hasPermission = (permission: keyof UserPermissions): boolean => {
    return userPermissions[permission] || false;
  };

  const hasAnyPermission = (permissions: (keyof UserPermissions)[]): boolean => {
    return permissions.some(permission => hasPermission(permission));
  };

  const hasAllPermissions = (permissions: (keyof UserPermissions)[]): boolean => {
    return permissions.every(permission => hasPermission(permission));
  };

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    permissions: userPermissions
  };
};

// Funciones auxiliares para verificar permisos (sin hooks)
export const createPermissionHelpers = (userPermissions: UserPermissions) => {
  const hasPermission = (permission: keyof UserPermissions): boolean => {
    return userPermissions[permission] || false;
  };

  const hasAnyPermission = (permissions: (keyof UserPermissions)[]): boolean => {
    return permissions.some(permission => hasPermission(permission));
  };

  const hasAllPermissions = (permissions: (keyof UserPermissions)[]): boolean => {
    return permissions.every(permission => hasPermission(permission));
  };

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    permissions: userPermissions
  };
};

// Filtrar opciones de navegación basado en permisos
export const getFilteredNavigation = (permissions: UserPermissions) => {
  const navigationItems = [
    { 
      id: 'dashboard', 
      name: 'Panel de Control', 
      requiredPermissions: ['dashboard'] as (keyof UserPermissions)[]
    },
    { 
      id: 'inventory', 
      name: 'Inventario', 
      requiredPermissions: ['inventory'] as (keyof UserPermissions)[]
    },
    { 
      id: 'purchases', 
      name: 'Compras', 
      requiredPermissions: ['purchases'] as (keyof UserPermissions)[]
    },
    { 
      id: 'sales', 
      name: 'Ventas', 
      requiredPermissions: ['sales'] as (keyof UserPermissions)[]
    },
    { 
      id: 'sales-history', 
      name: 'Gestión de Ventas', 
      requiredPermissions: ['salesHistory'] as (keyof UserPermissions)[]
    },
    { 
      id: 'my-daily-sales', 
      name: 'Mis Ventas del Día', 
      requiredPermissions: ['myDailySales'] as (keyof UserPermissions)[]
    },
    { 
      id: 'technical-service-center', 
      name: 'Centro de Servicios Técnicos', 
      requiredPermissions: ['technicalServiceCenter'] as (keyof UserPermissions)[]
    },
    { 
      id: 'purchases-history', 
      name: 'Gestión de Compras', 
      requiredPermissions: ['purchasesHistory'] as (keyof UserPermissions)[]
    },
    { 
      id: 'layaway', 
      name: 'Plan Separe', 
      requiredPermissions: ['layaway'] as (keyof UserPermissions)[]
    },
    { 
      id: 'technical-service', 
      name: 'Servicio Técnico', 
      requiredPermissions: ['technicalService'] as (keyof UserPermissions)[]
    },
    { 
      id: 'customers', 
      name: 'Clientes', 
      requiredPermissions: ['customers'] as (keyof UserPermissions)[]
    },
    { 
      id: 'categories', 
      name: 'Categorías', 
      requiredPermissions: ['categories'] as (keyof UserPermissions)[]
    },
    { 
      id: 'reports', 
      name: 'Reportes', 
      requiredPermissions: ['reports'] as (keyof UserPermissions)[]
    },
    { 
      id: 'user-management', 
      name: 'Gestión de Usuarios', 
      requiredPermissions: ['userManagement'] as (keyof UserPermissions)[]
    },
    { 
      id: 'technician-management', 
      name: 'Gestión de Técnicos', 
      requiredPermissions: ['technicianManagement'] as (keyof UserPermissions)[]
    },
    {
      id: 'technician-liquidation',
      name: 'Liquidación de Técnicos',
      requiredPermissions: ['technicianLiquidation'] as (keyof UserPermissions)[]
    },
    {
      id: 'courtesies',
      name: 'Cortesías',
      requiredPermissions: ['courtesies'] as (keyof UserPermissions)[]
    }
  ];

  return navigationItems.filter(item => {
    return item.requiredPermissions.every(permission => permissions[permission]);
  });
};

// Verificar si el usuario puede acceder a una ruta
export const canAccessRoute = (route: string, permissions: UserPermissions): boolean => {
  const routePermissions: Record<string, (keyof UserPermissions)[]> = {
    'dashboard': ['dashboard'],
    'inventory': ['inventory'],
    'purchases': ['purchases'],
    'sales': ['sales'],
    'sales-history': ['salesHistory'],
    'my-daily-sales': ['myDailySales'],
    'technical-service-center': ['technicalServiceCenter'],
    'purchases-history': ['purchasesHistory'],
    'layaway': ['layaway'],
    'technical-service': ['technicalService'],
    'customers': ['customers'],
    'categories': ['categories'],
    'reports': ['reports'],
    'user-management': ['userManagement'],
    'technician-management': ['technicianManagement'],
    'technician-liquidation': ['technicianLiquidation'],
    'courtesies': ['courtesies']
  };

  const requiredPermissions = routePermissions[route];
  if (!requiredPermissions) return true; // Ruta pública

  return requiredPermissions.every(permission => permissions[permission]);
};
