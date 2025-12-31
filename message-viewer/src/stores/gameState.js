import { writable, derived } from 'svelte/store';

// Create initial empty game state
function createInitialState() {
  return {
    // Players
    players: {},
    myColor: null,
    currentTurnColor: null,
    currentAction: null,

    // Board
    tiles: {},
    corners: {},
    edges: {},
    ports: {},

    // Buildings
    settlements: {},  // cornerId -> playerColor
    cities: {},       // cornerId -> playerColor
    roads: {},        // edgeId -> playerColor

    // Game mechanics
    robberTile: null,
    diceState: { dice1: 0, dice2: 0, diceThrown: false },
    bankResources: {},

    // Player resources (own)
    myResources: { wood: 0, sheep: 0, ore: 0, wheat: 0, brick: 0 },

    // Available actions
    availableSettlements: [],
    availableRoads: [],
    availableCities: [],
    availableRobberSpots: [],

    // Game log
    gameLog: [],

    // Meta
    turnNumber: 0,
    gamePhase: 'setup'
  };
}

// Main game state store
export const gameState = writable(createInitialState());

// Message navigation store
export const messageStore = writable({
  messages: [],
  currentIndex: -1,
  gameInfo: null
});

// Derived store for current message
export const currentMessage = derived(messageStore, ($store) => {
  if ($store.currentIndex >= 0 && $store.currentIndex < $store.messages.length) {
    return $store.messages[$store.currentIndex];
  }
  return null;
});

// Derived store for navigation info
export const navigationInfo = derived(messageStore, ($store) => ({
  current: $store.currentIndex + 1,
  total: $store.messages.length,
  canGoBack: $store.currentIndex > 0,
  canGoForward: $store.currentIndex < $store.messages.length - 1
}));

// State history for backward navigation
let stateHistory = [];

// Reset everything
export function resetState() {
  gameState.set(createInitialState());
  stateHistory = [];
}

// Load messages from JSON data
export function loadMessages(jsonData) {
  resetState();
  
  messageStore.set({
    messages: jsonData.messages || [],
    currentIndex: -1,
    gameInfo: jsonData.gameInfo || null
  });

  // Initialize with game info if available
  if (jsonData.gameInfo) {
    gameState.update(state => ({
      ...state,
      myColor: jsonData.gameInfo.myColor,
      players: jsonData.gameInfo.players || {},
      currentAction: jsonData.gameInfo.currentAction,
      currentTurnColor: jsonData.gameInfo.currentTurnColor
    }));
  }
}

// Save current state to history
function saveStateToHistory() {
  let currentState;
  gameState.subscribe(s => currentState = s)();
  stateHistory.push(JSON.parse(JSON.stringify(currentState)));
}

// Step forward one message
export function stepForward() {
  messageStore.update(store => {
    if (store.currentIndex < store.messages.length - 1) {
      // Save current state before applying new message
      saveStateToHistory();
      
      const newIndex = store.currentIndex + 1;
      const message = store.messages[newIndex];
      
      // Apply the message to game state
      applyMessage(message);
      
      return { ...store, currentIndex: newIndex };
    }
    return store;
  });
}

// Step backward one message
export function stepBackward() {
  messageStore.update(store => {
    if (store.currentIndex > 0 && stateHistory.length > 0) {
      // Restore previous state
      const previousState = stateHistory.pop();
      gameState.set(previousState);
      
      return { ...store, currentIndex: store.currentIndex - 1 };
    } else if (store.currentIndex === 0) {
      // Go back to initial state
      resetState();
      // Re-apply game info
      messageStore.update(s => {
        if (s.gameInfo) {
          gameState.update(state => ({
            ...state,
            myColor: s.gameInfo.myColor,
            players: s.gameInfo.players || {},
            currentAction: s.gameInfo.currentAction,
            currentTurnColor: s.gameInfo.currentTurnColor
          }));
        }
        return s;
      });
      return { ...store, currentIndex: -1 };
    }
    return store;
  });
}

