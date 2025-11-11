// Utility functions for currency formatting in Colombian Pesos (COP)

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatCurrencyWithDecimals = (amount: number): string => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatNumber = (amount: number): string => {
  return new Intl.NumberFormat('es-CO').format(amount);
};

// For input fields, we'll use a simple format without currency symbol
export const formatInputCurrency = (amount: number): string => {
  return amount.toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

// For CSV export - number formatted Colombian style without currency symbol
export const formatCurrencyForExport = (amount: number): string => {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

// Format number for input fields with Colombian thousands separator
export const formatNumberInput = (value: string | number): string => {
  // Convert to string and remove any non-digit characters
  const numStr = value.toString().replace(/[^\d]/g, '');
  
  // If empty, return empty string
  if (!numStr) return '';
  
  // Parse as number and format with Colombian locale
  const num = parseInt(numStr, 10);
  return new Intl.NumberFormat('es-CO').format(num);
};

// Parse formatted input back to number
export const parseNumberInput = (formattedValue: string): number => {
  // Remove all non-digit characters and parse
  const cleanValue = formattedValue.replace(/[^\d]/g, '');
  return cleanValue ? parseInt(cleanValue, 10) : 0;
};