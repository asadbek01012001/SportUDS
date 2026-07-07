package ota

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"time"
)

// session.go — серверный драйвер OTA-сессии §3.4 (stop-and-wait) поверх TCP-соединения.
//
// ДОПУЩЕНИЯ (из спеки §3 однозначно не выводятся — уточнить у Hardware/прошивки, помечено):
//   - ACK(0x10)/NACK(0x11) приходят как обычные фреймы §3.1; поле seq = подтверждаемый seq.
//   - DATA нумеруются seq = 0,1,2,…; HEADER и EOT — отдельные типы (их ACK по типу, seq не строгий).
//   - Триггер "OTAUPDATE" отправляется ВНЕ TCP — через MQTT-команду (§7), поэтому TCP-сессия
//     начинается сразу с HEADER. (Если устройство ждёт литерал в TCP — включить cfg.SendTrigger.)
// Когда придёт reference-сервер/дамп — поправим точечно (формат байт-в-байт уже на месте).

// Config — параметры сессии.
type Config struct {
	ACKTimeout  time.Duration // ожидание ACK на фрейм (дефолт 8с)
	MaxRetries  int           // повторов фрейма при NACK/таймауте (дефолт 4), затем сессия failed
	SendTrigger bool          // слать литерал "OTAUPDATE" в TCP перед HEADER (если так ждёт прошивка)
}

func (c Config) withDefaults() Config {
	if c.ACKTimeout <= 0 {
		c.ACKTimeout = 8 * time.Second
	}
	if c.MaxRetries <= 0 {
		c.MaxRetries = 4
	}
	return c
}

// Result — итог сессии.
type Result struct {
	FramesSent int    // HEADER + DATA + EOT, фактически подтверждённые
	DataFrames int    // число DATA-фреймов
	LastSeq    uint16 // последний подтверждённый DATA seq
}

var (
	ErrMaxRetries = errors.New("ota: превышен лимит повторов фрейма")
	ErrTooLarge   = errors.New("ota: firmware больше слота (64 КБ)")
	ErrEmptyImage = errors.New("ota: пустой образ")
)

// SlotSize — максимум прошивки (слот A/B, §2).
const SlotSize = 64 * 1024

// ReadFrame читает ровно один фрейм §3.1 из потока r (SOF, type, seq, len, payload, crc) и
// проверяет CRC. Блокирует до полного фрейма или ошибки/дедлайна соединения.
func ReadFrame(r io.Reader) (Frame, error) {
	head := make([]byte, 6) // SOF+type+seq+len
	if _, err := io.ReadFull(r, head); err != nil {
		return Frame{}, err
	}
	if head[0] != SOF {
		// ДИАГНОСТИКА (KAN-43): устройство ответило не фреймом §3.1 — логируем сырые байты,
		// чтобы увидеть реальный формат ответа прошивки (вместо безмолвного «неверный SOF»).
		log.Printf("[OTA] ReadFrame: ожидался SOF 0x7E, получено % x | %q", head, AsciiDump(head))
		return Frame{}, ErrBadSOF
	}
	plen := int(binary.LittleEndian.Uint16(head[4:6]))
	// Кап до аллокации: на порту нет auth, любой коннект мог бы прислать len=65535 и заставить
	// сервер аллоцировать 64 КБ на фрейм (memory-amplification DoS). Легитимные входящие фреймы —
	// ACK/NACK (payload 0) и в тестах ≤ MaxDataPayload; больше быть не может.
	if plen > MaxDataPayload {
		return Frame{}, ErrBadLen
	}
	rest := make([]byte, plen+4) // payload + crc
	if _, err := io.ReadFull(r, rest); err != nil {
		return Frame{}, err
	}
	full := append(head, rest...)
	return DecodeFrame(full)
}

// SendFirmware проводит сессию §3.4 по conn: (опц. OTAUPDATE) → HEADER → DATA(stop-and-wait) → EOT.
// fwCRC32 — whole-image CRC (== CRC32(fw)); verMajor/Minor идут в HEADER. ACK читаются из ackR
// (если nil — из conn): сервер передаёт bufio-reader, уже прочитавший HELLO, чтобы не потерять
// забуференные байты. Возвращает Result.
func SendFirmware(conn net.Conn, ackR io.Reader, fw []byte, fwCRC32 uint32, verMajor, verMinor uint16, cfg Config) (Result, error) {
	cfg = cfg.withDefaults()
	if ackR == nil {
		ackR = conn
	}
	if len(fw) == 0 {
		return Result{}, ErrEmptyImage
	}
	if len(fw) > SlotSize {
		return Result{}, ErrTooLarge
	}

	if cfg.SendTrigger {
		if _, err := conn.Write([]byte("OTAUPDATE")); err != nil {
			return Result{}, fmt.Errorf("trigger: %w", err)
		}
	}

	res := Result{}
	// HEADER (seq=0; ACK по типу, seq не строгий).
	hdr := EncodeFrame(TypeHeader, 0, EncodeHeaderPayload(uint32(len(fw)), fwCRC32, verMajor, verMinor))
	if err := sendAndWait(conn, ackR, hdr, 0, false, cfg); err != nil {
		return res, fmt.Errorf("HEADER: %w", err)
	}
	res.FramesSent++

	// DATA seq=0..n-1, строгое сопоставление ACK по seq.
	chunks := SplitData(fw)
	res.DataFrames = len(chunks)
	for i, c := range chunks {
		seq := uint16(i)
		fr := EncodeFrame(TypeData, seq, c)
		if err := sendAndWait(conn, ackR, fr, seq, true, cfg); err != nil {
			return res, fmt.Errorf("DATA seq=%d: %w", seq, err)
		}
		res.FramesSent++
		res.LastSeq = seq
	}

	// EOT (seq = n; ACK по типу).
	eot := EncodeFrame(TypeEOT, uint16(len(chunks)), nil)
	if err := sendAndWait(conn, ackR, eot, uint16(len(chunks)), false, cfg); err != nil {
		return res, fmt.Errorf("EOT: %w", err)
	}
	res.FramesSent++
	return res, nil
}

// sendAndWait шлёт frame и ждёт ACK; NACK/таймаут → повтор того же фрейма (тот же seq) до
// MaxRetries. strictSeq=true → ACK должен нести ожидаемый seq (DATA); false → любой ACK (HEADER/EOT).
// Запись и read-дедлайн — на conn; чтение ACK-фрейма — из ackR (тот же буфер, что HELLO).
func sendAndWait(conn net.Conn, ackR io.Reader, frame []byte, expectSeq uint16, strictSeq bool, cfg Config) error {
	for attempt := 0; attempt <= cfg.MaxRetries; attempt++ {
		if _, err := conn.Write(frame); err != nil {
			return fmt.Errorf("write: %w", err)
		}
		_ = conn.SetReadDeadline(time.Now().Add(cfg.ACKTimeout))
		resp, err := ReadFrame(ackR)
		if err != nil {
			if ne, ok := err.(net.Error); ok && ne.Timeout() {
				continue // таймаут → повтор фрейма
			}
			return fmt.Errorf("read ack: %w", err)
		}
		switch resp.Type {
		case TypeACK:
			if !strictSeq || resp.Seq == expectSeq {
				return nil
			}
			// ACK не на тот seq (устаревший) — перепосылаем тот же фрейм.
		case TypeNACK:
			// явный запрос повтора — повторяем.
		default:
			// неожиданный тип — игнорируем, повторяем фрейм.
		}
	}
	return ErrMaxRetries
}
