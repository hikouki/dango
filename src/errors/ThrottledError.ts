import { DangosanError, DangosanErrorCode } from "./Error";

export class ThrottledError extends Error implements DangosanError {
  code: DangosanErrorCode;

  constructor(message?: string) {
    super(message);

    this.code = "throttled";
  }
}
