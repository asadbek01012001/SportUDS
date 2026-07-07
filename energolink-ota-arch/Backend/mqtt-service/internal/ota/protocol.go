// Package ota — серверная сторона OTA-протокола устройства GasLink (Confluence 12_ota_server §3).
// Протокол ЗАШИТ в устройстве и протестирован — здесь реализуем его байт-в-байт, не меняя.
//
// Фрейм (всё little-endian):
//
//	[ SOF=0x7E | type:1 | seq:2 | len:2 | payload | crc32:4 ]
//
// CRC32 — над SOF..payload (без поля crc), алгоритм CRC-32/ISO-HDLC (== Go crc32.IEEE,
// == Python zlib.crc32), контрольное значение check("123456789") = 0xCBF43926.
package ota

import (
	"encoding/binary"
	"errors"
	"hash/crc32"
)

// SOF — начало фрейма.
const SOF byte = 0x7E

// Типы фреймов (§3.2).
const (
	TypeHeader byte = 0x01 // сервер → устройство
	TypeData   byte = 0x02 // сервер → устройство
	TypeEOT    byte = 0x03 // сервер → устройство
	TypeACK    byte = 0x10 // устройство → сервер
	TypeNACK   byte = 0x11 // устройство → сервер
)

// MaxDataPayload — максимум payload DATA-фрейма (§3.3); полный фрейм ≤ 266 байт.
const MaxDataPayload = 256

// frameOverhead — байты фрейма помимо payload: SOF(1)+type(1)+seq(2)+len(2)+crc(4).
const frameOverhead = 10

// CRC32 — CRC-32/ISO-HDLC над b (== crc32.IEEE). check("123456789")=0xCBF43926.
func CRC32(b []byte) uint32 { return crc32.ChecksumIEEE(b) }

// EncodeFrame собирает фрейм типа typ с порядковым seq и payload по §3.1.
func EncodeFrame(typ byte, seq uint16, payload []byte) []byte {
	buf := make([]byte, 0, frameOverhead+len(payload))
	buf = append(buf, SOF, typ)
	buf = binary.LittleEndian.AppendUint16(buf, seq)
	buf = binary.LittleEndian.AppendUint16(buf, uint16(len(payload)))
	buf = append(buf, payload...)
	buf = binary.LittleEndian.AppendUint32(buf, CRC32(buf)) // CRC над SOF..payload
	return buf
}

// Frame — разобранный фрейм.
type Frame struct {
	Type    byte
	Seq     uint16
	Payload []byte
}

var (
	ErrShortFrame = errors.New("ota: фрейм короче минимального")
	ErrBadSOF     = errors.New("ota: неверный SOF")
	ErrBadLen     = errors.New("ota: длина фрейма не совпадает с len")
	ErrBadCRC     = errors.New("ota: неверный CRC32 фрейма")
)

// DecodeFrame разбирает ровно один фрейм из b (b — целиком один фрейм) и проверяет CRC.
func DecodeFrame(b []byte) (Frame, error) {
	if len(b) < frameOverhead {
		return Frame{}, ErrShortFrame
	}
	if b[0] != SOF {
		return Frame{}, ErrBadSOF
	}
	plen := int(binary.LittleEndian.Uint16(b[4:6]))
	if len(b) != frameOverhead+plen {
		return Frame{}, ErrBadLen
	}
	want := binary.LittleEndian.Uint32(b[6+plen:])
	if CRC32(b[:6+plen]) != want {
		return Frame{}, ErrBadCRC
	}
	payload := make([]byte, plen)
	copy(payload, b[6:6+plen])
	return Frame{Type: b[1], Seq: binary.LittleEndian.Uint16(b[2:4]), Payload: payload}, nil
}

// EncodeHeaderPayload — payload HEADER-фрейма (12 байт LE, §3.3).
func EncodeHeaderPayload(fwSize, fwCRC32 uint32, verMajor, verMinor uint16) []byte {
	p := make([]byte, 0, 12)
	p = binary.LittleEndian.AppendUint32(p, fwSize)
	p = binary.LittleEndian.AppendUint32(p, fwCRC32)
	p = binary.LittleEndian.AppendUint16(p, verMajor)
	p = binary.LittleEndian.AppendUint16(p, verMinor)
	return p
}

// SplitData нарезает firmware на DATA-payload'ы по ≤MaxDataPayload байт (§3.3).
func SplitData(firmware []byte) [][]byte {
	if len(firmware) == 0 {
		return nil
	}
	var out [][]byte
	for off := 0; off < len(firmware); off += MaxDataPayload {
		end := off + MaxDataPayload
		if end > len(firmware) {
			end = len(firmware)
		}
		out = append(out, firmware[off:end])
	}
	return out
}
