import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '../index';
import { bogotaDateKey } from '../../utils/dateUtils';

// Firebase selectors
export const selectProducts = (state: RootState) => state.firebase.products.items;
export const selectProductsLoading = (state: RootState) => state.firebase.products.loading;
export const selectProductsError = (state: RootState) => state.firebase.products.error;

export const selectCategories = (state: RootState) => state.firebase.categories.items;
export const selectCategoriesLoading = (state: RootState) => state.firebase.categories.loading;
export const selectCategoriesError = (state: RootState) => state.firebase.categories.error;

export const selectSales = (state: RootState) => state.firebase.sales.items;
export const selectSalesLoading = (state: RootState) => state.firebase.sales.loading;
export const selectSalesError = (state: RootState) => state.firebase.sales.error;

export const selectCustomers = (state: RootState) => state.firebase.customers.items;
export const selectCustomersLoading = (state: RootState) => state.firebase.customers.loading;
export const selectCustomersError = (state: RootState) => state.firebase.customers.error;

export const selectLayaways = (state: RootState) => state.firebase.layaways.items;
export const selectLayawaysLoading = (state: RootState) => state.firebase.layaways.loading;
export const selectLayawaysError = (state: RootState) => state.firebase.layaways.error;

export const selectTechnicalServices = (state: RootState) => state.firebase.technicalServices.items;
export const selectTechnicalServicesLoading = (state: RootState) => state.firebase.technicalServices.loading;
export const selectTechnicalServicesError = (state: RootState) => state.firebase.technicalServices.error;

export const selectDashboardStats = (state: RootState) => state.firebase.stats.data;
export const selectDashboardStatsLoading = (state: RootState) => state.firebase.stats.loading;
export const selectDashboardStatsError = (state: RootState) => state.firebase.stats.error;

// Derived selectors
export const selectLowStockProducts = createSelector(
  [selectProducts],
  (products) => products.filter(product => product.stock <= 5)
);

export const selectActiveCategories = createSelector(
  [selectCategories],
  (categories) => categories // Devuelve todas las categorías
);

export const selectActiveLayaways = createSelector(
  [selectLayaways],
  (layaways) => layaways.filter(layaway => layaway.status === 'active')
);

export const selectTodaysSales = createSelector(
  [selectSales],
  (sales) => {
    // Día calendario Colombia, no del navegador
    const todayKey = bogotaDateKey();
    return sales.filter(sale => bogotaDateKey(new Date(sale.createdAt)) === todayKey);
  }
);

export const selectRecentSales = createSelector(
  [selectSales],
  (sales) => sales.slice(-10).reverse()
);

export const selectProductById = (productId: string) =>
  createSelector(
    [selectProducts],
    (products) => products.find(product => product.id === productId)
  );

export const selectCategoryById = (categoryId: string) =>
  createSelector(
    [selectCategories],
    (categories) => categories.find(category => category.id === categoryId)
  );

export const selectCustomerById = (customerId: string) =>
  createSelector(
    [selectCustomers],
    (customers) => customers.find(customer => customer.id === customerId)
  );

// Auth selectors
export const selectUser = (state: RootState) => state.auth.user;
export const selectIsAuthenticated = (state: RootState) => state.auth.isAuthenticated;
export const selectAuthLoading = (state: RootState) => state.auth.loading;
export const selectAuthError = (state: RootState) => state.auth.error;