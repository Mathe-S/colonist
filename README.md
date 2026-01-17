# Colonist.io Advisor

A Chrome extension that intercepts WebSocket messages from colonist.io, decodes them, and provides strategic suggestions for 1v1 games.

## Features

- **WebSocket Interception**: Captures all game traffic between client and server
- **MessagePack Decoding**: Decodes binary MessagePack formatted messages
- **Game State Tracking**: Tracks board state, player positions, resources, and more
- **Decision Suggestions**: 
  - Initial settlement placement advice
  - Build priority recommendations

## Installation

### Developer Mode (Recommended for Development)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `colonist` folder (this directory)
5. The extension should now appear in your extensions list

### Generate Icons (Optional)

The extension needs icon files. You can create simple placeholder icons:

```bash
# Using ImageMagick (if installed)
convert -size 16x16 xc:#e74c3c icons/icon16.png
convert -size 48x48 xc:#e74c3c icons/icon48.png
convert -size 128x128 xc:#e74c3c icons/icon128.png
```

Or simply remove the `icons` section from `manifest.json` to use default Chrome icons.

## Usage

1. Install the extension
2. Navigate to [colonist.io](https://colonist.io)
3. Open Chrome DevTools (F12 or Cmd+Option+I)
4. Go to the **Console** tab
5. Start or join a game
6. Watch the console for decoded messages and game state updates

### Console Commands

The extension exposes a `colonistAdvisor` object in the console:

```javascript
// Full game analysis (players, state, suggestions)
colonistAdvisor.analyze()

// Best settlement spots (scored by probability, diversity, ports)
colonistAdvisor.suggestPlacement()

// What to build based on current resources
colonistAdvisor.suggestBuild()

// Score a specific corner position
colonistAdvisor.scoreCorner(33)

// View current game state
colonistAdvisor.state

// View all captured messages
colonistAdvisor.getMessages()

// Reset game state
colonistAdvisor.reset()
```

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    colonist.io page                      │
│                                                          │
│  ┌──────────────┐    postMessage    ┌────────────────┐  │
│  │ injected.js  │ ───────────────▶ │  content.js    │  │
│  │              │                   │                │  │
│  │ WebSocket    │                   │ - Decoder      │  │
│  │ Interceptor  │                   │ - State Track  │  │
│  │              │                   │ - Advisor      │  │
│  └──────────────┘                   └────────────────┘  │
│         │                                   │           │
│         ▼                                   ▼           │
│   Game Server                         Console Output    │
└─────────────────────────────────────────────────────────┘
```

1. **injected.js**: Runs in page context, monkey-patches `WebSocket` to intercept all messages
2. **content.js**: Runs in content script context, receives messages via `postMessage`:
   - Decodes MessagePack binary data
   - Tracks game state
   - Provides decision suggestions

### Message Format

Colonist.io uses MessagePack for WebSocket communication. Messages typically have this structure:

```javascript
{
  id: 130,           // Message type ID
  data: {
    type: "payload",
    payload: {
      diff: {        // Incremental state updates
        mapState: { ... },
        playerStates: { ... },
        tileCornerStates: { ... }
      }
    },
    sequence: 42     // Message sequence number
  }
}
```

## Development

### Debugging Tips

1. Set `DEBUG = true` in `content.js` for verbose logging
2. Use `colonistAdvisor.getMessages()` to review raw decoded messages
3. Look for patterns in message IDs to identify message types

### Known Message IDs (WIP)

As you observe traffic, document discovered message types:

| ID | Type | Description |
|----|------|-------------|
| 130 | Game State | Full/partial game state updates |
| 136 | Timestamp | Server timestamp sync |
| ... | ... | ... |

### Contributing

This is a learning project. Key areas for improvement:

1. **Board Topology**: Build proper hex grid adjacency maps
2. **Resource Inference**: Track opponent resources from trades and dice rolls
3. **Placement Algorithm**: Implement optimal initial placement scoring
4. **Build Strategy**: More sophisticated build priority based on game phase

## Disclaimer

This extension is for educational purposes only. Use responsibly and respect colonist.io's terms of service.

## License

MIT
