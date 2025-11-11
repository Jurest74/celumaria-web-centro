import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Category } from '../../types';

interface CategoriesState {
  items: Category[];
  loading: boolean;
  error: string | null;
}

// Categorías predeterminadas
// CATEGORÍAS PREDETERMINADAS DESHABILITADAS - Celu Maria empezará con base limpia
const defaultCategories: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>[] = [];

const initialState: CategoriesState = {
  items: [],
  loading: false,
  error: null,
};

const categoriesSlice = createSlice({
  name: 'categories',
  initialState,
  reducers: {
    // Esta acción ya no se usa - Firebase maneja la inicialización
    initializeDefaultCategories: (state) => {
      // Deprecated - Firebase maneja esto ahora
    },
    addCategory: (state, action: PayloadAction<Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'productCount'>>) => {
      const newCategory: Category = {
        ...action.payload,
        id: crypto.randomUUID(),
        productCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.items.push(newCategory);
    },
    updateCategory: (state, action: PayloadAction<{ id: string; updates: Partial<Category> }>) => {
      const { id, updates } = action.payload;
      const index = state.items.findIndex(category => category.id === id);
      if (index !== -1) {
        state.items[index] = {
          ...state.items[index],
          ...updates,
          updatedAt: new Date().toISOString(),
        };
      }
    },
    deleteCategory: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter(category => category.id !== action.payload);
    },
    updateCategoryProductCount: (state, action: PayloadAction<{ categoryId: string; change: number }>) => {
      const { categoryId, change } = action.payload;
      const category = state.items.find(c => c.id === categoryId);
      if (category) {
        category.productCount = Math.max(0, category.productCount + change);
        category.updatedAt = new Date().toISOString();
      }
    },
    recalculateProductCounts: (state, action: PayloadAction<Record<string, number>>) => {
      const productCounts = action.payload;
      state.items.forEach(category => {
        category.productCount = productCounts[category.id] || 0;
        category.updatedAt = new Date().toISOString();
      });
    },
    setCategories: (state, action: PayloadAction<Category[]>) => {
      state.items = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const {
  initializeDefaultCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  updateCategoryProductCount,
  recalculateProductCounts,
  setCategories,
  setLoading,
  setError,
} = categoriesSlice.actions;

export default categoriesSlice.reducer;

// Exportar categorías por defecto para Firebase
export { defaultCategories };