// Game constants for Colonist

export const TILE_TYPES = {
  0: { name: 'desert', color: '#e8d5a3' },
  1: { name: 'wheat', color: '#f4d03f' },
  2: { name: 'sheep', color: '#7dcea0' },
  3: { name: 'ore', color: '#5d6d7e' },
  4: { name: 'wood', color: '#27ae60' },
  5: { name: 'brick', color: '#c0392b' }
};

export const RESOURCES = {
  1: { name: 'wood', color: '#27ae60', emoji: '🪵' },
  2: { name: 'sheep', color: '#7dcea0', emoji: '🐑' },
  3: { name: 'ore', color: '#5d6d7e', emoji: '🪨' },
  4: { name: 'wheat', color: '#f4d03f', emoji: '🌾' },
  5: { name: 'brick', color: '#c0392b', emoji: '🧱' }
};

export const PORTS = {
  1: { name: '3:1', color: '#fff' },
  2: { name: 'sheep', color: '#7dcea0' },
  3: { name: 'brick', color: '#c0392b' },
  4: { name: 'ore', color: '#5d6d7e' },
  5: { name: 'wood', color: '#27ae60' },
  6: { name: 'wheat', color: '#f4d03f' }
};

export const PLAYER_COLORS = {
  1: { name: 'red', hex: '#e74c3c' },
  2: { name: 'blue', hex: '#3498db' },
  3: { name: 'orange', hex: '#e67e22' },
  4: { name: 'white', hex: '#ecf0f1' }
};

export const ACTION_STATES = {
  0: 'roll_dice',
  1: 'place_settlement',
  3: 'place_road',
  7: 'main_turn',
  24: 'place_robber'
};

export const DICE_PROBABILITY = {
  2: 1, 3: 2, 4: 3, 5: 4, 6: 5,
  8: 5, 9: 4, 10: 3, 11: 2, 12: 1
};

// Message type labels (reverse engineered)
export const MESSAGE_TYPES = {
  1: { label: 'SESSION_START', description: 'Game session initialization', color: '#9b59b6' },
  2: { label: 'SESSION_ID', description: 'Session identifier response', color: '#9b59b6' },
  4: { label: 'FULL_STATE', description: 'Complete game state snapshot', color: '#e74c3c' },
  5: { label: 'PAUSE_STATE', description: 'Game pause status', color: '#95a5a6' },
  6: { label: 'READY_STATE', description: 'Player ready confirmation', color: '#2ecc71' },
  28: { label: 'RESOURCE_DISTRIBUTION', description: 'Resources given to players', color: '#f39c12' },
  30: { label: 'AVAILABLE_SETTLEMENTS', description: 'Valid settlement placement spots', color: '#1abc9c' },
  31: { label: 'AVAILABLE_ROADS', description: 'Valid road placement spots', color: '#1abc9c' },
  32: { label: 'AVAILABLE_CITIES', description: 'Valid city upgrade spots', color: '#1abc9c' },
  33: { label: 'AVAILABLE_ROBBER_SPOTS', description: 'Valid robber placement tiles', color: '#1abc9c' },
  48: { label: 'EMOTES_LIST', description: 'Available game emotes', color: '#95a5a6' },
  59: { label: 'TRADE_OFFERS', description: 'Active trade offers', color: '#e67e22' },
  62: { label: 'TRADE_STATE', description: 'Trade state changes', color: '#e67e22' },
  69: { label: 'PING', description: 'Keep-alive ping', color: '#bdc3c7' },
  78: { label: 'GAME_ACTIVE', description: 'Game active status flag', color: '#2ecc71' },
  80: { label: 'TURN_END', description: 'Turn ended signal', color: '#3498db' },
  91: { label: 'STATE_DIFF', description: 'Incremental state update', color: '#e74c3c' }
};

// Get message type info with fallback
export function getMessageTypeInfo(type) {
  return MESSAGE_TYPES[type] || {
    label: `UNKNOWN_${type}`,
    description: `Unknown message type ${type}`,
    color: '#7f8c8d'
  };
}
