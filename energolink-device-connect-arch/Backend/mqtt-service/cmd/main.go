package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"os"
	"time"

	_ "github.com/lib/pq"

	"github.com/energolink/mqtt-service/internal/alerts"
	"github.com/energolink/mqtt-service/internal/backfill"
	"github.com/energolink/mqtt-service/internal/config"
	"github.com/energolink/mqtt-service/internal/drivers"
	"github.com/energolink/mqtt-service/internal/dynsec"
	"github.com/energolink/mqtt-service/internal/handler"
	"github.com/energolink/mqtt-service/internal/mileage"
	"github.com/energolink/mqtt-service/internal/ota"
	"github.com/energolink/mqtt-service/internal/refuels"
	"github.com/energolink/mqtt-service/internal/service"
	"github.com/energolink/mqtt-service/internal/trips"
)

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

	// Одноразовый backfill gas_mass_kg (KAN-10c): BACKFILL_GASMASS=1 → пересчитать историч.
	// телеметрию и выйти. Запускается как k8s Job на том же образе, идемпотентно.
	if os.Getenv("BACKFILL_GASMASS") == "1" {
		log.Println("[BACKFILL] gas_mass_kg: старт")
		n, err := backfill.GasMass(db, 2000, 200*time.Millisecond)
		if err != nil {
			log.Fatalf("[BACKFILL] gas_mass_kg failed after %d rows: %v", n, err)
		}
		log.Printf("[BACKFILL] gas_mass_kg: готово, обновлено %d строк", n)
		return
	}

	// ── WebSocket Hub ─────────────────────────────────────────────
	hub := service.NewHub()
	go hub.Run()

	// Dashboard updates Hub — отдельный от телеметрического. Periodic tick
	// каждые 30 сек, фронт на tick делает HTTP fetch /summary.
	// См. tasks/dashboard/2026-05-16_1203--backend-ws-dashboard-updates--plan.md.
	dashboardHub := service.NewHub()
	go dashboardHub.Run()
	go func() {
		t := time.NewTicker(30 * time.Second)
		defer t.Stop()
		for range t.C {
			payload := []byte(`{"type":"dashboard.tick","at":"` + time.Now().UTC().Format(time.RFC3339) + `"}`)
			dashboardHub.Broadcast(payload)
		}
	}()

	// ── Mileage worker ────────────────────────────────────────────
	// Каждые 5 мин обновляет vehicles.mileage из device_telemetry дельт
	// через haversine. Курсор в памяти; baseline на старте = MAX(received_at).
	mileageWorker := mileage.New(db, 5*time.Minute)
	go mileageWorker.Run(make(chan struct{}))

	// ── Trips auto-generator worker ───────────────────────────────
	// Каждые 5 мин для каждого vehicle с device:
	// segmentation device_telemetry по MOVING_THRESHOLD/STOP_TIMEOUT,
	// INSERT/UPDATE в trips. Cursor persistent в trip_worker_cursors.
	tripsWorker := trips.New(db, 5*time.Minute)
	go tripsWorker.Run(make(chan struct{}))

	// ── Drivers events worker ─────────────────────────────────────
	// Каждые 5 мин для каждого vehicle: анализ device_telemetry, запись
	// hard_brake / hard_acceleration / speeding событий в driving_events.
	// Cursor = MAX(driving_events.occurred_at) per vehicle.
	driversWorker := drivers.New(db, 5*time.Minute)
	go driversWorker.Run(make(chan struct{}))

	// ── Threshold alerts worker (ТЗ 3.4.12) ───────────────────────
	// Каждую минуту: свежая телеметрия per vehicle vs org_settings.thresholds
	// (lowPressure/maxTemp/maxSpeed/offline) → notifications с дедупом.
	alertsWorker := alerts.New(db, 1*time.Minute, cfg.NotificationURL, cfg.NotifyInternalTok)
	go alertsWorker.Run(make(chan struct{}))

	// ── Refuel detector (ТЗ 3.4.7) ────────────────────────────────
	// Каждые 2 мин: рост давления при speed≈0 → авто-фиксация заправки
	// (before/after/added кг, fill%, матчинг АЗС по GPS, флаг suspicious).
	refuelsWorker := refuels.New(db, 2*time.Minute)
	go refuelsWorker.Run(make(chan struct{}))

	// ── MQTT Service ──────────────────────────────────────────────
	// Connect() не блокирует: при ConnectRetry=true (см. service.Connect)
	// paho ретраит initial connect в фоне с интервалом MQTT_CONNECT_RETRY_INTERVAL,
	// а после первого успеха AutoReconnect перехватывает потери коннекта.
	// Watchdog внутри service'а каждые MQTT_WATCHDOG_INTERVAL логирует
	// «not yet connected» пока pipe не поднят.
	mqttSvc := service.New(cfg, db, hub)
	_ = mqttSvc.Connect()

	// ── DynSec control client ─────────────────────────────────────
	// Отдельная MQTT-сессия от subscriber'а (свой client_id, свой user),
	// чтобы команды/ответы $CONTROL не мешались с телеметрическим потоком.
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

	// ── OTA-сервер (KAN-32, §6/§7) ────────────────────────────────
	// TCP-listener: устройство (за LTE-NAT) коннектится после MQTT-триггера, сервер забирает
	// назначенную offered-сессию и передаёт .bin по §3.4. Manager создаёт сессию + публикует
	// MQTT-команду (вызывается vehicle-service через /internal/ota/start).
	otaStore := ota.NewStore(db)
	// Event-driven подтверждение OTA (§11, коммент Elbek 29.06): как только устройство после прошивки
	// переподключается и переиздаёт OTA/info с новой версией — подтверждаем applying-сессию СРАЗУ,
	// не дожидаясь тика периодического health-check (до 5 мин задержки). Периодический проход остаётся
	// бэкстопом (rolled-back по таймауту + страховка от пропущенного события).
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

	// OTA reaper: освобождает глобальный single-active слот (миграция 066) от осиротевших сессий —
	// 'downloading' после краша/рестарта пода, 'offered' от устройства, что не подключилось.
	// Без него одна зависшая сессия заблокировала бы все будущие назначения по парку.
	go func() {
		reap := func() {
			if n, err := otaStore.ReapStaleSessions(10*time.Minute, 30*time.Minute); err != nil {
				log.Printf("[OTA] reaper: %v", err)
			} else if n > 0 {
				log.Printf("[OTA] reaper: помечено stale-сессий failed: %d", n)
			}
		}
		reap() // на старте — подхватываем сессии, осиротевшие при рестарте
		t := time.NewTicker(5 * time.Minute)
		defer t.Stop()
		for range t.C {
			reap()
		}
	}()

	// OTA health-check (§8/§11, KAN-34/37): applying-сессии → success/rolled-back по телеметрии
	// (device_telemetry.ver). Подтверждение целевой версии = success; не подтвердилась за 30м = rolled-back.
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
	mux.Handle("/ws/dashboard", handler.NewWS(dashboardHub))

	if dynsecClient != nil {
		handler.NewDynSec(dynsecClient, cfg.InternalToken).Register(mux)
	}
	handler.NewOTA(otaManager, cfg.InternalToken).Register(mux)

	// Health check
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok","service":"mqtt-service"}`))
	})

	addr := ":" + cfg.Port
	log.Printf("[HTTP] MQTT Service listening on %s | WS: ws://localhost%s/ws/telemetry", addr, addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("[HTTP] Server failed: %v", err)
	}
}
