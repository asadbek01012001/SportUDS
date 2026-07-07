-- KAN-12 Rollout (§5/§14): массовая раскатка прошивки на организацию. Воркер (vehicle-service)
-- назначает устройства ПО ОЧЕРЕДИ (single-active слот, миграция 066): как слот освобождается —
-- следующий pending-таргет. Прогресс/доля успеха — из статусов таргетов.
CREATE TABLE IF NOT EXISTS ota_rollouts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    firmware_id     UUID NOT NULL REFERENCES firmwares(id),
    level           TEXT NOT NULL DEFAULT 'normal',  -- normal/priority/force (§5; исполняет устройство)
    status          TEXT NOT NULL DEFAULT 'running',  -- running/completed/stopped
    created_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ota_rollout_targets (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rollout_id  UUID NOT NULL REFERENCES ota_rollouts(id) ON DELETE CASCADE,
    device_uid  INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',  -- pending → sent → success/failed
    session_id  UUID,                             -- назначенная ota_session
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rollout_id, device_uid)
);
CREATE INDEX IF NOT EXISTS idx_rollout_targets_pending ON ota_rollout_targets(rollout_id) WHERE status = 'pending';
