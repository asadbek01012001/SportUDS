package ota

import (
	"bufio"
	"bytes"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseHello(t *testing.T) {
	cases := []struct {
		in       string
		wantSlot string
		wantMaj  uint16
		wantMin  uint16
		wantOK   bool
	}{
		{"OTAHELLO slot=A ver=1.2\n", "A", 1, 2, true},
		{"OTAHELLO slot=B ver=10.255", "B", 10, 255, true},
		{"OTAHELLO slot=b ver=1.0", "B", 1, 0, true},     // регистронезависимо
		{"OTAHELLO ver=3.4", "", 3, 4, true},             // без slot → ""
		{"OTAHELLO slot=X ver=1.1", "", 1, 1, true},      // невалидный слот → ""
		{"OTAHELLO slot=A ver=0.0.500\n", "A", 0, 0, true}, // 3-частная версия (реальное устройство): maj.min
		{"OTAHELLO slot=B ver=1.7.3", "B", 1, 7, true},     // 3-частная: min=7 (не 0 из-за SplitN-бага)
		{"OTAHELLO", "", 0, 0, true},                     // только префикс
		{"GARBAGE slot=A", "", 0, 0, false},              // не HELLO
		{"", "", 0, 0, false},                            // пусто
	}
	for _, c := range cases {
		slot, maj, min, ok := ParseHello(c.in)
		assert.Equal(t, c.wantOK, ok, "ok для %q", c.in)
		assert.Equal(t, c.wantSlot, slot, "slot для %q", c.in)
		assert.Equal(t, c.wantMaj, maj, "maj для %q", c.in)
		assert.Equal(t, c.wantMin, min, "min для %q", c.in)
	}
}

func TestReadHelloLine(t *testing.T) {
	rd := bufio.NewReader(bytes.NewReader([]byte("OTAHELLO slot=A ver=1.7\nLEFTOVER")))
	slot, maj, min := ReadHelloLine(rd)
	assert.Equal(t, "A", slot)
	assert.Equal(t, uint16(1), maj)
	assert.Equal(t, uint16(7), min)
	// Остаток потока не съеден сверх строки HELLO.
	rest, _ := rd.ReadString(0)
	assert.Equal(t, "LEFTOVER", rest)

	// Нет HELLO (пустой поток) → slot="" (legacy-путь), не падаем.
	empty := bufio.NewReader(bytes.NewReader(nil))
	slot, _, _ = ReadHelloLine(empty)
	assert.Equal(t, "", slot)
}

func TestImageForActiveSlot(t *testing.T) {
	imgA := []byte{0xA, 0xA}
	imgB := []byte{0xB, 0xB, 0xB}
	pair := &Session{Bin: imgA, FWCRC32: 1, ImageB: imgB, FWCRC32B: 2, HasB: true}

	// Активен A → свободен B → image_B.
	bin, crc := pair.ImageForActiveSlot("A")
	assert.Equal(t, imgB, bin)
	assert.Equal(t, uint32(2), crc)
	// Активен B → свободен A → image_A.
	bin, crc = pair.ImageForActiveSlot("B")
	assert.Equal(t, imgA, bin)
	assert.Equal(t, uint32(1), crc)
	// Неизвестный слот → image_A (дефолт).
	bin, _ = pair.ImageForActiveSlot("")
	assert.Equal(t, imgA, bin)

	// Legacy без B: active=A всё равно image_A (нет образа B).
	legacy := &Session{Bin: imgA, FWCRC32: 1, HasB: false}
	bin, crc = legacy.ImageForActiveSlot("A")
	assert.Equal(t, imgA, bin)
	assert.Equal(t, uint32(1), crc)
}
