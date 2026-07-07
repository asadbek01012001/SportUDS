// firmware.util.ts — OTA proshivka yuklashda server tomonida hisoblanadigan yaxlitlik/sverka.
// energolink ota-arch dan port: repository/firmwares.go (CRC-32/ISO-HDLC == crc32.IEEE) va
// repository/firmware_verify.go (A/B juftlik strukturaviy sverkasi §7.2).
//
// CRC qurilma OTA-protokolida ishlatilgani bilan BIR XIL algoritm bo'lishi shart (mqtt-service
// store.go fw_crc32 ni firmwares'dan o'qib qurilmaga uzatadi, qurilma solishtiradi).

// FW_SLOT_SIZE — proshivka slotining maksimal o'lchami (A/B slot). mqtt-service ota.SlotSize bilan
// mos bo'lishi kerak.
export const FW_SLOT_SIZE = 64 * 1024;

// CRC-32/ISO-HDLC (zlib/IEEE 802.3) — polinom 0xEDB88320 (teskari), init 0xFFFFFFFF, xorout
// 0xFFFFFFFF. Go'dagi hash/crc32.ChecksumIEEE bilan bit-ma-bit mos.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

// firmwareCrc32 — proshivkaning to'liq CRC-32/ISO-HDLC qiymatini (uint32) qaytaradi.
export function firmwareCrc32(bin: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bin.length; i++) {
    crc = CRC_TABLE[(crc ^ bin[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface AbVerifyResult {
  status: 'ok' | 'failed' | 'pending';
  detail: string;
}

const AB_WORD = 4; // ARM Cortex-M: 32-bitli so'z (vektor jadvali va ko'rsatkichlar 4 ga hizalangan)

// verifyABPair — bir versiyaning A/B image juftligini strukturaviy sverkasi (§7.2, slot bazalarisiz).
// Proshivka slot manziliga linklangani uchun image_A va image_B — bir xil proshivka, lekin relokatsiya
// qilingan so'zlari (vektor jadvali, absolyut ko'rsatkichlar) slot bazalari farqiga siljigan.
// Bazalarsiz tekshiriladigani: ikkala image bo'sh emas va teng o'lchamli; identik emas; barcha farqlar
// yagona delta (b-a) bilan hizalangan 4-baytli so'zlar (bitta siljish bilan relokatsiyaga mos).
export function verifyABPair(a: Buffer, b: Buffer): AbVerifyResult {
  if (a.length === 0 || b.length === 0) {
    return { status: 'failed', detail: "bo'sh image (A yoki B)" };
  }
  if (a.length !== b.length) {
    return { status: 'failed', detail: `image o'lchamlari farq qiladi: A=${a.length}, B=${b.length}` };
  }
  if (a.equals(b)) {
    return { status: 'failed', detail: 'image lar identik (CRC mos) — B o\'z slotiga qayta linklanmagan' };
  }

  const deltas = new Map<number, number>(); // delta (b-a) → nechta marta uchradi
  let subWordDiff = false;                    // 4 baytdan kichik "dum" yoki hizalanmagan farq — relokatsiya emas

  const full = Math.floor(a.length / AB_WORD) * AB_WORD;
  for (let off = 0; off < full; off += AB_WORD) {
    const wa = a.readUInt32LE(off);
    const wb = b.readUInt32LE(off);
    if (wa !== wb) {
      const d = (wb - wa) >>> 0; // uint32 ayirma: relokatsiya doimiy delta = bazaB−bazaA beradi
      deltas.set(d, (deltas.get(d) || 0) + 1);
    }
  }
  // Dum (uzunlik 4 ga karrali emas): u yerdagi har qanday farq relokatsiya qilinadigan so'z emas.
  if (!a.subarray(full).equals(b.subarray(full))) {
    subWordDiff = true;
  }

  if (deltas.size === 1 && !subWordDiff) {
    const [[d, n]] = deltas.entries();
    const hex = d.toString(16).toUpperCase().padStart(8, '0');
    return {
      status: 'ok',
      detail: `strukturaviy mos: yagona delta 0x${hex} (${n} ta farq); slot bazalari bo'yicha aniq sverka keyinroq`,
    };
  }
  return {
    status: 'pending',
    detail: `delta-farqlar: ${deltas.size}, so'zsiz farqlar: ${subWordDiff} — aniq §7.2 sverka uchun A/B slot baza manzillari kerak`,
  };
}
