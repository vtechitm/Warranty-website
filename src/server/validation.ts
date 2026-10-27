import { z } from "zod";

const trimmed = (max = 200) => z.string().trim().min(1).max(max);
const optionalText = (max = 2000) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Màu phải ở dạng #RRGGBB");
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải ở dạng YYYY-MM-DD")
  .transform((s) => new Date(`${s}T00:00:00.000Z`))
  .refine((d) => !Number.isNaN(d.getTime()), "Ngày không hợp lệ");
const phone = z
  .string()
  .trim()
  .max(20)
  .regex(/^[0-9+\s().-]*$/, "Số điện thoại không hợp lệ")
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
  client: z.enum(["web", "mobile"]).default("web"),
  deviceName: z.string().max(100).optional(),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) });
export const acceptInviteSchema = z.object({ token: z.string().min(20).max(200), password: z.string().min(10).max(200) });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(10).max(200) });

export const brandSchema = z.object({
  name: trimmed(100),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, "Slug chỉ gồm chữ thường, số, gạch ngang"),
  codePrefix: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Tiền tố mã gồm 2 chữ cái (VD: OR)"),
  tagline: optionalText(200),
  /** https URL or an image uploaded for the brand page (/api/v1/brand-assets/…). */
  logoUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https:\/\/\S+$/.test(v) || /^\/api\/v1\/brand-assets\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(v), "Logo phải là link https hoặc ảnh đã tải lên")
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  primaryColor: hexColor.default("#0B1F3A"),
  secondaryColor: hexColor.default("#C9A96E"),
  accentColor: hexColor.default("#F5F5F7"),
  supportPhone: phone,
  supportEmail: z.string().trim().email().optional().nullable().or(z.literal("").transform(() => null)),
  supportUrl: z.string().trim().url().optional().nullable().or(z.literal("").transform(() => null)),
  websiteUrl: z.string().trim().url().optional().nullable().or(z.literal("").transform(() => null)),
  isActive: z.boolean().default(true),
});
export const brandUpdateSchema = brandSchema.partial().omit({ codePrefix: true });
/** Fields a brand admin may change on their own brands. */
export const BRAND_IDENTITY_FIELDS = ["tagline", "logoUrl", "primaryColor", "secondaryColor", "accentColor", "supportPhone", "supportEmail", "supportUrl", "websiteUrl"] as const;
export const brandDomainOptionsSchema = z.object({ isPrimary: z.boolean().optional(), redirectToPrimary: z.boolean().optional() });

export const brandDomainSchema = z.object({
  hostname: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?=.{3,253}$)([a-z0-9-]+\.)*[a-z0-9-]+(:\d{2,5})?$/, "Tên miền không hợp lệ"),
  isPrimary: z.boolean().default(false),
  redirectToPrimary: z.boolean().default(false),
});

export const productSchema = z.object({
  brandId: z.string().uuid(),
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,40}$/, "Mã SKU chỉ gồm chữ, số, gạch ngang"),
  name: trimmed(150),
  description: optionalText(2000),
  materialType: optionalText(100),
  origin: optionalText(300),
  imageUrl: z.string().trim().url().optional().nullable().or(z.literal("").transform(() => null)),
  isActive: z.boolean().default(true),
});
export const productUpdateSchema = productSchema.partial().omit({ brandId: true, sku: true });

export const policySchema = z.object({
  durationMonths: z.number().int().min(1).max(600),
  startRule: z.enum(["INSTALLATION_DATE", "ACTIVATION_DATE", "COMPLETION_DATE"]).default("INSTALLATION_DATE"),
  conditions: optionalText(5000),
  exclusions: optionalText(5000),
  claimInstructions: optionalText(5000),
  careInstructions: optionalText(5000),
  benefits: optionalText(5000),
});

export const laboratorySchema = z.object({
  name: trimmed(200),
  address: optionalText(300),
  contactPerson: optionalText(100),
  phone,
  email: z.string().trim().email().optional().nullable().or(z.literal("").transform(() => null)),
  taxCode: optionalText(30),
  brandIds: z.array(z.string().uuid()).default([]),
  admin: z.object({ name: trimmed(100), email: z.string().trim().toLowerCase().email() }).optional(),
});
export const laboratoryUpdateSchema = laboratorySchema.omit({ admin: true }).partial().extend({
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

export const staffSchema = z.object({
  name: trimmed(100),
  email: z.string().trim().toLowerCase().email(),
  phone,
  role: z.enum(["LAB_ADMIN", "LAB_STAFF"]).default("LAB_STAFF"),
});

export const batchCreateSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50_000),
  notes: optionalText(500),
});

export const assignSchema = z
  .object({
    laboratoryId: z.string().uuid(),
    batchId: z.string().uuid().optional(),
    /** Assign the next N unassigned cards of the batch (in print order). */
    quantity: z.number().int().min(1).max(50_000).optional(),
    /** Or an inclusive serial range within the batch, matching physical card numbers. */
    serialFrom: z.number().int().min(1).optional(),
    serialTo: z.number().int().min(1).optional(),
    /** Or an explicit list of public codes. */
    codes: z.array(z.string().trim().toUpperCase().max(40)).max(10_000).optional(),
    note: optionalText(300),
  })
  .refine((v) => (v.codes && v.codes.length > 0) || (v.batchId && (v.quantity || (v.serialFrom && v.serialTo))), {
    message: "Chọn lô + số lượng / khoảng serial, hoặc danh sách mã",
  });

