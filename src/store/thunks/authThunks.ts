import { createAsyncThunk } from '@reduxjs/toolkit';
import { loginStart, loginSuccess, loginFailure } from '../slices/authSlice';

export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async (
    { username, password }: { username: string; password: string },
    { dispatch }
  ) => {
    dispatch(loginStart());
    
    // TODO: Implement actual authentication with Firebase Auth or backend API
    // For now, this will always fail since there are no default users
    console.error('Login failed: No authentication system configured');
    const errorMessage = 'Sistema de autenticación no configurado. Contacte al administrador.';
    dispatch(loginFailure(errorMessage));
    throw new Error(errorMessage);
  }
);