// HTTP-фасад над dynsec.Client для user-service.
// Контракт:
//   POST   /internal/mqtt/clients              {client_id, password, textname?}
//   PUT    /internal/mqtt/clients/{client_id}/password   {password}
//   DELETE /internal/mqtt/clients/{client_id}
//
// Bearer-auth через INTERNAL_SERVICE_TOKEN (shared с user-service).
package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/energolink/mqtt-service/internal/dynsec"
)

type DynSecHandler struct {
	client *dynsec.Client
	token  string
}

func NewDynSec(client *dynsec.Client, token string) *DynSecHandler {
	return &DynSecHandler{client: client, token: token}
}

// Register регистрирует роуты в mux.
func (h *DynSecHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/internal/mqtt/clients", h.handleCollection)
	mux.HandleFunc("/internal/mqtt/clients/", h.handleItem)
}

func (h *DynSecHandler) authOK(r *http.Request) bool {
	if h.token == "" {
		return false // безопасный default — если token не задан, не пускаем
	}
	hdr := r.Header.Get("Authorization")
	return hdr == "Bearer "+h.token
}

func (h *DynSecHandler) handleCollection(w http.ResponseWriter, r *http.Request) {
	if !h.authOK(r) {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		ClientID string `json:"client_id"`
		Password string `json:"password"`
		TextName string `json:"textname"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"bad json"}`, http.StatusBadRequest)
		return
	}
	if req.ClientID == "" || req.Password == "" {
		http.Error(w, `{"error":"client_id and password required"}`, http.StatusBadRequest)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	if err := h.client.CreateClient(ctx, req.ClientID, req.Password, req.TextName); err != nil {
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]string{"client_id": req.ClientID})
}

func (h *DynSecHandler) handleItem(w http.ResponseWriter, r *http.Request) {
	if !h.authOK(r) {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	// URL: /internal/mqtt/clients/<client_id>[/password]
	path := strings.TrimPrefix(r.URL.Path, "/internal/mqtt/clients/")
	if path == "" {
		http.Error(w, `{"error":"client_id required"}`, http.StatusBadRequest)
		return
	}
	parts := strings.Split(path, "/")
	clientID := parts[0]

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	switch {
	case r.Method == http.MethodDelete && len(parts) == 1:
		if err := h.client.DeleteClient(ctx, clientID); err != nil {
			writeErr(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	case r.Method == http.MethodPut && len(parts) == 2 && parts[1] == "password":
		var req struct{ Password string `json:"password"` }
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Password == "" {
			http.Error(w, `{"error":"password required"}`, http.StatusBadRequest)
			return
		}
		if err := h.client.SetClientPassword(ctx, clientID, req.Password); err != nil {
			writeErr(w, err)
			return
		}
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{"client_id": clientID})
	default:
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

func writeErr(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusInternalServerError)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
}
