import { query } from '../config/database';

export interface UDSResult {
  p0: number;
  fMax: number;
  tMax: number;
  j: number;
  q: number;
  g: number;
  t1: number;
  t2: number;
  vMax: number;
  nMax: number;
  vQ: number;
  nQ: number;
  vG: number;
  nG: number;
}

/**
 * UDS formulalari asosida ko'rsatkichlarni hisoblaydi.
 *
 * P₀ = Fmax (izostatik rejimda)
 * J  = Fmax / tmax
 * Q  = 0.5×Fmax / t1
 * G  = 0.5×Fmax / t2
 * Vmax = S(Fmax) / tmax
 * Nmax = Fmax × Vmax
 */
export function calculateUDS(
  forceValues: number[],
  timeMs: number[],
  displacementValues: number[]
): UDSResult | null {
  if (!forceValues.length || !timeMs.length) return null;

  const fMax = Math.max(...forceValues);
  const fMaxIdx = forceValues.indexOf(fMax);
  const tMax = timeMs[fMaxIdx] - timeMs[0];

  const halfF = fMax * 0.5;

  // t1 — 0.5*Fmax ga yetish vaqti
  let t1 = 0;
  for (let i = 0; i < forceValues.length; i++) {
    if (forceValues[i] >= halfF) {
      t1 = timeMs[i] - timeMs[0];
      break;
    }
  }

  // t2 — 0.5*Fmax dan Fmax ga yetish vaqti
  const t2 = tMax - t1;

  const j = tMax > 0 ? fMax / tMax : 0;
  const q = t1 > 0 ? halfF / t1 : 0;
  const g = t2 > 0 ? halfF / t2 : 0;

  const sFmax = fMaxIdx < displacementValues.length ? displacementValues[fMaxIdx] : 0;
  const vMax = tMax > 0 ? sFmax / tMax : 0;
  const nMax = fMax * vMax;

  const t1Idx = timeMs.findIndex((t) => t - timeMs[0] >= t1);
  const sQ = t1Idx >= 0 && t1Idx < displacementValues.length ? displacementValues[t1Idx] : 0;
  const vQ = t1 > 0 ? sQ / t1 : 0;
  const nQ = halfF * vQ;

  const sG = sFmax - sQ;
  const vG = t2 > 0 ? sG / t2 : 0;
  const nG = halfF * vG;

  return { p0: fMax, fMax, tMax, j, q, g, t1, t2, vMax, nMax, vQ, nQ, vG, nG };
}

export async function saveIndicators(
  sessionId: string,
  attemptNumber: number,
  result: UDSResult
): Promise<void> {
  const { p0, fMax, tMax, j, q, g, t1, t2, vMax, nMax, vQ, nQ, vG, nG } = result;

  const existing = await query<{ f_max: number }>(
    'SELECT f_max FROM calculated_indicators WHERE session_id = $1 ORDER BY f_max DESC LIMIT 1',
    [sessionId]
  );
  const isBest = !existing.rows.length || fMax >= existing.rows[0].f_max;

  if (isBest) {
    await query(
      'UPDATE calculated_indicators SET is_best_attempt = FALSE WHERE session_id = $1',
      [sessionId]
    );
  }

  await query(
    `INSERT INTO calculated_indicators
      (session_id, attempt_number, p0_max_isometric, f_max, t_max,
       j_speed_strength_index, q_start_force, g_accelerating_force,
       t1_ms, t2_ms, v_max, n_max, v_q, n_q, v_g, n_g, is_best_attempt)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [sessionId, attemptNumber, p0, fMax, tMax, j, q, g, t1, t2, vMax, nMax, vQ, nQ, vG, nG, isBest]
  );
}
