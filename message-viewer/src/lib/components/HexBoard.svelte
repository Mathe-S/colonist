<script>
  import { TILE_TYPES, PLAYER_COLORS, DICE_PROBABILITY } from '../constants.js';
  import { gameState } from '../../stores/gameState.js';
  
  // Hex dimensions
  const HEX_SIZE = 40;
  const HEX_WIDTH = HEX_SIZE * Math.sqrt(3);
  const HEX_HEIGHT = HEX_SIZE * 2;
  
  // Board center
  const CENTER_X = 300;
  const CENTER_Y = 250;
  
  // Convert axial coordinates to pixel position
  function axialToPixel(x, y) {
    const px = CENTER_X + HEX_WIDTH * (x + y / 2);
    const py = CENTER_Y + HEX_HEIGHT * 0.75 * y;
    return { px, py };
  }
  
  // Generate hex path
  function hexPath(cx, cy, size) {
    const points = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const px = cx + size * Math.cos(angle);
      const py = cy + size * Math.sin(angle);
      points.push(`${px},${py}`);
    }
    return points.join(' ');
  }
  
  // Get corner position (for settlements/cities)
  function getCornerPosition(corner) {
    if (!corner) return null;
    const { x, y, z } = corner;
    const { px, py } = axialToPixel(x, y);
    
    // z determines which corner of the hex (0 = top, 1 = bottom)
    const offsetY = z === 0 ? -HEX_SIZE : HEX_SIZE;
    return { x: px, y: py + offsetY };
  }
  
  // Get edge position (for roads)
  function getEdgePosition(edge) {
    if (!edge) return null;
    const { x, y, z } = edge;
    const { px, py } = axialToPixel(x, y);
    
    // z determines edge direction (0=top-right, 1=right, 2=bottom-right)
    const angles = {
      0: -Math.PI / 6,      // top-right
      1: Math.PI / 6,       // right  
      2: Math.PI / 2        // bottom-right
    };
    
    const angle = angles[z] || 0;
    const dist = HEX_SIZE * 0.866;
    
    return {
      x1: px,
      y1: py,
      x2: px + dist * Math.cos(angle),
      y2: py + dist * Math.sin(angle)
    };
  }
  
  // Reactive derived values
  $: tiles = Object.entries($gameState.tiles || {});
  $: settlements = Object.entries($gameState.settlements || {});
  $: cities = Object.entries($gameState.cities || {});
  $: roads = Object.entries($gameState.roads || {});
  $: robberTile = $gameState.robberTile;
  $: availableSettlements = $gameState.availableSettlements || [];
  $: availableRoads = $gameState.availableRoads || [];
</script>

