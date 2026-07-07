package model

import (
	"encoding/json"
	"testing"
)

// TestDeviceTelemetry_UnmarshalID_Boundaries проверяет, что парсинг payload
// принимает device_uid в диапазоне Unsigned Int (32-bit) согласно спеке устройства.
// До фикса 2026-05-16 поле было uint8 (0..255), и любой id > 255 ломал ingest
// (см. research 2026-05-16_1700--device-telemetry-ingest-v1).
func TestDeviceTelemetry_UnmarshalID_Boundaries(t *testing.T) {
	cases := []struct {
		name    string
		payload string
		wantID  uint32
		wantErr bool
	}{
		{"zero", `{"id":0,"prs":0,"flw":0,"tmp":0,"tim":0,"fix":0,"lat":0,"lon":0,"spd":0,"crs":0}`, 0, false},
		{"small_213", `{"id":213,"prs":0,"flw":0,"tmp":0,"tim":0,"fix":0,"lat":0,"lon":0,"spd":0,"crs":0}`, 213, false},
		{"above_uint8_9999", `{"id":9999,"prs":0,"flw":0,"tmp":0,"tim":0,"fix":0,"lat":0,"lon":0,"spd":0,"crs":0}`, 9999, false},
		{"max_uint32", `{"id":4294967295,"prs":0,"flw":0,"tmp":0,"tim":0,"fix":0,"lat":0,"lon":0,"spd":0,"crs":0}`, 4294967295, false},
		{"negative_rejected", `{"id":-1,"prs":0,"flw":0,"tmp":0,"tim":0,"fix":0,"lat":0,"lon":0,"spd":0,"crs":0}`, 0, true},
		{"overflow_uint32_rejected", `{"id":4294967296,"prs":0,"flw":0,"tmp":0,"tim":0,"fix":0,"lat":0,"lon":0,"spd":0,"crs":0}`, 0, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var got DeviceTelemetry
			err := json.Unmarshal([]byte(tc.payload), &got)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error for payload %s, got nil (id=%d)", tc.payload, got.ID)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v (payload=%s)", err, tc.payload)
			}
			if got.ID != tc.wantID {
				t.Fatalf("ID mismatch: got %d, want %d", got.ID, tc.wantID)
			}
		})
	}
}

// TestDeviceTelemetry_NewFormat — реальный payload устройства 888 (новая прошивка,
// 2026-06-04): ключи ts/t_g/t_m/gnss. Регрессия: координаты отбрасывались, т.к.
// парсер читал fix (отсутствует) → Fix=0.
func TestDeviceTelemetry_NewFormat(t *testing.T) {
	payload := `{"id":888,"ts":1780557214,"flw":0.0,"prs":260.00,"t_g":21.5,"t_m":33.2,"lat":41.287962,"lon":69.308084,"spd":0.01,"crs":0,"gnss":true}`
	var got DeviceTelemetry
	if err := json.Unmarshal([]byte(payload), &got); err != nil {
		t.Fatalf("unmarshal new format: %v", err)
	}
	if got.ID != 888 {
		t.Fatalf("ID: got %d want 888", got.ID)
	}
	if got.Fix != 1 {
		t.Fatalf("Fix: got %d want 1 (gnss:true)", got.Fix)
	}
	if got.Lat != 41.287962 || got.Lon != 69.308084 {
		t.Fatalf("coords: got %f,%f", got.Lat, got.Lon)
	}
	if got.Tmp != 21.5 {
		t.Fatalf("Tmp from t_g: got %f want 21.5", got.Tmp)
	}
	if got.Etm == nil || *got.Etm != 33.2 {
		t.Fatalf("Etm from t_m: got %v want 33.2", got.Etm)
	}
	if got.Tim != 1780557214 {
		t.Fatalf("Tim from ts: got %d", got.Tim)
	}
	if got.Prs != 260.0 {
		t.Fatalf("Prs: got %f", got.Prs)
	}
}

