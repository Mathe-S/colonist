<script>
  import { gameState } from '../../stores/gameState.js';
  import { PLAYER_COLORS, RESOURCES, ACTION_STATES } from '../constants.js';
  
  $: players = Object.entries($gameState.players || {});
  $: myColor = $gameState.myColor;
  $: currentTurnColor = $gameState.currentTurnColor;
  $: currentAction = $gameState.currentAction;
  $: myResources = $gameState.myResources;
  $: diceState = $gameState.diceState;
  $: turnNumber = $gameState.turnNumber;
  
  function getActionName(action) {
    return ACTION_STATES[action] || `unknown_${action}`;
  }
</script>

<div class="player-info">
  <h3>Game State</h3>
  
  <!-- Turn info -->
  <div class="turn-section">
    <div class="turn-row">
      <span class="label">Turn:</span>
      <span class="value">{turnNumber}</span>
    </div>
    <div class="turn-row">
      <span class="label">Action:</span>
      <span class="value action">{getActionName(currentAction)}</span>
    </div>
  </div>
  
  <!-- Dice -->
  {#if diceState.diceThrown}
    <div class="dice-section">
      <span class="dice">{diceState.dice1}</span>
      <span class="dice-plus">+</span>
      <span class="dice">{diceState.dice2}</span>
      <span class="dice-equals">=</span>
      <span class="dice-total">{diceState.dice1 + diceState.dice2}</span>
    </div>
  {:else}
    <div class="dice-section waiting">
      <span>Dice not rolled</span>
    </div>
  {/if}
  
  <!-- Players -->
  <div class="players-section">
    <h4>Players</h4>
    {#each players as [color, player]}
      {@const colorInfo = PLAYER_COLORS[color] || { hex: '#888', name: 'unknown' }}
      {@const isMe = parseInt(color) === myColor}
      {@const isTurn = parseInt(color) === currentTurnColor}
      <div 
        class="player-card" 
        class:is-me={isMe}
        class:is-turn={isTurn}
        style="border-left-color: {colorInfo.hex}"
      >
        <div class="player-header">
          <span class="player-name">
            {player.username}
            {#if isMe}<span class="you-badge">YOU</span>{/if}
          </span>
          {#if isTurn}
            <span class="turn-indicator">⏳</span>
          {/if}
        </div>
        <div class="player-color">
          <span 
            class="color-dot" 
            style="background: {colorInfo.hex}"
          ></span>
          {colorInfo.name}
        </div>
      </div>
    {/each}
  </div>
  
  <!-- My Resources -->
  {#if myColor}
    <div class="resources-section">
      <h4>My Resources</h4>
      <div class="resource-grid">
        {#each Object.entries(RESOURCES) as [id, resource]}
          {@const count = myResources[resource.name] || 0}
          <div class="resource-item" class:has-resource={count > 0}>
            <span class="resource-emoji">{resource.emoji}</span>
            <span class="resource-count">{count}</span>
            <span class="resource-name">{resource.name}</span>
          </div>
        {/each}
      </div>
      <div class="resource-total">
        Total: {Object.values(myResources).reduce((a, b) => a + b, 0)} cards
      </div>
    </div>
  {/if}
  
  <!-- Available actions summary -->
  <div class="available-section">
    <h4>Available Spots</h4>
    <div class="available-grid">
      <div class="available-item">
        <span class="available-icon">🏠</span>
        <span class="available-count">{$gameState.availableSettlements?.length || 0}</span>
        <span class="available-label">settlements</span>
      </div>
      <div class="available-item">
        <span class="available-icon">🛤️</span>
        <span class="available-count">{$gameState.availableRoads?.length || 0}</span>
        <span class="available-label">roads</span>
      </div>
      <div class="available-item">
        <span class="available-icon">🏰</span>
        <span class="available-count">{$gameState.availableCities?.length || 0}</span>
        <span class="available-label">cities</span>
      </div>
      <div class="available-item">
        <span class="available-icon">🦹</span>
        <span class="available-count">{$gameState.availableRobberSpots?.length || 0}</span>
        <span class="available-label">robber</span>
      </div>
    </div>
  </div>
</div>

<style>
  .player-info {
    background: #1e1e2e;
    border-radius: 8px;
    padding: 1rem;
  }
  
  h3 {
    margin: 0 0 1rem 0;
    color: #fff;
    font-size: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #333;
  }
  
  h4 {
    margin: 0 0 0.5rem 0;
    color: #aaa;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .turn-section {
    background: rgba(255, 255, 255, 0.05);
    padding: 0.5rem;
    border-radius: 4px;
    margin-bottom: 1rem;
  }
  
  .turn-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    margin-bottom: 0.25rem;
  }
  
  .turn-row .label {
    color: #888;
  }
  
  .turn-row .value {
    color: #ddd;
  }
  
  .turn-row .action {
    color: #3498db;
    font-family: monospace;
  }
  
  .dice-section {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    margin-bottom: 1rem;
  }
  
  .dice-section.waiting {
    color: #666;
    font-size: 0.85rem;
  }
  
  .dice {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    color: #333;
    font-weight: bold;
    font-size: 1.2rem;
    border-radius: 4px;
  }
  
  .dice-plus, .dice-equals {
    color: #666;
  }
  
  .dice-total {
    font-size: 1.5rem;
    font-weight: bold;
    color: #f1c40f;
  }
  
  .players-section {
    margin-bottom: 1rem;
  }
  
  .player-card {
    background: rgba(255, 255, 255, 0.05);
    padding: 0.5rem;
    border-radius: 4px;
    margin-bottom: 0.5rem;
    border-left: 3px solid #666;
  }
  
  .player-card.is-turn {
    background: rgba(52, 152, 219, 0.1);
  }
  
  .player-card.is-me {
    background: rgba(46, 204, 113, 0.1);
  }
  
  .player-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .player-name {
    color: #fff;
    font-size: 0.9rem;
  }
  
  .you-badge {
    background: #2ecc71;
    color: #fff;
    font-size: 0.6rem;
    padding: 0.1rem 0.3rem;
    border-radius: 2px;
    margin-left: 0.5rem;
  }
  
  .turn-indicator {
    font-size: 1rem;
  }
  
  .player-color {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: #888;
    margin-top: 0.25rem;
  }
  
  .color-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  
  .resources-section {
    margin-bottom: 1rem;
  }
  
  .resource-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.25rem;
  }
  
  .resource-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.5rem 0.25rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    opacity: 0.5;
  }
  
  .resource-item.has-resource {
    opacity: 1;
    background: rgba(46, 204, 113, 0.1);
  }
  
  .resource-emoji {
    font-size: 1.2rem;
  }
  
  .resource-count {
    font-size: 1rem;
    font-weight: bold;
    color: #fff;
  }
  
  .resource-name {
    font-size: 0.6rem;
    color: #888;
    text-transform: uppercase;
  }
  
  .resource-total {
    text-align: center;
    margin-top: 0.5rem;
    font-size: 0.8rem;
    color: #888;
  }
  
  .available-section {
    margin-top: 1rem;
  }
  
  .available-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }
  
  .available-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    font-size: 0.8rem;
  }
  
  .available-icon {
    font-size: 1rem;
  }
  
  .available-count {
    font-weight: bold;
    color: #3498db;
  }
  
  .available-label {
    color: #888;
  }
</style>
