package ota

import (
	"bufio"
	"context"
	"log"
	"net"
	"time"
)

// server.go — TCP-сервер OTA (§6/§7). Устройство (за LTE-NAT) само инициирует TCP-коннект после
// MQTT-триггера; сервер забирает назначенную offered-сессию (ClaimOffered) и передаёт .bin по
// протоколу §3.4 (OTAUPDATE→HEADER→DATA→EOT, stop-and-wait).

const (
	// otaPeekBytes — сколько первых байт устройства логировать для диагностики протокола (KAN-43).
	otaPeekBytes = 48
	// connMaxDuration — потолок на всю сессию передачи (13 КБ по LTE — секунды; запас на повторы),
	// чтобы зависшее/злонамеренное соединение не держало goroutine вечно. Per-frame read-дедлайны
	// ставит SendFirmware отдельно (8с на ACK).
	connMaxDuration = 5 * time.Minute
	// maxConcurrent — anti-DDoS: предел одновременных OTA-сессий. На порту 9000 НЕТ app-level
	// аутентификации (протокол §3.4 без auth-рукопожатия; per-device auth §10 / TLS §14 — роадмап),
	// поэтому ограничиваем число одновременных handler'ов, иначе флуд коннектов = goroutine/DB
	// exhaustion. Сверх лимита — соединение немедленно закрывается без claim/DB-запроса.
	maxConcurrent = 64
)

type Server struct {
	store *Store
	addr  string
	cfg   Config
	sem   chan struct{} // семафор одновременных сессий (anti-DDoS)
}

// NewServer — TCP-сервер на addr (напр. ":9000"). SendTrigger=true: §3.4 показывает литерал
// "OTAUPDATE" в TCP-потоке первым (MQTT-команда лишь заставляет устройство открыть коннект).
func NewServer(store *Store, addr string) *Server {
	return &Server{store: store, addr: addr, cfg: Config{SendTrigger: true}, sem: make(chan struct{}, maxConcurrent)}
}

// Run слушает TCP и обслуживает коннекты до отмены ctx.
func (srv *Server) Run(ctx context.Context) error {
	ln, err := net.Listen("tcp", srv.addr)
	if err != nil {
		return err
	}
	log.Printf("[OTA] TCP server listening on %s (max %d concurrent sessions)", srv.addr, maxConcurrent)
	go func() {
		<-ctx.Done()
		_ = ln.Close()
	}()
	for {
		conn, err := ln.Accept()
		if err != nil {
			select {
			case <-ctx.Done():
				return nil
			default:
				log.Printf("[OTA] accept: %v", err)
				continue
			}
		}
		srv.dispatch(conn)
	}
}

// dispatch обслуживает коннект, если не превышен лимит одновременных сессий; иначе немедленно
// закрывает (anti-DDoS — не плодим goroutine/DB-запрос на каждый коннект из флуда).
func (srv *Server) dispatch(conn net.Conn) {
	select {
	case srv.sem <- struct{}{}:
		go func() {
			defer func() { <-srv.sem }()
			srv.handle(conn)
		}()
	default:
		log.Printf("[OTA] at capacity (%d), dropping %s", maxConcurrent, conn.RemoteAddr())
		_ = conn.Close()
	}
}

// handle обслуживает один коннект устройства: читает HELLO (§9.4), забирает offered-сессию,
// выбирает образ свободного слота (§7.3) и гонит передачу.
func (srv *Server) handle(conn net.Conn) {
	defer conn.Close()
	remote := conn.RemoteAddr().String()
	_ = conn.SetDeadline(time.Now().Add(connMaxDuration))

	// §9.4: устройство ПЕРВЫМ шлёт ASCII "OTAHELLO slot=<A|B> ver=<maj>.<min>\n". Читаем из
	// bufio-буфера; тот же rd используется для чтения ACK (выравнивание потока). Толерантно к
	// legacy-устройству без HELLO (таймаут → slot="").
	rd := bufio.NewReader(conn)
	_ = conn.SetReadDeadline(time.Now().Add(helloReadTimeout))
	// ДИАГНОСТИКА (KAN-43): hex+ASCII первых байт устройства — увидеть реальный протокол прошивки
	// (шлёт ли HELLO, или что-то иное). Ждём первый байт (Peek(1)), затем логируем только уже
	// забуференное — не блокируемся на ожидании фикс. количества (иначе +до 5с на каждый коннект).
	if _, perr := rd.Peek(1); perr == nil {
		n := rd.Buffered()
		if n > otaPeekBytes {
			n = otaPeekBytes
		}
		if peek, _ := rd.Peek(n); len(peek) > 0 {
			log.Printf("[OTA] %s первые %d байт: % x | %q", remote, len(peek), peek, AsciiDump(peek))
		}
	} else {
		log.Printf("[OTA] %s байт при коннекте нет (за %s)", remote, helloReadTimeout)
	}
	slot, hMaj, hMin := ReadHelloLine(rd)
	_ = conn.SetReadDeadline(time.Now().Add(connMaxDuration)) // вернуть общий потолок (per-frame дедлайн ставит SendFirmware)
	if slot != "" {
		log.Printf("[OTA] %s HELLO slot=%s ver=%d.%d", remote, slot, hMaj, hMin)
	} else {
		log.Printf("[OTA] %s без HELLO (legacy) — образ под слот A", remote)
	}

	sess, err := srv.store.ClaimOffered()
	if err != nil {
		log.Printf("[OTA] %s claim session: %v", remote, err)
		return
	}
	if sess == nil {
		// Устройство подключилось, но назначенных обновлений нет — корректно закрываем.
		log.Printf("[OTA] %s connected, no offered session — closing", remote)
		return
	}
	// §7.3: образ свободного слота по активному слоту из HELLO.
	bin, crc := sess.ImageForActiveSlot(slot)
	// Устройство на слоте A, но прошивка single-image (нет образа B) → шлём image_A в свободный
	// слот B. Для slot-зависимых прошивок это может привести к rollback — предупреждаем в логе.
	if slot == "A" && !sess.HasB {
		log.Printf("[OTA] %s ВНИМАНИЕ: устройство на слоте A, но у прошивки %s нет образа B (single-image) — шлём image_A; при slot-зависимой прошивке возможен rollback",
			remote, sess.FirmwareID)
	}
	log.Printf("[OTA] %s → session %s (device=%d fw=%s ver=%s, slot=%s, %d B)",
		remote, sess.ID, sess.DeviceUID, sess.FirmwareID, sess.Version, slot, len(bin))

	res, err := SendFirmware(conn, rd, bin, crc, sess.VerMajor, sess.VerMinor, srv.cfg)
	if err != nil {
		_ = srv.store.UpdateStatus(sess.ID, "failed", int(res.LastSeq), err.Error())
		_ = srv.store.RecordHistory(sess.DeviceUID, sess.Version, "failed")
		log.Printf("[OTA] session %s FAILED at seq=%d: %v", sess.ID, res.LastSeq, err)
		return
	}
	// Передача завершена (EOT подтверждён). Устройство теперь проверяет whole-image CRC и
	// применяет образ (§8 verifying/applying). Финальный success/rolled-back подтверждается
	// телеметрией (health-check §11) — вне MVP KAN-32, поэтому history пишем как pending.
	_ = srv.store.UpdateStatus(sess.ID, "applying", int(res.LastSeq), "")
	_ = srv.store.RecordHistory(sess.DeviceUID, sess.Version, "pending")
	log.Printf("[OTA] session %s transfer complete: %d frames (%d DATA) → applying",
		sess.ID, res.FramesSent, res.DataFrames)
}