<div class="board-container">
  <svg viewBox="0 0 600 500" class="hex-board">
    <!-- Background -->
    <rect width="600" height="500" fill="#1a5276"/>
    
    <!-- Ocean background circle -->
    <circle cx={CENTER_X} cy={CENTER_Y} r="220" fill="#2980b9" opacity="0.5"/>
    
    <!-- Tiles -->
    {#each tiles as [id, tile]}
      {@const pos = axialToPixel(tile.x, tile.y)}
      {@const tileType = TILE_TYPES[tile.type] || TILE_TYPES[0]}
      {@const isRobber = parseInt(id) === robberTile}
      <g class="tile" class:robber={isRobber}>
        <polygon 
          points={hexPath(pos.px, pos.py, HEX_SIZE - 2)}
          fill={tileType.color}
          stroke="#2c3e50"
          stroke-width="2"
        />
        
        <!-- Dice number chip -->
        {#if tile.diceNumber && tile.type !== 0}
          {@const prob = DICE_PROBABILITY[tile.diceNumber] || 0}
          <circle 
            cx={pos.px} 
            cy={pos.py} 
            r="14" 
            fill="#f5f5dc"
            stroke="#333"
            stroke-width="1"
          />
          <text 
            x={pos.px} 
            y={pos.py + 5} 
            text-anchor="middle" 
            font-size="14"
            font-weight="bold"
            fill={tile.diceNumber === 6 || tile.diceNumber === 8 ? '#c0392b' : '#333'}
          >
            {tile.diceNumber}
          </text>
          <!-- Probability dots -->
          <text 
            x={pos.px} 
            y={pos.py + 18} 
            text-anchor="middle" 
            font-size="8"
            fill="#666"
          >
            {'•'.repeat(prob)}
          </text>
        {/if}
        
        <!-- Robber indicator -->
        {#if isRobber}
          <text 
            x={pos.px} 
            y={pos.py - 20} 
            text-anchor="middle" 
            font-size="24"
          >
            🦹
          </text>
        {/if}
      </g>
    {/each}
    
    <!-- Available road spots (highlighted) -->
    {#each availableRoads as edgeId}
      {@const edge = $gameState.edges[edgeId]}
      {#if edge}
        {@const edgePos = getEdgePosition(edge)}
        {#if edgePos}
          <line
            x1={edgePos.x1}
            y1={edgePos.y1}
            x2={edgePos.x2}
            y2={edgePos.y2}
            stroke="#2ecc71"
            stroke-width="6"
            opacity="0.4"
            stroke-linecap="round"
          />
        {/if}
      {/if}
    {/each}
    
    <!-- Roads -->
    {#each roads as [edgeId, playerColor]}
      {@const edge = $gameState.edges[edgeId]}
      {#if edge}
        {@const edgePos = getEdgePosition(edge)}
        {@const color = PLAYER_COLORS[playerColor]?.hex || '#fff'}
        {#if edgePos}
          <line
            x1={edgePos.x1}
            y1={edgePos.y1}
            x2={edgePos.x2}
            y2={edgePos.y2}
            stroke={color}
            stroke-width="6"
            stroke-linecap="round"
          />
        {/if}
      {/if}
    {/each}
    
    <!-- Available settlement spots (highlighted) -->
    {#each availableSettlements as cornerId}
      {@const corner = $gameState.corners[cornerId]}
      {#if corner}
        {@const cornerPos = getCornerPosition(corner)}
        {#if cornerPos}
          <circle
            cx={cornerPos.x}
            cy={cornerPos.y}
            r="10"
            fill="#2ecc71"
            opacity="0.4"
          />
        {/if}
      {/if}
    {/each}
    
    <!-- Settlements -->
    {#each settlements as [cornerId, playerColor]}
      {@const corner = $gameState.corners[cornerId]}
      {#if corner}
        {@const cornerPos = getCornerPosition(corner)}
        {@const color = PLAYER_COLORS[playerColor]?.hex || '#fff'}
        {#if cornerPos}
          <rect
            x={cornerPos.x - 8}
            y={cornerPos.y - 8}
            width="16"
            height="16"
            fill={color}
            stroke="#2c3e50"
            stroke-width="2"
            transform="rotate(45 {cornerPos.x} {cornerPos.y})"
          />
        {/if}
      {/if}
    {/each}
    
    <!-- Cities -->
    {#each cities as [cornerId, playerColor]}
      {@const corner = $gameState.corners[cornerId]}
      {#if corner}
        {@const cornerPos = getCornerPosition(corner)}
        {@const color = PLAYER_COLORS[playerColor]?.hex || '#fff'}
        {#if cornerPos}
          <rect
            x={cornerPos.x - 10}
            y={cornerPos.y - 10}
            width="20"
            height="20"
            fill={color}
            stroke="#f1c40f"
            stroke-width="3"
          />
          <text
            x={cornerPos.x}
            y={cornerPos.y + 4}
            text-anchor="middle"
            font-size="12"
            fill="#2c3e50"
          >
            🏰
          </text>
        {/if}
      {/if}
    {/each}
  </svg>
  
  <!-- Legend -->
  <div class="legend">
    <div class="legend-title">Tile Types</div>
    <div class="legend-items">
      {#each Object.entries(TILE_TYPES) as [type, info]}
        <div class="legend-item">
          <span class="color-box" style="background: {info.color}"></span>
          <span>{info.name}</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .board-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1rem;
    background: #1a1a2e;
    border-radius: 8px;
  }
  
  .hex-board {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }
  
  .tile.robber polygon {
    stroke: #e74c3c;
    stroke-width: 3;
  }
  
  .legend {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  }
  
  .legend-title {
    font-size: 0.8rem;
    color: #aaa;
    margin-bottom: 0.5rem;
  }
  
  .legend-items {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  
  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: #ddd;
  }
  
  .color-box {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    border: 1px solid #555;
  }
</style>
