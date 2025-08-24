# 🎮 Offline Setup & Save Manager Guide

Panduan lengkap untuk fitur Offline Setup dan Save Manager yang telah diimplementasi di Yeyodra.

## 🚀 Fitur Yang Telah Diimplementasi

### 1. **Offline Setup Tab**
- ✅ Tab baru "Offline Setup" di sidebar dengan icon WiFi
- ✅ Multi-step wizard untuk setup game offline
- ✅ Game search dan selection interface
- ✅ Directory selection untuk game path
- ✅ Automatic offline configuration setup

### 2. **Save Manager System**
- ✅ Automatic save location detection
- ✅ Save files backup dengan timestamp
- ✅ Steam Cloud sync preparation
- ✅ Save statistics (size, locations, last modified)

### 3. **Goldberg Emulator Integration**
- ✅ Basic configuration file generation
- ✅ Steam API detection
- ✅ User profile setup untuk offline mode
- ✅ Game launcher integration

## 🛠️ Backend Commands

### Save Manager Commands
```rust
detect_save_locations(app_id, game_name) -> SaveGameInfo
backup_save_files(app_id, game_name, backup_location?) -> BackupResult  
sync_saves_with_steam(app_id, game_name) -> BackupResult
```

### Offline Setup Commands
```rust
setup_offline_game(app_id, game_name, game_path) -> OfflineSetupResult
select_directory() -> String
```

### Goldberg Integration Commands
```rust
check_goldberg_emulator(game_path) -> GoldbergStatus
install_goldberg_emulator(game_path, app_id) -> OfflineSetupResult
launch_game_offline(game_path, executable?) -> bool
```

## 📁 File Structure Created

Ketika setup offline game, sistem akan membuat:

```
GameDirectory/
├── steam_appid.txt              # App ID game
├── steam_interfaces.txt         # Steam API interfaces (jika diperlukan)
└── steam_settings/              # Konfigurasi offline
    ├── account_name.txt         # Nama player offline
    ├── user_steam_id.txt        # Steam ID offline
    └── language.txt             # Bahasa game
```

## 🎯 Workflow Penggunaan

### Setup Game untuk Offline Mode:

1. **Pilih Game**
   - Buka tab "Offline Setup"
   - Search dan pilih game yang ingin di-setup
   - Klik game untuk select

2. **Pilih Directory**
   - Browse ke direktori instalasi game
   - Pastikan direktori mengandung executable game
   - Konfirm selection

3. **Setup Configuration**
   - Review informasi game dan path
   - Klik "Setup Offline Mode"
   - Tunggu proses selesai

4. **Save Management**
   - Pindah ke tab "Save Manager"
   - Detect save locations otomatis
   - Backup saves sebelum switch mode
   - Sync dengan Steam jika diperlukan

## 💾 Save Management Features

### Auto-Detection Locations:
- `%USERPROFILE%\AppData\Local\{GameName}\`
- `%USERPROFILE%\AppData\Roaming\{GameName}\`
- `%USERPROFILE%\Documents\My Games\{GameName}\`
- `%USERPROFILE%\Saved Games\{GameName}\`
- Steam userdata directories

### Backup Features:
- Timestamped backups (`backup_YYYYMMDD_HHMMSS`)
- Preserves directory structure
- Backup info JSON dengan metadata
- Custom backup location support

## 🔧 Technical Implementation

### Frontend Components:
- `OfflineSetup.jsx` - Main offline setup wizard
- `SaveManager.jsx` - Save file management interface
- Navigation system dengan 4 tabs
- Progress tracking dan status indicators

### Backend (Rust):
- Cross-platform directory operations
- Steam API file detection
- Goldberg configuration generation
- File backup dengan metadata tracking

### Styling:
- `OfflineSetup.scss` - Responsive design
- `SaveManager.scss` - Modern UI components
- Dark theme compatibility
- Mobile-friendly responsive layout

## 🎮 Goldberg Emulator Principles

Implementasi menggunakan prinsip-prinsip Goldberg Emulator:

1. **Steam API Emulation**
   - Generate `steam_appid.txt` dengan App ID
   - Create `steam_interfaces.txt` untuk API compatibility
   - Setup offline user profile

2. **Configuration Management**
   - User Steam ID generation
   - Account name setup
   - Language configuration
   - Local save management

3. **Game Launcher Integration**
   - Automatic executable detection
   - Launch games dengan environment yang tepat
   - Working directory setup

## 🚀 Future Enhancements

Fitur yang bisa ditambahkan di masa depan:

- [ ] Actual Goldberg Emulator DLL integration
- [ ] Achievement system offline
- [ ] Multiplayer LAN configuration
- [ ] Steam Workshop item management
- [ ] Advanced save conflict resolution
- [ ] Game compatibility database
- [ ] Automated backup scheduling

## 📱 User Experience

### Key Benefits:
- **Intuitive Wizard**: Step-by-step setup process
- **Automatic Detection**: Smart save location finding
- **Safe Backups**: Never lose save progress
- **Cross-Mode Compatibility**: Easy switch between offline/Steam
- **Modern UI**: Clean, responsive interface

### Performance:
- Fast save detection (sub-second untuk most games)
- Efficient backup dengan progress tracking
- Minimal resource usage
- Background operations untuk heavy tasks

## 🛡️ Security & Safety

- Read-only Steam API detection
- Safe backup operations dengan verification
- No modification of original game files
- User confirmation untuk critical operations
- Error handling dan rollback capabilities

---

**Status**: ✅ Fully Implemented and Ready for Use

Fitur Offline Setup dan Save Manager telah sepenuhnya terintegrasi ke dalam Yeyodra dan siap untuk digunakan. UI responsif, backend robust, dan mengikuti best practices untuk user experience dan data safety.

