package repository

import (
	"encoding/binary"
	"testing"

	"github.com/stretchr/testify/assert"
)

// words собирает образ из 32-битных слов (LE) — имитация таблицы векторов/указателей.
func words(ws ...uint32) []byte {
	b := make([]byte, len(ws)*abWord)
	for i, w := range ws {
		binary.LittleEndian.PutUint32(b[i*abWord:], w)
	}
	return b
}

func TestVerifyABPair_Empty(t *testing.T) {
	assert.Equal(t, "failed", VerifyABPair(nil, words(1)).Status)
	assert.Equal(t, "failed", VerifyABPair(words(1), nil).Status)
}

func TestVerifyABPair_SizeMismatch(t *testing.T) {
	r := VerifyABPair(words(1, 2), words(1, 2, 3))
	assert.Equal(t, "failed", r.Status)
	assert.Contains(t, r.Detail, "размеры")
}

func TestVerifyABPair_Identical(t *testing.T) {
	a := words(0x08009000, 0x12345678, 0x0800A000)
	r := VerifyABPair(a, append([]byte{}, a...))
	assert.Equal(t, "failed", r.Status)
	assert.Contains(t, r.Detail, "идентичны")
}

func TestVerifyABPair_SingleDelta_OK(t *testing.T) {
	const d = uint32(0x00038000) // база B − база A (пример из §7.2)
	// Слово 1 — общий код (не меняется); слова 0 и 2 — релоцированные указатели (+d).
	a := words(0x08009000, 0x12345678, 0x0800A000)
	b := words(0x08009000+d, 0x12345678, 0x0800A000+d)
	r := VerifyABPair(a, b)
	assert.Equal(t, "ok", r.Status)
	assert.Contains(t, r.Detail, "0x00038000")
}

func TestVerifyABPair_MultiDelta_Pending(t *testing.T) {
	a := words(0x08009000, 0x12345678, 0x0800A000)
	b := words(0x08009000+0x38000, 0x12345678, 0x0800A000+0x40000) // две разные дельты
	r := VerifyABPair(a, b)
	assert.Equal(t, "pending", r.Status)
}

func TestVerifyABPair_TailDiff_Pending(t *testing.T) {
	// Длина не кратна 4: выровненная часть идентична, различие — в хвостовом байте.
	a := append(words(0x08009000), 0xAA)
	b := append(words(0x08009000), 0xBB)
	r := VerifyABPair(a, b)
	assert.Equal(t, "pending", r.Status)
}
