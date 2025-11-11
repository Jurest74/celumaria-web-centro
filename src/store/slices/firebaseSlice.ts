import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { 
  Product, 
  Category, 
  Sale, 
  Customer, 
  LayawayPlan,
  TechnicalService,
  DashboardStats 
} from '../../types';

interface FirebaseState {
  products: {
    items: Product[];
    loading: boolean;
    error: string | null;
  };
  categories: {
    items: Category[];
    loading: boolean;
    error: string | null;
  };
  sales: {
    items: Sale[];
    loading: boolean;
    error: string | null;
  };
  customers: {
    items: Customer[];
    loading: boolean;
    error: string | null;
  };
  layaways: {
    items: LayawayPlan[];
    loading: boolean;
    error: string | null;
  };
  technicalServices: {
    items: TechnicalService[];
    loading: boolean;
    error: string | null;
  };
  stats: {
    data: DashboardStats | null;
    loading: boolean;
    error: string | null;
  };
}

const initialState: FirebaseState = {
  products: { items: [], loading: false, error: null },
  categories: { items: [], loading: false, error: null },
  sales: { items: [], loading: false, error: null },
  customers: { items: [], loading: false, error: null },
  layaways: { items: [], loading: false, error: null },
  technicalServices: { items: [], loading: false, error: null },
  stats: { data: null, loading: false, error: null },
};

const firebaseSlice = createSlice({
  name: 'firebase',
  initialState,
  reducers: {
    // Products
    setProducts: (state, action: PayloadAction<Product[]>) => {
      state.products.items = action.payload;
      state.products.loading = false;
      state.products.error = null;
    },
    updateProductStock: (state, action: PayloadAction<{ productId: string; quantityChange: number }>) => {
      const { productId, quantityChange } = action.payload;
      const product = state.products.items.find(p => p.id === productId);
      if (product) {
        product.stock = Math.max(0, product.stock + quantityChange);
        product.updatedAt = new Date().toISOString();
      }
    },
    setProductsLoading: (state, action: PayloadAction<boolean>) => {
      state.products.loading = action.payload;
    },
    setProductsError: (state, action: PayloadAction<string | null>) => {
      state.products.error = action.payload;
      state.products.loading = false;
    },

    // Categories
    setCategories: (state, action: PayloadAction<Category[]>) => {
      state.categories.items = action.payload;
      state.categories.loading = false;
      state.categories.error = null;
    },
    setCategoriesLoading: (state, action: PayloadAction<boolean>) => {
      state.categories.loading = action.payload;
    },
    setCategoriesError: (state, action: PayloadAction<string | null>) => {
      state.categories.error = action.payload;
      state.categories.loading = false;
    },

    // Sales
    setSales: (state, action: PayloadAction<Sale[]>) => {
      state.sales.items = action.payload;
      state.sales.loading = false;
      state.sales.error = null;
    },
    addSale: (state, action: PayloadAction<Omit<Sale, 'id' | 'createdAt'>>) => {
      const newSale: Sale = {
        ...action.payload,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      state.sales.items.push(newSale);
    },
    updateSale: (state, action: PayloadAction<{ id: string; updates: Partial<Sale> }>) => {
      const { id, updates } = action.payload;
      const index = state.sales.items.findIndex(sale => sale.id === id);
      if (index !== -1) {
        state.sales.items[index] = { ...state.sales.items[index], ...updates };
      }
    },
    deleteSale: (state, action: PayloadAction<string>) => {
      const saleId = action.payload;
      state.sales.items = state.sales.items.filter(sale => sale.id !== saleId);
    },
    setSalesLoading: (state, action: PayloadAction<boolean>) => {
      state.sales.loading = action.payload;
    },
    setSalesError: (state, action: PayloadAction<string | null>) => {
      state.sales.error = action.payload;
      state.sales.loading = false;
    },

    // Customers
    setCustomers: (state, action: PayloadAction<Customer[]>) => {
      state.customers.items = action.payload;
      state.customers.loading = false;
      state.customers.error = null;
    },
    setCustomersLoading: (state, action: PayloadAction<boolean>) => {
      state.customers.loading = action.payload;
    },
    setCustomersError: (state, action: PayloadAction<string | null>) => {
      state.customers.error = action.payload;
      state.customers.loading = false;
    },

    // Layaways
    setLayaways: (state, action: PayloadAction<LayawayPlan[]>) => {
      state.layaways.items = action.payload;
      state.layaways.loading = false;
      state.layaways.error = null;
    },
    setLayawaysLoading: (state, action: PayloadAction<boolean>) => {
      state.layaways.loading = action.payload;
    },
    setLayawaysError: (state, action: PayloadAction<string | null>) => {
      state.layaways.error = action.payload;
      state.layaways.loading = false;
    },

    // Technical Services
    setTechnicalServices: (state, action: PayloadAction<TechnicalService[]>) => {
      state.technicalServices.items = action.payload;
      state.technicalServices.loading = false;
      state.technicalServices.error = null;
    },
    setTechnicalServicesLoading: (state, action: PayloadAction<boolean>) => {
      state.technicalServices.loading = action.payload;
    },
    setTechnicalServicesError: (state, action: PayloadAction<string | null>) => {
      state.technicalServices.error = action.payload;
      state.technicalServices.loading = false;
    },

    // Stats
    setStats: (state, action: PayloadAction<DashboardStats>) => {
      state.stats.data = action.payload;
      state.stats.loading = false;
      state.stats.error = null;
    },
    setStatsLoading: (state, action: PayloadAction<boolean>) => {
      state.stats.loading = action.payload;
    },
    setStatsError: (state, action: PayloadAction<string | null>) => {
      state.stats.error = action.payload;
      state.stats.loading = false;
    },
  },
});

export const {
  setProducts,
  updateProductStock,
  setProductsLoading,
  setProductsError,
  setCategories,
  setCategoriesLoading,
  setCategoriesError,
  setSales,
  addSale,
  updateSale,
  deleteSale,
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
} = firebaseSlice.actions;

export default firebaseSlice.reducer;