package sim

import (
	"encoding/binary"
	"fmt"
	"hash/crc32"
	"io"
	"net"
	"time"
)

// otaclient.go — клиент OTA-протокола §3.4/§9 для эмулятора устройства. Получив MQTT-команду
// ota_update, устройство открывает TCP к OTA-серверу (mqtt-service:9000), принимает
// OTAUPDATE→HEADER→DATA→EOT (stop-and-wait, ACK на каждый фрейм), проверяет whole-image CRC и
// «применяет» образ — после чего рапортует новую версию в телеметрии (как реальный прибор).

const otaSOF = 0x7E

// DownloadFirmware проводит сессию приёма прошивки с OTA-сервера addr (host:port).
// activeSlot ("A"/"B") и curVer ("maj.min") уходят в HELLO (§9.4) — по слоту сервер выбирает
// образ свободного слота (§7.3). Возвращает (verMajor, verMinor) из HEADER при успешном CRC.
func DownloadFirmware(addr, activeSlot, curVer string) (uint16, uint16, error) {
	conn, err := net.DialTimeout("tcp", addr, 10*time.Second)
	if err != nil {
		return 0, 0, fmt.Errorf("ota dial: %w", err)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(2 * time.Minute))

	// §9.4: устройство ПЕРВЫМ шлёт ASCII HELLO с активным слотом и текущей версией.
	if _, err := conn.Write([]byte(fmt.Sprintf("OTAHELLO slot=%s ver=%s\n", activeSlot, curVer))); err != nil {
		return 0, 0, fmt.Errorf("ota HELLO: %w", err)
	}

	// §3.4: сервер шлёт литерал "OTAUPDATE" перед HEADER (cfg.SendTrigger).
	pre := make([]byte, 9)
	if _, err := io.ReadFull(conn, pre); err != nil {
		return 0, 0, fmt.Errorf("ota read OTAUPDATE: %w", err)
	}
	if string(pre) != "OTAUPDATE" {
		return 0, 0, fmt.Errorf("ota: ожидался OTAUPDATE, получено %q", pre)
	}

	// HEADER (12 байт payload: fw_size, fw_crc32, ver_major, ver_minor).
	typ, _, payload, err := readFrame(conn)
	if err != nil || typ != 0x01 {
		return 0, 0, fmt.Errorf("ota HEADER: typ=%d err=%w", typ, err)
	}
	if len(payload) < 12 {
		return 0, 0, fmt.Errorf("ota: короткий HEADER")
	}
	fwSize := binary.LittleEndian.Uint32(payload[0:4])
	fwCRC := binary.LittleEndian.Uint32(payload[4:8])
	verMajor := binary.LittleEndian.Uint16(payload[8:10])
	verMinor := binary.LittleEndian.Uint16(payload[10:12])
	if err := sendACK(conn, 0); err != nil {
		return 0, 0, err
	}

	// DATA…EOT (stop-and-wait, ACK по каждому фрейму). Накапливаем образ для CRC-проверки.
	var image []byte
	for {
		t, seq, p, err := readFrame(conn)
		if err != nil {
			return 0, 0, fmt.Errorf("ota DATA: %w", err)
		}
		if err := sendACK(conn, seq); err != nil {
			return 0, 0, err
		}
		if t == 0x03 { // EOT
			break
		}
		if t == 0x02 {
			image = append(image, p...)
		}
	}
	if uint32(len(image)) != fwSize || crc32.ChecksumIEEE(image) != fwCRC {
		return 0, 0, fmt.Errorf("ota: whole-image CRC/size mismatch (%d/%d B, crc 0x%08X/0x%08X)",
			len(image), fwSize, crc32.ChecksumIEEE(image), fwCRC)
	}
	return verMajor, verMinor, nil
}

// readFrame читает один фрейм §3.1 (SOF|type|seq|len|payload|crc32) и проверяет CRC.
func readFrame(r io.Reader) (typ byte, seq uint16, payload []byte, err error) {
	head := make([]byte, 6)
	if _, err = io.ReadFull(r, head); err != nil {
		return
	}
	if head[0] != otaSOF {
		return 0, 0, nil, fmt.Errorf("ota: неверный SOF 0x%02X", head[0])
	}
	plen := int(binary.LittleEndian.Uint16(head[4:6]))
	rest := make([]byte, plen+4)
	if _, err = io.ReadFull(r, rest); err != nil {
		return
	}
	full := append(head, rest...)
	if crc32.ChecksumIEEE(full[:6+plen]) != binary.LittleEndian.Uint32(full[6+plen:]) {
		return 0, 0, nil, fmt.Errorf("ota: неверный CRC фрейма")
	}
	return head[1], binary.LittleEndian.Uint16(head[2:4]), full[6 : 6+plen], nil
}

// sendACK отправляет ACK-фрейм (type 0x10) на подтверждаемый seq.
func sendACK(w io.Writer, seq uint16) error {
	b := []byte{otaSOF, 0x10}
	b = binary.LittleEndian.AppendUint16(b, seq)
	b = binary.LittleEndian.AppendUint16(b, 0)
	b = binary.LittleEndian.AppendUint32(b, crc32.ChecksumIEEE(b))
	_, err := w.Write(b)
	return err
}
