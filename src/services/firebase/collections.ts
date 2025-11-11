// Definición de las colecciones de Firestore
export const COLLECTIONS = {
  PRODUCTS: 'products',
  CATEGORIES: 'categories',
  SALES: 'sales',
  CUSTOMERS: 'customers',
  LAYAWAYS: 'layaways',
  TECHNICAL_SERVICES: 'technicalservice',
  USERS: 'users',
  TECHNICIANS: 'technicians', // Nueva colección para técnicos
  TECHNICIAN_LIQUIDATIONS: 'technicianliquidations', // Nueva colección para liquidaciones
  STATS: 'stats', // Para estadísticas calculadas
  PURCHASES: 'purchases', // Nueva colección para compras
  COURTESIES: 'courtesies' // Nueva colección para cortesías
} as const;

// Subcollections
export const SUBCOLLECTIONS = {
  PAYMENTS: 'payments',
  ITEMS: 'items'
} as const;