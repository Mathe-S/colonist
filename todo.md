# Colonist Advisor - Implementation Plan

## Data Analysis Summary

### Message Types Discovered

| Type | Purpose | Key Data |
|------|---------|----------|
| `4` | Full game state (game start) | Board, players, all state |
| `91` | State diff (incremental updates) | Buildings, roads, resources, turns |
| `28` | Resource distribution | Who got what resources |
| `30` | Available settlement spots | Array of corner IDs |
| `31` | Available road spots | Array of edge IDs |
| `32` | Available city upgrade spots | Array of corner IDs |
| `33` | Available robber spots | Array of tile IDs |

### Game Constants

```javascript
// Tile Types
TILES = { 0: 'desert', 1: 'wheat', 2: 'sheep', 3: 'ore', 4: 'wood', 5: 'brick' }

// Resource Cards
RESOURCES = { 1: 'wood', 2: 'sheep', 3: 'ore', 4: 'wheat', 5: 'brick' }

// Port Types
PORTS = { 1: '3:1', 2: 'sheep', 3: 'brick', 4: 'ore', 5: 'wood', 6: 'wheat' }

// Action States
ACTIONS = {
  0: 'roll_dice',
  1: 'place_settlement', 
  3: 'place_road',
  7: 'main_turn',
  24: 'place_robber'
}

// Dice Probability (dots on number)
PROBABILITY = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 }
```

---

## Implementation Phases

### Phase 1: Data Parsing ✅ COMPLETE
- [x] Parse type 4 (full game state)
- [x] Parse type 91 diffs (buildings, roads, resources)
- [x] Track player resources
- [x] Track board state (tiles, corners, edges)
- [x] **Parse type 30** - Available settlement spots
- [x] **Parse type 31** - Available road spots  
- [x] **Parse type 32** - Available city spots
- [x] **Parse type 33** - Available robber spots
- [x] **Parse type 28** - Resource distribution tracking

### Phase 2: Board Topology ✅ COMPLETE
- [x] Basic corner-to-tile adjacency
- [x] **Edge-to-corner mapping** (which corners does each edge connect)
- [x] **Corner-to-edge mapping** (which edges are adjacent to each corner)
- [x] **Port-to-corner mapping** (getPortForCorner function)
- [x] **Distance rule validation** (server handles, fallback calculates)

### Phase 3: Settlement Suggestions ✅ COMPLETE
- [x] Enhanced probability scoring
- [x] **Use server's available spots (type 30)** 
- [x] **Resource diversity bonus** (12 pts per unique resource)
- [x] **Port access scoring** (2:1 ports +15, 3:1 ports +8)
- [x] **Expansion potential** (score nearby buildable corners)
- [x] **Strategic resource bonus** (ore/wheat for cities)
- [x] **Complementary resources** (bonus for new resource types)

### Phase 4: Road Suggestions ✅ COMPLETE
- [x] **Use server's available spots (type 31)**
- [x] **Expansion scoring** (roads toward good settlement spots)
- [x] **Port access paths** (bonus for leading to ports)
- [x] **Fallback calculation** (when server data unavailable)

### Phase 5: Build Priority Suggestions ✅ COMPLETE
- [x] **Resource analysis** (canAfford helper)
- [x] **City priority** (highest - doubles production)
- [x] **Settlement priority** (new resource access)
- [x] **Development card timing** (higher when >=7 cards!)
- [x] **Road priority** (higher when no settlement spots)
- [x] **Resource goal suggestions** (what to save for)

### Phase 6: Robber Strategy ✅ COMPLETE
- [x] **Use server's available spots (type 33)**
- [x] **Target opponent's best tiles** (highest probability)
- [x] **Protect own tiles** (negative score for self-blocking)
- [x] **City bonus** (extra points for blocking cities)
- [x] **suggestRobberPlacement()** function

