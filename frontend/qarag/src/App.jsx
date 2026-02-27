import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, AlertTriangle } from 'lucide-react';
import { SignedIn, SignedOut } from '@clerk/clerk-react';
import Header from './components/Header';
import ChatSidebar from './components/ChatSidebar';
import ChatInterface from './components/ChatInterface';
import DocumentDrawer from './components/DocumentDrawer';
import './App.css';

// Local storage for threads
const THREADS_KEY = 'qarag_threads';
const ACTIVE_THREAD_KEY = 'qarag_active_thread';
const SIDEBAR_COLLAPSED_KEY = 'qarag_sidebar_collapsed';

// Sidebar constants
const SIDEBAR_WIDTH = 260;
const SIDEBAR_RAIL_WIDTH = 56;
const SIDEBAR_TRANSITION_DURATION = 0.3;
const MOBILE_BREAKPOINT = 1024;

const getIsMobileViewport = () => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth <= MOBILE_BREAKPOINT;
};

const buildNewThread = () => ({
  id: crypto.randomUUID(),
  title: 'New Chat',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  messages: [],
  documentIds: [],
  documents: [],
});

function App() {
  const initialThreadState = (() => {
    if (typeof window === 'undefined') {
      return { threads: [], activeThreadId: null };
    }

    const savedThreads = localStorage.getItem(THREADS_KEY);
    const savedActive = localStorage.getItem(ACTIVE_THREAD_KEY);

    if (savedThreads) {
      const parsed = JSON.parse(savedThreads);
      const normalizedThreads = parsed.map(t => ({
        ...t,
        documentIds: t.documentIds || [],
        documents: t.documents || [],
      }));
      return {
        threads: normalizedThreads,
        activeThreadId: savedActive && normalizedThreads.find(t => t.id === savedActive) ? savedActive : null,
      };
    }

    const newThread = buildNewThread();
    return { threads: [newThread], activeThreadId: newThread.id };
  })();

  const [threads, setThreads] = useState(initialThreadState.threads);
  const [activeThreadId, setActiveThreadId] = useState(initialThreadState.activeThreadId);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const savedCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return savedCollapsed === 'true';
  });
  const [docDrawerOpen, setDocDrawerOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, title }
  const [isMobile, setIsMobile] = useState(getIsMobileViewport);

  const createNewThread = useCallback(() => {
    const newThread = buildNewThread();
    setThreads(prev => [newThread, ...prev]);
    setActiveThreadId(newThread.id);
    setDocDrawerOpen(false);
    setMobileMenuOpen(false);
    return newThread.id;
  }, []);

  // Save sidebar state to localStorage
  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed);
  }, [sidebarCollapsed]);

  // Save threads to localStorage
  useEffect(() => {
    if (threads.length > 0) {
      localStorage.setItem(THREADS_KEY, JSON.stringify(threads));
    }
  }, [threads]);

  useEffect(() => {
    if (activeThreadId) {
      localStorage.setItem(ACTIVE_THREAD_KEY, activeThreadId);
    }
  }, [activeThreadId]);

  // Keyboard shortcut for sidebar toggle (Cmd/Ctrl + \)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        if (isMobile) {
          setMobileMenuOpen(prev => !prev);
        } else {
          setSidebarCollapsed(prev => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobile]);

  // Keep viewport mode reactive
  useEffect(() => {
    const handleResize = () => {
      const mobile = getIsMobileViewport();
      setIsMobile(mobile);
      if (!mobile) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const updateThread = useCallback((threadId, updates) => {
    setThreads(prev => prev.map(t => {
      if (t.id === threadId) {
        return { ...t, ...updates, updatedAt: new Date().toISOString() };
      }
      return t;
    }));
  }, []);

  const deleteThread = useCallback((threadId) => {
    setThreads(prev => prev.filter(t => t.id !== threadId));
    if (activeThreadId === threadId) {
      const remaining = threads.filter(t => t.id !== threadId);
      if (remaining.length > 0) {
        setActiveThreadId(remaining[0].id);
      } else {
        createNewThread();
      }
    }
    setDeleteConfirm(null);
  }, [activeThreadId, threads, createNewThread]);

  const confirmDeleteThread = useCallback((threadId, title) => {
    setDeleteConfirm({ id: threadId, title });
  }, []);

  const renameThread = useCallback((threadId, newTitle) => {
    updateThread(threadId, { title: newTitle });
  }, [updateThread]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, []);

  const activeThread = threads.find(t => t.id === activeThreadId);

  // Computed sidebar width with animation
  const effectiveSidebarCollapsed = isMobile ? false : sidebarCollapsed;
  const sidebarWidth = effectiveSidebarCollapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH;

  return (
    <div className="app">
      {/* Header */}
      <Header
        onNewChat={createNewThread}
        onToggleDocs={() => setDocDrawerOpen(!docDrawerOpen)}
        onToggleMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
        docCount={activeThread?.documentIds?.length || 0}
      />

      <SignedOut>
        <main className="auth-main">
          <section className="auth-panel">
            <h1>Secure Document Workspace</h1>
            <p>Sign in or create an account to access your chat threads and document tools.</p>
          </section>
        </main>
      </SignedOut>

      <SignedIn>
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className="mobile-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Main Layout */}
      <div className="main-layout">
        {/* Chat Sidebar - Integrated Rail Design */}
        <motion.aside
          className={`chat-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}
          animate={{
            width: isMobile ? SIDEBAR_WIDTH : sidebarWidth,
          }}
          transition={{
            duration: SIDEBAR_TRANSITION_DURATION,
            ease: [0.25, 0.1, 0.25, 1]
          }}
        >
          <ChatSidebar
            threads={threads}
            activeThreadId={activeThreadId}
            onThreadSelect={setActiveThreadId}
            onThreadDelete={confirmDeleteThread}
            onThreadRename={renameThread}
            onNewChat={createNewThread}
            onCloseMobile={() => setMobileMenuOpen(false)}
            isCollapsed={effectiveSidebarCollapsed}
            isMobile={isMobile}
            onToggleCollapse={toggleSidebar}
          />
        </motion.aside>

        {/* Main Chat Area */}
        <motion.main
          className="chat-main"
          animate={{
            marginLeft: isMobile ? 0 : sidebarWidth,
          }}
          transition={{
            duration: SIDEBAR_TRANSITION_DURATION,
            ease: [0.25, 0.1, 0.25, 1]
          }}
        >
          {activeThread ? (
            <ChatInterface
              thread={activeThread}
              onUpdateThread={updateThread}
            />
          ) : (
            <div className="loading-state">Loading...</div>
          )}
        </motion.main>
      </div>

      {/* Document Drawer (Right Side) */}
      <AnimatePresence>
        {docDrawerOpen && (
          <>
            <motion.div
              className="drawer-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDocDrawerOpen(false)}
            />
            <motion.aside
              className="document-drawer"
              initial={{ x: 400 }}
              animate={{ x: 0 }}
              exit={{ x: 400 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <DocumentDrawer
                thread={activeThread}
                onUpdateThread={updateThread}
                onClose={() => setDocDrawerOpen(false)}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <>
            <motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirm(null)}
            />
            <div className="delete-modal-center">
              <motion.div
                className="delete-modal"
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              >
                <div className="delete-modal-icon">
                  <AlertTriangle size={32} />
                </div>
                <h2>Delete Chat?</h2>
                <p>Are you sure you want to delete <strong>"{deleteConfirm.title}"</strong>? This action cannot be undone.</p>
                <div className="delete-modal-actions">
                  <motion.button
                    className="btn btn-secondary"
                    onClick={() => setDeleteConfirm(null)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    className="btn btn-danger"
                    onClick={() => deleteThread(deleteConfirm.id)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Trash2 size={16} />
                    Delete
                  </motion.button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
      </SignedIn>
    </div>
  );
}

export default App;
