/**
 * Pagination. Pure presentational — the caller owns page state and the fetch.
 * Defaults match InventoryList's existing contract exactly: 20 per page,
 * "Showing X–Y of N", Previous/Next disabled at the bounds.
 */
export interface PaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  /** Noun for the summary, e.g. "leads" / "properties". */
  itemLabel?: string;
}

export function Pagination({
  page,
  totalPages,
  totalCount,
  pageSize = 20,
  onPageChange,
  itemLabel = 'results',
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <nav
      aria-label={`Pagination for ${itemLabel}`}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 'var(--rp-s-3)', marginTop: 'var(--rp-s-3)', flexWrap: 'wrap',
        fontSize: 12, color: 'var(--text-muted)',
      }}
    >
      <span className="rp-nums">
        Showing {from.toLocaleString('en-IN')}–{to.toLocaleString('en-IN')} of{' '}
        {totalCount.toLocaleString('en-IN')} {itemLabel}
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          className="rp-btn rp-btn--ghost"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          style={{ minHeight: 32, padding: '0 12px' }}
        >
          Previous
        </button>
        <span className="rp-nums" style={{ display: 'inline-flex', alignItems: 'center', padding: '0 4px' }}>
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          className="rp-btn rp-btn--ghost"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          style={{ minHeight: 32, padding: '0 12px' }}
        >
          Next
        </button>
      </div>
    </nav>
  );
}

export default Pagination;
