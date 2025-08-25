use crate::models::{SteamAppDetailsResponse, SteamAppInfo};
use reqwest::Client;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{Semaphore, RwLock};
use once_cell::sync::Lazy;

// Global Steam API rate limiter - increased for better throughput with thousands of games
pub static STEAM_API_SEMAPHORE: Lazy<Arc<Semaphore>> = Lazy::new(|| {
    Arc::new(Semaphore::new(5)) // Max 5 concurrent Steam API calls globally for better throughput
});

// Priority levels for API calls
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ApiPriority {
    High,      // For user-initiated actions (bypass, manual refresh)
    Normal,    // For regular operations
    Background // For background cache refresh
}

// Adaptive rate limiting state
static API_RESPONSE_TIMES: Lazy<Arc<RwLock<Vec<Duration>>>> = Lazy::new(|| {
    Arc::new(RwLock::new(Vec::new()))
});

pub struct SteamApiManager {
    client: Client,
}

impl SteamApiManager {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .unwrap_or_else(|_| Client::new());
            
        Self { client }
    }

    /// Fetch game details with global rate limiting and priority
    pub async fn get_game_details(
        &self, 
        app_id: &str, 
        priority: ApiPriority
    ) -> Result<SteamAppInfo, String> {
        // Acquire global semaphore permit
        let _permit = STEAM_API_SEMAPHORE.acquire().await
            .map_err(|_| "Failed to acquire API rate limit permit".to_string())?;

        // Use adaptive delay based on API performance
        let adaptive_delay = Self::get_adaptive_delay(priority).await;
        tokio::time::sleep(adaptive_delay).await;
        
        println!("Fetching Steam API details for AppID: {} (Priority: {:?})", app_id, priority);

        let url = format!("https://store.steampowered.com/api/appdetails?appids={}", app_id);
        
        // Track API response time for adaptive rate limiting
        let start_time = Instant::now();
        
        // Use tokio timeout as additional protection
        let response_result = tokio::time::timeout(
            Duration::from_secs(12),
            self.client.get(&url).send()
        ).await;

        match response_result {
            Ok(Ok(response)) => {
                if !response.status().is_success() {
                    println!("Steam API returned non-success status: {}", response.status());
                    return Err(format!("Steam API returned status {}", response.status()));
                }
                
                match response.json::<SteamAppDetailsResponse>().await {
                    Ok(app_details) => {
                        if let Some(app_data) = app_details.apps.get(app_id) {
                            if app_data.success {
                                                            if let Some(data) = &app_data.data {
                                // Record successful API response time
                                let response_time = start_time.elapsed();
                                Self::record_response_time(response_time).await;
                                
                                println!("Successfully fetched details for {}: {} ({}ms)", 
                                    app_id, data.name, response_time.as_millis());
                                return Ok(data.clone());
                            }
                            }
                        }
                        let msg = format!("Steam API returned success=false or no data for AppID {}", app_id);
                        println!("{}", msg);
                        Err(msg)
                    },
                    Err(e) => {
                        let msg = format!("Failed to parse Steam API response: {}", e);
                        println!("{}", msg);
                        Err(msg)
                    }
                }
            },
            Ok(Err(e)) => {
                let msg = format!("HTTP error fetching from Steam API: {}", e);
                println!("{}", msg);
                Err(msg)
            },
            Err(_) => {
                let msg = format!("Timeout fetching from Steam API for AppID {}", app_id);
                println!("{}", msg);
                Err(msg)
            }
        }
    }

    /// Batch fetch game details with intelligent batching and chunked processing for thousands
    pub async fn get_batch_game_details(
        &self,
        app_ids: Vec<String>,
        priority: ApiPriority
    ) -> Vec<Result<SteamAppInfo, String>> {
        let total_games = app_ids.len();
        let mut results = Vec::with_capacity(total_games);
        
        // For thousands of games, use chunked processing to prevent memory issues
        let chunk_size = match priority {
            ApiPriority::High => 50,      // Process 50 at a time for user actions
            ApiPriority::Normal => 100,   // Process 100 at a time for normal ops
            ApiPriority::Background => 500, // Process 500 at a time for background (memory efficient)
        };
        
        let batch_size = match priority {
            ApiPriority::High => 5,      // Increased for better user experience
            ApiPriority::Normal => 10,   // Increased for better efficiency
            ApiPriority::Background => 20, // Much larger batches for background processing thousands
        };

        // Process in chunks to prevent memory overflow
        for (chunk_index, chunk) in app_ids.chunks(chunk_size).enumerate() {
            println!("Processing chunk {} of {} ({} games)", 
                chunk_index + 1, 
                (total_games + chunk_size - 1) / chunk_size,
                chunk.len()
            );
            
            // Process each chunk in smaller batches with rate limiting
            for batch in chunk.chunks(batch_size) {
                let batch_results = futures::future::join_all(
                    batch.iter().map(|app_id| self.get_game_details(app_id, priority))
                ).await;
                
                results.extend(batch_results);
                
                // Reduced delay between batches for thousands of games
                if priority == ApiPriority::Background && batch.len() == batch_size {
                    tokio::time::sleep(Duration::from_millis(300)).await; // Reduced from 1000ms
                } else if priority == ApiPriority::Normal && batch.len() == batch_size {
                    tokio::time::sleep(Duration::from_millis(100)).await; // Short delay for normal
                }
            }
            
            // Brief pause between chunks to prevent overwhelming the system
            if chunk_index < (total_games + chunk_size - 1) / chunk_size - 1 {
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        }
        
        println!("Completed processing {} games total", total_games);
        results
    }

    /// Record API response time for adaptive rate limiting
    async fn record_response_time(response_time: Duration) {
        let mut times = API_RESPONSE_TIMES.write().await;
        times.push(response_time);
        
        // Keep only last 100 response times for rolling average
        if times.len() > 100 {
            times.drain(0..50); // Remove older half
        }
    }
    
    /// Get average API response time for adaptive adjustments
    pub async fn get_average_response_time() -> Duration {
        let times = API_RESPONSE_TIMES.read().await;
        if times.is_empty() {
            return Duration::from_millis(200); // Default
        }
        
        let total: Duration = times.iter().sum();
        total / times.len() as u32
    }
    
    /// Get current semaphore availability (for monitoring)
    pub fn get_available_permits() -> usize {
        STEAM_API_SEMAPHORE.available_permits()
    }
    
    /// Dynamic delay adjustment based on API performance
    pub async fn get_adaptive_delay(priority: ApiPriority) -> Duration {
        let avg_response_time = Self::get_average_response_time().await;
        
        // Base delays
        let base_delay = match priority {
            ApiPriority::High => 50,
            ApiPriority::Normal => 150,
            ApiPriority::Background => 200,
        };
        
        // Adjust based on API performance
        let adaptive_factor = if avg_response_time > Duration::from_millis(1000) {
            2.0 // Slow API, increase delays
        } else if avg_response_time > Duration::from_millis(500) {
            1.5 // Moderate API, slightly increase
        } else {
            1.0 // Fast API, use base delays
        };
        
        Duration::from_millis((base_delay as f64 * adaptive_factor) as u64)
    }
}

// Global instance
pub static STEAM_API: Lazy<SteamApiManager> = Lazy::new(|| {
    SteamApiManager::new()
});
