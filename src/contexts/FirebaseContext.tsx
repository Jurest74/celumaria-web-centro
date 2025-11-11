import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useAppDispatch } from '../hooks/useAppDispatch';
import {
  setProducts,
  setProductsLoading,
  setProductsError,
  setCategories,
  setCategoriesLoading,
  setCategoriesError,
  setSales,
  setSalesLoading,
  setSalesError,
  setCustomers,
  setCustomersLoading,
  setCustomersError,
  setLayaways,
  setLayawaysLoading,
  setLayawaysError,
  setTechnicalServices,
  setTechnicalServicesLoading,
  setTechnicalServicesError,
  setStats,
  setStatsLoading,
  setStatsError,
} from '../store/slices/firebaseSlice';
import {
  productsService,
  categoriesService,
  salesService,
  customersService,
  layawaysService,
  technicalServicesService,
  statsService
} from '../services/firebase/firestore';

interface FirebaseContextType {
  // Funciones para cargar datos bajo demanda
  loadProducts: () => Promise<void>;
  forceLoadProducts: () => Promise<void>;
  loadCategories: () => Promise<void>;
  loadSales: () => Promise<void>;
  loadCustomers: () => Promise<void>;
  loadLayaways: () => Promise<void>;
  loadTechnicalServices: () => Promise<void>;
  loadStats: () => Promise<void>;
  // ⚡ Funciones de invalidación de caché para forzar recarga
  invalidateCache: (section: string) => void;
  invalidateAllCache: () => void;
  invalidateSales: () => void;
  needsFreshSalesData: boolean;
  markSalesDataAsRead: () => void;
  // Suscripciones en tiempo real (raramente usadas)
  subscribeToProducts: () => () => void;
  subscribeToCategories: () => () => void;
  subscribeToSales: () => () => void;
  subscribeToCustomers: () => () => void;
  subscribeToLayaways: () => () => void;
  subscribeToLayawaysByStatus: (status: 'active' | 'completed' | 'cancelled') => () => void;
  subscribeToTechnicalServices: () => () => void;
  subscribeToTechnicalServicesByStatus: (status: 'active' | 'completed' | 'cancelled') => () => void;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  // ⚡ CRÍTICO: Usar useRef para evitar re-renders infinitos
  const loadedSectionsRef = useRef<Map<string, number>>(new Map());
  const [needsFreshSalesData, setNeedsFreshSalesData] = useState(false);

  // ⚡ Funciones de invalidación de caché genéricas (estables con useCallback)
  const invalidateCache = useCallback((section: string) => {
    console.log(`🔄 Invalidando caché de: ${section}`);
    loadedSectionsRef.current.delete(section);
  }, []);

  const invalidateAllCache = useCallback(() => {
    console.log('🔄 Invalidando todo el caché');
    loadedSectionsRef.current.clear();
  }, []);

  // Funciones de invalidación de caché para ventas (compatibilidad)
  const invalidateSales = useCallback(() => {
    console.log('🔄 Invalidando caché de ventas - se solicitarán datos frescos');
    setNeedsFreshSalesData(true);
    invalidateCache('sales');
  }, [invalidateCache]);

  const markSalesDataAsRead = useCallback(() => {
    console.log('✅ Datos de ventas marcados como leídos');
    setNeedsFreshSalesData(false);
  }, []);

  // Helper para saber si una sección está cargada y no expirada (estable)
  const isSectionFresh = useCallback((section: string) => {
    const timestamp = loadedSectionsRef.current.get(section);
    if (!timestamp) return false;
    // Considera expirado si pasaron más de 10 minutos
    return Date.now() - timestamp < 10 * 60 * 1000;
  }, []);

  // Helper para marcar sección como cargada ahora (estable)
  const markSectionAsLoaded = useCallback((section: string) => {
    loadedSectionsRef.current.set(section, Date.now());
  }, []);

  // Cargar productos bajo demanda
  const loadProducts = useCallback(async () => {
    if (isSectionFresh('products')) return;
    
    try {
      console.log('🔄 Cargando productos bajo demanda...');
      dispatch(setProductsLoading(true));
      dispatch(setProductsError(null));
      
      const products = await productsService.getAll();
      dispatch(setProducts(products));
      markSectionAsLoaded('products');
      
      console.log(`✅ Productos cargados: ${products.length}`);
    } catch (error) {
      console.error('❌ Error cargando productos:', error);
      dispatch(setProductsError(error instanceof Error ? error.message : 'Error loading products'));
    } finally {
      dispatch(setProductsLoading(false));
    }
  }, [dispatch, isSectionFresh, markSectionAsLoaded]);

