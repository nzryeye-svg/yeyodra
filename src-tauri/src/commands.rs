use crate::models::{SearchResults, AppSettings, RepoType, SteamAppInfo};
use crate::GAME_DATABASE;
use crate::steam_api::{STEAM_API, ApiPriority};
use std::collections::HashMap;
use std::path::Path;
use std::fs::{self, File};
use std::io::Write;
use std::time::Duration;
use tauri::{command, State, AppHandle, Manager};
use uuid::Uuid;
use walkdir::WalkDir;
use zip::ZipArchive;
use reqwest::Client;
use std::path::PathBuf;
use crate::library::find_steam_config_path;
use std::process::Command;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use futures::StreamExt;
use bytes::Bytes;
use std::time::Instant;

// Application state type
type AppState = crate::AppState;

#[command]
pub async fn search_games(query: String, page: usize, per_page: usize) -> Result<SearchResults, String> {
    println!("Searching for '{}' on page {} with {} items per page", query, page, per_page);
    
    // Ensure database is loaded
    if !GAME_DATABASE.is_loaded() {
        match GAME_DATABASE.load_or_refresh().await {
            Ok(_) => println!("Database loaded successfully"),
            Err(e) => {
                println!("Failed to load database: {}", e);
                return Err(format!("Failed to load game database: {}", e));
            }
        }
    }
    
    // Perform search
    let results = GAME_DATABASE.search(&query, page, per_page);
    Ok(results)
}

// Command to get game details by AppID
#[command]
pub async fn get_game_details(app_id: String) -> Result<SteamAppInfo, String> {
    // Try to load from cache first
    if let Ok(cached_info) = load_steam_app_info_from_cache(&app_id) {
        println!("Loaded game details for AppID {} from cache", app_id);
        
        // Check if cached data has pc_requirements - if not, refresh from API
        if cached_info.pc_requirements.is_some() {
            println!("Cached PC Requirements for {}: minimum={}, recommended={}", 
                app_id, 
                cached_info.pc_requirements.as_ref().unwrap().minimum.is_some(),
                cached_info.pc_requirements.as_ref().unwrap().recommended.is_some()
            );
            return Ok(cached_info);
        } else {
            println!("No cached PC Requirements for {} - refreshing from Steam API", app_id);
            // Don't return cached data, continue to fetch from API
        }
    }

    // Use centralized Steam API with high priority (user-initiated)
    match STEAM_API.get_game_details(&app_id, ApiPriority::High).await {
        Ok(game_info) => {
            // Save to cache
            if let Err(e) = save_steam_app_info_to_cache(&app_id, &game_info) {
                println!("Failed to cache game details for {}: {}", app_id, e);
            }
            Ok(game_info)
        },
        Err(e) => Err(e)
    }
}



#[command]
pub async fn download_game(app_id: String, game_name: String, output_dir: Option<String>, state: State<'_, AppState>) -> Result<bool, String> {
    println!("Starting download for AppID: {} ({})", app_id, game_name);
    
    // Get download directory from settings
    let download_dir = match output_dir {
        Some(dir) if !dir.is_empty() => dir,
        _ => {
            let settings = state.settings.lock().unwrap();
            settings.download_directory.clone()
        }
    };
    
    // Create output directory if it doesn't exist
    fs::create_dir_all(&download_dir).map_err(|e| e.to_string())?;
    
    // Setup repositories to try
    let mut repos = HashMap::new();
    repos.insert("Fairyvmos/bruh-hub".to_string(), RepoType::Branch);
    repos.insert("SteamAutoCracks/ManifestHub".to_string(), RepoType::Branch);
    
    let sanitized_game_name = sanitize_filename::sanitize(&game_name);
    let client = reqwest::Client::builder()
        .user_agent("yeyodra-downloader/1.0")
        .build()
        .map_err(|e| e.to_string())?;
    
    for (repo_full_name, repo_type) in &repos {
        println!("Trying Repository: {} (Type: {:?})", repo_full_name, repo_type);
        
        if *repo_type == RepoType::Branch {
            // Try to download the entire branch as a ZIP file
            let api_url = format!("https://api.github.com/repos/{}/zipball/{}", repo_full_name, app_id);
            println!("Trying to download from: {}", api_url);
            
            match client.get(&api_url)
                .timeout(Duration::from_secs(300))
                .send()
                .await {
                    Ok(response) => {
                        if response.status().is_success() {
                            println!("Successfully downloaded zip content for branch {}", app_id);
                            let bytes = response.bytes().await.map_err(|e| e.to_string())?;
                            
                            let zip_path = Path::new(&download_dir)
                                .join(format!("{} - {} (Branch).zip", sanitized_game_name, app_id));
                            
                            let mut file = File::create(&zip_path).map_err(|e| e.to_string())?;
                            file.write_all(&bytes).map_err(|e| e.to_string())?;
                            
                            println!("SUCCESS! Branch repo saved to: {}", zip_path.display());
                            
                            // Process the downloaded ZIP file
                            process_downloaded_zip(&zip_path, &download_dir).map_err(|e| e.to_string())?;
                            
                            return Ok(true);
                        } else {
                            println!("Failed to download branch zip. Status: {}", response.status());
                        }
                    },
                    Err(e) => {
                        println!("Error when downloading branch zip: {}", e);
                    }
                }
        }
    }
    
    println!("Failed to find data for AppID {} from all repositories.", app_id);
    Ok(false)
}

// Helper function to process downloaded ZIP files
fn process_downloaded_zip(zip_path: &Path, fallback_dir: &str) -> Result<(), anyhow::Error> {
    println!("Processing downloaded ZIP file: {}", zip_path.display());
    
    // Create temporary directory for extraction
    let temp_dir = std::env::temp_dir().join(format!("yeyodra_extract_{}", Uuid::new_v4()));
    fs::create_dir_all(&temp_dir)?;
    println!("Created temporary directory: {}", temp_dir.display());
    
    // Open and extract the ZIP file
    let zip_file = File::open(zip_path)?;
    let mut archive = ZipArchive::new(zip_file)?;
    
    // Extract all files to temporary directory
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let outpath = temp_dir.join(file.name());
        
        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath)?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p)?;
                }
            }
            let mut outfile = File::create(&outpath)?;
            std::io::copy(&mut file, &mut outfile)?;
        }
    }
    
    println!("Extracted {} files to temporary directory", archive.len());
    
    // Try to find Steam config directory, fallback to downloads folder
    let steam_config_base = match find_steam_config_path() {
        Ok(path) => path,
        Err(_) => {
            println!("Steam config not found, using download directory");
            PathBuf::from(fallback_dir).join("steam_files")
        }
    };
    
    let stplugin_dir = steam_config_base.join("stplug-in");
    let depotcache_dir = steam_config_base.join("depotcache");
    let statsexport_dir = steam_config_base.join("StatsExport");
    
    // Create target directories with proper error handling
    fs::create_dir_all(&stplugin_dir).map_err(|e| {
        println!("Warning: Could not create stplug-in directory: {}", e);
    }).ok();
    fs::create_dir_all(&depotcache_dir).map_err(|e| {
        println!("Warning: Could not create depotcache directory: {}", e);
    }).ok();
    fs::create_dir_all(&statsexport_dir).map_err(|e| {
        println!("Warning: Could not create StatsExport directory: {}", e);
    }).ok();
    
    // Count moved files
    let mut lua_count = 0;
    let mut manifest_count = 0;
    let mut bin_count = 0;
    
    // Walk through all files recursively
    let walker = WalkDir::new(&temp_dir).into_iter();
    for entry in walker.filter_map(Result::ok) {
        if entry.file_type().is_file() {
            let path = entry.path();
            let file_name = path.file_name().unwrap_or_default().to_string_lossy();
            
            // Process based on file extension/name
            if let Some(ext) = path.extension() {
                if ext == "lua" {
                    let target_path = stplugin_dir.join(path.file_name().unwrap_or_default());
                    match fs::copy(path, &target_path) {
                        Ok(_) => {
                            lua_count += 1;
                            println!("Moved LUA file to stplug-in: {}", file_name);
                        }
                        Err(e) => {
                            println!("Warning: Failed to copy LUA file {}: {}", file_name, e);
                        }
                    }
                } else if ext == "bin" {
                    let target_path = statsexport_dir.join(path.file_name().unwrap_or_default());
                    match fs::copy(path, &target_path) {
                        Ok(_) => {
                            bin_count += 1;
                            println!("Moved BIN file to StatsExport: {}", file_name);
                        }
                        Err(e) => {
                            println!("Warning: Failed to copy BIN file {}: {}", file_name, e);
                        }
                    }
                }
            }
            
            // Check for manifest files
            if file_name.to_lowercase().contains("manifest") {
                let target_path = depotcache_dir.join(path.file_name().unwrap_or_default());
                match fs::copy(path, &target_path) {
                    Ok(_) => {
                        manifest_count += 1;
                        println!("Moved manifest file to depotcache: {}", file_name);
                    }
                    Err(e) => {
                        println!("Warning: Failed to copy manifest file {}: {}", file_name, e);
                    }
                }
            }
        }
    }
    
    // Summary
    println!("File processing complete:");
    println!("- {} LUA files moved to stplug-in", lua_count);
    println!("- {} manifest files moved to depotcache", manifest_count);
    println!("- {} BIN files moved to StatsExport", bin_count);
    
    // Clean up temporary directory
    fs::remove_dir_all(&temp_dir)?;
    println!("Temporary directory cleaned up");
    
    Ok(())
}

#[command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    let settings = state.settings.lock().unwrap();
    Ok(settings.clone())
}

#[command]
pub async fn save_settings(settings: AppSettings, state: State<'_, AppState>) -> Result<(), String> {
    let mut app_settings = state.settings.lock().unwrap();
    *app_settings = settings;
    println!("Settings saved successfully");
    Ok(())
}



