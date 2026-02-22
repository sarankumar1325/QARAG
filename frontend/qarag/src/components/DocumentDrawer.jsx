import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Link, FileText, Globe, Trash2, Plus, Loader2, Check } from 'lucide-react';
import { api } from '../services/api';

function DocumentDrawer({ thread, onUpdateThread, onClose }) {
  const [mode, setMode] = useState(null); // null, 'file', 'url'
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);

  // Check for reduced motion preference
  const prefersReducedMotion = useMemo(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  }, []);

  // Poll for document status updates when documents are processing
  useEffect(() => {
    if (!thread) return;

    const documents = thread.documents || [];
    const processingDocs = documents.filter(d => d.status === 'processing');

    if (processingDocs.length === 0) return;

    const pollInterval = setInterval(async () => {
      for (const doc of processingDocs) {
        try {
          const updated = await api.getDocument(doc.id);
          // Update the document in the thread
          const updatedDocs = documents.map(d =>
            d.id === doc.id ? { ...d, ...updated } : d
          );
          onUpdateThread(thread.id, { documents: updatedDocs });
        } catch (err) {
          console.error('Failed to poll document status:', err);
        }
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [thread?.documents]);

  if (!thread) return null;

  const documents = thread.documents || [];

  const handleFile = async (file) => {
    setError('');
    setUploading(true);

    try {
      const result = await api.uploadDocument(file);
      // Add doc to thread
      const newDoc = {
        id: result.id,
        filename: result.filename,
        doc_type: result.doc_type,
        status: result.status,
        chunk_count: result.chunk_count,
      };
      const updatedDocs = [...documents, newDoc];
      const updatedDocIds = [...(thread.documentIds || []), result.id];

      onUpdateThread(thread.id, {
        documents: updatedDocs,
        documentIds: updatedDocIds,
      });

      // Update thread title if first doc
      if (documents.length === 0) {
        onUpdateThread(thread.id, {
          title: result.filename.replace(/\.[^/.]+$/, '')
        });
      }

      setMode(null);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleUrlSubmit = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;

    setError('');
    setUploading(true);

    try {
      const result = await api.uploadUrl(url);
      const newDoc = {
        id: result.id,
        filename: url,
        doc_type: 'html',
        status: result.status,
      };
      const updatedDocs = [...documents, newDoc];
      const updatedDocIds = [...(thread.documentIds || []), result.id];

      onUpdateThread(thread.id, {
        documents: updatedDocs,
        documentIds: updatedDocIds,
      });

      setUrl('');
      setMode(null);
    } catch (err) {
      setError(err.message || 'Failed to add URL');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId) => {
    if (!confirm('Remove this document from chat?')) return;

    const updatedDocs = documents.filter(d => d.id !== docId);
    const updatedDocIds = (thread.documentIds || []).filter(id => id !== docId);

    onUpdateThread(thread.id, {
      documents: updatedDocs,
      documentIds: updatedDocIds,
    });
  };

  // Micro-animation variants
  const buttonVariants = {
    whileHover: { scale: 1.05 },
    whileTap: { scale: 0.95 }
  };

  const springTransition = {
    type: 'spring',
    stiffness: 400,
    damping: 17
  };

  return (
    <div className="document-drawer-inner">
      {/* Drawer Header */}
      <div className="drawer-header">
        <h2>Documents</h2>
        <div className="drawer-header-actions">
          <motion.button
            className="icon-btn"
            onClick={() => setMode('file')}
            title="Upload file"
            variants={buttonVariants}
            whileHover={{ scale: 1.1, rotate: -10 }}
            whileTap={{ scale: 0.9 }}
            transition={springTransition}
          >
            <Upload size={18} />
          </motion.button>
          <motion.button
            className="icon-btn"
            onClick={() => setMode('url')}
            title="Add URL"
            variants={buttonVariants}
            whileHover={{ scale: 1.1, rotate: 10 }}
            whileTap={{ scale: 0.9 }}
            transition={springTransition}
          >
            <Link size={18} />
          </motion.button>
          <motion.button
            className="icon-btn"
            onClick={onClose}
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            transition={springTransition}
          >
            <X size={18} />
          </motion.button>
        </div>
      </div>

      {/* Upload Mode */}
      <AnimatePresence>
        {mode && (
          <motion.div
            className="upload-mode"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <motion.button
              className="upload-mode-back"
              onClick={() => setMode(null)}
              whileHover={{ x: -3 }}
              whileTap={{ x: 0 }}
              transition={{ duration: 0.15 }}
            >
              ← Back
            </motion.button>

            <AnimatePresence>
              {error && (
                <motion.div
                  className="upload-error"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {mode === 'file' ? (
              <motion.div
                className={`drop-zone ${dragActive ? 'active' : ''} ${uploading ? 'uploading' : ''}`}
                onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.pdf,.docx,.md,.txt';
                  input.onchange = (e) => e.target.files?.[0] && handleFile(e.target.files[0]);
                  input.click();
                }}
                whileHover={{ scale: 1.01, borderColor: 'var(--color-ink)' }}
                whileTap={{ scale: 0.99 }}
                transition={{ duration: 0.2 }}
              >
                {uploading ? (
                  <motion.div
                    className="upload-state"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Loader2 size={32} className="spin" />
                    <p>Processing...</p>
                  </motion.div>
                ) : (
                  <div className="upload-state">
                    <motion.div
                      animate={dragActive ? { scale: 1.1, rotate: 5 } : { scale: 1, rotate: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Upload size={32} />
                    </motion.div>
                    <p>Drop a file or click to browse</p>
                    <span>PDF, DOCX, MD, TXT</span>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.form
                className="url-form"
                onSubmit={handleUrlSubmit}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                <input
                  type="url"
                  className="input"
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={uploading}
                />
                <motion.button
                  type="submit"
                  className="btn btn-primary"
                  disabled={uploading || !url.trim()}
                  variants={buttonVariants}
                  whileHover={{ scale: uploading || !url.trim() ? 1 : 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={springTransition}
                >
                  {uploading ? <Loader2 size={16} className="spin" /> : 'Add'}
                </motion.button>
              </motion.form>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Documents List */}
      <div className="drawer-documents">
        {documents.length === 0 ? (
          <motion.div
            className="drawer-empty"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <FileText size={48} />
            </motion.div>
            <h3>No documents yet</h3>
            <p>Upload documents to ask questions about them</p>
            <motion.button
              className="btn btn-primary"
              onClick={() => setMode('file')}
              variants={buttonVariants}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={springTransition}
            >
              <Plus size={16} />
              Upload Document
            </motion.button>
          </motion.div>
        ) : (
          <div className="doc-list">
            {documents.map((doc, index) => (
              <motion.div
                key={doc.id}
                className="doc-card"
                initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 100 }}
                transition={{
                  delay: prefersReducedMotion ? 0 : index * 0.05,
                  duration: 0.2
                }}
                whileHover={{ x: 4, borderColor: 'var(--color-ink)' }}
                layout="position"
              >
                <motion.div
                  className="doc-card-icon"
                  whileHover={{ rotate: 10, scale: 1.1 }}
                  transition={{ duration: 0.2 }}
                >
                  {doc.doc_type === 'html' ? <Globe size={18} /> : <FileText size={18} />}
                </motion.div>
                <div className="doc-card-info">
                  <div className="doc-card-name">{doc.filename}</div>
                  <div className="doc-card-meta">
                    <motion.span
                      className={`status-badge ${doc.status === 'completed' ? 'done' : 'processing'}`}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                    >
                      {doc.status === 'completed' ? <Check size={10} /> : null}
                      {doc.status}
                    </motion.span>
                    {doc.chunk_count > 0 && (
                      <span>{doc.chunk_count} chunks</span>
                    )}
                  </div>
                </div>
                <motion.button
                  className="doc-card-delete"
                  onClick={() => handleDelete(doc.id)}
                  title="Remove from chat"
                  whileHover={{ scale: 1.2, color: '#ff3d00', rotate: 10 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                >
                  <Trash2 size={14} />
                </motion.button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default DocumentDrawer;
