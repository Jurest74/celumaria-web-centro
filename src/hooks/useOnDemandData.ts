import { useEffect, useCallback } from 'react';
import { useFirebase } from '../contexts/FirebaseContext';
import { useAppSelector } from './useAppSelector';

// Hook para cargar datos específicos bajo demanda
// ⚡ OPTIMIZADO: Sin verificación de caché, se gestiona internamente
export function useOnDemandData(section: string) {
  const firebase = useFirebase();

  const loadData = useCallback(async () => {
    switch (section) {
      case 'products':
        await firebase.loadProducts();
        break;
      case 'categories':
        await firebase.loadCategories();
        break;
      case 'sales':
        await firebase.loadSales();
        break;
      case 'customers':
        await firebase.loadCustomers();
        break;
      case 'layaways':
        await firebase.loadLayaways();
        break;
      case 'stats':
        await firebase.loadStats();
        break;
      default:
        console.warn(`Sección desconocida: ${section}`);
    }
  }, [section, firebase]);

  return {
    loadData
  };
}

// Hook específico para el dashboard (carga mínima)
export function useDashboardData() {
  const firebase = useFirebase();
  const stats = useAppSelector(state => state.firebase.stats.data);
  const statsLoading = useAppSelector(state => state.firebase.stats.loading);

  const loadDashboardData = useCallback(async () => {
    // Solo cargar estadísticas para el dashboard
    await firebase.loadStats();
  }, [firebase]);

  useEffect(() => {
    // Cargar datos mínimos para el dashboard al montarse
    loadDashboardData();
  }, [loadDashboardData]);

  return {
    stats,
    statsLoading,
    refreshStats: firebase.loadStats
  };
}

// Hook para cargar datos cuando se navega a una sección
// ⚡ OPTIMIZADO: Invalida caché al entrar y carga datos frescos
export function useNavigationData(currentView: string) {
  const {
    loadProducts,
    loadSales,
    loadLayaways,
    loadCustomers,
    loadCategories,
    invalidateCache
  } = useFirebase();

  useEffect(() => {
    const loadDataForView = async () => {
      console.log(`🧭 Navegando a: ${currentView} - Cargando datos frescos`);

      switch (currentView) {
        case 'dashboard':
          // Cargar todos los datos necesarios para el dashboard
          invalidateCache('products');
          invalidateCache('sales');
          invalidateCache('layaways');
          invalidateCache('customers');
          invalidateCache('categories');

          await Promise.all([
            loadProducts(),
            loadSales(),
            loadLayaways(),
            loadCustomers(),
            loadCategories(),
          ]);
          break;
          
        case 'inventory':
          // Invalidar y recargar productos y categorías
          invalidateCache('products');
          invalidateCache('categories');
          await loadProducts();
          await loadCategories();
          break;

        case 'categories':
          // Invalidar y recargar categorías
          invalidateCache('categories');
          await loadCategories();
          break;

        case 'sales':
          // Invalidar y recargar productos y clientes para el POS
          invalidateCache('products');
          invalidateCache('customers');
          await loadProducts();
          await loadCustomers();
          break;

        case 'sales-history':
          // Invalidar y recargar ventas al entrar al historial
          invalidateCache('sales');
          await loadSales();
          break;

        case 'my-daily-sales':
          // No cargar todas las ventas - MyDailySales usa suscripción optimizada
          console.log('💰 Vista de mis ventas del día - suscripción optimizada activa');
          break;

        case 'purchases':
        case 'purchases-history':
          // Las compras se cargan bajo demanda usando usePaginatedPurchases
          console.log('📦 Vista de compras - datos cargados bajo demanda');
          break;

        case 'customers':
          // Invalidar y recargar clientes
          invalidateCache('customers');
          await loadCustomers();
          break;

        case 'courtesies':
          // Las cortesías se cargan bajo demanda en su componente
          console.log('🎁 Vista de cortesías - datos cargados bajo demanda');
          break;

        case 'layaway':
          // Invalidar y recargar datos necesarios para planes separe
          invalidateCache('layaways');
          invalidateCache('products');
          invalidateCache('customers');
          await loadLayaways();
          await loadProducts();
          await loadCustomers();
          break;

        case 'reports':
          // Los reportes cargan sus propios datos de manera optimizada
          console.log('📊 Vista de reportes - datos cargados bajo demanda');
          break;

        case 'technical-service':
        case 'technical-service-center':
          // Invalidar y recargar clientes para servicios técnicos
          invalidateCache('customers');
          await loadCustomers();
          // Los servicios técnicos se cargan bajo demanda en el componente
          break;

        case 'technician-liquidation':
          // La liquidación de técnicos maneja sus propias consultas filtradas
          console.log('🔧 Vista de liquidación de técnicos - datos cargados bajo demanda');
          break;

        default:
          console.log(`Vista no reconocida: ${currentView}`);
      }
    };

    loadDataForView();
  }, [currentView, loadProducts, loadSales, loadLayaways, loadCustomers, loadCategories, invalidateCache]);

  return {};
}

// Hook para activar/desactivar listeners en tiempo real por sección
export function useSectionRealtime(section: string) {
  const firebase = useFirebase();
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    switch (section) {
      case 'products':
        unsubscribe = firebase.subscribeToProducts();
        break;
      case 'categories':
        unsubscribe = firebase.subscribeToCategories();
        break;
      case 'sales':
        unsubscribe = firebase.subscribeToSales();
        break;
      case 'customers':
        unsubscribe = firebase.subscribeToCustomers();
        break;
      case 'layaways':
        unsubscribe = firebase.subscribeToLayaways();
        break;
      case 'technicalServices':
        unsubscribe = firebase.subscribeToTechnicalServices();
        break;
      default:
        break;
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [section, firebase]);
}