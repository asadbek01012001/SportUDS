package handler

import (
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"

	"github.com/energolink/mqtt-service/internal/service"
)

const (
	pingInterval = 30 * time.Second
	readDeadline = 60 * time.Second
	sendBufSize  = 256
	readLimit    = 512
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

// Hub is the subset of *service.Hub the handler needs.
type Hub interface {
	Register(*service.Client)
	Unregister(*service.Client)
}

type WS struct {
	hub Hub
}

func NewWS(hub Hub) *WS { return &WS{hub: hub} }

func (h *WS) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] Upgrade error: %v", err)
		return
	}

	client := &service.Client{Send: make(chan []byte, sendBufSize)}
	h.hub.Register(client)

	go h.writer(conn, client)
	go h.pinger(conn)
	go h.reader(conn, client)
}

func (h *WS) writer(conn *websocket.Conn, c *service.Client) {
	defer conn.Close()
	for msg := range c.Send {
		if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			return
		}
	}
}

func (h *WS) pinger(conn *websocket.Conn) {
	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()
	for range ticker.C {
		if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
			return
		}
	}
}

func (h *WS) reader(conn *websocket.Conn, c *service.Client) {
	defer func() {
		h.hub.Unregister(c)
		conn.Close()
	}()
	conn.SetReadLimit(readLimit)
	conn.SetReadDeadline(time.Now().Add(readDeadline))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(readDeadline))
		return nil
	})
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			return
		}
	}
}
