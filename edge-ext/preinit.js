// 神识清理 — 扩展预注入 (document_start, MAIN world)
// 模拟 GM_xmlhttpRequest 以兼容原 Tampermonkey 脚本
(function() {
    'use strict';

    // 从 chrome.storage 同步设置到 localStorage
    function syncSettings() {
        window.postMessage({ type: 'lvsc-get-settings' }, '*');
    }

    // 监听设置数据
    window.addEventListener('message', function(e) {
        if (e.source !== window) return;
        if (e.data?.type === 'lvsc-settings-data') {
            var data = e.data.settings || {};
            for (var k in data) {
                try { localStorage.setItem(k, data[k]); } catch (_) {}
            }
            window.dispatchEvent(new CustomEvent('lvsc:settings-synced'));
        }
    });

    // 模拟 GM_xmlhttpRequest —— 通过 extension bridge 发送
    window.GM_xmlhttpRequest = function(details) {
        var id = 'gm-' + Date.now() + '-' + Math.random().toString(36).slice(2,8);
        // 转发到 content bridge → background SW → fetch
        window.postMessage({
            type: 'lvsc-gm-fetch',
            id: id,
            url: details.url,
            method: details.method || 'GET',
            headers: details.headers || {},
            data: details.data
        }, '*');

        var timeout = details.timeout || 30000;
        var timer = setTimeout(function() {
            window.removeEventListener('message', handler);
            if (details.ontimeout) details.ontimeout();
        }, timeout);

        function handler(e) {
            if (e.source !== window) return;
            if (e.data?.type === 'lvsc-gm-fetch-result' && e.data.id === id) {
                clearTimeout(timer);
                window.removeEventListener('message', handler);
                var resp = e.data.response;
                if (resp.ok && details.onload) {
                    details.onload({ status: resp.status, responseText: resp.body, readyState: 4 });
                } else if (details.onerror) {
                    details.onerror();
                }
            }
        }
        window.addEventListener('message', handler);
    };

    syncSettings();
})();
