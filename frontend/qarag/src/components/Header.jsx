import { motion } from 'framer-motion';
import { Plus, Menu, FileText } from 'lucide-react';

function Header({ onNewChat, onToggleDocs, onToggleMenu, docCount }) {
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

  return (
    <header className="header">
      <div className="header-content">
        <div className="header-left">
          <motion.button
            className="header-btn header-btn-icon mobile-menu-btn"
            onClick={onToggleMenu}
            whileHover={{ rotate: 90, scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            transition={springTransition}
          >
            <Menu size={20} />
          </motion.button>
          <motion.div
            className="logo"
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
          >
            <motion.span
              className="logo-mark"
              whileHover={{ rotate: [0, -10, 10, -10, 0] }}
              transition={{ duration: 0.4 }}
            >
              Q
            </motion.span>
            <span>Qarag</span>
          </motion.div>
        </div>

        <div className="header-right">
          {docCount > 0 && (
            <motion.span
              className="doc-badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 15 }}
            >
              <FileText size={12} />
              {docCount} doc{docCount !== 1 ? 's' : ''}
            </motion.span>
          )}
          <motion.button
            className="header-btn"
            onClick={onToggleDocs}
            variants={buttonVariants}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            transition={springTransition}
          >
            <FileText size={16} />
            <span>Documents</span>
          </motion.button>
          <motion.button
            className="header-btn primary"
            onClick={onNewChat}
            variants={buttonVariants}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            transition={springTransition}
          >
            <Plus size={16} />
            <span>New Chat</span>
          </motion.button>
        </div>
      </div>
    </header>
  );
}

export default Header;
