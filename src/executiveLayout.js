// One consistent set of sizing rules for executive poster rows and pagination.
// Keep the same small, rounded photo shape across every row.
export const EXECUTIVE_MEMBERS_PER_PAGE = 30;

export function executiveRowSizes(count) {
  const n = Math.max(0, Math.min(EXECUTIVE_MEMBERS_PER_PAGE, Math.floor(Number(count) || 0)));
  if (n === 0) return [];
  if (n <= 8) return [n];
  if (n <= 16) return [8, n - 8];
  if (n <= 20) return [10, n - 10];
  return [10, 10, n - 20];
}

export function splitExecutiveRows(members) {
  const list = Array.isArray(members) ? members : [];
  let offset = 0;
  return executiveRowSizes(list.length).map(size => {
    const row = list.slice(offset, offset + size);
    offset += size;
    return row;
  });
}
