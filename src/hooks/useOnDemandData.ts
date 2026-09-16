import { startOfDayBogota, subtractMonthsBogota } from '../utils/dateUtils';
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

// Hook para cargar datos cuando se navega a una sección.
//
// Antes cada navegación invalidaba la caché y volvía a bajar las colecciones
// completas, asi que la caché de 10 minutos nunca se usaba: ir al Panel bajaba
// productos, ventas, planes separe, clientes y categorías otra vez, aunque
// vinieras de ahí hace un minuto. Ahora la caché hace su trabajo.
//
// Los datos siguen refrescándose: cada operación de escritura invalida lo que
// toca, las pantallas que necesitan verse vivas usan useSectionRealtime, y a
// los 10 minutos la caché caduca sola. Y el stock ya no depende de que la
// pantalla esté al día: las ventas y reservas lo verifican en el servidor
// dentro de una transacción, asi que un dato en pantalla algo viejo no puede
// producir una venta sin existencias.
export function useNavigationData(currentView: string) {
  const {
    loadProducts,
    loadSalesDesde,
    loadLayaways,
    loadCustomers,
    loadCategories
  } = useFirebase();

  useEffect(() => {
    const loadDataForView = async () => {
      console.log(`🧭 Navegando a: ${currentView} - Cargando datos frescos`);

      switch (currentView) {
        case 'dashboard':
          // El Panel solo grafica hasta 2 meses, asi que se piden las ventas de
          // ese periodo y no la coleccion completa: con el historico crecido,
          // entrar aqui costaba una lectura por venta de toda la vida del
          // negocio, y eso fue lo que agoto la cuota diaria de Firestore.
          await Promise.all([
            loadProducts(),
            loadSalesDesde(startOfDayBogota(subtractMonthsBogota(2))),
            loadLayaways(),
            loadCustomers(),
            loadCategories(),
          ]);
          break;
          
        case 'inventory':
          await loadProducts();
          await loadCategories();
          break;

        case 'categories':
          await loadCategories();
          break;

        case 'sales':
          await loadProducts();
          await loadCustomers();
          break;

        case 'sales-history':
          // Gestion de Ventas trae sus datos con consultas filtradas por fecha
          // (lista paginada y estadisticas). Antes ademas se descargaba aqui la
          // coleccion completa de ventas, que nadie usaba en esa pantalla.
          console.log('📄 Vista de gestión de ventas - datos por consulta filtrada');
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
          await loadCustomers();
          break;

        case 'courtesies':
          // Las cortesías se cargan bajo demanda en su componente
          console.log('🎁 Vista de cortesías - datos cargados bajo demanda');
          break;

        case 'layaway':
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
  }, [currentView, loadProducts, loadSalesDesde, loadLayaways, loadCustomers, loadCategories]);

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