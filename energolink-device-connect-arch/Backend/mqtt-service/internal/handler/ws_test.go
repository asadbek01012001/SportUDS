package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/energolink/mqtt-service/internal/service"
)

type fakeHub struct {
	registered   atomic.Int32
	unregistered atomic.Int32
	clients      chan *service.Client
}

func newFakeHub() *fakeHub {
	return &fakeHub{clients: make(chan *service.Client, 1)}
}

func (h *fakeHub) Register(c *service.Client) {
	h.registered.Add(1)
	select {
	case h.clients <- c:
	default:
	}
}

func (h *fakeHub) Unregister(c *service.Client) {
	h.unregistered.Add(1)
	close(c.Send)
}

func dialWS(t *testing.T, url string) *websocket.Conn {
	t.Helper()
	wsURL := "ws" + strings.TrimPrefix(url, "http") + "/ws/telemetry"
	c, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	require.NoError(t, err)
	return c
}

func TestWS_RegisterUnregister(t *testing.T) {
	hub := newFakeHub()
	srv := httptest.NewServer(NewWS(hub))
	defer srv.Close()

	c := dialWS(t, srv.URL)
	require.Eventually(t, func() bool { return hub.registered.Load() == 1 },
		time.Second, 5*time.Millisecond)

	c.Close()
	require.Eventually(t, func() bool { return hub.unregistered.Load() == 1 },
		time.Second, 5*time.Millisecond)
}

func TestWS_DeliversBroadcast(t *testing.T) {
	hub := newFakeHub()
	srv := httptest.NewServer(NewWS(hub))
	defer srv.Close()

	c := dialWS(t, srv.URL)
	defer c.Close()

	var registered *service.Client
	select {
	case registered = <-hub.clients:
	case <-time.After(time.Second):
		t.Fatal("handler did not register")
	}

	registered.Send <- []byte("telemetry")

	c.SetReadDeadline(time.Now().Add(time.Second))
	_, msg, err := c.ReadMessage()
	require.NoError(t, err)
	assert.Equal(t, "telemetry", string(msg))
}

func TestWS_UpgradeFailsForPlainGet(t *testing.T) {
	hub := newFakeHub()
	srv := httptest.NewServer(NewWS(hub))
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/ws/telemetry")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.NotEqual(t, http.StatusSwitchingProtocols, resp.StatusCode)
	assert.Equal(t, int32(0), hub.registered.Load())
}
