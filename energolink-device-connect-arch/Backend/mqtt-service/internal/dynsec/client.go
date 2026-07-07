// Package dynsec — Go-клиент к Mosquitto Dynamic Security plugin.
// Команды публикуются в $CONTROL/dynamic-security/v1, ответы прилетают
// в $CONTROL/dynamic-security/v1/response. Каждая команда несёт уникальный
// correlationData; handler сопоставляет response с pending-каналом.
package dynsec

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

const (
	controlTopic  = "$CONTROL/dynamic-security/v1"
	responseTopic = "$CONTROL/dynamic-security/v1/response"
	// DynSec ACL не поддерживает substitution (`${clientid}`/`%c`) — топики literal.
	// Поэтому для каждого устройства создаём отдельную role с hardcoded topic'ами.
	rolePrefix = "device-"
	cmdTimeout = 5 * time.Second
)

type Config struct {
	Broker   string
	Username string
	Password string
	ClientID string // отдельный client_id, не пересекается с subscriber'ом
}

type Client struct {
	cfg     Config
	mc      mqtt.Client
	pending sync.Map // correlationData(string) → chan commandResponse
}

type commandResponse struct {
	Command string         `json:"command"`
	Error   string         `json:"error,omitempty"`
	Data    map[string]any `json:"data,omitempty"`
}

type controlEnvelope struct {
	Commands []commandRequest `json:"commands"`
}

type commandRequest struct {
	Command         string `json:"command"`
	Username        string `json:"username,omitempty"`
	Password        string `json:"password,omitempty"`
	Rolename        string `json:"rolename,omitempty"`
	TextName        string `json:"textname,omitempty"`
	ACLType         string `json:"acltype,omitempty"`
	Topic           string `json:"topic,omitempty"`
	Allow           *bool  `json:"allow,omitempty"`
	Priority        *int   `json:"priority,omitempty"`
	CorrelationData string `json:"correlationData,omitempty"`
}

func New(cfg Config) *Client {
	return &Client{cfg: cfg}
}

// Connect устанавливает MQTT-сессию и подписывается на response topic.
// AutoReconnect=true → переподключаемся при потерях.
func (c *Client) Connect(_ context.Context) error {
	opts := mqtt.NewClientOptions().
		AddBroker(c.cfg.Broker).
		SetClientID(c.cfg.ClientID).
		SetUsername(c.cfg.Username).
		SetPassword(c.cfg.Password).
		SetAutoReconnect(true).
		SetConnectRetry(true).
		SetConnectRetryInterval(5 * time.Second).
		SetCleanSession(true).
		SetOnConnectHandler(func(client mqtt.Client) {
			if tok := client.Subscribe(responseTopic, 1, c.onResponse); tok.Wait() && tok.Error() != nil {
				log.Printf("[DYNSEC] response subscribe error: %v", tok.Error())
			} else {
				log.Printf("[DYNSEC] connected & subscribed to %s", responseTopic)
			}
		}).
		SetConnectionLostHandler(func(_ mqtt.Client, err error) {
			log.Printf("[DYNSEC] connection lost: %v", err)
		})

	c.mc = mqtt.NewClient(opts)
	tok := c.mc.Connect()
	if !tok.WaitTimeout(10 * time.Second) {
		return errors.New("dynsec connect timeout")
	}
	return tok.Error()
}

func (c *Client) onResponse(_ mqtt.Client, msg mqtt.Message) {
	var env struct {
		Responses []struct {
			Command         string         `json:"command"`
			Error           string         `json:"error,omitempty"`
			Data            map[string]any `json:"data,omitempty"`
			CorrelationData string         `json:"correlationData,omitempty"`
		} `json:"responses"`
	}
	if err := json.Unmarshal(msg.Payload(), &env); err != nil {
		log.Printf("[DYNSEC] bad response payload: %v", err)
		return
	}
	for _, r := range env.Responses {
		if r.CorrelationData == "" {
			continue
		}
		ch, ok := c.pending.LoadAndDelete(r.CorrelationData)
		if !ok {
			continue
		}
		ch.(chan commandResponse) <- commandResponse{
			Command: r.Command,
			Error:   r.Error,
			Data:    r.Data,
		}
	}
}

