/**
 * OpenAPI 3.1 description of /api/v1. Served at GET /api/v1/openapi.json.
 * Keep in sync when adding routes (the route test checks every documented path exists).
 */
type Op = {
  summary: string;
  tag: string;
  auth?: "session" | "none" | "patient";
  roles?: string;
  body?: string;
  query?: Record<string, string>;
  response?: string;
  binary?: string;
};

const P = (summary: string, tag: string, extra: Partial<Op> = {}): Op => ({ summary, tag, ...extra });

export const API_PATHS: Record<string, Record<string, Op>> = {
  "/auth/login": { post: P("Đăng nhập (web cookie / mobile tokens)", "Auth", { auth: "none", body: "LoginRequest", response: "LoginResponse" }) },
  "/auth/logout": { post: P("Đăng xuất phiên hiện tại", "Auth") },
  "/auth/refresh": { post: P("Xoay vòng refresh token (mobile, dùng một lần)", "Auth", { auth: "none", body: "RefreshRequest" }) },
  "/auth/me": { get: P("Thông tin người dùng hiện tại", "Auth") },
  "/auth/invitations/accept": { post: P("Chấp nhận lời mời & đặt mật khẩu", "Auth", { auth: "none", body: "AcceptInvitation" }) },
  "/auth/password": { post: P("Đổi mật khẩu", "Auth") },
  "/auth/sessions": { get: P("Danh sách thiết bị/phiên đăng nhập", "Auth") },
  "/auth/sessions/{id}": { delete: P("Thu hồi một phiên đăng nhập", "Auth") },

  "/brands": { get: P("Danh sách thương hiệu", "Brands", { roles: "SUPER_ADMIN, BRAND_ADMIN" }), post: P("Tạo thương hiệu", "Brands", { roles: "SUPER_ADMIN", body: "Brand" }) },
  "/brands/{id}": { get: P("Chi tiết thương hiệu", "Brands"), patch: P("Cập nhật thương hiệu", "Brands", { roles: "SUPER_ADMIN" }) },
  "/brands/{id}/domains": { post: P("Thêm tên miền thương hiệu", "Brands", { roles: "SUPER_ADMIN" }) },
  "/brand-domains/{domainId}": { delete: P("Xoá tên miền", "Brands", { roles: "SUPER_ADMIN" }) },
  "/brand-domains/{domainId}/verify": { post: P("Xác minh tên miền", "Brands", { roles: "SUPER_ADMIN" }) },
  "/brand-config": { get: P("Theme thương hiệu theo hostname đã xác minh (công khai)", "Brands", { auth: "none", query: { host: "hostname" } }) },

  "/products": { get: P("Danh sách sản phẩm (theo phạm vi)", "Products"), post: P("Tạo sản phẩm (+ chính sách v1)", "Products", { roles: "SUPER_ADMIN, BRAND_ADMIN" }) },
  "/products/{id}": { get: P("Chi tiết sản phẩm", "Products"), patch: P("Cập nhật sản phẩm", "Products") },
  "/products/{id}/policies": { get: P("Lịch sử phiên bản chính sách", "Policies"), post: P("Phát hành phiên bản chính sách mới", "Policies", { body: "Policy" }) },

  "/laboratories": { get: P("Danh sách labo", "Laboratories"), post: P("Tạo labo + lời mời quản trị", "Laboratories", { roles: "SUPER_ADMIN" }) },
  "/laboratories/{id}": { get: P("Chi tiết labo", "Laboratories"), patch: P("Cập nhật / tạm ngưng labo", "Laboratories", { roles: "SUPER_ADMIN" }) },
  "/laboratories/{id}/staff": { get: P("Nhân sự labo", "Laboratories"), post: P("Mời nhân sự labo", "Laboratories", { roles: "SUPER_ADMIN, LAB_ADMIN" }) },
  "/users": { get: P("Người dùng hệ thống", "Users", { roles: "SUPER_ADMIN" }), post: P("Tạo quản trị viên", "Users", { roles: "SUPER_ADMIN" }) },
  "/users/{id}/status": { post: P("Kích hoạt / khoá người dùng", "Users") },
  "/users/{id}/invitation": { post: P("Cấp lại link mời", "Users") },

  "/batches": { get: P("Danh sách lô mã", "Batches"), post: P("Tạo lô & sinh mã bảo hành", "Batches", { roles: "SUPER_ADMIN", body: "BatchCreate" }) },
  "/batches/{id}": { get: P("Chi tiết lô + thống kê", "Batches") },
  "/batches/{id}/export": { get: P("Xuất Excel danh sách mã (kèm ảnh QR khi ≤ 5.000 mã)", "Batches", { binary: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }) },
  "/batches/{id}/print-package": { get: P("Gói dữ liệu cho nhà in: Excel kèm ảnh QR, CSV trộn in, ảnh QR PNG/SVG", "Batches", { query: { serialFrom: "int", serialTo: "int" }, binary: "application/zip" }) },
  "/batches/{id}/qr-zip": { get: P("Tải ZIP ảnh QR (png/svg)", "Batches", { query: { format: "png|svg", serialFrom: "int", serialTo: "int" }, binary: "application/zip" }) },
  "/batches/{id}/labels": { get: P("PDF nhãn in QR", "Batches", { query: { template: "a4-3x8|a4-2x5-card|roll-50x30|roll-60x40", serialFrom: "int", serialTo: "int" }, binary: "application/pdf" }) },

  "/warranties": { get: P("Tìm kiếm mã bảo hành (theo phạm vi)", "Warranties", { query: { q: "string", status: "CREATED|ASSIGNED|ACTIVATED|REVOKED", page: "int", pageSize: "int" } }) },
  "/warranties/export": { get: P("Xuất Excel kết quả tìm kiếm", "Warranties", { binary: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }) },
  "/warranties/assign": { post: P("Cấp mã cho labo", "Warranties", { roles: "SUPER_ADMIN", body: "Assign" }) },
  "/warranties/unassign": { post: P("Thu hồi cấp phát (mã chưa kích hoạt)", "Warranties", { roles: "SUPER_ADMIN" }) },
  "/warranties/import/preview": { post: P("Xem trước nhập cấp mã từ Excel/CSV (multipart: file)", "Warranties", { roles: "SUPER_ADMIN" }) },
  "/warranties/import": { post: P("Xác nhận nhập cấp mã (kiểm tra lại toàn bộ, dùng assignCodes)", "Warranties", { roles: "SUPER_ADMIN" }) },
  "/warranties/{code}": { get: P("Hồ sơ đầy đủ (người được ủy quyền)", "Warranties", { response: "WarrantyDetail" }) },
  "/warranties/{code}/check": { get: P("Kiểm tra mã trước khi kích hoạt", "Activation", { roles: "LAB_ADMIN, LAB_STAFF" }) },
  "/warranties/{code}/activate": { post: P("Kích hoạt bảo hành (transactional)", "Activation", { roles: "LAB_ADMIN, LAB_STAFF", body: "Activation", response: "ActivationResult" }) },
  "/warranties/{code}/confirm-installation": { post: P("Xác nhận ngày lắp (chờ xác nhận)", "Activation") },
  "/warranties/{code}/correct": { post: P("Điều chỉnh hồ sơ sau kích hoạt (có audit)", "Activation", { roles: "SUPER_ADMIN, LAB_ADMIN" }) },
  "/warranties/{code}/revoke": { post: P("Thu hồi mã", "Warranties", { roles: "SUPER_ADMIN" }) },
  "/warranties/{code}/reinstate": { post: P("Khôi phục mã đã thu hồi", "Warranties", { roles: "SUPER_ADMIN" }) },
  "/warranties/{code}/suspend": { post: P("Tạm ngưng / mở lại bảo hành", "Warranties", { roles: "SUPER_ADMIN" }) },
  "/warranties/{code}/certificate": { get: P("PDF chứng nhận đầy đủ", "Certificates", { binary: "application/pdf" }) },
  "/warranties/{code}/qr": { get: P("Ảnh QR của mã", "Warranties", { query: { format: "png|svg", size: "int" }, binary: "image/png" }) },

  "/passports/{code}": { get: P("Hộ chiếu nha khoa công khai (an toàn dữ liệu)", "Passports", { auth: "none", response: "PublicPassport" }) },
  "/passports/{code}/verify": { post: P("Xác thực bệnh nhân (mã xác thực / SĐT)", "Passports", { auth: "none", body: "PatientVerify" }) },
  "/passports/{code}/otp": { post: P("Gửi mã OTP tới SĐT đã đăng ký (sau đó xác thực PHONE_OTP)", "Passports", { auth: "none" }) },
  "/passports/{code}/private": { get: P("Thông tin phục hình riêng tư (sau xác thực)", "Passports", { auth: "patient" }) },
  "/passports/{code}/certificate": { get: P("PDF chứng nhận cho bệnh nhân", "Passports", { auth: "none", binary: "application/pdf" }) },

  "/clinics": { get: P("Tìm phòng khám (danh sách của labo)", "Clinics") },
  "/dashboard/admin": { get: P("Thống kê quản trị", "Dashboard") },
  "/dashboard/lab": { get: P("Thống kê labo", "Dashboard") },
  "/patients/me/warranties": { get: P("Bảo hành của tôi (ứng dụng bệnh nhân)", "Patients", { roles: "PATIENT" }) },
  "/patients/me/warranties/link": { post: P("Liên kết bảo hành vào tài khoản", "Patients", { roles: "PATIENT" }) },
  "/me/notification-preferences": { get: P("Tuỳ chọn thông báo", "Patients"), put: P("Cập nhật tuỳ chọn thông báo", "Patients") },
  "/audit-logs": { get: P("Nhật ký kiểm toán", "Audit", { roles: "SUPER_ADMIN" }) },
};