// TestDeviceTelemetry_OldFormat — эмулятор/старые устройства (fix/tim/tmp) — должны
// продолжать парситься (оба формата сосуществуют в период миграции).
func TestDeviceTelemetry_OldFormat(t *testing.T) {
	payload := `{"id":1001,"prs":214.08,"flw":63967.87,"tmp":27.24,"tim":1780557243,"fix":1,"lat":41.309163,"lon":69.240887,"spd":36.77,"crs":244.84}`
	var got DeviceTelemetry
	if err := json.Unmarshal([]byte(payload), &got); err != nil {
		t.Fatalf("unmarshal old format: %v", err)
	}
	if got.ID != 1001 || got.Fix != 1 || got.Tmp != 27.24 || got.Tim != 1780557243 {
		t.Fatalf("old format parse mismatch: %+v", got)
	}
	if got.Lat != 41.309163 {
		t.Fatalf("lat: got %f", got.Lat)
	}
}

// TestDeviceTelemetry_Ver — поле ver (KAN-10): число/строка → строка; нет ver = legacy ("").
func TestDeviceTelemetry_Ver(t *testing.T) {
	cases := []struct {
		name    string
		payload string
		want    string
	}{
		{"number", `{"id":1,"prs":200,"ver":3}`, "3"},
		{"string", `{"id":1,"prs":200,"ver":"1.2.0"}`, "1.2.0"},
		{"legacy_absent", `{"id":1,"prs":200,"tmp":20}`, ""},
		{"null", `{"id":1,"prs":200,"ver":null}`, ""},
	}
	for _, c := range cases {
		var got DeviceTelemetry
		if err := json.Unmarshal([]byte(c.payload), &got); err != nil {
			t.Fatalf("%s: unmarshal err: %v", c.name, err)
		}
		if got.Ver != c.want {
			t.Fatalf("%s: Ver got %q want %q", c.name, got.Ver, c.want)
		}
	}
}

// TestDeviceTelemetry_TolerantMissingFlow — расходомер убран (KAN-10): payload без flw
// парсится без ошибки, Flw=0; лишние неизвестные поля игнорируются.
func TestDeviceTelemetry_TolerantMissingFlow(t *testing.T) {
	payload := `{"id":55,"prs":195.0,"tmp":22.0,"ts":1780557214,"gnss":true,"lat":41.3,"lon":69.2,"ver":2,"unknown_future":123}`
	var got DeviceTelemetry
	if err := json.Unmarshal([]byte(payload), &got); err != nil {
		t.Fatalf("tolerant parse err: %v", err)
	}
	if got.Flw != 0 {
		t.Fatalf("Flw без поля flw должен быть 0: got %f", got.Flw)
	}
	if got.Prs != 195.0 || got.Ver != "2" || got.Fix != 1 {
		t.Fatalf("parse mismatch: %+v", got)
	}
}

// TestDeviceTelemetry_GnssVariants — gnss как bool/строка/число → Fix.
func TestDeviceTelemetry_GnssVariants(t *testing.T) {
	cases := []struct {
		gnss string
		want uint8
	}{
		{`true`, 1}, {`false`, 0}, {`"true"`, 1}, {`"false"`, 0}, {`1`, 1}, {`0`, 0}, {`"No Fix"`, 0},
		// KAN-1: устройства шлют fix-type числом (2D/3D) или строкой/NMEA — должны давать Fix=1.
		{`2`, 1}, {`3`, 1}, {`"2D"`, 1}, {`"3D"`, 1}, {`"A"`, 1}, {`"valid"`, 1},
		{`"V"`, 0}, {`"void"`, 0}, {`"none"`, 0},
	}
	for _, c := range cases {
		var got DeviceTelemetry
		p := `{"id":1,"ts":1,"lat":41.0,"lon":69.0,"gnss":` + c.gnss + `}`
		if err := json.Unmarshal([]byte(p), &got); err != nil {
			t.Fatalf("gnss=%s err: %v", c.gnss, err)
		}
		if got.Fix != c.want {
			t.Fatalf("gnss=%s: Fix got %d want %d", c.gnss, got.Fix, c.want)
		}
	}
}
