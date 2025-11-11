import { createAsyncThunk } from '@reduxjs/toolkit';
import { layawaysService } from '../../services/firebase/firestore';
import { setLayaways, setLayawaysLoading, setLayawaysError } from '../slices/firebaseSlice';

export const fetchLayaways = createAsyncThunk(
  'layaways/fetchLayaways',
  async (_, { dispatch }) => {
    try {
      dispatch(setLayawaysLoading(true));
      const layaways = await layawaysService.getAll();
      dispatch(setLayaways(layaways));
    } catch (error: any) {
      dispatch(setLayawaysError(error.message || 'Error al cargar layaways'));
    } finally {
      dispatch(setLayawaysLoading(false));
    }
  }
);
