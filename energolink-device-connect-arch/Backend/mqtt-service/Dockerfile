FROM registry.gitlab.com/gaslink/energolink/base/golang:1.25-alpine AS builder


WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 go test ./...
RUN CGO_ENABLED=0 GOOS=linux go build -o /service ./cmd/main.go

FROM registry.gitlab.com/gaslink/energolink/base/alpine:3.19
ENV GIN_MODE=release
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /service .

EXPOSE 8087
CMD ["./service"]