  // Forzar carga de productos (ignora cache)
  const forceLoadProducts = useCallback(async () => {
    try {
      console.log('🔄 Forzando recarga de productos...');
      dispatch(setProductsLoading(true));
      dispatch(setProductsError(null));
      
      const products = await productsService.getAll();
      dispatch(setProducts(products));
      markSectionAsLoaded('products');
      
      console.log(`✅ Productos forzadamente recargados: ${products.length}`);
    } catch (error) {
      console.error('❌ Error forzando recarga de productos:', error);
      dispatch(setProductsError(error instanceof Error ? error.message : 'Error loading products'));
    } finally {
      dispatch(setProductsLoading(false));
    }
  }, [dispatch, markSectionAsLoaded]);

  // Cargar categorías bajo demanda
  const loadCategories = useCallback(async () => {
    if (isSectionFresh('categories')) return;
    
    try {
      console.log('🔄 Cargando categorías bajo demanda...');
      dispatch(setCategoriesLoading(true));
      dispatch(setCategoriesError(null));
      
      const categories = await categoriesService.getAll();
      dispatch(setCategories(categories));
      markSectionAsLoaded('categories');
      
      console.log(`✅ Categorías cargadas: ${categories.length}`);
    } catch (error) {
      console.error('❌ Error cargando categorías:', error);
      dispatch(setCategoriesError(error instanceof Error ? error.message : 'Error loading categories'));
    } finally {
      dispatch(setCategoriesLoading(false));
    }
  }, [dispatch, isSectionFresh, markSectionAsLoaded]);

  // Cargar ventas bajo demanda
  const loadSales = useCallback(async () => {
    if (isSectionFresh('sales')) return;
    
    try {
      console.log('🔄 Cargando ventas bajo demanda...');
      dispatch(setSalesLoading(true));
      dispatch(setSalesError(null));
      
      const sales = await salesService.getAll();
      dispatch(setSales(sales));
      markSectionAsLoaded('sales');
      
      console.log(`✅ Ventas cargadas: ${sales.length}`);
    } catch (error) {
      console.error('❌ Error cargando ventas:', error);
      dispatch(setSalesError(error instanceof Error ? error.message : 'Error loading sales'));
    } finally {
      dispatch(setSalesLoading(false));
    }
  }, [dispatch, isSectionFresh, markSectionAsLoaded]);

  // Cargar clientes bajo demanda
  const loadCustomers = useCallback(async () => {
    if (isSectionFresh('customers')) return;
    
    try {
      console.log('🔄 Cargando clientes bajo demanda...');
      dispatch(setCustomersLoading(true));
      dispatch(setCustomersError(null));
      
      const customers = await customersService.getAll();
      dispatch(setCustomers(customers));
      markSectionAsLoaded('customers');
      
      console.log(`✅ Clientes cargados: ${customers.length}`);
    } catch (error) {
      console.error('❌ Error cargando clientes:', error);
      dispatch(setCustomersError(error instanceof Error ? error.message : 'Error loading customers'));
    } finally {
      dispatch(setCustomersLoading(false));
    }
  }, [dispatch, isSectionFresh, markSectionAsLoaded]);

  // Cargar planes separe bajo demanda
  const loadLayaways = useCallback(async () => {
    if (isSectionFresh('layaways')) return;
    
    try {
      console.log('🔄 Cargando planes separe bajo demanda...');
      dispatch(setLayawaysLoading(true));
      dispatch(setLayawaysError(null));
      
      const layaways = await layawaysService.getAll();
      dispatch(setLayaways(layaways));
      markSectionAsLoaded('layaways');
      
      console.log(`✅ Planes separe cargados: ${layaways.length}`);
    } catch (error) {
      console.error('❌ Error cargando planes separe:', error);
      dispatch(setLayawaysError(error instanceof Error ? error.message : 'Error loading layaways'));
    } finally {
      dispatch(setLayawaysLoading(false));
    }
  }, [dispatch, isSectionFresh, markSectionAsLoaded]);

