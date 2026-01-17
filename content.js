/**
 * Colonist.io Advisor - Content Script
 * 
 * Intercepts WebSocket messages, decodes game state, and provides strategic suggestions.
 */

(function() {
  'use strict';

  const LOG_PREFIX = '[Colonist Advisor]';
  const DEBUG = false;  // Set to true for verbose logging
  const LOG_HEARTBEATS = false;  // Set to true to see heartbeat messages

  // ============================================================================
  // Constants - Game Enums
  // ============================================================================

  const RESOURCE_TYPES = {
    1: 'wood',
    2: 'brick', 
    3: 'sheep',
    4: 'wheat',
    5: 'ore'
  };

  const TILE_TYPES = {
    0: 'desert',
    1: 'wood',    // Forest
    2: 'brick',   // Hills
    3: 'sheep',   // Pasture
    4: 'wheat',   // Fields
    5: 'ore'      // Mountains
  };

  const PORT_TYPES = {
    1: { ratio: 3, resource: 'any' },      // 3:1 generic
    2: { ratio: 2, resource: 'wood' },
    3: { ratio: 2, resource: 'brick' },
    4: { ratio: 2, resource: 'sheep' },
    5: { ratio: 2, resource: 'wheat' },
    6: { ratio: 2, resource: 'ore' }
  };

  const ACTION_STATES = {
    0: 'waiting',
    1: 'place_settlement',
    2: 'place_road',
    3: 'roll_dice',
    4: 'discard',
    5: 'move_robber',
    6: 'steal_card',
    7: 'main_turn'
  };

  const PLAYER_COLORS = {
    1: 'red',
    2: 'blue',
    3: 'orange',
    4: 'white'
  };

  // Dice probability (pips/dots)
  const DICE_PROBABILITY = {
    2: 1, 3: 2, 4: 3, 5: 4, 6: 5,
    7: 6,
    8: 5, 9: 4, 10: 3, 11: 2, 12: 1
  };

  // ============================================================================
  // MessagePack Decoder
  // ============================================================================
  
  const MessagePackDecoder = {
    decode(uint8Array) {
      const view = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
      let offset = 0;

      const read = () => {
        if (offset >= uint8Array.length) {
          throw new Error('Unexpected end of MessagePack data');
        }

        const byte = uint8Array[offset++];

        // Positive fixint (0x00 - 0x7f)
        if (byte <= 0x7f) return byte;

        // Fixmap (0x80 - 0x8f)
        if (byte >= 0x80 && byte <= 0x8f) return readMap(byte & 0x0f);

        // Fixarray (0x90 - 0x9f)
        if (byte >= 0x90 && byte <= 0x9f) return readArray(byte & 0x0f);

        // Fixstr (0xa0 - 0xbf)
        if (byte >= 0xa0 && byte <= 0xbf) return readString(byte & 0x1f);

        // Nil, false, true
        if (byte === 0xc0) return null;
        if (byte === 0xc2) return false;
        if (byte === 0xc3) return true;

        // Binary
        if (byte === 0xc4) return readBinary(uint8Array[offset++]);
        if (byte === 0xc5) { const len = view.getUint16(offset); offset += 2; return readBinary(len); }
        if (byte === 0xc6) { const len = view.getUint32(offset); offset += 4; return readBinary(len); }

        // Floats
        if (byte === 0xca) { const val = view.getFloat32(offset); offset += 4; return val; }
        if (byte === 0xcb) { const val = view.getFloat64(offset); offset += 8; return val; }

        // Unsigned ints
        if (byte === 0xcc) return uint8Array[offset++];
        if (byte === 0xcd) { const val = view.getUint16(offset); offset += 2; return val; }
        if (byte === 0xce) { const val = view.getUint32(offset); offset += 4; return val; }
        if (byte === 0xcf) { const hi = view.getUint32(offset); const lo = view.getUint32(offset + 4); offset += 8; return hi * 0x100000000 + lo; }

        // Signed ints
        if (byte === 0xd0) { const val = view.getInt8(offset); offset += 1; return val; }
        if (byte === 0xd1) { const val = view.getInt16(offset); offset += 2; return val; }
        if (byte === 0xd2) { const val = view.getInt32(offset); offset += 4; return val; }
        if (byte === 0xd3) { const hi = view.getInt32(offset); const lo = view.getUint32(offset + 4); offset += 8; return hi * 0x100000000 + lo; }

        // Strings
        if (byte === 0xd9) return readString(uint8Array[offset++]);
        if (byte === 0xda) { const len = view.getUint16(offset); offset += 2; return readString(len); }
        if (byte === 0xdb) { const len = view.getUint32(offset); offset += 4; return readString(len); }

        // Arrays
        if (byte === 0xdc) { const len = view.getUint16(offset); offset += 2; return readArray(len); }
        if (byte === 0xdd) { const len = view.getUint32(offset); offset += 4; return readArray(len); }

        // Maps
        if (byte === 0xde) { const len = view.getUint16(offset); offset += 2; return readMap(len); }
        if (byte === 0xdf) { const len = view.getUint32(offset); offset += 4; return readMap(len); }

        // Negative fixint (0xe0 - 0xff)
        if (byte >= 0xe0) return byte - 256;

        // Ext types (skip for now)
        if (byte >= 0xc7 && byte <= 0xc9) {
          let len = byte === 0xc7 ? uint8Array[offset++] : (byte === 0xc8 ? view.getUint16(offset) : view.getUint32(offset));
          if (byte !== 0xc7) offset += (byte === 0xc8 ? 2 : 4);
          offset += 1 + len; // type byte + data
          return { type: 'ext', length: len };
        }
        if (byte >= 0xd4 && byte <= 0xd8) {
          const sizes = { 0xd4: 1, 0xd5: 2, 0xd6: 4, 0xd7: 8, 0xd8: 16 };
          offset += 1 + sizes[byte];
          return { type: 'ext' };
        }

        throw new Error(`Unknown MessagePack byte: 0x${byte.toString(16)}`);
      };

      const readString = (len) => { const bytes = uint8Array.slice(offset, offset + len); offset += len; return new TextDecoder().decode(bytes); };
      const readBinary = (len) => { const bytes = uint8Array.slice(offset, offset + len); offset += len; return bytes; };
      const readArray = (len) => { const arr = []; for (let i = 0; i < len; i++) arr.push(read()); return arr; };
      const readMap = (len) => { const obj = {}; for (let i = 0; i < len; i++) { obj[read()] = read(); } return obj; };

      try {
        const result = read();
        // Check for remaining bytes (might indicate multiple messages)
        if (offset < uint8Array.length) {
        //   console.log(`${LOG_PREFIX} ⚠️ MessagePack: ${uint8Array.length - offset} bytes remaining after decode`);
        }
        return result;
      } catch (e) {
        console.error(`${LOG_PREFIX} MessagePack decode error at offset ${offset}:`, e);
        console.error(`${LOG_PREFIX} Raw bytes (first 100):`, Array.from(uint8Array.slice(0, 100)).map(b => b.toString(16).padStart(2, '0')).join(' '));
        return null;
      }
    }
  };

  // ============================================================================
  // Game State
  // ============================================================================

  const GameState = {
    // Player info
    myColor: null,
    myUserId: null,
    playOrder: [],
    
    // Players
    players: {},        // color -> { username, isBot, victoryPoints, resources, ... }
    
    // Board
    tiles: {},          // tileIndex -> { x, y, type, diceNumber, resource }
    corners: {},        // cornerId -> { x, y, z, owner, buildingType }
    edges: {},          // edgeId -> { x, y, z, owner }
    ports: {},          // edgeId -> { x, y, z, type, resource, ratio }
    robberTile: null,
    
    // Corner -> Tile adjacency (built from coordinates)
    cornerToTiles: {},  // cornerId -> [tileIndex, ...]
    tileToCorners: {},  // tileIndex -> [cornerId, ...]
    cornerToEdges: {},  // cornerId -> [edgeId, ...]
    edgeToCorners: {},  // edgeId -> [cornerId, cornerId]
    cornerToCorners: {}, // cornerId -> [adjacent cornerIds]
    
    // Current game state
    currentAction: null,
    currentTurnColor: null,
    isSetupPhase: false,
    completedTurns: 0,
    
    // My resources (only visible to me)
    myResources: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 },
    myDevCards: [],
    
    // Tracking
    diceHistory: [],
    messageLog: [],
    
    reset() {
      this.myColor = null;
      this.players = {};
      this.tiles = {};
      this.corners = {};
      this.edges = {};
      this.ports = {};
      this.robberTile = null;
      this.cornerToTiles = {};
      this.tileToCorners = {};
      this.cornerToEdges = {};
      this.edgeToCorners = {};
      this.cornerToCorners = {};
      this.currentAction = null;
      this.currentTurnColor = null;
      this.isSetupPhase = false;
      this.completedTurns = 0;
      this.myResources = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
      this.myDevCards = [];
      this.diceHistory = [];
      this.messageLog = [];
    }
  };

  // ============================================================================
  // Board Topology Builder
  // ============================================================================

  const BoardBuilder = {
    /**
     * Build adjacency maps from corner and tile coordinates
     */
    buildAdjacency() {
      const { tiles, corners, edges, ports } = GameState;
      
      // Build tile coordinate lookup
      const tileByCoord = {};
      for (const [tileId, tile] of Object.entries(tiles)) {
        tileByCoord[`${tile.x},${tile.y}`] = parseInt(tileId);
      }
      
      // For each corner, find adjacent tiles
      // Hex corner coordinates: corners touch tiles based on their (x, y, z)
      // z=0: "top" vertex, z=1: "bottom" vertex of the hex at (x, y)
      for (const [cornerId, corner] of Object.entries(corners)) {
        const adjacent = this.getAdjacentTilesForCorner(corner, tileByCoord);
        GameState.cornerToTiles[cornerId] = adjacent;
        
        // Reverse mapping
        for (const tileId of adjacent) {
          if (!GameState.tileToCorners[tileId]) {
            GameState.tileToCorners[tileId] = [];
          }
          GameState.tileToCorners[tileId].push(parseInt(cornerId));
        }
      }
      
      // Build edge -> corner mapping
      for (const [edgeId, edge] of Object.entries(edges)) {
        const edgeCorners = this.getCornersForEdge(edge, corners);
        GameState.edgeToCorners[edgeId] = edgeCorners;
        
        for (const cId of edgeCorners) {
          if (!GameState.cornerToEdges[cId]) {
            GameState.cornerToEdges[cId] = [];
          }
          GameState.cornerToEdges[cId].push(parseInt(edgeId));
        }
      }
      
      // Build corner -> corner adjacency (neighbors via edges)
      for (const [cornerId, edgeIds] of Object.entries(GameState.cornerToEdges)) {
        GameState.cornerToCorners[cornerId] = [];
        for (const edgeId of edgeIds) {
          const [c1, c2] = GameState.edgeToCorners[edgeId] || [];
          if (c1 !== undefined && c2 !== undefined) {
            const neighbor = c1 == cornerId ? c2 : c1;
            if (!GameState.cornerToCorners[cornerId].includes(neighbor)) {
              GameState.cornerToCorners[cornerId].push(neighbor);
            }
          }
        }
      }
      
      // Map ports to corners
      for (const [portId, port] of Object.entries(ports)) {
        // Find corners adjacent to this port edge
        const portCorners = this.getCornersForEdge(port, corners);
        for (const cId of portCorners) {
          if (GameState.corners[cId]) {
            GameState.corners[cId].port = {
              type: port.type,
              ...PORT_TYPES[port.type]
            };
          }
        }
      }
      
      console.log(`${LOG_PREFIX} 🗺️ Adjacency built: ${Object.keys(corners).length} corners, ${Object.keys(tiles).length} tiles`);
    },
    
    /**
     * Get tile indices adjacent to a corner
     */
    getAdjacentTilesForCorner(corner, tileByCoord) {
      const { x, y, z } = corner;
      const adjacent = [];
      
      // Hex coordinate offsets for corners
      // z=0 (top vertex): touches hex at (x,y) and neighbors
      // z=1 (bottom vertex): touches hex at (x,y) and neighbors
      let offsets;
      if (z === 0) {
        offsets = [
          [0, 0],    // The hex this corner belongs to
          [-1, 0],   // Left hex
          [0, -1]    // Top hex
        ];
      } else {
        offsets = [
          [0, 0],    // The hex this corner belongs to
          [1, 0],    // Right hex  
          [0, 1]     // Bottom hex
        ];
      }
      
      for (const [dx, dy] of offsets) {
        const key = `${x + dx},${y + dy}`;
        if (tileByCoord[key] !== undefined) {
          adjacent.push(tileByCoord[key]);
        }
      }
      
      return adjacent;
    },
    
    /**
     * Get corners adjacent to an edge
     */
    getCornersForEdge(edge, corners) {
      const { x, y, z } = edge;
      const result = [];
      
      // Edge z values: 0=horizontal, 1=right-diagonal, 2=left-diagonal
      // Find corners that share this edge
      for (const [cornerId, corner] of Object.entries(corners)) {
        if (this.isCornerAdjacentToEdge(corner, edge)) {
          result.push(parseInt(cornerId));
        }
      }
      
      return result.slice(0, 2); // An edge connects exactly 2 corners
    },
    
    isCornerAdjacentToEdge(corner, edge) {
      const cx = corner.x, cy = corner.y, cz = corner.z;
      const ex = edge.x, ey = edge.y, ez = edge.z;
      
      // Edge orientation determines which corners it connects
      if (ez === 0) { // Horizontal edge
        return (cx === ex && cy === ey && cz === 0) ||
               (cx === ex && cy === ey + 1 && cz === 1);
      } else if (ez === 1) { // Right diagonal  
        return (cx === ex && cy === ey && cz === 1) ||
               (cx === ex + 1 && cy === ey && cz === 0);
      } else if (ez === 2) { // Left diagonal
        return (cx === ex && cy === ey && cz === 0) ||
               (cx === ex && cy === ey && cz === 1);
      }
      return false;
    }
  };

  // ============================================================================
  // Message Parser
  // ============================================================================

  const MessageParser = {
    parse(decoded) {
      if (!decoded) return null;
      
      // Store raw message (but skip heartbeats to save memory)
      const isHeartbeat = decoded.id === 136 || decoded.id === '136';
      if (!isHeartbeat) {
        GameState.messageLog.push({
          timestamp: Date.now(),
          data: decoded
        });
        
        // Debug logging (only in debug mode)
        if (DEBUG) {
          console.log(`${LOG_PREFIX} 📥 Received - type: ${decoded.type}, id: ${decoded.id}`);
        }
      }

      // Handle different message types
      let result = {};
      if (decoded.type !== undefined) {
        result = this.handleTypedMessage(decoded) || {};
      } else if (decoded.id !== undefined) {
        result = this.handleIdMessage(decoded) || {};
      }

      return { ...result, decoded };
    },
    
    handleTypedMessage(msg) {
      const { type, payload, sequence } = msg;
      
      // Debug logging
      if (DEBUG) {
        console.log(`${LOG_PREFIX} 📨 Type ${type} message, payload keys:`, payload ? Object.keys(payload) : 'none');
      }
      
      // Type 4 = Full game state (game started)
      if (type === 4) {
        if (payload) {
          console.log(`${LOG_PREFIX} 🎮 GAME STARTED - Parsing full state...`);
          this.parseFullGameState(payload);
          return { isGameStart: true };
        }
        return {};
      }
      
      // Type 91 and others = Game state diff updates
      if (payload?.diff) {
        console.log(`${LOG_PREFIX} 📊 Processing diff with keys:`, Object.keys(payload.diff));
        this.parseDiffUpdate(payload.diff);
        return { isGameUpdate: true };
      }
      
      // Type with payload but no diff - might have other useful data
      if (payload) {
        // Check for player resources, game log, etc.
        if (payload.playerStates) this.parsePlayerStatesUpdate(payload.playerStates);
        if (payload.currentState) this.parseCurrentStateUpdate(payload.currentState);
      }
      
      return {};
    },
    
    handleIdMessage(msg) {
      const { id, data } = msg;
      
      // ID 136 = timestamp/heartbeat - ignore unless debugging
      if (id === 136 || id === '136') {
        if (LOG_HEARTBEATS) console.log(`${LOG_PREFIX} 💓 Heartbeat: ${data?.timestamp}`);
        return { isHeartbeat: true };
      }
      
      // ID 130 messages contain game updates wrapped with type/payload
      if (id === 130 || id === '130') {
        // Type 91 = Game state diff (most common)
        if (data?.type === 91 && data?.payload?.diff) {
          this.parseDiffUpdate(data.payload.diff);
          return { isGameUpdate: true };
        }
        
        // Type 4 = Full game state  
        if (data?.type === 4 && data?.payload) {
          console.log(`${LOG_PREFIX} 🎮 GAME STARTED`);
          this.parseFullGameState(data.payload);
          return { isGameStart: true };
        }
        
        // Other types with payload.diff
        if (data?.payload?.diff) {
          this.parseDiffUpdate(data.payload.diff);
          return { isGameUpdate: true };
        }
      }
      
      // Check if data contains type 4 (game start might be wrapped)
      if (data?.type === 4 && data?.payload) {
        console.log(`${LOG_PREFIX} 🎮 GAME STARTED - Parsing full state...`);
        this.parseFullGameState(data.payload);
        return { isGameStart: true };
      }
      
      return {};
    },
    
    parseFullGameState(payload) {
      const { playerColor, playOrder, gameState, playerUserStates, gameSettings } = payload;
      
      // My color
      GameState.myColor = playerColor;
      GameState.playOrder = playOrder || [];
      console.log(`${LOG_PREFIX} 🎨 You are player color: ${PLAYER_COLORS[playerColor] || playerColor}`);
      
      // Parse players
      if (playerUserStates) {
        for (const player of playerUserStates) {
          GameState.players[player.selectedColor] = {
            username: player.username,
            isBot: player.isBot,
            userId: player.userId,
            color: player.selectedColor,
            colorName: PLAYER_COLORS[player.selectedColor],
            victoryPoints: 0
          };
        }
        console.log(`${LOG_PREFIX} 👥 Players:`, Object.values(GameState.players).map(p => `${p.username} (${p.colorName}${p.isBot ? ', bot' : ''})`).join(', '));
      }
      
      // Parse game state
      if (gameState) {
        this.parseGameState(gameState);
      }
      
      // Build adjacency maps
      BoardBuilder.buildAdjacency();
      
      // If we're in setup phase, suggest placement
      if (GameState.isSetupPhase && GameState.currentTurnColor === GameState.myColor) {
        setTimeout(() => Advisor.suggestInitialPlacement(), 100);
      }
    },
    
    parseGameState(gs) {
      // Map state
      if (gs.mapState) {
        const { tileHexStates, tileCornerStates, tileEdgeStates, portEdgeStates } = gs.mapState;
        
        // Tiles
        if (tileHexStates) {
          for (const [id, tile] of Object.entries(tileHexStates)) {
            GameState.tiles[id] = {
              ...tile,
              resource: TILE_TYPES[tile.type] || 'unknown',
              probability: DICE_PROBABILITY[tile.diceNumber] || 0
            };
          }
        }
        
        // Corners
        if (tileCornerStates) {
          for (const [id, corner] of Object.entries(tileCornerStates)) {
            GameState.corners[id] = { ...corner, owner: null, buildingType: null };
          }
        }
        
        // Edges
        if (tileEdgeStates) {
          for (const [id, edge] of Object.entries(tileEdgeStates)) {
            GameState.edges[id] = { ...edge, owner: null };
          }
        }
        
        // Ports
        if (portEdgeStates) {
          for (const [id, port] of Object.entries(portEdgeStates)) {
            GameState.ports[id] = {
              ...port,
              ...PORT_TYPES[port.type]
            };
          }
        }
      }
      
      // Current state
      if (gs.currentState) {
        const { actionState, currentTurnPlayerColor, completedTurns, turnState } = gs.currentState;
        GameState.currentAction = ACTION_STATES[actionState] || actionState;
        GameState.currentTurnColor = currentTurnPlayerColor;
        GameState.completedTurns = completedTurns || 0;
        
        // Setup phase is first few turns (each player places 2 settlements)
        const numPlayers = Object.keys(GameState.players).length;
        GameState.isSetupPhase = completedTurns < numPlayers * 2;
        
        console.log(`${LOG_PREFIX} 🎯 Current action: ${GameState.currentAction}, Turn: ${PLAYER_COLORS[currentTurnPlayerColor]}, Setup: ${GameState.isSetupPhase}`);
      }
      
      // Robber
      if (gs.mechanicRobberState) {
        GameState.robberTile = gs.mechanicRobberState.locationTileIndex;
      }
      
      // Player states (victory points, resources)
      if (gs.playerStates) {
        for (const [colorId, state] of Object.entries(gs.playerStates)) {
          if (GameState.players[colorId]) {
            // Count visible victory points
            if (state.victoryPointsState) {
              let vp = 0;
              for (const val of Object.values(state.victoryPointsState)) {
                if (typeof val === 'number') vp += val;
              }
              GameState.players[colorId].victoryPoints = vp;
            }
            
            // My resources
            if (parseInt(colorId) === GameState.myColor && state.resourceCards?.cards) {
              this.countResources(state.resourceCards.cards);
            }
          }
        }
      }
    },
    
    parseDiffUpdate(diff) {
      if (DEBUG) {
        console.log(`${LOG_PREFIX} 📊 Diff update:`, diff);
      }
      
      // Map state contains corner and edge updates
      const mapState = diff.mapState || {};
      
      // Corner updates (settlements/cities placed)
      if (mapState.tileCornerStates) {
        for (const [cornerId, state] of Object.entries(mapState.tileCornerStates)) {
          // Initialize corner if it doesn't exist
          if (!GameState.corners[cornerId]) {
            GameState.corners[cornerId] = { owner: null, buildingType: null };
          }
          Object.assign(GameState.corners[cornerId], state);
          
          if (state.owner !== undefined && state.buildingType !== undefined) {
            const building = state.buildingType === 1 ? 'Settlement' : 'City';
            const playerName = GameState.players[state.owner]?.username || `Player ${state.owner}`;
            console.log(`${LOG_PREFIX} 🏗️ ${playerName} built ${building} at corner ${cornerId}`);
          }
        }
      }
      
      // Edge updates (roads placed)
      if (mapState.tileEdgeStates) {
        for (const [edgeId, state] of Object.entries(mapState.tileEdgeStates)) {
          // Initialize edge if it doesn't exist
          if (!GameState.edges[edgeId]) {
            GameState.edges[edgeId] = { owner: null };
          }
          Object.assign(GameState.edges[edgeId], state);
          
          if (state.owner !== undefined) {
            const playerName = GameState.players[state.owner]?.username || `Player ${state.owner}`;
            console.log(`${LOG_PREFIX} 🛤️ ${playerName} built Road at edge ${edgeId}`);
          }
        }
      }
      
      // Player state updates
      if (diff.playerStates) {
        for (const [colorId, state] of Object.entries(diff.playerStates)) {
          if (GameState.players[colorId]) {
            // Resource cards update for me
            if (parseInt(colorId) === GameState.myColor && state.resourceCards?.cards) {
              this.countResources(state.resourceCards.cards);
            }
          }
        }
      }
      
      // Current state update
      if (diff.currentState) {
        this.parseCurrentStateUpdate(diff.currentState);
      }
      
      // Map state update (initial board)
      if (diff.mapState) {
        if (diff.mapState.tileHexStates) {
          for (const [id, tile] of Object.entries(diff.mapState.tileHexStates)) {
            GameState.tiles[id] = {
              ...tile,
              resource: TILE_TYPES[tile.type] || 'unknown',
              probability: DICE_PROBABILITY[tile.diceNumber] || 0
            };
          }
        }
      }
      
      // Dice state
      if (diff.diceState && diff.diceState.dice1 !== undefined) {
        const roll = diff.diceState.dice1 + diff.diceState.dice2;
        GameState.diceHistory.push(roll);
        console.log(`${LOG_PREFIX} 🎲 Dice rolled: ${diff.diceState.dice1} + ${diff.diceState.dice2} = ${roll}`);
      }
    },
    
    countResources(cards) {
      GameState.myResources = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
      for (const card of cards) {
        const resource = RESOURCE_TYPES[card];
        if (resource) {
          GameState.myResources[resource]++;
        }
      }
      console.log(`${LOG_PREFIX} 💰 My resources:`, GameState.myResources);
    },
    
    parseCurrentStateUpdate(currentState) {
      const { actionState, currentTurnPlayerColor, completedTurns } = currentState;
      const prevAction = GameState.currentAction;
      
      if (actionState !== undefined) {
        GameState.currentAction = ACTION_STATES[actionState] || actionState;
      }
      if (currentTurnPlayerColor !== undefined) {
        GameState.currentTurnColor = currentTurnPlayerColor;
      }
      if (completedTurns !== undefined) {
        GameState.completedTurns = completedTurns;
        const numPlayers = Object.keys(GameState.players).length || 4;
        GameState.isSetupPhase = completedTurns < numPlayers * 2;
      }
      
      // Log turn changes
      if (currentTurnPlayerColor !== undefined) {
        const playerName = GameState.players[currentTurnPlayerColor]?.username || PLAYER_COLORS[currentTurnPlayerColor];
        const isMyTurn = currentTurnPlayerColor === GameState.myColor;
        console.log(`${LOG_PREFIX} 🎯 ${isMyTurn ? '>>> YOUR TURN <<<' : `${playerName}'s turn`} - Action: ${GameState.currentAction}`);
      }
      
      // Suggest actions when it's our turn
      if (GameState.currentTurnColor === GameState.myColor) {
        setTimeout(() => {
          if (GameState.currentAction === 'place_settlement') {
            Advisor.suggestInitialPlacement();
          } else if (GameState.currentAction === 'place_road') {
            Advisor.suggestRoadPlacement();
          } else if (GameState.currentAction === 'main_turn' || GameState.currentAction === 7) {
            Advisor.suggestBuildPriority();
          }
        }, 100);
      }
    },
    
    parsePlayerStatesUpdate(playerStates) {
      for (const [colorId, state] of Object.entries(playerStates)) {
        if (!GameState.players[colorId]) {
          GameState.players[colorId] = { color: parseInt(colorId), colorName: PLAYER_COLORS[colorId] };
        }
        
        // Victory points
        if (state.victoryPointsState) {
          let vp = 0;
          for (const val of Object.values(state.victoryPointsState)) {
            if (typeof val === 'number') vp += val;
          }
          const oldVP = GameState.players[colorId].victoryPoints || 0;
          if (vp !== oldVP) {
            GameState.players[colorId].victoryPoints = vp;
            const playerName = GameState.players[colorId].username || PLAYER_COLORS[colorId];
            console.log(`${LOG_PREFIX} 🏆 ${playerName}: ${vp} VP`);
          }
        }
        
        // My resources
        if (parseInt(colorId) === GameState.myColor && state.resourceCards?.cards) {
          this.countResources(state.resourceCards.cards);
        }
      }
    }
  };

  // ============================================================================
  // Advisor - Strategic Suggestions
  // ============================================================================

  const Advisor = {
    /**
     * Calculate score for a corner position
     */
    scoreCorner(cornerId) {
      const corner = GameState.corners[cornerId];
      if (!corner) return null;
      
      // Skip if already occupied (owner is set and not null/undefined)
      if (corner.owner !== null && corner.owner !== undefined) return null;
      
      // Skip if adjacent corner is occupied (distance rule)
      const neighbors = GameState.cornerToCorners[cornerId] || [];
      for (const neighborId of neighbors) {
        const neighborOwner = GameState.corners[neighborId]?.owner;
        if (neighborOwner !== null && neighborOwner !== undefined) {
          return null;
        }
      }
      
      // Get adjacent tiles
      const tileIds = GameState.cornerToTiles[cornerId] || [];
      if (tileIds.length === 0) return null;
      
      let totalProbability = 0;
      let resourceDiversity = new Set();
      let resources = {};
      let hasPort = corner.port ? corner.port : null;
      
      for (const tileId of tileIds) {
        const tile = GameState.tiles[tileId];
        if (!tile || tile.type === 0) continue; // Skip desert
        
        const prob = tile.probability || 0;
        totalProbability += prob;
        resourceDiversity.add(tile.resource);
        
        if (!resources[tile.resource]) {
          resources[tile.resource] = { probability: 0, numbers: [] };
        }
        resources[tile.resource].probability += prob;
        resources[tile.resource].numbers.push(tile.diceNumber);
      }
      
      // Scoring formula
      let score = 0;
      
      // 1. Total probability (pips) - most important
      score += totalProbability * 10;
      
      // 2. Resource diversity bonus
      score += resourceDiversity.size * 8;
      
      // 3. Resource type bonuses (ore and wheat more valuable mid/late game)
      if (resources.ore) score += resources.ore.probability * 2;
      if (resources.wheat) score += resources.wheat.probability * 2;
      
      // 4. Port bonus
      if (hasPort) {
        if (hasPort.ratio === 3) {
          score += 5; // 3:1 port
        } else {
          // 2:1 port - valuable if we have the matching resource
          if (resources[hasPort.resource]) {
            score += 10 + resources[hasPort.resource].probability;
          } else {
            score += 3;
          }
        }
      }
      
      // 5. Avoid robber tile
      if (tileIds.includes(GameState.robberTile)) {
        score -= 5;
      }
      
      // 6. Number quality - prefer 6, 8, 5, 9
      for (const tileId of tileIds) {
        const tile = GameState.tiles[tileId];
        if (tile && (tile.diceNumber === 6 || tile.diceNumber === 8)) {
          score += 3;
        }
      }
      
      return {
        cornerId: parseInt(cornerId),
        score: Math.round(score * 10) / 10,
        totalProbability,
        resources,
        resourceDiversity: Array.from(resourceDiversity),
        port: hasPort,
        tiles: tileIds.map(id => {
          const t = GameState.tiles[id];
          return t ? `${t.resource}(${t.diceNumber})` : null;
        }).filter(Boolean)
      };
    },
    
    /**
     * Suggest best positions for initial settlement placement
     */
    suggestInitialPlacement() {
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      console.log(`${LOG_PREFIX} 🎯 INITIAL PLACEMENT ANALYSIS`);
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      
      const scores = [];
      
      for (const cornerId of Object.keys(GameState.corners)) {
        const result = this.scoreCorner(cornerId);
        if (result) {
          scores.push(result);
        }
      }
      
      // Sort by score descending
      scores.sort((a, b) => b.score - a.score);
      
      // Show top 5
      console.log(`${LOG_PREFIX} 🏆 TOP 5 SETTLEMENT SPOTS:`);
      console.log(`${LOG_PREFIX} `);
      
      for (let i = 0; i < Math.min(5, scores.length); i++) {
        const s = scores[i];
        const portInfo = s.port ? ` | Port: ${s.port.ratio}:1 ${s.port.resource}` : '';
        console.log(`${LOG_PREFIX}   ${i + 1}. Corner ${s.cornerId} (Score: ${s.score})`);
        console.log(`${LOG_PREFIX}      Tiles: ${s.tiles.join(', ')}`);
        console.log(`${LOG_PREFIX}      Pips: ${s.totalProbability} | Diversity: ${s.resourceDiversity.join(', ')}${portInfo}`);
        console.log(`${LOG_PREFIX} `);
      }
      
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      
      return scores.slice(0, 5);
    },
    
    /**
     * Suggest best road placement after placing a settlement
     */
    suggestRoadPlacement() {
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      console.log(`${LOG_PREFIX} 🛤️ ROAD PLACEMENT SUGGESTION`);
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      
      // Find my settlements/cities
      const myBuildings = [];
      for (const [cornerId, corner] of Object.entries(GameState.corners)) {
        if (corner.owner === GameState.myColor) {
          myBuildings.push(parseInt(cornerId));
        }
      }
      
      if (myBuildings.length === 0) {
        console.log(`${LOG_PREFIX}   No buildings found yet`);
        return [];
      }
      
      // Find edges adjacent to my buildings that are not yet built
      const availableRoads = [];
      
      for (const cornerId of myBuildings) {
        const adjacentEdges = GameState.cornerToEdges[cornerId] || [];
        for (const edgeId of adjacentEdges) {
          const edge = GameState.edges[edgeId];
          if (edge && edge.owner === null) {
            // Score this road based on where it leads
            const connectedCorners = GameState.edgeToCorners[edgeId] || [];
            const otherCorner = connectedCorners.find(c => c !== cornerId);
            
            if (otherCorner !== undefined) {
              const cornerScore = this.scoreCorner(otherCorner);
              if (cornerScore) {
                availableRoads.push({
                  edgeId: parseInt(edgeId),
                  fromCorner: cornerId,
                  toCorner: otherCorner,
                  leadsToScore: cornerScore.score,
                  leadsToTiles: cornerScore.tiles
                });
              }
            }
          }
        }
      }
      
      // Sort by destination score
      availableRoads.sort((a, b) => b.leadsToScore - a.leadsToScore);
      
      if (availableRoads.length === 0) {
        console.log(`${LOG_PREFIX}   No available road spots found`);
        return [];
      }
      
      console.log(`${LOG_PREFIX} 🏆 BEST ROAD OPTIONS:`);
      console.log(`${LOG_PREFIX} `);
      
      for (let i = 0; i < Math.min(3, availableRoads.length); i++) {
        const r = availableRoads[i];
        console.log(`${LOG_PREFIX}   ${i + 1}. Edge ${r.edgeId} (Corner ${r.fromCorner} → ${r.toCorner})`);
        console.log(`${LOG_PREFIX}      Leads to: ${r.leadsToTiles.join(', ')} (Score: ${r.leadsToScore})`);
        console.log(`${LOG_PREFIX} `);
      }
      
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      
      return availableRoads.slice(0, 3);
    },
    
    /**
     * Suggest what to build based on current resources
     */
    suggestBuildPriority() {
      const r = GameState.myResources;
      
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      console.log(`${LOG_PREFIX} 💰 BUILD PRIORITY ANALYSIS`);
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      console.log(`${LOG_PREFIX} Resources: Wood:${r.wood} Brick:${r.brick} Sheep:${r.sheep} Wheat:${r.wheat} Ore:${r.ore}`);
      console.log(`${LOG_PREFIX} `);
      
      const suggestions = [];
      
      // City: 2 wheat + 3 ore
      if (r.wheat >= 2 && r.ore >= 3) {
        suggestions.push({ action: 'Build City', priority: 1, reason: '+1 VP and doubles resource production' });
      }
      
      // Settlement: 1 each of wood, brick, sheep, wheat
      if (r.wood >= 1 && r.brick >= 1 && r.sheep >= 1 && r.wheat >= 1) {
        suggestions.push({ action: 'Build Settlement', priority: 2, reason: '+1 VP and new resource access' });
      }
      
      // Dev Card: 1 each of sheep, wheat, ore
      if (r.sheep >= 1 && r.wheat >= 1 && r.ore >= 1) {
        suggestions.push({ action: 'Buy Dev Card', priority: 3, reason: 'Could be VP or useful knight' });
      }
      
      // Road: 1 wood + 1 brick
      if (r.wood >= 1 && r.brick >= 1) {
        suggestions.push({ action: 'Build Road', priority: 4, reason: 'Expand to new settlement spots' });
      }
      
      if (suggestions.length === 0) {
        console.log(`${LOG_PREFIX}   ❌ Cannot afford anything right now`);
      } else {
        console.log(`${LOG_PREFIX}   📋 CAN BUILD:`);
        for (const s of suggestions) {
          console.log(`${LOG_PREFIX}      ${s.priority}. ${s.action} - ${s.reason}`);
        }
      }
      
      // What to collect next
      console.log(`${LOG_PREFIX} `);
      console.log(`${LOG_PREFIX}   🎯 RESOURCE PRIORITIES:`);
      
      if (r.ore < 3 || r.wheat < 2) {
        console.log(`${LOG_PREFIX}      - Need ORE and WHEAT for cities`);
      }
      if (r.wood < 1 || r.brick < 1) {
        console.log(`${LOG_PREFIX}      - Need WOOD and BRICK for roads/settlements`);
      }
      
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      
      return suggestions;
    },
    
    /**
     * Full game state analysis
     */
    analyze() {
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      console.log(`${LOG_PREFIX} 📊 FULL GAME STATE ANALYSIS`);
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      
      // Players
      console.log(`${LOG_PREFIX} `);
      console.log(`${LOG_PREFIX} 👥 PLAYERS:`);
      for (const [color, player] of Object.entries(GameState.players)) {
        const isMe = parseInt(color) === GameState.myColor ? ' (YOU)' : '';
        console.log(`${LOG_PREFIX}    ${player.colorName}: ${player.username}${isMe} - ${player.victoryPoints} VP${player.isBot ? ' [BOT]' : ''}`);
      }
      
      // Current state
      console.log(`${LOG_PREFIX} `);
      console.log(`${LOG_PREFIX} 🎮 GAME STATE:`);
      console.log(`${LOG_PREFIX}    Phase: ${GameState.isSetupPhase ? 'SETUP' : 'MAIN GAME'}`);
      console.log(`${LOG_PREFIX}    Current turn: ${PLAYER_COLORS[GameState.currentTurnColor]}`);
      console.log(`${LOG_PREFIX}    Action: ${GameState.currentAction}`);
      console.log(`${LOG_PREFIX}    Completed turns: ${GameState.completedTurns}`);
      
      // My resources
      console.log(`${LOG_PREFIX} `);
      console.log(`${LOG_PREFIX} 💰 MY RESOURCES:`);
      console.log(`${LOG_PREFIX}    `, GameState.myResources);
      
      // Board summary
      console.log(`${LOG_PREFIX} `);
      console.log(`${LOG_PREFIX} 🗺️ BOARD:`);
      console.log(`${LOG_PREFIX}    Tiles: ${Object.keys(GameState.tiles).length}`);
      console.log(`${LOG_PREFIX}    Corners: ${Object.keys(GameState.corners).length}`);
      console.log(`${LOG_PREFIX}    Edges: ${Object.keys(GameState.edges).length}`);
      console.log(`${LOG_PREFIX}    Robber on tile: ${GameState.robberTile}`);
      
      // Occupied corners
      const occupiedCorners = Object.entries(GameState.corners).filter(([id, c]) => c.owner !== null);
      if (occupiedCorners.length > 0) {
        console.log(`${LOG_PREFIX} `);
        console.log(`${LOG_PREFIX} 🏠 BUILDINGS:`);
        for (const [id, corner] of occupiedCorners) {
          const player = GameState.players[corner.owner];
          const building = corner.buildingType === 1 ? 'Settlement' : 'City';
          console.log(`${LOG_PREFIX}    Corner ${id}: ${player?.username || corner.owner} - ${building}`);
        }
      }
      
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      
      // Suggestions
      if (GameState.isSetupPhase) {
        this.suggestInitialPlacement();
      } else {
        this.suggestBuildPriority();
      }
    }
  };

  // ============================================================================
  // WebSocket Message Handler
  // ============================================================================

  function handleWebSocketMessage(payload) {
    const { direction, type, data, size } = payload;

    // Debug: log incoming messages
    if (DEBUG && direction === 'incoming' && size > 40) {
      console.log(`${LOG_PREFIX} 📡 WS incoming: ${size} bytes (${type})`);
    }

    if (type === 'binary') {
      const uint8Array = new Uint8Array(data);
      const decoded = MessagePackDecoder.decode(uint8Array);
      if (decoded) {
        MessageParser.parse(decoded);
      } else {
        console.error(`${LOG_PREFIX} ❌ Failed to decode MessagePack, size: ${size}`);
      }
    } else if (type === 'text') {
      try {
        const parsed = JSON.parse(data);
        MessageParser.parse(parsed);
      } catch (e) {
        console.log(`${LOG_PREFIX} 📝 Text (not JSON):`, data.substring(0, 100));
      }
    }
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  function init() {
    console.log(`${LOG_PREFIX} 🚀 Colonist Advisor v1.0 starting...`);
    
    // Listen for messages from injected script
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (!event.data || event.data.source !== 'colonist-advisor-injected') return;

      const { type, payload } = event.data;

      switch (type) {
        case 'ws_connect':
          // Only log game WebSocket connections
          if (payload.url.includes('colonist')) {
            console.log(`${LOG_PREFIX} 🔌 WebSocket connecting...`);
          }
          break;
        case 'ws_open':
          console.log(`${LOG_PREFIX} ✅ WebSocket connected - waiting for game`);
          break;
        case 'ws_message':
          handleWebSocketMessage(payload);
          break;
        case 'ws_close':
          console.log(`${LOG_PREFIX} 🔴 WebSocket disconnected`);
          break;
        case 'ws_error':
          console.error(`${LOG_PREFIX} ❌ WebSocket error`);
          break;
      }
    });

    // Inject WebSocket interceptor
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);

    // Expose API on window
    window.colonistAdvisor = {
      state: GameState,
      analyze: () => Advisor.analyze(),
      suggestPlacement: () => Advisor.suggestInitialPlacement(),
      suggestRoad: () => Advisor.suggestRoadPlacement(),
      suggestBuild: () => Advisor.suggestBuildPriority(),
      scoreCorner: (id) => Advisor.scoreCorner(id),
      getMessages: () => GameState.messageLog,
      reset: () => GameState.reset(),
      debug: { MessageParser, BoardBuilder, Advisor }
    };

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
