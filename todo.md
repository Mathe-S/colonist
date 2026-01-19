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

### Phase 1: Data Parsing ✅ (Mostly Complete)
- [x] Parse type 4 (full game state)
- [x] Parse type 91 diffs (buildings, roads, resources)
- [x] Track player resources
- [x] Track board state (tiles, corners, edges)
- [ ] **Parse type 30** - Available settlement spots
- [ ] **Parse type 31** - Available road spots  
- [ ] **Parse type 32** - Available city spots
- [ ] **Parse type 33** - Available robber spots
- [ ] **Parse type 28** - Resource distribution details

### Phase 2: Board Topology
- [x] Basic corner-to-tile adjacency
- [ ] **Edge-to-corner mapping** (which corners does each edge connect)
- [ ] **Corner-to-edge mapping** (which edges are adjacent to each corner)
- [ ] **Port-to-corner mapping** (which corners have port access)
- [ ] **Distance rule validation** (corners 2+ edges apart)

### Phase 3: Settlement Suggestions
- [x] Basic probability scoring
- [ ] **Use server's available spots (type 30)** instead of calculating
- [ ] **Resource diversity bonus** (cover all 5 types across settlements)
- [ ] **Port access scoring** (2:1 ports valuable, 3:1 as fallback)
- [ ] **Expansion potential** (good 2nd/3rd settlement spots reachable)
- [ ] **Blocking strategy** (deny opponent key spots in 1v1)

### Phase 4: Road Suggestions
- [ ] **Use server's available spots (type 31)**
- [ ] **Expansion scoring** (roads toward good settlement spots)
- [ ] **Longest road tracking** (when to push for 2 VP)
- [ ] **Port access paths** (build toward valuable ports)
- [ ] **Blocking opponent** (cut off their expansion)

### Phase 5: Build Priority Suggestions
- [ ] **Resource analysis** (what can we afford?)
- [ ] **City priority** (2x resources, +1 VP)
- [ ] **Settlement priority** (new resource access)
- [ ] **Development card timing** (knight for robber, VP cards late)
- [ ] **Road priority** (only when expanding or longest road)

### Phase 6: Robber Strategy
- [ ] **Use server's available spots (type 33)**
- [ ] **Target opponent's best tiles** (highest probability)
- [ ] **Protect own tiles** (don't block self)
- [ ] **Resource denial** (block what opponent needs)

### Phase 7: Resource Tracking
- [ ] **Exact tracking for self** (from type 91 diffs)
- [ ] **Probability tracking for opponent** (from type 28 distributions)
- [ ] **Steal prediction** (what resources opponent likely has)

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

## Priority Order

1. ⭐ Parse type 30/31 (available spots) - **Critical for accurate suggestions**
2. ⭐ Use available spots in suggestions - **Stop suggesting invalid spots**
3. Enhance scoring with diversity/ports
4. Add build priority logic
5. Add robber suggestions
6. Add opponent resource tracking
