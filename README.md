# Word Garden · Học ngoại ngữ mỗi ngày

Ứng dụng web nhỏ để học từ vựng tiếng Trung, tiếng Nhật và tiếng Hàn cho người Việt:

- thẻ ôn cách quãng (thuật toán FSRS qua thư viện ts-fsrs), hỏi hai chiều;
- bài đọc ngắn, bấm từ để xem nghĩa và thêm vào thẻ;
- viết lại bài đọc và nhận góp ý của AI (cần khoá API riêng của người dùng, khoá chỉ lưu trong trình duyệt);
- lịch tuần tự điều chỉnh, dự báo ngày xong, con dấu mỗi ngày học xong.

Chạy trên máy: phục vụ thư mục này qua một máy chủ tĩnh bất kỳ (trang dùng ES module nên không mở trực tiếp từ file).

Dữ liệu từ vựng lấy từ các nguồn mở, ghi ở `CREDITS.md` và màn "Nguồn dữ liệu" trong app.
Gói từ tiếng Trung không đi kèm trang (danh sách cấp HSK không có giấy phép mở): người dùng nhập gói từ một file trong màn Cài đặt.
