// Philippine Standard Time helpers (UTC+8, no DST)
export const PH_TZ = 'Asia/Manila'
const PH_OFFSET_MS = 8 * 60 * 60 * 1000

// YYYY-MM-DD in PH local date
export function phDateKey(iso: string | number | Date = new Date()): string {
  const d = iso instanceof Date ? iso : new Date(iso)
  return new Date(d.getTime() + PH_OFFSET_MS).toISOString().slice(0, 10)
}

// YYYY-MM in PH local
export function phMonthKey(iso: string | number | Date = new Date()): string {
  return phDateKey(iso).slice(0, 7)
}

export function phYearKey(iso: string | number | Date = new Date()): string {
  return phDateKey(iso).slice(0, 4)
}

// ISO 8601 week (Monday-anchored) of the PH local date
export function phIsoWeekKey(iso: string | number | Date = new Date()): string {
  const d = iso instanceof Date ? iso : new Date(iso)
  const ph = new Date(d.getTime() + PH_OFFSET_MS)
  const target = new Date(Date.UTC(ph.getUTCFullYear(), ph.getUTCMonth(), ph.getUTCDate()))
  const dayNum = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

// Convert a PH-local YYYY-MM-DD date to a UTC ISO start-of-day instant
export function phDayStartUTC(ymd: string): string {
  return new Date(`${ymd}T00:00:00+08:00`).toISOString()
}

export function phDayEndUTC(ymd: string): string {
  return new Date(`${ymd}T23:59:59.999+08:00`).toISOString()
}
