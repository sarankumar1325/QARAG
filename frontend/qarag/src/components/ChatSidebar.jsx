import { motion, useReducedMotion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Plus, Trash2, X, Clock, Check, X as XIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

function ChatSidebar({
  threads,
  activeThreadId,
  onThreadSelect,
  onThreadDelete,
  onThreadRename,
  onNewChat,
  onCloseMobile,
  isMobile = false,
  isCollapsed = false,
  onToggleCollapse
}) {
  const prefersReducedMotion = useReducedMotion();
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [showTooltip, setShowTooltip] = useState(false);
  const inputRef = useRef(null);
  const tooltipTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const handleDelete = (e, threadId, title) => {
    e.stopPropagation();
    onThreadDelete(threadId, title);
  };

  const handleDoubleClick = (e, thread) => {
    e.stopPropagation();
    if (!isCollapsed) {
      setEditingId(thread.id);
      setEditingTitle(thread.title);
    }
  };

  const handleRenameSubmit = (e, threadId) => {
    e.preventDefault();
    if (editingTitle.trim()) {
      onThreadRename(threadId, editingTitle.trim());
    }
    setEditingId(null);
    setEditingTitle('');
  };

  const handleRenameCancel = () => {
    setEditingId(null);
    setEditingTitle('');
  };

  const handleKeyDown = (e, threadId) => {
    if (e.key === 'Enter') {
      handleRenameSubmit(e, threadId);
    } else if (e.key === 'Escape') {
      handleRenameCancel();
    }
  };

  const handleToggleMouseEnter = () => {
    if (isCollapsed) {
      tooltipTimeoutRef.current = setTimeout(() => {
        setShowTooltip(true);
      }, 300);
    }
  };

  const handleToggleMouseLeave = () => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }
    setShowTooltip(false);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return date.toLocaleDateString();
  };

  // Micro-animation variants
  const buttonVariants = {
    whileHover: { scale: 1.02 },
    whileTap: { scale: 0.97 }
  };

  const springTransition = {
    type: 'spring',
    stiffness: 400,
    damping: 17
  };

  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
  const shortcutKey = isMac ? 'Cmd + \\' : 'Ctrl + \\';

  return (
    <div className={`chat-sidebar-inner ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Sidebar Header */}
      <div className="sidebar-header">
        <AnimatePresence mode="wait">
          {!isCollapsed ? (
            <motion.h2
              key="expanded-title"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              Chats
            </motion.h2>
          ) : null}
        </AnimatePresence>

        <div className="sidebar-header-actions">
          {/* New Chat Button - hide in collapsed mode */}
          <AnimatePresence mode="wait">
            {!isCollapsed && (
              <motion.button
                key="new-chat"
                className="icon-btn"
                onClick={onNewChat}
                title="New chat"
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
              >
                <Plus size={18} />
              </motion.button>
            )}
          </AnimatePresence>

          {/* Collapse/Expand Toggle Button - Always visible */}
          {!isMobile && (
            <div className="toggle-wrapper" style={{ position: 'relative' }}>
              <motion.button
                className="collapse-toggle-btn"
                onClick={onToggleCollapse}
                onMouseEnter={handleToggleMouseEnter}
                onMouseLeave={handleToggleMouseLeave}
                title={isCollapsed ? `Expand sidebar (${shortcutKey})` : `Collapse sidebar (${shortcutKey})`}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                transition={{ duration: 0.15 }}
              >
                <motion.div
                  animate={{ rotate: isCollapsed ? 0 : 180 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                >
                  {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                </motion.div>
              </motion.button>

              {/* Tooltip for collapsed state */}
              <AnimatePresence>
                {showTooltip && isCollapsed && (
                  <motion.div
                    className="collapse-tooltip"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                  >
                    Expand sidebar
                    <kbd className="tooltip-shortcut">{shortcutKey}</kbd>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* New Chat Button - Full width (only when expanded) */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.button
            className="new-chat-btn"
            onClick={onNewChat}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Plus size={18} />
            <span>New Chat</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Threads List */}
      <div className="threads-list">
        {threads.length === 0 ? (
          !isCollapsed && (
            <motion.div
              className="sidebar-empty"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
            >
              <MessageSquare size={32} />
              <p>No chats yet</p>
            </motion.div>
          )
        ) : (
          <AnimatePresence mode="popLayout">
            {threads.map((thread, index) => {
              const isActive = thread.id === activeThreadId;
              const previewMsg = thread.messages[thread.messages.length - 1];
              const preview = previewMsg?.content || 'No messages yet';

              return (
                <motion.div
                  key={thread.id}
                  className={`thread-item ${isActive ? 'active' : ''} ${isCollapsed ? 'collapsed' : ''}`}
                  onClick={() => {
                    if (isCollapsed) {
                      // Select thread and expand sidebar when clicking an indicator.
                      onThreadSelect(thread.id);
                      onCloseMobile?.();
                      onToggleCollapse();
                    } else if (editingId !== thread.id) {
                      onThreadSelect(thread.id);
                      onCloseMobile?.();
                    }
                  }}
                  onDoubleClick={(e) => handleDoubleClick(e, thread)}
                  initial={{ opacity: isCollapsed ? 1 : 0, x: prefersReducedMotion ? 0 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  whileHover={isCollapsed ? { scale: 1.05, cursor: 'pointer' } : { scale: 1.01, backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
                  whileTap={{ scale: 0.99 }}
                  transition={{
                    ...springTransition,
                    delay: prefersReducedMotion || isCollapsed ? 0 : index * 0.03
                  }}
                  layout="position"
                >
                  {/* Thread Indicator - Shows in collapsed mode */}
                  {isCollapsed ? (
                    <motion.div
                      className="thread-indicator"
                      animate={{
                        scale: isActive ? 1 : 0.6,
                        backgroundColor: isActive ? 'var(--color-accent)' : 'rgba(255, 255, 255, 0.2)'
                      }}
                      transition={{ duration: 0.15 }}
                    />
                  ) : (
                    <>
                      <motion.div
                        className="thread-icon"
                        whileHover={{ rotate: [0, -10, 10, -10, 0] }}
                        transition={{ duration: 0.4 }}
                      >
                        <MessageSquare size={16} />
                      </motion.div>
                      <div className="thread-content">
                        {editingId === thread.id ? (
                          <form className="thread-rename-form" onSubmit={(e) => handleRenameSubmit(e, thread.id)}>
                            <input
                              ref={inputRef}
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, thread.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="thread-rename-input"
                              maxLength={50}
                            />
                            <div className="thread-rename-actions">
                              <motion.button
                                type="submit"
                                className="thread-rename-btn confirm"
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                              >
                                <Check size={12} />
                              </motion.button>
                              <motion.button
                                type="button"
                                onClick={handleRenameCancel}
                                className="thread-rename-btn cancel"
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                              >
                                <XIcon size={12} />
                              </motion.button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <div className="thread-title">{thread.title}</div>
                            <div className="thread-preview">{preview}</div>
                          </>
                        )}
                        <div className="thread-meta">
                          <Clock size={12} />
                          <span>{formatDate(thread.updatedAt)}</span>
                          {thread.documentIds?.length > 0 && (
                            <motion.span
                              className="thread-doc-count"
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                            >
                              {thread.documentIds.length} doc{thread.documentIds.length !== 1 ? 's' : ''}
                            </motion.span>
                          )}
                        </div>
                      </div>
                      {editingId !== thread.id && (
                        <motion.button
                          className="thread-delete"
                          onClick={(e) => handleDelete(e, thread.id, thread.title)}
                          title="Delete chat"
                          whileHover={{ scale: 1.2, color: '#ff3d00' }}
                          whileTap={{ scale: 0.9 }}
                          transition={{ duration: 0.15 }}
                        >
                          <Trash2 size={14} />
                        </motion.button>
                      )}
                    </>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Mobile Close Button */}
      <motion.button
        className="sidebar-close"
        onClick={onCloseMobile}
        whileHover={{ scale: 1.1, rotate: 90 }}
        whileTap={{ scale: 0.9 }}
        transition={springTransition}
      >
        <X size={20} />
      </motion.button>

      {/* Expand trigger area - appears on right edge when collapsed */}
      <AnimatePresence>
        {isCollapsed && (
          <motion.div
            className="sidebar-expand-trigger"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onToggleCollapse}
            title="Click to expand sidebar"
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default ChatSidebar;