// Jump to specific message index
export function jumpToMessage(targetIndex) {
  messageStore.update(store => {
    if (targetIndex < 0 || targetIndex >= store.messages.length) {
      return store;
    }
    
    // Reset and replay from beginning
    resetState();
    stateHistory = [];
    
    // Re-apply game info
    if (store.gameInfo) {
      gameState.update(state => ({
        ...state,
        myColor: store.gameInfo.myColor,
        players: store.gameInfo.players || {},
        currentAction: store.gameInfo.currentAction,
        currentTurnColor: store.gameInfo.currentTurnColor
      }));
    }
    
    // Apply all messages up to target
    for (let i = 0; i <= targetIndex; i++) {
      if (i < targetIndex) {
        saveStateToHistory();
      }
      applyMessage(store.messages[i]);
    }
    
    return { ...store, currentIndex: targetIndex };
  });
}

// Apply a single message to the game state
function applyMessage(message) {
  if (!message?.data?.data) return;
  
  const { type, payload } = message.data.data;
  
  gameState.update(state => {
    const newState = { ...state };
    
    switch (type) {
      case 4: // FULL_STATE - Complete game state
        applyFullState(newState, payload);
        break;
        
      case 91: // STATE_DIFF - Incremental update
        applyStateDiff(newState, payload);
        break;
        
      case 30: // AVAILABLE_SETTLEMENTS
        if (Array.isArray(payload)) {
          newState.availableSettlements = payload;
        }
        break;
        
      case 31: // AVAILABLE_ROADS
        if (Array.isArray(payload)) {
          newState.availableRoads = payload;
        }
        break;
        
      case 32: // AVAILABLE_CITIES
        if (Array.isArray(payload)) {
          newState.availableCities = payload;
        }
        break;
        
      case 33: // AVAILABLE_ROBBER_SPOTS
        if (Array.isArray(payload)) {
          newState.availableRobberSpots = payload;
        }
        break;
        
      case 28: // RESOURCE_DISTRIBUTION
        // Usually empty array or contains resource distribution
        break;
        
      case 5: // PAUSE_STATE
        if (payload) {
          newState.gamePaused = payload.paused;
        }
        break;
        
      case 6: // READY_STATE
        newState.gameReady = payload;
        break;
        
      case 78: // GAME_ACTIVE
        newState.gameActive = payload;
        break;
        
      default:
        // Unknown message type - log for debugging
        console.log(`Unhandled message type: ${type}`, payload);
    }
    
    return newState;
  });
}

// Apply full game state (type 4)
function applyFullState(state, payload) {
  if (!payload) return;
  
  // Player info
  if (payload.playerColor) {
    state.myColor = payload.playerColor;
  }
  
  // Game state
  const gs = payload.gameState;
  if (!gs) return;
  
  // Dice
  if (gs.diceState) {
    state.diceState = gs.diceState;
  }
  
  // Bank resources
  if (gs.bankState?.resourceCards) {
    state.bankResources = gs.bankState.resourceCards;
  }
  
  // Map state
  if (gs.mapState) {
    // Tiles
    if (gs.mapState.tileHexStates) {
      state.tiles = gs.mapState.tileHexStates;
    }
    
    // Corners
    if (gs.mapState.tileCornerStates) {
      state.corners = gs.mapState.tileCornerStates;
    }
    
    // Edges
    if (gs.mapState.tileEdgeStates) {
      state.edges = gs.mapState.tileEdgeStates;
    }
    
    // Ports
    if (gs.mapState.portEdgeStates) {
      state.ports = gs.mapState.portEdgeStates;
    }
  }
  
  // Current state
  if (gs.currentState) {
    state.turnNumber = gs.currentState.completedTurns || 0;
    state.currentTurnColor = gs.currentState.currentTurnPlayerColor;
    state.currentAction = gs.currentState.actionState;
  }
  
  // Robber
  if (gs.mechanicRobberState) {
    state.robberTile = gs.mechanicRobberState.locationTileIndex;
  }
  
  // Player states
  if (gs.playerStates) {
    for (const [color, playerState] of Object.entries(gs.playerStates)) {
      if (parseInt(color) === state.myColor && playerState.resourceCards?.cards) {
        state.myResources = countResources(playerState.resourceCards.cards);
      }
    }
  }
  
  // Player user states
  if (payload.playerUserStates) {
    for (const player of payload.playerUserStates) {
      state.players[player.selectedColor] = {
        username: player.username,
        color: player.selectedColor,
        userId: player.userId,
        isBot: player.isBot
      };
    }
  }
  
  // Parse existing buildings from corners/edges
  parseBuildings(state, gs);
}

