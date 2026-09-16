// Utilidades para manejo de fechas
//
// REGLA DE ORO: el negocio es Colombia (America/Bogota, UTC-5, sin DST).
// - Para guardar: siempre ISO UTC (`getColombiaTimestamp` / `nowIsoUtc`).
// - Para filtrar "día calendario Colombia": usar `startOfDayBogota` /
//   `endOfDayBogota`. NO usar `new Date(y,m,d)` (depende del huso del navegador).
// - Para mostrar: pasar siempre `{ timeZone: 'America/Bogota' }` al
//   `toLocaleString` / `toLocaleDateString`.

export const BOGOTA_TIME_ZONE = 'America/Bogota';
// Colombia no tiene horario de verano: el offset es siempre -05:00.
const BOGOTA_OFFSET = '-05:00';

export interface ParsedDate {
  date: Date;
  isValid: boolean;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Devuelve la clave de día calendario en Colombia ("YYYY-MM-DD") para un
 * instante dado. Independiente de la TZ del navegador del usuario.
 *
 * Usa Intl.DateTimeFormat con timeZone explícito, que consulta la base
 * de datos de zonas integrada en la plataforma (no el SO).
 */
export const bogotaDateKey = (input: Date | string = new Date()): string => {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOGOTA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find(p => p.type === 'year')?.value ?? '';
  const m = parts.find(p => p.type === 'month')?.value ?? '';
  const d = parts.find(p => p.type === 'day')?.value ?? '';
  return `${y}-${m}-${d}`;
};

/**
 * Inicio del día Colombia (00:00:00.000 hora Bogotá), como ISO UTC.
 *
 * Acepta:
 *   - Date  → calcula el día Colombia en que cae ese instante.
 *   - "YYYY-MM-DD" → asume esa fecha como día calendario Colombia.
 *
 * Resultado: SIEMPRE el mismo string sin importar la TZ del navegador.
 * Ej.: para el día 2026-05-09 → "2026-05-09T05:00:00.000Z".
 */
export const startOfDayBogota = (input: Date | string = new Date()): string => {
  const dateKey = typeof input === 'string'
    ? input.slice(0, 10) // tolera ISO completo
    : bogotaDateKey(input);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return '';
  return new Date(`${dateKey}T00:00:00.000${BOGOTA_OFFSET}`).toISOString();
};

/**
 * Fin del día Colombia (23:59:59.999 hora Bogotá), como ISO UTC.
 * Ej.: para el día 2026-05-09 → "2026-05-10T04:59:59.999Z".
 */
export const endOfDayBogota = (input: Date | string = new Date()): string => {
  const dateKey = typeof input === 'string'
    ? input.slice(0, 10)
    : bogotaDateKey(input);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return '';
  return new Date(`${dateKey}T23:59:59.999${BOGOTA_OFFSET}`).toISOString();
};

/**
 * Resta N días al día calendario Colombia y devuelve "YYYY-MM-DD".
 * Útil para construir rangos relativos (semana, mes, etc.) en días reales,
 * no en bloques de 24 horas.
 */
export const subtractDaysBogota = (
  days: number,
  reference: Date | string = new Date()
): string => {
  const refKey = typeof reference === 'string'
    ? reference.slice(0, 10)
    : bogotaDateKey(reference);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(refKey)) return '';
  // Construyo el instante UTC equivalente al mediodía Bogotá del día base
  // (mediodía elegido para evitar cualquier salto raro), resto los días,
  // y vuelvo a extraer la clave Bogotá.
  const baseUtcMs = new Date(`${refKey}T12:00:00.000${BOGOTA_OFFSET}`).getTime();
  const targetMs = baseUtcMs - days * 86_400_000;
  return bogotaDateKey(new Date(targetMs));
};

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
    // YYYY-MM-DD format → interpretar como día calendario Colombia
    parsedDate = new Date(`${dateString}T00:00:00.000${BOGOTA_OFFSET}`);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
    // DD/MM/YYYY format → interpretar como día calendario Colombia
    const [day, month, year] = dateString.split('/').map(Number);
    parsedDate = new Date(`${year}-${pad(month)}-${pad(day)}T00:00:00.000${BOGOTA_OFFSET}`);
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
 * Verifica si una fecha de cumpleaños es hoy (según día calendario Colombia)
 */
