<script>
  import { currentMessage, navigationInfo } from '../../stores/gameState.js';
  import { getMessageTypeInfo } from '../constants.js';
  
  // Format timestamp
  function formatTimestamp(ts) {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  }
  
  // Get type from message
  function getType(msg) {
    return msg?.data?.data?.type;
  }
  
  // JSON syntax highlighting
  function syntaxHighlight(json) {
    if (!json) return '';
    
    const str = JSON.stringify(json, null, 2);
    
    return str.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
    });
  }
  
  $: message = $currentMessage;
  $: type = getType(message);
  $: typeInfo = type !== undefined ? getMessageTypeInfo(type) : null;
  $: payload = message?.data?.data?.payload;
  $: timestamp = message?.timestamp;
  $: sequence = message?.data?.data?.sequence;
  $: messageId = message?.data?.id;
</script>

<div class="json-viewer">
  <div class="viewer-header">
    <h3>Message Details</h3>
    {#if $navigationInfo.total > 0}
      <span class="message-counter">
        {$navigationInfo.current} / {$navigationInfo.total}
      </span>
    {/if}
  </div>
  
  {#if message}
    <!-- Message meta info -->
    <div class="meta-section">
      <div class="meta-row">
        <span class="meta-label">Timestamp:</span>
        <span class="meta-value">{formatTimestamp(timestamp)}</span>
      </div>
      <div class="meta-row">
        <span class="meta-label">Channel ID:</span>
        <span class="meta-value">{messageId || 'N/A'}</span>
      </div>
      {#if sequence !== undefined}
        <div class="meta-row">
          <span class="meta-label">Sequence:</span>
          <span class="meta-value">{sequence}</span>
        </div>
      {/if}
    </div>
    
    <!-- Message type badge -->
    {#if typeInfo}
      <div class="type-section">
        <div class="type-badge" style="background: {typeInfo.color}">
          <span class="type-number">Type {type}</span>
          <span class="type-label">{typeInfo.label}</span>
        </div>
        <p class="type-description">{typeInfo.description}</p>
      </div>
    {/if}
    
    <!-- Payload -->
    <div class="payload-section">
      <div class="section-header">
        <span>Payload</span>
        <span class="payload-type">
          {payload === null ? 'null' : Array.isArray(payload) ? `Array[${payload.length}]` : typeof payload}
        </span>
      </div>
      <div class="json-content">
        <pre>{@html syntaxHighlight(payload)}</pre>
      </div>
    </div>
    
    <!-- Full message (collapsible) -->
    <details class="full-message">
      <summary>Full Message JSON</summary>
      <div class="json-content">
        <pre>{@html syntaxHighlight(message)}</pre>
      </div>
    </details>
  {:else}
    <div class="empty-state">
      <p>No message selected</p>
      <p class="hint">Click "Next" to start stepping through messages</p>
    </div>
  {/if}
</div>

<style>
  .json-viewer {
    background: #1e1e2e;
    border-radius: 8px;
    padding: 1rem;
    height: 100%;
    overflow-y: auto;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  }
  
  .viewer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #333;
  }
  
  .viewer-header h3 {
    margin: 0;
    color: #fff;
    font-size: 1rem;
  }
  
  .message-counter {
    background: #3498db;
    color: #fff;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
  }
  
  .meta-section {
    background: rgba(255, 255, 255, 0.05);
    padding: 0.5rem;
    border-radius: 4px;
    margin-bottom: 1rem;
  }
  
  .meta-row {
    display: flex;
    gap: 0.5rem;
    font-size: 0.8rem;
    margin-bottom: 0.25rem;
  }
  
  .meta-label {
    color: #888;
  }
  
  .meta-value {
    color: #ddd;
  }
  
  .type-section {
    margin-bottom: 1rem;
  }
  
  .type-badge {
    display: inline-flex;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    color: #fff;
    font-weight: bold;
  }
  
  .type-number {
    opacity: 0.8;
    font-size: 0.8rem;
  }
  
  .type-label {
    font-size: 0.9rem;
  }
  
  .type-description {
    margin: 0.5rem 0;
    color: #aaa;
    font-size: 0.85rem;
    font-family: system-ui, sans-serif;
  }
  
  .payload-section {
    margin-bottom: 1rem;
  }
  
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    color: #aaa;
    font-size: 0.8rem;
  }
  
  .payload-type {
    color: #666;
  }
  
  .json-content {
    background: #0d0d15;
    padding: 1rem;
    border-radius: 4px;
    overflow-x: auto;
    max-height: 300px;
    overflow-y: auto;
  }
  
  .json-content pre {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.4;
    color: #ddd;
    white-space: pre-wrap;
    word-break: break-word;
  }
  
  :global(.json-key) {
    color: #9cdcfe;
  }
  
  :global(.json-string) {
    color: #ce9178;
  }
  
  :global(.json-number) {
    color: #b5cea8;
  }
  
  :global(.json-boolean) {
    color: #569cd6;
  }
  
  :global(.json-null) {
    color: #569cd6;
  }
  
  .full-message {
    margin-top: 1rem;
  }
  
  .full-message summary {
    color: #888;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0.5rem;
    border-radius: 4px;
    transition: background 0.2s;
  }
  
  .full-message summary:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  
  .full-message .json-content {
    margin-top: 0.5rem;
    max-height: 400px;
  }
  
  .empty-state {
    text-align: center;
    padding: 2rem;
    color: #666;
  }
  
  .empty-state p {
    margin: 0.5rem 0;
  }
  
  .empty-state .hint {
    font-size: 0.85rem;
    color: #555;
  }
</style>
