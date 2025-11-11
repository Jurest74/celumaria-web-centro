import { createAsyncThunk } from '@reduxjs/toolkit';
import { technicalServicesService } from '../../services/firebase/firestore';
import { setTechnicalServices, setTechnicalServicesLoading, setTechnicalServicesError } from '../slices/firebaseSlice';

export const fetchTechnicalServices = createAsyncThunk(
  'technicalServices/fetchTechnicalServices',
  async (_, { dispatch }) => {
    try {
      dispatch(setTechnicalServicesLoading(true));
      const technicalServices = await technicalServicesService.getAll();
      dispatch(setTechnicalServices(technicalServices));
    } catch (error: any) {
      dispatch(setTechnicalServicesError(error.message || 'Error al cargar servicios técnicos'));
    } finally {
      dispatch(setTechnicalServicesLoading(false));
    }
  }
);

export const fetchTechnicalServicesByStatus = createAsyncThunk(
  'technicalServices/fetchTechnicalServicesByStatus',
  async (status: 'active' | 'completed' | 'cancelled' | 'all', { dispatch }) => {
    try {
      dispatch(setTechnicalServicesLoading(true));
      
      let technicalServices;
      if (status === 'all') {
        technicalServices = await technicalServicesService.getAll();
      } else {
        technicalServices = await technicalServicesService.getByStatus(status);
      }
      
      dispatch(setTechnicalServices(technicalServices));
    } catch (error: any) {
      dispatch(setTechnicalServicesError(error.message || 'Error al cargar servicios técnicos'));
    } finally {
      dispatch(setTechnicalServicesLoading(false));
    }
  }
);