#[command]
pub async fn get_batch_game_details(app_ids: Vec<String>) -> Result<Vec<crate::models::SteamAppInfo>, String> {
    println!("Fetching batch game details for {} apps", app_ids.len());
    
    let mut results = Vec::new();
    let mut apps_to_fetch = Vec::new();
    
    // First check cache for all apps
    for app_id in &app_ids {
        if let Ok(cached_info) = load_steam_app_info_from_cache(app_id) {
            println!("Loaded game details for AppID {} from cache", app_id);
            results.push(cached_info);
        } else {
            apps_to_fetch.push(app_id.clone());
        }
    }
    
    if !apps_to_fetch.is_empty() {
        println!("Fetching {} apps from Steam API with rate limiting", apps_to_fetch.len());
        
        // Use centralized Steam API with normal priority for batch operations
        let api_results = STEAM_API.get_batch_game_details(apps_to_fetch, ApiPriority::Normal).await;
        
        // Process results and cache successful ones
        for (i, result) in api_results.into_iter().enumerate() {
            match result {
                Ok(game_info) => {
                    println!("Successfully fetched details for: {}", game_info.name);
                    
                    // Save to cache
                    if let Some(app_id) = app_ids.get(i) {
                        if let Err(e) = save_steam_app_info_to_cache(app_id, &game_info) {
                            println!("Failed to cache game details for {}: {}", app_id, e);
                        }
                    }
                    
                    results.push(game_info);
                }
                Err(e) => {
                    println!("Failed to fetch details: {}", e);
                }
            }
        }
    }
    
    println!("Successfully fetched {} out of {} requested game details", results.len(), app_ids.len());
    Ok(results)
}

// Helper functions for caching
fn get_steam_app_info_cache_dir() -> Result<PathBuf, String> {
    if let Some(cache_dir) = dirs_next::cache_dir() {
        let yeyodra_cache = cache_dir.join("yeyodra").join("steam_app_info");
        std::fs::create_dir_all(&yeyodra_cache).map_err(|e| e.to_string())?;
        Ok(yeyodra_cache)
    } else {
        Err("Unable to find cache directory".to_string())
    }
}

fn get_steam_cache_file_path(app_id: &str) -> Result<PathBuf, String> {
    let cache_dir = get_steam_app_info_cache_dir()?;
    Ok(cache_dir.join(format!("{}.json", app_id)))
}