const schemas = {
  Error: {
    type: "object",
    properties: {
      error: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: { type: "string", enum: ["BAD_REQUEST", "VALIDATION_ERROR", "UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "RATE_LIMITED", "INTERNAL"] },
          reason: { type: "string", description: "Fine-grained reason, e.g. ALREADY_ACTIVATED, NOT_ASSIGNED, REVOKED" },
          message: { type: "string", description: "Vietnamese user-facing message" },
          details: {},
        },
      },
    },
  },
  Pagination: { type: "object", properties: { page: { type: "integer" }, pageSize: { type: "integer" }, total: { type: "integer" }, totalPages: { type: "integer" } } },
  LoginRequest: {
    type: "object", required: ["email", "password"],
    properties: { email: { type: "string", format: "email" }, password: { type: "string" }, client: { type: "string", enum: ["web", "mobile"], default: "web" }, deviceName: { type: "string" } },
  },
  LoginResponse: {
    type: "object",
    properties: { user: { type: "object" }, accessToken: { type: "string" }, accessTokenExpiresAt: { type: "string", format: "date-time" }, refreshToken: { type: "string" }, refreshTokenExpiresAt: { type: "string", format: "date-time" }, tokenType: { const: "Bearer" } },
  },
  RefreshRequest: { type: "object", required: ["refreshToken"], properties: { refreshToken: { type: "string" } } },
  AcceptInvitation: { type: "object", required: ["token", "password"], properties: { token: { type: "string" }, password: { type: "string", minLength: 10 } } },
  Brand: {
    type: "object", required: ["name", "slug", "codePrefix"],
    properties: { name: { type: "string" }, slug: { type: "string" }, codePrefix: { type: "string", pattern: "^[A-Z]{2}$" }, primaryColor: { type: "string" }, secondaryColor: { type: "string" }, logoUrl: { type: "string" } },
  },
  Policy: {
    type: "object", required: ["durationMonths"],
    properties: {
      durationMonths: { type: "integer" }, startRule: { type: "string", enum: ["INSTALLATION_DATE", "ACTIVATION_DATE", "COMPLETION_DATE"] },
      conditions: { type: "string" }, exclusions: { type: "string" }, claimInstructions: { type: "string" }, careInstructions: { type: "string" }, benefits: { type: "string" },
    },
  },
  BatchCreate: { type: "object", required: ["productId", "quantity"], properties: { productId: { type: "string", format: "uuid" }, quantity: { type: "integer", minimum: 1, maximum: 50000 }, notes: { type: "string" } } },
  Assign: {
    type: "object", required: ["laboratoryId"],
    properties: { laboratoryId: { type: "string", format: "uuid" }, batchId: { type: "string", format: "uuid" }, quantity: { type: "integer" }, serialFrom: { type: "integer" }, serialTo: { type: "integer" }, codes: { type: "array", items: { type: "string" } } },
  },
  Activation: {
    type: "object", required: ["patient", "clinic", "restoration"],
    properties: {
      patient: { type: "object", required: ["fullName", "consent"], properties: { fullName: { type: "string" }, phone: { type: "string" }, birthYear: { type: "integer" }, externalRef: { type: "string" }, consent: { const: true } } },
      clinic: { type: "object", properties: { clinicId: { type: "string", format: "uuid" }, name: { type: "string" }, dentistName: { type: "string" }, phone: { type: "string" } } },
      restoration: {
        type: "object", required: ["restorationType", "teeth"],
        properties: {
          restorationType: { type: "string" },
          teeth: { type: "array", minItems: 1, items: { type: "object", required: ["toothNumber"], properties: { toothNumber: { type: "integer", description: "FDI (11–48, 51–85)" }, restorationType: { type: "string" }, shade: { type: "string" }, notes: { type: "string" } } } },
          completionDate: { type: "string", format: "date" }, installationDate: { type: "string", format: "date", description: "Omit if unknown → PENDING_CONFIRMATION" },
          materialLotNumber: { type: "string" }, notes: { type: "string" },
        },
      },
    },
  },
  ActivationResult: {
    type: "object",
    properties: { code: { type: "string" }, url: { type: "string" }, caseId: { type: "string" }, accessCode: { type: "string", description: "Shown once; printed on the certificate for patient verification" }, warrantyStartDate: { type: "string" }, warrantyEndDate: { type: "string" }, installationStatus: { type: "string" } },
  },
  WarrantyDetail: { type: "object", description: "Full record incl. patient data — authorized staff only" },
  PublicPassport: {
    type: "object",
    properties: {
      code: { type: "string" }, url: { type: "string" },
      state: { type: "string", enum: ["NOT_ACTIVATED", "PENDING_INSTALLATION", "ACTIVE", "EXPIRED", "SUSPENDED", "REVOKED"] },
      brand: { type: "object" }, product: { type: "object" }, activatedAt: { type: "string" }, warrantyStartDate: { type: "string" }, warrantyEndDate: { type: "string" },
      durationMonths: { type: "integer" }, validity: { type: "string", enum: ["NOT_STARTED", "ACTIVE", "EXPIRED", "SUSPENDED"] }, unitCount: { type: "integer" }, policy: { type: "object" },
    },
  },
  PatientVerify: { type: "object", required: ["method", "value"], properties: { method: { type: "string", enum: ["ACCESS_CODE", "PHONE_NUMBER"] }, value: { type: "string" } } },
};

