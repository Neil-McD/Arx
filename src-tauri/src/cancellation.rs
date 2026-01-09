//! Cancellation system for aborting agent operations.
//!
//! Allows users to cancel running tasks via ESC or cancel button.
//! Uses tokio_util::sync::CancellationToken for cooperative cancellation.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;

/// Manager for session-scoped cancellation tokens
pub struct CancellationManager {
    /// Map of session_id -> CancellationToken
    tokens: RwLock<HashMap<String, CancellationToken>>,
}

impl CancellationManager {
    pub fn new() -> Self {
        Self {
            tokens: RwLock::new(HashMap::new()),
        }
    }

    /// Get the current cancellation token for a session (returns existing even if cancelled)
    pub async fn get_token(&self, session_id: &str) -> CancellationToken {
        let tokens = self.tokens.read().await;
        if let Some(token) = tokens.get(session_id) {
            return token.clone();
        }
        drop(tokens);

        // Create new token if none exists
        let mut tokens = self.tokens.write().await;
        // Double-check after acquiring write lock
        if let Some(token) = tokens.get(session_id) {
            return token.clone();
        }
        let token = CancellationToken::new();
        tokens.insert(session_id.to_string(), token.clone());
        token
    }

    /// Cancel the current operation for a session
    pub async fn cancel(&self, session_id: &str) -> bool {
        let tokens = self.tokens.read().await;
        if let Some(token) = tokens.get(session_id) {
            token.cancel();
            return true;
        }
        false
    }

    /// Reset the token for a new operation (call at start of each turn)
    pub async fn reset(&self, session_id: &str) -> CancellationToken {
        let mut tokens = self.tokens.write().await;
        let token = CancellationToken::new();
        tokens.insert(session_id.to_string(), token.clone());
        token
    }
}

impl Default for CancellationManager {
    fn default() -> Self {
        Self::new()
    }
}

// Global instance
use once_cell::sync::Lazy;

static CANCELLATION_MANAGER: Lazy<Arc<CancellationManager>> =
    Lazy::new(|| Arc::new(CancellationManager::new()));

/// Get the global cancellation manager
pub fn cancellation_manager() -> &'static Arc<CancellationManager> {
    &CANCELLATION_MANAGER
}

/// Helper to run an async operation with cancellation support
pub async fn with_cancellation<F, T>(
    session_id: &str,
    future: F,
) -> Result<T, CancellationError>
where
    F: std::future::Future<Output = T>,
{
    let token = cancellation_manager().get_token(session_id).await;

    tokio::select! {
        result = future => Ok(result),
        _ = token.cancelled() => Err(CancellationError::Cancelled),
    }
}

/// Error type for cancelled operations
#[derive(Debug, Clone)]
pub enum CancellationError {
    Cancelled,
}

impl std::fmt::Display for CancellationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CancellationError::Cancelled => write!(f, "operation cancelled by user"),
        }
    }
}

impl std::error::Error for CancellationError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn cancel_aborts_operation() {
        let manager = CancellationManager::new();
        let token = manager.get_token("test").await;

        // Start a "long" operation
        let handle = tokio::spawn({
            let token = token.clone();
            async move {
                tokio::select! {
                    _ = tokio::time::sleep(std::time::Duration::from_secs(10)) => {
                        "completed"
                    }
                    _ = token.cancelled() => {
                        "cancelled"
                    }
                }
            }
        });

        // Cancel after a short delay
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        manager.cancel("test").await;

        let result = handle.await.unwrap();
        assert_eq!(result, "cancelled");
    }

    #[tokio::test]
    async fn reset_creates_new_token() {
        let manager = CancellationManager::new();

        let token1 = manager.get_token("test").await;
        manager.cancel("test").await;
        assert!(token1.is_cancelled());

        // Reset should create a fresh, non-cancelled token
        let token2 = manager.reset("test").await;
        assert!(!token2.is_cancelled());
    }

    #[tokio::test]
    async fn with_cancellation_helper() {
        // Use unique session IDs to avoid conflicts with other tests
        let session_id = "test_with_cancellation";

        // Reset to get a fresh token
        let _token = cancellation_manager().reset(session_id).await;

        // Normal completion
        let result = with_cancellation(session_id, async { 42 }).await;
        assert!(matches!(result, Ok(42)));

        // Reset again, then cancel
        let token = cancellation_manager().reset(session_id).await;
        token.cancel();

        let result = with_cancellation(session_id, async {
            tokio::time::sleep(std::time::Duration::from_secs(10)).await;
            42
        })
        .await;
        assert!(matches!(result, Err(CancellationError::Cancelled)));
    }
}
