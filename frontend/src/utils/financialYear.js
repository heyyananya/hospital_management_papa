/**
 * Financial-year helpers. Indian FY runs Apr 1 → Mar 31.
 * Frontend-side twin of backend/src/utils/financialYear.js — kept in sync
 * so bill numbers, filters, and displayed labels use the same key.
 */
import dayjs from 'dayjs';

const build = (startY) => {
  const endY = startY + 1;
  return {
    startY,
    endY,
    start: dayjs(new Date(startY, 3, 1)),                // Apr 1 00:00
    end:   dayjs(new Date(endY,   2, 31)).endOf('day'),  // Mar 31 23:59
    key:   `${startY}-${String(endY).slice(-2)}`,
    label: `FY ${startY}-${String(endY).slice(-2)}`,
  };
};

export const fyForDate = (d) => {
  const date = dayjs(d);
  const y = date.year();
  const m = date.month(); // 0-11
  return build(m < 3 ? y - 1 : y);
};

export const currentFY = () => fyForDate(dayjs());

export const prevFY = () => {
  const c = currentFY();
  return build(c.startY - 1);
};
