use serde::{Deserialize, Serialize};

// Game information structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameInfo {
    pub app_id: String,
    pub game_name: String,
    pub icon_url: Option<String>,
}

// Search results structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResults {
    pub games: Vec<GameInfo>,
    pub total: usize,
    pub page: usize,
    pub total_pages: usize,
    pub query: String,
}

// Application settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub download_directory: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            download_directory: "downloads".to_string(),
        }
    }
}

// Repository type enum
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum RepoType {
    Branch,
    Encrypted,
    Decrypted,
}

// Steam API response structures
#[derive(Debug, Deserialize)]
pub struct SteamAppListResponse {
    pub applist: SteamAppList,
}

#[derive(Debug, Deserialize)]
pub struct SteamAppList {
    pub apps: Vec<SteamAppListEntry>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SteamAppListEntry {
    pub appid: u64,
    pub name: String,
}

// Download result type
pub type DownloadResult = Result<bool, String>;