### Phase 7: Resource Tracking 🔄 PARTIAL
- [x] **Exact tracking for self** (from type 91 diffs)
- [x] **Basic opponent tracking** (from type 28 distributions)
- [ ] **Steal prediction** (what resources opponent likely has)
- [ ] **Track trades and discards**

---

## Detailed Implementation Tasks

### Task 1: Parse Available Spots Messages

```javascript
// Add to MessageParser
handleIdMessage(msg) {
  const { id, data } = msg;
  
  // Type 30 = Available settlement spots
  if (data?.type === 30 && Array.isArray(data.payload)) {
    GameState.availableSettlements = data.payload;
    console.log(`${LOG_PREFIX} 🏠 Available settlements: ${data.payload.length} spots`);
  }
  
  // Type 31 = Available road spots
  if (data?.type === 31 && Array.isArray(data.payload)) {
    GameState.availableRoads = data.payload;
    console.log(`${LOG_PREFIX} 🛤️ Available roads: ${data.payload.length} spots`);
  }
  
  // Type 32 = Available city upgrades
  if (data?.type === 32 && Array.isArray(data.payload)) {
    GameState.availableCities = data.payload;
    console.log(`${LOG_PREFIX} 🏰 Available cities: ${data.payload.length} spots`);
  }
  
  // Type 33 = Available robber spots
  if (data?.type === 33 && Array.isArray(data.payload)) {
    GameState.availableRobberSpots = data.payload;
    console.log(`${LOG_PREFIX} 🦹 Available robber spots: ${data.payload.length} tiles`);
  }
}
```

### Task 2: Enhanced Corner Scoring

```javascript
scoreCorner(cornerId) {
  // Only score if server says it's available
  if (!GameState.availableSettlements.includes(cornerId)) {
    return { score: -1, reason: 'Not available' };
  }
  
  const corner = GameState.corners[cornerId];
  const tiles = corner?.adjacentTiles || [];
  
  let score = 0;
  let resources = new Set();
  let breakdown = {};
  
  // 1. Probability score (max ~15 for 6-8-5)
  let probScore = 0;
  for (const tileId of tiles) {
    const tile = GameState.tiles[tileId];
    if (tile && tile.type !== 0) { // Not desert
      probScore += PROBABILITY[tile.diceNumber] || 0;
      resources.add(tile.type);
    }
  }
  breakdown.probability = probScore;
  score += probScore;
  
  // 2. Diversity bonus (need all 5 resources)
  const diversityBonus = resources.size * 2;
  breakdown.diversity = diversityBonus;
  score += diversityBonus;
  
  // 3. Port access (check if corner is on a port edge)
  const portBonus = this.getPortBonus(cornerId);
  breakdown.port = portBonus;
  score += portBonus;
  
  // 4. Avoid robber
  const robberPenalty = tiles.includes(GameState.robberTile) ? -3 : 0;
  breakdown.robber = robberPenalty;
  score += robberPenalty;
  
  // 5. Rare resource bonus (ore/wheat for cities, brick/wood early)
  const rareBonus = this.getRareResourceBonus(tiles);
  breakdown.rare = rareBonus;
  score += rareBonus;
  
  return { cornerId, score, resources: Array.from(resources), breakdown };
}
```

### Task 3: Road Scoring

```javascript
scoreRoad(edgeId) {
  if (!GameState.availableRoads.includes(edgeId)) {
    return { score: -1, reason: 'Not available' };
  }
  
  let score = 0;
  let breakdown = {};
  
  // 1. Expansion potential (leads to good settlement spots)
  const reachableCorners = this.getCornersFromEdge(edgeId);
  let expansionScore = 0;
  for (const cornerId of reachableCorners) {
    if (GameState.availableSettlements.includes(cornerId)) {
      const cornerScore = this.scoreCorner(cornerId).score;
      expansionScore += cornerScore * 0.5; // Discount future value
    }
  }
  breakdown.expansion = expansionScore;
  score += expansionScore;
  
  // 2. Port access
  const portAccess = this.leadsToPort(edgeId);
  breakdown.port = portAccess ? 3 : 0;
  score += portAccess ? 3 : 0;
  
  // 3. Longest road contribution
  const roadBonus = this.longestRoadValue(edgeId);
  breakdown.longestRoad = roadBonus;
  score += roadBonus;
  
  return { edgeId, score, breakdown };
}
```