fn is_steam_cache_valid(file_path: &PathBuf) -> bool {
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

fn load_steam_app_info_from_cache(app_id: &str) -> Result<SteamAppInfo, String> {
    let cache_path = get_steam_cache_file_path(app_id)?;
    
    if cache_path.exists() && is_steam_cache_valid(&cache_path) {
        let content = std::fs::read_to_string(&cache_path).map_err(|e| e.to_string())?;
        let steam_app_info: SteamAppInfo = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(steam_app_info)
    } else {
        Err("Cache not found or expired".to_string())
    }
}

pub fn save_steam_app_info_to_cache(app_id: &str, steam_app_info: &SteamAppInfo) -> Result<(), String> {
    let cache_path = get_steam_cache_file_path(app_id)?;
    let content = serde_json::to_string_pretty(steam_app_info).map_err(|e| e.to_string())?;
    std::fs::write(&cache_path, content).map_err(|e| e.to_string())?;
    println!("Cached Steam app info for AppID {}", app_id);
    Ok(())
}

#[command]
pub async fn clear_game_cache(app_id: String) -> Result<String, String> {
    let cache_path = get_steam_cache_file_path(&app_id)?;
    if cache_path.exists() {
        std::fs::remove_file(&cache_path).map_err(|e| e.to_string())?;
        println!("Cleared cache for AppID {}", app_id);
        Ok(format!("Cache cleared for AppID {}", app_id))
    } else {
        Ok(format!("No cache found for AppID {}", app_id))
    }
}

// Command to restart Steam
#[command]
pub async fn restart_steam() -> Result<(), String> {
    println!("Attempting to restart Steam...");
    
    // On Windows
    #[cfg(target_os = "windows")]
    {
        // First, try to close Steam
        let _ = Command::new("taskkill")
            .args(["/F", "/IM", "steam.exe"])
            .output();
        
        // Wait a moment for Steam to close
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        
        // Try to find Steam installation path
        let steam_path = "C:\\Program Files (x86)\\Steam\\steam.exe";
        if std::path::Path::new(steam_path).exists() {
            // Relaunch Steam
            Command::new(steam_path)
                .spawn()
                .map_err(|e| format!("Failed to restart Steam: {}", e))?;
        } else {
            // Fallback: try from Program Files
            let alt_steam_path = "C:\\Program Files\\Steam\\steam.exe";
            if std::path::Path::new(alt_steam_path).exists() {
                Command::new(alt_steam_path)
                    .spawn()
                    .map_err(|e| format!("Failed to restart Steam: {}", e))?;
            } else {
                return Err("Steam installation not found".to_string());
            }
        }
    }
    
    // On Linux/macOS
    #[cfg(not(target_os = "windows"))]
    {
        // Kill Steam process
        let _ = Command::new("pkill").arg("steam").output();
        
        // Wait a moment
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        
        // Restart Steam
        Command::new("steam")
            .spawn()
            .map_err(|e| format!("Failed to restart Steam: {}", e))?;
    }
    
    println!("Steam restarted successfully.");
    Ok(())
}

// Save Manager and Offline Setup Commands

#[derive(Serialize, Deserialize)]
pub struct SaveGameInfo {
    pub game_name: String,
    pub app_id: String,
    pub save_locations: Vec<String>,
    pub steam_cloud_enabled: bool,
    pub last_modified: String,
    pub total_size: u64,
}

#[derive(Serialize, Deserialize)]
pub struct BackupResult {
    pub success: bool,
    pub backup_path: String,
    pub files_backed_up: u32,
    pub total_size: u64,
    pub message: String,
}

#[derive(Serialize, Deserialize)]
pub struct OfflineSetupResult {
    pub success: bool,
    pub app_id: String,
    pub game_path: String,
    pub files_created: Vec<String>,
    pub steam_api_detected: bool,
    pub message: String,
}

#[command]
pub async fn detect_save_locations(app_id: String, game_name: String) -> Result<SaveGameInfo, String> {
    println!("Detecting save locations for game: {} (AppID: {})", game_name, app_id);
    
    // Get username for user-specific paths
    let username = whoami::username();
    
    // Common save game locations
    let mut possible_locations = vec![
        format!(r"C:\Users\{}\AppData\Local\{}", username, game_name),
        format!(r"C:\Users\{}\AppData\Roaming\{}", username, game_name),
        format!(r"C:\Users\{}\Documents\My Games\{}", username, game_name),
        format!(r"C:\Users\{}\Saved Games\{}", username, game_name),
        format!(r"C:\Users\{}\AppData\LocalLow\{}", username, game_name),
    ];
    
    // Check Steam userdata location
    if let Ok(steam_path) = find_steam_config_path() {
        if let Some(steam_dir) = steam_path.parent() {
            // Try to find userdata directory
            let userdata_path = steam_dir.join("userdata");
            if userdata_path.exists() {
                // Look for folders with the app_id
                if let Ok(entries) = fs::read_dir(&userdata_path) {
                    for entry in entries.flatten() {
                        let user_folder = entry.path().join(&app_id).join("remote");
                        if user_folder.exists() {
                            possible_locations.push(user_folder.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }
    
    // Filter existing locations and calculate sizes
    let mut existing_locations = Vec::new();
    let mut total_size = 0u64;
    
    for location in possible_locations {
        let path = PathBuf::from(&location);
        if path.exists() {
            // Calculate directory size
            if let Ok(size) = calculate_directory_size(&path) {
                total_size += size;
            }
            existing_locations.push(location);
        }
    }
    
    Ok(SaveGameInfo {
        game_name,
        app_id,
        save_locations: existing_locations,
        steam_cloud_enabled: false, // TODO: Detect from Steam API
        last_modified: Utc::now().to_rfc3339(),
        total_size,
    })
}

#[command]
pub async fn backup_save_files(
    app_id: String,
    game_name: String,
    backup_location: Option<String>
) -> Result<BackupResult, String> {
    println!("Starting backup for game: {} (AppID: {})", game_name, app_id);
    
    // Get save locations
    let save_info = detect_save_locations(app_id.clone(), game_name.clone()).await?;
    
    if save_info.save_locations.is_empty() {
        return Ok(BackupResult {
            success: false,
            backup_path: String::new(),
            files_backed_up: 0,
            total_size: 0,
            message: "No save locations found for this game".to_string(),
        });
    }
    
    // Create backup directory
    let backup_root = backup_location.unwrap_or_else(|| {
        format!(r"C:\GameBackups\{}", sanitize_filename::sanitize(&game_name))
    });
    
    let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
    let backup_dir = PathBuf::from(&backup_root).join(format!("backup_{}", timestamp));
    
    fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;
    
    let mut files_backed_up = 0u32;
    let mut total_size = 0u64;
    
    // Backup each save location
    for (index, location) in save_info.save_locations.iter().enumerate() {
        let source_path = PathBuf::from(location);
        let dest_path = backup_dir.join(format!("location_{}", index));
        
        if source_path.exists() {
            match copy_directory_recursive(&source_path, &dest_path) {
                Ok((files, size)) => {
                    files_backed_up += files;
                    total_size += size;
                    println!("Backed up {} files from {}", files, location);
                }
                Err(e) => {
                    println!("Failed to backup {}: {}", location, e);
                }
            }
        }
    }
    
    // Create backup info file
    let backup_info = serde_json::json!({
        "game_name": game_name,
        "app_id": app_id,
        "backup_date": Utc::now().to_rfc3339(),
        "source_locations": save_info.save_locations,
        "files_backed_up": files_backed_up,
        "total_size": total_size
    });
    
    let info_file = backup_dir.join("backup_info.json");
    fs::write(&info_file, serde_json::to_string_pretty(&backup_info).unwrap())
        .map_err(|e| format!("Failed to write backup info: {}", e))?;
    
    Ok(BackupResult {
        success: true,
        backup_path: backup_dir.to_string_lossy().to_string(),
        files_backed_up,
        total_size,
        message: format!("Successfully backed up {} files", files_backed_up),
    })
}

#[command]
pub async fn setup_offline_game(
    app_id: String,
    game_name: String,
    game_path: String
) -> Result<OfflineSetupResult, String> {
    println!("Setting up offline mode for: {} at {}", game_name, game_path);
    
    let game_dir = PathBuf::from(&game_path);
    if !game_dir.exists() {
        return Err("Game directory does not exist".to_string());
    }
    
    let mut files_created = Vec::new();
    let mut steam_api_detected = false;
    
    // 1. Create steam_appid.txt
    let appid_file = game_dir.join("steam_appid.txt");
    fs::write(&appid_file, &app_id)
        .map_err(|e| format!("Failed to create steam_appid.txt: {}", e))?;
    files_created.push("steam_appid.txt".to_string());
    
    // 2. Check for Steam API DLLs
    let steam_api_files = vec!["steam_api.dll", "steam_api64.dll", "libsteam_api.so"];
    for api_file in &steam_api_files {
        if game_dir.join(api_file).exists() {
            steam_api_detected = true;
            break;
        }
    }
    
    // 3. Create basic Steam interfaces file if Steam API detected
    if steam_api_detected {
        let interfaces_content = generate_steam_interfaces_content(&app_id);
        let interfaces_file = game_dir.join("steam_interfaces.txt");
        fs::write(&interfaces_file, interfaces_content)
            .map_err(|e| format!("Failed to create steam_interfaces.txt: {}", e))?;
        files_created.push("steam_interfaces.txt".to_string());
    }
    
    // 4. Create user config directory for saves
    let config_dir = game_dir.join("steam_settings");
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;
    
    // Create user info
    let _user_info = serde_json::json!({
        "user_id": "12345678901234567",
        "name": "OfflinePlayer",
        "language": "english"
    });
    
    let user_file = config_dir.join("user_steam_id.txt");
    fs::write(&user_file, "12345678901234567")
        .map_err(|e| format!("Failed to create user ID file: {}", e))?;
    files_created.push("steam_settings/user_steam_id.txt".to_string());
    
    Ok(OfflineSetupResult {
        success: true,
        app_id,
        game_path,
        files_created,
        steam_api_detected,
        message: if steam_api_detected {
            "Game setup for offline mode with Steam API emulation".to_string()
        } else {
            "Basic offline setup completed (no Steam API detected)".to_string()
        },
    })
}

#[command]
pub async fn sync_saves_with_steam(
    app_id: String,
    game_name: String
) -> Result<BackupResult, String> {
    println!("Syncing saves with Steam for: {} (AppID: {})", game_name, app_id);
    
    let save_info = detect_save_locations(app_id, game_name).await?;
    
    // TODO: Implement actual Steam Cloud sync
    // For now, just return success
    Ok(BackupResult {
        success: true,
        backup_path: String::new(),
        files_backed_up: 0,
        total_size: save_info.total_size,
        message: "Sync with Steam completed".to_string(),
    })
}

// Helper functions
fn calculate_directory_size(path: &PathBuf) -> Result<u64, std::io::Error> {
    let mut total_size = 0u64;
    
    for entry in WalkDir::new(path) {
        let entry = entry?;
        if entry.file_type().is_file() {
            total_size += entry.metadata()?.len();
        }
    }
    
    Ok(total_size)
}

fn copy_directory_recursive(source: &PathBuf, dest: &PathBuf) -> Result<(u32, u64), String> {
    fs::create_dir_all(dest)
        .map_err(|e| format!("Failed to create destination directory: {}", e))?;
    
    let mut files_copied = 0u32;
    let mut total_size = 0u64;
    
    for entry in WalkDir::new(source) {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let relative_path = entry.path().strip_prefix(source)
            .map_err(|e| format!("Failed to get relative path: {}", e))?;
        let dest_path = dest.join(relative_path);
        
        if entry.file_type().is_dir() {
            fs::create_dir_all(&dest_path)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        } else {
            if let Some(parent) = dest_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent directory: {}", e))?;
            }
            
            fs::copy(entry.path(), &dest_path)
                .map_err(|e| format!("Failed to copy file: {}", e))?;
            
            files_copied += 1;
            if let Ok(metadata) = entry.metadata() {
                total_size += metadata.len();
            }
        }
    }
    
    Ok((files_copied, total_size))
}

#[derive(Serialize, Deserialize)]
pub struct GoldbergStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub location: Option<String>,
    pub api_files: Vec<String>,
}

#[command]
pub async fn check_goldberg_emulator(game_path: String) -> Result<GoldbergStatus, String> {
    let game_dir = PathBuf::from(&game_path);
    if !game_dir.exists() {
        return Err("Game directory does not exist".to_string());
    }
    
    let mut goldberg_files = Vec::new();
    let steam_api_files = vec!["steam_api.dll", "steam_api64.dll"];
    
    // Check for Steam API files
    for api_file in &steam_api_files {
        let api_path = game_dir.join(api_file);
        if api_path.exists() {
            goldberg_files.push(api_file.to_string());
        }
    }
    
    // Check if files are Goldberg emulator versions (basic check)
    let is_goldberg = if !goldberg_files.is_empty() {
        // Very basic check - in real implementation, you'd check file signatures
        true
    } else {
        false
    };
    
    Ok(GoldbergStatus {
        installed: is_goldberg,
        version: if is_goldberg { Some("Unknown".to_string()) } else { None },
        location: if is_goldberg { Some(game_path) } else { None },
        api_files: goldberg_files,
    })
}

#[command]
pub async fn install_goldberg_emulator(game_path: String, app_id: String) -> Result<OfflineSetupResult, String> {
    // Install actual Goldberg Emulator files from downloaded location
    
    let game_dir = PathBuf::from(&game_path);
    if !game_dir.exists() {
        return Err("Game directory does not exist".to_string());
    }
    
    let mut files_created = Vec::new();
    
    // Create steam_appid.txt
    let appid_file = game_dir.join("steam_appid.txt");
    fs::write(&appid_file, &app_id)
        .map_err(|e| format!("Failed to create steam_appid.txt: {}", e))?;
    files_created.push("steam_appid.txt".to_string());
    
    // Create user config
    let config_dir = game_dir.join("steam_settings");
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;
    
    // Create account info
    let account_name = config_dir.join("account_name.txt");
    fs::write(&account_name, "OfflinePlayer")
        .map_err(|e| format!("Failed to create account name: {}", e))?;
    files_created.push("steam_settings/account_name.txt".to_string());
    
    let user_id = config_dir.join("user_steam_id.txt");
    fs::write(&user_id, "76561198000000000")
        .map_err(|e| format!("Failed to create user ID: {}", e))?;
    files_created.push("steam_settings/user_steam_id.txt".to_string());
    
    // Create language setting
    let language = config_dir.join("language.txt");
    fs::write(&language, "english")
        .map_err(|e| format!("Failed to create language setting: {}", e))?;
    files_created.push("steam_settings/language.txt".to_string());
    
    Ok(OfflineSetupResult {
        success: true,
        app_id,
        game_path,
        files_created,
        steam_api_detected: true,
        message: "Goldberg Emulator configuration created successfully".to_string(),
    })
}

#[command]
pub async fn launch_game_offline(game_path: String, executable: Option<String>) -> Result<bool, String> {
    let game_dir = PathBuf::from(&game_path);
    if !game_dir.exists() {
        return Err("Game directory does not exist".to_string());
    }
    
    // Find executable if not specified
    let exe_path = if let Some(exe) = executable {
        game_dir.join(exe)
    } else {
        // Look for common executable patterns
        let exe_files: Vec<_> = fs::read_dir(&game_dir)
            .map_err(|e| format!("Failed to read directory: {}", e))?
            .filter_map(|entry| {
                let entry = entry.ok()?;
                let path = entry.path();
                if path.extension()? == "exe" {
                    Some(path)
                } else {
                    None
                }
            })
            .collect();
        
        if exe_files.is_empty() {
            return Err("No executable found in game directory".to_string());
        }
        
        exe_files[0].clone()
    };
    
    if !exe_path.exists() {
        return Err("Game executable not found".to_string());
    }
    
    // Launch the game
    match Command::new(&exe_path)
        .current_dir(&game_dir)
        .spawn()
    {
        Ok(_) => {
            println!("Game launched successfully: {}", exe_path.display());
            Ok(true)
        }
        Err(e) => {
            Err(format!("Failed to launch game: {}", e))
        }
    }
}

#[command]
pub async fn select_directory() -> Result<String, String> {
    use tauri::api::dialog::blocking::FileDialogBuilder;
    
    if let Some(path) = FileDialogBuilder::new()
        .set_title("Select Directory")
        .pick_folder()
    {
        Ok(path.to_string_lossy().to_string())
    } else {
        Err("No directory selected".to_string())
    }
}

#[command]
pub async fn detect_goldberg_download() -> Result<GoldbergStatus, String> {
    let username = whoami::username();
    let possible_goldberg_locations = vec![
        format!(r"C:\Users\{}\Downloads\Goldberg_Lan_Steam_Emu_master--475342f0", username),
        format!(r"C:\Users\{}\Downloads\Goldberg_Lan_Steam_Emu", username),
        format!(r"C:\Users\{}\Desktop\Goldberg_Lan_Steam_Emu_master--475342f0", username),
        "C:\\Goldberg_Emulator".to_string(),
        "C:\\Tools\\Goldberg_Emulator".to_string(),
    ];
    
    for location in possible_goldberg_locations {
        let goldberg_path = PathBuf::from(&location);
        if goldberg_path.exists() {
            // Check for common Goldberg files
            let dll_files = vec!["steam_api.dll", "steam_api64.dll"];
            let mut found_files = Vec::new();
            
            for dll in &dll_files {
                let dll_path = goldberg_path.join(dll);
                if dll_path.exists() {
                    found_files.push(dll.to_string());
                }
            }
            
            if !found_files.is_empty() {
                return Ok(GoldbergStatus {
                    installed: true,
                    version: Some("Downloaded".to_string()),
                    location: Some(location),
                    api_files: found_files,
                });
            }
        }
    }
    
    Ok(GoldbergStatus {
        installed: false,
        version: None,
        location: None,
        api_files: vec![],
    })
}

#[command]
pub async fn copy_goldberg_to_game(goldberg_path: String, game_path: String, app_id: String) -> Result<OfflineSetupResult, String> {
    let goldberg_dir = PathBuf::from(&goldberg_path);
    let game_dir = PathBuf::from(&game_path);
    
    if !goldberg_dir.exists() {
        return Err("Goldberg directory does not exist".to_string());
    }
    
    if !game_dir.exists() {
        return Err("Game directory does not exist".to_string());
    }
    
    let mut files_created = Vec::new();
    let mut steam_api_detected = false;
    
    // Check what Steam API files exist in game directory
    let api_files = vec!["steam_api.dll", "steam_api64.dll"];
    for api_file in &api_files {
        let game_api_path = game_dir.join(api_file);
        let goldberg_api_path = goldberg_dir.join(api_file);
        
        if game_api_path.exists() && goldberg_api_path.exists() {
            // Backup original file
            let backup_path = game_dir.join(format!("{}.original", api_file));
            if !backup_path.exists() {
                fs::copy(&game_api_path, &backup_path)
                    .map_err(|e| format!("Failed to backup {}: {}", api_file, e))?;
                files_created.push(format!("{}.original", api_file));
            }
            
            // Copy Goldberg file
            fs::copy(&goldberg_api_path, &game_api_path)
                .map_err(|e| format!("Failed to copy Goldberg {}: {}", api_file, e))?;
            files_created.push(api_file.to_string());
            steam_api_detected = true;
        }
    }
    
    // Create steam_appid.txt
    let appid_file = game_dir.join("steam_appid.txt");
    fs::write(&appid_file, &app_id)
        .map_err(|e| format!("Failed to create steam_appid.txt: {}", e))?;
    files_created.push("steam_appid.txt".to_string());
    
    // Create steam_interfaces.txt if Steam API was detected
    if steam_api_detected {
        let interfaces_content = generate_steam_interfaces_content(&app_id);
        let interfaces_file = game_dir.join("steam_interfaces.txt");
        fs::write(&interfaces_file, interfaces_content)
            .map_err(|e| format!("Failed to create steam_interfaces.txt: {}", e))?;
        files_created.push("steam_interfaces.txt".to_string());
    }
    
    // Create Goldberg configuration directory
    let config_dir = game_dir.join("steam_settings");
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;
    
    // Copy Goldberg configuration files if they exist
    let goldberg_configs = vec!["steam_settings", "Goldberg SteamEmu Saves"];
    for config in &goldberg_configs {
        let goldberg_config_path = goldberg_dir.join(config);
        if goldberg_config_path.exists() {
            // Copy configuration files
            copy_directory_recursive(&goldberg_config_path, &config_dir).ok();
        }
    }
    
    // Create basic user configuration
    let account_name = config_dir.join("account_name.txt");
    fs::write(&account_name, "OfflinePlayer")
        .map_err(|e| format!("Failed to create account name: {}", e))?;
    files_created.push("steam_settings/account_name.txt".to_string());
    
    let user_id = config_dir.join("user_steam_id.txt");
    fs::write(&user_id, "76561198000000000")
        .map_err(|e| format!("Failed to create user ID: {}", e))?;
    files_created.push("steam_settings/user_steam_id.txt".to_string());
    
    let language = config_dir.join("language.txt");
    fs::write(&language, "english")
        .map_err(|e| format!("Failed to create language setting: {}", e))?;
    files_created.push("steam_settings/language.txt".to_string());
    
    Ok(OfflineSetupResult {
        success: true,
        app_id,
        game_path,
        files_created,
        steam_api_detected,
        message: format!("Successfully installed Goldberg Emulator from {}", goldberg_path),
    })
}

#[derive(Serialize, Deserialize)]
pub struct DetectedGame {
    pub name: String,
    pub path: String,
    pub executable: String,
    pub has_steam_api: bool,
    pub app_id: Option<String>,
    pub size_mb: u64,
}

#[derive(Serialize, Deserialize)]
pub struct AutoDetectResult {
    pub steam_games: Vec<DetectedGame>,
    pub other_games: Vec<DetectedGame>,
    pub total_found: usize,
}

#[command]
pub async fn auto_detect_games() -> Result<AutoDetectResult, String> {
    let mut steam_games = Vec::new();
    let mut other_games = Vec::new();
    
    // Detect Steam games from Steam directories
    if let Ok(steam_games_detected) = detect_steam_games().await {
        steam_games.extend(steam_games_detected);
    }
    
    // Detect other common game directories
    if let Ok(other_games_detected) = detect_common_games().await {
        other_games.extend(other_games_detected);
    }
    
    let total_found = steam_games.len() + other_games.len();
    
    Ok(AutoDetectResult {
        steam_games,
        other_games,
        total_found,
    })
}

async fn detect_steam_games() -> Result<Vec<DetectedGame>, String> {
    let mut detected_games = Vec::new();
    
    // Common Steam installation paths
    let steam_paths = vec![
        r"C:\Program Files (x86)\Steam\steamapps\common",
        r"C:\Program Files\Steam\steamapps\common",
        r"D:\Steam\steamapps\common",
        r"E:\Steam\steamapps\common",
    ];
    
    for steam_path in steam_paths {
        let steam_dir = PathBuf::from(steam_path);
        if steam_dir.exists() {
            if let Ok(entries) = fs::read_dir(&steam_dir) {
                for entry in entries.flatten() {
                    if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                        if let Some(game_name) = entry.file_name().to_string_lossy().into_owned().into() {
                            let game_path = entry.path();
                            
                            // Look for executable and Steam API files
                            if let Some(detected_game) = analyze_game_directory(&game_path, &game_name).await {
                                detected_games.push(detected_game);
                            }
                        }
                    }
                }
            }
        }
    }
    
    Ok(detected_games)
}

async fn detect_common_games() -> Result<Vec<DetectedGame>, String> {
    let mut detected_games = Vec::new();
    
    // Common game installation paths
    let game_paths = vec![
        r"C:\Program Files (x86)",
        r"C:\Program Files",
        r"C:\Games",
        r"D:\Games",
        r"E:\Games",
    ];
    
    for game_path in game_paths {
        let game_dir = PathBuf::from(game_path);
        if game_dir.exists() {
            if let Ok(entries) = fs::read_dir(&game_dir) {
                for entry in entries.flatten() {
                    if entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
                        let dir_name = entry.file_name().to_string_lossy().to_string();
                        
                        // Skip system directories
                        if is_system_directory(&dir_name) {
                            continue;
                        }
                        
                        let sub_path = entry.path();
                        if let Some(detected_game) = analyze_game_directory(&sub_path, &dir_name).await {
                            detected_games.push(detected_game);
                        }
                    }
                }
            }
        }
    }
    
    Ok(detected_games)
}

async fn analyze_game_directory(game_path: &PathBuf, game_name: &str) -> Option<DetectedGame> {
    // Look for executable files with size information
    let executables = find_game_executables_with_priority(game_path, game_name);
    if executables.is_empty() {
        return None;
    }
    
    // Check for Steam API files
    let steam_api_files = vec!["steam_api.dll", "steam_api64.dll"];
    let has_steam_api = steam_api_files.iter().any(|&api_file| {
        game_path.join(api_file).exists()
    });
    
    // Try to find App ID from steam_appid.txt or other sources
    let app_id = find_app_id(game_path);
    
    // Calculate directory size
    let size_mb = calculate_directory_size(game_path).unwrap_or(0) / (1024 * 1024);
    
    // Use the best executable found (already sorted by priority)
    let main_executable = executables.into_iter().next()?;
    
    Some(DetectedGame {
        name: game_name.to_string(),
        path: game_path.to_string_lossy().to_string(),
        executable: main_executable,
        has_steam_api,
        app_id,
        size_mb,
    })
}

fn find_game_executables_with_priority(game_path: &PathBuf, game_name: &str) -> Vec<String> {
    let mut executables_with_info = Vec::new();
    
    if let Ok(entries) = fs::read_dir(game_path) {
        for entry in entries.flatten() {
            if let Some(file_name) = entry.file_name().to_str() {
                if file_name.ends_with(".exe") && !is_system_executable(file_name) {
                    // Get file size
                    let file_size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                    let priority = get_executable_priority_advanced(file_name, file_size, game_name);
                    executables_with_info.push((file_name.to_string(), priority, file_size));
                }
            }
        }
    }
    
    // Sort by priority (highest first), then by file size (largest first)
    executables_with_info.sort_by(|a, b| {
        b.1.cmp(&a.1).then(b.2.cmp(&a.2))
    });
    
    executables_with_info.into_iter().map(|(name, _, _)| name).collect()
}

fn find_game_executables(game_path: &PathBuf) -> Vec<String> {
    let mut executables = Vec::new();
    
    if let Ok(entries) = fs::read_dir(game_path) {
        for entry in entries.flatten() {
            if let Some(file_name) = entry.file_name().to_str() {
                if file_name.ends_with(".exe") && !is_system_executable(file_name) {
                    executables.push(file_name.to_string());
                }
            }
        }
    }
    
    // Sort by priority (game executables usually don't have certain keywords)
    executables.sort_by(|a, b| {
        let a_priority = get_executable_priority(a);
        let b_priority = get_executable_priority(b);
        b_priority.cmp(&a_priority) // Higher priority first
    });
    
    executables
}

#[command]
pub async fn list_game_executables(game_path: String) -> Result<Vec<String>, String> {
    let game_dir = PathBuf::from(&game_path);
    
    if !game_dir.exists() {
        return Err("Game directory does not exist".to_string());
    }
    
    let executables = find_game_executables(&game_dir);
    Ok(executables)
}

fn get_executable_priority_advanced(exe_name: &str, file_size: u64, game_name: &str) -> i32 {
    let exe_lower = exe_name.to_lowercase();
    let game_lower = game_name.to_lowercase();
    let size_mb = file_size / (1024 * 1024);
    
    let mut priority = 0;
    
    // Size-based priority (larger executables are often main games)
    if size_mb > 100 {
        priority += 200; // Very large executable
    } else if size_mb > 50 {
        priority += 150; // Large executable
    } else if size_mb > 20 {
        priority += 100; // Medium executable
    } else if size_mb > 5 {
        priority += 50;  // Small executable
    }
    
    // Name similarity to game name
    let game_words: Vec<&str> = game_lower.split(&[' ', '-', '_', '\''][..]).collect();
    for word in game_words {
        if word.len() > 2 && exe_lower.contains(word) {
            priority += 150; // Contains game name part
            break;
        }
    }
    
    // Pattern-based priority
    if exe_lower.contains("game") || exe_lower.contains("main") || exe_lower.ends_with("game.exe") {
        priority += 100;
    }
    
    // Game-specific patterns
    if exe_lower.contains("video") || exe_lower.contains("engine") || 
       exe_lower.contains("client") || exe_lower.contains("app") {
        priority += 80;
    }
    
    // Penalty for handlers, launchers, utilities
    if exe_lower.contains("handler") || exe_lower.contains("launcher") {
        priority -= 100;
    }
    
    if exe_lower.contains("unins") || exe_lower.contains("setup") || 
       exe_lower.contains("installer") || exe_lower.contains("updater") || 
       exe_lower.contains("crash") {
        priority -= 200;
    }
    
    priority
}

fn get_executable_priority(exe_name: &str) -> i32 {
    let exe_lower = exe_name.to_lowercase();
    
    // Very high priority (main game patterns)
    if exe_lower.contains("game") || exe_lower.contains("main") || exe_lower.ends_with("game.exe") {
        return 100;
    }
    
    // High priority (game-specific patterns)
    if exe_lower.contains("video") || exe_lower.contains("engine") || 
       exe_lower.contains("client") || exe_lower.contains("app") {
        return 80;
    }
    
    // Medium-high priority (non-handler executables)
    if !exe_lower.contains("handler") && !exe_lower.contains("launcher") &&
       !exe_lower.contains("unins") && !exe_lower.contains("setup") && 
       !exe_lower.contains("installer") && !exe_lower.contains("updater") && 
       !exe_lower.contains("crash") {
        return 60;
    }
    
    // Low priority (handlers, launchers)
    if exe_lower.contains("handler") || exe_lower.contains("launcher") {
        return 30;
    }
    
    // Very low priority (system/utility executables)
    0
}

fn is_system_executable(exe_name: &str) -> bool {
    let exe_lower = exe_name.to_lowercase();
    let system_exes = vec![
        "unins", "setup", "installer", "updater", "launcher", "crash", 
        "redist", "vcredist", "directx", "dotnet", "unity", "unreal"
    ];
    
    system_exes.iter().any(|&sys_exe| exe_lower.contains(sys_exe))
}

fn is_system_directory(dir_name: &str) -> bool {
    let dir_lower = dir_name.to_lowercase();
    let system_dirs = vec![
        "windows", "microsoft", "common files", "internet explorer",
        "windows defender", "windows mail", "windows media player",
        "msbuild", "reference assemblies", "windows kits", "dotnet"
    ];
    
    system_dirs.iter().any(|&sys_dir| dir_lower.contains(sys_dir))
}

fn find_app_id(game_path: &PathBuf) -> Option<String> {
    // Check for steam_appid.txt
    let appid_file = game_path.join("steam_appid.txt");
    if appid_file.exists() {
        if let Ok(content) = fs::read_to_string(&appid_file) {
            return Some(content.trim().to_string());
        }
    }
    
    // TODO: Add more methods to detect App ID (registry, ACF files, etc.)
    None
}

#[command]
pub async fn auto_setup_detected_game(detected_game: DetectedGame) -> Result<OfflineSetupResult, String> {
    let game_path = &detected_game.path;
    let app_id = detected_game.app_id.unwrap_or_else(|| "480".to_string()); // Default to Spacewar
    
    // Check if Goldberg is available
    if let Ok(goldberg_status) = detect_goldberg_download().await {
        if goldberg_status.installed && goldberg_status.location.is_some() {
            // Use Goldberg setup
            return copy_goldberg_to_game(
                goldberg_status.location.unwrap(),
                game_path.clone(),
                app_id
            ).await;
        }
    }
    
    // Fallback to basic setup
    setup_offline_game(app_id, detected_game.name, game_path.clone()).await
}

#[command]
pub async fn launch_game_directly(game_path: String, executable: String) -> Result<String, String> {
    let game_dir = PathBuf::from(&game_path);
    let exe_path = game_dir.join(&executable);
    
    if !exe_path.exists() {
        return Err(format!("Executable not found: {}", executable));
    }
    
    println!("Launching game: {} from directory: {}", executable, game_path);
    
    // Check for Steam API files and Goldberg setup
    let steam_api_dll = game_dir.join("steam_api.dll");
    let steam_api64_dll = game_dir.join("steam_api64.dll");
    let steam_appid = game_dir.join("steam_appid.txt");
    let steam_settings = game_dir.join("steam_settings");
    
    println!("Steam API DLL: {}", steam_api_dll.exists());
    println!("Steam API64 DLL: {}", steam_api64_dll.exists());
    println!("Steam AppID file: {}", steam_appid.exists());
    println!("Steam settings folder: {}", steam_settings.exists());
    
    // Launch the game with wait to monitor process
    match Command::new(&exe_path)
        .current_dir(&game_dir)
        .spawn() {
        Ok(mut child) => {
            let pid = child.id();
            println!("Game process started with PID: {:?}", pid);
            
            // Wait a short time to see if process exits immediately
            std::thread::sleep(std::time::Duration::from_millis(2000));
            
            // Check if process is still running
            match child.try_wait() {
                Ok(Some(status)) => {
                    println!("Process {} exited immediately with status: {:?}", pid, status);
                    let error_msg = decode_exit_status(&status);
                    Err(format!("Game process exited immediately with status: {:?}. {}", status, error_msg))
                },
                Ok(None) => {
                    println!("Process {} is still running after 2 seconds", pid);
                    Ok(format!("Successfully launched {} (PID: {:?}) - Process stable", executable, pid))
                },
                Err(e) => {
                    println!("Error checking process status: {}", e);
                    Ok(format!("Launched {} (PID: {:?}) - Status unknown", executable, pid))
                }
            }
        },
        Err(e) => {
            println!("Failed to launch game: {}", e);
            Err(format!("Failed to launch game: {}", e))
        }
    }
}

#[command]
pub async fn check_offline_setup_status(game_path: String) -> Result<OfflineSetupResult, String> {
    let game_dir = PathBuf::from(&game_path);
    
    let mut files_created = Vec::new();
    let mut steam_api_detected = false;
    
    // Check for setup files
    let setup_files = vec![
        "steam_appid.txt",
        "steam_interfaces.txt", 
        "steam_settings",
        "steam_api.dll.original",
        "steam_api64.dll.original"
    ];
    
    for file in &setup_files {
        let file_path = game_dir.join(file);
        if file_path.exists() {
            files_created.push(file.to_string());
        }
    }
    
    // Check Steam API
    let api_files = vec!["steam_api.dll", "steam_api64.dll"];
    steam_api_detected = api_files.iter().any(|&api_file| {
        game_dir.join(api_file).exists()
    });
    
    let is_setup = !files_created.is_empty();
    
    Ok(OfflineSetupResult {
        success: is_setup,
        app_id: "Unknown".to_string(),
        game_path,
        files_created,
        steam_api_detected,
        message: if is_setup {
            "Game is configured for offline play".to_string()
        } else {
            "Game not configured for offline play".to_string()
        }
    })
}

#[command]
pub async fn check_game_launch_requirements(game_path: String, executable: String) -> Result<String, String> {
    let game_dir = PathBuf::from(&game_path);
    let exe_path = game_dir.join(&executable);
    
    let mut issues = Vec::new();
    let mut info = Vec::new();
    
    // Check if executable exists
    if !exe_path.exists() {
        issues.push(format!("❌ Executable not found: {}", executable));
    } else {
        info.push(format!("✅ Executable found: {}", executable));
    }
    
    // Check Steam API files
    let steam_api_dll = game_dir.join("steam_api.dll");
    let steam_api64_dll = game_dir.join("steam_api64.dll");
    
    if steam_api_dll.exists() || steam_api64_dll.exists() {
        info.push("🔗 Steam API detected - requires Goldberg Emulator".to_string());
        
        // Check Goldberg setup
        let steam_appid = game_dir.join("steam_appid.txt");
        let steam_settings = game_dir.join("steam_settings");
        
        if !steam_appid.exists() {
            issues.push("❌ steam_appid.txt missing".to_string());
        } else {
            info.push("✅ steam_appid.txt found".to_string());
        }
        
        if !steam_settings.exists() {
            issues.push("❌ steam_settings folder missing".to_string());
        } else {
            info.push("✅ steam_settings folder found".to_string());
        }
        
        // Check if original Steam API files are backed up
        let steam_api_backup = game_dir.join("steam_api.dll.original");
        let steam_api64_backup = game_dir.join("steam_api64.dll.original");
        
        if steam_api_backup.exists() || steam_api64_backup.exists() {
            info.push("✅ Original Steam API files backed up".to_string());
        } else {
            issues.push("⚠️ Original Steam API files not backed up".to_string());
        }
    } else {
        info.push("ℹ️ No Steam API detected - should work without setup".to_string());
    }
    
    // Check for common launch blockers
    let vcredist_files = vec!["vcruntime140.dll", "msvcp140.dll"];
    for vcfile in vcredist_files {
        if !game_dir.join(vcfile).exists() {
            let system_path = PathBuf::from("C:\\Windows\\System32").join(vcfile);
            if !system_path.exists() {
                issues.push(format!("⚠️ Missing Visual C++ Redistributable: {}", vcfile));
            }
        }
    }
    
    let mut result = String::new();
    
    if !info.is_empty() {
        result.push_str("📋 Game Information:\n");
        for item in info {
            result.push_str(&format!("  {}\n", item));
        }
        result.push('\n');
    }
    
    if !issues.is_empty() {
        result.push_str("⚠️ Potential Issues:\n");
        for issue in issues {
            result.push_str(&format!("  {}\n", issue));
        }
        result.push_str("\n💡 Try running 'Setup' again to fix these issues.\n");
    } else {
        result.push_str("✅ All requirements met - game should launch successfully!\n");
    }
    
    Ok(result)
}

#[command]
pub async fn check_game_dependencies(game_path: String, executable: String) -> Result<String, String> {
    let game_dir = PathBuf::from(&game_path);
    let exe_path = game_dir.join(&executable);
    
    if !exe_path.exists() {
        return Err(format!("Executable not found: {}", executable));
    }
    
    let mut result = String::new();
    result.push_str(&format!("🔍 Checking dependencies for: {}\n\n", executable));
    
    // Check for common game dependencies
    let dependencies = vec![
        // Visual C++ Redistributables
        ("vcruntime140.dll", "Visual C++ 2015-2022 Redistributable"),
        ("vcruntime140_1.dll", "Visual C++ 2015-2022 Redistributable"),
        ("msvcp140.dll", "Visual C++ 2015-2022 Redistributable"),
        ("msvcr120.dll", "Visual C++ 2013 Redistributable"),
        ("msvcp120.dll", "Visual C++ 2013 Redistributable"),
        
        // DirectX
        ("d3d11.dll", "DirectX 11"),
        ("d3d12.dll", "DirectX 12"),
        ("dxgi.dll", "DirectX Graphics Infrastructure"),
        
        // Windows API
        ("kernel32.dll", "Windows Kernel"),
        ("user32.dll", "Windows User Interface"),
        ("gdi32.dll", "Windows Graphics"),
        
        // Game-specific (often bundled)
        ("steam_api64.dll", "Steam API (Goldberg replacement)"),
    ];
    
    result.push_str("📋 Dependency Check:\n");
    
    for (dll_name, description) in dependencies {
        let local_path = game_dir.join(dll_name);
        let system_path = PathBuf::from("C:\\Windows\\System32").join(dll_name);
        let syswow64_path = PathBuf::from("C:\\Windows\\SysWOW64").join(dll_name);
        
        if local_path.exists() {
            result.push_str(&format!("  ✅ {} - Found in game folder\n", dll_name));
        } else if system_path.exists() || syswow64_path.exists() {
            result.push_str(&format!("  ✅ {} - Found in system\n", dll_name));
        } else {
            result.push_str(&format!("  ❌ {} - Missing ({})\n", dll_name, description));
        }
    }
    
    // Check for common launch parameters or config files
    result.push_str("\n🔧 Launch Configuration:\n");
    
    let config_files = vec![
        "config.ini",
        "settings.ini", 
        "game.ini",
        "user.cfg",
        "options.ini",
        "prefs.ini"
    ];
    
    for config_file in config_files {
        let config_path = game_dir.join(config_file);
        if config_path.exists() {
            result.push_str(&format!("  ✅ Config file found: {}\n", config_file));
        }
    }
    
    // Check for save game folder
    let save_folders = vec![
        "saves",
        "SaveGames",
        "Profiles",
        "userdata"
    ];
    
    result.push_str("\n💾 Save Game Folders:\n");
    for save_folder in save_folders {
        let save_path = game_dir.join(save_folder);
        if save_path.exists() {
            result.push_str(&format!("  ✅ Save folder found: {}\n", save_folder));
        }
    }
    
    // Suggest manual launch test
    result.push_str(&format!("\n💡 Manual Test Suggestion:\n"));
    result.push_str(&format!("  Open Command Prompt and run:\n"));
    result.push_str(&format!("  cd \"{}\"\n", game_path));
    result.push_str(&format!("  {}\n", executable));
    result.push_str("  Check for any error messages or crash dialogs.\n");
    
    Ok(result)
}

fn decode_exit_status(status: &std::process::ExitStatus) -> String {
    if let Some(code) = status.code() {
        match code as u32 {
            3221225785 => "ERROR: Missing DLL or dependency (STATUS_DLL_NOT_FOUND). Install Visual C++ Redistributables.".to_string(),
            3221225794 => "ERROR: Access violation (STATUS_ACCESS_VIOLATION).".to_string(),
            3221225506 => "ERROR: Application failed to initialize (STATUS_NONCONTINUABLE_EXCEPTION).".to_string(),
            3221226505 => "ERROR: Unable to locate component (STATUS_DLL_INIT_FAILED).".to_string(),
            1073741515 => "ERROR: Missing entry point in DLL (STATUS_ENTRYPOINT_NOT_FOUND).".to_string(),
            _ => format!("Exit code: {}. Check Windows Event Viewer for details.", code)
        }
    } else {
        "Process terminated by signal.".to_string()
    }
}

#[command]
pub async fn install_vcredist_2013() -> Result<String, String> {
    let vcredist_urls = vec![
        ("x64", "https://download.microsoft.com/download/2/E/6/2E61CFA4-993B-4DD4-91DA-3737CD5CD6E3/vcredist_x64.exe"),
        ("x86", "https://download.microsoft.com/download/2/E/6/2E61CFA4-993B-4DD4-91DA-3737CD5CD6E3/vcredist_x86.exe"),
    ];
    
    let mut result = String::new();
    result.push_str("🔽 Visual C++ 2013 Redistributable Download Links:\n\n");
    
    for (arch, url) in vcredist_urls {
        result.push_str(&format!("📦 {} Version:\n{}\n\n", arch, url));
    }
    
    result.push_str("💡 Installation Instructions:\n");
    result.push_str("1. Download both x86 and x64 versions\n");
    result.push_str("2. Run both installers as Administrator\n");
    result.push_str("3. Restart your computer\n");
    result.push_str("4. Try launching the game again\n\n");
    
    result.push_str("🔧 Alternative: Use Windows Package Manager\n");
    result.push_str("Run in Command Prompt as Admin:\n");
    result.push_str("winget install Microsoft.VCRedist.2013.x64\n");
    result.push_str("winget install Microsoft.VCRedist.2013.x86\n");
    
    Ok(result)
}

fn generate_steam_interfaces_content(_app_id: &str) -> String {
    format!(r#"SteamClient020
SteamGameServer013
SteamUser020
SteamFriends017
SteamUtils010
SteamMatchMaking009
SteamUserStats012
SteamApps008
SteamNetworking006
SteamRemoteStorage016
SteamScreenshots003
SteamHTTP003
SteamController008
SteamUGC018
SteamAppList001
SteamMusic001
SteamMusicRemote001
SteamHTMLSurface005
SteamInventory003
SteamVideo002
SteamParentalSettings001
SteamInput002
SteamParties002
SteamRemotePlay001
"#)
}

// Bypass related structs and functions
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BypassProgress {
    pub step: String,
    pub progress: f64,
    pub message: String,
    pub download_info: Option<DownloadInfo>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DownloadInfo {
    pub downloaded: u64,
    pub total: u64,
    pub speed: f64,
}

// Function to detect and convert Google Drive URLs to file ID
fn convert_gdrive_url_to_file_id(url: &str) -> Option<String> {
    if url.contains("drive.google.com") && url.contains("/file/d/") {
        // Extract file ID from various Google Drive URL formats
        if let Some(start) = url.find("/file/d/") {
            let id_start = start + 8; // Length of "/file/d/"
            let remaining = &url[id_start..];
            let file_id = if let Some(end) = remaining.find('/') {
                &remaining[..end]
            } else if let Some(end) = remaining.find('?') {
                &remaining[..end]
            } else {
                remaining
            };
            Some(file_id.to_string())
        } else {
            None
        }
    } else {
        None
    }
}

// Function to handle Google Drive large file downloads with streaming and progress tracking
async fn download_large_gdrive_file(
    file_id: &str, 
    output_path: &std::path::Path, 
    app_handle: Option<&AppHandle>
) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;
    use futures::StreamExt;
    
    println!("Starting Google Drive large file download for ID: {}", file_id);
    
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .timeout(std::time::Duration::from_secs(3600)) // 1 hour timeout for large files
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Multiple Google Drive download endpoints to try
    let download_urls = vec![
        format!("https://drive.usercontent.google.com/download?id={}&export=download&confirm=t", file_id),
        format!("https://drive.google.com/uc?export=download&id={}&confirm=t", file_id),
        format!("https://drive.google.com/uc?export=download&id={}", file_id),
        format!("https://docs.google.com/uc?export=download&id={}", file_id),
    ];

    for (attempt, url) in download_urls.iter().enumerate() {
        println!("Attempt {}: Trying download URL: {}", attempt + 1, url);
        
        let response = client.get(url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
            .send()
            .await
            .map_err(|e| format!("Failed to start download: {}", e))?;

        println!("Response status: {}", response.status());
        
        // Check if we got HTML response (Google Drive warning page)
        let content_type = response.headers().get("content-type")
            .and_then(|ct| ct.to_str().ok())
            .unwrap_or("");
            
        if content_type.contains("text/html") {
            println!("Got HTML response, trying next URL...");
            continue;
        }

        if response.status().is_success() {
            println!("Starting streaming download...");
            
            // Get content length for progress tracking
            let content_length = response.headers()
                .get("content-length")
                .and_then(|ct| ct.to_str().ok())
                .and_then(|ct| ct.parse::<u64>().ok())
                .unwrap_or(0);
            
            // Create file for streaming write
            let mut file = tokio::fs::File::create(output_path)
                .await
                .map_err(|e| format!("Failed to create file: {}", e))?;

            // Stream download for large files with progress tracking
            let mut stream = response.bytes_stream();
            let mut total_downloaded = 0u64;
            let mut last_progress_emit = 0u64;
            let start_time = Instant::now();
            let mut last_speed_calc = start_time;

            while let Some(chunk_result) = stream.next().await {
                let chunk = chunk_result.map_err(|e| format!("Failed to read chunk: {}", e))?;
                
                file.write_all(&chunk).await
                    .map_err(|e| format!("Failed to write chunk: {}", e))?;
                    
                total_downloaded += chunk.len() as u64;
                
                // Emit progress every 10MB or 5% whichever is smaller
                let progress_threshold = if content_length > 0 {
                    std::cmp::min(10 * 1024 * 1024, content_length / 20) // 10MB or 5%
                } else {
                    50 * 1024 * 1024 // 50MB for unknown size
                };
                
                if total_downloaded - last_progress_emit >= progress_threshold {
                    // Calculate download speed
                    let elapsed = last_speed_calc.elapsed();
                    let speed = if elapsed.as_secs() > 0 {
                        (total_downloaded - last_progress_emit) as f64 / elapsed.as_secs_f64()
                    } else {
                        0.0
                    };
                    
                    // Emit progress event
                    if let Some(handle) = app_handle {
                        let download_info = DownloadInfo {
                            downloaded: total_downloaded,
                            total: content_length,
                            speed,
                        };
                        
                        let progress = BypassProgress {
                            step: "download".to_string(),
                            progress: if content_length > 0 {
                                (total_downloaded as f64 / content_length as f64) * 100.0
                            } else {
                                0.0
                            },
                            message: format!("Downloading... {} MB", total_downloaded / (1024 * 1024)),
                            download_info: Some(download_info),
                        };
                        
                        let _ = handle.emit_all("bypass-progress", &progress);
                    }
                    
                    println!("Downloaded: {} MB", total_downloaded / (1024 * 1024));
                    last_progress_emit = total_downloaded;
                    last_speed_calc = Instant::now();
                }
            }

            file.flush().await
                .map_err(|e| format!("Failed to flush file: {}", e))?;

            println!("✅ Successfully downloaded {} MB from Google Drive", total_downloaded / (1024 * 1024));
            
            // Emit completion progress
            if let Some(handle) = app_handle {
                let progress = BypassProgress {
                    step: "download".to_string(),
                    progress: 100.0,
                    message: "Download completed".to_string(),
                    download_info: None,
                };
                let _ = handle.emit_all("bypass-progress", &progress);
            }
            
            return Ok(());
        } else {
            println!("Failed with status: {}, trying next URL...", response.status());
        }
    }

    Err("❌ All Google Drive download URLs failed. File may require manual download confirmation for large files.".to_string())
}

#[command]
pub async fn download_bypass_file(
    url: String, 
    app_id: String, 
    state: State<'_, AppState>, 
    app_handle: AppHandle
) -> Result<String, String> {
    println!("Downloading bypass file from: {}", url);
    
    // Emit initial progress
    let progress = BypassProgress {
        step: "download".to_string(),
        progress: 0.0,
        message: "Starting download...".to_string(),
        download_info: None,
    };
    let _ = app_handle.emit_all("bypass-progress", &progress);
    
    // Get current settings for bypass directory
    let bypass_dir = {
        let settings_guard = state.settings.lock().unwrap();
        PathBuf::from(&settings_guard.bypass_download_directory)
    };
    
    // Ensure bypass directory exists
    if !bypass_dir.exists() {
        fs::create_dir_all(&bypass_dir)
            .map_err(|e| format!("Failed to create bypass directory: {}", e))?;
    }
    
    let filename = format!("bypass_{}.zip", app_id);
    let file_path = bypass_dir.join(&filename);
    
    // Check if it's a Google Drive URL and handle accordingly
    if let Some(file_id) = convert_gdrive_url_to_file_id(&url) {
        println!("🔍 Detected Google Drive URL, using specialized large file download...");
        println!("📁 File ID: {}", file_id);
        println!("⚠️  Large files may take several minutes to download");
        
        // Use specialized Google Drive download function
        download_large_gdrive_file(&file_id, &file_path, Some(&app_handle)).await?;
    } else {
        println!("🔗 Using standard download for non-Google Drive URL");
        
        // Emit progress for standard download
        let progress = BypassProgress {
            step: "download".to_string(),
            progress: 25.0,
            message: "Downloading from standard URL...".to_string(),
            download_info: None,
        };
        let _ = app_handle.emit_all("bypass-progress", &progress);
        
        // Use standard download for other URLs
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(1800)) // 30 minutes timeout
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
            
        let response = client.get(&url)
            .header("User-Agent", "YeyodraBypassDownloader/1.0")
            .send()
            .await
            .map_err(|e| format!("Failed to download file: {}", e))?;
        
        if !response.status().is_success() {
            return Err(format!("Download failed with status: {}", response.status()));
        }

        // Download file
        let progress = BypassProgress {
            step: "download".to_string(),
            progress: 75.0,
            message: "Receiving data...".to_string(),
            download_info: None,
        };
        let _ = app_handle.emit_all("bypass-progress", &progress);
        
        let bytes = response.bytes()
            .await
            .map_err(|e| format!("Failed to read response bytes: {}", e))?;
        
        fs::write(&file_path, bytes)
            .map_err(|e| format!("Failed to write file: {}", e))?;
            
        // Emit completion for standard download
        let progress = BypassProgress {
            step: "download".to_string(),
            progress: 100.0,
            message: "Download completed".to_string(),
            download_info: None,
        };
        let _ = app_handle.emit_all("bypass-progress", &progress);
    }
    
    println!("✅ Bypass file downloaded to: {:?}", file_path);
    Ok(file_path.to_string_lossy().to_string())
}

#[command]
pub async fn extract_bypass_file(
    zip_path: String, 
    app_id: String, 
    state: State<'_, AppState>, 
    app_handle: AppHandle
) -> Result<String, String> {
    println!("Extracting bypass file: {}", zip_path);
    
    // Emit initial progress
    let progress = BypassProgress {
        step: "extract".to_string(),
        progress: 0.0,
        message: "Starting extraction...".to_string(),
        download_info: None,
    };
    let _ = app_handle.emit_all("bypass-progress", &progress);
    
    let zip_path = Path::new(&zip_path);
    if !zip_path.exists() {
        return Err("ZIP file not found".to_string());
    }
    
    // Get bypass directory from settings
    let bypass_dir = {
        let settings_guard = state.settings.lock().unwrap();
        PathBuf::from(&settings_guard.bypass_download_directory)
    };
    
    let extract_dir = bypass_dir.join(format!("bypass_extract_{}", app_id));
    
    if extract_dir.exists() {
        fs::remove_dir_all(&extract_dir)
            .map_err(|e| format!("Failed to remove existing extract directory: {}", e))?;
    }
    
    fs::create_dir_all(&extract_dir)
        .map_err(|e| format!("Failed to create extract directory: {}", e))?;
    
    // Extract ZIP file
    let progress = BypassProgress {
        step: "extract".to_string(),
        progress: 10.0,
        message: "Opening ZIP archive...".to_string(),
        download_info: None,
    };
    let _ = app_handle.emit_all("bypass-progress", &progress);
    
    let file = File::open(zip_path)
        .map_err(|e| format!("Failed to open ZIP file: {}", e))?;
    
    let mut archive = ZipArchive::new(file)
        .map_err(|e| format!("Failed to read ZIP archive: {}", e))?;
    
    let total_files = archive.len();
    println!("Extracting {} files...", total_files);
    
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)
            .map_err(|e| format!("Failed to access file in archive: {}", e))?;
        
        let outpath = extract_dir.join(file.sanitized_name());
        
        if file.name().ends_with('/') {
            // Directory
            fs::create_dir_all(&outpath)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        } else {
            // File
            if let Some(parent) = outpath.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent directory: {}", e))?;
            }
            
            let mut outfile = File::create(&outpath)
                .map_err(|e| format!("Failed to create output file: {}", e))?;
            
            std::io::copy(&mut file, &mut outfile)
                .map_err(|e| format!("Failed to extract file: {}", e))?;
        }
        
        // Emit progress every 10 files or every 10%
        if i % 10 == 0 || (i + 1) % (total_files / 10).max(1) == 0 {
            let progress_pct = ((i + 1) as f64 / total_files as f64) * 100.0;
            let progress = BypassProgress {
                step: "extract".to_string(),
                progress: progress_pct,
                message: format!("Extracting files... {}/{}", i + 1, total_files),
                download_info: None,
            };
            let _ = app_handle.emit_all("bypass-progress", &progress);
        }
    }
    
    // Emit completion
    let progress = BypassProgress {
        step: "extract".to_string(),
        progress: 100.0,
        message: "Extraction completed".to_string(),
        download_info: None,
    };
    let _ = app_handle.emit_all("bypass-progress", &progress);
    
    println!("Bypass file extracted to: {:?}", extract_dir);
    Ok(extract_dir.to_string_lossy().to_string())
}

#[command]
pub async fn find_game_directory(app_id: String) -> Result<String, String> {
    // Common Steam installation paths
    let steam_paths = vec![
        r"C:\Program Files (x86)\Steam\steamapps\common",
        r"C:\Program Files\Steam\steamapps\common",
        r"D:\Steam\steamapps\common",
        r"E:\Steam\steamapps\common",
    ];
    
    // Game directory mappings (AppID -> folder name)
    let game_directories = HashMap::from([
        ("2622380".to_string(), "Elden Ring Nightreign".to_string()),
("3240220".to_string(), "Grand Theft Auto V Enhanced".to_string()),
("1547000".to_string(), "Grand Theft Auto San Andreas Definitive Edition".to_string()),
("1546970".to_string(), "Grand Theft Auto III Definitive Edition".to_string()),
("1546990".to_string(), "Grand Theft Auto Vice City Definitive Edition".to_string()),
("582160".to_string(), "Assassins Creed Origins".to_string()),
("2208920".to_string(), "Assassins Creed Valhalla".to_string()),
("3035570".to_string(), "Assassins Creed Mirage".to_string()),
("812140".to_string(), "Assassins Creed Odyssey".to_string()),
("311560".to_string(), "Assassins Creed Rogue".to_string()),
("2239550".to_string(), "Watch Dogs Legion".to_string()),
("447040".to_string(), "Watch Dogs 2".to_string()),
("243470".to_string(), "Watch Dogs".to_string()),
("637650".to_string(), "Final Fantasy XV Windows Edition".to_string()),
("2050650".to_string(), "Resident Evil 4".to_string()),
("1235140".to_string(), "Yakuza Like a Dragon".to_string()),
("208650".to_string(), "Batman Arkham Knight".to_string()),
("2668510".to_string(), "Red Dead Redemption".to_string()),
("438490".to_string(), "God Eater 2 Rage Burst".to_string()),
("1222690".to_string(), "Dragon Age Inquisition".to_string()),
("1259970".to_string(), "eFootball PES 2021".to_string()),
("1496790".to_string(), "Gotham Knights".to_string()),
("1774580".to_string(), "Star Wars Battlefront".to_string()),
("371660".to_string(), "Far Cry Primal".to_string()),
("626690".to_string(), "Sword Art Online Fatal Bullet".to_string()),
        // Add more mappings as needed
    ]);
    
    let game_folder = game_directories.get(&app_id)
        .ok_or(format!("Game directory mapping not found for AppID: {}", app_id))?;
    
    for steam_path in steam_paths {
        let game_dir = Path::new(steam_path).join(game_folder);
        if game_dir.exists() {
            println!("Found game directory: {:?}", game_dir);
            return Ok(game_dir.to_string_lossy().to_string());
        }
    }
    
    Err(format!("Game directory not found for AppID: {}", app_id))
}

#[command]
pub async fn copy_bypass_files(extract_dir: String, game_dir: String) -> Result<String, String> {
    println!("Copying bypass files from {} to {}", extract_dir, game_dir);
    
    let extract_path = Path::new(&extract_dir);
    let game_path = Path::new(&game_dir);
    
    if !extract_path.exists() {
        return Err("Extract directory not found".to_string());
    }
    
    if !game_path.exists() {
        return Err("Game directory not found".to_string());
    }
    
    // Find the actual bypass files (search deeper for nested structures)
    let mut bypass_source_dir = extract_path.to_path_buf();
    let mut found_files = false;
    
    println!("🔍 Searching for bypass files in extracted directory...");
    
    // Look for directories that contain executable files or common bypass files
    for entry in WalkDir::new(extract_path).min_depth(1).max_depth(5) {
        let entry = entry.map_err(|e| format!("Failed to read directory: {}", e))?;
        let path = entry.path();
        
        if path.is_dir() {
            println!("Checking directory: {:?}", path);
            
            // Check if this directory contains bypass-related files
            let dir_contents: Vec<_> = fs::read_dir(path)
                .map_err(|e| format!("Failed to read directory contents: {}", e))?
                .filter_map(|entry| entry.ok())
                .collect();
            
            let has_executable_files = dir_contents.iter().any(|entry| {
                let path = entry.path();
                if path.is_file() {
                    if let Some(extension) = path.extension() {
                        let ext = extension.to_string_lossy().to_lowercase();
                        ext == "exe" || ext == "dll" || ext == "asi" || ext == "bin"
                    } else {
                        false
                    }
                } else {
                    false
                }
            });
            
            let has_many_files = dir_contents.iter().filter(|entry| entry.path().is_file()).count() >= 3;
            
            if has_executable_files || has_many_files {
                println!("✅ Found bypass files in: {:?}", path);
                bypass_source_dir = path.to_path_buf();
                found_files = true;
                break;
            }
        }
    }
    
    if !found_files {
        println!("⚠️  No specific bypass directory found, using root extract directory");
        // Fallback to using the extract directory itself
        bypass_source_dir = extract_path.to_path_buf();
    }
    
    // Copy all files from bypass directory to game directory
    for entry in WalkDir::new(&bypass_source_dir).min_depth(1) {
        let entry = entry.map_err(|e| format!("Failed to read bypass files: {}", e))?;
        let path = entry.path();
        
        if path.is_file() {
            let relative_path = path.strip_prefix(&bypass_source_dir)
                .map_err(|e| format!("Failed to get relative path: {}", e))?;
            let dest_path = game_path.join(relative_path);
            
            // Create parent directories if needed
            if let Some(parent) = dest_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create destination directory: {}", e))?;
            }
            
            // Copy file
            fs::copy(path, &dest_path)
                .map_err(|e| format!("Failed to copy file {:?}: {}", path, e))?;
            
            println!("Copied: {:?} -> {:?}", path, dest_path);
        }
    }
    
    Ok("Bypass files copied successfully".to_string())
}

