import { createAsyncThunk } from '@reduxjs/toolkit';
import { customersService } from '../../services/firebase/firestore';
import { setCustomers, setCustomersLoading, setCustomersError } from '../slices/firebaseSlice';

export const fetchCustomers = createAsyncThunk(
  'customers/fetchCustomers',
  async (_, { dispatch }) => {
    try {
      dispatch(setCustomersLoading(true));
      const customers = await customersService.getAll();
      dispatch(setCustomers(customers));
    } catch (error: any) {
      dispatch(setCustomersError(error.message || 'Error al cargar clientes'));
    } finally {
      dispatch(setCustomersLoading(false));
    }
  }
);
