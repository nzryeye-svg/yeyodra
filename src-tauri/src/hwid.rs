use machine_uid;
use sha2::{Sha256, Digest};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize, Deserialize)]
pub struct HWIDResponse {
    pub hwid: String,
    pub is_authorized: bool,
    pub message: String,
    pub license_info: Option<LicenseInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseInfo {
    pub id: String,
    pub customer_name: Option<String>,
    pub license_type: String,
    pub expires_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CachedHWIDResult {
    hwid: String,
    is_authorized: bool,
    message: String,
    license_info: Option<LicenseInfo>,
    cached_at: u64, // timestamp
}

fn get_cache_file_path() -> Result<PathBuf, String> {
    let app_data = dirs::config_dir()
        .ok_or("Failed to get config directory")?;
    
    let app_dir = app_data.join("Zenith");
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create app directory: {}", e))?;
    }
    
    Ok(app_dir.join("hwid_cache.json"))
}

fn get_current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

fn is_cache_valid(cached_result: &CachedHWIDResult) -> bool {
    let current_time = get_current_timestamp();
    let cache_duration = 24 * 60 * 60; // 24 jam dalam detik
    
    // Cache valid jika belum expired dan masih authorized
    current_time - cached_result.cached_at < cache_duration && cached_result.is_authorized
}

fn save_cache(result: &HWIDResponse) -> Result<(), String> {
    let cache_file = get_cache_file_path()?;
    
    let cached_result = CachedHWIDResult {
        hwid: result.hwid.clone(),
        is_authorized: result.is_authorized,
        message: result.message.clone(),
        license_info: result.license_info.clone(),
        cached_at: get_current_timestamp(),
    };
    
    let json = serde_json::to_string_pretty(&cached_result)
        .map_err(|e| format!("Failed to serialize cache: {}", e))?;
    
    fs::write(cache_file, json)
        .map_err(|e| format!("Failed to write cache: {}", e))?;
    
    println!("Cache saved successfully");
    Ok(())
}

fn load_cache(hwid: &str) -> Option<HWIDResponse> {
    let cache_file = get_cache_file_path().ok()?;
    
    if !cache_file.exists() {
        return None;
    }
    
    let content = fs::read_to_string(cache_file).ok()?;
    let cached_result: CachedHWIDResult = serde_json::from_str(&content).ok()?;
    
    // Check jika HWID sama dan cache masih valid
    if cached_result.hwid == hwid && is_cache_valid(&cached_result) {
        println!("Using cached HWID result (valid for {} more hours)", 
                (24 * 60 * 60 - (get_current_timestamp() - cached_result.cached_at)) / 3600);
        
        Some(HWIDResponse {
            hwid: cached_result.hwid,
            is_authorized: cached_result.is_authorized,
            message: cached_result.message,
            license_info: cached_result.license_info,
        })
    } else {
        println!("Cache invalid or expired, checking online...");
        None
    }
}

/// Generate unique HWID untuk device ini
#[tauri::command]
pub async fn generate_hwid() -> Result<String, String> {
    match machine_uid::get() {
        Ok(machine_id) => {
            // Hash machine ID untuk privacy
            let mut hasher = Sha256::new();
            hasher.update(machine_id.as_bytes());
            let result = hasher.finalize();
            let hwid = hex::encode(result)[..16].to_string(); // Ambil 16 karakter pertama
            Ok(hwid.to_uppercase())
        },
        Err(e) => Err(format!("Failed to generate HWID: {}", e))
    }
}

/// Check HWID authorization dengan Vercel API
#[tauri::command] 
pub async fn check_hwid_authorization(hwid: String) -> Result<HWIDResponse, String> {
    let client = reqwest::Client::new();
    
    println!("Checking HWID authorization for: {}", hwid);
    
    let response = client
        .post("https://admin-c35u.vercel.app/api/auth/check-hwid")
        .json(&serde_json::json!({
            "hwid": hwid
        }))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if response.status().is_success() {
        let hwid_response: HWIDResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        
        println!("HWID check result: {:?}", hwid_response);
        Ok(hwid_response)
    } else {
        println!("HWID check failed with status: {}", response.status());
        Ok(HWIDResponse {
            hwid,
            is_authorized: false,
            message: "HWID not authorized. Please contact admin.".to_string(),
            license_info: None,
        })
    }
}

/// Get current HWID and check authorization in one call
#[tauri::command]
pub async fn get_hwid_status() -> Result<HWIDResponse, String> {
    let hwid = generate_hwid().await?;
    
    // Cek cache dulu HANYA untuk authorized
    if let Some(cached_result) = load_cache(&hwid) {
        if cached_result.is_authorized {
            return Ok(cached_result);
        }
    }
    
    // Selalu check online jika tidak authorized atau tidak ada cache
    let result = check_hwid_authorization(hwid).await?;
    
    // Save ke cache HANYA jika authorized
    if result.is_authorized {
        if let Err(e) = save_cache(&result) {
            println!("Warning: Failed to save cache: {}", e);
        }
    }
    
    Ok(result)
}

/// Force refresh HWID status (bypass cache)
#[tauri::command]
pub async fn refresh_hwid_status() -> Result<HWIDResponse, String> {
    let hwid = generate_hwid().await?;
    
    println!("Force refreshing HWID status (bypassing cache)");
    let result = check_hwid_authorization(hwid).await?;
    
    // Save ke cache jika authorized
    if result.is_authorized {
        if let Err(e) = save_cache(&result) {
            println!("Warning: Failed to save cache: {}", e);
        }
    }
    
    Ok(result)
}
