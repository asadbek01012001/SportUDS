import { Request, Response } from 'express';
import { query, getClient } from '../config/database';
import { firmwareCrc32, verifyABPair, FW_SLOT_SIZE } from '../services/firmware.util';

// firmwares.controller.ts — OTA proshivka repozitoriysi (energolink ota-arch vehicle-service roli).
// Admin .bin yuklaydi; server o'zi o'lcham + CRC-32/ISO-HDLC ni hisoblaydi, slot capini (64KB)
// tekshiradi va A/B juftlik strukturaviy sverkasini bajaradi (§7.2). OTA boshlashda mqtt-service shu
// jadvaldan bin/CRC ni o'qib qurilmaga uzatadi.
//
// Yuklash TRANSPORTI: multipart o'rniga base64 JSON (proshivka ≤64KB — express.json 10mb limitiga
// bemalol sig'adi, qo'shimcha multer dependency shart emas). Xatti-harakat referencega sodiq.

// Metadata ustunlari (bin/image_b binarlarisiz — ro'yxat/detal uchun).
const META_COLS = `f.id, f.ver_major, f.ver_minor, f.ver_patch, f.target, f.channel, f.status,
  f.fw_crc32, f.fw_size, f.fw_size_b, f.fw_crc32_b, f.pair_check, f.pair_check_detail,
  COALESCE(f.release_notes, '') AS release_notes, f.uploaded_by, u.full_name AS uploaded_by_name,
  f.created_at,
  (f.ver_major || '.' || f.ver_minor || '.' || f.ver_patch) AS version`;

// decodeBin — base64 stringni Buffer'ga aylantiradi va slot capiga (64KB) tekshiradi.
// (bin | null, error | null) qaytaradi. slot — xabar uchun yorliq ("A"/"B").
function decodeBin(b64: unknown, slot: string): { bin: Buffer | null; error: string | null } {
  if (typeof b64 !== 'string' || b64.length === 0) {
    return { bin: null, error: `image ${slot} (.bin, base64) talab qilinadi` };
  }
  const bin = Buffer.from(b64, 'base64');
  if (bin.length === 0) {
    return { bin: null, error: `image ${slot} bo'sh yoki noto'g'ri base64` };
  }
  if (bin.length > FW_SLOT_SIZE) {
    return { bin: null, error: `image ${slot} slotdan katta (64KB)` };
  }
  return { bin, error: null };
}

