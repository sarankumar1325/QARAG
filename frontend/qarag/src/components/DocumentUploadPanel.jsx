import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Upload, X, Check, Loader2, AlertCircle, File, Globe, Link2, Plus } from 'lucide-react';
import { api } from '../services/api';

function DocumentUploadPanel({ thread, onUpdateThread, onClose }) {
  const [uploading, setUploading] = useState(false);
  const [uploadMode, setUploadMode] = useState('file');
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [addingUrl, setAddingUrl] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeUploadLabel, setActiveUploadLabel] = useState('');
  const fileInputRef = useRef(null);
  const dragTimeoutRef = useRef(null);

  const documents = thread?.documents || [];
  const processingCount = documents.filter((d) => d.status === 'processing').length;
  const readyCount = documents.filter((d) => d.status === 'completed').length;

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Poll status for processing documents while panel is open
  useEffect(() => {
    if (!thread) return;

    const processingDocs = documents.filter((d) => d.status === 'processing');
    if (processingDocs.length === 0) return;

    let cancelled = false;

    const pollStatus = async () => {
      const updates = await Promise.all(
        processingDocs.map(async (doc) => {
          try {
            const updated = await api.getDocument(doc.id);
            return { docId: doc.id, updated };
          } catch (err) {
            console.error('Failed to refresh document status:', err);
            return null;
          }
        })
      );

      if (cancelled) return;

      const updateById = new Map(
        updates
          .filter(Boolean)
          .map((entry) => [entry.docId, entry.updated])
      );
      if (updateById.size === 0) return;

      const updatedDocs = documents.map((doc) => (
        updateById.has(doc.id) ? { ...doc, ...updateById.get(doc.id) } : doc
      ));
      onUpdateThread(thread.id, { documents: updatedDocs });
    };

    pollStatus().catch((err) => {
      console.error('Document status poll failed:', err);
    });
    const timer = setInterval(() => {
      pollStatus().catch((err) => {
        console.error('Document status poll failed:', err);
      });
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [documents, onUpdateThread, thread?.id]);

  const attachDocumentToThread = (result, fallbackFilename) => {
    const name = result.filename || fallbackFilename || 'Document';
    const newDoc = {
      id: result.id,
      filename: name,
      doc_type: result.doc_type,
      status: result.status,
      chunk_count: result.chunk_count || 0,
    };

    const updatedDocs = [...documents, newDoc];
    const updatedDocIds = [...(thread.documentIds || []), result.id];

    onUpdateThread(thread.id, {
      documents: updatedDocs,
      documentIds: updatedDocIds,
    });

    if (documents.length === 0) {
      onUpdateThread(thread.id, {
        title: name.replace(/\.[^/.]+$/, ''),
      });
    }
  };

  const handleFile = async (file) => {
    setError('');
    setUploading(true);
    setUploadProgress(0);
    setActiveUploadLabel(file.name || 'document');

    // Simulate progress
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => Math.min(prev + 10, 90));
    }, 200);

    try {
      const result = await api.uploadDocument(file);
      clearInterval(progressInterval);
      setUploadProgress(100);
      attachDocumentToThread(result, file.name);

      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
        setActiveUploadLabel('');
      }, 500);
    } catch (err) {
      clearInterval(progressInterval);
      setError(err.message || 'Upload failed. Please try again.');
      setUploading(false);
      setUploadProgress(0);
      setActiveUploadLabel('');
    }
  };

  const handleUrlSubmit = async (e) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setError('');
    setAddingUrl(true);

    try {
      const result = await api.uploadUrl(urlInput.trim());
      attachDocumentToThread(result, urlInput.trim());
      setUrlInput('');
    } catch (err) {
      setError(err.message || 'Failed to add URL. Please check the link and try again.');
    } finally {
      setAddingUrl(false);
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

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current);
    }

    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();

    dragTimeoutRef.current = setTimeout(() => {
      setDragActive(false);
    }, 100);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDelete = (docId) => {
    const updatedDocs = documents.filter(d => d.id !== docId);
    const updatedDocIds = (thread.documentIds || []).filter(id => id !== docId);

    onUpdateThread(thread.id, {
      documents: updatedDocs,
      documentIds: updatedDocIds,
    });
  };

  const getFileIcon = (docType) => {
    switch (docType) {
      case 'pdf':
        return <FileText size={18} />;
      case 'html':
        return <Globe size={18} />;
      default:
        return <File size={18} />;
    }
  };

  const getFileTypeLabel = (docType) => {
    switch (docType) {
      case 'pdf':
        return 'PDF';
      case 'docx':
        return 'DOCX';
      case 'html':
        return 'Webpage';
      case 'markdown':
      case 'md':
        return 'Markdown';
      case 'text':
      case 'txt':
        return 'Text';
      default:
        return 'Document';
    }
  };

  return (
    <div className="doc-upload-panel">
      <div className="doc-upload-header">
        <div className="doc-upload-title">
          <FileText size={18} />
          <span>Documents</span>
          <span className="doc-count-badge">{documents.length}</span>
        </div>
        <div className="doc-upload-counts">
          <span className="doc-count ready">{readyCount} ready</span>
          <span className="doc-count processing">{processingCount} processing</span>
        </div>
        <motion.button
          className="icon-btn-close"
          onClick={onClose}
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          transition={{ duration: 0.15 }}
        >
          <X size={18} />
        </motion.button>
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="doc-upload-error"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="doc-upload-modes" role="tablist" aria-label="Upload mode">
        <button
          type="button"
          className={`doc-upload-mode ${uploadMode === 'file' ? 'active' : ''}`}
          onClick={() => setUploadMode('file')}
        >
          <Upload size={14} />
          <span>File</span>
        </button>
        <button
          type="button"
          className={`doc-upload-mode ${uploadMode === 'url' ? 'active' : ''}`}
          onClick={() => setUploadMode('url')}
        >
          <Link2 size={14} />
          <span>URL</span>
        </button>
      </div>

      <AnimatePresence mode="wait">
        {uploadMode === 'file' ? (
          <motion.div
            key="file"
            className={`doc-upload-zone ${dragActive ? 'drag-active' : ''} ${uploading ? 'uploading' : ''}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            whileHover={{ scale: uploading ? 1 : 1.01 }}
            whileTap={{ scale: uploading ? 1 : 0.99 }}
            transition={{ duration: 0.2 }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.md,.txt"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              style={{ display: 'none' }}
            />

            {uploading ? (
              <div className="doc-upload-state">
                <motion.div
                  className="upload-loader"
                  initial={{ rotate: 0 }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Loader2 size={28} />
                </motion.div>
                <span className="upload-text">Uploading {activeUploadLabel || 'document'}...</span>
                <div className="upload-progress-bar">
                  <motion.div
                    className="upload-progress-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            ) : (
              <div className="doc-upload-state">
                <motion.div
                  animate={dragActive ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="upload-icon"
                >
                  <Upload size={30} />
                </motion.div>
                <span className="upload-text">
                  {dragActive ? 'Drop file to attach' : 'Drag and drop a file here'}
                </span>
                <span className="upload-subtext">PDF, DOCX, Markdown, Text</span>
                <button type="button" className="upload-cta-btn">
                  <Plus size={14} />
                  Browse Files
                </button>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.form
            key="url"
            className="doc-url-form"
            onSubmit={handleUrlSubmit}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <label htmlFor="doc-url-input" className="doc-url-label">Add a webpage to this chat</label>
            <div className="doc-url-controls">
              <input
                id="doc-url-input"
                type="url"
                className="doc-url-input"
                placeholder="https://example.com/page"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                disabled={addingUrl}
              />
              <button
                type="submit"
                className="doc-url-submit"
                disabled={addingUrl || !urlInput.trim()}
              >
                {addingUrl ? <Loader2 size={14} className="spin" /> : <Link2 size={14} />}
                <span>{addingUrl ? 'Adding' : 'Add URL'}</span>
              </button>
            </div>
            <p className="doc-url-hint">Use this for online articles, docs, and help pages.</p>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="doc-upload-list-header">Attached to this chat</div>
      <div className="doc-upload-list">
        <AnimatePresence mode="popLayout">
          {documents.length === 0 ? (
            <motion.div
              key="empty"
              className="doc-upload-empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <p>No documents uploaded yet</p>
              <span>Upload a document to start asking questions</span>
            </motion.div>
          ) : (
            documents.map((doc, index) => (
              <motion.div
                key={doc.id}
                className="doc-upload-item"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: index * 0.05 }}
                layout="position"
              >
                <div className="doc-item-icon">
                  {getFileIcon(doc.doc_type)}
                </div>
                <div className="doc-item-info">
                  <div className="doc-item-name" title={doc.filename}>
                    {doc.filename}
                  </div>
                  <div className="doc-item-meta">
                    <span className="doc-type-badge">{getFileTypeLabel(doc.doc_type)}</span>
                    {doc.status === 'completed' ? (
                      <span className="doc-status success">
                        <Check size={12} />
                        Ready
                      </span>
                    ) : (
                      <span className="doc-status processing">
                        <Loader2 size={12} className="spin" />
                        Processing
                      </span>
                    )}
                  </div>
                </div>
                <motion.button
                  className="doc-item-delete"
                  onClick={() => handleDelete(doc.id)}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                >
                  <X size={16} />
                </motion.button>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default DocumentUploadPanel;