### Task 4: Build Priority Logic

```javascript
suggestBuildPriority() {
  const resources = GameState.myResources;
  const suggestions = [];
  
  // Can afford city? (3 ore, 2 wheat)
  if (resources.ore >= 3 && resources.wheat >= 2) {
    if (GameState.availableCities.length > 0) {
      suggestions.push({
        action: 'BUILD_CITY',
        priority: 10,
        reason: 'Cities double production and give +1 VP'
      });
    }
  }
  
  // Can afford settlement? (1 each: wood, brick, sheep, wheat)
  if (resources.wood >= 1 && resources.brick >= 1 && 
      resources.sheep >= 1 && resources.wheat >= 1) {
    if (GameState.availableSettlements.length > 0) {
      const bestSpot = this.getBestSettlement();
      suggestions.push({
        action: 'BUILD_SETTLEMENT',
        priority: 8,
        where: bestSpot,
        reason: 'Expand to new resources'
      });
    }
  }
  
  // Can afford dev card? (1 ore, 1 sheep, 1 wheat)
  if (resources.ore >= 1 && resources.sheep >= 1 && resources.wheat >= 1) {
    const devCardPriority = this.getDevCardPriority();
    suggestions.push({
      action: 'BUY_DEV_CARD',
      priority: devCardPriority,
      reason: 'Knights protect from robber, VP cards win games'
    });
  }
  
  // Can afford road? (1 wood, 1 brick)
  if (resources.wood >= 1 && resources.brick >= 1) {
    if (GameState.availableRoads.length > 0) {
      const bestRoad = this.getBestRoad();
      suggestions.push({
        action: 'BUILD_ROAD',
        priority: 4,
        where: bestRoad,
        reason: 'Expand toward good spots or longest road'
      });
    }
  }
  
  // Sort by priority
  return suggestions.sort((a, b) => b.priority - a.priority);
}
```

---

## Testing Checklist

- [ ] Bot game: Initial settlement suggestions work
- [ ] Bot game: Road suggestions after settlement
- [ ] Bot game: Build priority during main turn
- [ ] **1v1 game: All of the above work**
- [ ] 1v1 game: Opponent moves are tracked
- [ ] 1v1 game: Robber suggestions appear on 7
- [ ] Performance: No lag during gameplay

---

## Files to Modify

1. **content.js**
   - Add parsing for types 28, 30, 31, 32, 33
   - Enhance GameState with availableX arrays
   - Improve Advisor scoring functions
   - Add build priority logic

2. **injected.js**
   - No changes needed (data capture working)

3. **New file: strategy.js** (optional)
   - Move Advisor logic to separate file
   - Add advanced heuristics
   - Add opponent modeling

---

## Status

### ✅ Completed
1. ~~Parse type 30/31/32/33 (available spots)~~
2. ~~Use available spots in suggestions~~
3. ~~Enhance scoring with diversity/ports/expansion~~
4. ~~Add build priority logic with context~~
5. ~~Add robber placement suggestions~~
6. ~~Basic opponent resource tracking~~

### 🔜 Future Improvements
1. Longest road calculation and strategy
2. Largest army tracking
3. Trade suggestions (when to trade with bank)
4. Development card play timing
5. Opponent resource probability (steal targeting)
6. End-game VP path calculation

---

## Message Viewer App (Svelte)

A debugging tool to replay game messages one-by-one and visualize their effects.

**Location:** `/message-viewer/`

