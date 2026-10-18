import { expect, test, type Page } from "@playwright/test";
import { loadEnv } from "vite";

/**
 * Main business flow across the three portals:
 * admin generates & assigns a batch → lab activates a code by manual entry → patient page shows ACTIVE
 * and the patient verifies with the access code from the activation screen.
 */
const env = loadEnv("e2e", process.cwd(), "");
const ADMIN = { email: env.SEED_ADMIN_EMAIL ?? "admin@vtech.local", password: env.SEED_ADMIN_PASSWORD ?? "" };
const LAB = { email: "lab-a@vtech.local", password: env.SEED_LAB_PASSWORD ?? "" };

async function login(page: Page, user: { email: string; password: string }, expectPath: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Mật khẩu").fill(user.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(expectPath);
}

test("admin generates & assigns → lab activates → patient verifies", async ({ browser }) => {
  // ── Admin: generate a batch of 5 and assign it to Labo Răng Sứ Sài Gòn ──
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await login(admin, ADMIN, /\/admin$/);
  await admin.goto("/admin/batches");
  await admin.getByRole("button", { name: "Sinh lô mã mới" }).click();
  // [required] = the dialog's select (the list filter above has one with the same name).
  const product = admin.locator('select[name="productId"][required]');
  const productValue = await product.locator("option", { hasText: "Origin Beyond Plus" }).first().getAttribute("value");
  await product.selectOption(productValue!);
  await admin.locator('input[name="quantity"]').fill("5");
  await admin.getByRole("button", { name: "Sinh mã" }).click();
  await expect(admin).toHaveURL(/\/admin\/batches\/[0-9a-f-]{36}$/);
  const batchId = admin.url().split("/").pop()!;

  const lab = admin.locator('select[name="laboratoryId"]');
  const labValue = await lab.locator("option", { hasText: "Labo Răng Sứ Sài Gòn" }).getAttribute("value");
  await lab.selectOption(labValue!);
  await admin.locator('input[name="quantity"]').fill("5");
  await admin.getByRole("button", { name: "Cấp mã" }).click();
  await expect(admin.getByText("Đã cấp 5 mã.")).toBeVisible();

  await admin.goto(`/admin/warranties?batchId=${batchId}`);
  const code = (await admin.locator("a.mono").first().innerText()).trim();
  expect(code).toMatch(/^ORG\d{2}-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
  await adminCtx.close();

  // ── Lab: manual code entry + activation ──
  const labCtx = await browser.newContext();
  const labPage = await labCtx.newPage();
  await login(labPage, LAB, /\/lab$/);
  await labPage.goto("/lab/activate?mode=manual");
  await labPage.getByPlaceholder("ORG26-K8M4P2X9").fill(code.toLowerCase());
  await labPage.getByRole("button", { name: "KIỂM TRA MÃ" }).click();
  await expect(labPage).toHaveURL(new RegExp(`/lab/activate/${code}$`));

  await labPage.getByPlaceholder("Nguyễn Văn A").fill("Trần Thị E2E");
  await labPage.getByPlaceholder("09xx xxx xxx").fill("0912 345 678");
  await labPage.getByPlaceholder("Tìm hoặc nhập tên phòng khám").fill("Nha khoa Kiểm Thử");
  await labPage.getByRole("button", { name: "Răng 11", exact: true }).click();
  await labPage.getByRole("button", { name: "Răng 21", exact: true }).click();
  const completion = await labPage.getByLabel("Ngày hoàn thành phục hình").inputValue();
  await labPage.getByLabel("Ngày lắp cho bệnh nhân").fill(completion);
  await labPage.getByRole("checkbox", { name: /Nghị định 13\/2023/ }).check();
  await labPage.getByRole("button", { name: "KÍCH HOẠT" }).click();

  const accessCodeBox = labPage.getByText("Mã xác thực bệnh nhân").locator("..");
  await expect(accessCodeBox).toBeVisible();
  const accessCode = (await accessCodeBox.locator(".mono").innerText()).trim();
  expect(accessCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  await labCtx.close();

  // ── Patient (anonymous): public page is ACTIVE, private data only after verification ──
  const patientCtx = await browser.newContext();
  const patient = await patientCtx.newPage();
  await patient.goto(`/w/${code}`);
  await expect(patient.getByText("CHỨNG NHẬN PHỤC HÌNH CHÍNH HÃNG")).toBeVisible();
  await expect(patient.getByText("Đã xác thực trên hệ thống Vtech")).toBeVisible();
  await expect(patient.getByText("2 răng")).toBeVisible();
  await expect(patient.getByText("Trần Thị E2E")).toHaveCount(0);

  await patient.getByRole("button", { name: "Xác thực để xem hồ sơ" }).click();
  await patient.getByPlaceholder(/in trên chứng nhận/).fill(accessCode);
  await patient.getByRole("button", { name: "Xác thực", exact: true }).click();
  await expect(patient.getByText("Trần Thị E2E")).toBeVisible();
  await expect(patient.getByText("Nha khoa Kiểm Thử")).toBeVisible();
  await expect(patient.getByText("11, 21")).toBeVisible();
  await expect(patient.getByRole("button", { name: "Gửi yêu cầu bảo hành" })).toBeVisible();
  await patientCtx.close();
});
