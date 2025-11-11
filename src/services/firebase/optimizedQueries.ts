import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  where,
  getDocs,
  DocumentSnapshot
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { COLLECTIONS } from './collections';

// 🎯 Consultas optimizadas para minimizar lecturas
export const optimizedQueries = {
  // Solo datos esenciales para el dashboard
  async getDashboardEssentials() {
    const [
      recentSalesSnapshot,
      productsSnapshot,
      categoriesSnapshot
    ] = await Promise.all([
      // Solo últimas 50 ventas para estadísticas básicas
      getDocs(query(
        collection(db, COLLECTIONS.SALES),
        orderBy('createdAt', 'desc'),
        limit(50)
      )),
      
      // Todos los productos (normalmente pocos)
      getDocs(collection(db, COLLECTIONS.PRODUCTS)),
      
      // Todas las categorías (muy pocas)
      getDocs(collection(db, COLLECTIONS.CATEGORIES))
    ]);

    return {
      recentSales: recentSalesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })),
      products: productsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })),
      categories: categoriesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
    };
  },

  // Ventas de hoy (muy pocas)
  async getTodaysSales() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const snapshot = await getDocs(query(
      collection(db, COLLECTIONS.SALES),
      where('createdAt', '>=', today.toISOString()),
      orderBy('createdAt', 'desc')
    ));

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  },

  // Paginación para reportes (solo cuando se necesite)
  async getPaginatedSales(pageSize: number = 50, lastDoc?: DocumentSnapshot) {
    let q = query(
      collection(db, COLLECTIONS.SALES),
      orderBy('createdAt', 'desc'),
      limit(pageSize)
    );

    if (lastDoc) {
      q = query(q, startAfter(lastDoc));
    }

    const snapshot = await getDocs(q);
    
    return {
      data: snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })),
      lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
      hasMore: snapshot.docs.length === pageSize
    };
  },

  // Estadísticas del mes (solo cuando se necesite)
  async getMonthlyStats(year: number, month: number) {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);

    const snapshot = await getDocs(query(
      collection(db, COLLECTIONS.SALES),
      where('createdAt', '>=', startDate.toISOString()),
      where('createdAt', '<=', endDate.toISOString()),
      orderBy('createdAt', 'desc')
    ));

    const sales = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Calcular estadísticas del mes
    return {
      totalSales: sales.reduce((sum, sale) => sum + sale.total, 0),
      totalProfit: sales.reduce((sum, sale) => sum + sale.totalProfit, 0),
      transactionCount: sales.length,
      averageTransaction: sales.length > 0 ? 
        sales.reduce((sum, sale) => sum + sale.total, 0) / sales.length : 0
    };
  }
};

// 📊 Métricas de uso para monitorear
export const usageTracker = {
  reads: 0,
  
  trackRead(count: number = 1) {
    this.reads += count;
    console.log(`📖 Firebase reads: ${this.reads}/50,000 daily`);
    
    // Alerta si nos acercamos al límite
    if (this.reads > 40000) {
      console.warn('⚠️ Approaching Firebase read limit!');
    }
  },
  
  getUsagePercentage() {
    return (this.reads / 50000) * 100;
  }
};