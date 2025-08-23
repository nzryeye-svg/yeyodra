use crate::models::{GameInfo, SearchResults, SteamAppListResponse, SteamAppListEntry};
use std::sync::RwLock;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use anyhow::Result;
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
struct CachedAppList {
    timestamp: u64,
    apps: Vec<SteamAppListEntry>,
}

pub struct GameDatabase {
    apps: RwLock<Vec<SteamAppListEntry>>,
    is_loaded: RwLock<bool>,
    cache_path: PathBuf,
}

impl GameDatabase {
    pub fn new() -> Self {
        let cache_path = Self::get_cache_path().expect("Failed to determine cache directory");
        
        // Ensure cache directory exists
        if let Some(parent) = cache_path.parent() {
            fs::create_dir_all(parent).expect("Failed to create cache directory");
        }

        Self {
            apps: RwLock::new(Vec::new()),
            is_loaded: RwLock::new(false),
            cache_path,
        }
    }

    fn get_cache_path() -> Result<PathBuf> {
        let mut path = dirs::data_dir().ok_or_else(|| anyhow::anyhow!("Failed to get data directory"))?;
        path.push("yeyodra");
        path.push("cache");
        path.push("applist.json");
        Ok(path)
    }

    pub fn is_loaded(&self) -> bool {
        *self.is_loaded.read().unwrap()
    }

    fn load_from_cache(&self) -> Result<Vec<SteamAppListEntry>> {
        let mut file = File::open(&self.cache_path)?;
        let mut contents = String::new();
        file.read_to_string(&mut contents)?;
        
        let cached_data: CachedAppList = serde_json::from_str(&contents)?;

        let now = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
        let cache_age = Duration::from_secs(now - cached_data.timestamp);

        // Cache is valid for 1 day
        if cache_age < Duration::from_secs(24 * 60 * 60) {
            println!("Loaded {} games from cache.", cached_data.apps.len());
            Ok(cached_data.apps)
        } else {
            println!("Cache is outdated. Fetching new list from Steam API.");
            Err(anyhow::anyhow!("Cache expired"))
        }
    }

    fn save_to_cache(&self, apps: &[SteamAppListEntry]) -> Result<()> {
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
        let cached_data = CachedAppList {
            timestamp,
            apps: apps.to_vec(),
        };
        let contents = serde_json::to_string(&cached_data)?;
        let mut file = File::create(&self.cache_path)?;
        file.write_all(contents.as_bytes())?;
        Ok(())
    }

    pub async fn load_or_refresh(&self) -> Result<(), String> {
        if self.is_loaded() {
            return Ok(());
        }

        // Try to load from cache first
        if let Ok(apps_from_cache) = self.load_from_cache() {
            let mut apps = self.apps.write().unwrap();
            *apps = apps_from_cache;
            let mut is_loaded = self.is_loaded.write().unwrap();
            *is_loaded = true;
            return Ok(());
        }

        // If cache fails or is expired, fetch from API
        println!("Fetching app list from Steam API...");
        let client = reqwest::Client::new();
        let url = "https://api.steampowered.com/ISteamApps/GetAppList/v2/";
        
        match client.get(url).send().await {
            Ok(response) => {
                if !response.status().is_success() {
                    return Err(format!("Steam API returned error: {}", response.status()));
                }
                
                match response.json::<SteamAppListResponse>().await {
                    Ok(app_list) => {
                        let mut apps = self.apps.write().unwrap();
                        *apps = app_list.applist.apps;
                        
                        if let Err(e) = self.save_to_cache(&apps) {
                            eprintln!("Failed to save game list to cache: {}", e);
                        }
                        
                        let mut is_loaded = self.is_loaded.write().unwrap();
                        *is_loaded = true;
                        
                        println!("Loaded {} games from Steam API", apps.len());
                        Ok(())
                    },
                    Err(e) => Err(format!("Failed to parse Steam API response: {}", e)),
                }
            },
            Err(e) => Err(format!("Failed to connect to Steam API: {}", e)),
        }
    }

    pub fn search(&self, query: &str, page: usize, per_page: usize) -> SearchResults {
        let apps = self.apps.read().unwrap();
        
        if query.trim().is_empty() {
            return SearchResults {
                games: Vec::new(),
                total: 0,
                page: 1,
                total_pages: 1,
                query: String::new(),
            };
        }
        
        let query_lower = query.trim().to_lowercase();
        
        // Check if query is a numeric AppID
        if query_lower.chars().all(|c| c.is_ascii_digit()) && !query_lower.is_empty() {
            if let Ok(app_id_num) = query_lower.parse::<u64>() {
                if let Some(game) = apps.iter().find(|app| app.appid == app_id_num) {
                    return SearchResults {
                        games: vec![GameInfo {
                            app_id: game.appid.to_string(),
                            game_name: game.name.clone(),
                            icon_url: Some(format!("https://cdn.akamai.steamstatic.com/steam/apps/{}/header.jpg", game.appid)),
                        }],
                        total: 1,
                        page: 1,
                        total_pages: 1,
                        query: query.to_string(),
                    };
                }
            }
        }
        
        // Perform name-based search
        let matching_apps: Vec<_> = apps.iter()
            .filter(|app| {
                let app_name_lower = app.name.to_lowercase();
                app_name_lower.contains(&query_lower)
            })
            .cloned()
            .collect();
        
        let total = matching_apps.len();
        let total_pages = (total as f64 / per_page as f64).ceil() as usize;
        let current_page = page.max(1).min(total_pages.max(1));
        
        // Get the slice for current page
        let start = (current_page - 1) * per_page;
        let end = (start + per_page).min(total);
        
        let page_items: Vec<GameInfo> = if start <= end && start < total {
            matching_apps[start..end]
                .iter()
                .map(|app| GameInfo {
                    app_id: app.appid.to_string(),
                    game_name: app.name.clone(),
                    icon_url: Some(format!("https://cdn.akamai.steamstatic.com/steam/apps/{}/header.jpg", app.appid)),
                })
                .collect()
        } else {
            Vec::new()
        };
        
        SearchResults {
            games: page_items,
            total,
            page: current_page,
            total_pages: total_pages.max(1),
            query: query.to_string(),
        }
    }

    pub fn get_by_app_id(&self, app_id: &str) -> Option<GameInfo> {
        if let Ok(app_id_num) = app_id.parse::<u64>() {
            let apps = self.apps.read().unwrap();
            
            apps.iter()
                .find(|app| app.appid == app_id_num)
                .map(|app| GameInfo {
                    app_id: app.appid.to_string(),
                    game_name: app.name.clone(),
                    icon_url: Some(format!("https://cdn.akamai.steamstatic.com/steam/apps/{}/header.jpg", app.appid)),
                })
        } else {
            None
        }
    }
}
