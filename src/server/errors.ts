export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** Business error carrying a stable machine code and a Vietnamese user-facing message. */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
    /** Optional finer-grained reason, e.g. CODE_ALREADY_ACTIVATED */
    public reason?: string,
  ) {
    super(message);
  }
  get status() {
    return STATUS[this.code];
  }
}

export const notFound = (msg = "Không tìm thấy dữ liệu") => new AppError("NOT_FOUND", msg);
export const forbidden = (msg = "Bạn không có quyền thực hiện thao tác này") => new AppError("FORBIDDEN", msg);
export const conflict = (msg: string, reason?: string) => new AppError("CONFLICT", msg, undefined, reason);
export const badRequest = (msg: string, reason?: string) => new AppError("BAD_REQUEST", msg, undefined, reason);
