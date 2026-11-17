import React, { useState, useEffect } from 'react';
import { api } from '../api';
import ConfirmDialog from './ConfirmDialog';

export default function Images() {
  const [images, setImages] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Capture mode: 'new' or 'existing'
  const [captureMode, setCaptureMode] = useState('new');
  const [captureHostId, setCaptureHostId] = useState('');
  const [captureNewName, setCaptureNewName] = useState('');
  const [captureExistingId, setCaptureExistingId] = useState('');
  const [capturing, setCapturing] = useState(false);

  // Definition placeholder form
  const [newDefName, setNewDefName] = useState('');
  const [newDefDesc, setNewDefDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchData = async () => {
    try {
      const [imgs, comp] = await Promise.all([api.getImages(), api.getComputers()]);
      const imgList = imgs.images || [];
      const hList = comp.hosts || [];
      setImages(imgList);
      setHosts(hList);

      // Default source to master PC
      const master = hList.find((h) => h.is_master);
      if (master) {
        setCaptureHostId(String(master.id));
      } else if (hList.length > 0) {
        setCaptureHostId(String(hList[0].id));
      }

      if (imgList.length > 0 && !captureExistingId) {
        setCaptureExistingId(String(imgList[0].id));
      }
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCaptureImage = async (e) => {
    e.preventDefault();
    if (!captureHostId) {
      setError('Please select a source computer (Master PC) to capture from');
      return;
    }

    let targetImgId = null;
    let targetNewName = null;

    if (captureMode === 'new') {
      if (!captureNewName.trim()) {
        setError('Please enter a name for the new image (e.g. Ubuntu_Master_v2)');
        return;
      }
      targetNewName = captureNewName.trim();
    } else {
      if (!captureExistingId) {
        setError('Please select an existing image definition to capture into');
        return;
      }
      targetImgId = Number(captureExistingId);
    }

    setCapturing(true);
    setError('');
    setSuccess('');

    try {
      const res = await api.captureImage(Number(captureHostId), targetImgId, targetNewName);
      setSuccess(res.message || 'Capture task created! Now reboot the Master PC into network PXE to begin capture.');
      setCaptureNewName('');
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setCapturing(false);
    }
  };

  const handleCreateDefinition = async (e) => {
    e.preventDefault();
    if (!newDefName.trim()) {
      setError('Image Name is required');
      return;
    }
    setCreating(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.createImage(newDefName.trim(), '', newDefDesc.trim());
      setSuccess(res.message || 'Image definition registered successfully in FOG');
      setNewDefName('');
      setNewDefDesc('');
      await fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setError('');
    setSuccess('');
    try {
      await api.deleteImage(deleteTarget.id);
      setSuccess(`Image '${deleteTarget.name}' deleted successfully from FOG.`);
      setDeleteTarget(null);
      await fetchData();
    } catch (err) {
      setError(err.message);
      setDeleteTarget(null);
    }
  };

  if (loading) return <div className="page-loading">Loading images...</div>;

  return (
    <div className="images-page">
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h1>Image Management</h1>
          <p className="text-muted" style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Capture golden master images, check image sizes in GB, and manage deployment templates
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchData}>Refresh</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Primary Section: Capture from Master PC */}
      <div className="section" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', color: '#1e293b' }}>Capture (Create) Image from Master PC</h2>
        <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
          <strong>Workflow:</strong> 1. Schedule the capture task below. 2. Reboot your Master PC into network PXE boot. FOG's Partclone engine will capture all partitions into the server repository.
        </p>

        <form onSubmit={handleCaptureImage}>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {/* Step 1: Source Host */}
            <div className="form-group" style={{ flex: 1, minWidth: '280px' }}>
              <label><strong>1. Source Computer *</strong> <span className="text-muted">(Master PC)</span></label>
              <select
                value={captureHostId}
                onChange={(e) => setCaptureHostId(e.target.value)}
                style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}
                required
              >
                {hosts.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} {h.is_master ? '★ (Protected Master PC)' : ''} — {h.mac}
                  </option>
                ))}
              </select>
            </div>

            {/* Step 2: Destination Image */}
            <div className="form-group" style={{ flex: 1, minWidth: '280px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <label><strong>2. Destination Image *</strong></label>
                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="capMode"
                      checked={captureMode === 'new'}
                      onChange={() => setCaptureMode('new')}
                    />
                    New Image Name
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="capMode"
                      checked={captureMode === 'existing'}
                      onChange={() => setCaptureMode('existing')}
                    />
                    Existing Image
                  </label>
                </div>
              </div>

              {captureMode === 'new' ? (
                <input
                  type="text"
                  value={captureNewName}
                  onChange={(e) => setCaptureNewName(e.target.value)}
                  placeholder="e.g. Ubuntu_Master_v2"
                  required
                />
              ) : (
                <select
                  value={captureExistingId}
                  onChange={(e) => setCaptureExistingId(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}
                  required
                >
                  {images.map((img) => (
                    <option key={img.id} value={img.id}>
                      {img.name} (Size: {img.size_gb || img.size || '—'})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={capturing}
              style={{ alignSelf: 'flex-end', height: '42px', minWidth: '220px' }}
            >
              {capturing ? 'Scheduling Task in FOG...' : 'Capture Image from PC'}
            </button>
          </div>
        </form>
      </div>

      {/* Secondary Section: Register Definition Placeholder */}
      <div className="section" style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem', background: '#fff' }}>
        <h2 style={{ fontSize: '1.05rem', color: '#334155' }}>Register Blank Image Definition</h2>
        <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Pre-create an image definition name in FOG ahead of time without scheduling an active capture task right now.
        </p>
        <form onSubmit={handleCreateDefinition}>
          <div className="form-row" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div className="form-group" style={{ flex: 1, minWidth: '220px' }}>
              <label><strong>Image Name *</strong> <span className="text-muted">(e.g. Ubuntu_Lab_Base)</span></label>
              <input
                type="text"
                value={newDefName}
                onChange={(e) => setNewDefName(e.target.value)}
                placeholder="e.g. Ubuntu_Lab_Base"
                required
              />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: '220px' }}>
              <label>Description <span className="text-muted">(Optional notes)</span></label>
              <input
                type="text"
                value={newDefDesc}
                onChange={(e) => setNewDefDesc(e.target.value)}
                placeholder="e.g. Ubuntu 24.04 with GCC, Python & VSCode"
              />
            </div>
            <button
              type="submit"
              className="btn btn-secondary"
              disabled={creating}
              style={{ alignSelf: 'flex-end', height: '42px', minWidth: '180px' }}
            >
              {creating ? 'Registering...' : 'Register Definition'}
            </button>
          </div>
        </form>
      </div>

      {/* Images List Table */}
      <div className="section">
        <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Registered FOG Images ({images.length})</h2>
          <span className="text-muted" style={{ fontSize: '0.8rem' }}>
            * Incomplete or pending images are excluded from Deployments to prevent deploying uncaptured images.
          </span>
        </div>
        {images.length === 0 ? (
          <p className="empty-text">No images found on FOG server. Use the capture form above to create your first image.</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Image Name</th>
                  <th>Storage Path</th>
                  <th>Size in GB</th>
                  <th>Status</th>
                  <th>Description</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {images.map((img) => (
                  <tr key={img.id}>
                    <td>{img.id}</td>
                    <td><strong>{img.name}</strong></td>
                    <td><code>{img.path || img.name}</code></td>
                    <td>
                      <strong>{img.size_gb || img.size || '—'}</strong>
                    </td>
                    <td>
                      {img.is_usable ? (
                        <span className="badge badge-success" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                          ✓ Ready for Deploy
                        </span>
                      ) : img.status === 'capturing' ? (
                        <span className="badge" style={{ background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                          📸 Capturing...
                        </span>
                      ) : (
                        <span className="badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem' }}>
                          ⚠ Incomplete / Pending Capture
                        </span>
                      )}
                    </td>
                    <td>{img.description || '—'}</td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setDeleteTarget(img)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Image from FOG"
          message={`Are you sure you want to permanently delete '${deleteTarget.name}'?`}
          details={
            <div>
              <p>Image ID: <strong>{deleteTarget.id}</strong></p>
              <p>Storage Path: <code>{deleteTarget.path}</code></p>
              <p className="text-danger">
                This removes the image record from FOG. Any client PCs assigned this image will need a new image selected.
              </p>
            </div>
          }
          confirmText="Delete Image"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
