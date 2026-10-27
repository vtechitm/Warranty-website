# Brief media — Trang thương hiệu

Bản brief đầy đủ để gửi bộ phận media (chia sẻ được, chỉnh sửa và bình luận trực tiếp):
**https://claude.ai/artifact/AbX5kaygpYMA39zDRqZ3Ch**

Nội dung: cách làm, quy định chung, bảng nội dung chữ cho 11 phần (giới hạn ký tự), bảng ảnh (kích thước),
thông tin thương hiệu chung, cách bàn giao và checklist.

## Cho lập trình viên

- Nguồn chuẩn của mọi giới hạn ký tự / số mục: `src/server/landing-schema.ts` (`landingSchema`, `LANDING_LIMITS`).
  Đổi giới hạn ở đó thì cập nhật brief tương ứng.
- Form nhập: `/admin/brands/{id}/landing` (`src/app/admin/brands/[id]/landing/landing-editor.tsx`).
- Trang công khai: tên miền đã xác minh của thương hiệu (`/`) hoặc `/b/{slug}` (`src/components/brand-landing.tsx`).
- Ảnh: `POST /api/v1/brands/{id}/assets` (JPG/PNG/WebP ≤ 5 MB, kiểm tra theo nội dung tệp) → phục vụ công khai tại
  `/api/v1/brand-assets/{brandId}/{uuid}.{ext}` (cache 1 năm).
- Nội dung mẫu cho Origin (demo): `prisma/demo-landing.ts`.
