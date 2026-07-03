/**
 * Financial-year helpers. Indian FY runs from Apr 1 to Mar 31.
 *
 *   currentFY()            -> the FY that includes today
 *   fyForDate(date)        -> the FY that includes any given date
 *
 * The returned shape:
 *   {
 *     startY:  2026,          // calendar year Apr 1 lands in
 *     endY:    2027,
 *     start:   Date(Apr 1),
 *     end:     Date(Mar 31, end of day),
 *     key:     '2026-27',     // canonical short key used in bill numbers etc.
 *     label:   'FY 2026-27',
 *   }
 */

const build = (startY) => {
  const endY = startY + 1;
  return {
    startY,
    endY,
    start: new Date(startY, 3, 1),                     // Apr 1
    end:   new Date(endY, 2, 31, 23, 59, 59, 999),     // Mar 31
    key:   `${startY}-${String(endY).slice(-2)}`,
    label: `FY ${startY}-${String(endY).slice(-2)}`,
  };
};

const fyForDate = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-11
  // Jan-Mar → previous calendar year's FY, else current year's FY.
  return build(m < 3 ? y - 1 : y);
};

const currentFY = () => fyForDate(new Date());

module.exports = { currentFY, fyForDate };
