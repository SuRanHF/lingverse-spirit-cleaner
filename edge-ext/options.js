// 神识清理 · 设置页
'use strict';
const PREFIX = 'lvSpiritCleaner.';

// 字段到 DOM id 的映射 { storageKeySuffix: domId, type: 'chk'|'str'|'num'|'sel', fallback }
const FIELDS = [
    ['autoLoginEnabled', 'autoLoginEnabled', 'chk', false],
    ['autoLoginEmail', 'autoLoginEmail', 'str', ''],
    ['autoLoginPassword', 'autoLoginPassword', 'str', ''],
    ['autoMaintainLuck', 'autoMaintainLuck', 'chk', false],
    ['minLuck', 'minLuck', 'num', 5],
    ['luckRefreshMethod', 'luckRefreshMethod', 'sel', 'stone'],
    ['farmAutoHarvest', 'farmAutoHarvest', 'chk', true],
    ['farmAutoPlant', 'farmAutoPlant', 'chk', false],
    ['farmSeedId', 'farmSeedId', 'str', ''],
    ['farmInterval', 'farmInterval', 'num', 30],
    ['washStoneUpgradeRunning', 'washStoneUpgradeRunning', 'chk', false],
    ['washStoneMonitorInterval', 'washStoneMonitorInterval', 'num', 30],
    ['autoNirvanaPill', 'autoNirvanaPill', 'chk', false],
    ['nirvanaRarity', 'nirvanaRarity', 'sel', '3'],
    ['wecomNotify', 'wecomNotify', 'chk', false],
    ['wecomNotifyWebhook', 'wecomNotifyWebhook', 'str', ''],
    ['onlineStatsEndpoint', 'onlineStatsEndpoint', 'str', ''],
];

// 读取设置并填充
async function loadAll() {
    const data = await chrome.storage.local.get(null);
    for (const [key, domId, type, fallback] of FIELDS) {
        const fullKey = PREFIX + key;
        let val = data[fullKey];
        if (val === undefined) val = fallback;
        const el = document.getElementById(domId);
        if (!el) continue;
        if (type === 'chk') {
            el.checked = (val === '1' || val === true || val === 1);
        } else {
            el.value = String(val ?? fallback);
        }
    }
    document.getElementById('status').textContent = '已加载';
}

// 保存设置
async function saveAll() {
    const set = {};
    for (const [key, domId, type] of FIELDS) {
        const el = document.getElementById(domId);
        if (!el) continue;
        let val;
        if (type === 'chk') val = el.checked ? '1' : '0';
        else if (type === 'num') val = String(el.value);
        else val = el.value;
        set[PREFIX + key] = val;
    }
    await chrome.storage.local.set(set);
    document.getElementById('status').textContent = '✅ 已保存 (' + new Date().toLocaleTimeString() + ')';
    // 推送设置到游戏页面
    try {
        const [tab] = await chrome.tabs.query({ url: 'https://ling.muge.info/game.html*' });
        if (tab) {
            await chrome.tabs.sendMessage(tab.id, { type: 'sync-settings', data: set });
        }
    } catch (_) {}
}

loadAll();