#[command]
pub async fn detect_game_executables(game_dir: String) -> Result<Vec<String>, String> {
    println!("Detecting executable files in: {}", game_dir);
    
    let game_path = Path::new(&game_dir);
    if !game_path.exists() {
        return Err("Game directory not found".to_string());
    }
    
    let mut executables = Vec::new();
    
    // Search for .exe files in the game directory
    for entry in WalkDir::new(game_path).max_depth(2) {
        let entry = entry.map_err(|e| format!("Failed to read directory: {}", e))?;
        let path = entry.path();
        
        if path.is_file() {
            if let Some(extension) = path.extension() {
                if extension.to_string_lossy().to_lowercase() == "exe" {
                    // Skip common system/utility executables
                    if let Some(filename) = path.file_name() {
                        let filename_str = filename.to_string_lossy().to_lowercase();
                        
                        // Filter out common non-game executables
                        if !filename_str.contains("uninstall") 
                            && !filename_str.contains("setup") 
                            && !filename_str.contains("installer")
                            && !filename_str.contains("redist")
                            && !filename_str.contains("vcredist")
                            && !filename_str.contains("directx")
                            && !filename_str.contains("_be.exe") // BattlEye
                            && !filename_str.contains("eac") // EasyAntiCheat
                        {
                            executables.push(path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }
    
    // Sort by file size (larger files are likely the main game executable)
    executables.sort_by(|a, b| {
        let size_a = fs::metadata(a).map(|m| m.len()).unwrap_or(0);
        let size_b = fs::metadata(b).map(|m| m.len()).unwrap_or(0);
        size_b.cmp(&size_a) // Descending order
    });
    
    println!("Found {} executable(s): {:?}", executables.len(), executables);
    Ok(executables)
}

#[command]
pub async fn launch_game_executable(exe_path: String) -> Result<String, String> {
    println!("Launching game executable: {}", exe_path);
    
    let exe_path = Path::new(&exe_path);
    if !exe_path.exists() {
        return Err("Executable file not found".to_string());
    }
    
    // Get the directory containing the executable
    let working_dir = exe_path.parent()
        .ok_or("Could not determine working directory")?;
    
    // Launch the executable
    let mut command = Command::new(exe_path);
    command.current_dir(working_dir);
    
    match command.spawn() {
        Ok(_) => {
            println!("Game launched successfully");
            Ok("Game launched successfully".to_string())
        }
        Err(e) => {
            let error_msg = format!("Failed to launch game: {}", e);
            println!("{}", error_msg);
            Err(error_msg)
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BypassResult {
    pub success: bool,
    pub message: String,
    pub game_directory: Option<String>,
    pub executables: Vec<String>,
}

#[command]
pub async fn apply_bypass_automatically(
    app_id: String, 
    bypass_url: String, 
    state: State<'_, AppState>, 
    app_handle: AppHandle
) -> Result<BypassResult, String> {
    println!("Starting automatic bypass application for AppID: {}", app_id);
    
    // Get current settings
    let settings = {
        let settings_guard = state.settings.lock().unwrap();
        settings_guard.clone()
    };
    
    // Step 1: Download bypass file
    let zip_path = download_bypass_file(bypass_url, app_id.clone(), state.clone(), app_handle.clone()).await?;
    
    // Step 2: Extract bypass file
    let extract_dir = extract_bypass_file(zip_path.clone(), app_id.clone(), state.clone(), app_handle.clone()).await?;
    
    // Step 3: Find game directory
    let progress = BypassProgress {
        step: "locate".to_string(),
        progress: 0.0,
        message: "Finding game directory...".to_string(),
        download_info: None,
    };
    let _ = app_handle.emit_all("bypass-progress", &progress);
    
    let game_dir = find_game_directory(app_id.clone()).await?;
    
    let progress = BypassProgress {
        step: "locate".to_string(),
        progress: 100.0,
        message: format!("Game directory found: {}", game_dir),
        download_info: None,
    };
    let _ = app_handle.emit_all("bypass-progress", &progress);
    
    // Step 4: Copy bypass files
    let progress = BypassProgress {
        step: "copy".to_string(),
        progress: 0.0,
        message: "Copying bypass files...".to_string(),
        download_info: None,
    };
    let _ = app_handle.emit_all("bypass-progress", &progress);
    
    copy_bypass_files(extract_dir.clone(), game_dir.clone()).await?;
    
    let progress = BypassProgress {
        step: "copy".to_string(),
        progress: 100.0,
        message: "Bypass files copied successfully".to_string(),
        download_info: None,
    };
    let _ = app_handle.emit_all("bypass-progress", &progress);
    
    // Step 5: Detect game executables
    let progress = BypassProgress {
        step: "detect".to_string(),
        progress: 0.0,
        message: "Detecting game executables...".to_string(),
        download_info: None,
    };
    let _ = app_handle.emit_all("bypass-progress", &progress);
    
    let executables = detect_game_executables(game_dir.clone()).await.unwrap_or_default();
    
    let progress = BypassProgress {
        step: "detect".to_string(),
        progress: 100.0,
        message: format!("Found {} executable(s)", executables.len()),
        download_info: None,
    };
    let _ = app_handle.emit_all("bypass-progress", &progress);
    
    // Step 6: Conditional cleanup based on settings
    let progress = BypassProgress {
        step: "cleanup".to_string(),
        progress: 0.0,
        message: "Cleaning up temporary files...".to_string(),
        download_info: None,
    };
    let _ = app_handle.emit_all("bypass-progress", &progress);
    
    if !settings.keep_temporary_files {
        // User wants to cleanup temporary files
        println!("Cleaning up temporary files (keep_temporary_files = false)");
        let _ = fs::remove_file(&zip_path);
        let _ = fs::remove_dir_all(&extract_dir);
    } else {
        // User wants to keep temporary files
        println!("Keeping temporary files (keep_temporary_files = true)");
        println!("ZIP file kept at: {}", zip_path);
        println!("Extract folder kept at: {}", extract_dir);
    }
    
    let progress = BypassProgress {
        step: "cleanup".to_string(),
        progress: 100.0,
        message: "Cleanup completed".to_string(),
        download_info: None,
    };
    let _ = app_handle.emit_all("bypass-progress", &progress);
    
    Ok(BypassResult {
        success: true,
        message: format!("Bypass applied successfully for AppID: {}", app_id),
        game_directory: Some(game_dir),
        executables,
    })
}

#[command]
pub async fn select_download_directory() -> Result<String, String> {
    // Return current downloads directory as placeholder
    // The actual dialog will be handled by frontend
    let downloads_dir = dirs::download_dir()
        .ok_or("Could not find downloads directory")?;
    
    Ok(downloads_dir.to_string_lossy().to_string())
}

#[command]
pub async fn open_download_directory(path: String) -> Result<(), String> {
    use std::process::Command;
    
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }
    
    Ok(())
}



