import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import ConfirmDialog from './ConfirmDialog';
import { formatIST, formatDuration } from '../utils/date';

export default function Deployments() {
  const [hosts, setHosts] = useState([]);
  const [images, setImages] = useState([]);
  const [sel, setSel] = useState(new Set());
  const [selImg, setSelImg] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [results, setResults] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [active, setActive] = useState([]);
  const [wolSending, setWolSending] = useState(false);
  const [wolResult, setWolResult] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [c, i, a] = await Promise.all([
        api.getComputers(),
        api.getUsableImages().catch(() => api.getImages()),
        api.getActiveDeployments(),
      ]);
      const validHosts = c.hosts || [];
      setHosts(validHosts);

      const imgList = i.images || [];
      setImages(imgList);

      if (imgList.length > 0) {
        setSelImg((prev) => {
          if (prev && imgList.some((img) => String(img.id) === String(prev))) {
            return prev;
          }
          const masterImg = imgList.find((img) =>
            img.name.toLowerCase().includes('master')
          );
          return masterImg ? String(masterImg.id) : String(imgList[0].id);
        });
      }

      setActive(a.tasks || []);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 3000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const toggle = (id) => {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSel(n);
  };

  const selectAll = () => {
    sel.size === hosts.length
      ? setSel(new Set())
      : setSel(new Set(hosts.map((h) => h.id)));
  };

  const handleDeploy = () => {
    if (sel.size === 0) {
      setError('Please select at least one computer to deploy');
      return;
    }
    if (!selImg) {
      setError('Please select an image to deploy');
      return;
    }
    setError('');
    setShowConfirm(true);
  };

  const confirmDeploy = async () => {
    setShowConfirm(false);
    setDeploying(true);
    setResults(null);
    try {
      const d = await api.createDeployment(
        Array.from(sel).map(Number),
        Number(selImg)
      );
      setResults(d.results || []);
      setSel(new Set());
      await fetchData();
    } catch (e) {
      setError(e.message || 'Deployment initiation failed');
    } finally {
      setDeploying(false);
    }
  };

  const handleWOL = async () => {
    const macs = hosts
      .filter((h) => sel.has(h.id))
      .map((h) => h.mac)
      .filter(Boolean);
    if (!macs.length) {
      setError('Selected computers do not have MAC addresses');
      return;
    }
    setWolSending(true);
    setWolResult(null);
    try {
      const d = await api.sendWOL(macs);
      setWolResult(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setWolSending(false);
    }
  };

  const handleCancelTask = async (hostId) => {
    try {
      await api.cancelDeployment(hostId);
      setCancelTarget(null);
      await fetchData();
    } catch (e) {
      setError(e.message || 'Failed to cancel task');
      setCancelTarget(null);
    }
  };

  const selNames = hosts.filter((h) => sel.has(h.id)).map((h) => h.name);
  const selImgObj = images.find((i) => String(i.id) === String(selImg));
  const selImgName = selImgObj ? selImgObj.name : '';

  if (loading) return <div className="page-loading">Loading deployments...</div>;

  return (
    <div className="deploy-page">
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h1>Deploy Image to Lab Computers</h1>
          <p className="text-muted" style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Schedule and track multi-PC image deployment via Wake-on-LAN and network PXE
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchData}>
          Refresh Status
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Task Initiation Results */}
      {results && (
        <div className="section" style={{ marginBottom: '1.5rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1rem' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Deployment Task Creation Results</h2>
          <div className="results-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {results.map((r, i) => (
              <div
                key={i}
                className={`result-item ${
                  r.success ? 'result-success' : 'result-fail'
                }`}
                style={{ padding: '0.65rem 1rem', borderRadius: '6px' }}
              >
                <strong>{r.host_name}</strong>: {r.success ? (
                  <span>Task scheduled! (Status: <strong style={{ color: '#d97706' }}>Pending</strong> - waiting for client PXE boot)</span>
                ) : (
                  <span style={{ color: '#dc2626' }}>{r.error}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Active Tasks Banner */}
      <div
        className="section"
        style={{
          background: '#f8fafc',
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          padding: '1.25rem',
          marginBottom: '1.5rem',
        }}
      >
        <div className="section-header" style={{ marginBottom: '0.75rem' }}>
          <h2>Live Active Tasks ({active.length})</h2>
          {active.length > 0 && (
            <span className="badge badge-target" style={{ fontSize: '0.8rem' }}>
              Auto-refreshing every 3s
            </span>
          )}
        </div>

        {active.length === 0 ? (
          <p className="empty-text" style={{ padding: '0.5rem 0' }}>
            No active deployments running in FOG. Scheduled tasks will appear here and track each PC independently.
          </p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Task Type</th>
                  <th>Target Host</th>
                  <th>Image Name</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Elapsed Time</th>
                  <th>Started (IST)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {active.map((t) => (
                  <tr key={t.id || t.host_id}>
                    <td>
                      <span className={`badge ${t.task_type === 'Image Capture' ? 'badge-capture' : 'badge-deploy'}`}>
                        {t.task_type || 'Deployment'}
                      </span>
                    </td>
                    <td>
                      <strong>{t.host_name}</strong>
                      <div className="text-muted" style={{ fontSize: '0.8rem' }}><code>{t.host_mac}</code></div>
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
                          <div style={{ width: '90px', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${t.percent || 15}%`, height: '100%', background: '#2563eb' }}></div>
                          </div>
                          <span>{t.percent ? `${t.percent}%` : 'Cloning...'}</span>
                        </div>
                      ) : (
                        <span className="text-muted" style={{ fontSize: '0.85rem' }}>Waiting for PXE boot</span>
                      )}
                    </td>
                    <td><strong>{formatDuration(t.elapsed_seconds)}</strong></td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {formatIST(t.started_at || t.created_at)}
                    </td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setCancelTarget(t)}
                      >
                        Cancel Task
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Target Computer Selection and Image Selection */}
      <div className="deploy-grid">
        {/* Step 1: Target Computers */}
        <div className="section">
          <div className="section-header">
            <h2>1. Select Target Computer(s) ({sel.size}/{hosts.length})</h2>
            <button className="btn btn-secondary btn-sm" onClick={selectAll}>
              {sel.size === hosts.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          {hosts.length === 0 ? (
            <p className="empty-text">No target computers registered. Register computers first.</p>
          ) : (
            <div className="host-list">
              {hosts.map((h) => (
                <label
                  key={h.id}
                  className={`host-item ${sel.has(h.id) ? 'selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={sel.has(h.id)}
                    onChange={() => toggle(h.id)}
                  />
                  <div className="host-info">
                    <strong>
                      {h.name} {h.is_master ? <span className="badge badge-master" style={{ marginLeft: '0.4rem', fontSize: '0.7rem' }}>Master PC</span> : null}
                    </strong>
                    <span className="host-mac">{h.mac}</span>
                    {h.ip && <span className="host-ip">{h.ip}</span>}
                  </div>
                </label>
              ))}
            </div>
          )}

          {sel.size > 0 && (
            <div className="wol-section" style={{ marginTop: '1rem' }}>
              <button
                className="btn btn-secondary"
                onClick={handleWOL}
                disabled={wolSending}
              >
                {wolSending ? 'Sending Magic Packet...' : `Send Wake-on-LAN (${sel.size} PCs)`}
              </button>
              {wolResult && (
                <div className="wol-note" style={{ marginTop: '0.5rem' }}>
                  <p>Magic packet sent to {wolResult.sent?.length || 0} PC(s).</p>
                  <p className="text-muted" style={{ fontSize: '0.8rem' }}>{wolResult.note}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 2: Image Selection */}
        <div className="section">
          <h2>2. Select Operating System Image</h2>
          {images.length === 0 ? (
            <p className="empty-text">No usable images found. Capture an image from Master PC first.</p>
          ) : (
            <div className="image-list">
              {images.map((img) => (
                <label
                  key={img.id}
                  className={`image-item ${
                    String(selImg) === String(img.id) ? 'selected' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="image"
                    value={img.id}
                    checked={String(selImg) === String(img.id)}
                    onChange={(e) => setSelImg(e.target.value)}
                  />
                  <div className="image-info">
                    <strong>{img.name}</strong>
                    <span className="image-size" style={{ fontWeight: 600, color: '#059669' }}>
                      {img.size_gb || img.size || 'Ready'}
                    </span>
                    {img.description && <span className="text-muted" style={{ fontSize: '0.8rem' }}>{img.description}</span>}
                  </div>
                </label>
              ))}
            </div>
          )}

          <button
            className="btn btn-primary btn-full"
            onClick={handleDeploy}
            disabled={deploying || sel.size === 0 || !selImg}
            style={{ marginTop: '1.25rem', height: '48px', fontSize: '1rem' }}
          >
            {deploying
              ? 'Scheduling Deployment in FOG...'
              : `Deploy Image to ${sel.size} Selected PC(s)`}
          </button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <ConfirmDialog
          title="Confirm Destructive Image Deployment"
          message="WARNING: This operation will completely OVERWRITE the hard drives and all files on the selected computers."
          details={
            <div>
              <p><strong>Deployment Image:</strong> {selImgName}</p>
              <p><strong>Target Computers ({selNames.length}):</strong></p>
              <ul>
                {selNames.map((n) => (
                  <li key={n}><strong>{n}</strong></li>
                ))}
              </ul>
              <p className="text-danger" style={{ marginTop: '0.75rem', fontWeight: 'bold' }}>
                Each computer will automatically clone this image upon its next network (PXE) boot.
              </p>
            </div>
          }
          confirmText="Confirm & Deploy"
          danger
          onConfirm={confirmDeploy}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {/* Cancellation Dialog */}
      {cancelTarget && (
        <ConfirmDialog
          title="Cancel Active Task"
          message={`Are you sure you want to cancel the task for '${cancelTarget.host_name}'?`}
          details={
            <div>
              <p>Host: <strong>{cancelTarget.host_name}</strong></p>
              <p>Image: <strong>{cancelTarget.image_name}</strong></p>
              <p className="text-muted" style={{ marginTop: '0.5rem' }}>
                The task will be marked as Cancelled in history, and the computer can be redeployed immediately whenever ready.
              </p>
            </div>
          }
          confirmText="Cancel Task"
          danger
          onConfirm={() => handleCancelTask(cancelTarget.host_id)}
          onCancel={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
}
