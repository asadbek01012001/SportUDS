-- История привязок device → vehicle. Активная — assigned_to IS NULL.
-- Используется для отчётов "какое устройство было на этой машине в N-период".

CREATE TABLE IF NOT EXISTS device_assignments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id       UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    vehicle_id      UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    assigned_from   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    assigned_to     TIMESTAMP WITH TIME ZONE,                -- NULL = активная
    assigned_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_device_assignments_device  ON device_assignments(device_id);
CREATE INDEX IF NOT EXISTS idx_device_assignments_vehicle ON device_assignments(vehicle_id);
-- Один активный assignment на device одновременно
CREATE UNIQUE INDEX IF NOT EXISTS uniq_device_assignments_active_device
    ON device_assignments(device_id) WHERE assigned_to IS NULL;
