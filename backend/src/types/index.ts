export type UserRole = 'admin' | 'researcher' | 'coach' | 'operator' | 'athlete';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Athlete {
  id: string;
  user_id?: string;
  full_name: string;
  birth_date: Date;
  gender: 'male' | 'female';
  sport_id: string;
  team_id?: string;
  coach_id?: string;
  qualification: string;
  weight_category?: string;
  experience_years?: number;
  training_stage?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Sport {
  id: string;
  name: string;
  description?: string;
}

export interface Team {
  id: string;
  name: string;
  sport_id: string;
  coach_id?: string;
  description?: string;
}

export interface TestProtocol {
  id: string;
  name: string;
  test_type: string;
  description?: string;
  initial_position?: string;
  joint_angle?: number;
  execution_mode?: string;
  attempts_count: number;
  created_by: string;
  created_at: Date;
}

export interface TestSession {
  id: string;
  athlete_id: string;
  protocol_id: string;
  operator_id: string;
  session_date: Date;
  training_context: 'pre_load' | 'post_load' | 'diagnostic' | 'stage_monitoring';
  body_weight?: number;
  heart_rate?: number;
  subjective_state?: number;
  notes?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'validated';
  validated_by?: string;
  created_at: Date;
}

export interface CalculatedIndicators {
  id: string;
  session_id: string;
  attempt_number: number;
  p0_max_isometric?: number;
  f_max?: number;
  t_max?: number;
  j_speed_strength_index?: number;
  q_start_force?: number;
  g_accelerating_force?: number;
  v_max?: number;
  n_max?: number;
  v_q?: number;
  n_q?: number;
  v_g?: number;
  n_g?: number;
  is_best_attempt: boolean;
  calculated_at: Date;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
