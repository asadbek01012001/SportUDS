package model

// DeviceTelemetry — combined payload from LTE device (ТЗ 6_hardware).
// 6 sensor channels: CNG pressure, flow meter, gas temp, engine temp, IMU 6-axis, GNSS.
type DeviceTelemetry struct {
	ID  uint32   `json:"id"`            // LTE_DEVICE_ID (Unsigned Int по спеке устройства, 0..2^32-1)
	Prs float64  `json:"prs"`           // CNG pressure (Bar) — Sensata 55PP31-01
	Flw float64  `json:"flw"`           // Cumulative gas flow (L) — Asair AFM3000-200
	Tmp float64  `json:"tmp"`           // Gas temperature (°C) — DS18B20 on gas line
	Etm *float64 `json:"etm,omitempty"` // Engine temperature (°C) — DS18B20 on cooling circuit
	Ax  *float64 `json:"ax,omitempty"`  // Accelerometer X (g) — BMI270
	Ay  *float64 `json:"ay,omitempty"`  // Accelerometer Y (g)
	Az  *float64 `json:"az,omitempty"`  // Accelerometer Z (g)
	Gx  *float64 `json:"gx,omitempty"`  // Gyroscope X (°/s) — BMI270
	Gy  *float64 `json:"gy,omitempty"`  // Gyroscope Y (°/s)
	Gz  *float64 `json:"gz,omitempty"`  // Gyroscope Z (°/s)
	Tim uint32   `json:"tim"`           // Unix timestamp (UTC)
	Fix uint8    `json:"fix"`           // GNSS fix: 0=no fix, 1=fixed — u-blox NEO-M10
	Lat float64  `json:"lat"`           // Latitude
	Lon float64  `json:"lon"`           // Longitude
	Spd float64  `json:"spd"`           // Speed (km/h)
	Crs float64  `json:"crs"`           // Course (0-360°)
	Ver string   `json:"ver,omitempty"` // протокол/прошивка устройства; "" = legacy (нет ver) — KAN-10
}

// WSBroadcast — frontend ga yuboriladigan xabar
type WSBroadcast struct {
	Type string          `json:"type"` // "device_telemetry"
	Data DeviceTelemetry `json:"data"`
}
