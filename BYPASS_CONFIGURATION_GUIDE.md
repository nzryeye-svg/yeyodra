# 🛡️ Bypass Configuration Guide

Panduan lengkap untuk menambahkan game bypass baru ke dalam sistem Yeyodra.

## 📋 Table of Contents
- [Overview](#overview)
- [Adding New Game](#adding-new-game)
- [Configuration Files](#configuration-files)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

Sistem bypass Yeyodra bekerja dengan cara:
1. **Download** file bypass ZIP dari URL
2. **Extract** file ke folder temporary
3. **Auto-detect** direktori game Steam
4. **Copy** semua file bypass ke folder game
5. **Auto-detect** executable files
6. **Launch** game dengan pop-up modal

## 🎮 Adding New Game

### Step 1: Prepare Bypass Files
Pastikan Anda memiliki:
- ✅ **ZIP file bypass** yang sudah terupload (Discord CDN, Google Drive, dll)
- ✅ **Direct download URL** yang bisa diakses publik
- ✅ **Steam AppID** game yang valid
- ✅ **Game directory name** di Steam folder

### Step 2: Update Frontend Configuration

**File:** `src/components/Bypass.jsx`

Cari bagian `gameBypassData` array dan tambahkan game baru:

```javascript
// Game AppIDs with their bypass URLs
const gameBypassData = [
  {
    appId: '582160',
    bypassUrl: 'https://cdn.discordapp.com/attachments/1390024381463531540/1404222172892758016/Assassins_Creed_-_Origins_FIX.zip?ex=68ac338f&is=68aae20f&hm=773b95fd1f1ae0fc434b239f2fe23574d7b8481ed43798e7220e307a843ca754&'
  },
  // 👇 ADD NEW GAME HERE
  {
    appId: 'YOUR_GAME_APPID',
    bypassUrl: 'YOUR_BYPASS_ZIP_URL'
  }
  // Add more games...
];
```

### Step 3: Update Backend Game Directory Mapping

**File:** `src-tauri/src/commands.rs`

Cari function `find_game_directory` dan tambahkan mapping baru:

```rust
// Game directory mappings (AppID -> folder name)
let game_directories = HashMap::from([
    ("582160".to_string(), "Assassins Creed Origins".to_string()),
    ("292030".to_string(), "The Witcher 3".to_string()),
    ("1174180".to_string(), "Red Dead Redemption 2".to_string()),
    // 👇 ADD NEW GAME MAPPING HERE
    ("YOUR_GAME_APPID".to_string(), "Your Game Folder Name".to_string()),
    // Add more mappings as needed
]);
```

## 📝 Configuration Reference

### Game Data Structure

```javascript
{
  appId: 'STEAM_APP_ID',        // Steam AppID (string)
  bypassUrl: 'DIRECT_ZIP_URL'   // Direct download URL ke ZIP file
}
```

### Directory Mapping Structure

```rust
("STEAM_APP_ID".to_string(), "Steam Game Folder Name".to_string())
```

## 🔍 Finding Required Information

### 1. Steam AppID
- Buka Steam store page game
- Lihat URL: `https://store.steampowered.com/app/582160/Assassins_Creed_Origins/`
- AppID = `582160`

### 2. Game Folder Name
- Buka: `C:\Program Files (x86)\Steam\steamapps\common\`
- Lihat nama folder game (case-sensitive!)
- Contoh: `Assassins Creed Origins`

### 3. Bypass ZIP URL
- Upload file bypass ke file hosting
- Pastikan link direct download (bukan preview)
- Test download manual untuk memastikan

## 📁 Supported File Hosting

### ✅ Recommended:
- **Discord CDN** - Fast, reliable
- **GitHub Releases** - Version controlled
- **Google Drive** (direct link) - Large storage

### ⚠️ Need Direct Link:
- **MediaFire** - Use direct download link
- **MEGA** - Export as public link
- **Dropbox** - Use direct download parameter

### ❌ Not Recommended:
- **Temporary file hosts** (short expiry)
- **Rate-limited hosts**
- **Authentication required hosts**

## 🧪 Testing New Game

### 1. Manual Testing
```bash
# Test AppID validity
curl "https://store.steampowered.com/api/appdetails?appids=YOUR_APPID"

# Test download URL
curl -L "YOUR_BYPASS_URL" -o test.zip
```

### 2. In-App Testing
1. Tambahkan game ke configuration
2. Build dan run aplikasi
3. Cek apakah game card muncul
4. Test process bypass end-to-end
5. Verify file detection dan launch

## 🔧 Troubleshooting

### Game Card Tidak Muncul
- ✅ Cek AppID valid di Steam API
- ✅ Cek format configuration JSON
- ✅ Restart aplikasi

### Download Gagal
- ✅ Test URL manual di browser
- ✅ Cek URL encoding
- ✅ Pastikan file size tidak terlalu besar

### Directory Tidak Ditemukan
- ✅ Cek nama folder case-sensitive
- ✅ Cek multiple Steam installation paths
- ✅ Verify game sudah diinstall

### Executable Tidak Terdeteksi
- ✅ Cek folder game ada file .exe
- ✅ Review filter rules di `detect_game_executables`
- ✅ Manual check file permissions

## 📋 Example: Adding The Witcher 3

### Frontend (`Bypass.jsx`):
```javascript
{
  appId: '292030',
  bypassUrl: 'https://example.com/witcher3-bypass.zip'
}
```

### Backend (`commands.rs`):
```rust
("292030".to_string(), "The Witcher 3".to_string())
```

## 🚀 Advanced Configuration

### Custom Steam Paths
Untuk menambah path Steam custom, edit di `find_game_directory`:

```rust
let steam_paths = vec![
    r"C:\Program Files (x86)\Steam\steamapps\common",
    r"C:\Program Files\Steam\steamapps\common",
    r"D:\Steam\steamapps\common",
    r"E:\Steam\steamapps\common",
    // 👇 ADD CUSTOM PATHS HERE
    r"F:\Games\Steam\steamapps\common",
];
```

### Executable Filter Rules
Untuk mengubah filter executable, edit di `detect_game_executables`:

```rust
// Filter out common non-game executables
if !filename_str.contains("uninstall") 
    && !filename_str.contains("setup") 
    && !filename_str.contains("installer")
    && !filename_str.contains("redist")
    && !filename_str.contains("vcredist")
    && !filename_str.contains("directx")
    && !filename_str.contains("_be.exe") // BattlEye
    && !filename_str.contains("eac") // EasyAntiCheat
    // 👇 ADD CUSTOM FILTERS HERE
    && !filename_str.contains("your_filter")
{
    executables.push(path.to_string_lossy().to_string());
}
```

## 📞 Need Help?

Jika mengalami kesulitan:
1. Check console logs untuk error details
2. Verify semua path dan URL
3. Test manual download dan extraction
4. Check Steam game installation status

---

**Last Updated:** January 2025  
**Version:** 1.0  
**Compatibility:** Yeyodra v0.1.0+
