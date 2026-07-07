FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /service ./cmd/main.go

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /service .

# 8087 — HTTP/WebSocket (telemetriya + /internal/* provisioning/OTA), 9000 — OTA TCP-server.
EXPOSE 8087 9000
CMD ["./service"]
