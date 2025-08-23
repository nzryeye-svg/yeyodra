# Yeyodra - Steam Game Manager

MVP (Minimum Viable Product) rebuild dari Oracle project dengan fokus pada fungsionalitas utama.

## Fitur MVP

- ✅ Search games berdasarkan nama atau AppID
- ✅ Download game files dari GitHub repositories
- ✅ Basic UI dengan tab navigation
- ⏳ Library management (planned)
- ⏳ Settings panel (planned)

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Rust + Tauri
- **APIs**: Steam API, GitHub API

## Development

### Prerequisites

- [Rust](https://rustup.rs/)
- [Node.js](https://nodejs.org/) (v16+)

### Setup

1. Install dependencies:
```bash
npm install
```

2. Run development server:
```bash
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

## MVP Features

### 1. Game Search
- Search Steam games by name or AppID
- Pagination support
- Steam API integration

### 2. Download System
- Download from GitHub repositories:
  - Fairyvmos/bruh-hub
  - SteamAutoCracks/ManifestHub
- Automatic file processing
- Steam directory integration

### 3. Basic UI
- Simple tab navigation
- Dark theme
- Responsive layout
- Error handling

## File Structure

```
yeyodra/
├── src/                    # React frontend
│   ├── App.jsx            # Main app component
│   ├── main.jsx           # Entry point
│   └── index.css          # Basic styles
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── main.rs        # Tauri entry point
│   │   ├── commands.rs    # Tauri commands
│   │   ├── models.rs      # Data structures
│   │   └── game_database.rs # Game database logic
│   └── Cargo.toml         # Rust dependencies
└── package.json           # Node dependencies
```

## Git Setup

Project sudah dilengkapi dengan:
- **`.gitignore`** - Comprehensive ignore patterns untuk menghindari commit file yang tidak perlu
- **`.gitattributes`** - Proper handling untuk berbagai file types

### Important Notes:
- File downloads (`downloads/`, `*.zip`) akan di-ignore
- User data (`accounts.json`, `notes.json`) akan di-ignore  
- Build artifacts (`target/`, `dist/`) akan di-ignore
- IDE files dan cache akan di-ignore

## Next Steps

- [ ] Implement library management
- [ ] Add settings panel
- [ ] Improve error handling
- [ ] Add more repositories
- [ ] Implement account management
- [ ] Add DLC management
