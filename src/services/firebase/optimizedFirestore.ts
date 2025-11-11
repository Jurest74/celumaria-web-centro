// 🚀 FIRESTORE OPTIMIZADO - Minimiza lecturas para mantenerlo GRATIS

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  writeBatch,
  increment,
  startAfter,
  DocumentSnapshot
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { COLLECTIONS } from './collections';
import { getColombiaTimestamp } from '../../utils/dateUtils';

// ✅ Estrategias de optimización para mantenerlo GRATIS

export const optimizedFirestore = {
  // 📖 Paginación para reducir lecturas
  async getPaginatedData<T>(
    collectionName: string,
    pageSize: number = 20,
    lastDoc?: DocumentSnapshot
  ): Promise<{ data: T[]; lastDoc: DocumentSnapshot | null }> {
    let q = query(
      collection(db, collectionName),
      orderBy('createdAt', 'desc'),
      limit(pageSize)
    );

    if (lastDoc) {
      q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as T[];

    const newLastDoc = snapshot.docs[snapshot.docs.length - 1] || null;

    return { data, lastDoc: newLastDoc };
  },

  // 🎯 Consultas específicas para reducir transferencia
  async getRecentSales(limit: number = 10) {
    const q = query(
      collection(db, COLLECTIONS.SALES),
      orderBy('createdAt', 'desc'),
      limit(limit)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  },

  // 📊 Solo estadísticas esenciales
  async getEssentialStats() {
    // En lugar de cargar todos los datos, podríamos tener un documento de stats
    // que se actualiza con triggers (pero eso requiere Cloud Functions)
    // Por ahora, cargamos datos mínimos necesarios
    
    const [productsSnapshot, salesSnapshot] = await Promise.all([
      getDocs(query(collection(db, COLLECTIONS.PRODUCTS), limit(1000))),
      getDocs(query(collection(db, COLLECTIONS.SALES), limit(1000)))
    ]);

    return {
      productsCount: productsSnapshot.size,
      salesCount: salesSnapshot.size,
      // Más estadísticas calculadas en frontend
    };
  },

  // 🔄 Actualizaciones en lote para eficiencia
  async batchUpdate(updates: Array<{
    collection: string;
    id: string;
    data: any;
  }>) {
    const batch = writeBatch(db);
    
    updates.forEach(update => {
      const docRef = doc(db, update.collection, update.id);
      batch.update(docRef, {
        ...update.data,
        updatedAt: getColombiaTimestamp()
      });
    });

    await batch.commit();
  },

  // 💾 Cache local para reducir consultas
  cache: new Map<string, { data: any; timestamp: number }>(),
  
  async getCachedData<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = 5 * 60 * 1000 // 5 minutos
  ): Promise<T> {
    const cached = this.cache.get(key);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < ttl) {
      return cached.data;
    }
    
    const data = await fetcher();
    this.cache.set(key, { data, timestamp: now });
    return data;
  },

  // 🎯 Suscripciones optimizadas (solo datos necesarios)
  subscribeToEssentialData(callbacks: {
    onProducts?: (products: any[]) => void;
    onRecentSales?: (sales: any[]) => void;
    onCategories?: (categories: any[]) => void;
  }) {
    const unsubscribers: Array<() => void> = [];

    // Solo productos activos
    if (callbacks.onProducts) {
      const unsubProducts = onSnapshot(
        query(collection(db, COLLECTIONS.PRODUCTS), orderBy('updatedAt', 'desc')),
        (snapshot) => {
          const products = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          callbacks.onProducts!(products);
        }
      );
      unsubscribers.push(unsubProducts);
    }

    // Solo ventas recientes
    if (callbacks.onRecentSales) {
      const unsubSales = onSnapshot(
        query(
          collection(db, COLLECTIONS.SALES),
          orderBy('createdAt', 'desc'),
          limit(50) // Solo las 50 más recientes
        ),
        (snapshot) => {
          const sales = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          callbacks.onRecentSales!(sales);
        }
      );
      unsubscribers.push(unsubSales);
    }

    // Categorías (pocas, se pueden cargar todas)
    if (callbacks.onCategories) {
      const unsubCategories = onSnapshot(
        collection(db, COLLECTIONS.CATEGORIES),
        (snapshot) => {
          const categories = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          callbacks.onCategories!(categories);
        }
      );
      unsubscribers.push(unsubCategories);
    }

    // Retornar función para cancelar todas las suscripciones
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }
};

// 📊 Métricas de uso para monitorear cuota
export const usageMetrics = {
  reads: 0,
  writes: 0,
  deletes: 0,

  trackRead() {
    this.reads++;
    console.log(`📖 Lecturas Firebase: ${this.reads}/50000 diarias`);
  },

  trackWrite() {
    this.writes++;
    console.log(`✍️ Escrituras Firebase: ${this.writes}/20000 diarias`);
  },

  trackDelete() {
    this.deletes++;
    console.log(`🗑️ Eliminaciones Firebase: ${this.deletes}/20000 diarias`);
  },

  getUsageSummary() {
    return {
      reads: this.reads,
      writes: this.writes,
      deletes: this.deletes,
      readsPercentage: (this.reads / 50000) * 100,
      writesPercentage: (this.writes / 20000) * 100,
      deletesPercentage: (this.deletes / 20000) * 100
    };
  }
};