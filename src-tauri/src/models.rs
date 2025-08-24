use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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

// Steam API response structures
#[derive(Debug, Deserialize)]
pub struct SteamAppDetailsResponse {
    #[serde(flatten)]
    pub apps: HashMap<String, SteamAppData>,
}

#[derive(Debug, Deserialize)]
pub struct SteamAppData {
    pub success: bool,
    pub data: Option<SteamAppInfo>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReleaseDateInfo {
    pub coming_soon: bool,
    pub date: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SteamAppInfo {
    pub name: String,
    pub steam_appid: u64,
    pub header_image: String,
    #[serde(default)]
    pub publishers: Vec<String>,
    #[serde(default)]
    pub developers: Vec<String>,
    pub release_date: ReleaseDateInfo,
    pub short_description: String,
    #[serde(default)]
    pub about_the_game: Option<String>,
    #[serde(default)]
    pub screenshots: Vec<Screenshot>,
    #[serde(default)]
    pub drm_notice: Option<String>,
    #[serde(default)]
    pub dlc: Vec<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Screenshot {
    pub id: u64,
    pub path_thumbnail: String,
    pub path_full: String,
}
