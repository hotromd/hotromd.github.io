/*
 * Google Tag Manager cho hotromd.github.io.
 * GA4 và Search Console được cấu hình bên trong container GTM (không cần sửa code).
 */
(function () {
    var GTM_ID = 'GTM-P73QGZML';

    window.dataLayer = window.dataLayer || [];

    // Không đo khi chạy localhost hoặc mở file trực tiếp
    if (/^(localhost|127\.0\.0\.1|)$/.test(location.hostname)) return;

    // Đoạn nạp GTM chuẩn
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtm.js?id=' + GTM_ID;
    document.head.appendChild(s);

    // Đo thao tác: bấm nút và click link ra ngoài (không thu nội dung người dùng nhập/mở)
    document.addEventListener('click', function (e) {
        var el = e.target.closest && e.target.closest('button, a[href^="http"]');
        if (!el) return;
        if (el.tagName === 'A') {
            if (el.hostname && el.hostname !== location.hostname) {
                window.dataLayer.push({ event: 'outbound_click', link_url: el.href });
            }
            return;
        }
        var label = (el.getAttribute('aria-label') || el.title || el.id || '').trim().slice(0, 40);
        if (label) {
            window.dataLayer.push({
                event: 'button_click',
                action_label: label,
                page_path: location.pathname
            });
        }
    });
})();
