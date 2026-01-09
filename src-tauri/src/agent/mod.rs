mod context;
mod providers;
mod step;
mod tool_calls;
mod types;

pub use types::{
    AnthropicContentResponse, GeminiPartResponse, OpenAiToolCall, ToolRejection,
};

use crate::cancellation::cancellation_manager;
use crate::db::DbState;
use tauri::Emitter;
use tokio::sync::{mpsc, oneshot};

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

pub struct AgentState {
    sender: mpsc::Sender<AgentRequest>,
    #[allow(dead_code)] // Used internally in the agent loop
    summarized_tool_calls: Arc<Mutex<HashSet<String>>>,
    #[allow(dead_code)] // Used internally in the agent loop
    iteration_counts: Arc<Mutex<HashMap<String, u32>>>,
}

enum AgentRequest {
    UserTurn {
        session_id: String,
        model_id: String,
        cwd: String,
        respond_to: oneshot::Sender<Result<String, String>>,
    },
    ToolOutput {
        session_id: String,
        model_id: String,
        command: String,
        output: String,
        tool_call_id: String,
        cwd: String,
        respond_to: oneshot::Sender<Result<String, String>>,
    },
}

pub fn init_agent_loop(app: tauri::AppHandle, db_state: DbState) -> AgentState {
    let (sender, mut receiver) = mpsc::channel::<AgentRequest>(32);
    let db_path = db_state.db_path.clone();
    let db_key = db_state.key.clone();

    let summarized_tool_calls: Arc<Mutex<HashSet<String>>> = Arc::new(Mutex::new(HashSet::new()));
    let summarized_tool_calls_loop = Arc::clone(&summarized_tool_calls);
    let iteration_counts: Arc<Mutex<HashMap<String, u32>>> = Arc::new(Mutex::new(HashMap::new()));
    let iteration_counts_loop = Arc::clone(&iteration_counts);

    tauri::async_runtime::spawn(async move {
        while let Some(request) = receiver.recv().await {
            match request {
                AgentRequest::UserTurn {
                    session_id,
                    model_id,
                    cwd,
                    respond_to,
                } => {
                    // Reset iteration counter + cancellation token on new user message.
                    if let Ok(mut counts) = iteration_counts_loop.lock() {
                        counts.remove(&session_id);
                    }
                    let _token = cancellation_manager().reset(&session_id).await;

                    let result = step::run_turn(
                        &app,
                        &db_path,
                        &db_key,
                        &session_id,
                        &model_id,
                        &cwd,
                        &iteration_counts_loop,
                    )
                    .await;
                    let _ = respond_to.send(result);
                    let _ = app.emit(
                        "agent-turn-finished",
                        serde_json::json!({ "session_id": session_id }),
                    );
                }
                AgentRequest::ToolOutput {
                    session_id,
                    model_id,
                    command,
                    output,
                    tool_call_id,
                    cwd,
                    respond_to,
                } => {
                    let mut already_seen = false;
                    if let Ok(mut seen) = summarized_tool_calls_loop.lock() {
                        if seen.contains(&tool_call_id) {
                            already_seen = true;
                        } else {
                            seen.insert(tool_call_id.clone());
                        }
                    }
                    if already_seen {
                        let _ = respond_to.send(Ok(String::new()));
                        let _ = app.emit(
                            "agent-turn-finished",
                            serde_json::json!({ "session_id": session_id }),
                        );
                        continue;
                    }

                    let result = step::run_turn_with_tool_output(
                        &app,
                        &db_path,
                        &db_key,
                        &session_id,
                        &model_id,
                        &command,
                        &output,
                        &tool_call_id,
                        &cwd,
                        &iteration_counts_loop,
                    )
                    .await;
                    if result.is_err() {
                        if let Ok(mut seen) = summarized_tool_calls_loop.lock() {
                            seen.remove(&tool_call_id);
                        }
                    }
                    let _ = respond_to.send(result);
                    let _ = app.emit(
                        "agent-turn-finished",
                        serde_json::json!({ "session_id": session_id }),
                    );
                }
            }
        }
    });

    AgentState {
        sender,
        summarized_tool_calls,
        iteration_counts,
    }
}

pub async fn submit_turn(
    agent: &AgentState,
    session_id: String,
    model_id: String,
    cwd: String,
) -> Result<String, String> {
    let (tx, rx) = oneshot::channel();
    agent
        .sender
        .send(AgentRequest::UserTurn {
            session_id,
            model_id,
            cwd,
            respond_to: tx,
        })
        .await
        .map_err(|_| "agent loop stopped".to_string())?;
    rx.await.map_err(|_| "agent loop stopped".to_string())?
}

pub async fn submit_tool_output(
    agent: &AgentState,
    session_id: String,
    model_id: String,
    command: String,
    output: String,
    tool_call_id: String,
    cwd: String,
) -> Result<String, String> {
    let (tx, rx) = oneshot::channel();
    agent
        .sender
        .send(AgentRequest::ToolOutput {
            session_id,
            model_id,
            command,
            output,
            tool_call_id,
            cwd,
            respond_to: tx,
        })
        .await
        .map_err(|_| "agent loop stopped".to_string())?;
    rx.await.map_err(|_| "agent loop stopped".to_string())?
}
