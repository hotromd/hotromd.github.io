/*
 * Thống kê cho hotromd.github.io
 * - GA4 (G-701DBS4FC7) nạp trực tiếp bằng gtag.js -> KHÔNG tạo thêm tag GA4 trong GTM (sẽ bị đếm 2 lần).
 * - GTM (GTM-P73QGZML) vẫn được nạp để xác minh Search Console / dùng về sau.
 */
(function () {
    var GA_ID = 'G-701DBS4FC7';
    var GTM_ID = 'GTM-P73QGZML';

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;

    // Không đo khi chạy localhost hoặc mở file trực tiếp
    if (/^(localhost|127\.0\.0\.1|)$/.test(location.hostname)) return;

    function loadScript(src) {
        var s = document.createElement('script');
        s.async = true;
        s.src = src;
        document.head.appendChild(s);
    }

    // GA4 (tự gửi page_view; click link ra ngoài do Enhanced Measurement đo)
    loadScript('https://www.googletagmanager.com/gtag/js?id=' + GA_ID);
    gtag('js', new Date());
    gtag('config', GA_ID);

    // GTM
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    loadScript('https://www.googletagmanager.com/gtm.js?id=' + GTM_ID);

    // Đo nút bấm. Chỉ lấy nhãn từ aria-label/title/id, KHÔNG lấy chữ hiển thị
    // (có thể chứa tên tài liệu người dùng).
    document.addEventListener('click', function (e) {
        var el = e.target.closest && e.target.closest('button');
        if (!el) return;
        var label = (el.getAttribute('aria-label') || el.title || el.id || '').trim().slice(0, 40);
        if (label) gtag('event', 'button_click', { action_label: label });
    });
})();
