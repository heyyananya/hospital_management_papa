/**
 * Small row of pill-style chips that snap the current date-range filter to
 * common Financial-Year windows. Drop it beside any pair of DatePickers:
 *
 *   <FyRangeChips onPick={(from, to) => setFilters({...filters, fromDate: from, toDate: to})} />
 */
import { Stack, Chip } from '@mui/material';
import dayjs from 'dayjs';
import { currentFY, prevFY } from '../utils/financialYear.js';

export default function FyRangeChips({ onPick, size = 'small' }) {
  const cfy = currentFY();
  const pfy = prevFY();

  const chip = (label, from, to) => (
    <Chip
      key={label}
      size={size}
      label={label}
      onClick={() => onPick(from, to)}
      variant="outlined"
      sx={{ borderRadius: 999 }}
    />
  );

  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
      {chip(`This FY (${cfy.label.replace('FY ', '')})`, cfy.start,
             dayjs().endOf('day').isBefore(cfy.end) ? dayjs().endOf('day') : cfy.end)}
      {chip(`Last FY (${pfy.label.replace('FY ', '')})`, pfy.start, pfy.end)}
      {chip('This month',  dayjs().startOf('month'),  dayjs().endOf('day'))}
      {chip('Today',       dayjs().startOf('day'),    dayjs().endOf('day'))}
    </Stack>
  );
}
