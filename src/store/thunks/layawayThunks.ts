import { createAsyncThunk } from '@reduxjs/toolkit';
import { createLayaway, updateLayaway, addProductsToLayaway } from '../slices/layawaySlice';
import { updateProductStock } from '../slices/productsSlice';
import { LayawayPlan, LayawayItem } from '../../types';

export const processLayawayCreation = createAsyncThunk(
  'layaway/processLayawayCreation',
  async (
    layawayData: Omit<LayawayPlan, 'id' | 'createdAt' | 'updatedAt' | 'payments' | 'remainingBalance'>,
    { dispatch }
  ) => {
    // Create the layaway
    dispatch(createLayaway(layawayData));
    
    // Reserve product stock for all items
    layawayData.items.forEach(item => {
      dispatch(updateProductStock({
        productId: item.productId,
        quantityChange: -item.quantity
      }));
    });

    return layawayData;
  }
);

export const processAddProductsToLayaway = createAsyncThunk(
  'layaway/processAddProductsToLayaway',
  async (
    {
      layawayId,
      newItems,
      additionalAmount,
      additionalCost,
      additionalProfit
    }: {
      layawayId: string;
      newItems: LayawayItem[];
      additionalAmount: number;
      additionalCost: number;
      additionalProfit: number;
    },
    { dispatch }
  ) => {
    // Add products to the layaway
    dispatch(addProductsToLayaway({
      layawayId,
      newItems,
      additionalAmount,
      additionalCost,
      additionalProfit
    }));
    
    // Reserve product stock for new items
    newItems.forEach(item => {
      dispatch(updateProductStock({
        productId: item.productId,
        quantityChange: -item.quantity
      }));
    });

    return { layawayId, newItems };
  }
);

export const cancelLayaway = createAsyncThunk(
  'layaway/cancelLayaway',
  async (
    { layawayId, layawayItems }: { 
      layawayId: string; 
      layawayItems: Array<{ productId: string; quantity: number; pickedUpQuantity?: number }> 
    },
    { dispatch }
  ) => {
    // Update layaway status to cancelled
    dispatch(updateLayaway({ 
      id: layawayId, 
      updates: { status: 'cancelled' } 
    }));
    
    // Return stock to inventory for unpicked items
    layawayItems.forEach(item => {
      const unpickedQuantity = item.quantity - (item.pickedUpQuantity || 0);
      if (unpickedQuantity > 0) {
        dispatch(updateProductStock({
          productId: item.productId,
          quantityChange: unpickedQuantity
        }));
      }
    });

    return layawayId;
  }
);