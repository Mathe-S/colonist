<script>
  import { navigationInfo, stepForward, stepBackward, jumpToMessage } from '../../stores/gameState.js';
  
  let jumpInput = '';
  
  function handleJump() {
    const index = parseInt(jumpInput) - 1; // Convert to 0-based
    if (!isNaN(index)) {
      jumpToMessage(index);
      jumpInput = '';
    }
  }
  
  function handleKeydown(event) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      stepForward();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      stepBackward();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown}/>

<div class="controls">
  <div class="nav-buttons">
    <button 
      class="nav-btn prev"
      on:click={stepBackward}
      disabled={!$navigationInfo.canGoBack && $navigationInfo.current <= 1}
      title="Previous message (←)"
    >
      ← Prev
    </button>
    
    <div class="progress">
      <span class="current">{$navigationInfo.current}</span>
      <span class="separator">/</span>
      <span class="total">{$navigationInfo.total}</span>
    </div>
    
    <button 
      class="nav-btn next"
      on:click={stepForward}
      disabled={!$navigationInfo.canGoForward}
      title="Next message (→)"
    >
      Next →
    </button>
  </div>
  
  <div class="jump-section">
    <input 
      type="number" 
      placeholder="Jump to #"
      bind:value={jumpInput}
      on:keydown={(e) => e.key === 'Enter' && handleJump()}
      min="1"
      max={$navigationInfo.total}
    />
    <button class="jump-btn" on:click={handleJump}>Go</button>
  </div>
  
  <div class="keyboard-hint">
    <span>Keyboard: ← → to navigate</span>
  </div>
</div>

<style>
  .controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: #1e1e2e;
    border-radius: 8px;
  }
  
  .nav-buttons {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  
  .nav-btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .nav-btn.prev {
    background: #3498db;
    color: #fff;
  }
  
  .nav-btn.next {
    background: #2ecc71;
    color: #fff;
  }
  
  .nav-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }
  
  .nav-btn:disabled {
    background: #555;
    color: #888;
    cursor: not-allowed;
  }
  
  .progress {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 1.2rem;
    font-weight: bold;
    min-width: 80px;
    justify-content: center;
  }
  
  .progress .current {
    color: #3498db;
  }
  
  .progress .separator {
    color: #666;
  }
  
  .progress .total {
    color: #888;
  }
  
  .jump-section {
    display: flex;
    gap: 0.5rem;
  }
  
  .jump-section input {
    width: 100px;
    padding: 0.5rem;
    border: 1px solid #444;
    border-radius: 4px;
    background: #0d0d15;
    color: #fff;
    font-size: 0.9rem;
    text-align: center;
  }
  
  .jump-section input::placeholder {
    color: #666;
  }
  
  .jump-section input:focus {
    outline: none;
    border-color: #3498db;
  }
  
  .jump-btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    background: #9b59b6;
    color: #fff;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .jump-btn:hover {
    background: #8e44ad;
  }
  
  .keyboard-hint {
    font-size: 0.75rem;
    color: #666;
  }
</style>
