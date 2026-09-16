// Tests TZ-independencia de los helpers de fecha.
//
// Estrategia: cada test fuerza process.env.TZ a una zona distinta antes
// de las aserciones para validar que el resultado es idéntico sin importar
// el huso del runtime.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  bogotaDateKey,
  startOfDayBogota,
  endOfDayBogota,
  subtractDaysBogota,
  subtractMonthsBogota,
  startOfMonthKeyBogota,
  bogotaHour,
  isBirthdayThisWeek,
  isBirthdayThisMonth,
  parseDate,
  isBirthdayToday,
  isUpcomingBirthday,
  calculateAge,
  formatDisplayDate,
  formatDisplayDateTime,
  formatInputDate,
  getColombiaTimestamp,
  nowIsoUtc,
  BOGOTA_TIME_ZONE,
} from './dateUtils';

// Forzar la zona del proceso a un valor dado y volver al anterior al final.
function withTZ<T>(tz: string, fn: () => T): T {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = prev;
  }
}

const ZONAS = [
  'America/Bogota',         // UTC-5 (no DST)
  'UTC',
  'America/Mexico_City',    // UTC-6
  'America/Los_Angeles',    // UTC-7/-8 con DST
  'Europe/Madrid',          // UTC+1/+2 con DST
  'Asia/Tokyo',             // UTC+9
  'Pacific/Auckland',       // UTC+12/+13 con DST
] as const;

describe('BOGOTA_TIME_ZONE constante', () => {
  it('vale "America/Bogota"', () => {
    expect(BOGOTA_TIME_ZONE).toBe('America/Bogota');
  });
});

describe('bogotaDateKey', () => {
  it('para un instante UTC fijo, devuelve el mismo día Colombia en cualquier TZ', () => {
    // 2026-05-09 22:51 UTC = 9-may 17:51 hora Colombia
    const instante = new Date('2026-05-09T22:51:00Z');
    for (const tz of ZONAS) {
      const r = withTZ(tz, () => bogotaDateKey(instante));
      expect(r).toBe('2026-05-09');
    }
  });

  it('justo después de medianoche UTC pero aún día anterior en Colombia', () => {
    // 2026-05-09 03:00 UTC = 8-may 22:00 hora Colombia
    const instante = new Date('2026-05-09T03:00:00Z');
    for (const tz of ZONAS) {
      const r = withTZ(tz, () => bogotaDateKey(instante));
      expect(r).toBe('2026-05-08');
    }
  });

  it('justo después de medianoche Colombia (= 05:00 UTC)', () => {
    const instante = new Date('2026-05-09T05:00:00Z');
    for (const tz of ZONAS) {
      const r = withTZ(tz, () => bogotaDateKey(instante));
      expect(r).toBe('2026-05-09');
    }
  });

  it('acepta string ISO', () => {
    expect(bogotaDateKey('2026-05-09T22:51:00Z')).toBe('2026-05-09');
  });

  it('Date inválido devuelve string vacío', () => {
    expect(bogotaDateKey(new Date('not-a-date'))).toBe('');
  });
});

