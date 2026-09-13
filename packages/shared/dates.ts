export function dateInZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function utcBoundary(day: string, timeZone: string) {
  let timestamp = Date.parse(`${day}T00:00:00Z`);
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 3; i++) {
    const rendered =
      formatter.format(new Date(timestamp)).replace(" ", "T") + "Z";
    const delta = Date.parse(`${day}T00:00:00Z`) - Date.parse(rendered);
    timestamp += delta;
    if (!delta) break;
  }
  return new Date(timestamp).toISOString();
}
export function addDays(day: string, count: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
export const periods = [
  "today",
  "yesterday",
  "this_week",
  "last_7_days",
  "this_month",
  "last_month",
  "this_quarter",
  "this_year",
  "last_year",
  "custom",
] as const;
export function periodRange(
  period: string,
  timezone = "Africa/Cairo",
  now = new Date(),
  custom?: { from: string; to: string },
) {
  const today = dateInZone(now, timezone);
  let from = today;
  let to = addDays(today, 1);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (period === "yesterday") {
    from = addDays(today, -1);
    to = today;
  } else if (period === "last_7_days") from = addDays(today, -6);
  else if (period === "this_week")
    from = addDays(
      today,
      -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7),
    );
  else if (period === "this_month") from = today.slice(0, 7) + "-01";
  else if (period === "last_month") {
    to = today.slice(0, 7) + "-01";
    from = addDays(to, -1).slice(0, 7) + "-01";
  } else if (period === "this_quarter")
    from = `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  else if (period === "this_year") from = `${year}-01-01`;
  else if (period === "last_year") {
    from = `${year - 1}-01-01`;
    to = `${year}-01-01`;
  } else if (period === "custom") {
    if (!custom || custom.from > custom.to)
      throw new Error("Invalid date range");
    from = custom.from;
    to = addDays(custom.to, 1);
  }
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
  if (days > 3660 || days < 1)
    throw new Error("Date range must be between 1 day and 10 years");
  return {
    from,
    to,
    start: utcBoundary(from, timezone),
    end: utcBoundary(to, timezone),
    previous_start: utcBoundary(addDays(from, -days), timezone),
    previous_end: utcBoundary(from, timezone),
  };
}
