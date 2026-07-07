UPDATE devices SET status = 'inactive', updated_at = NOW()
WHERE device_uid BETWEEN 1001 AND 1020;
