import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { UserPermissions } from '../types';

interface ProtectedComponentProps {
  permission: keyof UserPermissions;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function ProtectedComponent({ permission, children, fallback }: ProtectedComponentProps) {
  const { permissionHelpers } = useAuth();

  // Si no hay permisos cargados aún, mostrar loading
  if (!permissionHelpers) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Si no tiene permisos, mostrar fallback o mensaje de acceso denegado
  if (!permissionHelpers.hasPermission(permission)) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Acceso Denegado</h2>
          <p className="text-gray-600">No tienes permisos para acceder a esta sección.</p>
          <p className="text-sm text-gray-500 mt-2">Contacta al administrador si necesitas acceso.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// Hook para verificar permisos en componentes
export function usePermissionCheck(permission: keyof UserPermissions): boolean {
  const { permissionHelpers } = useAuth();
  
  if (!permissionHelpers) {
    return false;
  }
  
  return permissionHelpers.hasPermission(permission);
}

// Componente para elementos condicionales por permisos
export function ConditionalRender({ 
  permission, 
  children, 
  fallback = null 
}: { 
  permission: keyof UserPermissions; 
  children: React.ReactNode; 
  fallback?: React.ReactNode; 
}) {
  const hasPermission = usePermissionCheck(permission);
  
  return hasPermission ? <>{children}</> : <>{fallback}</>;
}
