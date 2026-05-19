import { query } from '../config/database';

interface RecentRow {
  session_date: Date;
  f_max: number;
  j_speed_strength_index: number;
  n_max: number;
}

export interface IndicatorChange {
  name: string;
  change: number;
  percent: number;
}

export interface RecommendationResult {
  recommendation: string;
  trend: 'positive' | 'negative' | 'stable' | 'insufficient_data';
  indicators: string[];
  changes: IndicatorChange[];
}

const TREND_MESSAGES = {
  positive: 'Ko\'rsatkichlar yaxshilanmoqda. Joriy yuklamani saqlang va hajmni asta-sekin oshiring.',
  negative: (indicators: string[]) =>
    `Ko\'rsatkichlar pasaymoqda (${indicators.join('; ')}). Dam olish va tiklanishga e\'tibor bering. Yuklamani kamaytirish tavsiya etiladi.`,
  stable: 'Ko\'rsatkichlar barqaror. Yangi stimul uchun mashg\'ulot turini o\'zgartiring yoki intensivlikni oshiring.',
};

function calcChange(
  latest: RecentRow,
  previous: RecentRow,
  key: keyof RecentRow,
  name: string
): IndicatorChange | null {
  const curr = Number(latest[key] ?? 0);
  const prev = Number(previous[key] ?? 0);
  if (prev === 0) return null;
  const percent = ((curr - prev) / prev) * 100;
  return { name, change: curr - prev, percent };
}

export async function generateRecommendation(athleteId: string): Promise<RecommendationResult> {
  const recent = await query<RecentRow>(
    `SELECT ts.session_date, ci.f_max, ci.j_speed_strength_index, ci.n_max
     FROM test_sessions ts
     JOIN calculated_indicators ci ON ci.session_id = ts.id AND ci.is_best_attempt = TRUE
     WHERE ts.athlete_id = $1 AND ts.status IN ('completed','validated')
     ORDER BY ts.session_date DESC
     LIMIT 6`,
    [athleteId]
  );

  if (recent.rows.length < 2) {
    return {
      recommendation: 'Yetarli ma\'lumot yo\'q. Kamida 2 ta test sessiyasi kerak.',
      trend: 'insufficient_data',
      indicators: [],
      changes: [],
    };
  }

  const latest = recent.rows[0];
  const previous = recent.rows[1];
  const changes: IndicatorChange[] = [];
  const indicatorLabels: string[] = [];

  const pairs: [keyof RecentRow, string][] = [
    ['f_max', 'Maksimal kuch (Fmax)'],
    ['j_speed_strength_index', 'Tezkor-kuch indeksi (J)'],
    ['n_max', 'Maksimal quvvat (Nmax)'],
  ];

  for (const [key, name] of pairs) {
    const ch = calcChange(latest, previous, key, name);
    if (!ch) continue;
    changes.push(ch);
    if (Math.abs(ch.percent) > 5) {
      indicatorLabels.push(`${name}: ${ch.percent > 0 ? '+' : ''}${ch.percent.toFixed(1)}%`);
    }
  }

  const avgChange = changes.length > 0
    ? changes.reduce((s, c) => s + c.percent, 0) / changes.length
    : 0;

  let trend: RecommendationResult['trend'] = 'stable';
  if (avgChange > 3) trend = 'positive';
  else if (avgChange < -3) trend = 'negative';

  const recommendation = trend === 'negative'
    ? TREND_MESSAGES.negative(indicatorLabels)
    : TREND_MESSAGES[trend];

  const confidence = Math.min(95, 60 + recent.rows.length * 5);

  await query(
    `INSERT INTO recommendations
      (athlete_id, recommendation_text, indicators_basis, recommendation_type, ai_confidence)
     VALUES ($1, $2, $3, 'trend_analysis', $4)`,
    [athleteId, recommendation, JSON.stringify({ changes, trend }), confidence]
  );

  return { recommendation, trend, indicators: indicatorLabels, changes };
}
