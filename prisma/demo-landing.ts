import type { LandingInput } from "../src/server/landing-schema";

/**
 * Placeholder brand page content for the demo seed, written for layout review only.
 * Real copy and images come from the media team (docs/BRIEF-MEDIA-TRANG-THUONG-HIEU.md).
 */
export const DEMO_LANDING: LandingInput = {
  seo: { title: "Răng sứ Origin chính hãng — Tra cứu nguồn gốc", description: "Tra cứu nguồn gốc xuất xứ răng sứ Origin bằng mã trên thẻ: phôi chính hãng, labo chế tác và thời hạn bảo hành do labo cung cấp. (Nội dung mẫu)" },
  hero: {
    eyebrow: "Tiêu chuẩn Hoa Kỳ",
    title: "Răng sứ Origin — chính hãng, rõ nguồn gốc",
    subtitle: "Mỗi phục hình Origin đi kèm một mã duy nhất. Quét QR hoặc nhập mã để xác thực phôi chính hãng và labo chế tác. (Nội dung mẫu)",
  },
  story: {
    title: "Mỗi chiếc răng là một phần câu chuyện của bạn",
    body: "Một phục hình tốt không chỉ bền và đẹp, mà còn giúp bạn tự tin trong từng nụ cười.\nĐoạn văn này là nội dung mẫu — bộ phận media sẽ thay bằng câu chuyện thương hiệu chính thức.",
  },
  origin: {
    title: "Sản xuất và kiểm định theo tiêu chuẩn quốc tế",
    body: "Mô tả nhà sản xuất, nhà máy, dây chuyền CAD/CAM và hệ thống quản lý chất lượng. (Nội dung mẫu — cần số liệu chính thức từ nhà sản xuất.)",
    highlights: [
      { value: "25+", label: "năm kinh nghiệm vật liệu nha khoa (mẫu)" },
      { value: "30+", label: "quốc gia phân phối (mẫu)" },
      { value: "ISO", label: "13485:2016 — quản lý chất lượng (mẫu)" },
      { value: "FDA", label: "được cấp phép tại Hoa Kỳ (mẫu)" },
    ],
    certificates: [{ name: "ISO 13485:2016" }, { name: "FDA" }, { name: "CE" }],
  },
  products: [
    { name: "Origin Apex", tagline: "Dòng cao cấp nhất (mẫu)", description: "Mô tả ngắn về đặc tính thẩm mỹ và độ bền." },
    { name: "Beyond Multi-Y", tagline: "Đa lớp chuyển màu (mẫu)", description: "Mô tả ngắn về đặc tính thẩm mỹ và độ bền." },
    { name: "Origin Beyond Plus", tagline: "Zirconia đa lớp (mẫu)", description: "Mô tả ngắn về đặc tính thẩm mỹ và độ bền." },
  ],
  warranty: {
    title: "Thông tin bảo hành",
    body: "Thời hạn bảo hành cụ thể do labo chế tác cung cấp và hiển thị khi tra cứu mã.\nĐiều kiện chung, quy trình tiếp nhận và các trường hợp không áp dụng sẽ do thương hiệu/labo cung cấp. (Nội dung mẫu)",
  },
  care: [
    "Chải răng 2 lần/ngày bằng bàn chải lông mềm.",
    "Dùng chỉ nha khoa hoặc tăm nước để làm sạch kẽ răng.",
    "Tránh cắn vật cứng, không dùng răng để mở nắp chai.",
    "Khám định kỳ 6 tháng/lần tại phòng khám.",
  ],
  testimonials: [
    { quote: "Lời nhận xét mẫu của khách hàng — media sẽ thay bằng cảm nhận thật đã được khách đồng ý đăng.", name: "Khách hàng A", meta: "Hà Nội (mẫu)" },
    { quote: "Lời nhận xét mẫu thứ hai, khoảng hai đến ba câu.", name: "Khách hàng B", meta: "TP. HCM (mẫu)" },
    { quote: "Lời nhận xét mẫu thứ ba.", name: "Khách hàng C", meta: "Đà Nẵng (mẫu)" },
  ],
  partners: [{ name: "Labo đối tác 1" }, { name: "Labo đối tác 2" }, { name: "Nha khoa đối tác 1" }, { name: "Nha khoa đối tác 2" }],
  faq: [
    { q: "Mất thẻ thì tra cứu thế nào?", a: "Liên hệ phòng khám đã lắp hoặc hotline thương hiệu để được hỗ trợ. (Nội dung mẫu)" },
    { q: "Ai chịu trách nhiệm bảo hành?", a: "Labo chế tác cung cấp bảo hành; thời hạn hiển thị khi bạn tra cứu mã. Vtech xác nhận nguồn gốc phôi." },
  ],
  contact: { ctaTitle: "Bạn cần tư vấn thêm về răng sứ Origin?", ctaBody: "Liên hệ để được hỗ trợ xác thực sản phẩm và tìm phòng khám đối tác. (Nội dung mẫu)" },
};
