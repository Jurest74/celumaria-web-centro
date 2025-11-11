// Utilidades para manejo de fechas
export interface ParsedDate {
  date: Date;
  isValid: boolean;
}

/**
 * Parsea una fecha desde varios formatos posibles de manera consistente
 */
export const parseDate = (dateString: string): ParsedDate => {
  if (!dateString) {
    return { date: new Date(), isValid: false };
  }

  let parsedDate: Date;

  // Intentar parsear en orden de preferencia
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    // YYYY-MM-DD format
    const [year, month, day] = dateString.split('-').map(Number);
    parsedDate = new Date(year, month - 1, day);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
    // DD/MM/YYYY format
    const [day, month, year] = dateString.split('/').map(Number);
    parsedDate = new Date(year, month - 1, day);
  } else if (/^\d{4}-\d{2}-\d{2}T/.test(dateString)) {
    // ISO format
    parsedDate = new Date(dateString);
  } else {
    // Fallback a constructor de Date
    parsedDate = new Date(dateString);
  }

  const isValid = !isNaN(parsedDate.getTime());
  
  return {
    date: isValid ? parsedDate : new Date(),
    isValid
  };
};

/**
 * Verifica si una fecha de cumpleaños es hoy
 */
export const isBirthdayToday = (birthDateString: string): boolean => {
  const { date: birthDate, isValid } = parseDate(birthDateString);
  
  if (!isValid) return false;

  const today = new Date();
  return (
    birthDate.getMonth() === today.getMonth() &&
    birthDate.getDate() === today.getDate()
  );
};

/**
 * Verifica si un cumpleaños está próximo (en los próximos días especificados)
 */
export const isUpcomingBirthday = (birthDateString: string, days: number = 7): boolean => {
  const { date: birthDate, isValid } = parseDate(birthDateString);
  
  if (!isValid) return false;

  const today = new Date();
  const currentYear = today.getFullYear();
  
  // Crear fecha de cumpleaños para este año
  let thisYearBirthday = new Date(currentYear, birthDate.getMonth(), birthDate.getDate());
  
  // Si ya pasó este año, usar el próximo año
  if (thisYearBirthday < today) {
    thisYearBirthday = new Date(currentYear + 1, birthDate.getMonth(), birthDate.getDate());
  }
  
  const diffTime = thisYearBirthday.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays <= days && diffDays >= 0;
};

/**
 * Calcula la edad basada en la fecha de nacimiento
 */
export const calculateAge = (birthDateString: string): number | null => {
  const { date: birthDate, isValid } = parseDate(birthDateString);
  
  if (!isValid) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age >= 0 ? age : null;
};

/**
 * Formatea una fecha para mostrar de manera consistente
 */
export const formatDisplayDate = (dateString: string): string => {
  const { date, isValid } = parseDate(dateString);
  
  if (!isValid) return 'Fecha inválida';

  return date.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

/**
 * Formatea una fecha para inputs tipo date (YYYY-MM-DD)
 */
export const formatInputDate = (dateString: string): string => {
  const { date, isValid } = parseDate(dateString);
  
  if (!isValid) return '';

  return date.toISOString().split('T')[0];
};

/**
 * Verifica si un string de fecha es válido
 */
export const isValidDateString = (dateString: string): boolean => {
  return parseDate(dateString).isValid;
};

/**
 * Genera un timestamp ISO en UTC (estándar)
 */
export const getColombiaTimestamp = (): string => {
  // Usar UTC estándar como todas las otras partes del sistema
  return new Date().toISOString();
};