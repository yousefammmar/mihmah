// Deadlines are chosen as calendar dates in Jordan and stored as the end of that day in Asia/Amman (UTC in DB).
export const TZ = 'Asia/Amman';

export function ammanToday(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// Whole days between today (Amman) and a YYYY-MM-DD date.
export function daysFromToday(dateStr) {
  const toUtc = (s) => Date.UTC(...s.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  return Math.round((toUtc(dateStr) - toUtc(ammanToday())) / 86400_000);
}

export const isDateStr = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

// SQL fragment converting a YYYY-MM-DD parameter into "23:59:59 Amman time" as timestamptz.
export const endOfAmmanDay = (param) => `((${param})::date + time '23:59:59') at time zone '${TZ}'`;