// Apply state diff (type 91)
function applyStateDiff(state, payload) {
  if (!payload?.diff) return;
  
  const diff = payload.diff;
  
  // Update current state
  if (diff.currentState) {
    if (diff.currentState.currentTurnPlayerColor !== undefined) {
      state.currentTurnColor = diff.currentState.currentTurnPlayerColor;
    }
    if (diff.currentState.actionState !== undefined) {
      state.currentAction = diff.currentState.actionState;
    }
    if (diff.currentState.completedTurns !== undefined) {
      state.turnNumber = diff.currentState.completedTurns;
    }
  }
  
  // Update dice
  if (diff.diceState) {
    state.diceState = { ...state.diceState, ...diff.diceState };
  }
  
  // Update player states
  if (diff.playerStates) {
    for (const [color, playerDiff] of Object.entries(diff.playerStates)) {
      if (parseInt(color) === state.myColor && playerDiff.resourceCards?.cards) {
        state.myResources = countResources(playerDiff.resourceCards.cards);
      }
    }
  }
  
  // Update map state (buildings)
  if (diff.mapState) {
    if (diff.mapState.tileCornerStates) {
      for (const [cornerId, cornerData] of Object.entries(diff.mapState.tileCornerStates)) {
        if (cornerData.s !== undefined) {
          // Settlement placed
          state.settlements[cornerId] = cornerData.s;
        }
        if (cornerData.c !== undefined) {
          // City placed (upgrade)
          delete state.settlements[cornerId];
          state.cities[cornerId] = cornerData.c;
        }
      }
    }
    
    if (diff.mapState.tileEdgeStates) {
      for (const [edgeId, edgeData] of Object.entries(diff.mapState.tileEdgeStates)) {
        if (edgeData.r !== undefined) {
          // Road placed
          state.roads[edgeId] = edgeData.r;
        }
      }
    }
  }
  
  // Update robber
  if (diff.mechanicRobberState?.locationTileIndex !== undefined) {
    state.robberTile = diff.mechanicRobberState.locationTileIndex;
  }
  
  // Clear available spots when action changes
  if (diff.currentState?.actionState !== undefined) {
    state.availableSettlements = [];
    state.availableRoads = [];
    state.availableCities = [];
    state.availableRobberSpots = [];
  }
}

// Parse existing buildings from initial state
function parseBuildings(state, gs) {
  if (gs.mapState?.tileCornerStates) {
    for (const [cornerId, corner] of Object.entries(gs.mapState.tileCornerStates)) {
      if (corner.s !== undefined) {
        state.settlements[cornerId] = corner.s;
      }
      if (corner.c !== undefined) {
        state.cities[cornerId] = corner.c;
      }
    }
  }
  
  if (gs.mapState?.tileEdgeStates) {
    for (const [edgeId, edge] of Object.entries(gs.mapState.tileEdgeStates)) {
      if (edge.r !== undefined) {
        state.roads[edgeId] = edge.r;
      }
    }
  }
}

// Count resources from cards array
function countResources(cards) {
  const count = { wood: 0, sheep: 0, ore: 0, wheat: 0, brick: 0 };
  const resourceMap = { 1: 'wood', 2: 'sheep', 3: 'ore', 4: 'wheat', 5: 'brick' };
  
  for (const card of cards) {
    const resource = resourceMap[card];
    if (resource) {
      count[resource]++;
    }
  }
  
  return count;
}
