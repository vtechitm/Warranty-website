# Nhật ký thay đổi

## v1.0.0 — Quản lý theo đơn vị răng (2026-10-30)

Labo không còn được "cấp mã". Vtech in thẻ hàng loạt và phát tự do; labo **mua phôi** và được cấp **đơn vị răng theo từng loại phôi**. Mỗi lần kích hoạt thẻ cho bệnh nhân, hệ thống trừ đúng số răng của ca. Hết đơn vị thì không kích hoạt được thẻ của phôi đó.

### Mới

- **Đơn vị răng (quản trị):** menu **Đơn vị răng** để xem số dư theo labo × phôi (đã cấp / đã dùng / còn lại), **Cấp đơn vị răng** (kèm số hoá đơn), **Điều chỉnh** (tăng/giảm, có lý do), lịch sử đầy đủ.
- **Nhập Excel/CSV:** nhập nhiều giao dịch bán phôi cùng lúc (mã labo, mã phôi SKU, số đơn vị, số hoá đơn). Có bước xem trước; khi xác nhận, tất cả các dòng được ghi trong một lần (hoặc không dòng nào).
- **Kích hoạt:** ô **Số lượng răng** bắt buộc; sơ đồ răng FDI không bắt buộc (nếu chọn thì phải khớp số lượng, chọn răng sẽ tự điền số lượng). Form hiển thị số đơn vị còn lại của loại phôi.
- **Cổng labo:** trang chủ hiển thị số đơn vị còn lại theo phôi (cảnh báo khi còn ít); trang **Đơn vị răng** với lịch sử của labo.
- **Tự động hoàn đơn vị:** thu hồi thẻ đã kích hoạt → hoàn lại số răng; khôi phục thẻ → trừ lại; quản trị labo sửa số răng → trừ thêm hoặc hoàn phần chênh lệch.

### An toàn dữ liệu

- Số dư không bao giờ âm: trừ có điều kiện trong cùng giao dịch kích hoạt, cộng ràng buộc ở cơ sở dữ liệu. Hai labo/nhân viên kích hoạt cùng lúc không thể dùng quá số đơn vị đang có.
- Sổ lịch sử đơn vị răng chỉ ghi thêm, không sửa/xoá; mọi lần cấp, điều chỉnh, nhập tệp đều có nhật ký kiểm toán.

### Đã bỏ

- Cấp mã cho labo (theo số lượng, khoảng serial, danh sách) và nhập Excel cấp mã. Thẻ chưa dùng của một thương hiệu có thể được kích hoạt bởi bất kỳ labo nào được ủy quyền thương hiệu đó và còn đơn vị răng của phôi.

### Nâng cấp

- Migration `20261029151543_tooth_units` tự chạy khi khởi động (thêm bảng `UnitBalance`, `UnitLedgerEntry`). Labo hiện có bắt đầu với 0 đơn vị — cần cấp đơn vị trước khi kích hoạt.

### Kiểm thử

- 50 bài kiểm thử tự động (gồm trừ/hoàn/điều chỉnh, kích hoạt đồng thời, nhập Excel) và kịch bản Playwright toàn luồng: sinh thẻ → cấp đơn vị → labo kích hoạt → bệnh nhân xác thực.
