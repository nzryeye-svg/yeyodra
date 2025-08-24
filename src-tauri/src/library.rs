use std::fs;
use std::path::{Path, PathBuf};
use serde::{Serialize, Deserialize};
use tauri::command;
use regex::Regex;
use std::collections::HashMap;
use walkdir::WalkDir;
use uuid::Uuid;
use std::time::Duration;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DirectoryStatus {
    lua: bool,
    manifest: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LibraryGameInfo {
    pub app_id: String,
    pub name: String,
    pub lua_file: bool,
    pub manifest_file: bool,
    pub capsule_image: Option<String>,
    pub header_image: Option<String>,
}

/// Steam API response structures for images
#[derive(Serialize, Deserialize, Debug)]
pub struct SteamGameDetailsData {
    pub name: String,
    pub header_image: Option<String>,
    pub capsule_image: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SteamGameDetailsEntry {
    pub success: bool,
    pub data: Option<SteamGameDetailsData>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct SteamGameDetailsResponse {
    #[serde(flatten)]
    pub apps: HashMap<String, SteamGameDetailsEntry>,
}

/// Checks if the required Steam directories exist
#[command]
pub async fn check_steam_directories(lua_path: String, manifest_path: String) -> Result<DirectoryStatus, String> {
    let lua_exists = Path::new(&lua_path).exists();
    let manifest_exists = Path::new(&manifest_path).exists();
    
    Ok(DirectoryStatus {
        lua: lua_exists,
        manifest: manifest_exists,
    })
}

/// Gets all games in the library by reading LUA and manifest files
#[command]
pub async fn get_library_games() -> Result<Vec<LibraryGameInfo>, String> {
    // Use find_steam_config_path like Oracle
    let steam_config_path = find_steam_config_path().map_err(|e| e.to_string())?;
    let lua_dir = steam_config_path.join("stplug-in");
    let manifest_dir = steam_config_path.join("depotcache");
    
    // Check if directories exist
    if !lua_dir.exists() {
        return Err(format!("Steam LUA directory not found: {}", lua_dir.display()));
    }
    
    if !manifest_dir.exists() {
        return Err(format!("Steam manifest directory not found: {}", manifest_dir.display()));
    }
    
    let mut games: Vec<LibraryGameInfo> = Vec::new();
    
    // Read LUA directory to find games
    match fs::read_dir(&lua_dir) {
        Ok(entries) => {
            for entry in entries {
                if let Ok(entry) = entry {
                    let file_name = entry.file_name();
                    let file_name_str = file_name.to_string_lossy();
                    
                    // Check if it's a LUA file
                    if file_name_str.ends_with(".lua") {
                        // Extract app_id from filename
                        let app_id = file_name_str
                            .trim_end_matches(".lua")
                            .to_string();
                        
                        // Check if manifest file exists
                        let manifest_file = manifest_dir.join(format!("{}.manifest", app_id));
                        let manifest_exists = manifest_file.exists();
                        
                        // Get game name using the existing function
                        let name = crate::GAME_DATABASE.get_by_app_id(&app_id)
                            .map(|game| game.game_name)
                            .unwrap_or_else(|| format!("AppID: {}", app_id));
                        
                                // Get images from cached game details (non-blocking, fast CDN fallback)
        let (capsule_image, header_image) = get_images_from_cached_details(&app_id).await;
                        
                        games.push(LibraryGameInfo {
                            app_id,
                            name,
                            lua_file: true,
                            manifest_file: manifest_exists,
                            capsule_image,
                            header_image,
                        });
                    }
                }
            }
        },
        Err(e) => {
            return Err(format!("Failed to read LUA directory: {}", e));
        }
    }
    
    // Sort games by name
    games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    
    // Start background refresh for games with expired cache (non-blocking)
    let expired_games: Vec<String> = games.iter()
        .filter(|game| !is_cache_valid_for_app(&game.app_id))
        .map(|game| game.app_id.clone())
        .collect();
    
    if !expired_games.is_empty() {
        println!("Starting background refresh for {} games with expired cache", expired_games.len());
        tokio::spawn(background_refresh_cache(expired_games));
    }
    
    Ok(games)
}

/// Helper to find Steam config path (copied from Oracle)
fn find_steam_config_path() -> Result<PathBuf, String> {
    // For Windows
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        // Check common paths first
        let common_paths = [
            "C:\\Program Files (x86)\\Steam\\config",
            "C:\\Program Files\\Steam\\config",
        ];
        for path in common_paths.iter() {
            let p = PathBuf::from(path);
            if p.exists() {
                return Ok(p);
            }
        }
        
        // Fallback to registry
        if let Ok(hkcu) = RegKey::predef(HKEY_CURRENT_USER).open_subkey("Software\\Valve\\Steam") {
            if let Ok(steam_path_str) = hkcu.get_value::<String, _>("SteamPath") {
                 let config_path = PathBuf::from(steam_path_str).join("config");
                 if config_path.exists() { return Ok(config_path); }
            }
        }
    }

    // For macOS and Linux (add paths as needed)
    #[cfg(not(target_os = "windows"))]
    {
        if let Some(home_dir) = dirs_next::home_dir() {
            let linux_paths = [
                ".steam/steam/config",
                ".local/share/Steam/config"
            ];
            let macos_path = "Library/Application Support/Steam/config";

            if cfg!(target_os = "linux") {
                for path in linux_paths.iter() {
                    let p = home_dir.join(path);
                    if p.exists() { return Ok(p); }
                }
            } else if cfg!(target_os = "macos") {
                let p = home_dir.join(macos_path);
                if p.exists() { return Ok(p); }
            }
        }
    }
    
    Err("Steam config directory not found. Please set it manually in the settings.".to_string())
}

/// Helper to find LUA file for a specific AppID (copied from Oracle)
fn find_lua_file_for_appid(steam_config_path: &Path, app_id_to_find: &str) -> Result<PathBuf, String> {
    let stplugin_dir = steam_config_path.join("stplug-in");
    if !stplugin_dir.exists() {
        return Err("'stplug-in' directory not found in Steam config.".to_string());
    }

    for entry in WalkDir::new(&stplugin_dir).max_depth(1).into_iter().filter_map(Result::ok) {
        if entry.file_type().is_file() {
            let path = entry.path();
            if let Some(ext) = path.extension() {
                if ext == "lua" {
                    // Check 1: Filename matches AppID (e.g., 12345.lua)
                    if let Some(stem) = path.file_stem() {
                        if stem.to_string_lossy() == app_id_to_find {
                            return Ok(path.to_path_buf());
                        }
                    }

                    // Check 2: File content contains addappid(AppID)
                    if let Ok(content) = fs::read_to_string(path) {
                        let re = Regex::new(&format!(r"addappid\s*\(\s*({})\s*\)", app_id_to_find)).unwrap();
                        if re.is_match(&content) {
                            return Ok(path.to_path_buf());
                        }
                    }
                }
            }
        }
    }

    Err(format!("Could not find a .lua file for AppID: {}", app_id_to_find))
}

/// Get game images with smart caching strategy
async fn get_images_from_cached_details(app_id: &str) -> (Option<String>, Option<String>) {
    // Always use CDN URLs for immediate display (fast fallback)
    let capsule_image = format!("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/capsule_231x87.jpg", app_id);
    let default_header_image = format!("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/header.jpg", app_id);
    
    // Try to load from cache for better quality images
    if let Ok(cached_data) = load_steam_app_info_from_cache(app_id) {
        println!("Loaded images for AppID {} from cached Steam data", app_id);
        
        // Use cached header_image if available and not empty
        let header_image = if cached_data.header_image.is_empty() {
            default_header_image
        } else {
            cached_data.header_image.clone()
        };
        
        return (Some(capsule_image), Some(header_image));
    }
    
    // If no cache, return CDN URLs immediately (no blocking API call)
    println!("No cache found for AppID {}, using CDN fallback for immediate display", app_id);
    (Some(capsule_image), Some(default_header_image))
}

// Helper function to load from the same cache used by commands.rs
fn load_steam_app_info_from_cache(app_id: &str) -> Result<crate::models::SteamAppInfo, String> {
    let cache_path = get_steam_cache_file_path(app_id)?;
    
    if cache_path.exists() && is_steam_cache_valid(&cache_path) {
        let content = std::fs::read_to_string(&cache_path).map_err(|e| e.to_string())?;
        let steam_app_info: crate::models::SteamAppInfo = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(steam_app_info)
    } else {
        Err("Cache not found or expired".to_string())
    }
}

fn get_steam_cache_file_path(app_id: &str) -> Result<std::path::PathBuf, String> {
    if let Some(cache_dir) = dirs_next::cache_dir() {
        let yeyodra_cache = cache_dir.join("yeyodra").join("steam_app_info");
        std::fs::create_dir_all(&yeyodra_cache).map_err(|e| e.to_string())?;
        Ok(yeyodra_cache.join(format!("{}.json", app_id)))
    } else {
        Err("Unable to find cache directory".to_string())
    }
}

fn is_steam_cache_valid(file_path: &std::path::PathBuf) -> bool {
    if let Ok(metadata) = std::fs::metadata(file_path) {
        if let Ok(modified) = metadata.modified() {
            if let Ok(duration) = modified.elapsed() {
                // Staggered cache expiry: 20-28 hours based on app_id hash
                // This prevents all cache from expiring at the same time
                let app_id_hash = file_path.file_stem()
                    .and_then(|s| s.to_str())
                    .map(|s| s.chars().map(|c| c as u32).sum::<u32>())
                    .unwrap_or(0);
                
                let base_hours = 20;
                let additional_hours = (app_id_hash % 8) as u64; // 0-7 additional hours
                let cache_duration_secs = (base_hours + additional_hours) * 60 * 60;
                
                return duration.as_secs() < cache_duration_secs;
            }
        }
    }
    false
}

/// Check if cache is valid for a specific app
fn is_cache_valid_for_app(app_id: &str) -> bool {
    if let Ok(cache_path) = get_steam_cache_file_path(app_id) {
        is_steam_cache_valid(&cache_path)
    } else {
        false
    }
}

/// Background function to refresh expired cache with rate limiting
async fn background_refresh_cache(app_ids: Vec<String>) {
    // Use semaphore for rate limiting (max 3 concurrent API calls)
    let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(3));
    let mut tasks = Vec::new();
    
    for app_id in app_ids {
        let semaphore = semaphore.clone();
        let task = tokio::spawn(async move {
            let _permit = semaphore.acquire().await.unwrap();
            
            // Add small delay between requests to be nice to Steam API
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            
            println!("Background refreshing cache for AppID: {}", app_id);
            
            // Try to fetch and cache from Steam API
            if let Ok(details) = crate::commands::get_game_details(app_id.clone()).await {
                println!("Successfully refreshed cache for AppID: {}", app_id);
            } else {
                println!("Failed to refresh cache for AppID: {}", app_id);
            }
        });
        
        tasks.push(task);
    }
    
    // Wait for all background tasks to complete
    futures::future::join_all(tasks).await;
    println!("Background cache refresh completed");
}

/// Fetch game images from Steam API with fallback to CDN (kept for compatibility)
async fn fetch_game_images(app_id: &str) -> (Option<String>, Option<String>) {
    // First try Steam API with isolated client and short timeout
    let api_result = try_fetch_from_steam_api(app_id).await;
    
    // If API fails or returns None, fallback to CDN URLs
    match api_result {
        (Some(capsule), Some(header)) => {
            println!("Successfully fetched images from Steam API for AppID {}", app_id);
            (Some(capsule), Some(header))
        }
        _ => {
            println!("Steam API failed for AppID {}, using CDN fallback", app_id);
            // Fallback to reliable CDN URLs
            let capsule_image = format!("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/capsule_231x87.jpg", app_id);
            let header_image = format!("https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{}/header.jpg", app_id);
            (Some(capsule_image), Some(header_image))
        }
    }
}

/// Try to fetch from Steam API with proper error isolation
async fn try_fetch_from_steam_api(app_id: &str) -> (Option<String>, Option<String>) {
    use std::time::Duration;
    
    // Create isolated client with short timeout to prevent cascade failures
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());
    
    let url = format!("https://store.steampowered.com/api/appdetails?appids={}", app_id);
    
    // Use timeout to prevent hanging
    let response_result = tokio::time::timeout(
        Duration::from_secs(5),
        client.get(&url).send()
    ).await;
    
    match response_result {
        Ok(Ok(response)) => {
            if response.status().is_success() {
                if let Ok(text) = response.text().await {
                    if let Ok(steam_response) = serde_json::from_str::<SteamGameDetailsResponse>(&text) {
                        if let Some(app_data) = steam_response.apps.get(app_id) {
                            if app_data.success {
                                if let Some(data) = &app_data.data {
                                    return (
                                        data.capsule_image.clone(),
                                        data.header_image.clone()
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
        Ok(Err(e)) => {
            println!("HTTP error for AppID {}: {}", app_id, e);
        }
        Err(_) => {
            println!("Timeout for AppID {}", app_id);
        }
    }
    
    (None, None)
}

/// Get game name by AppID
#[command]
pub async fn get_game_name_by_appid(app_id: String) -> Result<String, String> {
    Ok(crate::GAME_DATABASE.get_by_app_id(&app_id)
        .map(|game| game.game_name)
        .unwrap_or_else(|| format!("AppID: {}", app_id)))
}

/// Updates game files by downloading from GitHub and updating LUA
#[command]
pub async fn update_game_files(app_id: String, game_name: String) -> Result<String, String> {
    println!("Starting update for AppID: {} ({})", app_id, game_name);

    let steam_config_path = find_steam_config_path().map_err(|e| e.to_string())?;
    let lua_file_path = find_lua_file_for_appid(&steam_config_path, &app_id)
        .map_err(|e| e.to_string())?;

    // --- 1. Download Branch Zip ---
    let client = reqwest::Client::builder()
        .user_agent("yeyodra-updater/1.0")
        .build().map_err(|e| e.to_string())?;
    
    // Define repositories to try
    let mut repos = HashMap::new();
    repos.insert("Fairyvmos/bruh-hub".to_string(), "Branch");
    repos.insert("SteamAutoCracks/ManifestHub".to_string(), "Branch");
    repos.insert("ManifestHub/ManifestHub".to_string(), "Decrypted");

    let mut zip_content: Option<bytes::Bytes> = None;

    for (repo_full_name, _) in &repos {
        let api_url = format!("https://api.github.com/repos/{}/zipball/{}", repo_full_name, app_id);
        println!("Trying to download from: {}", api_url);
        
        match client.get(&api_url).timeout(Duration::from_secs(600)).send().await {
            Ok(response) if response.status().is_success() => {
                zip_content = Some(response.bytes().await.map_err(|e| e.to_string())?);
                println!("Successfully downloaded zip from {}", repo_full_name);
                break;
            }
            Ok(response) => {
                 println!("Failed to download from {}. Status: {}", repo_full_name, response.status());
                continue;
            }
            Err(e) => {
                println!("Error downloading from {}: {}", repo_full_name, e);
                continue;
            }
        }
    }

    let Some(zip_bytes) = zip_content else {
        return Err("Failed to download game data from all repositories.".to_string());
    };

    // --- 2. Extract Manifests ---
    let temp_dir = std::env::temp_dir().join(format!("yeyodra_update_{}", Uuid::new_v4()));
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let mut manifest_map: HashMap<String, String> = HashMap::new();
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(zip_bytes)).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(|e| e.to_string())?;
        let file_path = file.enclosed_name().ok_or("Invalid file path in zip".to_string())?;

        if let Some(ext) = file_path.extension() {
            if ext == "manifest" {
                if let Some(file_name_os) = file_path.file_name() {
                     if let Some(file_name) = file_name_os.to_str() {
                        // Filename format is DepotID_ManifestID.manifest
                        let re = Regex::new(r"(\d+)_(\d+)\.manifest").unwrap();
                        if let Some(caps) = re.captures(file_name) {
                            let depot_id = caps.get(1).unwrap().as_str().to_string();
                            let manifest_id = caps.get(2).unwrap().as_str().to_string();
                            manifest_map.insert(depot_id, manifest_id);
                        }
                    }
                }
            }
        }
    }
    
    if manifest_map.is_empty() {
        fs::remove_dir_all(&temp_dir).ok();
        return Err("No manifest files found in the downloaded archive.".to_string());
    }
    println!("Found {} new manifest IDs.", manifest_map.len());

    // --- 3. Update Lua File ---
    let original_lua_content = fs::read_to_string(&lua_file_path).map_err(|e| e.to_string())?;
    
    let mut updated_count = 0;
    let mut appended_count = 0;

    // Regex to find setManifestid(depot_id, "manifest_id", 0)
    let re_replace = Regex::new(r#"setManifestid\s*\(\s*(\d+)\s*,\s*"(\d+)"\s*,\s*0\s*\)"#).unwrap();
    let mut processed_depots: HashMap<String, bool> = HashMap::new();

    let mut updated_lua_content = re_replace.replace_all(&original_lua_content, |caps: &regex::Captures| {
        let depot_id = caps.get(1).unwrap().as_str();
        let old_manifest_id = caps.get(2).unwrap().as_str();
        processed_depots.insert(depot_id.to_string(), true);

        if let Some(new_manifest_id) = manifest_map.get(depot_id) {
            if new_manifest_id != old_manifest_id {
                updated_count += 1;
                format!(r#"setManifestid({}, "{}", 0)"#, depot_id, new_manifest_id)
            } else {
                caps.get(0).unwrap().as_str().to_string() // No change
            }
        } else {
            caps.get(0).unwrap().as_str().to_string() // No new manifest for this depot
        }
    }).to_string();

    // Append new manifest IDs
    let mut lines_to_append = Vec::new();
    for (depot_id, manifest_id) in &manifest_map {
        if !processed_depots.contains_key(depot_id) {
            lines_to_append.push(format!(r#"setManifestid({}, "{}", 0)"#, depot_id, manifest_id));
            appended_count += 1;
        }
    }
    
    if !lines_to_append.is_empty() {
        updated_lua_content.push_str("\n-- Appended by Yeyodra Updater --\n");
        updated_lua_content.push_str(&lines_to_append.join("\n"));
        updated_lua_content.push('\n');
    }

    // --- 4. Save and Cleanup ---
    if updated_count > 0 || appended_count > 0 {
        fs::write(&lua_file_path, updated_lua_content).map_err(|e| e.to_string())?;
    }
    fs::remove_dir_all(&temp_dir).ok();

    let result_message = format!(
        "Update for {} complete. Updated: {}, Appended: {}.",
        game_name, updated_count, appended_count
    );
    println!("{}", result_message);
    Ok(result_message)
}

/// Removes game files from the library
#[command]
pub async fn remove_game(app_id: String) -> Result<String, String> {
    let steam_config_path = find_steam_config_path().map_err(|e| e.to_string())?;
    let stplugin_dir = steam_config_path.join("stplug-in");
    let depotcache_dir = steam_config_path.join("depotcache");
    let statsexport_dir = steam_config_path.join("StatsExport");
    
    // Delete LUA file
    let lua_file = stplugin_dir.join(format!("{}.lua", app_id));
    if lua_file.exists() {
        if let Err(e) = fs::remove_file(&lua_file) {
            return Err(format!("Failed to delete LUA file: {}", e));
        }
    }
    
    // Delete manifest file
    let manifest_file = depotcache_dir.join(format!("{}.manifest", app_id));
    if manifest_file.exists() {
        if let Err(e) = fs::remove_file(&manifest_file) {
            return Err(format!("Failed to delete manifest file: {}", e));
        }
    }
    
    // Delete BIN file
    let bin_file = statsexport_dir.join(format!("{}.bin", app_id));
    if bin_file.exists() {
        if let Err(e) = fs::remove_file(&bin_file) {
            return Err(format!("Failed to delete BIN file: {}", e));
        }
    }
    
    Ok(format!("Successfully removed game files for AppID: {}", app_id))
}

/// Get DLCs currently installed in LUA file (copied from Oracle)
#[command]
pub async fn get_dlcs_in_lua(app_id: String) -> Result<Vec<String>, String> {
    let steam_config_path = find_steam_config_path().map_err(|e| e.to_string())?;
    let lua_file_path = find_lua_file_for_appid(&steam_config_path, &app_id)
        .map_err(|e| e.to_string())?;
    
    let content = fs::read_to_string(&lua_file_path).map_err(|e| e.to_string())?;
    
    let re = Regex::new(r"addappid\s*\(\s*(\d+)\s*\)").unwrap();
    let installed_dlcs = re.captures_iter(&content)
        .map(|cap| cap[1].to_string())
        .filter(|id| *id != app_id) // Exclude the main game's ID from the result
        .collect();
        
    Ok(installed_dlcs)
}

/// Sync DLCs in LUA file (copied from Oracle)
#[command]
pub async fn sync_dlcs_in_lua(main_app_id: String, dlc_ids_to_set: Vec<String>) -> Result<String, String> {
    // 1. Find the LUA file
    let steam_config_path = find_steam_config_path().map_err(|e| e.to_string())?;
    let lua_file_path = find_lua_file_for_appid(&steam_config_path, &main_app_id)
        .map_err(|e| e.to_string())?;

    // 2. Read the file content
    let original_content = fs::read_to_string(&lua_file_path).map_err(|e| e.to_string())?;

    // 3. Filter the content, keeping only non-DLC lines
    let addappid_re = Regex::new(r"addappid\s*\(\s*(\d+)\s*\)").unwrap();

    let filtered_lines: Vec<&str> = original_content
        .lines()
        .filter(|line| {
            if let Some(caps) = addappid_re.captures(line) {
                // This line contains an `addappid` call.
                // We check if the ID matches the main game ID.
                if let Some(id_str) = caps.get(1) {
                    // If it's the main game, we keep it. Otherwise, it's a DLC and we filter it out.
                    return id_str.as_str() == main_app_id;
                }
            }
            // Not an `addappid` line, so we keep it.
            true
        })
        .collect();

    let mut new_content = filtered_lines.join("\n");
    
    // 4. Append the new set of DLCs
    if !dlc_ids_to_set.is_empty() {
        if !new_content.is_empty() && !new_content.ends_with('\n') {
            new_content.push('\n');
        }
        new_content.push_str("\n-- DLCs Synced by Yeyodra --\n");
        for dlc_id in &dlc_ids_to_set {
            new_content.push_str(&format!("addappid({})\n", dlc_id));
        }
    }

    // 5. Write the new content back to the file
    fs::write(&lua_file_path, new_content).map_err(|e| e.to_string())?;

    Ok(format!("Successfully synced {} DLC(s).", dlc_ids_to_set.len()))
}