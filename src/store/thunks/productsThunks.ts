import { createAsyncThunk } from '@reduxjs/toolkit';
import { productsService } from '../../services/firebase/firestore';
import { setProducts, setProductsLoading, setProductsError } from '../slices/firebaseSlice';

export const fetchProducts = createAsyncThunk(
  'products/fetchProducts',
  async (_, { dispatch }) => {
    try {
      dispatch(setProductsLoading(true));
      const products = await productsService.getAll();
      dispatch(setProducts(products));
    } catch (error: any) {
      dispatch(setProductsError(error.message || 'Error al cargar productos'));
    } finally {
      dispatch(setProductsLoading(false));
    }
  }
);