// GET /api/firmwares — proshivkalar ro'yxati (binarlarsiz).
export const listFirmwares = async (_req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT ${META_COLS} FROM firmwares f
       LEFT JOIN users u ON u.id = f.uploaded_by
       ORDER BY f.ver_major DESC, f.ver_minor DESC, f.ver_patch DESC, f.created_at DESC`,
    );
    res.json({ success: true, data: rows, total: rows.length });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// GET /api/firmwares/:id — bitta proshivka metadatasi.
export const getFirmware = async (req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT ${META_COLS} FROM firmwares f
       LEFT JOIN users u ON u.id = f.uploaded_by WHERE f.id = $1`,
      [req.params.id],
    );
    if (rows.length === 0) {
      res.status(404).json({ success: false, error: 'Proshivka topilmadi' });
      return;
    }
    res.json({ success: true, data: rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// POST /api/firmwares — proshivka yuklash. Body: { ver_major, ver_minor, ver_patch?, target,
// channel?, status?, release_notes?, file_a (base64), file_b? (base64) }.
export const uploadFirmware = async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;

  const verMajor = Number(b.ver_major);
  const verMinor = Number(b.ver_minor);
  const verPatch = b.ver_patch != null && b.ver_patch !== '' ? Number(b.ver_patch) : 0;
  const target = typeof b.target === 'string' ? b.target.trim() : '';
  if (!Number.isInteger(verMajor) || !Number.isInteger(verMinor) || !Number.isInteger(verPatch) || !target) {
    res.status(400).json({ success: false, error: 'ver_major, ver_minor (butun) va target talab qilinadi' });
    return;
  }

  // status ixtiyoriy; bo'sh → draft. Ustunda CHECK bor (draft|beta|stable), lekin oldindan validatsiya.
  const status = typeof b.status === 'string' && b.status ? b.status : 'draft';
  if (!['draft', 'beta', 'stable'].includes(status)) {
    res.status(400).json({ success: false, error: 'status: draft | beta | stable' });
    return;
  }
  const channel = typeof b.channel === 'string' && b.channel ? b.channel : 'stable';
  const releaseNotes = typeof b.release_notes === 'string' ? b.release_notes : null;

  const a = decodeBin(b.file_a, 'A');
  if (a.error) {
    res.status(400).json({ success: false, error: a.error });
    return;
  }
  const binA = a.bin!;

  // image_B ixtiyoriy: bor → A/B juft (§7.2 sverka), yo'q → legacy single-image.
  let binB: Buffer | null = null;
  let pairCheck: string | null = null;
  let pairDetail: string | null = null;
  let crcB: number | null = null;
  let sizeB: number | null = null;
  if (b.file_b != null && b.file_b !== '') {
    const bb = decodeBin(b.file_b, 'B');
    if (bb.error) {
      res.status(400).json({ success: false, error: bb.error });
      return;
    }
    binB = bb.bin!;
    const v = verifyABPair(binA, binB);
    pairCheck = v.status;
    pairDetail = v.detail;
    crcB = firmwareCrc32(binB);
    sizeB = binB.length;
  }

  try {
    const { rows } = await query(
      `INSERT INTO firmwares
         (ver_major, ver_minor, ver_patch, target, channel, status,
          fw_crc32, fw_size, bin, fw_crc32_b, fw_size_b, image_b,
          pair_check, pair_check_detail, release_notes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id`,
      [
        verMajor, verMinor, verPatch, target, channel, status,
        firmwareCrc32(binA), binA.length, binA, crcB, sizeB, binB,
        pairCheck, pairDetail, releaseNotes, req.user?.userId || null,
      ],
    );
    // Yaratilgandan keyin metadatani join bilan qaytaramiz.
    const { rows: full } = await query(
      `SELECT ${META_COLS} FROM firmwares f
       LEFT JOIN users u ON u.id = f.uploaded_by WHERE f.id = $1`,
      [rows[0].id],
    );
    res.status(201).json({ success: true, data: full[0] });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === '23505') {
      res.status(409).json({ success: false, error: 'Bu target uchun shu versiya allaqachon mavjud' });
      return;
    }
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// GET /api/firmwares/:id/download — image_A .bin faylini yuklab olish.
export const downloadFirmware = async (req: Request, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT bin, (ver_major || '.' || ver_minor || '.' || ver_patch) AS version
       FROM firmwares WHERE id = $1`,
      [req.params.id],
    );
    if (rows.length === 0) {
      res.status(404).json({ success: false, error: 'Proshivka topilmadi' });
      return;
    }
    res.setHeader('Content-Disposition', `attachment; filename=fw_${rows[0].version}.bin`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(rows[0].bin);
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// PATCH /api/firmwares/:id — status/channel/release_notes qisman tahriri (null = tegmaslik).
export const patchFirmware = async (req: Request, res: Response) => {
  const { status, channel, release_notes } = req.body as {
    status?: string; channel?: string; release_notes?: string;
  };
  if (status != null && !['draft', 'beta', 'stable'].includes(status)) {
    res.status(400).json({ success: false, error: 'status: draft | beta | stable' });
    return;
  }
  try {
    const { rowCount } = await query(
      `UPDATE firmwares SET
         status        = COALESCE($2, status),
         channel       = COALESCE($3, channel),
         release_notes = COALESCE($4, release_notes)
       WHERE id = $1`,
      [req.params.id, status ?? null, channel ?? null, release_notes ?? null],
    );
    if (rowCount === 0) {
      res.status(404).json({ success: false, error: 'Proshivka topilmadi' });
      return;
    }
    const { rows } = await query(
      `SELECT ${META_COLS} FROM firmwares f
       LEFT JOIN users u ON u.id = f.uploaded_by WHERE f.id = $1`,
      [req.params.id],
    );
    res.json({ success: true, data: rows[0] });
  } catch {
    res.status(500).json({ success: false, error: 'Server xatosi' });
  }
};

// DELETE /api/firmwares/:id — proshivkani o'chirish. Aktiv OTA sessiyasi (offered/downloading) bo'lsa
// 409: uchayotgan proshivkani o'chirib bo'lmaydi. Yakunlangan sessiyalar tarixi (RESTRICT FK) shu
// tranzaksiyada o'chiriladi.
export const deleteFirmware = async (req: Request, res: Response) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const active = await client.query(
      `SELECT 1 FROM ota_sessions WHERE firmware_id = $1 AND status IN ('offered','downloading') LIMIT 1`,
      [req.params.id],
    );
    if ((active.rowCount ?? 0) > 0) {
      await client.query('ROLLBACK');
      res.status(409).json({ success: false, error: 'Proshivka aktiv OTA yangilanishida ishlatilmoqda' });
      return;
    }
    await client.query(`DELETE FROM ota_sessions WHERE firmware_id = $1`, [req.params.id]);
    const del = await client.query(`DELETE FROM firmwares WHERE id = $1`, [req.params.id]);
    if (del.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: 'Proshivka topilmadi' });
      return;
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ success: false, error: 'Server xatosi' });
  } finally {
    client.release();
  }
};
