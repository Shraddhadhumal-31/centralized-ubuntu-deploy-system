import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import ConfirmDialog from './ConfirmDialog';
import { formatIST, formatDuration } from '../utils/date';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function DeploymentHistory() {
  const [deps, setDeps] = useState([]);
  const [total, setTotal] = useState(0);
  const [availableYears, setAvailableYears] = useState([new Date().getFullYear()]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Filter states
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [taskType, setTaskType] = useState('All');
  const [status, setStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const fetchHistory = useCallback(async () => {
    try {
      const params = {
        page,
        page_size: pageSize,
      };
      if (year) params.year = Number(year);
      if (month) params.month = Number(month);
      if (taskType && taskType !== 'All') params.task_type = taskType;
      if (status && status !== 'All') params.status = status;
      if (search.trim()) params.search = search.trim();

      const d = await api.getDeploymentHistory(params);
      setDeps(d.deployments || []);
      setTotal(d.total || 0);
      if (d.available_years && d.available_years.length > 0) {
        setAvailableYears(d.available_years);
      }
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, year, month, taskType, status, search]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleResetFilters = () => {
    setYear('');
    setMonth('');
    setTaskType('All');
    setStatus('All');
    setSearch('');
    setPage(1);
  };

  const handleClearHistory = async () => {
    setClearing(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.clearDeploymentHistory();
      setSuccess(res.message || 'All deployment and capture history records have been cleared.');
      setShowClearConfirm(false);
      await fetchHistory();
    } catch (err) {
      setError(err.message || 'Failed to clear history');
    } finally {
      setClearing(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="history-page">
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h1>Deployment & Capture History</h1>
          <p className="text-muted" style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Complete audit log of imaging and capture attempts saved in database with IST timestamps
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => setShowClearConfirm(true)}
            disabled={total === 0}
          >
            🗑 Clear History
          </button>
          <button className="btn btn-secondary btn-sm" onClick={fetchHistory}>
            Refresh History
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Filter Control Bar */}
      <div
        className="section"
        style={{
          background: '#ffffff',
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', alignItems: 'flex-end' }}>
          {/* Year Filter */}
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Year</label>
            <select
              value={year}
              onChange={(e) => { setYear(e.target.value); setPage(1); }}
              style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            >
              <option value="">All Years</option>
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          {/* Month Filter */}
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Month</label>
            <select
              value={month}
              onChange={(e) => { setMonth(e.target.value); setPage(1); }}
              style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            >
              <option value="">All Months</option>
              {MONTH_NAMES.map((name, idx) => (
                <option key={idx + 1} value={idx + 1}>{name}</option>
              ))}
            </select>
          </div>

          {/* Task Type Filter */}
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Task Type</label>
            <select
              value={taskType}
              onChange={(e) => { setTaskType(e.target.value); setPage(1); }}
              style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            >
              <option value="All">All Types</option>
              <option value="Deployment">Deployment</option>
              <option value="Image Capture">Image Capture</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Status</label>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            >
              <option value="All">All Statuses</option>
              <option value="Completed">Completed</option>
              <option value="Running">Running</option>
              <option value="Pending">Pending</option>
              <option value="Failed">Failed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          {/* Search Filter */}
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Search PC or Image</label>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="e.g. pc-01 or MAC..."
              style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            />
          </div>

          {/* Clear Button */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleResetFilters}
            style={{ height: '36px' }}
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Main Table Section */}
      <div className="section">
        <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1.1rem' }}>
            Historical Records ({total} total)
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
            <span>Page Size:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="page-loading" style={{ padding: '2rem' }}>Loading records...</div>
        ) : deps.length === 0 ? (
          <div className="empty-state" style={{ padding: '2.5rem', textAlign: 'center' }}>
            <p className="empty-text" style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>
              No deployment records match the selected filters.
            </p>
            <button className="btn btn-secondary btn-sm" onClick={handleResetFilters}>
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Task Type</th>
                  <th>Image Name</th>
                  <th>PC Name</th>
                  <th>MAC Address</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Duration</th>
                  <th>Started At (IST)</th>
                  <th>Completed At (IST)</th>
                  <th>Initiator</th>
                </tr>
              </thead>
              <tbody>
                {deps.map((d) => (
                  <tr key={d.id}>
                    <td><strong>#{d.id}</strong></td>
                    <td>
                      <span className={`badge ${d.task_type === 'Image Capture' ? 'badge-capture' : 'badge-deploy'}`}>
                        {d.task_type || 'Deployment'}
                      </span>
                    </td>
                    <td><strong>{d.image_name}</strong></td>
                    <td>{d.host_name}</td>
                    <td><code>{d.host_mac || '—'}</code></td>
                    <td>
                      <div>
                        <span className={`status-badge status-${(d.status || 'pending').toLowerCase()}`}>
                          {d.status}
                        </span>
                        {d.error_message && (
                          <div className="text-danger" style={{ fontSize: '0.75rem', marginTop: '0.25rem', maxWidth: '220px', wordBreak: 'break-word' }}>
                            {d.error_message}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      {d.status === 'Completed' ? (
                        <span style={{ color: '#15803d', fontWeight: 600 }}>100%</span>
                      ) : d.status === 'Running' ? (
                        <span style={{ color: '#2563eb', fontWeight: 600 }}>{d.percent || '15'}%</span>
                      ) : (
                        <span className="text-muted">{d.status === 'Pending' ? '0%' : '—'}</span>
                      )}
                    </td>
                    <td>
                      <strong>{formatDuration(d.duration_seconds)}</strong>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {formatIST(d.started_at || d.created_at)}
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {d.completed_at ? (
                        formatIST(d.completed_at)
                      ) : (
                        <span className="text-muted">
                          {d.status === 'Running' ? 'In Progress...' : d.status === 'Pending' ? 'Waiting for PXE' : '—'}
                        </span>
                      )}
                    </td>
                    <td>{d.created_by || 'admin'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
              Showing {Math.min((page - 1) * pageSize + 1, total)} to {Math.min(page * pageSize, total)} of {total} records
            </span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </button>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                Page {page} of {totalPages}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {showClearConfirm && (
        <ConfirmDialog
          title="Clear Deployment & Capture History"
          message="Are you sure you want to permanently clear all task history records?"
          details={
            <div>
              <p>Total records to be deleted: <strong>{total}</strong></p>
              <p className="text-danger" style={{ marginTop: '0.5rem' }}>
                This will delete all deployment and image capture log history from the database. Registered computers and images will NOT be affected.
              </p>
            </div>
          }
          confirmText="Yes, Clear History"
          danger
          onConfirm={handleClearHistory}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
}
