// Minimal standard 5-field cron matcher (minute hour day-of-month month day-of-week).
// Supports: *  a  a,b  a-b  */n  a-b/n
// No external dependencies. Sufficient for UI presets (hourly/daily/weekly/monthly).

function parseField(field, min, max) {
  const allowed = new Set();
  for (const part of String(field).split(",")) {
    let step = 1, range = part;
    const slash = part.indexOf("/");
    if (slash !== -1) {
      step = parseInt(part.slice(slash + 1), 10) || 1;
      range = part.slice(0, slash);
    }
    let lo = min, hi = max;
    if (range !== "*") {
      const dash = range.indexOf("-");
      if (dash !== -1) {
        lo = parseInt(range.slice(0, dash), 10);
        hi = parseInt(range.slice(dash + 1), 10);
      } else {
        lo = hi = parseInt(range, 10);
      }
    }
    if (Number.isNaN(lo) || Number.isNaN(hi)) continue;
    for (let v = lo; v <= hi; v += step) allowed.add(v);
  }
  return allowed;
}

// Does `cronExpr` match the given Date (to the minute)?
function cronMatches(cronExpr, date = new Date()) {
  const parts = String(cronExpr || "").trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [m, h, dom, mon, dow] = parts;
  const min = parseField(m, 0, 59);
  const hour = parseField(h, 0, 23);
  const dayOfMonth = parseField(dom, 1, 31);
  const month = parseField(mon, 1, 12);
  const dayOfWeek = parseField(dow, 0, 6); // 0 = Sunday

  if (!min.has(date.getMinutes())) return false;
  if (!hour.has(date.getHours())) return false;
  if (!month.has(date.getMonth() + 1)) return false;
  // Standard cron: if both dom and dow are restricted, either matching is enough.
  const domRestricted = dom !== "*";
  const dowRestricted = dow !== "*";
  const domOk = dayOfMonth.has(date.getDate());
  const dowOk = dayOfWeek.has(date.getDay());
  if (domRestricted && dowRestricted) return domOk || dowOk;
  if (domRestricted) return domOk;
  if (dowRestricted) return dowOk;
  return true;
}

// Same calendar minute? (used to de-dupe against last_run_at)
function sameMinute(a, b) {
  if (!a || !b) return false;
  const da = new Date(a), db = new Date(b);
  return Math.floor(da.getTime() / 60000) === Math.floor(db.getTime() / 60000);
}

module.exports = { cronMatches, sameMinute, parseField };
