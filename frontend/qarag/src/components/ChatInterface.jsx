import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Send, User, Bot, Copy, ThumbsUp, ThumbsDown, RefreshCw, FileText, Globe, Loader2, Square, Paperclip, X, File, Image, FileType } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { gsap } from 'gsap';
import { api } from '../services/api';
import DocumentUploadPanel from './DocumentUploadPanel';

function ChatInterface({ thread, onUpdateThread, onToggleDrawer }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [expandedSources, setExpandedSources] = useState({});
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingSources, setStreamingSources] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [shouldStop, setShouldStop] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const abortControllerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const welcomeRef = useRef(null);
  const prefersReducedMotion = useReducedMotion();

  // GSAP entrance animation for welcome state
  useEffect(() => {
    if (!thread?.messages || thread.messages.length === 0) {
      const ctx = gsap.context(() => {
        const targets = welcomeRef.current?.querySelectorAll('.animate-in');
        if (targets && targets.length > 0 && !prefersReducedMotion) {
          gsap.fromTo(
            targets,
            { y: 20, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.4,
              stagger: 0.08,
              ease: 'power2.out'
            }
          );
        }
      }, welcomeRef);
    }
  }, [thread?.messages, prefersReducedMotion]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [thread?.messages, loading, streamingContent, isStreaming]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [thread?.id]);

  const generateTitle = async (firstMessage) => {
    const words = firstMessage.split(' ').slice(0, 5);
    return words.join(' ') + (firstMessage.length > 30 ? '...' : '');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading || !thread) return;

    const userMessage = input.trim();
    setInput('');
    setShouldStop(false);

    // Add user message
    const newMessages = [...(thread.messages || []), {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString()
    }];

    // Generate title if first message
    if (newMessages.length === 1) {
      const title = await generateTitle(userMessage);
      onUpdateThread(thread.id, { messages: newMessages, title });
    } else {
      onUpdateThread(thread.id, { messages: newMessages });
    }

    setLoading(true);
    setIsStreaming(true);
    setStreamingContent('');
    setStreamingSources(null);

    try {
      await api.streamMessage(
        userMessage,
        thread.id,
        {
          doc_ids: thread.documentIds
        },
        {
          onMetadata: (data) => {
            console.log('Streaming metadata:', data);
          },
          onSources: (data) => {
            // Include all sources (relevance is now 0.5-1.0 range)
            setStreamingSources(data.sources || []);
          },
          onToken: (data) => {
            if (!shouldStop) {
              setStreamingContent(prev => prev + data.content);
            }
          },
          onDone: (data) => {
            if (!shouldStop) {
              const finalContent = data.answer || streamingContent;

              // Add assistant message
              const updatedMessages = [...newMessages, {
                role: 'assistant',
                content: finalContent,
                timestamp: new Date().toISOString(),
                sources: streamingSources || []
              }];

              onUpdateThread(thread.id, { messages: updatedMessages });

              // Auto-expand sources if available
              if ((streamingSources || []).length > 0) {
                setExpandedSources({ [newMessages.length]: true });
              }
            }
            setIsStreaming(false);
            setLoading(false);
            setStreamingContent('');
            setStreamingSources(null);
          },
          onError: (data) => {
            console.error('Streaming error:', data);

            const errorMsg = (thread.documentIds?.length || 0) === 0
              ? "No documents are uploaded to this chat yet. Upload a document to get context-aware answers."
              : "Sorry, something went wrong. Please try again.";

            onUpdateThread(thread.id, {
              messages: [...newMessages, {
                role: 'assistant',
                content: errorMsg,
                timestamp: new Date().toISOString()
              }]
            });

            setIsStreaming(false);
            setLoading(false);
            setStreamingContent('');
            setStreamingSources(null);
          }
        }
      );
    } catch (err) {
      console.error('Stream request failed:', err);

      // Fallback to non-streaming if streaming fails
      try {
        const response = await api.sendMessage(
          userMessage,
          thread.id,
          {
            doc_ids: thread.documentIds
          }
        );

        const sources = (response.sources || []);

        const updatedMessages = [...newMessages, {
          role: 'assistant',
          content: response.answer,
          timestamp: new Date().toISOString(),
          sources: sources
        }];

        onUpdateThread(thread.id, { messages: updatedMessages });

        if (sources.length > 0) {
          setExpandedSources({ [newMessages.length]: true });
        }
      } catch (fallbackErr) {
        const errorMsg = (thread.documentIds?.length || 0) === 0
          ? "No documents are uploaded to this chat yet. Upload a document to get context-aware answers, or ask me a general question."
          : "Sorry, something went wrong. Please try again.";

        onUpdateThread(thread.id, {
          messages: [...newMessages, {
            role: 'assistant',
            content: errorMsg,
            timestamp: new Date().toISOString()
          }]
        });
      } finally {
        setIsStreaming(false);
        setLoading(false);
        setStreamingContent('');
        setStreamingSources(null);
      }
    }
  };

  const handleStopStreaming = () => {
    setShouldStop(true);
    setIsStreaming(false);
    setLoading(false);

    // Add current streaming content as final message
    if (streamingContent) {
      const currentMessages = thread?.messages || [];
      const updatedMessages = [...currentMessages, {
        role: 'assistant',
        content: streamingContent + '\n\n*[Response stopped by user]*',
        timestamp: new Date().toISOString(),
        sources: streamingSources || []
      }];
      onUpdateThread(thread.id, { messages: updatedMessages });
    }

    setStreamingContent('');
    setStreamingSources(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleCopy = (content) => {
    navigator.clipboard.writeText(content);
  };

  const handleRegenerate = async (index) => {
    const userMsg = thread.messages[index - 1];
    if (!userMsg || userMsg.role !== 'user') return;

    setRegenerating(true);

    try {
      const response = await api.sendMessage(
        userMsg.content,
        thread.id,
        {
          doc_ids: thread.documentIds
        }
      );

      const sources = (response.sources || []);

      const updatedMessages = [...thread.messages];
      updatedMessages[index] = {
        ...updatedMessages[index],
        content: response.answer,
        sources: sources,
        timestamp: new Date().toISOString()
      };

      onUpdateThread(thread.id, { messages: updatedMessages });
    } catch (err) {
      console.error('Regenerate failed:', err);
    } finally {
      setRegenerating(false);
    }
  };

  const toggleSources = (index) => {
    setExpandedSources(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const handleRemoveDocument = (docId) => {
    // Remove document from thread's local state (no backend call needed)
    // The document still exists in the system but won't be used for this chat
    const updatedDocIds = (thread.documentIds || []).filter(id => id !== docId);
    const updatedDocs = (thread.documents || []).filter(doc => doc.id !== docId);
    onUpdateThread(thread.id, {
      documentIds: updatedDocIds,
      documents: updatedDocs
    });
  };

  const getFileIcon = (filename) => {
    const ext = filename?.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
      return <Image size={14} />;
    }
    if (['pdf'].includes(ext)) {
      return <FileType size={14} />;
    }
    return <File size={14} />;
  };

  const messages = thread?.messages || [];
  const hasDocs = (thread?.documentIds?.length || 0) > 0;
  const documents = thread?.documents || [];

  // Animation variants
  const messageVariants = {
    initial: { opacity: 0, y: prefersReducedMotion ? 0 : 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 }
  };

  const userMessageVariants = {
    initial: { opacity: 0, x: prefersReducedMotion ? 0 : 8 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 8 }
  };

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
    <div className="chat-interface">
      {/* Messages */}
      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="welcome-state" ref={welcomeRef}>
            <motion.h1
              className="animate-in"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.08 }}
            >
              What can I help you find?
            </motion.h1>
            {!hasDocs ? (
              <motion.p
                className="welcome-sub animate-in"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.16 }}
              >
                Click the attachment icon to upload documents
              </motion.p>
            ) : (
              <motion.p
                className="welcome-sub animate-in"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.08 }}
              >
                Ask a question about your documents
              </motion.p>
            )}
            <motion.div
              className="suggestions animate-in"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.32 }}
            >
              <motion.button
                className="suggestion-btn"
                onClick={() => setInput('Summarize the key points')}
                variants={buttonVariants}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                transition={springTransition}
              >
                Summarize the key points
              </motion.button>
              <motion.button
                className="suggestion-btn"
                onClick={() => setInput('What are the main topics?')}
                variants={buttonVariants}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                transition={springTransition}
              >
                What are the main topics?
              </motion.button>
              <motion.button
                className="suggestion-btn"
                onClick={() => setInput('Find information about...')}
                variants={buttonVariants}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                transition={springTransition}
              >
                Find information about...
              </motion.button>
            </motion.div>
          </div>
        ) : (
          <div className="messages-list">
            <AnimatePresence mode="popLayout">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  className={`message ${msg.role}`}
                  variants={msg.role === 'user' ? userMessageVariants : messageVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: msg.role === 'user' ? 0.18 : 0.25 }}
                  layout="position"
                >
                  <div className="message-avatar">
                    {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
                  </div>
                  <div className="message-body">
                    <div className="message-content">
                      {msg.role === 'assistant' ? (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p: ({ children }) => <p>{children}</p>,
                            strong: ({ children }) => <strong>{children}</strong>,
                            em: ({ children }) => <em>{children}</em>,
                            code: ({ inline, children, className }) => {
                              if (className) {
                                return <code className={className}>{children}</code>;
                              }
                              return inline ? <code>{children}</code> : <pre><code>{children}</code></pre>;
                            },
                            ul: ({ children }) => <ul>{children}</ul>,
                            ol: ({ children }) => <ol>{children}</ol>,
                            li: ({ children }) => <li>{children}</li>,
                            h1: ({ children }) => <h1>{children}</h1>,
                            h2: ({ children }) => <h2>{children}</h2>,
                            h3: ({ children }) => <h3>{children}</h3>,
                            blockquote: ({ children }) => <blockquote>{children}</blockquote>,
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      ) : (
                        <p>{msg.content}</p>
                      )}
                    </div>

                    {/* Message Actions */}
                    {msg.role === 'assistant' && (
                      <>
                        <motion.div
                          className="message-actions"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.1 }}
                        >
                          <motion.button
                            className="action-btn"
                            onClick={() => handleCopy(msg.content)}
                            title="Copy"
                            variants={buttonVariants}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            transition={springTransition}
                          >
                            <Copy size={14} />
                          </motion.button>
                          <motion.button
                            className="action-btn"
                            title="Good response"
                            variants={buttonVariants}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            transition={springTransition}
                          >
                            <ThumbsUp size={14} />
                          </motion.button>
                          <motion.button
                            className="action-btn"
                            title="Bad response"
                            variants={buttonVariants}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            transition={springTransition}
                          >
                            <ThumbsDown size={14} />
                          </motion.button>
                          <motion.button
                            className="action-btn"
                            onClick={() => handleRegenerate(i)}
                            title="Regenerate"
                            disabled={regenerating}
                            variants={buttonVariants}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            transition={springTransition}
                          >
                            <RefreshCw size={14} className={regenerating ? 'spin' : ''} />
                          </motion.button>
                        </motion.div>

                        {/* Sources */}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="message-sources">
                            <button
                              className="sources-toggle"
                              onClick={() => toggleSources(i)}
                            >
                              <FileText size={14} />
                              {msg.sources.length} source{msg.sources.length !== 1 ? 's' : ''}
                              {expandedSources[i] ? ' (hide)' : ' (show)'}
                            </button>
                            <AnimatePresence>
                              {expandedSources[i] && (
                                <motion.div
                                  className="sources-list"
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                >
                                  {msg.sources.map((source, j) => (
                                    <div key={j} className="source-item">
                                      <div className="source-type">
                                        {source.source_type === 'INTERNAL_DOCUMENT' ? (
                                          <FileText size={12} />
                                        ) : (
                                          <Globe size={12} />
                                        )}
                                      </div>
                                      <div className="source-info">
                                        <span className="source-name">
                                          {source.document_name || source.url || 'Source'}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </motion.div>
              ))}

              {/* Streaming Message */}
              {(isStreaming || streamingContent) && (
                <motion.div
                  className="message assistant streaming"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="message-avatar">
                    <Bot size={18} />
                  </div>
                  <div className="message-body">
                    <div className="message-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p>{children}</p>,
                          strong: ({ children }) => <strong>{children}</strong>,
                          em: ({ children }) => <em>{children}</em>,
                          code: ({ inline, children, className }) => {
                            if (className) {
                              return <code className={className}>{children}</code>;
                            }
                            return inline ? <code>{children}</code> : <pre><code>{children}</code></pre>;
                          },
                          ul: ({ children }) => <ul>{children}</ul>,
                          ol: ({ children }) => <ol>{children}</ol>,
                          li: ({ children }) => <li>{children}</li>,
                          h1: ({ children }) => <h1>{children}</h1>,
                          h2: ({ children }) => <h2>{children}</h2>,
                          h3: ({ children }) => <h3>{children}</h3>,
                          blockquote: ({ children }) => <blockquote>{children}</blockquote>,
                        }}
                      >
                        {streamingContent || ''}
                      </ReactMarkdown>
                      <span className="cursor"></span>
                    </div>

                    {/* Stop Button */}
                    {isStreaming && (
                      <motion.button
                        className="action-btn stop-btn"
                        onClick={handleStopStreaming}
                        title="Stop generating"
                        variants={buttonVariants}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        transition={springTransition}
                      >
                        <Square size={14} fill="currentColor" />
                      </motion.button>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Loading/Regenerating Indicator (fallback) */}
              {(loading || regenerating) && !isStreaming && !streamingContent && (
                <motion.div
                  className="message assistant"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="message-avatar">
                    <Bot size={18} />
                  </div>
                  <div className="message-body">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Document Preview Bar */}
      {documents && documents.length > 0 && (
        <div className="doc-preview-bar">
          <div className="doc-preview-label">
            <FileText size={12} />
            <span>{documents.length} document{documents.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="doc-preview-items">
            {documents.map((doc, idx) => (
              <div key={doc.id || idx} className="doc-preview-item">
                <span className="file-icon">{getFileIcon(doc.filename || doc.name)}</span>
                <span className="doc-name">{doc.filename || doc.name || 'Document'}</span>
                <button
                  className="doc-preview-remove"
                  onClick={() => handleRemoveDocument(doc.id)}
                  title="Remove document"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="chat-input-wrapper">
        <AnimatePresence>
          {showUploadPanel && (
            <DocumentUploadPanel
              thread={thread}
              onUpdateThread={onUpdateThread}
              onClose={() => setShowUploadPanel(false)}
            />
          )}
        </AnimatePresence>

        <form className="chat-input" onSubmit={handleSubmit}>
          <motion.button
            type="button"
            className={`attach-btn ${documents?.length > 0 ? 'has-docs' : ''}`}
            onClick={() => !showUploadPanel && setShowUploadPanel(true)}
            title="Add documents"
            variants={buttonVariants}
            whileHover={{ scale: showUploadPanel ? 1 : 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={springTransition}
            disabled={showUploadPanel}
          >
            <Paperclip size={18} />
            {documents?.length > 0 && (
              <span className="attach-badge">{documents.length}</span>
            )}
          </motion.button>
          <input
            ref={inputRef}
            type="text"
            className="input"
            placeholder={hasDocs ? "Ask a question about your documents..." : "Upload documents to start asking questions..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            onKeyDown={handleKeyDown}
          />
          <motion.button
            type={isStreaming ? "button" : "submit"}
            className="send-btn"
            disabled={loading || !input.trim()}
            onClick={isStreaming ? handleStopStreaming : undefined}
            variants={buttonVariants}
            whileHover={{ scale: loading ? 1 : 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={springTransition}
          >
            {isStreaming ? <Square size={18} fill="currentColor" /> : loading ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
          </motion.button>
        </form>

        {/* Keyboard hint */}
        <div className="input-hint">
          Press <kbd>Enter</kbd> to send, <kbd>Shift + Enter</kbd> for newline
        </div>
      </div>
    </div>
  );
}

export default ChatInterface;