export const assignmentImportSchema = z.object({
  rows: z
    .array(z.object({ row: z.number().int().min(1), code: z.string().trim().toUpperCase().max(40), labCode: z.string().trim().toUpperCase().max(40) }))
    .min(1)
    .max(10_000),
  note: optionalText(300),
  filename: optionalText(200),
});

export const revokeSchema = z.object({ reason: trimmed(500) });

export const FDI_TEETH = [
  ...[18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
  ...[48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
];
export const FDI_PRIMARY_TEETH = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65, 85, 84, 83, 82, 81, 71, 72, 73, 74, 75];
const ALL_TEETH = new Set([...FDI_TEETH, ...FDI_PRIMARY_TEETH]);

export const RESTORATION_TYPES = [
  "Mão đơn (Crown)",
  "Cầu răng (Bridge)",
  "Mặt dán sứ (Veneer)",
  "Inlay / Onlay",
  "Mão trên implant",
  "Cầu trên implant",
  "Khác",
] as const;

export const activationSchema = z
  .object({
    patient: z.object({
      fullName: trimmed(120),
      phone,
      birthYear: z.number().int().min(1900).max(2100).optional().nullable(),
      externalRef: optionalText(60),
      consent: z.literal(true, { errorMap: () => ({ message: "Cần xác nhận bệnh nhân đã được thông báo về việc xử lý dữ liệu cá nhân" }) }),
    }),
    clinic: z.object({
      clinicId: z.string().uuid().optional().nullable(),
      name: optionalText(200),
      dentistName: optionalText(120),
      phone,
    }),
    restoration: z.object({
      restorationType: trimmed(100),
      teeth: z
        .array(
          z.object({
            toothNumber: z.number().int().refine((n) => ALL_TEETH.has(n), "Số răng FDI không hợp lệ"),
            restorationType: optionalText(100),
            shade: optionalText(20),
            notes: optionalText(300),
          }),
        )
        .min(1, "Chọn ít nhất 1 răng")
        .max(32),
      completionDate: dateOnly.optional().nullable(),
      installationDate: dateOnly.optional().nullable(),
      /** Warranty the laboratory provides for this case (months). Pre-filled with Vtech's suggestion for the product. */
      warrantyMonths: z
        .number({ invalid_type_error: "Nhập thời hạn bảo hành (tháng)", required_error: "Nhập thời hạn bảo hành (tháng)" })
        .int("Thời hạn bảo hành phải là số tháng nguyên")
        .min(1, "Thời hạn bảo hành tối thiểu 1 tháng")
        .max(600, "Thời hạn bảo hành tối đa 50 năm"),
      materialLotNumber: optionalText(60),
      notes: optionalText(2000),
    }),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<number>();
    for (const t of v.restoration.teeth) {
      if (seen.has(t.toothNumber)) {
        ctx.addIssue({ code: "custom", path: ["restoration", "teeth"], message: `Răng ${t.toothNumber} bị trùng` });
      }
      seen.add(t.toothNumber);
    }
    if (!v.clinic.clinicId && !v.clinic.name) {
      ctx.addIssue({ code: "custom", path: ["clinic", "name"], message: "Chọn hoặc nhập tên phòng khám" });
    }
  });
export type ActivationInput = z.infer<typeof activationSchema>;

export const confirmInstallationSchema = z.object({ installationDate: dateOnly });

export const patientVerifySchema = z.object({
  /** PHONE_OTP: `value` is the 6-digit code sent by POST /passports/{code}/otp */
  method: z.enum(["ACCESS_CODE", "PHONE_NUMBER", "PHONE_OTP"]),
  value: z.string().trim().min(4).max(20),
});

export const claimSchema = z.object({
  claimantType: z.enum(["PATIENT", "CLINIC", "LABORATORY"]),
  claimantName: trimmed(120),
  contactPhone: phone,
  contactEmail: z.string().trim().email().optional().nullable().or(z.literal("").transform(() => null)),
  description: trimmed(5000),
});
export const otpRequestSchema = z.object({ phone: z.string().trim().min(8).max(20).regex(/^[0-9+\s().-]+$/, "Số điện thoại không hợp lệ") });

export const claimStatusSchema = z.object({
  status: z.enum(["SUBMITTED", "UNDER_REVIEW", "ADDITIONAL_INFO_REQUIRED", "APPROVED", "REJECTED", "COMPLETED"]),
  note: optionalText(2000),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export const warrantySearchSchema = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  brandId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  laboratoryId: z.string().uuid().optional(),
  status: z.enum(["CREATED", "ASSIGNED", "ACTIVATED", "REVOKED"]).optional(),
  activatedFrom: dateOnly.optional(),
  activatedTo: dateOnly.optional(),
  /** "1" = only activated cases waiting for installation-date confirmation */
  pending: z.enum(["1"]).optional(),
});