describe('startOfDayBogota / endOfDayBogota', () => {
  it('para un día Bogotá dado, devuelve los mismos límites UTC en cualquier TZ', () => {
    for (const tz of ZONAS) {
      const start = withTZ(tz, () => startOfDayBogota('2026-05-09'));
      const end   = withTZ(tz, () => endOfDayBogota('2026-05-09'));
      expect(start).toBe('2026-05-09T05:00:00.000Z'); // 00:00 Bogotá = 05:00 UTC
      expect(end).toBe('2026-05-10T04:59:59.999Z');   // 23:59:59.999 Bogotá
    }
  });

  it('llamado sin argumentos toma "hoy en Colombia"', () => {
    // Validamos consistencia: el start del hoy en Colombia debe coincidir con
    // el cálculo derivado del bogotaDateKey actual.
    for (const tz of ZONAS) {
      const r = withTZ(tz, () => {
        const key = bogotaDateKey();
        return { auto: startOfDayBogota(), manual: startOfDayBogota(key) };
      });
      expect(r.auto).toBe(r.manual);
    }
  });

  it('rango cubre exactamente 24 horas y va de 05:00Z a 04:59:59.999Z del día siguiente', () => {
    const start = startOfDayBogota('2026-01-15');
    const end = endOfDayBogota('2026-01-15');
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    expect(endMs - startMs).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it('input inválido devuelve string vacío', () => {
    expect(startOfDayBogota('basura')).toBe('');
    expect(endOfDayBogota('basura')).toBe('');
  });
});

describe('subtractDaysBogota', () => {
  it('resta días naturales en calendario Bogotá', () => {
    expect(subtractDaysBogota(0, '2026-05-09')).toBe('2026-05-09');
    expect(subtractDaysBogota(1, '2026-05-09')).toBe('2026-05-08');
    expect(subtractDaysBogota(7, '2026-05-09')).toBe('2026-05-02');
    expect(subtractDaysBogota(30, '2026-05-09')).toBe('2026-04-09');
    expect(subtractDaysBogota(180, '2026-05-09')).toBe('2025-11-10');
    expect(subtractDaysBogota(365, '2026-05-09')).toBe('2025-05-09');
  });

  it('cruza correctamente fronteras de mes y año', () => {
    expect(subtractDaysBogota(1, '2026-01-01')).toBe('2025-12-31');
    expect(subtractDaysBogota(1, '2026-03-01')).toBe('2026-02-28'); // 2026 no es bisiesto
  });

  it('TZ-independiente: misma respuesta en todas las zonas', () => {
    for (const tz of ZONAS) {
      const r = withTZ(tz, () => subtractDaysBogota(7, '2026-05-09'));
      expect(r).toBe('2026-05-02');
    }
  });
});

describe('escenario REAL del bug: ventas en franja 19:00–23:59 Colombia', () => {
  // Datos reales tomados de la auditoría Firestore
  const ventasReales = [
    '2026-05-09T22:11:00.902Z', // 17:11 Col, 9-may
    '2026-05-09T19:55:46.197Z', // 14:55 Col, 9-may
    '2026-05-09T15:21:40.576Z', // 10:21 Col, 9-may
    '2026-05-09T00:52:20.796Z', // 19:52 Col, 8-may   ← franja vulnerable
    '2026-05-08T23:47:55.913Z', // 18:47 Col, 8-may
    '2026-05-08T16:50:03.487Z', // 11:50 Col, 8-may
  ];

  it('"hoy = 9-may" en cualquier TZ del navegador captura las 3 ventas del 9-may', () => {
    // Mock now() para hacer determinístico el "hoy"
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T22:51:00Z'));
    try {
      for (const tz of ZONAS) {
        const { start, end } = withTZ(tz, () => ({
          start: startOfDayBogota(),
          end: endOfDayBogota(),
        }));
        const dentro = ventasReales.filter(v => v >= start && v <= end);
        expect(dentro.sort()).toEqual([
          '2026-05-09T15:21:40.576Z',
          '2026-05-09T19:55:46.197Z',
          '2026-05-09T22:11:00.902Z',
        ]);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('"ayer = 8-may" captura las ventas del 8-may incluyendo la de las 19:52 (que está en UTC del 9)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T22:51:00Z'));
    try {
      for (const tz of ZONAS) {
        const ayer = withTZ(tz, () => subtractDaysBogota(1));
        const start = startOfDayBogota(ayer);
        const end   = endOfDayBogota(ayer);
        const dentro = ventasReales.filter(v => v >= start && v <= end);
        // Las 3 ventas del 8-may en Colombia, sin importar la TZ
        expect(dentro.sort()).toEqual([
          '2026-05-08T16:50:03.487Z',
          '2026-05-08T23:47:55.913Z',
          '2026-05-09T00:52:20.796Z', // ¡esta es del 8-may en Colombia!
        ]);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('parseDate', () => {
  it('formato YYYY-MM-DD se interpreta como día Bogotá', () => {
    const r = parseDate('2026-05-09');
    expect(r.isValid).toBe(true);
    expect(r.date.toISOString()).toBe('2026-05-09T05:00:00.000Z');
  });

  it('formato DD/MM/YYYY se interpreta como día Bogotá', () => {
    const r = parseDate('09/05/2026');
    expect(r.isValid).toBe(true);
    expect(r.date.toISOString()).toBe('2026-05-09T05:00:00.000Z');
  });

  it('formato ISO con zona se respeta', () => {
    const r = parseDate('2026-05-09T22:11:00.902Z');
    expect(r.isValid).toBe(true);
    expect(r.date.toISOString()).toBe('2026-05-09T22:11:00.902Z');
  });

  it('string vacío → no válido', () => {
    expect(parseDate('').isValid).toBe(false);
  });
});

describe('formatDisplayDate / formatDisplayDateTime', () => {
  it('aplica timezone Colombia en cualquier TZ del runtime', () => {
    // 2026-05-09 03:00 UTC = 22:00 hora Colombia del 8-may
    const iso = '2026-05-09T03:00:00Z';
    for (const tz of ZONAS) {
      const r = withTZ(tz, () => formatDisplayDate(iso));
      // Debe decir "8 de mayo" no "9 de mayo"
      expect(r.toLowerCase()).toContain('8 de mayo');
      expect(r).toContain('2026');
    }
  });

  it('formatDisplayDateTime muestra la hora Colombia (5:11:30 p.m. = 17:11:30)', () => {
    // 2026-05-09 22:11:30 UTC = 17:11:30 Colombia (formato es-CO usa 12h+p.m.)
    const iso = '2026-05-09T22:11:30Z';
    for (const tz of ZONAS) {
      const r = withTZ(tz, () => formatDisplayDateTime(iso));
      // Aceptar tanto 24h ("17:11:30") como 12h con sufijo ("05:11:30 p. m.")
      const matches24h = /17:11:30/.test(r);
      const matches12h = /05:11:30\s*p\.?\s*m\.?/i.test(r);
      expect(matches24h || matches12h, `[${tz}] esperaba 17:11:30 o 5:11:30 p.m., recibí "${r}"`).toBe(true);
      // Y que el día sea el 9 de mayo
      expect(r).toMatch(/09\/05\/2026/);
    }
  });

  it('input inválido devuelve "Fecha inválida"', () => {
    expect(formatDisplayDate('')).toBe('Fecha inválida');
    expect(formatDisplayDateTime('xyz')).toBe('Fecha inválida');
  });
});

describe('formatInputDate', () => {
  it('produce YYYY-MM-DD del día Bogotá', () => {
    expect(formatInputDate('2026-05-09T22:11:00Z')).toBe('2026-05-09');
    expect(formatInputDate('2026-05-09T03:00:00Z')).toBe('2026-05-08'); // hora Col
  });
});

describe('isBirthdayToday', () => {
  beforeEach(() => {
    // Mock "hoy" como 9 de mayo de 2026 (cualquier hora UTC del día Col)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T15:00:00Z')); // 10:00 Col
  });
  afterEach(() => vi.useRealTimers());

  it('cumpleaños hoy (9 de mayo) es true', () => {
    expect(isBirthdayToday('1990-05-09')).toBe(true);
  });

  it('cumpleaños mañana (10 de mayo) es false', () => {
    expect(isBirthdayToday('1990-05-10')).toBe(false);
  });

  it('TZ-independiente', () => {
    for (const tz of ZONAS) {
      withTZ(tz, () => expect(isBirthdayToday('1990-05-09')).toBe(true));
    }
  });
});

describe('isUpcomingBirthday', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T15:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('cumpleaños hoy → upcoming', () => {
    expect(isUpcomingBirthday('1990-05-09', 7)).toBe(true);
  });

  it('cumpleaños en 5 días → upcoming en ventana 7', () => {
    expect(isUpcomingBirthday('1990-05-14', 7)).toBe(true);
  });

  it('cumpleaños en 10 días → fuera de ventana 7', () => {
    expect(isUpcomingBirthday('1990-05-19', 7)).toBe(false);
  });

  it('cumpleaños ayer → no, pero usa el del año siguiente', () => {
    // Ayer fue 8 de mayo. Próximo cumpleaños = 8 mayo 2027 = en 364 días
    expect(isUpcomingBirthday('1990-05-08', 7)).toBe(false);
  });
});

describe('calculateAge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T15:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('cumpleaños fue ayer → edad cumplida', () => {
    expect(calculateAge('2000-05-08')).toBe(26);
  });

  it('cumpleaños hoy → edad cumplida', () => {
    expect(calculateAge('2000-05-09')).toBe(26);
  });

  it('cumpleaños mañana → un año menos', () => {
    expect(calculateAge('2000-05-10')).toBe(25);
  });
});

describe('subtractDaysBogota cobertura adicional para hooks ampliados', () => {
  // Estos casos respaldan los reemplazos en useStore, useOptimizedStats,
  // selectTodaysSales, useCalculations, useCellphoneSalesStats,
  // usePurchasesStats, usePaginatedPurchases, useCustomerSalesStats.
  it('semana: 7 días atrás cubre exactamente 7 días naturales en Bogotá', () => {
    const ref = '2026-05-09';
    const start = subtractDaysBogota(7, ref);
    expect(start).toBe('2026-05-02'); // Sa→Sa, 7 días naturales
    const startISO = startOfDayBogota(start);
    const endISO   = endOfDayBogota(ref);
    // El rango UTC cubre 8 días Colombia × 24h - 1ms
    const horas = (new Date(endISO).getTime() - new Date(startISO).getTime()) / 3_600_000;
    expect(horas).toBeCloseTo(8 * 24 - 1 / 3_600_000, 5);
  });

  it('atajo "thisMonth" para useCustomerSalesStats: primer día del mes Bogotá', () => {
    const todayKey = '2026-05-09';
    const startKey = `${todayKey.slice(0, 7)}-01`;
    expect(startKey).toBe('2026-05-01');
    expect(startOfDayBogota(startKey)).toBe('2026-05-01T05:00:00.000Z');
  });

  it('atajo "lastMonth" cruzando año (enero → diciembre del año anterior)', () => {
    // Replica la lógica de useCustomerSalesStats / TechnicalServiceHistory
    const todayKey = '2026-01-15';
    const [tY, tM] = todayKey.split('-').map(Number);
    const lastY = tM === 1 ? tY - 1 : tY;
    const lastM = tM === 1 ? 12 : tM - 1;
    expect(lastY).toBe(2025);
    expect(lastM).toBe(12);
    const lastMKey = `${lastY}-${String(lastM).padStart(2, '0')}-01`;
    expect(startOfDayBogota(lastMKey)).toBe('2025-12-01T05:00:00.000Z');
  });
});

describe('comparaciones lex string ISO ordenan correctamente', () => {
  // Las refactorizaciones reemplazaron `Date < Date` por `string < string`.
  // Necesitamos garantizar que ISO string ordena igual que tiempo absoluto.
  it('strings ISO ordenan igual que sus instantes Date.getTime()', () => {
    const isos = [
      '2026-05-09T22:11:00.902Z',
      '2026-05-09T15:21:40.576Z',
      '2026-05-09T00:52:20.796Z',
      '2026-05-08T16:50:03.487Z',
      '2026-05-09T22:11:00.901Z', // 1ms antes
    ];
    const sortedByTime = [...isos].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const sortedByLex  = [...isos].sort();
    expect(sortedByLex).toEqual(sortedByTime);
  });
});

describe('getColombiaTimestamp / nowIsoUtc', () => {
  it('devuelven ISO UTC con sufijo Z', () => {
    expect(getColombiaTimestamp()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(nowIsoUtc()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('subtractMonthsBogota / startOfMonthKeyBogota', () => {
  it('resta meses sobre el día Colombia y ajusta al último día del mes', () => {
    for (const tz of ZONAS) {
      withTZ(tz, () => {
        expect(subtractMonthsBogota(1, '2026-03-31')).toBe('2026-02-28');
        expect(subtractMonthsBogota(2, '2026-01-15')).toBe('2025-11-15');
        expect(subtractMonthsBogota(12, '2024-02-29')).toBe('2023-02-28');
        expect(startOfMonthKeyBogota('2026-09-16')).toBe('2026-09-01');
      });
    }
  });

  it('a las 20:00 del día 1 en Colombia el mes sigue siendo el de Colombia', () => {
    // 2026-09-01 20:00 Colombia = 2026-09-02 01:00 UTC
    const instante = new Date('2026-09-02T01:00:00.000Z');
    for (const tz of ZONAS) {
      withTZ(tz, () => {
        expect(startOfMonthKeyBogota(instante)).toBe('2026-09-01');
      });
    }
  });
});

describe('bogotaHour', () => {
  it('devuelve la hora Colombia sin importar la zona del runtime', () => {
    for (const tz of ZONAS) {
      withTZ(tz, () => {
        expect(bogotaHour('2026-09-02T01:30:00.000Z')).toBe(20);
        expect(bogotaHour('2026-09-02T05:00:00.000Z')).toBe(0);
      });
    }
  });
});

describe('isBirthdayThisWeek / isBirthdayThisMonth', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('un cumpleaños el día 1 cuenta en su mes, no en el anterior', () => {
    // Miércoles 2026-09-16 10:00 Colombia
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T15:00:00.000Z'));
    for (const tz of ZONAS) {
      withTZ(tz, () => {
        expect(isBirthdayThisMonth('1990-09-01')).toBe(true);
        expect(isBirthdayThisMonth('1990-08-31')).toBe(false);
      });
    }
  });

  it('la semana va de lunes a domingo en Colombia', () => {
    // Domingo 2026-09-20 21:00 Colombia = lunes 2026-09-21 02:00 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T02:00:00.000Z'));
    for (const tz of ZONAS) {
      withTZ(tz, () => {
        expect(isBirthdayThisWeek('1990-09-14')).toBe(true);  // lunes
        expect(isBirthdayThisWeek('1990-09-20')).toBe(true);  // domingo
        expect(isBirthdayThisWeek('1990-09-21')).toBe(false); // lunes siguiente
        expect(isBirthdayThisWeek('1990-09-13')).toBe(false); // domingo anterior
      });
    }
  });
});
