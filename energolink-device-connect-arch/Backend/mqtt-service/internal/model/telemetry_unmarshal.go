package model

import (
	"encoding/json"
	"strconv"
	"strings"
)

// UnmarshalJSON — толерантный парсинг телеметрии: поддерживает ДВА формата ключей,
// которые сосуществуют на проде в период миграции прошивки (2026-06-04, Elbek):
//
//   старый (эмулятор + ранние устройства): tim, tmp, etm, fix (uint8 0/1)
//   новый  (реальные устройства):          ts,  t_g, t_m, gnss (bool/string "true")
//
// Совпадающие ключи (id, prs, flw, lat, lon, spd, crs, ax..gz) одинаковы в обоих.
// Без этого новый формат давал Fix=0 → координаты отбрасывались (service.go gate),
// и реальные устройства не появлялись на карте.
func (t *DeviceTelemetry) UnmarshalJSON(b []byte) error {
	var a struct {
		ID  uint32  `json:"id"`
		Prs float64 `json:"prs"`
		Flw float64 `json:"flw"`
		// gas temp: t_g (новый) > tmp (старый)
		Tmp *float64 `json:"tmp"`
		Tg  *float64 `json:"t_g"`
		// engine/module temp: t_m (новый) > etm (старый)
		Etm *float64 `json:"etm"`
		Tm  *float64 `json:"t_m"`
		Ax  *float64 `json:"ax"`
		Ay  *float64 `json:"ay"`
		Az  *float64 `json:"az"`
		Gx  *float64 `json:"gx"`
		Gy  *float64 `json:"gy"`
		Gz  *float64 `json:"gz"`
		// time: ts (новый) > tim (старый)
		Tim *uint32 `json:"tim"`
		Ts  *uint32 `json:"ts"`
		// GNSS fix: gnss (новый, bool/строка "true") > fix (старый, uint8)
		Fix  *uint8          `json:"fix"`
		Gnss json.RawMessage `json:"gnss"`
		Lat  float64         `json:"lat"`
		Lon  float64         `json:"lon"`
		Spd  float64         `json:"spd"`
		Crs  float64         `json:"crs"`
		// версия протокола/прошивки: число ("ver":3) или строка ("ver":"1.2"); нет ver = legacy.
		Ver json.RawMessage `json:"ver"`
	}
	if err := json.Unmarshal(b, &a); err != nil {
		return err
	}

	t.ID, t.Prs, t.Flw = a.ID, a.Prs, a.Flw
	t.Ver = normalizeVer(a.Ver)
	t.Lat, t.Lon, t.Spd, t.Crs = a.Lat, a.Lon, a.Spd, a.Crs
	t.Ax, t.Ay, t.Az, t.Gx, t.Gy, t.Gz = a.Ax, a.Ay, a.Az, a.Gx, a.Gy, a.Gz

	switch {
	case a.Tg != nil:
		t.Tmp = *a.Tg
	case a.Tmp != nil:
		t.Tmp = *a.Tmp
	}

	if a.Tm != nil {
		t.Etm = a.Tm
	} else {
		t.Etm = a.Etm
	}

	switch {
	case a.Ts != nil:
		t.Tim = *a.Ts
	case a.Tim != nil:
		t.Tim = *a.Tim
	}

	switch {
	case len(a.Gnss) > 0 && string(a.Gnss) != "null":
		t.Fix = parseGnssFix(a.Gnss)
	case a.Fix != nil:
		t.Fix = *a.Fix
	}

	return nil
}

// normalizeVer — версия прошивки/протокола из поля ver (число или строка) в строку.
// Отсутствие/null/пустое → "" (legacy-прибор, ver не шлёт — это норма, KAN-10).
func normalizeVer(raw json.RawMessage) string {
	s := strings.Trim(strings.TrimSpace(string(raw)), `"`)
	if s == "null" {
		return ""
	}
	return s
}

// parseGnssFix — нормализует поле gnss в Fix=1. Устройства шлют по-разному:
// bool true / "true" / число 1,2,3 (2D/3D fix) / "2D"/"3D" / NMEA "A" (active).
// 0 / "0" / false / "V" (void) / "none" / "no" → 0.
func parseGnssFix(raw json.RawMessage) uint8 {
	s := strings.ToLower(strings.Trim(strings.TrimSpace(string(raw)), `"`))
	switch s {
	case "", "0", "false", "v", "void", "none", "no", "nofix", "no_fix", "null":
		return 0
	case "true", "fixed", "fix", "a", "2d", "3d", "valid", "ok", "gnss":
		return 1
	}
	// числовой fix-type: 1=fix, 2=2D, 3=3D … (любое число ≥1 → есть фикс)
	if n, err := strconv.ParseFloat(s, 64); err == nil {
		if n >= 1 {
			return 1
		}
		return 0
	}
	return 0
}
