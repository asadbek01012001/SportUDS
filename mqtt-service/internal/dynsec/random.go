package dynsec

import (
	"crypto/rand"
	"encoding/hex"
)

// randomHex — простая обёртка над crypto/rand для генерации correlationData.
// Дублируется здесь чтобы dynsec пакет был самодостаточным.
func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
