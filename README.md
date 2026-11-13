# MD Helper

Ứng dụng web miễn phí để đọc, viết và xuất tài liệu Markdown ngay trong trình duyệt. Dùng thử tại [hotromd.github.io](https://hotromd.github.io/).

## Tính năng

- Xem trước Markdown trực tiếp, chuyển đổi giữa chế độ soạn thảo, chia đôi và xem trước.
- Dán nội dung có định dạng từ Excel và các ứng dụng khác trong chế độ xem trước; hỗ trợ bảng cùng các định dạng phổ biến như màu, viền, font và căn lề.
- Quản lý nhiều tài liệu bằng thư mục, ghim, tìm kiếm và mục lục.
- Hỗ trợ tô màu code, sơ đồ Mermaid, danh sách công việc và giao diện sáng/tối.
- Xuất Markdown, HTML, Word, PDF hoặc sao chép nội dung có định dạng.
- Tự động lưu tài liệu trong bộ nhớ trình duyệt trên thiết bị hiện tại; ứng dụng không gửi tài liệu lên máy chủ.

## Chạy trên máy

Không cần cài đặt hay build. Clone repository, mở thư mục dự án và chạy một web server tĩnh:

```sh
python3 -m http.server 8000
```

Sau đó mở <http://localhost:8000/>. Ứng dụng dùng `marked` và các thư viện giao diện có sẵn trong `lib/`; tô màu code tải thư viện từ CDN khi mở trang, còn Mermaid chỉ tải khi tài liệu có sơ đồ.

## Lưu ý dữ liệu

Tài liệu được lưu trong trình duyệt và không tự đồng bộ giữa các trình duyệt hoặc thiết bị. Hãy dùng chức năng **Sao lưu** trong ứng dụng để xuất bản sao dữ liệu.
