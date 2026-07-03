const asyncHandler = require('../utils/asyncHandler');
const dashboardService = require('../services/dashboardService');

exports.summary = asyncHandler(async (_req, res) => {
  // Fire small queries in parallel - keeps dashboard snappy.
  const [today, month, fy, total, followups, recent] = await Promise.all([
    dashboardService.todayCounts(),
    dashboardService.monthlyCount(),
    dashboardService.fyCount(),
    dashboardService.totals(),
    dashboardService.followupsToday(),
    dashboardService.recentPatients(),
  ]);
  res.json({
    ...today, ...month, ...total,
    fyCount: fy.count, fyKey: fy.fyKey, fyLabel: fy.fyLabel,
    followupsToday: followups, recentPatients: recent,
  });
});