export const isBirthdayToday = (birthDateString: string): boolean => {
  const { date: birthDate, isValid } = parseDate(birthDateString);
  if (!isValid) return false;

  const todayKey = bogotaDateKey(new Date()); // "YYYY-MM-DD" Bogotá
  const birthKey = bogotaDateKey(birthDate);  // "YYYY-MM-DD" Bogotá
  // Comparar mes-día (no año)
  return todayKey.slice(5) === birthKey.slice(5);
};

/**
 * Verifica si un cumpleaños está próximo (en los próximos días especificados)
 * según el calendario Colombia.
 */
export const isUpcomingBirthday = (birthDateString: string, days: number = 7): boolean => {
  const { date: birthDate, isValid } = parseDate(birthDateString);
  if (!isValid) return false;

  const todayKey = bogotaDateKey(new Date());
  const todayY = Number(todayKey.slice(0, 4));
  const birthKey = bogotaDateKey(birthDate);
  const [, bMonth, bDay] = birthKey.split('-').map(Number);

  // Construyo cumpleaños de este año en Bogotá (mediodía para evitar bordes)
  const thisYearKey = `${todayY}-${pad(bMonth)}-${pad(bDay)}`;
  const todayUtcMs = new Date(`${todayKey}T12:00:00.000${BOGOTA_OFFSET}`).getTime();
  let targetUtcMs = new Date(`${thisYearKey}T12:00:00.000${BOGOTA_OFFSET}`).getTime();

  if (targetUtcMs < todayUtcMs) {
    // Ya pasó este año: usar el próximo año
    const nextYearKey = `${todayY + 1}-${pad(bMonth)}-${pad(bDay)}`;
    targetUtcMs = new Date(`${nextYearKey}T12:00:00.000${BOGOTA_OFFSET}`).getTime();
  }

  const diffDays = Math.round((targetUtcMs - todayUtcMs) / 86_400_000);
  return diffDays >= 0 && diffDays <= days;
};

/**
 * Calcula la edad basada en la fecha de nacimiento (referencia: hoy en Bogotá).
 */
export const calculateAge = (birthDateString: string): number | null => {
  const { date: birthDate, isValid } = parseDate(birthDateString);
  if (!isValid) return null;

  const todayKey = bogotaDateKey(new Date());
  const birthKey = bogotaDateKey(birthDate);
  const [tY, tM, tD] = todayKey.split('-').map(Number);
  const [bY, bM, bD] = birthKey.split('-').map(Number);

  let age = tY - bY;
  if (tM < bM || (tM === bM && tD < bD)) age--;
  return age >= 0 ? age : null;
};

/**
 * Formatea una fecha para mostrar de manera consistente (siempre Bogotá).
 */
export const formatDisplayDate = (dateString: string): string => {
  const { date, isValid } = parseDate(dateString);
  if (!isValid) return 'Fecha inválida';

  return date.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: BOGOTA_TIME_ZONE,
  });
};

/**
 * Formatea fecha + hora para mostrar (siempre Bogotá).
 */
export const formatDisplayDateTime = (dateString: string): string => {
  const { date, isValid } = parseDate(dateString);
  if (!isValid) return 'Fecha inválida';

  return date.toLocaleString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: BOGOTA_TIME_ZONE,
  });
};

/**
 * Formatea una fecha para inputs tipo date (YYYY-MM-DD), tomando el día
 * calendario en Colombia.
 */
export const formatInputDate = (dateString: string): string => {
  const { date, isValid } = parseDate(dateString);
  if (!isValid) return '';
  return bogotaDateKey(date);
};

/**
 * Verifica si un string de fecha es válido
 */
export const isValidDateString = (dateString: string): boolean => {
  return parseDate(dateString).isValid;
};

/**
 * Genera un timestamp ISO en UTC (estándar).
 *
 * El nombre histórico es "Colombia" pero retorna UTC puro: el instante absoluto
 * en que se llamó. Mantenido para no romper imports existentes.
 * Para código nuevo, preferir `nowIsoUtc()`.
 */
export const getColombiaTimestamp = (): string => new Date().toISOString();

/** Alias semánticamente correcto. */
export const nowIsoUtc = (): string => new Date().toISOString();
