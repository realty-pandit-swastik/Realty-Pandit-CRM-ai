// Relative age of a listing from its created_at, e.g. "today", "5d ago", "2mo ago", "1y 3mo ago".
// Used on the inventory tiles (desktop + mobile) so staff can see how fresh a listing is.
export function relativeAge(iso?: string | null): string {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return '';
    const days = Math.floor((Date.now() - then) / 86_400_000);
    if (days <= 0) return 'today';
    if (days === 1) return '1d ago';
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(months / 12);
    const remMo = months % 12;
    return remMo ? `${years}y ${remMo}mo ago` : `${years}y ago`;
}
