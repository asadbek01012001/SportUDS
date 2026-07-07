package model

// MachineTelemetry — trenajor (mashina) qurilmasidan keladigan telemetriya.
// Qurilma JSON payload publish qiladi: devices/<client_id>/telemetry.
// Barcha o'lchov maydonlari ixtiyoriy (pointer) — har xil trenajor har xil sensor to'plamiga ega.
// id — majburiy (device_uid, strict-lookup uchun anti-spoofing).
type MachineTelemetry struct {
	ID        uint32   `json:"id"`                   // device_uid — qurilmaning raqamli identifikatori
	BarCm     *float64 `json:"bar_cm,omitempty"`     // shtanga/dastak balandligi (sm) — measurements.bar_cm
	WeightKg  *float64 `json:"weight_kg,omitempty"`  // yuk (kg) — measurements.weight_kg
	Reps      *int     `json:"reps,omitempty"`       // takrorlar soni
	Speed     *float64 `json:"speed,omitempty"`      // harakat tezligi (m/s)
	HeartRate *int     `json:"heart_rate,omitempty"` // yurak urishi (bpm), agar sensor bo'lsa
	Tim       uint32   `json:"tim,omitempty"`        // Unix timestamp (UTC); 0 = server vaqti ishlatiladi
	Ver       string   `json:"ver,omitempty"`        // proshivka/protokol versiyasi; "" = legacy (ver yubormaydi)
}

// WSBroadcast — frontendga (web-trener / mobil) yuboriladigan jonli telemetriya xabari.
type WSBroadcast struct {
	Type string           `json:"type"` // "machine_telemetry"
	Data MachineTelemetry `json:"data"`
}
