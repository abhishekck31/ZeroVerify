use axum::{
    http::StatusCode,
    routing::{get, post},
    serve, Json, Router,
};
use serde::{Deserialize, Serialize};
use sp1_sdk::{
    include_elf, HashableKey, ProverClient, SP1ProofWithPublicValues, SP1ProvingKey, SP1Stdin,
    SP1VerifyingKey,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tower_http::cors::{AllowOrigin, Any, CorsLayer};
use zkpdf_lib::types::PDFCircuitInput;

pub const ZKPDF_ELF: &[u8] = include_elf!("zkpdf-program");

/// Proving and verifying keys, derived once at startup.
///
/// `setup` is expensive, and deriving it per request made every proof pay for
/// key generation again.
struct AppState {
    pk: SP1ProvingKey,
    vk: SP1VerifyingKey,
}

#[derive(Deserialize)]
struct ProofRequest {
    pdf_bytes: Vec<u8>,
    page_number: u8,
    sub_string: String,
    offset: Option<usize>,
}

#[derive(Serialize)]
struct VerifyResponse {
    valid: bool,
    error: Option<String>,
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    vkey: String,
}

/// Errors are returned as a status plus message; the handlers below never
/// panic, because a panic in an axum handler drops the connection and the
/// caller sees a reset rather than a reason.
type ApiError = (StatusCode, String);

async fn health(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        vkey: state.vk.bytes32(),
    })
}

async fn prove(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
    Json(body): Json<ProofRequest>,
) -> Result<Json<SP1ProofWithPublicValues>, ApiError> {
    let ProofRequest {
        pdf_bytes,
        page_number,
        sub_string,
        offset,
    } = body;

    if pdf_bytes.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "pdf_bytes is empty".into()));
    }
    if sub_string.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "sub_string is empty".into()));
    }

    let offset = offset.unwrap_or(0);
    let offset_u32 = u32::try_from(offset)
        .map_err(|_| (StatusCode::BAD_REQUEST, "offset does not fit in u32".into()))?;

    let proof_input = PDFCircuitInput {
        pdf_bytes,
        page_number,
        offset: offset_u32,
        substring: sub_string,
    };

    let mut stdin = SP1Stdin::new();
    stdin.write(&proof_input);

    // Proving is CPU-bound and blocks; keep it off the async runtime's workers.
    let proof = tokio::task::spawn_blocking(move || {
        let client = ProverClient::from_env();
        client.prove(&state.pk, &stdin).groth16().run()
    })
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("prover task failed: {e}")))?
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("failed to generate proof: {e}")))?;

    Ok(Json(proof))
}

async fn verify(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
    Json(proof): Json<SP1ProofWithPublicValues>,
) -> Json<VerifyResponse> {
    let client = ProverClient::from_env();

    match client.verify(&proof, &state.vk) {
        Ok(_) => Json(VerifyResponse {
            valid: true,
            error: None,
        }),
        Err(e) => Json(VerifyResponse {
            valid: false,
            error: Some(format!("Verification failed: {}", e)),
        }),
    }
}

#[tokio::main]
async fn main() {
    sp1_sdk::utils::setup_logger();
    dotenv::dotenv().ok();

    let prover = std::env::var("SP1_PROVER").unwrap_or_default();
    let key = std::env::var("NETWORK_PRIVATE_KEY").unwrap_or_default();

    assert_eq!(prover, "network", "SP1_PROVER must be set to 'network'");
    assert!(
        key.starts_with("0x") && key.len() > 10,
        "Invalid or missing NETWORK_PRIVATE_KEY"
    );

    tracing::info!("deriving proving and verifying keys (one-time)...");
    let client = ProverClient::from_env();
    let (pk, vk) = client.setup(ZKPDF_ELF);
    tracing::info!("verifying key: {}", vk.bytes32());
    let state = Arc::new(AppState { pk, vk });

    // Restrict the browser origins allowed to call this service. ALLOWED_ORIGIN
    // takes a comma-separated list; leaving it unset keeps the permissive
    // behaviour that local development relies on.
    let cors = match std::env::var("ALLOWED_ORIGIN") {
        Ok(raw) if !raw.trim().is_empty() => {
            let origins: Vec<_> = raw
                .split(',')
                .filter_map(|o| o.trim().parse().ok())
                .collect();
            tracing::info!("CORS restricted to {} origin(s)", origins.len());
            CorsLayer::new()
                .allow_origin(AllowOrigin::list(origins))
                .allow_methods(Any)
                .allow_headers(Any)
        }
        _ => {
            tracing::warn!("ALLOWED_ORIGIN not set - allowing any origin");
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any)
        }
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/prove", post(prove))
        .route("/verify", post(verify))
        .layer(cors)
        .with_state(state);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(3001);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("listening on {}", addr);

    let listener = TcpListener::bind(addr).await.unwrap();
    serve(listener, app.into_make_service()).await.unwrap();
}
