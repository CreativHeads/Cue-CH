/** Kerala and Indian special days shown on the plan calendar. Dates are 'YYYY-MM-DD'. */

/** Same date every year, as 'MM-DD'. */
const FIXED: [string, string][] = [
  ['01-01', 'New Year'],
  ['01-02', 'Mannam Jayanthi'],
  ['01-26', 'Republic Day'],
  ['02-14', "Valentine's Day"],
  ['03-08', "Women's Day"],
  ['04-14', 'Ambedkar Jayanti'],
  ['05-01', 'May Day'],
  ['06-05', 'World Environment Day'],
  ['06-21', 'Yoga Day'],
  ['07-01', "Doctors' Day"],
  ['08-15', 'Independence Day'],
  ['09-05', "Teachers' Day"],
  ['10-02', 'Gandhi Jayanti'],
  ['11-01', 'Kerala Piravi'],
  ['11-14', "Children's Day"],
  ['12-25', 'Christmas'],
  ['12-31', "New Year's Eve"],
];

/**
 * Festivals that follow the lunar / Malayalam calendar. Some Muslim festival dates
 * depend on the moon sighting and can shift by a day, so check them against the
 * official Kerala holiday list each year.
 */
const MOVABLE: Record<string, string> = {
  '2026-01-14': 'Makar Sankranti / Pongal',
  '2026-02-15': 'Maha Shivaratri',
  '2026-03-04': 'Holi',
  '2026-03-20': 'Eid al-Fitr',
  '2026-03-26': 'Ram Navami',
  '2026-04-03': 'Good Friday',
  '2026-04-05': 'Easter',
  '2026-04-14': 'Vishu',
  '2026-05-27': 'Bakrid',
  '2026-06-26': 'Muharram',
  '2026-08-25': 'First Onam (Uthradom)',
  '2026-08-26': 'Thiruvonam · Milad-un-Nabi',
  '2026-08-28': 'Raksha Bandhan · Sree Narayana Guru Jayanthi',
  '2026-09-04': 'Sree Krishna Jayanthi',
  '2026-09-14': 'Ganesh Chaturthi',
  '2026-10-19': 'Maha Navami',
  '2026-10-20': 'Vijayadashami',
  '2026-11-08': 'Diwali',
  '2027-01-14': 'Makar Sankranti / Pongal',
  '2027-03-06': 'Maha Shivaratri',
  '2027-03-10': 'Eid al-Fitr',
  '2027-03-22': 'Holi',
  '2027-03-26': 'Good Friday',
  '2027-03-28': 'Easter',
  '2027-04-14': 'Vishu',
  '2027-04-15': 'Ram Navami',
  '2027-05-17': 'Bakrid',
  '2027-06-15': 'Muharram',
  '2027-08-15': 'Milad-un-Nabi',
  '2027-08-17': 'Raksha Bandhan',
  '2027-08-25': 'Sree Krishna Jayanthi',
  '2027-09-04': 'Ganesh Chaturthi',
  '2027-09-11': 'First Onam (Uthradom)',
  '2027-09-12': 'Thiruvonam',
  '2027-09-14': 'Sree Narayana Guru Jayanthi',
  '2027-10-08': 'Maha Navami',
  '2027-10-09': 'Vijayadashami',
  '2027-10-29': 'Diwali',
};

/** Date of the nth Sunday of a month (1-based month). */
function nthSunday(year: number, month: number, n: number) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((7 - first) % 7) + (n - 1) * 7;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Special days in a month ('YYYY-MM'), keyed by date. */
export function specialDays(month: string): Record<string, string[]> {
  const year = +month.slice(0, 4);
  const out: Record<string, string[]> = {};
  const add = (d: string, name: string) => { if (d.startsWith(month)) (out[d] ||= []).push(name); };
  for (const [md, name] of FIXED) add(`${year}-${md}`, name);
  for (const [d, name] of Object.entries(MOVABLE)) add(d, name);
  add(nthSunday(year, 5, 2), "Mother's Day");
  add(nthSunday(year, 6, 3), "Father's Day");
  add(nthSunday(year, 8, 1), 'Friendship Day');
  return out;
}
