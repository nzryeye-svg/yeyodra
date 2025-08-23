use crate::models::{SearchResults, AppSettings, RepoType};
use crate::GAME_DATABASE;
use std::collections::HashMap;
use std::path::Path;
use std::fs::{self, File};
use std::io::Write;
use std::time::Duration;
use tauri::{command, State};
use uuid::Uuid;
use walkdir::WalkDir;
use zip::ZipArchive;

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
                            process_downloaded_zip(&zip_path).map_err(|e| e.to_string())?;
                            
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

// Helper function to process downloaded ZIP files
fn process_downloaded_zip(zip_path: &Path) -> Result<(), anyhow::Error> {
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
    
    // Define target directories (Windows Steam paths)
    let steam_config_base = Path::new("C:\\Program Files (x86)\\Steam\\config");
    let stplugin_dir = steam_config_base.join("stplug-in");
    let depotcache_dir = steam_config_base.join("depotcache");
    let statsexport_dir = steam_config_base.join("StatsExport");
    
    // Try to create target directories (might fail if Steam not installed)
    let _ = fs::create_dir_all(&stplugin_dir);
    let _ = fs::create_dir_all(&depotcache_dir);
    let _ = fs::create_dir_all(&statsexport_dir);
    
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
                    if let Ok(_) = fs::copy(path, stplugin_dir.join(path.file_name().unwrap_or_default())) {
                        lua_count += 1;
                        println!("Moved LUA file to stplug-in: {}", file_name);
                    }
                } else if ext == "bin" {
                    if let Ok(_) = fs::copy(path, statsexport_dir.join(path.file_name().unwrap_or_default())) {
                        bin_count += 1;
                        println!("Moved BIN file to StatsExport: {}", file_name);
                    }
                }
            }
            
            // Check for manifest files
            if file_name.to_lowercase().contains("manifest") {
                if let Ok(_) = fs::copy(path, depotcache_dir.join(path.file_name().unwrap_or_default())) {
                    manifest_count += 1;
                    println!("Moved manifest file to depotcache: {}", file_name);
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
