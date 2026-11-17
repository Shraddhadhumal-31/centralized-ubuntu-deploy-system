import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { formatIST, formatDuration } from '../utils/date';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [fogStatus, setFogStatus] = useState(null);

  // Modal state for clicking on cards
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalTasks, setModalTasks] = useState([]);
  const [modalError, setModalError] = useState('');

  // Reset confirmation dialog
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetScope, setResetScope] = useState('all');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');

  const fetchData = async () => {
    try {
      const [dash, health] = await Promise.all([api.getDashboard(), api.getHealth()]);
      setData(dash);
      setFogStatus(health);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 4000);
    return () => clearInterval(iv);
  }, []);

  const openStatusModal = async (status, taskType, label) => {
    setModalTitle(`${label} - Detailed Inspection`);
    setModalOpen(true);
    setModalLoading(true);
    setModalError('');
    setModalTasks([]);

    try {
      const res = await api.getTasksByStatus(status, taskType, 'current');
      setModalTasks(res.tasks || []);
    } catch (err) {
      setModalError(err.message || 'Failed to load task records');
    } finally {
      setModalLoading(false);
    }
  };

  const handleResetCounters = async () => {
    setResetSubmitting(true);
    setActionSuccess('');
    try {
      const res = await api.resetCounters(resetScope);
      setActionSuccess(res.message);
      setResetModalOpen(false);
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setResetSubmitting(false);
    }
  };

  if (loading) return <div className="page-loading">Loading dashboard...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return null;

  const deployStats = data.deployment_stats || {};
  const captureStats = data.capture_stats || {};
  const period = data.reporting_period || {};

  return (
    <div className="dashboard">
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h1>Lab Deployment Dashboard</h1>
          <p className="text-muted" style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Centralized image capture, PXE deployment monitor, and lab workstation manager
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setResetModalOpen(true)}>
            ↺ Reset Counters
          </button>
          <button className="btn btn-secondary btn-sm" onClick={fetchData}>
            Refresh
          </button>
          <span className={`fog-status ${fogStatus?.fog_connected ? 'connected' : 'disconnected'}`}>
            {fogStatus?.fog_connected ? 'FOG Server Online' : 'FOG Server Offline'}
          </span>
        </div>
      </div>

      {actionSuccess && (
        <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
          {actionSuccess}
        </div>
      )}

      {/* Reporting Period & Baseline Banner */}
      <div
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          marginBottom: '1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div style={{ fontSize: '0.85rem', color: '#475569' }}>
          <strong>Active Reporting Period:</strong> {period.label || 'Current Month'} &nbsp;|&nbsp;
          <strong>Baseline Reset:</strong> {period.reset_at_formatted || 'Start of month'}
          {period.is_automatic ? ' (Automatic Monthly Reset)' : ` (Manual Reset by ${period.reset_by || 'admin'})`}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
          All lifetime records are permanently retained in History.
        </div>
      </div>

      {/* Lab Overview Quick Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-number">{data.total_hosts}</div>
          <div className="stat-label">Target Computers</div>
          <span className="text-muted" style={{ fontSize: '0.75rem' }}>Registered Lab Client PCs</span>
        </div>

        <div className="stat-card">
          <div className="stat-number">{data.total_images}</div>
          <div className="stat-label">Registered Images</div>
          <span className="text-muted" style={{ fontSize: '0.75rem' }}>OS Images in FOG</span>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
          <div className="stat-number" style={{ color: '#7c3aed' }}>
            {data.master_host ? data.master_host.name : 'Not Registered'}
          </div>
          <div className="stat-label">Master PC</div>
          <span className="text-muted" style={{ fontSize: '0.75rem' }}>Golden Image Source</span>
        </div>
      </div>

      {/* Dual Section: Deployment Statistics vs Image Capture Statistics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
        {/* 1. OS Deployments Block */}
        <div className="section" style={{ margin: 0, padding: '1.25rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
            <h3 style={{ margin: 0, color: '#1e293b', fontSize: '1.1rem' }}>
              💻 OS Deployments (Clone to Clients)
            </h3>
            <Link to="/deploy" className="btn btn-primary btn-sm">New Deploy</Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
            <div
              className="stat-card clickable-card"
              onClick={() => openStatusModal('completed', 'Deployment', 'Completed Deployments')}
              style={{ borderLeft: '4px solid #10b981', cursor: 'pointer', padding: '0.75rem' }}
              title="Click to view completed deployments"
            >
              <div className="stat-number" style={{ color: '#059669', fontSize: '1.6rem' }}>{deployStats.completed || 0}</div>
              <div className="stat-label" style={{ fontSize: '0.85rem' }}>Completed</div>
              <span className="text-muted" style={{ fontSize: '0.7rem' }}>Click to inspect</span>
            </div>

            <div
              className="stat-card clickable-card"
              onClick={() => openStatusModal('active', 'Deployment', 'Active / In-Progress Deployments')}
              style={{ borderLeft: '4px solid #3b82f6', cursor: 'pointer', padding: '0.75rem' }}
              title="Click to view running and pending deployments"
            >
              <div className="stat-number" style={{ color: '#2563eb', fontSize: '1.6rem' }}>{deployStats.in_progress || 0}</div>
              <div className="stat-label" style={{ fontSize: '0.85rem' }}>In Progress</div>
              <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                {deployStats.running || 0} Running, {deployStats.pending || 0} Pending
              </span>
            </div>

            <div
              className="stat-card clickable-card"
              onClick={() => openStatusModal('failed', 'Deployment', 'Failed Deployments')}
              style={{ borderLeft: '4px solid #ef4444', cursor: 'pointer', padding: '0.75rem' }}
              title="Click to inspect failed deployments and error reasons"
            >
              <div className="stat-number" style={{ color: '#dc2626', fontSize: '1.6rem' }}>{deployStats.failed || 0}</div>
              <div className="stat-label" style={{ fontSize: '0.85rem' }}>Failed</div>
              <span className="text-muted" style={{ fontSize: '0.7rem' }}>Click to see errors</span>
            </div>

            <div
              className="stat-card clickable-card"
              onClick={() => openStatusModal('cancelled', 'Deployment', 'Cancelled Deployments')}
              style={{ borderLeft: '4px solid #64748b', cursor: 'pointer', padding: '0.75rem' }}
              title="Click to view cancelled deployment tasks"
            >
              <div className="stat-number" style={{ color: '#475569', fontSize: '1.6rem' }}>{deployStats.cancelled || 0}</div>
              <div className="stat-label" style={{ fontSize: '0.85rem' }}>Cancelled</div>
              <span className="text-muted" style={{ fontSize: '0.7rem' }}>Ready to redeploy</span>
            </div>
          </div>
        </div>

        {/* 2. Image Capture Block */}
        <div className="section" style={{ margin: 0, padding: '1.25rem', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
            <h3 style={{ margin: 0, color: '#1e293b', fontSize: '1.1rem' }}>
              📸 Image Captures (From Master PC)
            </h3>
            <Link to="/images" className="btn btn-secondary btn-sm">Capture Image</Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
            <div
              className="stat-card clickable-card"
              onClick={() => openStatusModal('completed', 'Image Capture', 'Completed Image Captures')}
              style={{ borderLeft: '4px solid #10b981', cursor: 'pointer', padding: '0.75rem' }}
              title="Click to view successful captures"
            >
              <div className="stat-number" style={{ color: '#059669', fontSize: '1.6rem' }}>{captureStats.completed || 0}</div>
              <div className="stat-label" style={{ fontSize: '0.85rem' }}>Captured Successfully</div>
              <span className="text-muted" style={{ fontSize: '0.7rem' }}>Ready for deployment</span>
            </div>

            <div
              className="stat-card clickable-card"
              onClick={() => openStatusModal('active', 'Image Capture', 'In-Progress Image Captures')}
              style={{ borderLeft: '4px solid #8b5cf6', cursor: 'pointer', padding: '0.75rem' }}
              title="Click to view active capture tasks"
            >
              <div className="stat-number" style={{ color: '#7c3aed', fontSize: '1.6rem' }}>{captureStats.in_progress || 0}</div>
              <div className="stat-label" style={{ fontSize: '0.85rem' }}>Capturing Now</div>
              <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                {captureStats.running || 0} Active, {captureStats.pending || 0} Queued
              </span>
            </div>

            <div
              className="stat-card clickable-card"
              onClick={() => openStatusModal('failed', 'Image Capture', 'Failed Image Captures')}
              style={{ borderLeft: '4px solid #ef4444', cursor: 'pointer', padding: '0.75rem' }}
              title="Click to inspect capture failures"
            >
              <div className="stat-number" style={{ color: '#dc2626', fontSize: '1.6rem' }}>{captureStats.failed || 0}</div>
              <div className="stat-label" style={{ fontSize: '0.85rem' }}>Capture Failures</div>
              <span className="text-muted" style={{ fontSize: '0.7rem' }}>Click to view causes</span>
            </div>

            <div
              className="stat-card clickable-card"
              onClick={() => openStatusModal('cancelled', 'Image Capture', 'Cancelled Captures')}
              style={{ borderLeft: '4px solid #64748b', cursor: 'pointer', padding: '0.75rem' }}
              title="Click to view cancelled capture tasks"
            >
              <div className="stat-number" style={{ color: '#475569', fontSize: '1.6rem' }}>{captureStats.cancelled || 0}</div>
              <div className="stat-label" style={{ fontSize: '0.85rem' }}>Cancelled Captures</div>
              <span className="text-muted" style={{ fontSize: '0.7rem' }}>Aborted by user</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Active Tasks Banner */}
      {data.active_deployments && data.active_deployments.length > 0 && (
        <div className="section" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div className="section-header" style={{ marginBottom: '0.75rem' }}>
            <h2 style={{ color: '#1e40af' }}>
              ⚡ Live Tasks in Progress ({data.active_deployments.length})
            </h2>
            <Link to="/deploy" className="btn btn-primary btn-sm">
              Live Monitor & Controls
            </Link>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Task Type</th>
                  <th>Computer</th>
                  <th>Image</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Elapsed Time</th>
                </tr>
              </thead>
              <tbody>
                {data.active_deployments.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className={`badge ${t.task_type === 'Image Capture' ? 'badge-capture' : 'badge-deploy'}`} style={{ fontWeight: 600 }}>
                        {t.task_type || 'Deployment'}
                      </span>
                    </td>
                    <td>
                      <strong>{t.host_name}</strong>{' '}
                      <span className="text-muted" style={{ fontSize: '0.8rem' }}>({t.host_mac})</span>
                    </td>
                    <td>{t.image_name}</td>
                    <td>
                      <span className={`status-badge status-${t.status.toLowerCase()}`}>
                        {t.status}
                      </span>
                    </td>
                    <td>
                      {t.status === 'Running' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{ width: '80px', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${t.percent || 10}%`, height: '100%', background: '#2563eb' }}></div>
                          </div>
                          <span>{t.percent ? `${t.percent}%` : 'Cloning...'}</span>
                        </div>
                      ) : (
                        <span className="text-muted">Waiting for PXE Boot...</span>
                      )}
                    </td>
                    <td><strong>{formatDuration(t.elapsed_seconds)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Master Computer Card */}
      {data.master_host && (
        <div className="section" style={{ marginBottom: '1.5rem' }}>
          <div className="info-card master-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <h3 style={{ margin: 0 }}>Master Computer</h3>
                <span className="badge badge-master">Golden Image Source</span>
              </div>
              <p style={{ margin: '0.25rem 0' }}>
                <strong>Hostname:</strong> {data.master_host.name} &nbsp;|&nbsp;
                <strong>MAC:</strong> <code>{data.master_host.mac}</code>
              </p>
              <p className="text-muted" style={{ margin: 0, fontSize: '0.8rem' }}>
                Source computer for capturing lab deployment images.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Link to="/computers" className="btn btn-secondary btn-sm">
                Manage Master PC
              </Link>
              <Link to="/images" className="btn btn-primary btn-sm">
                Capture Image from Master
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Recent Activity Table */}
      <div className="section">
        <div className="section-header">
          <h2>Recent Activity (IST Timezone)</h2>
          <Link to="/history" className="btn btn-secondary btn-sm">View Full History & Filters</Link>
        </div>
        {data.recent_deployments.length === 0 ? (
          <p className="empty-text">No activity recorded yet for the current period.</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Task Type</th>
                  <th>Computer</th>
                  <th>Image Name</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Duration</th>
                  <th>Started (IST)</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_deployments.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <span className={`badge ${d.task_type === 'Image Capture' ? 'badge-capture' : 'badge-deploy'}`}>
                        {d.task_type || 'Deployment'}
                      </span>
                    </td>
                    <td>
                      <strong>{d.host_name}</strong>{' '}
                      <span className="text-muted" style={{ fontSize: '0.8rem' }}>({d.host_mac})</span>
                    </td>
                    <td>{d.image_name}</td>
                    <td>
                      <span className={`status-badge status-${d.status.toLowerCase()}`}>
                        {d.status}
                      </span>
                    </td>
                    <td>{d.percent ? `${d.percent}%` : '—'}</td>
                    <td>{formatDuration(d.duration_seconds)}</td>
                    <td>{formatIST(d.started_at || d.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Interactive Modal for Clicking on Statistics Cards */}
      {modalOpen && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ maxWidth: '800px', width: '90%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>{modalTitle}</h3>
              <button className="btn-close" onClick={() => setModalOpen(false)}>✕</button>
            </div>

            <div className="modal-body" style={{ padding: '1rem 0' }}>
              {modalLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}>Loading task records...</div>
              ) : modalError ? (
                <div className="alert alert-error">{modalError}</div>
              ) : modalTasks.length === 0 ? (
                <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
                  <p className="empty-text">No records found matching this status in the current reporting period.</p>
                </div>
              ) : (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Computer</th>
                        <th>Image</th>
                        <th>Status</th>
                        <th>Duration</th>
                        <th>Timestamp (IST)</th>
                        <th>Error Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalTasks.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <span className={`badge ${t.task_type === 'Image Capture' ? 'badge-capture' : 'badge-deploy'}`}>
                              {t.task_type}
                            </span>
                          </td>
                          <td>
                            <strong>{t.host_name}</strong>
                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>{t.host_mac}</div>
                          </td>
                          <td>{t.image_name}</td>
                          <td>
                            <span className={`status-badge status-${t.status.toLowerCase()}`}>
                              {t.status}
                            </span>
                          </td>
                          <td>{formatDuration(t.duration_seconds)}</td>
                          <td style={{ fontSize: '0.85rem' }}>{formatIST(t.started_at || t.created_at)}</td>
                          <td style={{ color: '#dc2626', fontSize: '0.8rem', maxWidth: '200px', wordBreak: 'break-word' }}>
                            {t.error_message || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Reporting Counters Confirmation Dialog */}
      {resetModalOpen && (
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ maxWidth: '500px', width: '90%' }}>
            <div className="modal-header">
              <h3>Reset Reporting Counters</h3>
              <button className="btn-close" onClick={() => setResetModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: '1rem 0' }}>
              <p>
                This operation resets the baseline timestamp for statistical reporting on the dashboard cards.
              </p>
              <div className="alert alert-info" style={{ fontSize: '0.85rem', margin: '0.75rem 0' }}>
                ✓ <strong>Safe operation:</strong> All historical task records, logs, and registered PCs remain permanently preserved and visible in <strong>Deployment History</strong>.
              </div>

              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label><strong>Scope of Reset:</strong></label>
                <select
                  value={resetScope}
                  onChange={(e) => setResetScope(e.target.value)}
                  className="form-control"
                  style={{ width: '100%', padding: '0.5rem', marginTop: '0.25rem' }}
                >
                  <option value="all">All Counters (Deployments and Captures)</option>
                  <option value="deployment">Deployment Counters Only</option>
                  <option value="capture">Image Capture Counters Only</option>
                </select>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setResetModalOpen(false)}
                disabled={resetSubmitting}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleResetCounters}
                disabled={resetSubmitting}
              >
                {resetSubmitting ? 'Resetting...' : 'Confirm Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
