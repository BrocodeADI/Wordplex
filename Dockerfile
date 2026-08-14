# --- Build stage ---
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Build the binary
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o wordplex .

# --- Run stage ---
FROM alpine:3.19

RUN apk add --no-cache ca-certificates

WORKDIR /app

# Copy binary and static files
COPY --from=builder /app/wordplex .
COPY --from=builder /app/public ./public

EXPOSE 8080

CMD ["./wordplex"]
