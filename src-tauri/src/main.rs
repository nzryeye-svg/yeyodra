// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod models;
mod game_database;
mod library;

use commands::*;
use models::*;
use game_database::GameDatabase;
use library::*;
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
            download_game,
            get_settings,
            save_settings,
            get_batch_game_details,
            restart_steam,
            // Library management from library.rs
            check_steam_directories,
            library::get_library_games,
            library::update_game_files,
            library::remove_game,
            library::get_game_name_by_appid,
            library::get_dlcs_in_lua,
            library::sync_dlcs_in_lua
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
