-- Eski idempotent bo'lmagan seed natijasida paydo bo'lgan dublikat zal/trenajorlarni tozalash

-- 1) Dublikat zallar (bir xil nom) — eng eskisini qoldirib, qolganini o'chiramiz
--    (o'chirilgan zal mashinalari ON DELETE CASCADE bilan ketadi)
DELETE FROM halls a USING halls b
WHERE a.name = b.name AND a.ctid > b.ctid;

-- 2) Bir zal ichidagi dublikat trenajorlar (bir xil nom) — eng eskisini qoldiramiz
DELETE FROM machines a USING machines b
WHERE a.hall_id = b.hall_id AND a.name = b.name AND a.ctid > b.ctid;

-- 3) Kelajakda dublikat bo'lmasligi uchun UNIQUE cheklovlar
ALTER TABLE halls    ADD CONSTRAINT halls_name_uniq       UNIQUE (name);
ALTER TABLE machines ADD CONSTRAINT machines_hall_name_uniq UNIQUE (hall_id, name);
