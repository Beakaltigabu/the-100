import { useState, useCallback, useEffect } from 'react';
import { api } from '../api/client';

// Shared admin list state: page-size pagination with "view more" (append next
// page) plus a prev/next pager. Changing filters/dates resets to page 1.
export function useAdminList({ path, pageSize = 10, buildQuery = () => ({}), dataKey = 'entries' }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchPage = useCallback(
    async (p, accumulate) => {
      setLoading(true);
      setError('');
      const qs = new URLSearchParams({ page: String(p), limit: String(pageSize) });
      Object.entries(buildQuery()).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') qs.set(k, v);
      });
      try {
        const d = await api.get(`${path}?${qs.toString()}`);
        const list = d[dataKey] || [];
        setTotal(d.total || 0);
        setPage(p);
        setRows((prev) => (accumulate ? [...prev, ...list] : list));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [path, pageSize, buildQuery, dataKey]
  );

  useEffect(() => {
    fetchPage(1, false);
  }, [fetchPage]);

  return {
    rows,
    total,
    page,
    limit: pageSize,
    loading,
    error,
    reload: () => fetchPage(1, false),
    viewMore: () => fetchPage(page + 1, true),
    goPage: (p) => fetchPage(p, false)
  };
}