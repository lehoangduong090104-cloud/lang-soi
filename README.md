# 🐺 Làng Sói

Web chơi **Ma sói nhiều đêm** không cần quản trò: cả bàn chỉ dùng **1 điện thoại** đặt giữa bàn. Máy chia vai, đọc lời dẫn bằng giọng tiếng Việt, nhận thao tác ban đêm, tự tính ai chết, đếm ngược thảo luận và xét thắng thua.

## Chơi thế nào

1. **Người chơi**: ngồi thành vòng tròn, nhập tên lần lượt theo chiều kim đồng hồ. Màn hình sẽ vẽ đúng vòng tròn đó.
2. **Vai & luật**: chọn bộ vai (có nút gợi ý theo số người), phong cách lời dẫn và vài luật nhỏ.
3. **Bắt đầu**: chuyền máy theo vòng tròn, mỗi người nhấn giữ lá bài để xem vai.
4. **Ban đêm**: máy gọi từng vai. Ai được gọi thì mở mắt, cầm máy, chạm vào tên trên vòng tròn, rồi nhắm lại.
5. **Ban ngày**: máy đọc ai đã chết, rồi đếm ngược thời gian thảo luận. Cả làng chỉ tay bỏ phiếu, sau đó chạm vào người bị treo cổ.
6. Lặp lại cho tới khi một phe thắng. Cuối ván có bảng vai của mọi người và nhật ký từng đêm.

## Lời dẫn tự đổi theo bộ vai

Kịch bản đêm được ghép từ các "lượt" của từng vai theo thứ tự cố định:

`Thần tình yêu → Cặp đôi (chỉ đêm 1) → Bảo vệ → Sói → Phù thủy → Tiên tri → Trời sáng`

- Vai không có trong ván thì không bị gọi.
- Thêm vai nào thì lượt của vai đó tự chen vào đúng chỗ.
- Màn hình thiết lập luôn hiện kịch bản đêm 1 và các đêm sau, kèm nút nghe thử.

Hai nguyên tắc chống lộ bài:

- Lời đọc to **không bao giờ** chứa thông tin bí mật (ai bị cắn, ai là Sói…). Những thông tin đó chỉ hiện trên màn hình cho người đang mở mắt.
- Vai đã chết vẫn được gọi và chờ như thường (có thể tắt trong phần Luật chơi).

Có 3 phong cách: Cổ điển, Kịch tính, Hài hước. Văn mẫu nằm trong `narration.js`.

## Vai có sẵn

| Vai | Chức năng |
|---|---|
| 🐺 Sói | Mỗi đêm cùng bầy cắn 1 người |
| 🔮 Tiên tri | Mỗi đêm soi 1 người có phải Sói không |
| 🛡️ Bảo vệ | Mỗi đêm bảo vệ 1 người khỏi Sói (mặc định không được bảo vệ 1 người 2 đêm liền) |
| 🧪 Phù thủy | 1 bình cứu và 1 bình độc, mỗi bình dùng 1 lần |
| 🏹 Thợ săn | Khi chết được bắn theo 1 người |
| 💘 Thần tình yêu | Đêm đầu ghép 1 cặp đôi. Một người chết thì người kia chết theo |
| 🧑‍🌾 Dân làng | Không có chức năng đêm |

**Thắng thua:**
- Dân thắng khi hết Sói.
- Sói thắng khi số Sói bằng hoặc nhiều hơn số người còn lại.
- Nếu cặp đôi khác phe, họ thắng khi chỉ còn lại 2 người.

## Mẹo

- Lỡ bấm nhầm: mở **⋯ → Hoàn tác**.
- Lỡ tải lại trang: mở lại web là chơi tiếp.
- Ban ngày có thể **⋯ → Xem lại vai của tôi**.
- Giọng tiếng Việt: tốt nhất dùng Chrome trên Android, Safari trên iPhone, hoặc Edge trên Windows. Nếu mở link trong Zalo/Messenger, hãy chuyển sang trình duyệt.

## Chạy trên máy

```bash
npm test       # test logic game
npm run dev    # http://localhost:3001
```

Không cần cài thư viện nào. Web là trang tĩnh nên đưa lên GitHub Pages là chạy.

## Thêm vai mới

1. `game.js`: khai báo trong `ROLES`, thêm lượt vào `STEPS`/`STEP_ORDER` (nếu có hành động đêm), xử lý trong `targetsFor` và `applyNightAction`.
2. `narration.js`: thêm câu `<lượt>_wake` và `<lượt>_sleep` cho từng phong cách.
3. `app.js`: thêm màn hình thao tác trong `viewNight()`.
