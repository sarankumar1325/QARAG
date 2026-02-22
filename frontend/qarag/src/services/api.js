// API Service for QARAG Backend
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const api = {
  // Health Check
  async health() {
    const res = await fetch(`${API_BASE}/health`);
    return res.json();
  },

  // Documents
  async getDocuments() {
    const res = await fetch(`${API_BASE}/documents/`);
    return res.json();
  },

  async getDocument(docId) {
    const res = await fetch(`${API_BASE}/documents/${docId}`);
    if (!res.ok) throw new Error('Document not found');
    return res.json();
  },

  async uploadDocument(file) {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/documents/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Upload failed');
    }

    return res.json();
  },

  async uploadUrl(url) {
    const formData = new FormData();
    formData.append('url', url);

    const res = await fetch(`${API_BASE}/documents/url`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Failed to add URL');
    }

    return res.json();
  },

  async deleteDocument(docId) {
    const res = await fetch(`${API_BASE}/documents/${docId}`, {
      method: 'DELETE',
    });

    if (!res.ok) throw new Error('Failed to delete document');
    return res.json();
  },

  async getStats() {
    const res = await fetch(`${API_BASE}/documents/stats/overview`);
    return res.json();
  },

  // Chat
  async sendMessage(message, conversationId = null, options = {}) {
    const res = await fetch(`${API_BASE}/chat/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
        max_internal_sources: options.maxInternalSources ?? 5,
        doc_ids: options.doc_ids || null,
      }),
    });

    if (!res.ok) throw new Error('Failed to send message');
    return res.json();
  },

  async getConversation(conversationId) {
    const res = await fetch(`${API_BASE}/chat/conversations/${conversationId}`);
    if (!res.ok) throw new Error('Conversation not found');
    return res.json();
  },

  async getConversations() {
    const res = await fetch(`${API_BASE}/chat/conversations`);
    return res.json();
  },

  async deleteConversation(conversationId) {
    const res = await fetch(`${API_BASE}/chat/conversations/${conversationId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete conversation');
    return res.json();
  },

  // Streaming Chat (SSE)
  /**
   * Stream a chat message using Server-Sent Events
   * @param {string} message - User message
   * @param {string|null} conversationId - Conversation ID
   * @param {object} options - Options
   * @param {function} onMetadata - Callback for metadata event
   * @param {function} onSources - Callback for sources event
   * @param {function} onToken - Callback for token event
   * @param {function} onDone - Callback for done event
   * @param {function} onError - Callback for error event
   * @returns {Promise<void>}
   */
  async streamMessage(message, conversationId = null, options = {}, callbacks = {}) {
    const {
      onMetadata = () => {},
      onSources = () => {},
      onToken = () => {},
      onDone = () => {},
      onError = () => {},
    } = callbacks;

    const body = {
      message,
      conversation_id: conversationId,
      max_internal_sources: options.maxInternalSources ?? 5,
      doc_ids: options.doc_ids || null,
    };

    try {
      const response = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        let currentEvent = null;
        let currentData = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6);

            try {
              const data = JSON.parse(currentData);

              switch (currentEvent) {
                case 'metadata':
                  onMetadata(data);
                  break;
                case 'sources':
                  onSources(data);
                  break;
                case 'token':
                  onToken(data);
                  break;
                case 'done':
                  onDone(data);
                  break;
                case 'error':
                  onError(data);
                  break;
              }
            } catch (e) {
              console.error('Failed to parse SSE data:', e, currentData);
            }

            currentData = '';
          }
        }
      }
    } catch (error) {
      onError({ error: error.message });
      throw error;
    }
  },
};
