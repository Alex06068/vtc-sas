/**
 * Hong Kong general (public) holidays for 2026.
 * Source: GovHK — General holidays for 2026
 * https://www.gov.hk/en/about/abouthk/holiday/2026.htm
 *
 * Kept as a fallback if GET /api/calendar/holidays is empty. The canonical list
 * is stored in the holidays table and seeded by backend/seed.py.
 * Keys are local dates in YYYY-MM-DD form. The calendar page marks these days
 * in red and lists them in the side panel. Statutory (labour) holiday
 * differences are intentionally not shown — this is the gazetted general
 * holiday list VTC students care about.
 */
window.VTC_HOLIDAYS = {
  '2026-01-01': "New Year's Day",
  '2026-02-17': "Lunar New Year's Day",
  '2026-02-18': 'The second day of Lunar New Year',
  '2026-02-19': 'The third day of Lunar New Year',
  '2026-04-03': 'Good Friday',
  '2026-04-04': 'The day following Good Friday',
  '2026-04-06': 'The day following Ching Ming Festival',
  '2026-04-07': 'The day following Easter Monday',
  '2026-05-01': 'Labour Day',
  '2026-05-25': 'The day following the Birthday of the Buddha',
  '2026-06-19': 'Tuen Ng Festival',
  '2026-07-01': 'Hong Kong SAR Establishment Day',
  '2026-09-26': 'The day following the Chinese Mid-Autumn Festival',
  '2026-10-01': 'National Day',
  '2026-10-19': 'The day following Chung Yeung Festival',
  '2026-12-25': 'Christmas Day',
  '2026-12-26': 'The first weekday after Christmas Day'
};
