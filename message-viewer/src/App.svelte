<script>
  import { onMount } from 'svelte';
  import HexBoard from './lib/components/HexBoard.svelte';
  import JsonViewer from './lib/components/JsonViewer.svelte';
  import Controls from './lib/components/Controls.svelte';
  import PlayerInfo from './lib/components/PlayerInfo.svelte';
  import { loadMessages, messageStore } from './stores/gameState.js';
  
  let loading = true;
  let error = null;
  
  onMount(async () => {
    try {
      // Load the JSON file from public folder
      const response = await fetch('/colonist-messages.json');
      if (!response.ok) {
        throw new Error(`Failed to load messages: ${response.status}`);
      }
      const data = await response.json();
      loadMessages(data);
      loading = false;
    } catch (err) {
      error = err.message;
      loading = false;
      console.error('Failed to load messages:', err);
    }
  });
  
  $: gameInfo = $messageStore.gameInfo;
</script>

<main>
  <header>
    <h1>Colonist Message Viewer</h1>
    {#if gameInfo}
      <div class="game-meta">
        <span>Game ID: {gameInfo.currentAction}</span>
        <span>•</span>
        <span>Players: {Object.keys(gameInfo.players || {}).length}</span>
      </div>
    {/if}
  </header>
  
  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading messages...</p>
    </div>
  {:else if error}
    <div class="error">
      <h2>Error Loading Messages</h2>
      <p>{error}</p>
      <p class="hint">Make sure colonist-messages.json exists in the public folder</p>
    </div>
  {:else}
    <div class="controls-bar">
      <Controls />
    </div>
    
    <div class="main-content">
      <div class="left-panel">
        <HexBoard />
        <PlayerInfo />
      </div>
      
      <div class="right-panel">
        <JsonViewer />
      </div>
    </div>
  {/if}
</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }
  
  :global(body) {
    margin: 0;
    padding: 0;
    background: #0f0f1a;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  }
  
  main {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    background: #1a1a2e;
    border-bottom: 1px solid #333;
  }
  
  h1 {
    margin: 0;
    font-size: 1.5rem;
    background: linear-gradient(135deg, #3498db, #9b59b6);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  
  .game-meta {
    display: flex;
    gap: 0.5rem;
    color: #888;
    font-size: 0.85rem;
  }
  
  .controls-bar {
    padding: 0.5rem 2rem;
    background: #16162a;
    border-bottom: 1px solid #333;
  }
  
  .main-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    padding: 1rem;
    flex: 1;
    overflow: hidden;
  }
  
  .left-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
  }
  
  .right-panel {
    overflow-y: auto;
  }
  
  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: 1rem;
  }
  
  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #333;
    border-top-color: #3498db;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  
  .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    text-align: center;
    padding: 2rem;
  }
  
  .error h2 {
    color: #e74c3c;
    margin-bottom: 0.5rem;
  }
  
  .error p {
    color: #888;
    margin: 0.25rem 0;
  }
  
  .error .hint {
    margin-top: 1rem;
    font-size: 0.85rem;
    color: #666;
  }
  
  /* Responsive */
  @media (max-width: 1200px) {
    .main-content {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
    }
  }
</style>
