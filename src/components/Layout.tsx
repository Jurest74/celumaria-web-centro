import React, { useState, useMemo, useEffect } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  BarChart3,
  Calendar,
  LogOut,
  User,
  History,
  Users,
  Tag,
  PackagePlus,
  UserCog,
  ChevronDown,
  ChevronRight,
  Activity,
  Archive,
  TrendingUp,
  Settings,
  DollarSign,
  Wrench,
  Gift
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getFilteredNavigation } from '../utils/permissions';
import { LogoutConfirmationModal } from './LogoutConfirmationModal';

interface LayoutProps {
  children: React.ReactNode;
  currentView: string;
  onViewChange: (view: string) => void;
}

const navigationCategories = [
  {
    id: 'operations',
    name: 'Operaciones',
    icon: Activity,
    items: [
      { id: 'dashboard', name: 'Panel de Control', icon: LayoutDashboard },
      { id: 'sales', name: 'Ventas', icon: ShoppingCart },
      { id: 'my-daily-sales', name: 'Mis Ventas del Día', icon: DollarSign },
      { id: 'layaway', name: 'Plan Separe', icon: Calendar },
      { id: 'technical-service', name: 'Servicio Técnico', icon: Settings },
      { id: 'technician-liquidation', name: 'Liquidación de Técnicos', icon: DollarSign },
      { id: 'customers', name: 'Clientes', icon: Users },
      { id: 'courtesies', name: 'Cortesías', icon: Gift },
    ]
  },
  {
    id: 'inventory',
    name: 'Inventario',
    icon: Archive,
    items: [
      { id: 'inventory', name: 'Productos', icon: Package },
      { id: 'purchases', name: 'Compras', icon: PackagePlus },
      { id: 'categories', name: 'Categorías', icon: Tag },
    ]
  },
  {
    id: 'analytics',
    name: 'Análisis',
    icon: TrendingUp,
    items: [
      { id: 'reports', name: 'Reportes', icon: BarChart3 },
      { id: 'sales-history', name: 'Gestión de Ventas', icon: History },
      { id: 'purchases-history', name: 'Gestión de Compras', icon: History },
      { id: 'technical-service-center', name: 'Centro de Servicios Técnicos', icon: Settings },
    ]
  },
  {
    id: 'settings',
    name: 'Configuración',
    icon: Settings,
    items: [
      { id: 'user-management', name: 'Gestión de Usuarios', icon: UserCog },
      { id: 'technician-management', name: 'Gestión de Técnicos', icon: Wrench },
    ]
  }
];

// Crear lista plana para compatibilidad con permisos
const allNavigation = navigationCategories.flatMap(category => category.items);

