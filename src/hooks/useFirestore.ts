import { useState, useEffect } from 'react';
import {
  productsService,
  categoriesService,
  salesService,
  customersService,
  layawaysService,
  statsService
} from '../services/firebase/firestore';
import type { 
  Product, 
  Category, 
  Sale, 
  Customer, 
  LayawayPlan,
  DashboardStats 
} from '../types';

// Generic hook for Firestore collections with real-time updates
export function useFirestoreCollection<T>(
  service: {
    getAll: () => Promise<T[]>;
    subscribe: (callback: (items: T[]) => void) => () => void;
  }
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const initializeData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get initial data
        const initialData = await service.getAll();
        setData(initialData);
        
        // Subscribe to real-time updates
        unsubscribe = service.subscribe((updatedData) => {
          setData(updatedData);
          setLoading(false);
        });
        
      } catch (err) {
        console.error('Error initializing Firestore data:', err);
        setError(err instanceof Error ? err.message : 'Error loading data');
        setLoading(false);
      }
    };

    initializeData();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  return { data, loading, error, setData };
}

// Hook específico para layaways simplificado
export function useLayaways() {
  const [data, setData] = useState<LayawayPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const initializeData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log('🔄 Inicializando layaways con consulta simple...');
        
        // Obtener todos los planes separe (sin filtros complejos)
        const allLayaways = await layawaysService.getAll();
        setData(allLayaways);
        
        // Suscribirse a todos los cambios (sin filtros)
        unsubscribe = layawaysService.subscribe((updatedLayaways) => {
          console.log(`🔄 Actualización de layaways: ${updatedLayaways.length}`);
          setData(updatedLayaways);
          setLoading(false);
        });
        
      } catch (err) {
        console.error('Error initializing layaways data:', err);
        setError(err instanceof Error ? err.message : 'Error loading layaways');
        setLoading(false);
      }
    };

    initializeData();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  return { data, loading, error, setData };
}

// Specific hooks for each collection
export const useProducts = () => useFirestoreCollection<Product>(productsService);
export const useCategories = () => useFirestoreCollection<Category>(categoriesService);
export const useSales = () => useFirestoreCollection<Sale>(salesService);
export const useCustomers = () => useFirestoreCollection<Customer>(customersService);

// Dashboard stats hook (calculated data)
// ⚡ OPTIMIZADO: Solo carga una vez al montar, sin recargas automáticas
export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        setLoading(true);
        setError(null);
        const dashboardStats = await statsService.getDashboardStats();
        setStats(dashboardStats);
      } catch (err) {
        console.error('Error loading dashboard stats:', err);
        setError(err instanceof Error ? err.message : 'Error loading stats');
      } finally {
        setLoading(false);
      }
    };

    loadStats();

    // ❌ REMOVIDO: Interval de 30 segundos que causaba +450k lecturas/día
    // Los datos se recargan al volver a entrar al dashboard

  }, []);

  return { stats, loading, error };
}