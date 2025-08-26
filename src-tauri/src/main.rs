// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod models;
mod game_database;
mod library;
mod steam_api;
mod hwid;

use commands::*;
use models::*;
use game_database::GameDatabase;
use library::*;
use hwid::*;
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;

// Global game database instance
pub static GAME_DATABASE: Lazy<Arc<GameDatabase>> = Lazy::new(|| {
    Arc::new(GameDatabase::new())
});

// Application state for settings
struct AppState {
    settings: Mutex<AppSettings>,
}

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            settings: Mutex::new(AppSettings::default()),
        })
        .setup(|app| {
            let _app_handle = app.handle();
            
            // Initialize database in background
            tauri::async_runtime::spawn(async move {
                println!("Initializing game database...");
                if let Err(e) = GAME_DATABASE.load_or_refresh().await {
                    eprintln!("Failed to load game database: {}", e);
                }
                println!("Game database initialized");
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            search_games,
            get_game_details,
            clear_game_cache,
            download_game,
            get_settings,
            save_settings,
            get_batch_game_details,
            restart_steam,
            // Save Manager and Offline Setup
            detect_save_locations,
            backup_save_files,
            setup_offline_game,
            sync_saves_with_steam,
            select_directory,
            // Goldberg Emulator Integration
            check_goldberg_emulator,
            install_goldberg_emulator,
            launch_game_offline,
            detect_goldberg_download,
            copy_goldberg_to_game,
            auto_detect_games,
            auto_setup_detected_game,
            launch_game_directly,
            check_offline_setup_status,
            check_game_launch_requirements,
            list_game_executables,
            check_game_dependencies,
            install_vcredist_2013,
            // Library management from library.rs
            check_steam_directories,
            library::get_library_games,
            library::update_game_files,
            library::remove_game,
            library::get_game_name_by_appid,
            library::get_dlcs_in_lua,
            library::sync_dlcs_in_lua,
            // Bypass functions
            download_bypass_file,
            extract_bypass_file,
            find_game_directory,
            copy_bypass_files,
            apply_bypass_automatically,
            detect_game_executables,
            launch_game_executable,
            // Settings functions
            select_download_directory,
            open_download_directory,
            // HWID functions
            generate_hwid,
            check_hwid_authorization,
            get_hwid_status,
            refresh_hwid_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
