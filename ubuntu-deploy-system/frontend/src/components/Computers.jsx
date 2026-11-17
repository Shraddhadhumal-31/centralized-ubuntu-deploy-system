import React, { useState, useEffect } from 'react';
import { api } from '../api';
import ConfirmDialog from './ConfirmDialog';

export default function Computers() {
  const [hosts, setHosts] = useState([]);
  const [masterHost, setMasterHost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOk, setFormOk] = useState('');
  const [formErr, setFormErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Active section tab: 'client' or 'master'
  const [activeTab, setActiveTab] = useState('client');

  // Client registration mode: 'single' or 'multi'
  const [clientMode, setClientMode] = useState('single');

  // Master PC form
  const [masterForm, setMasterForm] = useState({ hostname: '', mac: '' });

  // Single Client PC form
  const [singleForm, setSingleForm] = useState({ hostname: '', mac: '' });

  // Multi Client PC form rows
  const [multiRows, setMultiRows] = useState([
    { id: 1, hostname: '', mac: '' },
    { id: 2, hostname: '', mac: '' },
  ]);

  const fetchHosts = async () => {
    try {
      const [compRes, masterRes] = await Promise.all([
        api.getComputers(),
        api.getMasterPC().catch(() => ({ master_host: null })),
      ]);
      setHosts(compRes.hosts || []);
      const m = masterRes.master_host || null;
      setMasterHost(m);
      if (m && !masterForm.hostname) {
        setMasterForm({ hostname: m.name || '', mac: m.mac || '' });
      }
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHosts();
  }, []);

  const formatMAC = (val) => {
    const clean = val.toUpperCase().replace(/[^A-F0-9]/g, '');
    const parts = clean.match(/.{1,2}/g) || [];
    return parts.slice(0, 6).join(':');
  };

  const handleMasterMACChange = (e) => {
    setMasterForm({ ...masterForm, mac: formatMAC(e.target.value) });
  };

  const handleSingleMACChange = (e) => {
    setSingleForm({ ...singleForm, mac: formatMAC(e.target.value) });
  };

  const handleMultiRowChange = (index, field, value) => {
    const updated = [...multiRows];
    if (field === 'mac') {
      updated[index][field] = formatMAC(value);
    } else {
      updated[index][field] = value;
    }
    setMultiRows(updated);
  };

  const addMultiRow = () => {
    setMultiRows([...multiRows, { id: Date.now(), hostname: '', mac: '' }]);
  };

  const removeMultiRow = (index) => {
    if (multiRows.length <= 1) return;
    setMultiRows(multiRows.filter((_, i) => i !== index));
  };

  // Submit Master PC Registration
  const handleRegisterMaster = async (e) => {
    e.preventDefault();
    setFormErr('');
    setFormOk('');

    if (!masterForm.hostname.trim()) {
      setFormErr('Master Hostname is required (e.g. ubuntu-master)');
      return;
    }
    if (masterForm.mac.length !== 17) {
      setFormErr('Full 12-character MAC address is required (e.g. AA:BB:CC:DD:EE:FF)');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.registerMasterPC(masterForm.hostname.trim(), masterForm.mac.trim());
      setFormOk(res.message || `Master PC '${masterForm.hostname}' registered successfully!`);
      await fetchHosts();
    } catch (err) {
      setFormErr(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Single Client Registration
  const handleSingleRegister = async (e) => {
    e.preventDefault();
    setFormErr('');
    setFormOk('');

    if (!singleForm.hostname.trim()) {
      setFormErr('Hostname is required');
      return;
    }
    if (singleForm.mac.length !== 17) {
      setFormErr('Full 12-character MAC address is required (e.g. AA:BB:CC:DD:EE:FF)');
      return;
    }

    setSubmitting(true);
    try {
      const r = await api.registerComputer(
        singleForm.hostname.trim(),
        singleForm.mac.trim(),
        0,
        'client'
      );
      setFormOk(r.message || `Client PC '${singleForm.hostname}' registered successfully!`);
      setSingleForm({ hostname: '', mac: '' });
      await fetchHosts();
    } catch (err) {
      setFormErr(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Batch Client Registration
  const handleMultiRegister = async (e) => {
    e.preventDefault();
    setFormErr('');
    setFormOk('');

    const validRows = multiRows.filter(
      (r) => r.hostname.trim() && r.mac.trim().length === 17
    );

    if (validRows.length === 0) {
      setFormErr('Please enter at least one client with a valid Hostname and 12-character MAC address.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = validRows.map((r) => ({
        hostname: r.hostname.trim(),
        mac: r.mac.trim(),
        role: 'client',
      }));
      const res = await api.batchRegisterComputers(payload);

      const succ = res.succeeded || [];
      const fail = res.failed || [];

      if (succ.length > 0 && fail.length === 0) {
        setFormOk(`Successfully registered ${succ.length} client computer(s): ${succ.map((s) => s.hostname).join(', ')}`);
        setMultiRows([
          { id: 1, hostname: '', mac: '' },
          { id: 2, hostname: '', mac: '' },
        ]);
      } else if (succ.length > 0 && fail.length > 0) {
        setFormOk(`Registered ${succ.length} PC(s): ${succ.map((s) => s.hostname).join(', ')}`);
        setFormErr(`Errors on ${fail.length} PC(s):\n${fail.map((f) => `${f.hostname}: ${f.error}`).join('\n')}`);
      } else {
        setFormErr(`Failed to register PCs:\n${fail.map((f) => `${f.hostname}: ${f.error}`).join('\n')}`);
      }
    } catch (err) {
      setFormErr(err.message);
    } finally {
      setSubmitting(false);
      await fetchHosts();
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setError('');
    try {
      await api.deleteComputer(deleteTarget.id);
      setDeleteTarget(null);
      await fetchHosts();
    } catch (err) {
      setError(err.message);
      setDeleteTarget(null);
    }
  };

  if (loading) return <div className="page-loading">Loading computers...</div>;

  return (
    <div className="computers-page">
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h1>Computer Management</h1>
          <p className="text-muted" style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Separate registration for Master PC (Golden Image Source) and Client Workstations
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchHosts}>Refresh List</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Primary Tab Selector: Master PC vs Client Workstations */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem' }}>
        <button
          type="button"
          className={`btn ${activeTab === 'master' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setActiveTab('master'); setFormErr(''); setFormOk(''); }}
          style={{ fontWeight: 600 }}
        >
          ★ Master PC Registration
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'client' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setActiveTab('client'); setFormErr(''); setFormOk(''); }}
          style={{ fontWeight: 600 }}
        >
          💻 Client PC Registration
        </button>
      </div>

      {formErr && <div className="alert alert-error" style={{ whiteSpace: 'pre-line', marginBottom: '1rem' }}>{formErr}</div>}
      {formOk && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{formOk}</div>}

      {/* 1. SEPARATE MASTER PC REGISTRATION */}
      {activeTab === 'master' && (
        <div className="section" style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#1e293b' }}>
              Register Master PC
            </h2>
            {masterHost && (
              <span className="badge badge-master" style={{ fontSize: '0.8rem' }}>
                Current Master: {masterHost.name} ({masterHost.mac})
              </span>
            )}
          </div>

          <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
            Enter the Hostname and MAC Address of your Master PC. This designated machine serves as the golden source PC for image capture.
          </p>

          <form onSubmit={handleRegisterMaster} className="register-form">
            <div className="form-row" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: '220px' }}>
                <label><strong>Master Hostname *</strong> <span className="text-muted">(e.g. ubuntu-master)</span></label>
                <input
                  type="text"
                  value={masterForm.hostname}
                  onChange={(e) => setMasterForm({ ...masterForm, hostname: e.target.value })}
                  placeholder="e.g. ubuntu-master"
                  required
                />
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: '240px' }}>
                <label><strong>Master MAC Address *</strong> <span className="text-muted">(12 hex digits)</span></label>
                <input
                  type="text"
                  value={masterForm.mac}
                  onChange={handleMasterMACChange}
                  placeholder="e.g. AA:BB:CC:DD:EE:FF"
                  maxLength={17}
                  required
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
                style={{ alignSelf: 'flex-end', height: '42px', minWidth: '180px' }}
              >
                {submitting ? 'Saving...' : 'Set as Master PC'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. SEPARATE CLIENT PC REGISTRATION */}
      {activeTab === 'client' && (
        <div className="section" style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#1e293b' }}>
              Register Client Workstation(s)
            </h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className={`btn btn-sm ${clientMode === 'single' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setClientMode('single'); setFormErr(''); setFormOk(''); }}
              >
                Single Client
              </button>
              <button
                type="button"
                className={`btn btn-sm ${clientMode === 'multi' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setClientMode('multi'); setFormErr(''); setFormOk(''); }}
              >
                Batch / Multiple Clients
              </button>
            </div>
          </div>

          <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
            Register target client computers in the lab that will receive cloned images during deployment.
          </p>

          {clientMode === 'single' ? (
            <form onSubmit={handleSingleRegister} className="register-form">
              <div className="form-row" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 1, minWidth: '220px' }}>
                  <label><strong>Client Hostname *</strong> <span className="text-muted">(e.g. pc-lab-01)</span></label>
                  <input
                    type="text"
                    value={singleForm.hostname}
                    onChange={(e) => setSingleForm({ ...singleForm, hostname: e.target.value })}
                    placeholder="e.g. pc-lab-01"
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: '240px' }}>
                  <label><strong>Client MAC Address *</strong> <span className="text-muted">(12 hex digits)</span></label>
                  <input
                    type="text"
                    value={singleForm.mac}
                    onChange={handleSingleMACChange}
                    placeholder="e.g. AA:BB:CC:DD:EE:FF"
                    maxLength={17}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                  style={{ alignSelf: 'flex-end', height: '42px', minWidth: '160px' }}
                >
                  {submitting ? 'Registering...' : 'Register Client PC'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleMultiRegister}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                {multiRows.map((row, index) => (
                  <div key={row.id || index} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, color: '#64748b', width: '30px' }}>#{index + 1}</span>
                    <input
                      type="text"
                      value={row.hostname}
                      onChange={(e) => handleMultiRowChange(index, 'hostname', e.target.value)}
                      placeholder={`Hostname: e.g. pc-lab-${index + 1 < 10 ? '0' : ''}${index + 1}`}
                      style={{ flex: 1, minWidth: '160px', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                    <input
                      type="text"
                      value={row.mac}
                      onChange={(e) => handleMultiRowChange(index, 'mac', e.target.value)}
                      placeholder="MAC: e.g. AA:BB:CC:DD:EE:FF"
                      maxLength={17}
                      style={{ flex: 1, minWidth: '200px', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => removeMultiRow(index)}
                      disabled={multiRows.length <= 1}
                      style={{ padding: '0.5rem 0.75rem' }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={addMultiRow}
                >
                  + Add Another Client Row
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                  style={{ minWidth: '180px', height: '40px' }}
                >
                  {submitting ? 'Registering...' : `Register ${multiRows.filter((r) => r.hostname.trim()).length || ''} Clients`}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Registered Computers Table */}
      <div className="section">
        <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>All Registered Computers ({hosts.length})</h2>
          <span className="text-muted" style={{ fontSize: '0.85rem' }}>
            Lab machines registered in FOG
          </span>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Hostname</th>
                <th>MAC Address</th>
                <th>IP Address</th>
                <th>Role</th>
                <th>Assigned Image</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {hosts.map((h) => (
                <tr key={h.id} className={h.is_master ? 'row-master' : ''}>
                  <td>{h.id}</td>
                  <td>
                    <strong>{h.name}</strong>
                  </td>
                  <td><code>{h.mac}</code></td>
                  <td>{h.ip || '—'}</td>
                  <td>
                    {h.is_master ? (
                      <span className="badge badge-master">★ Master PC</span>
                    ) : (
                      <span className="badge badge-target">Client PC</span>
                    )}
                  </td>
                  <td>{h.imageName || 'Ubuntu_Master'}</td>
                  <td>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setDeleteTarget(h)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {hosts.length === 0 && (
                <tr>
                  <td colSpan="7" className="empty-text">No computers registered yet. Use the tabs above to register your Master PC and Client workstations.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <ConfirmDialog
          title="Remove Computer from FOG"
          message={`Are you sure you want to remove '${deleteTarget.name}' (${deleteTarget.mac})?`}
          details={
            <div>
              <p>Host ID: <strong>{deleteTarget.id}</strong></p>
              <p>MAC Address: <code>{deleteTarget.mac}</code></p>
              <p className="text-danger" style={{ marginTop: '0.5rem' }}>
                This removes the computer registration from FOG and the local database.
              </p>
            </div>
          }
          confirmText="Remove Computer"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