export function openApiSpec() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [path, ops] of Object.entries(API_PATHS)) {
    const params = [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
    paths[`/api/v1${path}`] = {};
    for (const [method, op] of Object.entries(ops)) {
      const security = op.auth === "none" ? [] : op.auth === "patient" ? [{ patientAccess: [] }, { patientCookie: [] }] : [{ bearer: [] }, { sessionCookie: [] }];
      const ok = op.binary
        ? { description: "File", content: { [op.binary]: { schema: { type: "string", format: "binary" } } } }
        : { description: "OK", content: { "application/json": { schema: { type: "object", properties: { data: op.response ? { $ref: `#/components/schemas/${op.response}` } : {} } } } } };
      paths[`/api/v1${path}`][method] = {
        tags: [op.tag],
        summary: op.summary,
        description: op.roles ? `Roles: ${op.roles}` : undefined,
        security,
        parameters: [
          ...params,
          ...Object.entries(op.query ?? {}).map(([name, desc]) => ({ name, in: "query", required: false, description: desc, schema: { type: "string" } })),
        ],
        requestBody: op.body ? { required: true, content: { "application/json": { schema: { $ref: `#/components/schemas/${op.body}` } } } } : undefined,
        responses: {
          "200": ok,
          "401": { description: "Unauthenticated", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "403": { description: "Forbidden" },
          "404": { description: "Not found" },
          "409": { description: "Conflict (e.g. already activated)" },
          "422": { description: "Validation error" },
          "429": { description: "Rate limited (Retry-After header)" },
        },
      };
    }
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Vtech Dental Warranty Platform API",
      version: "1.0.0",
      description:
        "Versioned REST API shared by the admin & lab web apps, brand websites and future mobile apps. " +
        "Success responses are wrapped as { data }, errors as { error: { code, reason?, message, details? } }. " +
        "Cookie-authenticated mutations require a same-origin Origin header (CSRF protection); bearer-token clients are exempt.",
    },
    servers: [{ url: "/" }],
    components: {
      securitySchemes: {
        bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Mobile access token (15 min) from /auth/login with client=mobile" },
        sessionCookie: { type: "apiKey", in: "cookie", name: "vt_session" },
        patientAccess: { type: "apiKey", in: "header", name: "X-Patient-Access", description: "Token from /passports/{code}/verify" },
        patientCookie: { type: "apiKey", in: "cookie", name: "vt_pa" },
      },
      schemas,
    },
    paths,
  };
}
