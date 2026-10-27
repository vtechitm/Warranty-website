# Quy trình thiết lập thương hiệu mới (cho media)

Tài liệu đầy đủ (chia sẻ được, chỉnh sửa và bình luận trực tiếp):
**https://claude.ai/artifact/1skjxNdWJkQzedsCqU6MQp**

Tóm tắt: Vtech tạo thương hiệu + tài khoản *Quản trị thương hiệu* cho media → media làm theo trang
**Thương hiệu → Thiết lập** (nhận diện, sản phẩm & xuất xứ, trang thương hiệu, tên miền + DNS, HTTPS tự động,
nối website) → Vtech ủy quyền labo và sinh lô mã (sau khi có tên miền chính).

## Cho lập trình viên

- Checklist: `src/server/services/brand-setup.ts` (7 bước, tính từ dữ liệu thật; bước HTTPS gọi `https://<tên miền chính>/api/health`).
- Quyền của quản trị thương hiệu (chỉ thương hiệu của mình): `brand:identity` (logo, màu, khẩu hiệu, liên hệ —
  `BRAND_IDENTITY_FIELDS`), `brand:domains` (thêm / xác minh / đặt chính / xoá tên miền), `brand:content`,
  `product:manage`, `policy:manage`. Tên, slug, trạng thái thương hiệu: chỉ SUPER_ADMIN.
- HTTPS cho tên miền thương hiệu: Caddy on-demand TLS, `ask` = `/api/tls-check` (chỉ hostname đã thêm trong hệ
  thống). Máy chủ riêng: `docker/Caddyfile`; máy chủ dùng chung proxy: `docker/Caddyfile.shared-snippet`.
- `PUBLIC_SERVER_IP` (tuỳ chọn) hiển thị IP cho bản ghi A trong hướng dẫn DNS.
