// Utilidades de validación para formularios
export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * Valida formato de email
 */
export const validateEmail = (email: string): boolean => {
  if (!email) return true; // Email opcional
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Valida formato de teléfono colombiano (solo números)
 */
export const validatePhone = (phone: string): boolean => {
  if (!phone) return true; // Teléfono opcional
  // Solo acepta números de 10 dígitos que empiecen con 3
  const cleanPhone = phone.replace(/\D/g, '');
  return /^[3][0-9]{9}$/.test(cleanPhone);
};

/**
 * Valida que un texto no exceda la longitud máxima
 */
export const validateLength = (text: string, maxLength: number): boolean => {
  return text.length <= maxLength;
};

/**
 * Valida que un texto no esté vacío (después de trim)
 */
export const validateRequired = (text: string): boolean => {
  return text.trim().length > 0;
};

/**
 * Sanitiza input de texto para prevenir XSS básico
 */
export const sanitizeText = (text: string): string => {
  return text
    .trim()
    .replace(/[<>]/g, '') // Remover caracteres básicos de HTML
    .substring(0, 1000); // Limitar longitud
};

/**
 * Valida datos de cliente completos
 */
export const validateCustomerData = (data: {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
}): ValidationResult => {
  const errors: ValidationError[] = [];

  // Nombre es requerido
  if (!validateRequired(data.name)) {
    errors.push({
      field: 'name',
      message: 'El nombre es requerido'
    });
  }

  // Validar longitud del nombre
  if (!validateLength(data.name, 100)) {
    errors.push({
      field: 'name',
      message: 'El nombre no puede exceder 100 caracteres'
    });
  }

  // Validar email si se proporciona
  if (data.email && !validateEmail(data.email)) {
    errors.push({
      field: 'email',
      message: 'El formato del email no es válido'
    });
  }

  // Validar longitud del email
  if (data.email && !validateLength(data.email, 254)) {
    errors.push({
      field: 'email',
      message: 'El email no puede exceder 254 caracteres'
    });
  }

  // Validar teléfono si se proporciona
  if (data.phone && !validatePhone(data.phone)) {
    errors.push({
      field: 'phone',
      message: 'El teléfono debe tener 10 dígitos y empezar con 3 (ej: 3001234567)'
    });
  }

  // Validar longitud de dirección
  if (data.address && !validateLength(data.address, 500)) {
    errors.push({
      field: 'address',
      message: 'La dirección no puede exceder 500 caracteres'
    });
  }

  // Validar longitud de notas
  if (data.notes && !validateLength(data.notes, 1000)) {
    errors.push({
      field: 'notes',
      message: 'Las notas no pueden exceder 1000 caracteres'
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Formatea número de teléfono colombiano (sin espacios)
 */
export const formatPhoneNumber = (phone: string): string => {
  const cleanPhone = phone.replace(/\D/g, '');
  
  if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) {
    return cleanPhone;
  }
  
  return phone.replace(/\D/g, '');
};

/**
 * Valida y formatea email
 */
export const formatEmail = (email: string): string => {
  return email.toLowerCase().trim();
};