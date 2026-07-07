// HTTP-фасад запуска OTA-обновления для vehicle-service (admin).
// Контракт:
//
//	POST /internal/ota/start  {device_uid:int, firmware_id:uuid}  → 202 {session_id}
//
// Bearer-auth через INTERNAL_SERVICE_TOKEN (shared с vehicle-service).
package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/sportuds/mqtt-service/internal/ota"
)

type OTAHandler struct {
	mgr   *ota.Manager
	token string
}

func NewOTA(mgr *ota.Manager, token string) *OTAHandler {
	return &OTAHandler{mgr: mgr, token: token}
}

func (h *OTAHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/internal/ota/start", h.handleStart)
}

func (h *OTAHandler) authOK(r *http.Request) bool {
	if h.token == "" {
		return false // безопасный default — без токена не пускаем
	}
	return r.Header.Get("Authorization") == "Bearer "+h.token
}

func (h *OTAHandler) handleStart(w http.ResponseWriter, r *http.Request) {
	if !h.authOK(r) {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		DeviceUID  int    `json:"device_uid"`
		FirmwareID string `json:"firmware_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"bad json"}`, http.StatusBadRequest)
		return
	}
	if req.DeviceUID == 0 || req.FirmwareID == "" {
		http.Error(w, `{"error":"device_uid and firmware_id required"}`, http.StatusBadRequest)
		return
	}
	sessionID, err := h.mgr.StartUpdate(req.DeviceUID, req.FirmwareID)
	if err != nil {
		if errors.Is(err, ota.ErrActiveSession) {
			http.Error(w, `{"error":"another OTA update is already in progress"}`, http.StatusConflict)
			return
		}
		writeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]string{"session_id": sessionID})
}
