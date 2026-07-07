package ota

import (
	"bytes"
	"io"
	"net"
	"sync"
	"testing"
	"time"
)

// mockDevice играет роль устройства на втором конце net.Pipe: читает фреймы сервера и
// отвечает ACK/NACK по сценарию. nackOnDataSeq — однократно NACK на этот DATA seq (затем ACK).
func mockDevice(t *testing.T, conn net.Conn, expectTrigger bool, nackOnDataSeq int) (received []byte, ok bool) {
	t.Helper()
	defer conn.Close()
	if expectTrigger {
		buf := make([]byte, len("OTAUPDATE"))
		if _, err := io.ReadFull(conn, buf); err != nil {
			t.Errorf("device: чтение триггера: %v", err)
			return nil, false
		}
		if string(buf) != "OTAUPDATE" {
			t.Errorf("device: триггер %q, ожидался OTAUPDATE", buf)
			return nil, false
		}
	}
	nacked := false
	var data []byte
	for {
		fr, err := ReadFrame(conn)
		if err != nil {
			t.Errorf("device: чтение фрейма: %v", err)
			return nil, false
		}
		switch fr.Type {
		case TypeHeader:
			_, _ = conn.Write(EncodeFrame(TypeACK, fr.Seq, nil))
		case TypeData:
			if int(fr.Seq) == nackOnDataSeq && !nacked {
				nacked = true
				_, _ = conn.Write(EncodeFrame(TypeNACK, fr.Seq, nil)) // потребуем повтор
				continue
			}
			data = append(data, fr.Payload...)
			_, _ = conn.Write(EncodeFrame(TypeACK, fr.Seq, nil))
		case TypeEOT:
			_, _ = conn.Write(EncodeFrame(TypeACK, fr.Seq, nil))
			return data, true
		}
	}
}

func TestSendFirmware_HappyPath(t *testing.T) {
	srv, dev := net.Pipe()
	fw := bytes.Repeat([]byte{0xAB}, 600) // 3 DATA-чанка (256+256+88)

	var got []byte
	var ok bool
	var wg sync.WaitGroup
	wg.Add(1)
	go func() { defer wg.Done(); got, ok = mockDevice(t, dev, true, -1) }()

	res, err := SendFirmware(srv, nil, fw, CRC32(fw), 1, 2, Config{ACKTimeout: time.Second, SendTrigger: true})
	srv.Close()
	wg.Wait()

	if err != nil {
		t.Fatalf("SendFirmware: %v", err)
	}
	if res.DataFrames != 3 || res.LastSeq != 2 || res.FramesSent != 5 {
		t.Fatalf("Result неверный: %+v", res)
	}
	if !ok || !bytes.Equal(got, fw) {
		t.Fatalf("устройство получило не тот образ (ok=%v, len=%d)", ok, len(got))
	}
}

func TestSendFirmware_NackRetransmits(t *testing.T) {
	srv, dev := net.Pipe()
	fw := bytes.Repeat([]byte{0x5A}, 500) // 2 чанка

	var got []byte
	var ok bool
	var wg sync.WaitGroup
	wg.Add(1)
	go func() { defer wg.Done(); got, ok = mockDevice(t, dev, false, 1) }() // NACK на DATA seq=1 один раз

	res, err := SendFirmware(srv, nil, fw, CRC32(fw), 1, 0, Config{ACKTimeout: time.Second})
	srv.Close()
	wg.Wait()

	if err != nil {
		t.Fatalf("SendFirmware при NACK→повтор: %v", err)
	}
	if !ok || !bytes.Equal(got, fw) {
		t.Fatalf("образ после повтора не совпал (res=%+v)", res)
	}
}

func TestSendFirmware_TimeoutFails(t *testing.T) {
	srv, dev := net.Pipe()
	// Устройство читает фреймы, но НЕ отвечает → сервер таймаутит и исчерпывает повторы.
	go func() {
		defer dev.Close()
		for {
			if _, err := ReadFrame(dev); err != nil {
				return
			}
		}
	}()

	_, err := SendFirmware(srv, nil, []byte{1, 2, 3}, CRC32([]byte{1, 2, 3}), 1, 0,
		Config{ACKTimeout: 30 * time.Millisecond, MaxRetries: 2})
	srv.Close()
	if err == nil {
		t.Fatal("ожидалась ошибка по таймауту/повторам")
	}
}

// TestSendFirmware_DataSeqStartsAtZero — hardware-критичный инвариант (§3, коммент 10136/10137):
// DATA нумеруется СТРОГО с seq=0 и непрерывно. Off-by-one (seq с 1) → устройство NACK-ит и
// передача срывается. Фиксируем фактические seq, что сервер прислал.
func TestSendFirmware_DataSeqStartsAtZero(t *testing.T) {
	srv, dev := net.Pipe()
	fw := bytes.Repeat([]byte{0x11}, 700) // 3 DATA-чанка (256+256+188)

	var seqs []uint16
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		defer dev.Close()
		for {
			fr, err := ReadFrame(dev)
			if err != nil {
				return
			}
			if fr.Type == TypeData {
				seqs = append(seqs, fr.Seq)
			}
			_, _ = dev.Write(EncodeFrame(TypeACK, fr.Seq, nil)) // ACK всё (HEADER/DATA/EOT)
			if fr.Type == TypeEOT {
				return
			}
		}
	}()

	if _, err := SendFirmware(srv, nil, fw, CRC32(fw), 1, 0, Config{ACKTimeout: time.Second}); err != nil {
		t.Fatalf("SendFirmware: %v", err)
	}
	srv.Close()
	wg.Wait()

	want := []uint16{0, 1, 2}
	if len(seqs) != len(want) {
		t.Fatalf("DATA seq последовательность = %v, ожидалось %v", seqs, want)
	}
	for i := range want {
		if seqs[i] != want[i] {
			t.Fatalf("DATA seq[%d] = %d, ожидалось %d (§3: DATA строго с 0, непрерывно)", i, seqs[i], want[i])
		}
	}
}

func TestSendFirmware_Guards(t *testing.T) {
	srv, dev := net.Pipe()
	defer dev.Close()
	defer srv.Close()
	if _, err := SendFirmware(srv, nil, nil, 0, 1, 0, Config{}); err != ErrEmptyImage {
		t.Fatalf("пустой образ: %v", err)
	}
	if _, err := SendFirmware(srv, nil, make([]byte, SlotSize+1), 0, 1, 0, Config{}); err != ErrTooLarge {
		t.Fatalf("больше слота: %v", err)
	}
}
