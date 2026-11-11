FROM docker.io/library/rust:1.90-trixie AS rust
FROM docker.io/library/node:22-trixie
COPY --from=rust /usr/local/cargo /usr/local/cargo
COPY --from=rust /usr/local/rustup /usr/local/rustup
ENV CARGO_HOME=/usr/local/cargo RUSTUP_HOME=/usr/local/rustup PATH=/usr/local/cargo/bin:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf flatpak-builder elfutils appstream-compose librsvg2-common && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
