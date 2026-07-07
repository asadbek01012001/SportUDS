// Package mqttctl — HTTP-клиент к mqtt-service /internal/mqtt/clients.
// Используется vehicle-service при CRUD на devices, чтобы провижионить
// MQTT-аккаунт в Dynamic Security plugin брокера.
package mqttctl

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Client struct {
	BaseURL string
	Token   string
	HTTP    *http.Client
}

func New(baseURL, token string) *Client {
	return &Client{
		BaseURL: baseURL,
		Token:   token,
		HTTP:    &http.Client{Timeout: 15 * time.Second},
	}
}

// HTTPError — ответ mqtt-service со статусом >= 400. Несёт код, чтобы вызывающий мог отразить
// семантику (напр. 409 «обновление уже идёт») вместо глухого 502 и не светил внутренний путь.
type HTTPError struct {
	Code int
	Body string
}

func (e *HTTPError) Error() string {
	return fmt.Sprintf("mqtt-service %d: %s", e.Code, e.Body)
}

// Enabled — true если есть base URL и token (иначе вызывающий пропускает интеграцию).
func (c *Client) Enabled() bool { return c != nil && c.BaseURL != "" && c.Token != "" }

func (c *Client) CreateClient(ctx context.Context, clientID, password, textName string) error {
	body, _ := json.Marshal(map[string]string{
		"client_id": clientID,
		"password":  password,
		"textname":  textName,
	})
	return c.do(ctx, http.MethodPost, "/internal/mqtt/clients", body)
}

func (c *Client) DeleteClient(ctx context.Context, clientID string) error {
	return c.do(ctx, http.MethodDelete, "/internal/mqtt/clients/"+clientID, nil)
}

func (c *Client) SetClientPassword(ctx context.Context, clientID, password string) error {
	body, _ := json.Marshal(map[string]string{"password": password})
	return c.do(ctx, http.MethodPut, "/internal/mqtt/clients/"+clientID+"/password", body)
}

// StartOTA назначает прошивку устройству: mqtt-service создаёт offered-сессию (§8) и публикует
// MQTT-команду запуска обновления (§7). Устройство затем открывает TCP к OTA-серверу.
func (c *Client) StartOTA(ctx context.Context, deviceUID int, firmwareID string) error {
	body, _ := json.Marshal(map[string]interface{}{
		"device_uid":  deviceUID,
		"firmware_id": firmwareID,
	})
	return c.do(ctx, http.MethodPost, "/internal/ota/start", body)
}

func (c *Client) do(ctx context.Context, method, path string, body []byte) error {
	var br io.Reader
	if body != nil {
		br = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.BaseURL+path, br)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		buf, _ := io.ReadAll(resp.Body)
		return &HTTPError{Code: resp.StatusCode, Body: string(buf)}
	}
	return nil
}
