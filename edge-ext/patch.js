// 神识清理 — 扩展补丁（后台状态 + 多账号指示器）
(function() {
    'use strict';
    var obs = new MutationObserver(function() {
        var title = document.querySelector('#lvscTitle');
        if (!title || document.getElementById('lvscSwIndicator')) return;

        // 后台运行状态
        var ind = document.createElement('span');
        ind.id = 'lvscSwIndicator';
        ind.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:10px;font-size:10px;font-weight:700;background:rgba(155,231,195,.1);color:#9be7c3;border:1px solid rgba(155,231,195,.2);margin-left:8px';
        ind.textContent = '⚡ EXT';
        ind.title = '扩展版 · 后台运行中\n气运/灵田/升品/涅槃/月卡';
        title.appendChild(ind);

        // 多账号指示器
        var ac = document.createElement('span');
        ac.id = 'lvscAccountInfo';
        ac.style.cssText = 'display:none;font-size:10px;color:#dbb970;margin-left:6px;cursor:pointer';
        ac.title = '检测到的游戏账号';
        ac.onclick = function() {
            window.postMessage({ type: 'lvsc-open-options' }, '*');
        };
        title.appendChild(ac);

        obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // Feature 3: 监听 SW 推送的 API 事件 → 触发页面处理函数
    window.addEventListener('message', function(e) {
        if (e.source !== window || e.data?.type !== 'lvsc-api-event') return;
        var ev = e.data.event;
        if (ev === 'combat' || ev === 'encounter') {
            try { if (typeof handleEncounterEvent === 'function') handleEncounterEvent(); else if (typeof handleSelfFightEvent === 'function') handleSelfFightEvent(false); } catch(_) {}
        } else if (ev === 'merchant') {
            try { if (typeof handleMerchantEvent === 'function') handleMerchantEvent(); } catch(_) {}
        } else if (ev === 'revive') {
            try { if (typeof refreshPlayer === 'function') refreshPlayer(); } catch(_) {}
        } else if (ev === 'masterRequest') {
            // 徒弟请求 → 立即处理
            try { if (typeof handleMasterRequests === 'function') handleMasterRequests(); } catch(_) {}
        } else if (ev === 'jail') {
            // 入狱 → 立即保释
            try { if (typeof checkAndAutoBail === 'function') checkAndAutoBail(true); } catch(_) {}
        } else if (ev === 'death') {
            // 死亡 → 立即处理复活
            try { if (typeof handleDeathReviveEvent === 'function') handleDeathReviveEvent(true); } catch(_) {}
        }
    });
})();
