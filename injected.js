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
  
  // Store raw messages for analysis
  const rawMessageLog = [];

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
      
      console.log(`${LOG_PREFIX} 🔌 WebSocket #${this._id} connecting to: ${url}`);
      console.log(`${LOG_PREFIX}    Protocols: ${protocols || 'none'}`);
      console.log(`${LOG_PREFIX}    Origin: ${window.location.href}`);
      
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
          const bytesArray = Array.from(uint8Array);
          
          // Store raw data for analysis
          const firstBytes = bytesArray.slice(0, 30).map(b => b.toString(16).padStart(2, '0')).join(' ');
          rawMessageLog.push({
            timestamp,
            direction: 'incoming',
            size: buffer.byteLength,
            firstBytes,
            allBytes: bytesArray
          });
          
          // Log for large messages
          if (buffer.byteLength > 50) {
            console.log(`${LOG_PREFIX} 📦 Incoming ${buffer.byteLength}b: ${firstBytes}...`);
          }
          
          this._postMessage('ws_message', {
            id: this._id,
            direction: 'incoming',
            type: 'binary',
            data: bytesArray,
            size: buffer.byteLength,
            timestamp: timestamp
          });
        });
      } else if (event.data instanceof ArrayBuffer) {
        // ArrayBuffer data
        const uint8Array = new Uint8Array(event.data);
        const bytesArray = Array.from(uint8Array);
        
        // Store raw data
        const firstBytes = bytesArray.slice(0, 30).map(b => b.toString(16).padStart(2, '0')).join(' ');
        rawMessageLog.push({
          timestamp,
          direction: 'incoming',
          size: event.data.byteLength,
          firstBytes,
          allBytes: bytesArray
        });
        
        if (event.data.byteLength > 50) {
          console.log(`${LOG_PREFIX} 📦 Incoming ${event.data.byteLength}b: ${firstBytes}...`);
        }
        
        this._postMessage('ws_message', {
          id: this._id,
          direction: 'incoming',
          type: 'binary',
          data: bytesArray,
          size: event.data.byteLength,
          timestamp: timestamp
        });
      } else {
        // Text data (JSON or other string format)
        rawMessageLog.push({
          timestamp,
          direction: 'incoming',
          size: event.data.length,
          text: event.data
        });
        
        console.log(`${LOG_PREFIX} 📝 Incoming text: ${event.data.substring(0, 100)}`);
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
  
  // Helper to call content script API
  function callContentScript(action, ...args) {
    window.postMessage({
      source: 'colonist-advisor-page-request',
      action,
      args
    }, '*');
  }
  
  // Expose API on window for console access
  window.colonistAdvisor = {
    // Analysis
    analyze: () => callContentScript('analyze'),
    suggestPlacement: () => callContentScript('suggestPlacement'),
    suggestRoad: () => callContentScript('suggestRoad'),
    suggestBuild: () => callContentScript('suggestBuild'),
    
    // Data access
    getState: () => callContentScript('getState'),
    getMessages: () => callContentScript('getMessages'),
    
    // Save messages to file
    saveMessages: () => callContentScript('saveMessages'),
    
    // Save raw WebSocket data for analysis
    saveRawData: () => {
      if (rawMessageLog.length === 0) {
        console.log(`${LOG_PREFIX} No raw messages captured yet`);
        return;
      }
      
      const data = {
        exportedAt: new Date().toISOString(),
        messageCount: rawMessageLog.length,
        messages: rawMessageLog
      };
      
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `colonist-raw-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log(`${LOG_PREFIX} 💾 Saved ${rawMessageLog.length} raw messages`);
    },
    
    // Debug
    checkCorner: (id) => callContentScript('checkCorner', id),
    
    // WebSocket info
    getConnections: () => {
      const conns = Array.from(activeConnections.entries()).map(([id, ws]) => ({
        id,
        url: ws._url,
        readyState: ws.readyState,
        readyStateText: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.readyState],
        createdAt: ws._createdAt
      }));
      console.log('Active WebSocket connections:', conns);
      return conns;
    },
    getConnectionCount: () => {
      console.log(`Active connections: ${activeConnections.size}`);
      return activeConnections.size;
    },
    
    // Help
    help: () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║            COLONIST ADVISOR - COMMANDS                     ║
╠════════════════════════════════════════════════════════════╣
║  SUGGESTIONS:                                              ║
║    colonistAdvisor.analyze()          Full game analysis   ║
║    colonistAdvisor.suggestPlacement() Best settlement spots║
║    colonistAdvisor.suggestRoad()      Best road options    ║
║    colonistAdvisor.suggestBuild()     Build priority       ║
╠════════════════════════════════════════════════════════════╣
║  DATA:                                                     ║
║    colonistAdvisor.saveMessages()     Download all messages║
║    colonistAdvisor.saveRawData()      Download RAW bytes   ║
║    colonistAdvisor.getMessages()      View message log     ║
║    colonistAdvisor.getState()         View game state      ║
╠════════════════════════════════════════════════════════════╣
║  DEBUG:                                                    ║
║    colonistAdvisor.getConnections()   Show WebSocket info  ║
║    colonistAdvisor.checkCorner(id)    Debug corner info    ║
║    colonistAdvisor.help()             Show this help       ║
╚════════════════════════════════════════════════════════════╝
      `);
    },
    
    version: '1.0.0'
  };
  
  console.log(`${LOG_PREFIX} ✅ API ready! Type colonistAdvisor.help() for commands`);
})();
