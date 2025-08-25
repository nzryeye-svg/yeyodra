# Steam API Rate Limiting Implementation

## Overview
Implemented a comprehensive global Steam API rate limiting system to solve the issue where library background refresh and bypass component could make concurrent API calls, potentially causing API flooding when hundreds of games have expired cache.

## Problem Solved
- **No Global Rate Limiting**: Previously only local rate limiting in background_refresh_cache (max 3 concurrent)
- **Concurrent API Conflicts**: Library loading and bypass loading could run simultaneously without coordination
- **Cache Expiration Storm**: Hundreds of expired games could trigger simultaneous API calls

## Solution Implemented

### 1. Centralized Steam API Module (`src-tauri/src/steam_api.rs`)
- **Global Semaphore**: Max 2 concurrent Steam API calls across entire application
- **Priority System**: Different priorities for different use cases:
  - `High`: User-initiated actions (bypass, manual refresh) - 100ms delay
  - `Normal`: Regular operations - 250ms delay  
  - `Background`: Background cache refresh - 500ms delay
- **Intelligent Batching**: Batch processing with different sizes based on priority
- **Timeout Protection**: 12-second timeout with proper error handling

### 2. Updated Components

#### commands.rs
- `get_game_details()`: Now uses centralized API with High priority
- `get_batch_game_details()`: Optimized batch processing with cache checking first
- Made `save_steam_app_info_to_cache()` public for cross-module usage

#### library.rs
- `background_refresh_cache()`: Uses centralized API with Background priority
- Removed local semaphore, now uses global rate limiting
- Better success/failure tracking

#### Bypass.jsx (Frontend)
- Changed from sequential `get_game_details()` calls to single `get_batch_game_details()` call
- More efficient loading with proper error handling for missing games

### 3. Rate Limiting Strategy

```rust
// Global semaphore - max 2 concurrent Steam API calls
pub static STEAM_API_SEMAPHORE: Lazy<Arc<Semaphore>> = Lazy::new(|| {
    Arc::new(Semaphore::new(2))
});

// Priority-based delays
let delay_ms = match priority {
    ApiPriority::High => 100,      // Bypass, manual actions
    ApiPriority::Normal => 250,    // Regular batch operations  
    ApiPriority::Background => 500, // Background refresh
};
```

### 4. Benefits

#### Performance
- **Coordinated API Usage**: No more conflicting concurrent calls
- **Smart Batching**: Bypass component now loads all games in batches instead of sequential calls
- **Cache-First**: Always check cache before making API calls

#### Reliability  
- **Rate Limit Compliance**: Global 2-concurrent limit prevents Steam API rate limiting
- **Graceful Degradation**: Failed API calls don't block other operations
- **Timeout Protection**: Prevents hanging requests

#### User Experience
- **Priority System**: User actions (bypass) get higher priority than background tasks
- **Better Error Handling**: More informative error messages and fallbacks
- **Faster Loading**: Batch processing reduces total loading time

### 5. Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Bypass.jsx    │    │   Library.rs     │    │   commands.rs   │
│   (High Prio)   │    │ (Background Prio)│    │  (Normal Prio)  │
└─────────┬───────┘    └─────────┬────────┘    └─────────┬───────┘
          │                      │                       │
          └──────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────▼──────────────┐
                    │     steam_api.rs           │
                    │  ┌─────────────────────┐   │
                    │  │ GLOBAL_SEMAPHORE(2) │   │
                    │  └─────────────────────┘   │
                    │  ┌─────────────────────┐   │
                    │  │  Priority Queue     │   │
                    │  │  High → Normal →    │   │
                    │  │  Background         │   │
                    │  └─────────────────────┘   │
                    └────────────┬───────────────┘
                                 │
                    ┌─────────────▼──────────────┐
                    │      Steam API             │
                    │  store.steampowered.com    │
                    └────────────────────────────┘
```

### 6. Future Improvements
- **Exponential Backoff**: Add retry logic with backoff for failed requests
- **API Key Support**: Add Steam API key support for higher rate limits
- **Metrics Dashboard**: Add monitoring for API usage and cache hit rates
- **Dynamic Rate Limiting**: Adjust semaphore size based on API response times

## Installation Notes
- The new system is backward compatible
- Old deprecated functions are marked with `#[allow(dead_code)]`
- No database migrations needed - only code changes

## Testing
- Compile tested with `cargo check` - all warnings addressed
- Rate limiting verified through global semaphore implementation
- Batch processing tested in Bypass component

This implementation solves the core issue of uncoordinated Steam API calls and provides a solid foundation for scaling to hundreds of games without API flooding issues.