export function Layout({ children, currentView, onViewChange }: LayoutProps) {
  const { user, appUser, permissions, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => {
    // Por defecto, expandir la categoría que contiene la vista actual
    const currentCategory = navigationCategories.find(cat => 
      cat.items.some(item => item.id === currentView)
    );
    return new Set(currentCategory ? [currentCategory.id] : ['operations']);
  });

  // Funciones para expandir/colapsar categorías
  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  // Auto-expandir la categoría cuando cambias de vista
  useEffect(() => {
    const currentCategory = navigationCategories.find(cat => 
      cat.items.some(item => item.id === currentView)
    );
    if (currentCategory) {
      setExpandedCategories(prev => new Set([...prev, currentCategory.id]));
    }
  }, [currentView]);

  // Filtrar navegación basado en permisos
  const navigation = useMemo(() => {
    if (!permissions) return [];
    
    const filteredNav = getFilteredNavigation(permissions);
    return filteredNav.map(navItem => {
      const fullNavItem = allNavigation.find(item => item.id === navItem.id);
      return {
        ...navItem,
        icon: fullNavItem?.icon || LayoutDashboard
      };
    });
  }, [permissions]);

  // Crear categorías filtradas con elementos permitidos
  const filteredCategories = useMemo(() => {
    if (!permissions) return [];
    
    return navigationCategories.map(category => ({
      ...category,
      items: category.items.filter(item => 
        navigation.some(navItem => navItem.id === item.id)
      )
    })).filter(category => category.items.length > 0);
  }, [navigation]);

  // Verificar si el usuario tiene permisos para la vista actual y redirigir si es necesario
  useEffect(() => {
    if (navigation.length > 0) {
      const currentViewHasPermission = navigation.some(item => item.id === currentView);
      
      if (!currentViewHasPermission) {
        // Si no tiene permisos para la vista actual, redirigir a la primera disponible
        const firstAvailableView = navigation[0];
        if (firstAvailableView) {
          console.log(`🔒 Usuario sin permisos para '${currentView}', redirigiendo a '${firstAvailableView.id}'`);
          onViewChange(firstAvailableView.id);
        }
      }
    }
  }, [navigation, currentView, onViewChange]);

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = () => {
    logout();
    setShowLogoutModal(false);
  };

  const cancelLogout = () => {
    setShowLogoutModal(false);
  };

  const getRoleDisplayName = (role: string) => {
    return role === 'admin' ? 'Administrador' : 'Empleado';
  };

  const getUserDisplayName = (displayName: string, email?: string) => {
    // Si hay displayName, usarlo
    if (displayName && displayName.trim()) {
      return displayName.charAt(0).toUpperCase() + displayName.slice(1);
    }
    
    // Si no hay displayName pero hay email, usar la parte antes del @
    if (email) {
      const emailPrefix = email.split('@')[0];
      return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
    }
    
    return 'Usuario';
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header compacto para móviles */}
      <header className="bg-white shadow-lg sticky top-0 z-30 sm:hidden">
        <div className="flex items-center justify-between h-14 px-3">
          <div className="flex items-center gap-3">
            <button
              className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 focus:outline-none border border-gray-200 transition-all duration-200"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Abrir menú"
            >
              <svg className="h-5 w-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <div className="flex flex-col">
              <span className="font-bold text-sm text-gray-900">Celu Maria</span>
              <span className="text-xs" style={{color: '#90c5e7'}}>{getUserDisplayName(appUser?.displayName || '', appUser?.email || user?.email)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              appUser?.role === 'admin' 
                ? 'text-white'
                : 'bg-blue-100 text-blue-700'
            }`} style={appUser?.role === 'admin' ? {backgroundColor: '#90c5e7'} : {}}>
              {getRoleDisplayName(appUser?.role || '')}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 px-2 py-1 rounded-lg transition-all duration-200 border border-red-200 z-50 relative"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
              <span className="text-xs font-medium">Salir</span>
            </button>
          </div>
        </div>
      </header>

      {/* Header completo para sm+ */}
      <header className="bg-white fixed top-0 left-0 right-0 z-30 hidden sm:block h-16">
        <div className="relative h-full">
          {/* Overlay decorativo sutil */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-50/30 via-transparent to-purple-50/30"></div>
          
          {/* Contenido del header */}
          <div className="relative flex flex-row justify-between items-center h-16 px-8">
            <div className="flex items-center pl-2 -space-x-6">
              <div className="w-12 h-12 flex items-center justify-center z-10 relative">
                <img 
                  src="/logoLetras.jpeg" 
                  alt="Celu Maria Logo" 
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="w-48 h-14 flex items-center justify-center">
                <img 
                  src="/logoNombre.jpeg" 
                  alt="Celu Maria" 
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="border-l border-gray-300 pl-4 ml-2">
                <h1 className="text-lg font-bold text-gray-900 tracking-tight">Sistema de Gestión</h1>
                <p className="text-xs font-medium" style={{color: '#90c5e7'}}>Control de Inventario y Ventas</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-6 pr-4">
              <div className="flex items-center space-x-3 bg-gray-50 rounded-lg px-4 py-2 border border-gray-200 shadow-sm">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-white" />
                </div>
                <div className="text-left">
                  <span className="block text-sm font-semibold text-gray-900">{getUserDisplayName(appUser?.displayName || '', appUser?.email || user?.email)}</span>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-0.5 ${
                    appUser?.role === 'admin' 
                      ? 'text-white'
                      : 'bg-blue-100 text-blue-700'
                  }`} style={appUser?.role === 'admin' ? {backgroundColor: '#90c5e7'} : {}}>
                    {getRoleDisplayName(appUser?.role || '')}
                  </span>
                </div>
              </div>
              
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 px-4 py-2 rounded-lg transition-all duration-200 border border-red-200 hover:border-red-300 shadow-sm z-50 relative"
                title="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" />
                <span className="text-sm font-medium">Cerrar Sesión</span>
              </button>
            </div>
          </div>
          
          {/* Sombra solo en la parte que no está sobre el sidebar */}
          <div 
            className="absolute bottom-0 h-full transition-all duration-700 ease-out shadow-xl" 
            style={{
              left: sidebarHovered ? '256px' : '64px', 
              right: '0'
            }}
          ></div>
          
          {/* Línea decorativa inferior - alineada con sidebar */}
          <div 
            className="absolute bottom-0 h-0.5 transition-all duration-700 ease-out z-10" 
            style={{
              backgroundColor: '#90c5e7', 
              left: sidebarHovered ? '253px' : '61px', 
              right: '0'
            }}
          ></div>
        </div>
      </header>

      <div className="flex">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <nav className="fixed inset-0 z-40 bg-black bg-opacity-30 sm:hidden" onClick={() => setSidebarOpen(false)}>
            <div className="w-72 bg-white shadow-sm border-r border-gray-200 h-full p-4 transform transition-transform duration-200 translate-x-0 overflow-y-auto flex flex-col relative" onClick={e => e.stopPropagation()}>
              {/* Línea azul de marca en el lado derecho */}
              <div className="absolute top-0 right-0 bottom-0 w-0.5" style={{backgroundColor: '#90c5e7'}}></div>
              <button className="mb-4 p-2 rounded-md hover:bg-gray-100" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú">
                <svg className="h-6 w-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <div className="flex flex-col items-center mb-4">
                <div className="w-28 h-28 flex items-center justify-center mb-2">
                  <img 
                    src="/logoNombre.jpeg" 
                    alt="Celu Maria" 
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="font-bold text-base text-gray-900">Celu Maria</span>
              </div>
              <div className="space-y-3 flex-1 overflow-y-auto pb-4 relative">
                {filteredCategories.map((category) => {
                  const CategoryIcon = category.icon;
                  const isExpanded = expandedCategories.has(category.id);
                  
                  return (
                    <div key={category.id} className="space-y-1">
                      <button
                        onClick={() => toggleCategory(category.id)}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <div className="flex items-center">
                          <CategoryIcon className="mr-3 h-4 w-4 text-gray-600" />
                          {category.name}
                        </div>
                        {isExpanded ? 
                          <ChevronDown className="h-4 w-4 text-gray-500" /> : 
                          <ChevronRight className="h-4 w-4 text-gray-500" />
                        }
                      </button>
                      
                      {isExpanded && (
                        <ul className="ml-4 space-y-1">
                          {category.items.map((item) => {
                            const Icon = item.icon;
                            return (
                              <li key={item.id}>
                                <button
                                  onClick={() => {
                                    onViewChange(item.id);
                                    setSidebarOpen(false);
                                  }}
                                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                    currentView === item.id
                                      ? 'text-white border'
                                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                                  }`}
                                  style={currentView === item.id ? {backgroundColor: '#90c5e7', borderColor: '#90c5e7'} : {}}
                                >
                                  <Icon className="mr-3 h-4 w-4" />
                                  {item.name}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </nav>
        )}

        {/* Auto-hide sidebar for desktop */}
        <div 
          className={`hidden sm:block bg-white shadow-xl border-r border-gray-300 fixed left-0 top-16 bottom-0 overflow-hidden z-20 transition-all duration-700 ease-out ${
            sidebarHovered ? 'w-72' : 'w-16'
          }`}
          onMouseEnter={() => setSidebarHovered(true)}
          onMouseLeave={() => setSidebarHovered(false)}
        >
          {/* Línea azul de marca en el lado derecho */}
          <div className="absolute top-0 right-0 bottom-0 w-0.5" style={{backgroundColor: '#90c5e7'}}></div>
          <div className="h-full overflow-y-auto relative">
            {/* Collapsed state - only icons */}
            {!sidebarHovered && (
              <div className="p-3 space-y-2">
                {filteredCategories.map((category) => {
                  const hasCurrentView = category.items.some(item => item.id === currentView);
                  const CategoryIcon = category.icon;
                  
                  return (
                    <div key={category.id} className="space-y-1">
                      {/* Category icon - solo resaltado si NO hay items expandidos de esta categoría */}
                      <div 
                        className={`flex items-center justify-center p-3 rounded-lg transition-colors ${
                          hasCurrentView && !expandedCategories.has(category.id) ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                        title={category.name}
                      >
                        <CategoryIcon className="h-6 w-6" />
                      </div>
                      
                      {/* Items icons only if category is expanded and has current view */}
                      {expandedCategories.has(category.id) && (
                        <div className="ml-1 space-y-1">
                          {category.items.map((item) => {
                            const Icon = item.icon;
                            return (
                              <button
                                key={item.id}
                                onClick={() => onViewChange(item.id)}
                                className={`w-full flex items-center justify-center p-2.5 rounded-lg transition-colors ${
                                  currentView === item.id
                                    ? 'text-white'
                                    : 'text-gray-600 hover:bg-gray-100'
                                }`}
                                style={currentView === item.id ? {backgroundColor: '#90c5e7'} : {}}
                                title={item.name}
                              >
                                <Icon className="h-5 w-5" />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            
            {/* Expanded state - full sidebar */}
            {sidebarHovered && (
              <div className="p-4 space-y-3 h-full overflow-y-auto pb-4">
                {filteredCategories.map((category) => {
                  const CategoryIcon = category.icon;
                  const isExpanded = expandedCategories.has(category.id);
                  
                  return (
                    <div key={category.id} className="space-y-1">
                      <button
                        onClick={() => toggleCategory(category.id)}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <div className="flex items-center">
                          <CategoryIcon className="mr-3 h-4 w-4 text-gray-600" />
                          {category.name}
                        </div>
                        {isExpanded ? 
                          <ChevronDown className="h-4 w-4 text-gray-500" /> : 
                          <ChevronRight className="h-4 w-4 text-gray-500" />
                        }
                      </button>
                      
                      {isExpanded && (
                        <ul className="ml-4 space-y-1">
                          {category.items.map((item) => {
                            const Icon = item.icon;
                            return (
                              <li key={item.id}>
                                <button
                                  onClick={() => onViewChange(item.id)}
                                  className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                    currentView === item.id
                                      ? 'text-white border'
                                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                                  }`}
                                  style={currentView === item.id ? {backgroundColor: '#90c5e7', borderColor: '#90c5e7'} : {}}
                                >
                                  <Icon className="mr-3 h-4 w-4" />
                                  {item.name}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Main content */}
        <main className={`transition-all duration-700 ease-out w-full ${
          sidebarHovered ? 'sm:ml-72' : 'sm:ml-16'
        }`} style={{marginTop: '64px'}}>
          <div className="max-w-7xl mx-auto px-3">
            {children}
          </div>
        </main>
      </div>

      {/* Logout Confirmation Modal */}
      <LogoutConfirmationModal
        isOpen={showLogoutModal}
        onConfirm={confirmLogout}
        onCancel={cancelLogout}
        userName={getUserDisplayName(appUser?.displayName || '', user?.email)}
      />
    </div>
  );
}