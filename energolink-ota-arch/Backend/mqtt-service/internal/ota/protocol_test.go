package ota

import (
	"bytes"
	"encoding/binary"
	"testing"
)

// Контрольное значение CRC-32/ISO-HDLC из §3.1 — гарантия байт-совместимости с устройством.
func TestCRC32_CheckValue(t *testing.T) {
	if got := CRC32([]byte("123456789")); got != 0xCBF43926 {
		t.Fatalf("CRC32 check: got %#08x, want 0xCBF43926", got)
	}
}

func TestEncodeFrame_ByteLayout(t *testing.T) {
	// EOT, seq=0, без payload → [7E 03 00 00 00 00 | crc:4].
	f := EncodeFrame(TypeEOT, 0, nil)
	if len(f) != frameOverhead {
		t.Fatalf("длина %d, ожидалось %d", len(f), frameOverhead)
	}
	wantPrefix := []byte{SOF, TypeEOT, 0x00, 0x00, 0x00, 0x00}
	if !bytes.Equal(f[:6], wantPrefix) {
		t.Fatalf("префикс %x, ожидалось %x", f[:6], wantPrefix)
	}
	// crc — LE от CRC32(SOF..payload).
	wantCRC := CRC32(f[:6])
	if got := binary.LittleEndian.Uint32(f[6:]); got != wantCRC {
		t.Fatalf("crc %#08x, ожидалось %#08x", got, wantCRC)
	}
}

func TestEncodeFrame_SeqAndLenLittleEndian(t *testing.T) {
	// DATA seq=0x0102, payload 3 байта → seq LE = 02 01, len LE = 03 00.
	f := EncodeFrame(TypeData, 0x0102, []byte{0xAA, 0xBB, 0xCC})
	if f[2] != 0x02 || f[3] != 0x01 {
		t.Fatalf("seq LE неверен: %x", f[2:4])
	}
	if f[4] != 0x03 || f[5] != 0x00 {
		t.Fatalf("len LE неверен: %x", f[4:6])
	}
	if !bytes.Equal(f[6:9], []byte{0xAA, 0xBB, 0xCC}) {
		t.Fatalf("payload неверен: %x", f[6:9])
	}
}

func TestEncodeDecode_RoundTrip(t *testing.T) {
	cases := []struct {
		typ     byte
		seq     uint16
		payload []byte
	}{
		{TypeHeader, 0, EncodeHeaderPayload(13000, 0xDEADBEEF, 1, 2)},
		{TypeData, 0, bytes.Repeat([]byte{0x5A}, MaxDataPayload)},
		{TypeData, 65535, []byte{0x01}},
		{TypeEOT, 7, nil},
		{TypeACK, 42, nil},
	}
	for _, c := range cases {
		fr, err := DecodeFrame(EncodeFrame(c.typ, c.seq, c.payload))
		if err != nil {
			t.Fatalf("decode(%#x): %v", c.typ, err)
		}
		if fr.Type != c.typ || fr.Seq != c.seq || !bytes.Equal(fr.Payload, c.payload) {
			t.Fatalf("round-trip mismatch: %+v vs typ=%#x seq=%d", fr, c.typ, c.seq)
		}
	}
}

func TestDecodeFrame_Errors(t *testing.T) {
	good := EncodeFrame(TypeData, 1, []byte{0xAA, 0xBB})

	if _, err := DecodeFrame(good[:5]); err != ErrShortFrame {
		t.Fatalf("short: %v", err)
	}
	badSOF := append([]byte{}, good...)
	badSOF[0] = 0x00
	if _, err := DecodeFrame(badSOF); err != ErrBadSOF {
		t.Fatalf("bad SOF: %v", err)
	}
	badCRC := append([]byte{}, good...)
	badCRC[len(badCRC)-1] ^= 0xFF
	if _, err := DecodeFrame(badCRC); err != ErrBadCRC {
		t.Fatalf("bad CRC: %v", err)
	}
	// len-поле говорит о большем payload, чем есть.
	badLen := append([]byte{}, good...)
	badLen[4] = 0xFF
	if _, err := DecodeFrame(badLen); err != ErrBadLen {
		t.Fatalf("bad len: %v", err)
	}
}

func TestEncodeHeaderPayload_Layout(t *testing.T) {
	p := EncodeHeaderPayload(13000, 0xDEADBEEF, 1, 2)
	if len(p) != 12 {
		t.Fatalf("HEADER payload %d байт, ожидалось 12", len(p))
	}
	want := []byte{
		0xC8, 0x32, 0x00, 0x00, // fw_size=13000 LE
		0xEF, 0xBE, 0xAD, 0xDE, // fw_crc32=0xDEADBEEF LE
		0x01, 0x00, // ver_major=1 LE
		0x02, 0x00, // ver_minor=2 LE
	}
	if !bytes.Equal(p, want) {
		t.Fatalf("HEADER layout %x, ожидалось %x", p, want)
	}
}

func TestSplitData(t *testing.T) {
	if SplitData(nil) != nil {
		t.Fatal("пустой firmware → nil")
	}
	// 600 байт → 256 + 256 + 88.
	chunks := SplitData(bytes.Repeat([]byte{1}, 600))
	if len(chunks) != 3 || len(chunks[0]) != 256 || len(chunks[1]) != 256 || len(chunks[2]) != 88 {
		t.Fatalf("нарезка неверна: %d чанков, длины %d/%d/%d",
			len(chunks), len(chunks[0]), len(chunks[1]), len(chunks[2]))
	}
	// ровно 256 → один чанк.
	if c := SplitData(bytes.Repeat([]byte{1}, 256)); len(c) != 1 || len(c[0]) != 256 {
		t.Fatalf("256 → один чанк, got %d", len(c))
	}
}
