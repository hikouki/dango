export type DangosanErrorCode = "throttled";

export interface DangosanError extends Error {
  code: DangosanErrorCode;
}
