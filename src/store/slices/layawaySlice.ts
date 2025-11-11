import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { LayawayPlan, LayawayPayment, LayawayItem } from '../../types';

interface LayawayState {
  items: LayawayPlan[];
  loading: boolean;
  error: string | null;
}

const initialState: LayawayState = {
  items: [],
  loading: false,
  error: null,
};

const layawaySlice = createSlice({
  name: 'layaway',
  initialState,
  reducers: {
    createLayaway: (state, action: PayloadAction<Omit<LayawayPlan, 'id' | 'createdAt' | 'updatedAt' | 'payments' | 'remainingBalance'>>) => {
      const layaway = action.payload;
      
      // Convert items to new format with individual unit tracking
      const itemsWithTracking = layaway.items.map(item => ({
        ...item,
        pickedUpQuantity: 0,
        pickedUpHistory: []
      }));

      const newLayaway: LayawayPlan = {
        ...layaway,
        items: itemsWithTracking,
        id: crypto.randomUUID(),
        payments: layaway.downPayment > 0 ? [{
          id: crypto.randomUUID(),
          amount: layaway.downPayment,
          paymentDate: new Date().toISOString(),
          paymentMethod: 'efectivo',
          notes: 'Pago inicial'
        }] : [],
        remainingBalance: layaway.totalAmount - layaway.downPayment,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      state.items.push(newLayaway);
    },
    addLayawayPayment: (state, action: PayloadAction<{ layawayId: string; payment: Omit<LayawayPayment, 'id'> }>) => {
      const { layawayId, payment } = action.payload;
      const layaway = state.items.find(l => l.id === layawayId);
      
      if (layaway) {
        const newPayment: LayawayPayment = {
          ...payment,
          id: crypto.randomUUID(),
        };

        layaway.payments.push(newPayment);
        layaway.remainingBalance = Math.max(0, layaway.remainingBalance - payment.amount);
        layaway.status = layaway.remainingBalance === 0 ? 'completed' : layaway.status;
        layaway.updatedAt = new Date().toISOString();
      }
    },
    addProductsToLayaway: (state, action: PayloadAction<{
      layawayId: string;
      newItems: LayawayItem[];
      additionalAmount: number;
      additionalCost: number;
      additionalProfit: number;
    }>) => {
      const { layawayId, newItems, additionalAmount, additionalCost, additionalProfit } = action.payload;
      const layaway = state.items.find(l => l.id === layawayId);
      
      if (layaway) {
        // Add new items to the layaway
        layaway.items.push(...newItems);
        
        // Update totals
        layaway.totalAmount += additionalAmount;
        layaway.totalCost += additionalCost;
        layaway.expectedProfit += additionalProfit;
        layaway.remainingBalance += additionalAmount;
        layaway.updatedAt = new Date().toISOString();
      }
    },
    updateLayaway: (state, action: PayloadAction<{ id: string; updates: Partial<LayawayPlan> }>) => {
      const { id, updates } = action.payload;
      const index = state.items.findIndex(layaway => layaway.id === id);
      if (index !== -1) {
        state.items[index] = {
          ...state.items[index],
          ...updates,
          updatedAt: new Date().toISOString(),
        };
      }
    },
    markUnitsAsPickedUp: (state, action: PayloadAction<{ 
      layawayId: string; 
      itemId: string; 
      quantity: number; 
      notes?: string 
    }>) => {
      const { layawayId, itemId, quantity, notes } = action.payload;
      const layaway = state.items.find(l => l.id === layawayId);
      
      if (layaway) {
        const item = layaway.items.find(i => i.id === itemId);
        if (item) {
          const currentPickedUp = item.pickedUpQuantity || 0;
          const maxCanPickUp = item.quantity - currentPickedUp;
          const actualQuantityToPickUp = Math.min(quantity, maxCanPickUp);
          
          if (actualQuantityToPickUp > 0) {
            const newPickupRecord = {
              id: crypto.randomUUID(),
              quantity: actualQuantityToPickUp,
              date: new Date().toISOString(),
              notes
            };

            item.pickedUpQuantity = currentPickedUp + actualQuantityToPickUp;
            item.pickedUpHistory = [...(item.pickedUpHistory || []), newPickupRecord];
          }
        }
        layaway.updatedAt = new Date().toISOString();
      }
    },
    setLayaways: (state, action: PayloadAction<LayawayPlan[]>) => {
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
  createLayaway,
  addLayawayPayment,
  addProductsToLayaway,
  updateLayaway,
  markUnitsAsPickedUp,
  setLayaways,
  setLoading,
  setError,
} = layawaySlice.actions;

export default layawaySlice.reducer;