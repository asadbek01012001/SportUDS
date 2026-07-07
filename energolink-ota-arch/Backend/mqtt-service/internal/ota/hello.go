package ota

import (
	"bufio"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// hello.go — HELLO §9.4: при TCP-подключении устройство ПЕРВЫМ шлёт ASCII-строку (не фрейм):
//
//	OTAHELLO slot=<A|B> ver=<maj>.<min>\n
//
// По активному слоту сервер выбирает образ свободного слота (§7.3). Парсер толерантен: мусор/
// отсутствие полей → slot="" (сервер сшлёт image_A по дефолту), не падаем.

// helloReadTimeout — сколько ждём строку HELLO. Реальное устройство шлёт её сразу при коннекте;
// legacy-устройство (до §9.4) HELLO не шлёт — по таймауту продолжаем без слота (обратная совместимость).
const helloReadTimeout = 5 * time.Second

// ParseHello разбирает строку HELLO. Возвращает активный слот ("A"/"B"/""), версию и ok.
// ok=false → это не валидный HELLO (нет префикса OTAHELLO).
func ParseHello(line string) (slot string, verMajor, verMinor uint16, ok bool) {
	f := strings.Fields(strings.TrimSpace(line))
	if len(f) == 0 || f[0] != "OTAHELLO" {
		return "", 0, 0, false
	}
	for _, tok := range f[1:] {
		switch {
		case strings.HasPrefix(tok, "slot="):
			v := strings.ToUpper(strings.TrimPrefix(tok, "slot="))
			if v == "A" || v == "B" {
				slot = v
			}
		case strings.HasPrefix(tok, "ver="):
			// Версия может быть 2- или 3-частной (устройство шлёт напр. "0.0.500"). Берём
			// maj=part[0], min=part[1]; лишние части игнорируем. SplitN(.,2) ломал min на 3 частях.
			parts := strings.Split(strings.TrimPrefix(tok, "ver="), ".")
			if len(parts) >= 1 {
				if maj, err := strconv.ParseUint(parts[0], 10, 16); err == nil {
					verMajor = uint16(maj)
				}
			}
			if len(parts) >= 2 {
				if min, err := strconv.ParseUint(parts[1], 10, 16); err == nil {
					verMinor = uint16(min)
				}
			}
		}
	}
	return slot, verMajor, verMinor, true
}

// FormatHello собирает строку HELLO для устройства/симулятора (с завершающим '\n').
func FormatHello(slot string, verMajor, verMinor uint16) string {
	return fmt.Sprintf("OTAHELLO slot=%s ver=%d.%d\n", slot, verMajor, verMinor)
}

// AsciiDump — печатные ASCII как есть, остальное как '.', для лог-диагностики сырых байт.
func AsciiDump(b []byte) string {
	out := make([]byte, len(b))
	for i, c := range b {
		if c >= 0x20 && c < 0x7F {
			out[i] = c
		} else {
			out[i] = '.'
		}
	}
	return string(out)
}

// ReadHelloLine читает строку HELLO из буфера (до '\n'). Толерантен: при таймауте/EOF/ошибке
// возвращает slot="" (legacy-устройство без HELLO), сервер продолжит с image_A. Прочитанные
// байты остаются «съеденными» из rd — последующие ReadFrame читают из того же rd (выравнивание).
func ReadHelloLine(rd *bufio.Reader) (slot string, verMajor, verMinor uint16) {
	line, err := rd.ReadString('\n')
	if err != nil && line == "" {
		return "", 0, 0 // нет HELLO (таймаут/закрытие) — legacy-путь
	}
	slot, verMajor, verMinor, _ = ParseHello(line)
	return slot, verMajor, verMinor
}
