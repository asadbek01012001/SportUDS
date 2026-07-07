package repository

import (
	"bytes"
	"encoding/binary"
	"fmt"
)

// firmware_verify.go — структурная сверка пары образов A/B одной версии (Confluence OTA_server §7.2).
//
// Прошивка линкуется под адрес слота, поэтому image_A и image_B — одна и та же прошивка, но
// различающиеся релоцированными словами (таблица векторов, абсолютные указатели) на величину
// (база слота B − база слота A). Полная сверка §7.2 (reset-вектор A→слот A, B→слот B, ВСЕ дельты
// == разнице баз) требует базовых адресов слотов из 6_hardware_all — их пока нет (задача Elbek).
//
// Здесь — то, что проверяемо БЕЗ баз слотов:
//   - оба образа непусты и равны по размеру;
//   - образы не идентичны (иначе B не перелинкован под свой слот);
//   - ВСЕ различия — выровненные 4-байтовые слова с ЕДИНОЙ дельтой (b−a), т.е. структурно
//     консистентны с релокацией по одному смещению.
// Единая дельта → ok (точная сверка баз — позже); несколько дельт / несловесные различия → pending.

const abWord = 4 // ARM Cortex-M: 32-битное слово (таблица векторов и указатели выровнены по 4)

// ABVerifyResult — итог сверки пары.
type ABVerifyResult struct {
	Status string // "ok" | "failed" | "pending"
	Detail string
}

// VerifyABPair выполняет структурную сверку §7.2 (без баз слотов). a — image_A, b — image_B.
func VerifyABPair(a, b []byte) ABVerifyResult {
	if len(a) == 0 || len(b) == 0 {
		return ABVerifyResult{"failed", "пустой образ (A или B)"}
	}
	if len(a) != len(b) {
		return ABVerifyResult{"failed", fmt.Sprintf("размеры образов различаются: A=%d, B=%d", len(a), len(b))}
	}
	if bytes.Equal(a, b) {
		return ABVerifyResult{"failed", "образы идентичны (CRC совпадают) — B не перелинкован под свой слот"}
	}

	deltas := map[uint32]int{} // дельта (b-a) выровненного слова → сколько раз встретилась
	subWordDiff := false       // различие в «хвосте» < 4 байт или невыровненное — не релокация

	full := (len(a) / abWord) * abWord
	for off := 0; off < full; off += abWord {
		wa := binary.LittleEndian.Uint32(a[off : off+abWord])
		wb := binary.LittleEndian.Uint32(b[off : off+abWord])
		if wa != wb {
			deltas[wb-wa]++ // uint32-вычитание: релокация даёт постоянную дельту = базаB−базаA
		}
	}
	// Хвост (длина не кратна 4): любое различие там — не релоцируемое слово.
	if !bytes.Equal(a[full:], b[full:]) {
		subWordDiff = true
	}

	if len(deltas) == 1 && !subWordDiff {
		var d uint32
		var n int
		for k, v := range deltas {
			d, n = k, v
		}
		return ABVerifyResult{"ok", fmt.Sprintf(
			"структурно консистентно: единая дельта 0x%08X (%d различий); точная сверка баз слотов — после разметки 6_hardware_all", d, n)}
	}
	return ABVerifyResult{"pending", fmt.Sprintf(
		"различий-дельт: %d, несловесные различия: %v — нужны базовые адреса слотов A/B (6_hardware_all) для точной сверки §7.2", len(deltas), subWordDiff)}
}
