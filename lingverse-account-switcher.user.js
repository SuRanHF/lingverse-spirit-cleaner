// ==UserScript==
// @name         灵界切号助手
// @namespace    local.lingverse.tools
// @version      1.0.0
// @description  一键清除灵界游戏数据，模拟换浏览器
// @match        https://ling.muge.info/game.html*
// @match        http://ling.muge.info/game.html*
// @grant        GM_cookie
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    var btn = document.createElement('button');
    btn.textContent = '🔑 切号';
    btn.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;padding:6px 14px;background:rgba(255,107,107,.85);color:#fff;border:0;border-radius:6px;cursor:pointer;font-size:13px;font-weight:700;font-family:"Microsoft YaHei",sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    btn.title = '清除所有游戏数据并刷新，模拟换浏览器';
    btn.onclick = function() {
        if (!confirm('确定要切号吗？\n\n将清除游戏数据（保留脚本设置）并刷新页面。\n请确保你记得新账号密码。')) return;

        // 0. 备份脚本设置
        var backup = {};
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf('lvSpiritCleaner.') === 0) {
                backup[k] = localStorage.getItem(k);
            }
        }

        // 1. 清空 localStorage
        var keys = [];
        for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
        keys.forEach(function(k) { try { localStorage.removeItem(k); } catch(_) {} });

        // 1b. 恢复脚本设置
        Object.keys(backup).forEach(function(k) {
            try { localStorage.setItem(k, backup[k]); } catch(_) {}
        });

        // 2. 清空 sessionStorage
        try { sessionStorage.clear(); } catch(_) {}

        // 3. 清空 IndexedDB
        if (window.indexedDB && window.indexedDB.databases) {
            try {
                window.indexedDB.databases().then(function(dbs) {
                    dbs.forEach(function(db) {
                        try { window.indexedDB.deleteDatabase(db.name); } catch(_) {}
                    });
                });
            } catch(_) {}
        }

        // 4. 清除 cookie（当前域）
        document.cookie.split(';').forEach(function(c) {
            var eqPos = c.indexOf('=');
            var name = eqPos > -1 ? c.substr(0, eqPos).trim() : c.trim();
            document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
            document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + location.hostname;
        });

        // 5. 清除 Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(regs) {
                regs.forEach(function(reg) { try { reg.unregister(); } catch(_) {} });
            });
        }

        // 6. 刷新
        setTimeout(function() {
            window.location.reload(true);
        }, 600);
    };

    document.body.appendChild(btn);
})();
