/** Formatting helpers shared by UI, PDFs and exports (Vietnamese locale). */

const pad = (n: number) => String(n).padStart(2, "0");

/** Date-only values (stored as UTC midnight). */
export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

/** Timestamps shown in Vietnam time (UTC+7). */
export function fmtDateVN(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = new Date((typeof d === "string" ? new Date(d) : d).getTime() + 7 * 3_600_000);
  return fmtDate(date);
}

export function fmtDateTimeVN(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = new Date((typeof d === "string" ? new Date(d) : d).getTime() + 7 * 3_600_000);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} ${fmtDate(date)}`;
}

export function fmtDuration(months: number | null | undefined) {
  if (!months) return "—";
  if (months % 12 === 0) return `${months / 12} năm`;
  if (months > 12) return `${Math.floor(months / 12)} năm ${months % 12} tháng`;
  return `${months} tháng`;
}

export function fmtNumber(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

export function fmtPercent(r: number) {
  return `${(r * 100).toFixed(1).replace(".", ",")}%`;
}

/** Last covered day = end date (exclusive) - 1 day. */
export function lastCoveredDay(end: Date | string | null | undefined) {
  if (!end) return null;
  const d = typeof end === "string" ? new Date(end) : end;
  return new Date(d.getTime() - 86_400_000);
}

export const PUBLIC_STATE_LABEL: Record<string, string> = {
  NOT_ACTIVATED: "Chưa kích hoạt",
  PENDING_INSTALLATION: "Chờ xác nhận ngày lắp",
  ACTIVE: "Đang bảo hành",
  EXPIRED: "Đã hết hạn",
  SUSPENDED: "Tạm ngưng",
  REVOKED: "Đã thu hồi",
};

export const LIFECYCLE_LABEL: Record<string, string> = {
  CREATED: "Chưa dùng",
  ASSIGNED: "Chưa dùng",
  ACTIVATED: "Đã kích hoạt",
  REVOKED: "Đã thu hồi",
};

export const VALIDITY_LABEL: Record<string, string> = {
  NOT_STARTED: "Chưa bắt đầu",
  ACTIVE: "Còn hiệu lực",
  EXPIRED: "Hết hạn",
  SUSPENDED: "Tạm ngưng",
};

export const START_RULE_LABEL: Record<string, string> = {
  INSTALLATION_DATE: "Tính từ ngày lắp cho bệnh nhân",
  ACTIVATION_DATE: "Tính từ ngày kích hoạt",
  COMPLETION_DATE: "Tính từ ngày hoàn thành phục hình",
};

export const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Quản trị Vtech",
  BRAND_ADMIN: "Quản trị thương hiệu",
  LAB_ADMIN: "Quản lý labo",
  LAB_STAFF: "Nhân viên labo",
  CLINIC_USER: "Phòng khám",
  PATIENT: "Bệnh nhân",
};

export const CLAIM_STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Đã gửi",
  UNDER_REVIEW: "Đang xem xét",
  ADDITIONAL_INFO_REQUIRED: "Cần bổ sung",
  APPROVED: "Chấp thuận",
  REJECTED: "Từ chối",
  COMPLETED: "Hoàn tất",
};
