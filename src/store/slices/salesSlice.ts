import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Sale } from '../../types';

interface SalesState {
  items: Sale[];
  loading: boolean;
  error: string | null;
}

const initialState: SalesState = {
  items: [],
  loading: false,
  error: null,
};

const salesSlice = createSlice({
  name: 'sales',
  initialState,
  reducers: {
    addSale: (state, action: PayloadAction<Omit<Sale, 'id' | 'createdAt'>>) => {
      const newSale: Sale = {
        ...action.payload,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      state.items.push(newSale);
    },
    updateSale: (state, action: PayloadAction<{ id: string; updates: Partial<Sale> }>) => {
      const { id, updates } = action.payload;
      const index = state.items.findIndex(sale => sale.id === id);
      if (index !== -1) {
        state.items[index] = { ...state.items[index], ...updates };
      }
    },
    deleteSale: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter(sale => sale.id !== action.payload);
    },
    setSales: (state, action: PayloadAction<Sale[]>) => {
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
  addSale,
  updateSale,
  deleteSale,
  setSales,
  setLoading,
  setError,
} = salesSlice.actions;

export default salesSlice.reducer;