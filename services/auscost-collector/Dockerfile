FROM alpine/git:2.47.2 AS source
WORKDIR /src
ARG AUSCOST_REF=main
RUN git clone --depth 1 --branch "${AUSCOST_REF}" https://github.com/tjhowse/aus_grocery_price_database.git .

FROM golang:1.25-bookworm AS builder
WORKDIR /usr/src/app
COPY --from=source /src/go.mod /src/go.sum ./
RUN go mod download && go mod verify
COPY --from=source /src/ ./
RUN CGO_ENABLED=1 go build -trimpath -o /run-app .

FROM debian:bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=builder /run-app /usr/local/bin/run-app
COPY --from=source /src/LICENSE /usr/share/licenses/auscost/LICENSE
VOLUME ["/data"]
ENTRYPOINT ["/usr/local/bin/run-app"]