// exec публикует одну команду и ждёт ответ с тем же correlationData.
func (c *Client) exec(ctx context.Context, cmd commandRequest) error {
	if c.mc == nil || !c.mc.IsConnected() {
		return errors.New("dynsec: not connected")
	}
	cmd.CorrelationData = randomHex(8)
	ch := make(chan commandResponse, 1)
	c.pending.Store(cmd.CorrelationData, ch)
	defer c.pending.Delete(cmd.CorrelationData)

	payload, err := json.Marshal(controlEnvelope{Commands: []commandRequest{cmd}})
	if err != nil {
		return err
	}
	tok := c.mc.Publish(controlTopic, 1, false, payload)
	if !tok.WaitTimeout(cmdTimeout) {
		return errors.New("dynsec: publish timeout")
	}
	if err := tok.Error(); err != nil {
		return err
	}

	select {
	case resp := <-ch:
		if resp.Error != "" {
			return fmt.Errorf("dynsec: %s", resp.Error)
		}
		return nil
	case <-time.After(cmdTimeout):
		return errors.New("dynsec: response timeout")
	case <-ctx.Done():
		return ctx.Err()
	}
}

// CreateClient создаёт нового MQTT клиента (username = client_id устройства) с
// собственной role 'device-<username>' и ACL (literal topics, т.к. DynSec не поддерживает
// substitution). defaultACLAccess deny → всё остальное запрещено. ACL:
//
//	publishClientSend     devices/<username>/telemetry    allow
//	publishClientSend     devices/<username>/status       allow
//	subscribePattern      devices/<username>/commands     allow  (legacy)
//	publishClientReceive  devices/<username>/commands     allow  (legacy: доставка команды)
//	subscribePattern      devices/<username>/OTA/cmd      allow  (§10)
//	publishClientReceive  devices/<username>/OTA/cmd      allow  (§10: доставка OTA-команды)
//	publishClientSend     devices/<username>/OTA/status   allow  (§10: статусы OTA)
//	publishClientSend     devices/<username>/OTA/info     allow  (§10: паспорт, retained)
func (c *Client) CreateClient(ctx context.Context, username, password, textname string) error {
	role := rolePrefix + username
	if err := c.exec(ctx, commandRequest{
		Command:  "createClient",
		Username: username,
		Password: password,
		TextName: textname,
	}); err != nil {
		return err
	}
	// createRole — игнорируем ошибку "already exists" (idempotency).
	_ = c.exec(ctx, commandRequest{Command: "createRole", Rolename: role})
	allow := true
	prio := 0
	for _, acl := range []struct {
		acltype string
		topic   string
	}{
		{"publishClientSend", "devices/" + username + "/telemetry"},
		{"publishClientSend", "devices/" + username + "/status"},
		{"subscribePattern", "devices/" + username + "/commands"},
		// publishClientReceive — РАЗРЕШЕНИЕ ПОЛУЧАТЬ сообщения в commands. В mosquitto dynsec это
		// ОТДЕЛЬНО от subscribePattern: без него устройство подписывается, но брокер не доставляет
		// опубликованные команды (OTA-триггер молча терялся для ВСЕХ устройств — KAN-12).
		{"publishClientReceive", "devices/" + username + "/commands"},
		// ТЗ v12 §10: OTA-команды/статусы/паспорт в поддереве devices/<id>/OTA/*.
		// Команда OTA/cmd: и подписка, и разрешение получать (как у commands выше).
		{"subscribePattern", "devices/" + username + "/OTA/cmd"},
		{"publishClientReceive", "devices/" + username + "/OTA/cmd"},
		{"publishClientSend", "devices/" + username + "/OTA/status"}, // статусы OTA устройства
		{"publishClientSend", "devices/" + username + "/OTA/info"},   // аппаратный паспорт (retained)
	} {
		if err := c.exec(ctx, commandRequest{
			Command:  "addRoleACL",
			Rolename: role,
			ACLType:  acl.acltype,
			Topic:    acl.topic,
			Allow:    &allow,
			Priority: &prio,
		}); err != nil {
			return fmt.Errorf("addRoleACL %s %s: %w", acl.acltype, acl.topic, err)
		}
	}
	return c.exec(ctx, commandRequest{
		Command:  "addClientRole",
		Username: username,
		Rolename: role,
	})
}

func (c *Client) SetClientPassword(ctx context.Context, username, password string) error {
	return c.exec(ctx, commandRequest{
		Command:  "setClientPassword",
		Username: username,
		Password: password,
	})
}

// DeleteClient удаляет клиента и его per-device role.
func (c *Client) DeleteClient(ctx context.Context, username string) error {
	if err := c.exec(ctx, commandRequest{
		Command:  "deleteClient",
		Username: username,
	}); err != nil {
		return err
	}
	// Best-effort cleanup роли — игнорируем "not found".
	_ = c.exec(ctx, commandRequest{Command: "deleteRole", Rolename: rolePrefix + username})
	return nil
}
