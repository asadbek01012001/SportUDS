-- KAN-32 (hardening): не более ОДНОЙ активной OTA-сессии одновременно.
-- На TCP-проводе нет device-auth, а claim FIFO device-agnostic (§3.4 — сервер говорит первым,
-- ID-фрейма от устройства нет). Глобальная сериализация исключает прошивку «не того» устройства
-- и двойное назначение одному (§5 MVP: одно устройство; поэтапный rollout §9 — задел на потом).
-- Уникальный индекс по константе с partial-предикатом = максимум одна строка в активных статусах.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ota_one_active
    ON ota_sessions ((1)) WHERE status IN ('offered', 'downloading');
