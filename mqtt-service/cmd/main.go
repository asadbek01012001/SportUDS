package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"time"

	_ "github.com/lib/pq"

	"github.com/sportuds/mqtt-service/internal/config"
	"github.com/sportuds/mqtt-service/internal/dynsec"
	"github.com/sportuds/mqtt-service/internal/handler"
	"github.com/sportuds/mqtt-service/internal/ota"
	"github.com/sportuds/mqtt-service/internal/service"
)

// mqtt-service — SportUDS uchun qurilma-server kanali:
//   (A) device-connect: per-device MQTT akkaunt (Dynamic Security) + trenajor telemetriyasini
//       qabul qilish → machine_telemetry / measurements + WebSocket.
//   (B) OTA: qurilmaga havodan proshivka yuklash (MQTT-trigger + TCP binar protokol §3.4).
// energolink reference'idan olingan; gaz/vehicle biznes-logikasi olib tashlangan.
func main() {
	cfg := config.Load()

	// ── Database ──────────────────────────────────────────────────
	var db *sql.DB
	var err error
	for i := 0; i < 10; i++ {
		db, err = sql.Open("postgres", cfg.DSN())
		if err == nil {
			if err = db.Ping(); err == nil {
				break
			}
		}
		log.Printf("[DB] Retry %d/10 ...", i+1)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatalf("[DB] Failed to connect: %v", err)
	}
	defer db.Close()
	db.SetMaxOpenConns(10)
	log.Println("[DB] Connected")

	// ── WebSocket Hub (telemetriya) ───────────────────────────────
	hub := service.NewHub()
	go hub.Run()

	// ── MQTT Service ──────────────────────────────────────────────
	// Connect() bloklamaydi: ConnectRetry=true bilan paho initial connect'ni fonda qayta uradi.
	mqttSvc := service.New(cfg, db, hub)
	_ = mqttSvc.Connect()

	// ── DynSec control client ─────────────────────────────────────
	// Subscriber'dan alohida MQTT-sessiya (o'z client_id), $CONTROL buyruqlari/javoblari
	// telemetriya oqimiga aralashmasligi uchun.
	var dynsecClient *dynsec.Client
	if cfg.DynSecAdminPassword != "" {
		dynsecClient = dynsec.New(dynsec.Config{
			Broker:   cfg.MQTTBroker,
			Username: cfg.DynSecAdminUsername,
			Password: cfg.DynSecAdminPassword,
			ClientID: cfg.MQTTClientID + "-dynsec",
		})
		if err := dynsecClient.Connect(nil); err != nil {
			log.Printf("[DYNSEC] initial connect failed: %v (will retry in background)", err)
		}
	} else {
		log.Println("[DYNSEC] DYNSEC_ADMIN_PASSWORD empty — control API disabled")
	}

	// ── OTA server (§6/§7) ────────────────────────────────────────
	otaStore := ota.NewStore(db)
	// Event-driven OTA tasdiqi: qurilma proshivkadan keyin qayta ulanib OTA/info chiqarishi bilan
	// applying-sessiyani DARHOL tasdiqlaymiz (periodik health-check tikini kutmasdan).
	mqttSvc.SetOtaInfoHook(func(clientID string) {
		if r, err := otaStore.ConfirmApplyingByClientID(clientID); err != nil {
			log.Printf("[OTA] health-check (event %s): %v", clientID, err)
		} else if r.Confirmed > 0 {
			log.Printf("[OTA] health-check (event %s): success=%d", clientID, r.Confirmed)
		}
	})
	otaServer := ota.NewServer(otaStore, ":"+cfg.OTATCPPort)
	go func() {
		if err := otaServer.Run(context.Background()); err != nil {
			log.Printf("[OTA] TCP server stopped: %v", err)
		}
	}()
	otaManager := ota.NewManager(otaStore, mqttSvc, cfg.OTAPublicHost, cfg.OTAPublicPort)

	// OTA reaper: osilib qolgan aktiv sessiyalarni (downloading/offered) failed qilib, per-device
	// single-active slotni bo'shatadi — busiz bitta osilgan sessiya keyingi barcha yangilanishlarni bloklardi.
	go func() {
		reap := func() {
			if n, err := otaStore.ReapStaleSessions(10*time.Minute, 30*time.Minute); err != nil {
				log.Printf("[OTA] reaper: %v", err)
			} else if n > 0 {
				log.Printf("[OTA] reaper: stale-sessiyalar failed: %d", n)
			}
		}
		reap()
		t := time.NewTicker(5 * time.Minute)
		defer t.Stop()
		for range t.C {
			reap()
		}
	}()

	// OTA health-check (§8/§11): applying-sessiyalar → success/rolled-back (qurilma versiyasi
	// o'zgarishi bo'yicha). Tasdiqlanmasa 30 daqiqada rolled-back.
	go func() {
		check := func() {
			if r, err := otaStore.RunHealthCheck(30 * time.Minute); err != nil {
				log.Printf("[OTA] health-check: %v", err)
			} else if r.Confirmed > 0 || r.RolledBack > 0 {
				log.Printf("[OTA] health-check: success=%d rolled-back=%d", r.Confirmed, r.RolledBack)
			}
		}
		t := time.NewTicker(5 * time.Minute)
		defer t.Stop()
		for range t.C {
			check()
		}
	}()

	// ── HTTP / WebSocket Server ───────────────────────────────────
	mux := http.NewServeMux()

	mux.Handle("/ws/telemetry", handler.NewWS(hub))

	if dynsecClient != nil {
		handler.NewDynSec(dynsecClient, cfg.InternalToken).Register(mux)
	}
	handler.NewOTA(otaManager, cfg.InternalToken).Register(mux)

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","service":"mqtt-service"}`))
	})

	addr := ":" + cfg.Port
	log.Printf("[HTTP] MQTT Service listening on %s | WS: ws://localhost%s/ws/telemetry", addr, addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("[HTTP] Server failed: %v", err)
	}
}
