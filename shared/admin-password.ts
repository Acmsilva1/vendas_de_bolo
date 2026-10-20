export const ADMIN_PASSWORD_MIN = 6;
export const ADMIN_PASSWORD_MAX = 10;
export const ADMIN_PASSWORD_HELP = 'Use de 6 a 10 caracteres, com pelo menos 1 caractere especial (ex.: !, @ ou #).';

export function validNewAdminPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= ADMIN_PASSWORD_MIN &&
    value.length <= ADMIN_PASSWORD_MAX && /[^\p{L}\p{N}\s]/u.test(value);
}
