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
  const SHOW_UI = true;  // Set to true to show overlay UI

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
    0: 'roll_dice',
    1: 'place_settlement',
    3: 'place_road',
    7: 'main_turn',
    24: 'place_robber',
    25: 'steal_card',
    4: 'discard'
  };

  // Building costs
  const BUILD_COSTS = {
    road: { wood: 1, brick: 1 },
    settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
    city: { wheat: 2, ore: 3 },
    devCard: { sheep: 1, wheat: 1, ore: 1 }
  };

  // Development card types
  const DEV_CARD_TYPES = {
    0: 'knight',
    1: 'victoryPoint',
    2: 'roadBuilding',
    3: 'yearOfPlenty',
    4: 'monopoly',
    10: 'unknown'  // Hidden cards in deck
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
  // UI Overlay
  // ============================================================================

  const AdvisorUI = {
    container: null,
    isVisible: true,
    isMinimized: false,

    init() {
      if (!SHOW_UI) return;
      this.injectStyles();
      this.createContainer();
      this.createToggleButton();
      console.log(`${LOG_PREFIX} 🎨 UI initialized`);
    },

    injectStyles() {
      const style = document.createElement('style');
      style.textContent = `
        #colonist-advisor-toggle {
          position: fixed;
          top: 10px;
          right: 10px;
          z-index: 999999;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border: 2px solid #e94560;
          border-radius: 8px;
          padding: 8px 14px;
          color: #fff;
          font-family: 'Segoe UI', system-ui, sans-serif;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(233, 69, 96, 0.3);
          transition: all 0.2s ease;
        }
        #colonist-advisor-toggle:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(233, 69, 96, 0.4);
        }
        #colonist-advisor-container {
          position: fixed;
          top: 50px;
          right: 10px;
          width: 320px;
          max-height: calc(100vh - 70px);
          z-index: 999998;
          background: linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%);
          border: 1px solid #e94560;
          border-radius: 12px;
          font-family: 'Segoe UI', system-ui, sans-serif;
          font-size: 12px;
          color: #e0e0e0;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          overflow: hidden;
          transition: all 0.3s ease;
        }
        #colonist-advisor-container.minimized {
          max-height: 40px;
        }
        #colonist-advisor-container.hidden {
          transform: translateX(350px);
          opacity: 0;
          pointer-events: none;
        }
        .ca-header {
          background: linear-gradient(90deg, #e94560 0%, #c23a51 100%);
          padding: 10px 14px;
          font-weight: 700;
          font-size: 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
        }
        .ca-header-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .ca-header-controls {
          display: flex;
          gap: 8px;
        }
        .ca-header-btn {
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          width: 24px;
          height: 24px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ca-header-btn:hover {
          background: rgba(255,255,255,0.3);
        }
        .ca-body {
          padding: 12px;
          overflow-y: auto;
          max-height: calc(100vh - 140px);
        }
        .ca-section {
          margin-bottom: 14px;
        }
        .ca-section:last-child {
          margin-bottom: 0;
        }
        .ca-section-title {
          font-weight: 600;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #e94560;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .ca-resources {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .ca-resource {
          background: rgba(255,255,255,0.08);
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .ca-resource.wood { border-left: 3px solid #4a7c4e; }
        .ca-resource.brick { border-left: 3px solid #c45c3e; }
        .ca-resource.sheep { border-left: 3px solid #8bc34a; }
        .ca-resource.wheat { border-left: 3px solid #ffc107; }
        .ca-resource.ore { border-left: 3px solid #78909c; }
        .ca-suggestion {
          background: rgba(255,255,255,0.05);
          border-radius: 8px;
          padding: 10px;
          margin-bottom: 8px;
          border-left: 3px solid #4fc3f7;
        }
        .ca-suggestion.top {
          border-left-color: #ffd700;
          background: rgba(255, 215, 0, 0.08);
        }
        .ca-suggestion-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }
        .ca-suggestion-title {
          font-weight: 600;
          color: #fff;
        }
        .ca-suggestion-score {
          background: #e94560;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 10px;
          font-weight: 700;
        }
        .ca-suggestion-detail {
          font-size: 11px;
          color: #aaa;
        }
        .ca-build-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px;
          background: rgba(255,255,255,0.05);
          border-radius: 6px;
          margin-bottom: 6px;
        }
        .ca-build-item.can-afford {
          border-left: 3px solid #4caf50;
        }
        .ca-build-item.cannot-afford {
          border-left: 3px solid #666;
          opacity: 0.6;
        }
        .ca-build-name {
          font-weight: 500;
        }
        .ca-build-cost {
          font-size: 10px;
          color: #888;
        }
        .ca-status {
          text-align: center;
          padding: 20px;
          color: #666;
          font-style: italic;
        }
        .ca-turn-indicator {
          padding: 8px 12px;
          border-radius: 6px;
          text-align: center;
          font-weight: 600;
          margin-bottom: 12px;
        }
        .ca-turn-indicator.my-turn {
          background: linear-gradient(90deg, #4caf50 0%, #388e3c 100%);
          color: white;
        }
        .ca-turn-indicator.waiting {
          background: rgba(255,255,255,0.1);
          color: #888;
        }
        .ca-msg-log {
          max-height: 150px;
          overflow-y: auto;
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 10px;
        }
        .ca-msg-item {
          padding: 4px 6px;
          margin-bottom: 2px;
          background: rgba(0,0,0,0.3);
          border-radius: 4px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .ca-msg-item.new {
          border-left: 2px solid #4caf50;
        }
        .ca-msg-type {
          color: #4fc3f7;
        }
        .ca-msg-id {
          color: #ffb74d;
        }
        .ca-msg-time {
          color: #666;
          font-size: 9px;
        }
        .ca-btn {
          background: linear-gradient(135deg, #e94560 0%, #c23a51 100%);
          border: none;
          color: white;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
          margin-top: 8px;
          width: 100%;
        }
        .ca-btn:hover {
          opacity: 0.9;
        }
        .ca-btn-secondary {
          background: rgba(255,255,255,0.1);
        }
      `;
      document.head.appendChild(style);
    },

    createToggleButton() {
      const btn = document.createElement('button');
      btn.id = 'colonist-advisor-toggle';
      btn.innerHTML = '🎯 Advisor';
      btn.onclick = () => this.toggle();
      document.body.appendChild(btn);
    },

    createContainer() {
      const container = document.createElement('div');
      container.id = 'colonist-advisor-container';
      container.innerHTML = `
        <div class="ca-header" onclick="window.colonistAdvisorUI.toggleMinimize()">
          <div class="ca-header-title">
            <span>🎯</span>
            <span>Colonist Advisor</span>
          </div>
          <div class="ca-header-controls">
            <button class="ca-header-btn" onclick="event.stopPropagation(); window.colonistAdvisorUI.refresh()">🔄</button>
            <button class="ca-header-btn" onclick="event.stopPropagation(); window.colonistAdvisorUI.toggle()">✕</button>
          </div>
        </div>
        <div class="ca-body">
          <div class="ca-status">Waiting for game to start...</div>
        </div>
      `;
      document.body.appendChild(container);
      this.container = container;
      
      // Expose to window for onclick handlers
      window.colonistAdvisorUI = this;
    },

    toggle() {
      this.isVisible = !this.isVisible;
      if (this.container) {
        this.container.classList.toggle('hidden', !this.isVisible);
      }
    },

    toggleMinimize() {
      this.isMinimized = !this.isMinimized;
      if (this.container) {
        this.container.classList.toggle('minimized', this.isMinimized);
      }
    },

    refresh() {
      this.update();
    },

    update() {
      if (!this.container || !SHOW_UI) return;
      
      const body = this.container.querySelector('.ca-body');
      if (!body) return;
      
      // Check if game is active
      if (!GameState.myColor) {
        body.innerHTML = '<div class="ca-status">Waiting for game to start...</div>';
        return;
      }
      
      let html = '';
      
      // Turn indicator
      const isMyTurn = GameState.currentTurnColor === GameState.myColor;
      const turnClass = isMyTurn ? 'my-turn' : 'waiting';
      const turnText = isMyTurn ? "🎲 YOUR TURN" : `Waiting for ${PLAYER_COLORS[GameState.currentTurnColor] || 'opponent'}...`;
      html += `<div class="ca-turn-indicator ${turnClass}">${turnText}</div>`;
      
      // Resources section
      const r = GameState.myResources;
      html += `
        <div class="ca-section">
          <div class="ca-section-title">📦 My Resources</div>
          <div class="ca-resources">
            <div class="ca-resource wood">🪵 ${r.wood}</div>
            <div class="ca-resource brick">🧱 ${r.brick}</div>
            <div class="ca-resource sheep">🐑 ${r.sheep}</div>
            <div class="ca-resource wheat">🌾 ${r.wheat}</div>
            <div class="ca-resource ore">�ite ${r.ore}</div>
          </div>
        </div>
      `;
      
      // Strategic recommendation (main action to take)
      if (isMyTurn && !GameState.isSetupPhase) {
        html += this.renderStrategicRecommendation();
      }
      
      // Build options
      html += this.renderBuildOptions();
      
      // Current action suggestions
      const action = GameState.currentAction;
      if (isMyTurn) {
        if (action === 'place_settlement' || action === 1) {
          html += this.renderSettlementSuggestions();
        } else if (action === 'place_road' || action === 3) {
          html += this.renderRoadSuggestions();
        } else if (action === 'place_robber' || action === 24) {
          html += this.renderRobberSuggestions();
        } else if (action === 'main_turn' || action === 7 || action === 0) {
          html += this.renderSettlementSuggestions();
          html += this.renderRoadSuggestions();
        }
      }
      
      // Opponent tracking
      html += this.renderOpponentTracking();
      
      // Message log (for debugging)
      html += this.renderMessageLog();
      
      body.innerHTML = html;
      
      // Attach event listeners after rendering
      this.attachEventListeners();
    },
    
    renderStrategicRecommendation() {
      try {
        const strategy = Advisor.getStrategicRecommendation();
        if (!strategy || !strategy.recommendation) return '';
        
        const rec = strategy.recommendation;
        const ctx = strategy.context;
        const isUrgent = rec.priority >= 90;
        
        return `
          <div class="ca-section">
            <div class="ca-section-title">🎯 What Should I Do?</div>
            <div class="ca-suggestion ${isUrgent ? 'top' : ''}" style="border-left-color: ${isUrgent ? '#ff5722' : '#4caf50'}">
              <div class="ca-suggestion-header">
                <span class="ca-suggestion-title">${rec.action}</span>
                <span class="ca-suggestion-score" style="background: ${isUrgent ? '#ff5722' : '#4caf50'}">${rec.priority}</span>
              </div>
              <div class="ca-suggestion-detail">${rec.reason}</div>
            </div>
            ${strategy.alternatives.length > 0 ? `
              <div style="font-size: 10px; color: #666; margin-top: 6px;">
                Also consider: ${strategy.alternatives.map(a => a.action.split(' ')[1]).join(', ')}
              </div>
            ` : ''}
            <div style="font-size: 10px; color: #888; margin-top: 4px;">
              VP: ${ctx.myVP} | Phase: ${ctx.phase} | Cards: ${ctx.totalCards}
            </div>
          </div>
        `;
      } catch (e) {
        return '';
      }
    },

    renderOpponentTracking() {
      const opponents = Object.entries(GameState.opponentResources)
        .filter(([color]) => parseInt(color) !== GameState.myColor);
      
      if (opponents.length === 0) return '';
      
      let html = `<div class="ca-section"><div class="ca-section-title">👁️ Opponent Cards (Estimated)</div>`;
      
      for (const [color, res] of opponents) {
        const player = GameState.players[color];
        if (!player) continue;
        
        const colorName = PLAYER_COLORS[color] || 'unknown';
        const vp = player.victoryPoints || 0;
        const total = res.total || 0;
        const devCards = GameState.playerDevCards[color]?.total || 0;
        const knightsPlayed = GameState.playerDevCards[color]?.knightsPlayed || 0;
        
        // Build resource string
        const resources = [];
        if (res.wood > 0) resources.push(`🪵${res.wood}`);
        if (res.brick > 0) resources.push(`🧱${res.brick}`);
        if (res.sheep > 0) resources.push(`🐑${res.sheep}`);
        if (res.wheat > 0) resources.push(`🌾${res.wheat}`);
        if (res.ore > 0) resources.push(`�ite${res.ore}`);
        
        const resourceStr = resources.length > 0 ? resources.join(' ') : 'Unknown';
        const vpWarning = vp >= 8 ? ' ⚠️' : '';
        
        html += `
          <div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 6px; margin-bottom: 6px; border-left: 3px solid ${this.getColorCode(colorName)}">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="font-weight: 600; color: ${this.getColorCode(colorName)}">${player.username}</span>
              <span style="color: #888; font-size: 11px;">${vp} VP${vpWarning}</span>
            </div>
            <div style="font-size: 11px; color: #aaa;">
              Cards: ~${total} | ${resourceStr}
            </div>
            ${devCards > 0 || knightsPlayed > 0 ? `
              <div style="font-size: 10px; color: #888; margin-top: 2px;">
                🃏 ${devCards} held | ⚔️ ${knightsPlayed} knights
              </div>
            ` : ''}
          </div>
        `;
      }
      
      // Largest Army info
      if (GameState.largestArmyOwner) {
        const owner = GameState.players[GameState.largestArmyOwner];
        const ownerName = owner?.username || 'Unknown';
        html += `
          <div style="font-size: 10px; color: #e94560; margin-top: 4px;">
            ⚔️ Largest Army: ${ownerName} (${GameState.largestArmySize} knights)
          </div>
        `;
      }
      
      html += '</div>';
      return html;
    },
    
    getColorCode(colorName) {
      const colors = {
        red: '#e74c3c',
        blue: '#3498db',
        orange: '#e67e22',
        white: '#ecf0f1'
      };
      return colors[colorName] || '#888';
    },
    
    renderMessageLog() {
      const messages = GameState.messageLog.slice(-10).reverse(); // Last 10, newest first
      const seenTypes = GameState.seenMessageTypes?.size || 0;
      
      let html = `
        <div class="ca-section">
          <div class="ca-section-title">📨 Recent Messages (${seenTypes} types seen)</div>
          <div class="ca-msg-log">
      `;
      
      if (messages.length === 0) {
        html += '<div class="ca-status" style="padding: 10px;">No messages yet...</div>';
      } else {
        for (const msg of messages) {
          const data = msg.data;
          const time = new Date(msg.timestamp).toLocaleTimeString();
          
          let typeStr = '';
          let idStr = '';
          let details = '';
          
          if (data.type && typeof data.type === 'string') {
            typeStr = data.type;
          } else if (data.id !== undefined && data.data?.type !== undefined) {
            idStr = `ID:${data.id}`;
            typeStr = `T:${data.data.type}`;
            
            // Add payload info
            if (data.data.payload) {
              if (data.data.payload.diff) {
                const diffKeys = Object.keys(data.data.payload.diff);
                details = `diff:[${diffKeys.join(',')}]`;
              } else if (Array.isArray(data.data.payload)) {
                details = `arr[${data.data.payload.length}]`;
              } else if (typeof data.data.payload === 'object') {
                details = Object.keys(data.data.payload).slice(0, 2).join(',');
              }
            }
          } else if (data.id !== undefined) {
            idStr = `ID:${data.id}`;
          }
          
          html += `
            <div class="ca-msg-item">
              <div>
                ${idStr ? `<span class="ca-msg-id">${idStr}</span> ` : ''}
                <span class="ca-msg-type">${typeStr}</span>
                ${details ? `<span style="color:#888"> ${details}</span>` : ''}
              </div>
              <span class="ca-msg-time">${time}</span>
            </div>
          `;
        }
      }
      
      html += `
          </div>
          <button class="ca-btn ca-btn-secondary" id="ca-download-last20-btn">
            📥 Download Last 20 Messages
          </button>
        </div>
      `;
      
      return html;
    },
    
    // Called after render to attach event listeners
    attachEventListeners() {
      const downloadBtn = document.getElementById('ca-download-last20-btn');
      if (downloadBtn) {
        downloadBtn.onclick = () => this.downloadLast20();
      }
    },
    
    downloadLast20() {
      const messages = GameState.messageLog.slice(-20);
      const data = {
        exportedAt: new Date().toISOString(),
        description: 'Last 20 messages for debugging',
        gameInfo: {
          myColor: GameState.myColor,
          players: GameState.players,
          currentAction: GameState.currentAction,
          currentTurnColor: GameState.currentTurnColor
        },
        messageCount: messages.length,
        messages: messages
      };
      
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `colonist-last20-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log(`${LOG_PREFIX} 📥 Downloaded last ${messages.length} messages`);
    },

    renderBuildOptions() {
      const canAffordRoad = Advisor.canAfford('road');
      const canAffordSettlement = Advisor.canAfford('settlement');
      const canAffordCity = Advisor.canAfford('city');
      const canAffordDev = Advisor.canAfford('devCard');
      
      return `
        <div class="ca-section">
          <div class="ca-section-title">🔨 Build Options</div>
          <div class="ca-build-item ${canAffordCity ? 'can-afford' : 'cannot-afford'}">
            <div>
              <div class="ca-build-name">🏰 City</div>
              <div class="ca-build-cost">2 wheat, 3 ore</div>
            </div>
            <div>${canAffordCity ? '✅' : '❌'}</div>
          </div>
          <div class="ca-build-item ${canAffordSettlement ? 'can-afford' : 'cannot-afford'}">
            <div>
              <div class="ca-build-name">🏠 Settlement</div>
              <div class="ca-build-cost">1 each: wood, brick, sheep, wheat</div>
            </div>
            <div>${canAffordSettlement ? '✅' : '❌'}</div>
          </div>
          <div class="ca-build-item ${canAffordDev ? 'can-afford' : 'cannot-afford'}">
            <div>
              <div class="ca-build-name">🃏 Dev Card</div>
              <div class="ca-build-cost">1 each: sheep, wheat, ore</div>
            </div>
            <div>${canAffordDev ? '✅' : '❌'}</div>
          </div>
          <div class="ca-build-item ${canAffordRoad ? 'can-afford' : 'cannot-afford'}">
            <div>
              <div class="ca-build-name">🛤️ Road</div>
              <div class="ca-build-cost">1 wood, 1 brick</div>
            </div>
            <div>${canAffordRoad ? '✅' : '❌'}</div>
          </div>
        </div>
      `;
    },

    renderSettlementSuggestions() {
      const useServer = GameState.availableSettlements.length > 0;
      const spots = useServer ? GameState.availableSettlements : Object.keys(GameState.corners);
      
      const scored = [];
      for (const cornerId of spots.slice(0, 20)) { // Limit for performance
        const result = Advisor.scoreCorner(cornerId, useServer);
        if (result) scored.push(result);
      }
      scored.sort((a, b) => b.score - a.score);
      
      if (scored.length === 0) {
        return `
          <div class="ca-section">
            <div class="ca-section-title">🏠 Settlement Spots</div>
            <div class="ca-status">No spots available</div>
          </div>
        `;
      }
      
      let html = `<div class="ca-section"><div class="ca-section-title">🏠 Best Settlement Spots</div>`;
      
      for (let i = 0; i < Math.min(3, scored.length); i++) {
        const s = scored[i];
        const isTop = i === 0;
        html += `
          <div class="ca-suggestion ${isTop ? 'top' : ''}">
            <div class="ca-suggestion-header">
              <span class="ca-suggestion-title">${isTop ? '⭐' : ''} Corner ${s.cornerId}</span>
              <span class="ca-suggestion-score">${s.score}</span>
            </div>
            <div class="ca-suggestion-detail">
              ${s.tiles.join(', ')}<br>
              ${s.resourceDiversity.join(', ')} • ${s.totalProbability} pips
            </div>
          </div>
        `;
      }
      
      html += '</div>';
      return html;
    },

    renderRoadSuggestions() {
      const roads = Advisor.suggestRoadPlacement ? 
        (() => { 
          // Suppress console output
          const origLog = console.log;
          console.log = () => {};
          const result = Advisor.calculateAvailableRoads();
          console.log = origLog;
          return result;
        })() : [];
      
      if (roads.length === 0) {
        return '';
      }
      
      // Score roads
      const scored = [];
      for (const edgeId of roads.slice(0, 10)) {
        const [c1, c2] = GameState.edgeToCorners[edgeId] || [];
        let bestScore = 0;
        let bestCorner = null;
        
        for (const cid of [c1, c2]) {
          if (cid !== undefined && GameState.corners[cid]?.owner === null) {
            const cs = Advisor.scoreCorner(cid, false);
            if (cs && cs.score > bestScore) {
              bestScore = cs.score;
              bestCorner = cs;
            }
          }
        }
        
        if (bestCorner) {
          scored.push({ edgeId, score: Math.round(bestScore * 0.4), leadsTo: bestCorner });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      
      if (scored.length === 0) return '';
      
      let html = `<div class="ca-section"><div class="ca-section-title">🛤️ Best Roads</div>`;
      
      for (let i = 0; i < Math.min(2, scored.length); i++) {
        const r = scored[i];
        const isTop = i === 0;
        html += `
          <div class="ca-suggestion ${isTop ? 'top' : ''}">
            <div class="ca-suggestion-header">
              <span class="ca-suggestion-title">${isTop ? '⭐' : ''} Edge ${r.edgeId}</span>
              <span class="ca-suggestion-score">${r.score}</span>
            </div>
            <div class="ca-suggestion-detail">
              Leads to: ${r.leadsTo.tiles.join(', ')}
            </div>
          </div>
        `;
      }
      
      html += '</div>';
      return html;
    },

    renderRobberSuggestions() {
      const spots = GameState.availableRobberSpots;
      if (spots.length === 0) return '';
      
      const scored = [];
      for (const tileId of spots) {
        const tile = GameState.tiles[tileId];
        if (!tile || tile.type === 0) continue;
        
        let score = 0;
        const corners = GameState.tileToCorners[tileId] || [];
        for (const cid of corners) {
          const c = GameState.corners[cid];
          if (c && c.owner && c.owner !== GameState.myColor) {
            score += tile.probability * 10;
            if (c.buildingType === 2) score += 15;
          } else if (c && c.owner === GameState.myColor) {
            score -= 50;
          }
        }
        
        if (score > 0) {
          scored.push({ tileId, score, resource: tile.resource, number: tile.diceNumber });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      
      if (scored.length === 0) return '';
      
      let html = `<div class="ca-section"><div class="ca-section-title">🦹 Robber Placement</div>`;
      
      for (let i = 0; i < Math.min(2, scored.length); i++) {
        const r = scored[i];
        html += `
          <div class="ca-suggestion ${i === 0 ? 'top' : ''}">
            <div class="ca-suggestion-header">
              <span class="ca-suggestion-title">${i === 0 ? '⭐' : ''} Tile ${r.tileId}</span>
              <span class="ca-suggestion-score">${r.score}</span>
            </div>
            <div class="ca-suggestion-detail">
              ${r.resource} (${r.number}) - blocks opponent
            </div>
          </div>
        `;
      }
      
      html += '</div>';
      return html;
    }
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
    
    // Available spots (from server - types 30, 31, 32, 33)
    availableSettlements: [],  // Corner IDs where I can build settlements
    availableRoads: [],        // Edge IDs where I can build roads
    availableCities: [],       // Corner IDs where I can upgrade to city
    availableRobberSpots: [],  // Tile IDs where I can place robber
    
    // My resources (only visible to me)
    myResources: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 },
    myDevCards: [],            // Array of card types I hold
    myPlayedDevCards: [],      // Dev cards I've played
    
    // Development cards tracking per player
    playerDevCards: {},        // color -> { total: n, knights: n, unknown: n }
    largestArmyOwner: null,    // color of player with largest army
    largestArmySize: 0,        // how many knights
    
    // Opponent resource tracking (probability-based)
    opponentResources: {},     // color -> { wood: 0, brick: 0, ... , total: 0 }
    
    // Victory points tracking
    playerVP: {},              // color -> { settlements: n, cities: n, longestRoad: bool, largestArmy: bool, devCards: n }
    
    // Tracking
    diceHistory: [],
    messageLog: [],
    seenMessageTypes: new Set(),  // Track unique message types to avoid duplicates
    
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
      this.availableSettlements = [];
      this.availableRoads = [];
      this.availableCities = [];
      this.availableRobberSpots = [];
      this.myResources = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
      this.myDevCards = [];
      this.myPlayedDevCards = [];
      this.playerDevCards = {};
      this.largestArmyOwner = null;
      this.largestArmySize = 0;
      this.opponentResources = {};
      this.playerVP = {};
      this.diceHistory = [];
      this.messageLog = [];
      this.seenMessageTypes = new Set();
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
  // Message Deduplication Helpers
  // ============================================================================

  /**
   * Check if a message is empty or contains minimal data
   * Filters out messages that are just numbers (like 2, 4) or empty objects
   */
  function isEmptyMessage(data) {
    if (data === null || data === undefined) return true;
    
    // Simple primitive values (numbers, strings) are considered empty
    if (typeof data !== 'object') return true;
    
    // Empty objects
    if (Object.keys(data).length === 0) return true;
    
    // Check for minimal data structures that don't contain useful info
    // Messages with just a number (like { data: 2 }) are empty
    if (Object.keys(data).length === 1 && typeof data.data === 'number') {
      return true;
    }
    
    return false;
  }

  /**
   * Generate a unique key for a message type to identify duplicates
   * This key is based on the message structure, not the content
   */
  function getMessageTypeKey(data) {
    if (!data || typeof data !== 'object') {
      return `primitive_${typeof data}_${data}`;
    }
    
    // Handle messages with type property (like "Connected", "SessionEstablished")
    if (data.type && typeof data.type === 'string') {
      return `type_string_${data.type}`;
    }
    
    // Handle messages with id and data.type structure
    if (data.id !== undefined && data.data && data.data.type !== undefined) {
      const id = data.id;
      const type = data.data.type;
      // Include payload structure if it exists
      const hasPayload = data.data.payload !== undefined && data.data.payload !== null;
      const payloadKeys = hasPayload && typeof data.data.payload === 'object' && !Array.isArray(data.data.payload)
        ? Object.keys(data.data.payload).sort().join(',')
        : (hasPayload && Array.isArray(data.data.payload) ? 'array' : 'no_payload');
      return `id_${id}_type_${type}_payload_${payloadKeys}`;
    }
    
    // Handle messages with just id
    if (data.id !== undefined) {
      return `id_only_${data.id}`;
    }
    
    // Handle messages with type number (in data.data.type)
    if (data.data && typeof data.data === 'object' && data.data.type !== undefined) {
      return `nested_type_${data.data.type}`;
    }
    
    // Fallback: use structure signature
    const keys = Object.keys(data).sort();
    const structure = keys.map(k => {
      const val = data[k];
      if (typeof val === 'object' && val !== null) {
        return `${k}:${Object.keys(val).sort().join(',')}`;
      }
      return `${k}:${typeof val}`;
    }).join('|');
    
    return `structure_${structure}`;
  }

  /**
   * Deduplicate an array of messages, keeping only the first occurrence of each type
   * Also filters out empty messages
   */
  function deduplicateMessages(messages) {
    const seen = new Set();
    const deduplicated = [];
    
    for (const msg of messages) {
      const data = msg.data || msg;
      
      // Skip empty messages
      if (isEmptyMessage(data)) {
        continue;
      }
      
      // Generate type key
      const typeKey = getMessageTypeKey(data);
      
      // Only keep first occurrence
      if (!seen.has(typeKey)) {
        seen.add(typeKey);
        deduplicated.push(msg);
      }
    }
    
    return deduplicated;
  }

  // ============================================================================
  // Message Parser
  // ============================================================================

  const MessageParser = {
    parse(decoded) {
      if (!decoded) return null;
      
      // Store raw message (but skip heartbeats to save memory)
      const isHeartbeat = decoded.id === 136 || decoded.id === '136';
      if (!isHeartbeat) {
        // Skip empty messages
        if (isEmptyMessage(decoded)) {
          if (DEBUG) {
            console.log(`${LOG_PREFIX} ⏭️ Skipping empty message:`, decoded);
          }
        } else {
          // Generate unique key for this message type
          const typeKey = getMessageTypeKey(decoded);
          
          // Only log if we haven't seen this message type before
          if (!GameState.seenMessageTypes.has(typeKey)) {
            GameState.seenMessageTypes.add(typeKey);
            GameState.messageLog.push({
              timestamp: Date.now(),
              data: decoded
            });
            
            // Debug logging (only in debug mode)
            if (DEBUG) {
              console.log(`${LOG_PREFIX} 📥 New message type logged - key: ${typeKey}, type: ${decoded.type}, id: ${decoded.id}`);
            }
          } else if (DEBUG) {
            console.log(`${LOG_PREFIX} ⏭️ Skipping duplicate message type: ${typeKey}`);
          }
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
      
      // Heartbeat messages - check by data structure (only has timestamp)
      if (data?.timestamp && Object.keys(data).length === 1) {
        if (LOG_HEARTBEATS) console.log(`${LOG_PREFIX} 💓 Heartbeat: ${data.timestamp}`);
        return { isHeartbeat: true };
      }
      
      // Handle ANY id with data.type (works for bot games id=130 and 1v1 games id="133","139",etc.)
      if (data?.type !== undefined) {
        const msgType = data.type;
        const payload = data.payload;
        
        // Type 4 = Full game state (game started)
        if (msgType === 4 && payload) {
          console.log(`${LOG_PREFIX} 🎮 GAME STARTED (id=${id}, type=${msgType})`);
          this.parseFullGameState(payload);
          return { isGameStart: true };
        }
        
        // Type 28 = Resource distribution (track opponent resources)
        if (msgType === 28 && Array.isArray(payload)) {
          this.parseResourceDistribution(payload);
          return { isResourceDist: true };
        }
        
        // Type 30 = Available settlement spots
        if (msgType === 30 && Array.isArray(payload)) {
          GameState.availableSettlements = payload;
          if (payload.length > 0 && GameState.currentTurnColor === GameState.myColor) {
            console.log(`${LOG_PREFIX} 🏠 Available settlements: ${payload.length} spots`);
            // Auto-suggest if it's our turn to place
            if (GameState.currentAction === 'place_settlement' || GameState.currentAction === 1) {
              setTimeout(() => Advisor.suggestInitialPlacement(), 50);
            }
            AdvisorUI.update();
          }
          return { isAvailableSpots: true };
        }
        
        // Type 31 = Available road spots
        if (msgType === 31 && Array.isArray(payload)) {
          GameState.availableRoads = payload;
          if (payload.length > 0 && GameState.currentTurnColor === GameState.myColor) {
            console.log(`${LOG_PREFIX} 🛤️ Available roads: ${payload.length} spots`);
            // Auto-suggest if it's our turn to place
            if (GameState.currentAction === 'place_road' || GameState.currentAction === 3) {
              setTimeout(() => Advisor.suggestRoadPlacement(), 50);
            }
            AdvisorUI.update();
          }
          return { isAvailableSpots: true };
        }
        
        // Type 32 = Available city upgrades
        if (msgType === 32 && Array.isArray(payload)) {
          GameState.availableCities = payload;
          if (payload.length > 0 && DEBUG) {
            console.log(`${LOG_PREFIX} 🏰 Available cities: ${payload.length} spots`);
          }
          return { isAvailableSpots: true };
        }
        
        // Type 33 = Available robber spots
        if (msgType === 33 && Array.isArray(payload)) {
          GameState.availableRobberSpots = payload;
          if (payload.length > 0 && GameState.currentTurnColor === GameState.myColor) {
            console.log(`${LOG_PREFIX} 🦹 Available robber spots: ${payload.length} tiles`);
            setTimeout(() => Advisor.suggestRobberPlacement(), 50);
          }
          return { isAvailableSpots: true };
        }
        
        // Type 91 = Game state diff
        if (msgType === 91 && data.payload?.diff) {
          this.parseDiffUpdate(data.payload.diff);
          return { isGameUpdate: true };
        }
        
        // Any other type with payload.diff (state updates)
        if (data.payload?.diff) {
          this.parseDiffUpdate(data.payload.diff);
          return { isGameUpdate: true };
        }
        
        // Log unhandled types for debugging
        if (DEBUG) {
          console.log(`${LOG_PREFIX} 📨 Unhandled: id=${id}, type=${msgType}`);
        }
      }
      
      return {};
    },
    
    /**
     * Parse resource distribution (type 28) to track opponent resources
     */
    parseResourceDistribution(distributions) {
      for (const dist of distributions) {
        const { owner, card, distributionType } = dist;
        if (!owner) continue;
        
        // Convert card type to resource name
        const resourceMap = { 1: 'wood', 2: 'sheep', 3: 'ore', 4: 'wheat', 5: 'brick' };
        const resource = resourceMap[card];
        
        if (owner !== GameState.myColor) {
          // Track opponent resources (estimate)
          if (!GameState.opponentResources[owner]) {
            GameState.opponentResources[owner] = { 
              wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0, 
              total: 0,
              lastUpdated: Date.now()
            };
          }
          if (resource) {
            GameState.opponentResources[owner][resource]++;
            GameState.opponentResources[owner].total++;
            GameState.opponentResources[owner].lastUpdated = Date.now();
          }
        }
      }
      
      // Update UI with new opponent info
      AdvisorUI.update();
    },
    
    /**
     * Track when opponent spends resources (building, buying dev cards)
     */
    trackOpponentSpend(playerColor, cost) {
      if (playerColor === GameState.myColor) return;
      
      const opp = GameState.opponentResources[playerColor];
      if (!opp) return;
      
      for (const [resource, amount] of Object.entries(cost)) {
        opp[resource] = Math.max(0, (opp[resource] || 0) - amount);
        opp.total = Math.max(0, (opp.total || 0) - amount);
      }
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
      
      // Update UI
      setTimeout(() => AdvisorUI.update(), 150);
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
      
      // Development cards state
      if (gs.mechanicDevelopmentCardsState) {
        const devState = gs.mechanicDevelopmentCardsState;
        
        // Parse player dev cards
        if (devState.players) {
          for (const [colorId, pState] of Object.entries(devState.players)) {
            const color = parseInt(colorId);
            
            // Initialize tracking
            if (!GameState.playerDevCards[color]) {
              GameState.playerDevCards[color] = { total: 0, knights: 0, knightsPlayed: 0 };
            }
            
            // Count cards held
            if (pState.developmentCards?.cards) {
              const cards = pState.developmentCards.cards;
              GameState.playerDevCards[color].total = cards.length;
              
              // For myself, track actual card types
              if (color === GameState.myColor) {
                GameState.myDevCards = cards.map(c => DEV_CARD_TYPES[c] || 'unknown');
              }
            }
            
            // Track played cards (knights for largest army)
            if (pState.developmentCardsUsed) {
              const knightsPlayed = pState.developmentCardsUsed.filter(c => c === 0).length;
              GameState.playerDevCards[color].knightsPlayed = knightsPlayed;
              
              // Check for largest army (3+ knights)
              if (knightsPlayed >= 3 && knightsPlayed > GameState.largestArmySize) {
                GameState.largestArmyOwner = color;
                GameState.largestArmySize = knightsPlayed;
              }
            }
          }
        }
      }
      
      // Largest army state
      if (gs.mechanicLargestArmyState) {
        for (const [colorId, state] of Object.entries(gs.mechanicLargestArmyState)) {
          if (state.hasLargestArmy) {
            GameState.largestArmyOwner = parseInt(colorId);
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
            
            // Track opponent spending
            if (state.owner !== GameState.myColor && !GameState.isSetupPhase) {
              if (state.buildingType === 1) {
                this.trackOpponentSpend(state.owner, BUILD_COSTS.settlement);
              } else if (state.buildingType === 2) {
                this.trackOpponentSpend(state.owner, BUILD_COSTS.city);
              }
            }
            
            // If I just placed a settlement during setup, suggest roads
            if (state.owner === GameState.myColor && state.buildingType === 1 && GameState.isSetupPhase) {
              setTimeout(() => Advisor.suggestRoadPlacement(), 150);
            }
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
            
            // Track opponent spending
            if (state.owner !== GameState.myColor && !GameState.isSetupPhase) {
              this.trackOpponentSpend(state.owner, BUILD_COSTS.road);
            }
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
      
      // Update UI after processing diff
      AdvisorUI.update();
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
      const prevTurn = GameState.currentTurnColor;
      
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
      if (currentTurnPlayerColor !== undefined && currentTurnPlayerColor !== prevTurn) {
        const playerName = GameState.players[currentTurnPlayerColor]?.username || PLAYER_COLORS[currentTurnPlayerColor];
        const isMyTurn = currentTurnPlayerColor === GameState.myColor;
        console.log(`${LOG_PREFIX} 🎯 ${isMyTurn ? '>>> YOUR TURN <<<' : `${playerName}'s turn`} - Action: ${GameState.currentAction}`);
      }
      
      // Log action changes (when turn doesn't change but action does)
      if (actionState !== undefined && GameState.currentAction !== prevAction) {
        console.log(`${LOG_PREFIX} 🎮 Action changed: ${prevAction} → ${GameState.currentAction}`);
      }
      
      // Suggest actions when it's our turn and action changed
      const actionChanged = GameState.currentAction !== prevAction;
      const turnChanged = currentTurnPlayerColor !== undefined;
      
      if (GameState.currentTurnColor === GameState.myColor && (actionChanged || turnChanged)) {
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
     * @param {number|string} cornerId - Corner to score
     * @param {boolean} useServerAvailable - Only score if server says it's available
     */
    scoreCorner(cornerId, useServerAvailable = false) {
      const cId = parseInt(cornerId);
      const corner = GameState.corners[cId];
      if (!corner) return null;
      
      // If using server's available spots, check if this corner is in the list
      if (useServerAvailable && GameState.availableSettlements.length > 0) {
        if (!GameState.availableSettlements.includes(cId)) {
          return null;
        }
      } else {
        // Fallback: manual validation
        // Skip if already occupied
        if (corner.owner !== null && corner.owner !== undefined) return null;
        
        // Skip if adjacent corner is occupied (distance rule)
        const neighbors = GameState.cornerToCorners[cId] || [];
        for (const neighborId of neighbors) {
          const neighborOwner = GameState.corners[neighborId]?.owner;
          if (neighborOwner !== null && neighborOwner !== undefined) {
            return null;
          }
        }
      }
      
      // Get adjacent tiles
      const tileIds = GameState.cornerToTiles[cId] || [];
      if (tileIds.length === 0) return null;
      
      let totalProbability = 0;
      let resourceDiversity = new Set();
      let resources = {};
      let hasPort = this.getPortForCorner(cId);
      
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
      
      // ===== ENHANCED SCORING =====
      let score = 0;
      let breakdown = {};
      
      // 1. Total probability (pips) - foundation of score (max ~15 pips = 150 points)
      breakdown.probability = totalProbability * 10;
      score += breakdown.probability;
      
      // 2. Resource diversity bonus (more types = better)
      breakdown.diversity = resourceDiversity.size * 12;
      score += breakdown.diversity;
      
      // 3. Strategic resource bonus
      // Ore + Wheat = cities and dev cards (late game power)
      // Wood + Brick = roads and settlements (early expansion)
      breakdown.strategic = 0;
      if (GameState.isSetupPhase) {
        // Early game: wood/brick for expansion, but ore/wheat needed for cities
        if (resources.ore) breakdown.strategic += resources.ore.probability * 3;
        if (resources.wheat) breakdown.strategic += resources.wheat.probability * 3;
        if (resources.wood) breakdown.strategic += resources.wood.probability * 1;
        if (resources.brick) breakdown.strategic += resources.brick.probability * 1;
      } else {
        // Mid/Late game: ore/wheat more valuable
        if (resources.ore) breakdown.strategic += resources.ore.probability * 4;
        if (resources.wheat) breakdown.strategic += resources.wheat.probability * 4;
      }
      score += breakdown.strategic;
      
      // 4. Port bonus - 2:1 ports are very valuable with matching resource
      breakdown.port = 0;
      if (hasPort) {
        if (hasPort.ratio === 3) {
          breakdown.port = 8; // 3:1 port
        } else if (hasPort.ratio === 2) {
          // 2:1 port - extra valuable if we produce that resource
          if (resources[hasPort.resource]) {
            breakdown.port = 15 + resources[hasPort.resource].probability * 2;
          } else {
            breakdown.port = 5;
          }
        }
      }
      score += breakdown.port;
      
      // 5. Number quality bonus (6 and 8 are best, then 5 and 9)
      breakdown.numbers = 0;
      for (const tileId of tileIds) {
        const tile = GameState.tiles[tileId];
        if (!tile) continue;
        if (tile.diceNumber === 6 || tile.diceNumber === 8) breakdown.numbers += 5;
        else if (tile.diceNumber === 5 || tile.diceNumber === 9) breakdown.numbers += 2;
      }
      score += breakdown.numbers;
      
      // 6. Robber penalty
      breakdown.robber = 0;
      if (tileIds.includes(GameState.robberTile)) {
        breakdown.robber = -8;
      }
      score += breakdown.robber;
      
      // 7. Complementary resources (cover what we don't have yet)
      breakdown.complement = 0;
      if (!GameState.isSetupPhase || GameState.completedTurns >= 2) {
        const myResTypes = this.getMyResourceTypes();
        for (const res of resourceDiversity) {
          if (!myResTypes.has(res)) {
            breakdown.complement += 8; // Bonus for new resource type
          }
        }
      }
      score += breakdown.complement;
      
      // 8. Expansion potential (are there good spots reachable from here?)
      breakdown.expansion = 0;
      const adjacentEdges = GameState.cornerToEdges[cId] || [];
      for (const edgeId of adjacentEdges) {
        const [c1, c2] = GameState.edgeToCorners[edgeId] || [];
        const nextCorner = (c1 == cId) ? c2 : c1;
        if (nextCorner !== undefined) {
          // Quick check: is the next corner potentially buildable?
          const nc = GameState.corners[nextCorner];
          if (nc && nc.owner === null) {
            const nextTiles = GameState.cornerToTiles[nextCorner] || [];
            let nextProb = 0;
            for (const tid of nextTiles) {
              const t = GameState.tiles[tid];
              if (t && t.type !== 0) nextProb += t.probability || 0;
            }
            if (nextProb >= 10) breakdown.expansion += 3;
          }
        }
      }
      score += breakdown.expansion;
      
      return {
        cornerId: cId,
        score: Math.round(score * 10) / 10,
        totalProbability,
        resources,
        resourceDiversity: Array.from(resourceDiversity),
        port: hasPort,
        breakdown,
        tiles: tileIds.map(id => {
          const t = GameState.tiles[id];
          return t ? `${t.resource}(${t.diceNumber})` : null;
        }).filter(Boolean)
      };
    },
    
    /**
     * Get port info for a corner (if any)
     */
    getPortForCorner(cornerId) {
      // Check edges adjacent to this corner for ports
      const edgeIds = GameState.cornerToEdges[cornerId] || [];
      for (const edgeId of edgeIds) {
        const port = GameState.ports[edgeId];
        if (port) {
          return port;
        }
      }
      return null;
    },
    
    /**
     * Get set of resource types I'm currently producing
     */
    getMyResourceTypes() {
      const types = new Set();
      for (const [cornerId, corner] of Object.entries(GameState.corners)) {
        if (corner.owner === GameState.myColor) {
          const tileIds = GameState.cornerToTiles[cornerId] || [];
          for (const tileId of tileIds) {
            const tile = GameState.tiles[tileId];
            if (tile && tile.type !== 0) {
              types.add(tile.resource);
            }
          }
        }
      }
      return types;
    },
    
    /**
     * Suggest best positions for initial settlement placement
     */
    suggestInitialPlacement() {
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      console.log(`${LOG_PREFIX} 🎯 SETTLEMENT PLACEMENT ANALYSIS`);
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      
      const scores = [];
      const useServer = GameState.availableSettlements.length > 0;
      
      if (useServer) {
        // Use server's available spots (accurate)
        for (const cornerId of GameState.availableSettlements) {
          const result = this.scoreCorner(cornerId, true);
          if (result) {
            scores.push(result);
          }
        }
        console.log(`${LOG_PREFIX} Using server data: ${GameState.availableSettlements.length} valid spots`);
      } else {
        // Fallback: calculate ourselves
        for (const cornerId of Object.keys(GameState.corners)) {
          const result = this.scoreCorner(cornerId, false);
          if (result) {
            scores.push(result);
          }
        }
        console.log(`${LOG_PREFIX} Using calculated spots: ${scores.length} valid spots`);
      }
      
      // Sort by score descending
      scores.sort((a, b) => b.score - a.score);
      
      if (scores.length === 0) {
        console.log(`${LOG_PREFIX} ❌ No valid settlement spots found`);
        return [];
      }
      
      // Show top 5
      console.log(`${LOG_PREFIX} `);
      console.log(`${LOG_PREFIX} 🏆 TOP ${Math.min(5, scores.length)} SETTLEMENT SPOTS:`);
      console.log(`${LOG_PREFIX} `);
      
      for (let i = 0; i < Math.min(5, scores.length); i++) {
        const s = scores[i];
        const portInfo = s.port ? `🚢 ${s.port.ratio}:1 ${s.port.resource}` : '';
        const b = s.breakdown;
        
        console.log(`${LOG_PREFIX}   ${i === 0 ? '⭐' : (i + 1) + '.'} Corner ${s.cornerId} — Score: ${s.score}`);
        console.log(`${LOG_PREFIX}      📍 Tiles: ${s.tiles.join(', ')}`);
        console.log(`${LOG_PREFIX}      🎲 Pips: ${s.totalProbability} | 🌈 Resources: ${s.resourceDiversity.join(', ')} ${portInfo}`);
        
        // Show score breakdown for top pick
        if (i === 0 && b) {
          const parts = [];
          if (b.probability) parts.push(`prob:${b.probability}`);
          if (b.diversity) parts.push(`div:${b.diversity}`);
          if (b.strategic) parts.push(`strat:${b.strategic}`);
          if (b.port) parts.push(`port:${b.port}`);
          if (b.complement) parts.push(`new:${b.complement}`);
          if (b.expansion) parts.push(`exp:${b.expansion}`);
          console.log(`${LOG_PREFIX}      📊 Breakdown: ${parts.join(' + ')}`);
        }
        console.log(`${LOG_PREFIX} `);
      }
      
      console.log(`${LOG_PREFIX} 💡 Recommendation: Build on Corner ${scores[0].cornerId}`);
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      
      return scores.slice(0, 5);
    },
    
    /**
     * Suggest best road placement
     */
    suggestRoadPlacement() {
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      console.log(`${LOG_PREFIX} 🛤️ ROAD PLACEMENT ANALYSIS`);
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      
      const useServer = GameState.availableRoads.length > 0;
      const roadCandidates = useServer ? GameState.availableRoads : this.calculateAvailableRoads();
      
      if (roadCandidates.length === 0) {
        console.log(`${LOG_PREFIX} ❌ No available road spots`);
        return [];
      }
      
      console.log(`${LOG_PREFIX} ${useServer ? 'Using server data' : 'Calculated'}: ${roadCandidates.length} valid spots`);
      
      // Score each road
      const scoredRoads = [];
      
      for (const edgeId of roadCandidates) {
        const edge = GameState.edges[edgeId];
        if (!edge) continue;
        
        const [corner1, corner2] = GameState.edgeToCorners[edgeId] || [];
        if (corner1 === undefined || corner2 === undefined) continue;
        
        let score = 0;
        let leadsTo = [];
        let breakdown = { expansion: 0, port: 0, longestRoad: 0 };
        
        // Score based on where it leads
        for (const cornerId of [corner1, corner2]) {
          const c = GameState.corners[cornerId];
          if (c && c.owner === null) {
            // This road leads to an empty corner - score it
            const cornerScore = this.scoreCorner(cornerId, false);
            if (cornerScore) {
              breakdown.expansion += Math.round(cornerScore.score * 0.4);
              leadsTo.push({
                corner: cornerId,
                tiles: cornerScore.tiles,
                score: cornerScore.score
              });
            }
            
            // Port bonus
            const port = this.getPortForCorner(cornerId);
            if (port) {
              breakdown.port += (port.ratio === 2) ? 8 : 4;
            }
          }
        }
        
        // Longest road potential (simplified)
        breakdown.longestRoad = 2; // Base value for extending road network
        
        score = breakdown.expansion + breakdown.port + breakdown.longestRoad;
        
        scoredRoads.push({
          edgeId: parseInt(edgeId),
          score: Math.round(score),
          leadsTo,
          breakdown
        });
      }
      
      // Sort by score
      scoredRoads.sort((a, b) => b.score - a.score);
      
      if (scoredRoads.length === 0) {
        console.log(`${LOG_PREFIX} ❌ Could not score any roads`);
        return [];
      }
      
      console.log(`${LOG_PREFIX} `);
      console.log(`${LOG_PREFIX} 🏆 TOP ${Math.min(3, scoredRoads.length)} ROAD OPTIONS:`);
      console.log(`${LOG_PREFIX} `);
      
      for (let i = 0; i < Math.min(3, scoredRoads.length); i++) {
        const r = scoredRoads[i];
        const bestDest = r.leadsTo[0];
        
        console.log(`${LOG_PREFIX}   ${i === 0 ? '⭐' : (i + 1) + '.'} Edge ${r.edgeId} — Score: ${r.score}`);
        if (bestDest) {
          console.log(`${LOG_PREFIX}      ➡️ Leads to Corner ${bestDest.corner}: ${bestDest.tiles.join(', ')}`);
        }
        console.log(`${LOG_PREFIX} `);
      }
      
      console.log(`${LOG_PREFIX} 💡 Recommendation: Build on Edge ${scoredRoads[0].edgeId}`);
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      
      return scoredRoads.slice(0, 3);
    },
    
    /**
     * Fallback: calculate available roads ourselves
     */
    calculateAvailableRoads() {
      const available = [];
      
      // Roads must connect to my existing roads or buildings
      const myCorners = new Set();
      const myEdges = new Set();
      
      for (const [cornerId, corner] of Object.entries(GameState.corners)) {
        if (corner.owner === GameState.myColor) {
          myCorners.add(parseInt(cornerId));
        }
      }
      
      for (const [edgeId, edge] of Object.entries(GameState.edges)) {
        if (edge.owner === GameState.myColor) {
          myEdges.add(parseInt(edgeId));
          // Also add corners connected to my roads
          const [c1, c2] = GameState.edgeToCorners[edgeId] || [];
          if (c1 !== undefined) myCorners.add(c1);
          if (c2 !== undefined) myCorners.add(c2);
        }
      }
      
      // Find edges connected to my corners that are not built
      for (const cornerId of myCorners) {
        const adjacentEdges = GameState.cornerToEdges[cornerId] || [];
        for (const edgeId of adjacentEdges) {
          const edge = GameState.edges[edgeId];
          if (edge && edge.owner === null && !available.includes(edgeId)) {
            available.push(parseInt(edgeId));
          }
        }
      }
      
      return available;
    },
    
    /**
     * Check if we can afford something
     */
    canAfford(item) {
      const r = GameState.myResources;
      const cost = BUILD_COSTS[item];
      if (!cost) return false;
      
      for (const [resource, amount] of Object.entries(cost)) {
        if ((r[resource] || 0) < amount) return false;
      }
      return true;
    },
    
    /**
     * Suggest what to build based on current resources and game state
     */
    suggestBuildPriority() {
      const r = GameState.myResources;
      const totalCards = r.wood + r.brick + r.sheep + r.wheat + r.ore;
      
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      console.log(`${LOG_PREFIX} 💰 BUILD PRIORITY ANALYSIS`);
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      console.log(`${LOG_PREFIX} 🎴 Resources: 🪵${r.wood} 🧱${r.brick} 🐑${r.sheep} 🌾${r.wheat} �ite${r.ore} (Total: ${totalCards})`);
      console.log(`${LOG_PREFIX} `);
      
      const suggestions = [];
      
      // Count my buildings
      let mySettlements = 0;
      let myCities = 0;
      for (const corner of Object.values(GameState.corners)) {
        if (corner.owner === GameState.myColor) {
          if (corner.buildingType === 1) mySettlements++;
          if (corner.buildingType === 2) myCities++;
        }
      }
      
      // === CITY ===
      // Priority: Very high if we have settlements to upgrade
      if (this.canAfford('city')) {
        const canUpgrade = GameState.availableCities.length > 0 || mySettlements > 0;
        if (canUpgrade) {
          suggestions.push({
            action: '🏰 Build City',
            priority: 10,
            reason: '+1 VP and DOUBLES production on that spot',
            available: GameState.availableCities.length || mySettlements
          });
        }
      }
      
      // === SETTLEMENT ===
      // Priority: High if we have good spots
      if (this.canAfford('settlement')) {
        const spots = GameState.availableSettlements.length;
        if (spots > 0 || this.calculateAvailableSettlements().length > 0) {
          const bestSpot = this.getBestSettlementSpot();
          suggestions.push({
            action: '🏠 Build Settlement',
            priority: 8,
            reason: '+1 VP and new resource access',
            available: spots,
            where: bestSpot ? `Corner ${bestSpot.cornerId}` : null
          });
        }
      }
      
      // === DEV CARD ===
      // Priority: Medium-high, especially if we need knights or going for largest army
      if (this.canAfford('devCard')) {
        const knights = GameState.myDevCards.filter(c => c === 'knight').length;
        let priority = 6;
        let reason = 'Could be VP card or useful knight';
        
        if (totalCards >= 7) {
          priority = 9; // Spend before getting robbed!
          reason = '⚠️ Spend cards before 7 is rolled!';
        } else if (knights >= 2) {
          priority = 7;
          reason = 'Push for Largest Army (2 VP)';
        }
        
        suggestions.push({
          action: '🃏 Buy Dev Card',
          priority,
          reason
        });
      }
      
      // === ROAD ===
      // Priority: Lower unless pushing for longest road or need expansion
      if (this.canAfford('road')) {
        const spots = GameState.availableRoads.length;
        if (spots > 0 || this.calculateAvailableRoads().length > 0) {
          let priority = 4;
          let reason = 'Expand toward new settlement spots';
          
          // Check if we're close to longest road
          // (simplified - would need actual longest road tracking)
          if (GameState.availableSettlements.length === 0) {
            priority = 7;
            reason = 'No settlement spots - expand with roads first!';
          }
          
          suggestions.push({
            action: '🛤️ Build Road',
            priority,
            reason
          });
        }
      }
      
      // Sort by priority
      suggestions.sort((a, b) => b.priority - a.priority);
      
      if (suggestions.length === 0) {
        console.log(`${LOG_PREFIX}   ❌ Cannot afford anything right now`);
        this.suggestResourceGoal(r);
      } else {
        console.log(`${LOG_PREFIX}   📋 BUILD OPTIONS (by priority):`);
        console.log(`${LOG_PREFIX} `);
        for (let i = 0; i < suggestions.length; i++) {
          const s = suggestions[i];
          const star = i === 0 ? '⭐' : '  ';
          console.log(`${LOG_PREFIX}   ${star} ${s.action} (Priority: ${s.priority})`);
          console.log(`${LOG_PREFIX}      ${s.reason}`);
          if (s.where) console.log(`${LOG_PREFIX}      📍 Best spot: ${s.where}`);
          console.log(`${LOG_PREFIX} `);
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
     * Get comprehensive strategic recommendation
     * Returns the single best action to take right now
     */
    getStrategicRecommendation() {
      const r = GameState.myResources;
      const totalCards = r.wood + r.brick + r.sheep + r.wheat + r.ore;
      const options = [];
      
      // Count my buildings
      let mySettlements = 0;
      let myCities = 0;
      let myRoads = 0;
      
      for (const corner of Object.values(GameState.corners)) {
        if (corner.owner === GameState.myColor) {
          if (corner.buildingType === 1) mySettlements++;
          if (corner.buildingType === 2) myCities++;
        }
      }
      for (const edge of Object.values(GameState.edges)) {
        if (edge.owner === GameState.myColor) myRoads++;
      }
      
      // Calculate my VP
      const myVP = mySettlements + (myCities * 2) + 
        (GameState.largestArmyOwner === GameState.myColor ? 2 : 0);
      
      // Game phase detection
      const isEarlyGame = GameState.completedTurns < 10;
      const isMidGame = GameState.completedTurns >= 10 && myVP < 7;
      const isLateGame = myVP >= 7;
      
      // Dev card analysis
      const myKnights = GameState.myDevCards.filter(c => c === 'knight').length;
      const knightsPlayed = GameState.playerDevCards[GameState.myColor]?.knightsPlayed || 0;
      const totalKnights = myKnights + knightsPlayed;
      const needLargestArmy = !GameState.largestArmyOwner || 
        GameState.largestArmyOwner !== GameState.myColor;
      
      // === EVALUATE OPTIONS ===
      
      // 1. CITY - Always high value
      if (this.canAfford('city') && (GameState.availableCities.length > 0 || mySettlements > 0)) {
        options.push({
          action: '🏰 Build City',
          priority: 95,
          reason: 'Doubles production, +1 VP. Best value!',
          category: 'build'
        });
      }
      
      // 2. SETTLEMENT - Good for expansion
      if (this.canAfford('settlement')) {
        const hasSpots = GameState.availableSettlements.length > 0 || 
          this.calculateAvailableSettlements().length > 0;
        if (hasSpots) {
          const bestSpot = this.getBestSettlementSpot();
          let priority = isEarlyGame ? 85 : 75;
          
          options.push({
            action: '🏠 Build Settlement',
            priority,
            reason: `+1 VP, access new resources${bestSpot ? ` (Corner ${bestSpot.cornerId})` : ''}`,
            category: 'build',
            where: bestSpot?.cornerId
          });
        }
      }
      
      // 3. DEV CARD - Context dependent
      if (this.canAfford('devCard')) {
        let priority = 50;
        let reason = 'Could be VP card or useful knight';
        
        // Higher priority if close to largest army
        if (needLargestArmy && totalKnights >= 1) {
          priority = 70;
          reason = `${totalKnights} knights - push for Largest Army (2 VP)!`;
        }
        
        // Higher priority in late game (VP cards)
        if (isLateGame) {
          priority = Math.max(priority, 65);
          reason = 'Late game - VP cards could win!';
        }
        
        // URGENT: Too many cards, spend before 7!
        if (totalCards >= 7) {
          priority = 98;
          reason = '⚠️ 7+ cards! Buy before rolling 7!';
        }
        
        options.push({
          action: '🃏 Buy Dev Card',
          priority,
          reason,
          category: 'build'
        });
      }
      
      // 4. ROAD - Lower priority unless needed
      if (this.canAfford('road')) {
        const hasSpots = GameState.availableRoads.length > 0 || 
          this.calculateAvailableRoads().length > 0;
        if (hasSpots) {
          let priority = 30;
          let reason = 'Expand road network';
          
          // Higher if no settlement spots
          if (GameState.availableSettlements.length === 0) {
            priority = 65;
            reason = 'Need roads to reach new settlement spots!';
          }
          
          // Check longest road potential
          // TODO: calculate actual longest road
          
          options.push({
            action: '🛤️ Build Road',
            priority,
            reason,
            category: 'build'
          });
        }
      }
      
      // 5. WAIT / SAVE - If nothing urgent
      if (options.length === 0 || (options.length > 0 && options[0].priority < 50)) {
        const closest = this.getClosestBuild(r);
        options.push({
          action: '⏳ Wait / Collect',
          priority: 20,
          reason: closest ? `Save for ${closest.item} (need ${closest.missing.join(', ')})` : 'Collect more resources',
          category: 'wait'
        });
      }
      
      // Sort by priority
      options.sort((a, b) => b.priority - a.priority);
      
      return {
        recommendation: options[0],
        alternatives: options.slice(1, 4),
        context: {
          myVP,
          totalCards,
          phase: isEarlyGame ? 'early' : (isMidGame ? 'mid' : 'late'),
          settlements: mySettlements,
          cities: myCities,
          knightsTotal: totalKnights,
          largestArmyOwner: GameState.largestArmyOwner
        }
      };
    },
    
    /**
     * Get what we're closest to building
     */
    getClosestBuild(r) {
      const builds = [
        { item: 'Road', cost: BUILD_COSTS.road },
        { item: 'Settlement', cost: BUILD_COSTS.settlement },
        { item: 'Dev Card', cost: BUILD_COSTS.devCard },
        { item: 'City', cost: BUILD_COSTS.city }
      ];
      
      let closest = null;
      let minMissing = 999;
      
      for (const build of builds) {
        const missing = [];
        let missingCount = 0;
        
        for (const [resource, needed] of Object.entries(build.cost)) {
          const have = r[resource] || 0;
          if (have < needed) {
            missing.push(resource);
            missingCount += (needed - have);
          }
        }
        
        if (missingCount > 0 && missingCount < minMissing) {
          minMissing = missingCount;
          closest = { item: build.item, missing };
        }
      }
      
      return closest;
    },
    
    /**
     * Suggest what resources to aim for
     */
    suggestResourceGoal(r) {
      console.log(`${LOG_PREFIX} `);
      console.log(`${LOG_PREFIX}   🎯 SAVE FOR:`);
      
      // What's closest to build?
      const missing = {
        city: { ore: Math.max(0, 3 - r.ore), wheat: Math.max(0, 2 - r.wheat) },
        settlement: { 
          wood: Math.max(0, 1 - r.wood), 
          brick: Math.max(0, 1 - r.brick),
          sheep: Math.max(0, 1 - r.sheep),
          wheat: Math.max(0, 1 - r.wheat)
        },
        devCard: {
          sheep: Math.max(0, 1 - r.sheep),
          wheat: Math.max(0, 1 - r.wheat),
          ore: Math.max(0, 1 - r.ore)
        },
        road: { wood: Math.max(0, 1 - r.wood), brick: Math.max(0, 1 - r.brick) }
      };
      
      // Count cards needed
      const cityNeed = missing.city.ore + missing.city.wheat;
      const settlementNeed = missing.settlement.wood + missing.settlement.brick + 
                             missing.settlement.sheep + missing.settlement.wheat;
      const devNeed = missing.devCard.sheep + missing.devCard.wheat + missing.devCard.ore;
      const roadNeed = missing.road.wood + missing.road.brick;
      
      if (roadNeed <= 2 && roadNeed > 0) {
        const needs = Object.entries(missing.road).filter(([,v]) => v > 0).map(([k]) => k);
        console.log(`${LOG_PREFIX}      🛤️ Road: need ${needs.join(', ')}`);
      }
      if (settlementNeed <= 3 && settlementNeed > 0) {
        const needs = Object.entries(missing.settlement).filter(([,v]) => v > 0).map(([k]) => k);
        console.log(`${LOG_PREFIX}      🏠 Settlement: need ${needs.join(', ')}`);
      }
      if (devNeed <= 2 && devNeed > 0) {
        const needs = Object.entries(missing.devCard).filter(([,v]) => v > 0).map(([k]) => k);
        console.log(`${LOG_PREFIX}      🃏 Dev Card: need ${needs.join(', ')}`);
      }
      if (cityNeed <= 3 && cityNeed > 0) {
        const needs = Object.entries(missing.city).filter(([,v]) => v > 0).map(([k]) => k);
        console.log(`${LOG_PREFIX}      🏰 City: need ${needs.join(', ')}`);
      }
    },
    
    /**
     * Get best available settlement spot
     */
    getBestSettlementSpot() {
      const spots = GameState.availableSettlements.length > 0 
        ? GameState.availableSettlements 
        : this.calculateAvailableSettlements();
      
      let best = null;
      let bestScore = -1;
      
      for (const cornerId of spots) {
        const result = this.scoreCorner(cornerId, false);
        if (result && result.score > bestScore) {
          bestScore = result.score;
          best = result;
        }
      }
      
      return best;
    },
    
    /**
     * Calculate available settlement spots (fallback)
     */
    calculateAvailableSettlements() {
      const available = [];
      
      // Need roads leading to empty corners with distance rule
      const myCorners = new Set();
      
      // Corners I can reach via my roads
      for (const [edgeId, edge] of Object.entries(GameState.edges)) {
        if (edge.owner === GameState.myColor) {
          const [c1, c2] = GameState.edgeToCorners[edgeId] || [];
          if (c1 !== undefined) myCorners.add(c1);
          if (c2 !== undefined) myCorners.add(c2);
        }
      }
      
      for (const cornerId of myCorners) {
        const corner = GameState.corners[cornerId];
        if (!corner || corner.owner !== null) continue;
        
        // Check distance rule
        let valid = true;
        const neighbors = GameState.cornerToCorners[cornerId] || [];
        for (const nId of neighbors) {
          if (GameState.corners[nId]?.owner !== null) {
            valid = false;
            break;
          }
        }
        
        if (valid) {
          available.push(parseInt(cornerId));
        }
      }
      
      return available;
    },
    
    /**
     * Suggest where to place robber
     */
    suggestRobberPlacement() {
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      console.log(`${LOG_PREFIX} 🦹 ROBBER PLACEMENT ANALYSIS`);
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      
      const spots = GameState.availableRobberSpots.length > 0 
        ? GameState.availableRobberSpots 
        : Object.keys(GameState.tiles).map(Number);
      
      const scored = [];
      
      for (const tileId of spots) {
        const tile = GameState.tiles[tileId];
        if (!tile || tile.type === 0) continue; // Skip desert
        if (tileId === GameState.robberTile) continue; // Can't place where it already is
        
        let score = 0;
        let affectsMe = false;
        let affectsOpponent = false;
        let opponentResources = [];
        
        // Check who has buildings on this tile
        const corners = GameState.tileToCorners[tileId] || [];
        for (const cornerId of corners) {
          const corner = GameState.corners[cornerId];
          if (!corner || corner.owner === null) continue;
          
          if (corner.owner === GameState.myColor) {
            affectsMe = true;
            score -= 50; // Don't block ourselves!
          } else {
            affectsOpponent = true;
            // Bonus for blocking opponent's good tiles
            score += tile.probability * 10;
            
            // Extra bonus for cities
            if (corner.buildingType === 2) {
              score += 15;
            }
          }
        }
        
        // Skip tiles that only affect us
        if (affectsMe && !affectsOpponent) continue;
        
        // Bonus for high probability tiles
        if (tile.diceNumber === 6 || tile.diceNumber === 8) score += 10;
        if (tile.diceNumber === 5 || tile.diceNumber === 9) score += 5;
        
        scored.push({
          tileId,
          score,
          resource: tile.resource,
          number: tile.diceNumber,
          probability: tile.probability,
          affectsOpponent
        });
      }
      
      scored.sort((a, b) => b.score - a.score);
      
      if (scored.length === 0) {
        console.log(`${LOG_PREFIX} ❌ No good robber spots`);
        return [];
      }
      
      console.log(`${LOG_PREFIX} `);
      console.log(`${LOG_PREFIX} 🏆 TOP ROBBER SPOTS:`);
      console.log(`${LOG_PREFIX} `);
      
      for (let i = 0; i < Math.min(3, scored.length); i++) {
        const s = scored[i];
        console.log(`${LOG_PREFIX}   ${i === 0 ? '⭐' : (i + 1) + '.'} Tile ${s.tileId} — ${s.resource}(${s.number})`);
        console.log(`${LOG_PREFIX}      Blocks ${s.probability} pips of opponent production`);
        console.log(`${LOG_PREFIX} `);
      }
      
      console.log(`${LOG_PREFIX} 💡 Recommendation: Place robber on Tile ${scored[0].tileId}`);
      console.log(`${LOG_PREFIX} ═══════════════════════════════════════════════════`);
      
      return scored.slice(0, 3);
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
    
    // Initialize UI overlay
    AdvisorUI.init();
    
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
    
    // Expose API to page context via postMessage
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data?.source !== 'colonist-advisor-page-request') return;
      
      const { action, args } = event.data;
      let result = null;
      
      try {
        switch (action) {
          case 'analyze':
            result = Advisor.analyze();
            break;
          case 'suggestPlacement':
            result = Advisor.suggestInitialPlacement();
            break;
          case 'suggestRoad':
            result = Advisor.suggestRoadPlacement();
            break;
          case 'suggestBuild':
            result = Advisor.suggestBuildPriority();
            break;
          case 'getState':
            result = GameState;
            break;
          case 'getMessages':
            result = GameState.messageLog;
            break;
          case 'saveMessages':
            // Deduplicate messages before saving
            const deduplicatedMessages = deduplicateMessages(GameState.messageLog);
            const data = {
              exportedAt: new Date().toISOString(),
              gameInfo: {
                myColor: GameState.myColor,
                players: GameState.players,
                isSetupPhase: GameState.isSetupPhase,
                completedTurns: GameState.completedTurns
              },
              messageCount: deduplicatedMessages.length,
              originalCount: GameState.messageLog.length,
              messages: deduplicatedMessages
            };
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `colonist-messages-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log(`${LOG_PREFIX} 💾 Saved ${deduplicatedMessages.length} unique messages (from ${GameState.messageLog.length} total)`);
            result = { saved: deduplicatedMessages.length, originalCount: GameState.messageLog.length };
            break;
          case 'checkCorner':
            const id = args?.[0];
            const corner = GameState.corners[id];
            const neighbors = GameState.cornerToCorners[id] || [];
            const tiles = GameState.cornerToTiles[id] || [];
            result = { corner, neighbors, tiles };
            console.log(`Corner ${id}:`, corner);
            console.log(`  Neighbors:`, neighbors);
            console.log(`  Tiles:`, tiles.map(t => GameState.tiles[t]));
            break;
        }
      } catch (e) {
        console.error(`${LOG_PREFIX} API error:`, e);
      }
      
      window.postMessage({
        source: 'colonist-advisor-page-response',
        action,
        result
      }, '*');
    });

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
      debug: { MessageParser, BoardBuilder, Advisor },
      
      // Save all messages to a JSON file (deduplicated)
      saveMessages: () => {
        // Deduplicate messages before saving
        const deduplicatedMessages = deduplicateMessages(GameState.messageLog);
        const data = {
          exportedAt: new Date().toISOString(),
          gameInfo: {
            myColor: GameState.myColor,
            players: GameState.players,
            isSetupPhase: GameState.isSetupPhase,
            completedTurns: GameState.completedTurns
          },
          messageCount: deduplicatedMessages.length,
          originalCount: GameState.messageLog.length,
          messages: deduplicatedMessages
        };
        
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `colonist-messages-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log(`${LOG_PREFIX} 💾 Saved ${deduplicatedMessages.length} unique messages (from ${GameState.messageLog.length} total) to file`);
        return data;
      },
      
      // Debug: check corner adjacency
      checkCorner: (id) => {
        const corner = GameState.corners[id];
        const neighbors = GameState.cornerToCorners[id] || [];
        const tiles = GameState.cornerToTiles[id] || [];
        console.log(`Corner ${id}:`, corner);
        console.log(`  Neighbors:`, neighbors);
        console.log(`  Neighbor owners:`, neighbors.map(n => ({id: n, owner: GameState.corners[n]?.owner})));
        console.log(`  Tiles:`, tiles.map(t => GameState.tiles[t]));
        return { corner, neighbors, tiles };
      }
    };

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
