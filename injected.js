/**
 * Colonist.io WebSocket Interceptor
 * 
 * This script runs in the page context and monkey-patches the WebSocket
 * constructor to intercept all messages to/from the game server.
 * 
 * Messages are forwarded to the content script via window.postMessage.
 */

(function() {
  'use strict';

  const LOG_PREFIX = '[Colonist Advisor]';
  
  // Store original WebSocket
  const OriginalWebSocket = window.WebSocket;
  
  // Track all active WebSocket connections
  const activeConnections = new Map();
  let connectionId = 0;

  /**
   * Custom WebSocket wrapper that intercepts all messages
   */
  class InterceptedWebSocket extends OriginalWebSocket {
    constructor(url, protocols) {
      super(url, protocols);
      
      this._id = ++connectionId;
      this._url = url;
      this._createdAt = Date.now();
      
      activeConnections.set(this._id, this);
      
      console.log(`${LOG_PREFIX} WebSocket #${this._id} connecting to: ${url}`);
      
      // Forward connection info to content script
      this._postMessage('ws_connect', {
        id: this._id,
        url: url,
        protocols: protocols,
        timestamp: this._createdAt
      });
      
      // Intercept incoming messages
      this.addEventListener('message', (event) => {
        this._handleMessage(event);
      });
      
      // Track connection state changes
      this.addEventListener('open', () => {
        console.log(`${LOG_PREFIX} WebSocket #${this._id} opened`);
        this._postMessage('ws_open', { id: this._id, timestamp: Date.now() });
      });
      
      this.addEventListener('close', (event) => {
        console.log(`${LOG_PREFIX} WebSocket #${this._id} closed (code: ${event.code})`);
        activeConnections.delete(this._id);
        this._postMessage('ws_close', {
          id: this._id,
          code: event.code,
          reason: event.reason,
          timestamp: Date.now()
        });
      });
      
      this.addEventListener('error', (event) => {
        console.error(`${LOG_PREFIX} WebSocket #${this._id} error:`, event);
        this._postMessage('ws_error', { id: this._id, timestamp: Date.now() });
      });
    }
    
    /**
     * Handle incoming WebSocket message
     */
    _handleMessage(event) {
      const timestamp = Date.now();
      
      if (event.data instanceof Blob) {
        // Binary data - likely MessagePack encoded
        event.data.arrayBuffer().then((buffer) => {
          const uint8Array = new Uint8Array(buffer);
          this._postMessage('ws_message', {
            id: this._id,
            direction: 'incoming',
            type: 'binary',
            data: Array.from(uint8Array), // Convert to regular array for postMessage
            size: buffer.byteLength,
            timestamp: timestamp
          });
        });
      } else if (event.data instanceof ArrayBuffer) {
        // ArrayBuffer data
        const uint8Array = new Uint8Array(event.data);
        this._postMessage('ws_message', {
          id: this._id,
          direction: 'incoming',
          type: 'binary',
          data: Array.from(uint8Array),
          size: event.data.byteLength,
          timestamp: timestamp
        });
      } else {
        // Text data (JSON or other string format)
        this._postMessage('ws_message', {
          id: this._id,
          direction: 'incoming',
          type: 'text',
          data: event.data,
          size: event.data.length,
          timestamp: timestamp
        });
      }
    }
    
    /**
     * Override send() to intercept outgoing messages
     */
    send(data) {
      const timestamp = Date.now();
      
      if (data instanceof ArrayBuffer) {
        const uint8Array = new Uint8Array(data);
        this._postMessage('ws_message', {
          id: this._id,
          direction: 'outgoing',
          type: 'binary',
          data: Array.from(uint8Array),
          size: data.byteLength,
          timestamp: timestamp
        });
      } else if (data instanceof Blob) {
        data.arrayBuffer().then((buffer) => {
          const uint8Array = new Uint8Array(buffer);
          this._postMessage('ws_message', {
            id: this._id,
            direction: 'outgoing',
            type: 'binary',
            data: Array.from(uint8Array),
            size: buffer.byteLength,
            timestamp: timestamp
          });
        });
      } else if (typeof data === 'string') {
        this._postMessage('ws_message', {
          id: this._id,
          direction: 'outgoing',
          type: 'text',
          data: data,
          size: data.length,
          timestamp: timestamp
        });
      } else {
        // Uint8Array or other typed array
        this._postMessage('ws_message', {
          id: this._id,
          direction: 'outgoing',
          type: 'binary',
          data: Array.from(data),
          size: data.byteLength || data.length,
          timestamp: timestamp
        });
      }
      
      // Call original send
      return super.send(data);
    }
    
    /**
     * Post message to content script
     */
    _postMessage(type, payload) {
      window.postMessage({
        source: 'colonist-advisor-injected',
        type: type,
        payload: payload
      }, '*');
    }
  }
  
  // Replace global WebSocket with our intercepted version
  window.WebSocket = InterceptedWebSocket;
  
  // Also patch the prototype to maintain instanceof checks
  Object.defineProperty(window, 'WebSocket', {
    value: InterceptedWebSocket,
    writable: false,
    configurable: false
  });
  
  console.log(`${LOG_PREFIX} WebSocket interceptor installed`);
  
  // Expose debug utilities on window for manual inspection
  window.__colonistAdvisor = {
    getConnections: () => Array.from(activeConnections.entries()),
    getConnectionCount: () => activeConnections.size,
    version: '1.0.0'
  };
})();
