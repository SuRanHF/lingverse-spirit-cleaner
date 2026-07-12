// 神识清理 — Content Script Bridge (ISOLATED world)
'use strict';

// 0. 接收 options 页面的设置推送 → 写入页面 localStorage
chrome.runtime.onMessage.addListener(function(msg, sender) {
    if (msg.type === 'sync-settings' && msg.data) {
        // 推送到页面
        window.postMessage({ type: 'lvsc-settings-data', settings: msg.data }, '*');
        // 也通过 SW 持久化
        chrome.storage.local.set(msg.data);
    }
});

// 1. 页面请求 SW 执行 GM fetch（替代 GM_xmlhttpRequest）
window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    var d = event.data;

    // 打开设置页
    if (d?.type === 'lvsc-open-options') {
        chrome.runtime.openOptionsPage();
        return;
    }

    // 获取设置
    if (d?.type === 'lvsc-get-settings') {
        chrome.storage.local.get(null).then(function(settings) {
            window.postMessage({ type: 'lvsc-settings-data', settings: settings }, '*');
        });
        return;
    }

    // GM fetch 请求 → 通过 SW 执行
    if (d?.type === 'lvsc-gm-fetch') {
        chrome.runtime.sendMessage({
            type: 'gm-fetch',
            id: d.id,
            url: d.url,
            method: d.method,
            headers: d.headers,
            data: d.data
        }).then(function(result) {
            window.postMessage({
                type: 'lvsc-gm-fetch-result',
                id: d.id,
                response: result
            }, '*');
        }).catch(function(err) {
            window.postMessage({
                type: 'lvsc-gm-fetch-result',
                id: d.id,
                response: { ok: false, status: 0, body: '{}' }
            }, '*');
        });
        return;
    }

    // SW 任务触发
    if (d?.type === 'lvsc-sw-task') {
        chrome.runtime.sendMessage({ type: 'sw-task', task: d.task, args: d.args }).then(function(r) {
            window.postMessage({ type: 'lvsc-sw-task-result', id: d.id, result: r }, '*');
        }).catch(function(err) {
            window.postMessage({ type: 'lvsc-sw-task-result', id: d.id, error: err.message }, '*');
        });
        return;
    }
});
