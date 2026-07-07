-- Активация демо-устройств 1001-1020 для fleet-simulator: mqtt-service отклоняет
-- телеметрию устройств со status='inactive' (rejected: ... is not active), из-за чего
-- демо-машины не появлялись онлайн. Seed создавал их 'active', но позже они были
-- деактивированы (вручную/при простое). Реактивируем — пока симулятор шлёт телеметрию,
-- last_seen держится свежим и статус не откатывается (нет авто-деактиватора в коде).
UPDATE devices SET status = 'active', updated_at = NOW()
WHERE device_uid BETWEEN 1001 AND 1020;
