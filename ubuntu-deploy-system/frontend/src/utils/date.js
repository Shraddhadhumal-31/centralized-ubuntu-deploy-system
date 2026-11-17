/**
 * Formats an ISO UTC date string into standard Indian Standard Time (IST) format.
 * Example output: "22 Oct 2026, 04:30:15 PM IST"
 */
export function formatIST(dateStr, includeSeconds = true) {
  if (!dateStr) return '—';
  try {
    // If string does not have timezone info, assume UTC
    let normalizedStr = dateStr;
    if (typeof dateStr === 'string' && !dateStr.endsWith('Z') && !dateStr.includes('+')) {
      normalizedStr = dateStr + 'Z';
    }
    const d = new Date(normalizedStr);
    if (isNaN(d.getTime())) return String(dateStr);

    const options = {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    };
    if (includeSeconds) {
      options.second = '2-digit';
    }
    const formatted = new Intl.DateTimeFormat('en-IN', options).format(d);
    return `${formatted} IST`;
  } catch (e) {
    return String(dateStr);
  }
}

/**
 * Formats duration in seconds to readable "Xh Ym Zs" format.
 */
export function formatDuration(seconds) {
  if (seconds == null || isNaN(seconds) || seconds < 0) return '—';
  const sec = Math.round(Number(seconds));
  if (sec < 60) return `${sec}s`;
  const mins = Math.floor(sec / 60);
  const remainingSec = sec % 60;
  if (mins < 60) return `${mins}m ${remainingSec}s`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m ${remainingSec}s`;
}
