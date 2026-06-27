// Tizimdagi rollar:
//   Super Admin  -> 'super_admin' (hamma narsa + adminlar, audit, user o'chirish)
//   Admin        -> 'admin'       (deyarli hamma narsa, faqat xavfli amallar Super Adminda)
//   Trener       -> 'coach' (asosiy), 'researcher', 'operator' ham xodim sifatida
//   Sportchi     -> 'athlete'     (shaxsiy kabinet + jamoasi)

export const STAFF_ROLES = ['super_admin', 'admin', 'researcher', 'coach', 'operator'];

export const isStaff = (role) => STAFF_ROLES.includes(role);
export const isAthlete = (role) => role === 'athlete';

export const isSuperAdmin = (role) => role === 'super_admin';
export const isAdmin = (role) => role === 'admin';
// Admin paneli ko'rinishi uchun: Super Admin ham, Admin ham
export const isAdminLevel = (role) => role === 'admin' || role === 'super_admin';
// Trener (faqat murabbiy darajasi — admin emas)
export const isCoach = (role) => role === 'coach' || role === 'researcher' || role === 'operator';

// Login'dan keyin rolga qarab boshlang'ich sahifa
export const homePathForRole = (role) => (isAthlete(role) ? '/me' : '/');
