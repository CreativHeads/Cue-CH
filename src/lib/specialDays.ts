/** Kerala and Indian special days shown on the plan calendar. Dates are 'YYYY-MM-DD'. */

/** Same date every year, as 'MM-DD'. */
const FIXED: [string, string][] = [
  ['01-01', 'New Year'],
  ['01-02', 'Mannam Jayanthi'],
  ['01-12', 'National Youth Day'],
  ['01-15', 'Army Day'],
  ['01-23', 'Netaji Jayanti'],
  ['01-26', 'Republic Day'],
  ['01-30', "Martyrs' Day"],
  ['02-04', 'World Cancer Day'],
  ['02-14', "Valentine's Day"],
  ['02-28', 'National Science Day'],
  ['03-06', "National Dentist's Day"],
  ['03-08', "Women's Day"],
  ['03-20', 'World Oral Health Day'],
  ['03-22', 'World Water Day'],
  ['04-07', 'World Health Day'],
  ['04-14', 'Ambedkar Jayanti'],
  ['04-22', 'Earth Day'],
  ['05-01', 'May Day'],
  ['06-05', 'World Environment Day'],
  ['06-21', 'Yoga Day'],
  ['07-01', "Doctors' Day"],
  ['07-26', 'Kargil Vijay Diwas'],
  ['08-15', 'Independence Day'],
  ['08-28', 'Ayyankali Jayanthi'],
  ['09-05', "Teachers' Day"],
  ['09-14', 'Hindi Diwas'],
  ['09-15', "Engineers' Day"],
  ['09-27', 'World Tourism Day'],
  ['09-29', 'World Heart Day'],
  ['10-02', 'Gandhi Jayanti'],
  ['10-10', 'World Mental Health Day'],
  ['11-01', 'Kerala Piravi'],
  ['11-14', "Children's Day"],
  ['11-19', "International Men's Day"],
  ['11-26', 'Constitution Day'],
  ['12-24', 'Christmas Eve'],
  ['12-25', 'Christmas'],
  ['12-31', "New Year's Eve"],
];

/**
 * Festivals that follow the lunar / Malayalam calendar, checked against the Kerala
 * government holiday list (officeholidays.com) and timeanddate.com in Oct 2026. Where
 * Kerala and the national list differ, the Kerala date is used. Muslim festival dates
 * depend on the moon sighting and can still shift by a day. Add each new year here.
 */
const MOVABLE: Record<string, string> = {
  '2026-01-13': 'Lohri',
  '2026-01-14': 'Makar Sankranti / Pongal',
  '2026-02-15': 'Maha Shivaratri',
  '2026-02-19': 'Ramadan begins',
  '2026-03-04': 'Holi',
  '2026-03-19': 'Ugadi / Gudi Padwa',
  '2026-03-20': 'Eid al-Fitr',
  '2026-03-26': 'Ram Navami',
  '2026-03-31': 'Mahavir Jayanti',
  '2026-04-15': 'Vishu',
  '2026-05-01': 'Buddha Purnima',
  '2026-05-27': 'Bakrid',
  '2026-06-26': 'Muharram',
  '2026-08-12': 'Karkidaka Vavu',
  '2026-08-17': 'Chingam 1 (Malayalam New Year) · Atham',
  '2026-08-25': 'First Onam (Uthradom) · Milad-un-Nabi',
  '2026-08-26': 'Thiruvonam',
  '2026-08-27': 'Third Onam',
  '2026-08-28': 'Raksha Bandhan · Sree Narayana Guru Jayanthi',
  '2026-09-04': 'Sree Krishna Jayanthi',
  '2026-09-14': 'Ganesh Chaturthi',
  '2026-09-21': 'Sree Narayana Guru Samadhi',
  '2026-10-11': 'Navaratri begins',
  '2026-10-19': 'Durga Ashtami',
  '2026-10-20': 'Maha Navami',
  '2026-10-21': 'Vijayadashami',
  '2026-11-08': 'Diwali',
  '2026-11-11': 'Bhai Dooj',
  '2026-11-24': 'Guru Nanak Jayanti',
  '2027-01-13': 'Lohri',
  '2027-01-14': 'Makar Sankranti · Makaravilakku',
  '2027-01-15': 'Pongal',
  '2027-02-09': 'Ramadan begins',
  '2027-03-06': 'Maha Shivaratri',
  '2027-03-09': 'Eid al-Fitr',
  '2027-03-22': 'Holi',
  '2027-04-07': 'Ugadi / Gudi Padwa',
  '2027-04-15': 'Vishu · Ram Navami',
  '2027-04-19': 'Mahavir Jayanti',
  '2027-05-17': 'Bakrid',
  '2027-05-20': 'Buddha Purnima',
  '2027-06-16': 'Muharram',
  '2027-08-15': 'Milad-un-Nabi',
  '2027-08-17': 'Raksha Bandhan · Chingam 1 (Malayalam New Year)',
  '2027-08-25': 'Sree Krishna Jayanthi',
  '2027-09-03': 'Atham',
  '2027-09-04': 'Ganesh Chaturthi',
  '2027-09-11': 'First Onam (Uthradom)',
  '2027-09-12': 'Thiruvonam',
  '2027-09-13': 'Third Onam',
  '2027-09-14': 'Fourth Onam · Sree Narayana Guru Jayanthi',
  '2027-09-21': 'Sree Narayana Guru Samadhi',
  '2027-09-30': 'Navaratri begins',
  '2027-10-07': 'Durga Ashtami',
  '2027-10-08': 'Maha Navami',
  '2027-10-09': 'Vijayadashami',
  '2027-10-29': 'Diwali',
  '2027-10-31': 'Bhai Dooj',
  '2027-11-14': 'Guru Nanak Jayanti',
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Date of the nth Sunday of a month (1-based month). */
function nthSunday(year: number, month: number, n: number) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return ymd(new Date(Date.UTC(year, month - 1, 1 + ((7 - first) % 7) + (n - 1) * 7)));
}

/** Western Easter Sunday (anonymous Gregorian algorithm). */
function easter(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day);
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
  const e = easter(year), day = 864e5;
  add(ymd(new Date(e - 46 * day)), 'Ash Wednesday');
  add(ymd(new Date(e - 7 * day)), 'Palm Sunday');
  add(ymd(new Date(e - 3 * day)), 'Maundy Thursday');
  add(ymd(new Date(e - 2 * day)), 'Good Friday');
  add(ymd(new Date(e)), 'Easter');
  return out;
}