### Phase 1: Project Setup ✅
- [x] Initialize Svelte project with Vite
- [x] Set up project structure
- [x] Configure to load JSON file from public folder
- [x] Basic dev server on localhost

### Phase 2: Core State Management ✅
- [x] Create GameState store (Svelte writable)
- [x] Message parser that processes each message type
- [x] Cumulative state builder (apply message → update state)
- [x] Support stepping forward/backward through messages

### Phase 3: Message Type Labels (Reverse Engineering) ✅
- [x] Type 1: `SESSION_START` - Game session initialization
- [x] Type 2: `SESSION_ID` - Session identifier
- [x] Type 4: `FULL_STATE` - Complete game state snapshot
- [x] Type 5: `PAUSE_STATE` - Game pause status
- [x] Type 6: `READY_STATE` - Player ready status
- [x] Type 28: `RESOURCE_DISTRIBUTION` - Who got what resources
- [x] Type 30: `AVAILABLE_SETTLEMENTS` - Valid settlement spots
- [x] Type 31: `AVAILABLE_ROADS` - Valid road spots
- [x] Type 32: `AVAILABLE_CITIES` - Valid city upgrade spots
- [x] Type 33: `AVAILABLE_ROBBER_SPOTS` - Valid robber placement tiles
- [x] Type 48: `EMOTES_LIST` - Available emotes
- [x] Type 59: `TRADE_OFFERS` - Active trade offers
- [x] Type 62: `TRADE_STATE` - Trade state changes
- [x] Type 69: `PING` - Keep-alive ping
- [x] Type 78: `GAME_ACTIVE` - Game active status
- [x] Type 80: `TURN_END` - Turn ended
- [x] Type 91: `STATE_DIFF` - Incremental state update

### Phase 4: JSON Viewer Panel ✅
- [x] Display current message with syntax highlighting
- [x] Show message type label and description
- [x] Highlight payload differences from previous state
- [x] Collapsible JSON tree view

### Phase 5: Game Board Visualization ✅
- [x] Render hex grid (19 tiles)
- [x] Display tile types with colors (wood, brick, sheep, wheat, ore, desert)
- [x] Show dice numbers on tiles
- [ ] Display ports around the board (TODO: improve port rendering)
- [x] Render settlements/cities on corners
- [x] Render roads on edges
- [x] Show robber position
- [x] Highlight available spots when message is applied

### Phase 6: Player Info Panel ✅
- [x] Show all players with colors
- [x] Display resource cards (for own player)
- [ ] Show victory points (TODO)
- [x] Display current turn indicator
- [x] Show current action state

### Phase 7: Controls & Navigation ✅
- [x] Step forward button (→)
- [x] Step backward button (←)
- [x] Message index display (e.g., "5 / 20")
- [x] Jump to specific message (input field)
- [x] Keyboard shortcuts (arrow keys)
- [ ] Reset to beginning button (use backward to go to 0)

### Phase 8: Polish
- [ ] Responsive layout (side-by-side panels)
- [ ] Dark theme styling
- [ ] Loading state for JSON
- [ ] Error handling for malformed messages
- [ ] Message timestamp display

### Tech Stack
- **Framework:** Svelte + Vite
- **Styling:** CSS (or Tailwind if preferred)
- **State:** Svelte stores
- **No backend needed** - pure client-side

### Game Constants Reference
```javascript
TILE_TYPES = { 0: 'desert', 1: 'wheat', 2: 'sheep', 3: 'ore', 4: 'wood', 5: 'brick' }
RESOURCES = { 1: 'wood', 2: 'sheep', 3: 'ore', 4: 'wheat', 5: 'brick' }
PORTS = { 1: '3:1', 2: 'sheep', 3: 'brick', 4: 'ore', 5: 'wood', 6: 'wheat' }
PLAYER_COLORS = { 1: 'red', 2: 'blue', 3: 'orange', 4: 'white' }
```
