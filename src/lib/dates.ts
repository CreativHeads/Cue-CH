// IST calendar helpers. Dates are 'YYYY-MM-DD' strings; months are 'YYYY-MM'.
export const TZ = process.env.APP_TIMEZONE || 'Asia/Kolkata';
const IST_OFFSET = '+05:30';

const utc = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const iso = (dt: Date) => dt.toISOString().slice(0, 10);

export const addDays = (s: string, n: number) => iso(new Date(utc(s).getTime() + n * 864e5));
export const diffDays = (a: string, b: string) => Math.round((utc(a).getTime() - utc(b).getTime()) / 864e5);
export const dow = (s: string) => utc(s).getUTCDay(); // 0 = Sunday
export const ymOf = (s: string) => s.slice(0, 7);
export const daysInMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
export const ymAdd = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  return iso(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7);
};
export const monthDays = (ym: string) =>
  Array.from({ length: daysInMonth(ym) }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
export const mondayOf = (s: string) => addDays(s, -((dow(s) + 6) % 7));

/** IST calendar day of an instant. */
export const istDate = (ts: string | Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(typeof ts === 'string' ? new Date(ts) : ts);
/** IST wall-clock time 'HH:MM' of an instant. */
export const istTime = (ts: string | Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    typeof ts === 'string' ? new Date(ts) : ts,
  );
export const todayIST = () => istDate(new Date());
/** Combine an IST date and 'HH:MM[:SS]' into an ISO instant. */
export const toDueAt = (date: string, time: string) => new Date(`${date}T${time.slice(0, 5)}:00${IST_OFFSET}`).toISOString();

export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export const MON = MONTHS.map((m) => m.slice(0, 3));
export const DOWS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
export const fmtD = (s: string) => `${+s.slice(8)} ${MON[+s.slice(5, 7) - 1]}`;
export const fmtYM = (ym: string) => `${MONTHS[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`;
export const fmtT = (t: string) => {
  let [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
};
export const relDay = (s: string, today = todayIST()) => {
  const d = diffDays(s, today);
  return d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d === -1 ? 'Yesterday' : fmtD(s);
};
