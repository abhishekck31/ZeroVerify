# Prover service image.
#
# The build needs the SP1 toolchain to compile the RISC-V guest program, and it
# needs pdf-utils/ as well as circuits/, so it must be built from the
# repository root:
#
#   docker build -f circuits/Dockerfile -t zeroverify-prover .
#
# Two things the build is sensitive to, both learned the hard way:
#   * sp1-recursion-core rejects any CARGO_TARGET_DIR whose last path segment
#     is not "target".
#   * sp1-prover downloads a 12.7 MB verification-key map with a short timeout
#     and unwraps the result, so a slow network fails the build. It is fetched
#     here with retries and placed where the build script looks for it, which
#     is a hardcoded path - VK_MAP_SRC_PATH is advertised but never read.

FROM rust:1-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates git pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# SP1 toolchain (provides cargo-prove and the succinct rust toolchain).
ARG SP1_VERSION=v6.8.0
RUN curl -sSfL https://sp1up.succinct.xyz | bash \
    && /root/.sp1/bin/sp1up --version ${SP1_VERSION}
ENV PATH="/root/.sp1/bin:${PATH}"

WORKDIR /build
COPY pdf-utils/ ./pdf-utils/
COPY circuits/ ./circuits/

# Pre-seed the verification-key map so the build does not depend on a fast
# connection to S3. The checksum is the one sp1-prover's build script asserts.
ARG VK_MAP_URL=https://sp1-circuits.s3.us-east-2.amazonaws.com/vk-map-v5.0.0
ARG VK_MAP_SHA256=5e735f6e44f56e9eee91e5626252663afcc5263287d1c5980367b3f9f930a0e8
RUN set -eux; \
    curl -fL --retry 5 --retry-delay 5 --retry-all-errors \
         --connect-timeout 30 --max-time 1800 \
         -o /tmp/vk_map.bin "${VK_MAP_URL}"; \
    echo "${VK_MAP_SHA256}  /tmp/vk_map.bin" | sha256sum -c -

ENV CARGO_TARGET_DIR=/build/target
WORKDIR /build/circuits

# cargo fetch first so the registry is populated, then drop the map into the
# sp1-prover source directory before the build runs.
RUN cargo fetch \
    && CRATE_DIR="$(find /usr/local/cargo/registry/src -maxdepth 2 -type d -name 'sp1-prover-*' | head -1)" \
    && mkdir -p "${CRATE_DIR}/src" \
    && cp /tmp/vk_map.bin "${CRATE_DIR}/src/vk_map.bin"

RUN cargo build --release --bin prover

# ---------------------------------------------------------------------------

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 prover

COPY --from=builder /build/target/release/prover /usr/local/bin/prover

USER prover
WORKDIR /home/prover

# 'cpu' proves locally and needs no account, but wants far more memory than a
# small instance has; 'network' delegates to the Succinct Prover Network and
# needs NETWORK_PRIVATE_KEY. Set ALLOWED_ORIGIN to the frontend's origin.
ENV SP1_PROVER=network \
    PORT=3001 \
    RUST_LOG=info

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["prover"]