  // Cargar servicios técnicos bajo demanda
  const loadTechnicalServices = useCallback(async () => {
    if (isSectionFresh('technicalServices')) return;
    
    try {
      console.log('🔄 Cargando servicios técnicos bajo demanda...');
      dispatch(setTechnicalServicesLoading(true));
      dispatch(setTechnicalServicesError(null));
      
      const technicalServices = await technicalServicesService.getAll();
      dispatch(setTechnicalServices(technicalServices));
      markSectionAsLoaded('technicalServices');
      
      console.log(`✅ Servicios técnicos cargados: ${technicalServices.length}`);
    } catch (error) {
      console.error('❌ Error cargando servicios técnicos:', error);
      dispatch(setTechnicalServicesError(error instanceof Error ? error.message : 'Error loading technical services'));
    } finally {
      dispatch(setTechnicalServicesLoading(false));
    }
  }, [dispatch, isSectionFresh, markSectionAsLoaded]);

  // Cargar estadísticas bajo demanda
  const loadStats = useCallback(async () => {
    try {
      console.log('🔄 Cargando estadísticas bajo demanda...');
      dispatch(setStatsLoading(true));
      dispatch(setStatsError(null));
      
      const stats = await statsService.getDashboardStats();
      dispatch(setStats(stats));
      
      console.log('✅ Estadísticas cargadas');
    } catch (error) {
      console.error('❌ Error cargando estadísticas:', error);
      dispatch(setStatsError(error instanceof Error ? error.message : 'Error loading stats'));
    } finally {
      dispatch(setStatsLoading(false));
    }
  }, [dispatch]);

  // Suscripciones en tiempo real
  const subscribeToProducts = useCallback(() => {
    const unsubscribe = productsService.subscribe((products) => {
      dispatch(setProducts(products));
    });
    return unsubscribe;
  }, [dispatch]);
  const subscribeToCategories = useCallback(() => {
    const unsubscribe = categoriesService.subscribe((categories) => {
      dispatch(setCategories(categories));
    });
    return unsubscribe;
  }, [dispatch]);
  const subscribeToSales = useCallback(() => {
    const unsubscribe = salesService.subscribe((sales) => {
      dispatch(setSales(sales));
    });
    return unsubscribe;
  }, [dispatch]);
  const subscribeToCustomers = useCallback(() => {
    const unsubscribe = customersService.subscribe((customers) => {
      dispatch(setCustomers(customers));
    });
    return unsubscribe;
  }, [dispatch]);
  const subscribeToLayaways = useCallback(() => {
    const unsubscribe = layawaysService.subscribe((layaways) => {
      dispatch(setLayaways(layaways));
    });
    return unsubscribe;
  }, [dispatch]);
  
  const subscribeToLayawaysByStatus = useCallback((status: 'active' | 'completed' | 'cancelled') => {
    const unsubscribe = layawaysService.subscribeByStatus(status, (layaways) => {
      dispatch(setLayaways(layaways));
    });
    return unsubscribe;
  }, [dispatch]);

  const subscribeToTechnicalServices = useCallback(() => {
    const unsubscribe = technicalServicesService.subscribe((technicalServices) => {
      dispatch(setTechnicalServices(technicalServices));
    });
    return unsubscribe;
  }, [dispatch]);

  const subscribeToTechnicalServicesByStatus = useCallback((status: 'active' | 'completed' | 'cancelled') => {
    const unsubscribe = technicalServicesService.subscribeByStatus(status, (technicalServices) => {
      dispatch(setTechnicalServices(technicalServices));
    });
    return unsubscribe;
  }, [dispatch]);

  const value = {
    loadProducts,
    forceLoadProducts,
    loadCategories,
    loadSales,
    loadCustomers,
    loadLayaways,
    loadTechnicalServices,
    loadStats,
    invalidateCache,
    invalidateAllCache,
    invalidateSales,
    needsFreshSalesData,
    markSalesDataAsRead,
    subscribeToProducts,
    subscribeToCategories,
    subscribeToSales,
    subscribeToCustomers,
    subscribeToLayaways,
    subscribeToLayawaysByStatus,
    subscribeToTechnicalServices,
    subscribeToTechnicalServicesByStatus,
  };

  return (
    <FirebaseContext.Provider value={value}>
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
}