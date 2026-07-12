// 神识清理 — Service Worker v1.6.5
'use strict';
const VERSION = '1.6.5';

// ========== 1. 注册 MAIN world 脚本 ==========
chrome.runtime.onInstalled.addListener(async () => {
    try {
        const existing = await chrome.scripting.getRegisteredContentScripts();
        if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map(s => s.id) });
    } catch (_) {}
    await chrome.scripting.registerContentScripts([{
        id: 'lvsc-preinit', matches: ['https://ling.muge.info/game.html*'],
        js: ['preinit.js'], runAt: 'document_start', world: 'MAIN'
    }]);
    await chrome.scripting.registerContentScripts([{
        id: 'lvsc-main', matches: ['https://ling.muge.info/game.html*'],
        js: ['script.js'], runAt: 'document_end', world: 'MAIN'
    }]);
    await chrome.scripting.registerContentScripts([{
        id: 'lvsc-patch', matches: ['https://ling.muge.info/game.html*'],
        js: ['patch.js'], runAt: 'document_end', world: 'MAIN'
    }]);
    console.log('[LVSC] Scripts registered');
});

// ========== 2. Cookie → Header ==========
async function getCookieHeader() {
    try {
        const cookies = await chrome.cookies.getAll({ domain: 'ling.muge.info' });
        return cookies.map(c => c.name + '=' + c.value).join('; ');
    } catch (_) { return ''; }
}

// ========== 3. GM fetch 处理（替代 GM_xmlhttpRequest） ==========
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // GM fetch
    if (msg.type === 'gm-fetch') {
        handleGmFetch(msg).then(sendResponse).catch(err => sendResponse({ ok: false, status: 0, body: '{}' }));
        return true;
    }
    // 后台任务
    if (msg.type === 'sw-task') {
        handleSwTask(msg.task, msg.args).then(r => sendResponse({ ok: true, result: r }))
            .catch(e => sendResponse({ ok: false, error: e.message }));
        return true;
    }
    // 更新检查
    if (msg.type === 'update-check') {
        checkForUpdate().then(sendResponse).catch(e => sendResponse({ version: null }));
        return true;
    }
    // 更新下载
    if (msg.type === 'update-download') {
        downloadUpdate(msg.url, msg.version).then(ok => sendResponse({ ok })).catch(() => sendResponse({ ok: false }));
        return true;
    }
    // 打开设置
    if (msg.type === 'open-options') {
        chrome.runtime.openOptionsPage();
    }
});

async function handleGmFetch(msg) {
    const cookieHeader = await getCookieHeader();
    const headers = { ...msg.headers, 'Cookie': cookieHeader };
    // ngrok 需要跳过浏览器警告
    if (msg.url.includes('ngrok-free.dev')) headers['ngrok-skip-browser-warning'] = 'true';
    const body = msg.data || undefined;
    try {
        const resp = await fetch(msg.url, { method: msg.method, headers, body });
        const text = await resp.text();
        return { ok: resp.ok || resp.status >= 200 && resp.status < 300, status: resp.status, body: text };
    } catch (e) {
        return { ok: false, status: 0, body: '{}' };
    }
}

// ========== 4. 设置同步 + 热更新注入 ==========
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' && tab.url?.startsWith('https://ling.muge.info/game.html')) {
        // 4.1 同步设置到 localStorage
        chrome.storage.local.get(null).then(data => {
            if (!Object.keys(data).length) return;
            chrome.scripting.executeScript({
                target: { tabId }, world: 'MAIN',
                func: (s) => { for (const k in s) try { localStorage.setItem(k, s[k]); } catch (_) {} },
                args: [data]
            }).catch(() => {});
        });
        // 4.2 检查是否有热更新脚本 → 注入替代 script.js
        chrome.storage.local.get(['lvscScriptInner', 'lvscScriptVersion']).then(data => {
            const inner = data.lvscScriptInner;
            const ver = data.lvscScriptVersion;
            if (inner && ver && compareVer(ver, VERSION) > 0) {
                chrome.scripting.executeScript({
                    target: { tabId }, world: 'MAIN',
                    func: (code, v) => {
                        if (window.__lvSpiritCleanerLoaded) return;
                        window.__lvSpiritCleanerLoaded = true;
                        var script = document.createElement('script');
                        script.textContent = code;
                        (document.head || document.documentElement).appendChild(script);
                        console.log('[LVSC] Hot update to v' + v);
                    },
                    args: [inner, ver]
                }).catch(() => {});
            }
        });
    }
});

// 每 30s 回读
setInterval(() => {
    chrome.tabs.query({ url: 'https://ling.muge.info/game.html*' }, tabs => {
        tabs.forEach(tab => {
            chrome.scripting.executeScript({
                target: { tabId: tab.id }, world: 'MAIN',
                func: () => { const d = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith('lvSpiritCleaner.')) d[k] = localStorage.getItem(k); } return d; }
            }).then(r => { if (r?.[0]?.result) chrome.storage.local.set(r[0].result); }).catch(() => {});
        });
    });
}, 30000);

// ========== 5. 设置读辅助 ==========
async function getSetting(key, fallback) {
    const data = await chrome.storage.local.get('lvSpiritCleaner.' + key);
    return data['lvSpiritCleaner.' + key] ?? fallback;
}

// ========== 6. 后台任务 ==========
// 6.1 气运维持
async function luckCheck() {
    const enabled = await getSetting('autoMaintainLuck', '0');
    if (enabled !== '1' && enabled !== true) return;
    const minLuck = parseInt(await getSetting('minLuck', '5')) || 5;
    const method = await getSetting('luckRefreshMethod', 'stone');
    const useAd = method === 'ad';
    const cookie = await getCookieHeader();
    const h = { 'Content-Type': 'application/json', 'Cookie': cookie };
    for (let i = 0; i < 20; i++) {
        const r = await fetch('https://ling.muge.info/api/master/overview', { headers: { Cookie: cookie } });
        const d = await r.json();
        const cur = d?.data?.luck || 0;
        if (cur >= minLuck) break;
        await fetch('https://ling.muge.info/api/game/refresh-luck', { method: 'POST', headers: h, body: JSON.stringify({ useAdPoints: useAd }) });
        await new Promise(r => setTimeout(r, 1500));
    }
}

// 6.2 灵田
async function farmCheck() {
    const cookie = await getCookieHeader();
    const h = { Cookie: cookie };
    const r = await fetch('https://ling.muge.info/api/game/player-sect/farm/overview?page=1&pageSize=1', { headers: h });
    const d = await r.json();
    if (d?.code !== 200 || !d.data) return;
    if (d.data.myMatureCount > 0) {
        await fetch('https://ling.muge.info/api/game/player-sect/farm/harvest-all', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: '{}' });
    }
    if (d.data.myIdleCount > 0) {
        const seedId = await getSetting('farmSeedId', '');
        if (seedId) await fetch('https://ling.muge.info/api/game/player-sect/farm/plant-all', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ seedId }) });
    }
    if (d.data.farmInvasion) {
        await fetch('https://ling.muge.info/api/game/player-sect/farm/invasion/attack', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: '{}' });
    }
}

// 6.3 洗炼石升品
async function washStoneCheck() {
    const enabled = await getSetting('washStoneUpgradeRunning', '0');
    if (enabled !== '1') return;
    const cookie = await getCookieHeader();
    const h = { Cookie: cookie };
    const r = await fetch('https://ling.muge.info/api/game/inventory', { headers: h });
    const d = await r.json();
    if (d?.code !== 200 || !Array.isArray(d.data)) return;
    const stones = d.data.filter(it => String(it.templateId||'').includes('wash_stone_') && (it.rarity||0) < 5);
    if (!stones.length) return;
    stones.sort((a,b) => (a.rarity||0)-(b.rarity||0));
    for (const s of stones) {
        if ((s.quantity||1) >= 5) {
            await fetch('https://ling.muge.info/api/custom-skill/upgrade-wash-stone', {
                method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
                body: JSON.stringify({ washStoneItemId: parseInt(s.id||s.itemId), times: Math.floor((s.quantity||1)/5) })
            });
            break;
        }
    }
}

// 6.4 涅槃丹
async function nirvanaCheck() {
    const enabled = await getSetting('autoNirvanaPill', '0');
    if (enabled !== '1' && enabled !== true) return;
    const wantRarity = parseInt(await getSetting('nirvanaRarity', '3')) || 3;
    const cookie = await getCookieHeader();
    const h = { Cookie: cookie };
    const r = await fetch('https://ling.muge.info/api/game/inventory', { headers: h });
    const d = await r.json();
    if (d?.code !== 200 || !Array.isArray(d.data)) return;
    const pill = d.data.find(it => {
        const t = String(it.templateId||'').toLowerCase();
        return (t.includes('pill_nirvana_') || t.includes('bp_pill_rebirth')) && (it.rarity||0) >= wantRarity;
    });
    if (pill) {
        const itemId = pill.id || pill.itemId || pill.instanceId;
        if (itemId) await fetch('https://ling.muge.info/api/game/use-item', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId }) });
    }
}

// 6.5 月卡
async function monthlyCardCheck() {
    const enabled = await getSetting('autoMonthlyCard', '0');
    if (enabled !== '1' && enabled !== true) return;
    const cookie = await getCookieHeader();
    await fetch('https://ling.muge.info/api/game/monthly-card/claim', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': cookie }, body: '{}' });
}

// SW 任务路由
async function handleSwTask(task, args) {
    switch (task) {
        case 'luck': await luckCheck(); break;
        case 'farm': await farmCheck(); break;
        case 'washStone': await washStoneCheck(); break;
        case 'nirvana': await nirvanaCheck(); break;
        case 'monthlyCard': await monthlyCardCheck(); break;
        default: throw new Error('Unknown: ' + task);
    }
}

// ========== 7. 定时任务 ==========
const TASKS = [
    { name: 'heartbeat', periodMin: 2, fn: async () => {
        try { const c = await getCookieHeader(); await fetch('https://unreclaimable-unyieldingly-coretta.ngrok-free.dev/api/heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': c, 'ngrok-skip-browser-warning': 'true' }, body: JSON.stringify({ clientId: 'ext-singleton', version: VERSION, page: 'extension', playerName: '', running: false, monitoringSpirit: false, autoTrialRunning: false, autoTreasureRunning: false, autoInscriptionRunning: false, timestamp: Date.now() }) }); } catch (_) {} }
    },
    { name: 'luckCheck', periodMin: 5, fn: luckCheck },
    { name: 'farmCheck', periodMin: 30, fn: farmCheck },
    { name: 'washStoneCheck', periodMin: 5, fn: washStoneCheck },
    { name: 'nirvanaCheck', periodMin: 15, fn: nirvanaCheck },
    { name: 'monthlyCardCheck', periodMin: 120, fn: monthlyCardCheck },
    { name: 'versionCheck', periodMin: 60, fn: async () => {
        try {
            const r = await fetch('https://gitee.com/api/v5/repos/wanoujj/lingverse-spirit-cleaner/releases/latest');
            const d = await r.json();
            const v = (d.tag_name||'').replace(/^v/, '');
            if (v && compareVer(v, VERSION) > 0) {
                chrome.action?.setBadgeText?.({ text: '新' });
                chrome.action?.setBadgeBackgroundColor?.({ color: '#dbb970' });
            }
        } catch (_) {}
    }}
];

function compareVer(a, b) { const pa = a.split('.').map(Number), pb = b.split('.').map(Number); for (let i=0;i<Math.max(pa.length,pb.length);i++){ const na=pa[i]||0,nb=pb[i]||0; if(na>nb)return 1; if(na<nb)return -1; } return 0; }

// ========== 8. 更新检查 & 下载 ==========
async function checkForUpdate() {
    // 直接读两个源的用户脚本原文，从 @version 提取版本号
    const sources = [
        'https://gitee.com/wanoujj/lingverse-spirit-cleaner/raw/main/lingverse-spirit-cleaner.user.js',
        'https://raw.githubusercontent.com/SuRanHF/lingverse-spirit-cleaner/main/lingverse-spirit-cleaner.user.js'
    ];
    for (const url of sources) {
        try {
            const r = await fetch(url, { cache: 'no-cache' });
            if (!r.ok) continue;
            const text = await r.text();
            const m = text.match(/@version\s+([^\s]+)/);
            if (!m) continue;
            const v = m[1];
            return { version: v, downloadUrl: url + '?v=' + v };
        } catch (_) {}
    }
    return { version: null };
}

async function downloadUpdate(url, version) {
    try {
        const r = await fetch(url);
        const text = await r.text();
        let inner = text;
        const idx = text.indexOf('var source = String.raw');
        if (idx > 0) {
            const start = text.indexOf('`', idx) + 1;
            const end = text.lastIndexOf('`;');
            if (start > 0 && end > start) inner = text.slice(start, end).replace(/\r/g, '');
        }
        await chrome.storage.local.set({ lvscScriptVersion: version, lvscScriptInner: inner });
        return true;
    } catch (_) { return false; }
}

// ========== 9. 自动登录（401 检测） ==========
let _loginBusy = false;
async function autoReLogin() {
    try {
        const data = await chrome.storage.local.get(['lvSpiritCleaner.autoLoginEnabled','lvSpiritCleaner.autoLoginEmail','lvSpiritCleaner.autoLoginPassword']);
        if (data['lvSpiritCleaner.autoLoginEnabled'] !== '1' || !data['lvSpiritCleaner.autoLoginEmail'] || !data['lvSpiritCleaner.autoLoginPassword']) return false;
        _loginBusy = true;
        const r = await fetch('https://ling.muge.info/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: data['lvSpiritCleaner.autoLoginEmail'], password: data['lvSpiritCleaner.autoLoginPassword'] }) });
        const d = await r.json();
        _loginBusy = false;
        return d?.code === 200;
    } catch (_) { _loginBusy = false; return false; }
}

// 监控 API 请求：401 → 自动重登 + 事件检测
chrome.webRequest?.onCompleted?.addListener(details => {
    // 401 自动重登
    if (details.statusCode === 401 && !_loginBusy) {
        autoReLogin().then(ok => { if (ok) console.log('[LVSC] Auto re-login OK'); });
    }
    // Feature 3: 检测关键 API 事件 → 推送给页面实时响应
    const url = details.url;
    let eventType = null;
    if (url.includes('/api/game/combat-choice')) eventType = 'combat';
    else if (url.includes('/api/game/merchant')) eventType = 'merchant';
    else if (url.includes('/api/game/encounter')) eventType = 'encounter';
    else if (url.includes('/api/game/revive')) eventType = 'revive';
    else if (url.includes('/api/game/meditate/start')) eventType = 'meditateStart';
    else if (url.includes('/api/game/meditate/stop')) eventType = 'meditateStop';
    else if (url.includes('/api/master/overview')) eventType = 'masterRequest';
    else if (url.includes('origin-damage') || url.includes('prison') || url.includes('immortal_prison')) eventType = 'jail';
    else if (url.includes('playerDead') || details.statusCode === 200 && url.includes('/api/player') && url.includes('dead')) eventType = 'death';
    if (eventType) {
        chrome.tabs.query({ url: 'https://ling.muge.info/game.html*' }, tabs => {
            tabs.forEach(tab => {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id }, world: 'MAIN',
                    func: (type, u) => {
                        window.postMessage({ type: 'lvsc-api-event', event: type, url: u }, '*');
                    },
                    args: [eventType, url]
                }).catch(() => {});
            });
        });
    }
}, { urls: ['https://ling.muge.info/api/*'] }, ['responseHeaders']);

// ========== 10. Feature 1: 工具栏图标状态 ==========
const BADGE_STATES = {
    dead: { text: '💀', color: [255, 80, 80] },       // 红色
    running: { text: '▶', color: [102, 231, 155] },   // 绿色
    meditating: { text: '🧘', color: [216, 180, 254] }, // 紫色
    monitoring: { text: '👁', color: [255, 209, 102] }, // 黄色
    idle: { text: '', color: [155, 146, 127] }        // 灰色
};

async function updateBadge() {
    try {
        const data = await chrome.storage.local.get(['lvSpiritCleaner.wasRunning', 'lvSpiritCleaner.monitoringSpirit']);
        const wasRunning = data['lvSpiritCleaner.wasRunning'];
        const wasMonitoring = data['lvSpiritCleaner.monitoringSpirit'];
        let state = 'idle';
        // 检测死亡：读 playerDead 或 isDead
        const tabs = await chrome.tabs.query({ url: 'https://ling.muge.info/game.html*' });
        if (tabs.length) {
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id }, world: 'MAIN',
                    func: () => (window._lastPlayerData?.isDead || window.playerDead) ? 'dead' : (window._lastPlayerData?.isMeditating ? 'meditating' : 'alive')
                });
                const playerState = results?.[0]?.result;
                if (playerState === 'dead') state = 'dead';
                else if (playerState === 'meditating') state = 'meditating';
                else if (wasRunning === '1') state = 'running';
                else if (wasMonitoring === '1') state = 'monitoring';
            } catch (_) {
                if (wasRunning === '1') state = 'running';
                else if (wasMonitoring === '1') state = 'monitoring';
            }
        } else {
            if (wasRunning === '1') state = 'running';
            else if (wasMonitoring === '1') state = 'monitoring';
        }
        const badge = BADGE_STATES[state];
        chrome.action?.setBadgeText?.({ text: badge.text });
        chrome.action?.setBadgeBackgroundColor?.({ color: badge.color });
    } catch (_) {}
}

// ========== Feature 2: Windows 通知 ==========
let _notifyState = {}; // 记录上次状态，避免重复通知

async function notifyCheck() {
    try {
        const tabs = await chrome.tabs.query({ url: 'https://ling.muge.info/game.html*' });
        if (!tabs.length) return;
        const results = await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id }, world: 'MAIN',
            func: () => {
                const p = window._lastPlayerData || {};
                return {
                    isDead: p.isDead || window.playerDead || false,
                    isMeditating: p.isMeditating || false,
                    spirit: p.spirit || 0,
                    maxSpirit: p.maxSpirit || 1,
                    running: !!window.__lvSpiritCleanerLoaded && localStorage.getItem('lvSpiritCleaner.wasRunning') === '1',
                    playerName: p.name || ''
                };
            }
        });
        const s = results?.[0]?.result;
        if (!s) return;
        const now = Date.now();
        // 死亡通知
        if (s.isDead && _notifyState.lastDead !== true) {
            chrome.notifications.create('death', {
                type: 'basic', iconUrl: 'icons/icon128.svg',
                title: '💀 ' + (s.playerName || '角色') + ' 已陨落',
                message: '请及时处理复活'
            });
        }
        _notifyState.lastDead = s.isDead;
        // 神识不足通知
        if (s.running && s.maxSpirit > 0 && s.spirit < s.maxSpirit * 0.1 && !s.isDead) {
            const lastLowSpirit = _notifyState.lastLowSpirit || 0;
            if (now - lastLowSpirit > 600000) { // 10分钟内不重复
                chrome.notifications.create('lowspirit', {
                    type: 'basic', iconUrl: 'icons/icon128.svg',
                    title: '⚠ 神识不足',
                    message: s.playerName + ' 神识仅剩 ' + s.spirit + '/' + s.maxSpirit
                });
                _notifyState.lastLowSpirit = now;
            }
        }
    } catch (_) {}
}

// ========== Feature 5: 多账号检测 ==========
let _accountProfiles = {}; // { playerName: { lastSeen, tabId } }

// 每30秒扫描所有游戏标签页的玩家名，建立账号列表
async function scanAccounts() {
    try {
        const tabs = await chrome.tabs.query({ url: 'https://ling.muge.info/game.html*' });
        for (const tab of tabs) {
            try {
                const results = await chrome.scripting.executeScript({
                    target: { tabId: tab.id }, world: 'MAIN',
                    func: () => { const p = window._lastPlayerData || {}; return { name: p.name || localStorage.getItem('playerName') || '', realm: p.realm || '' }; }
                });
                const info = results?.[0]?.result;
                if (info?.name) {
                    _accountProfiles[info.name] = { lastSeen: Date.now(), tabId: tab.id, realm: info.realm };
                }
            } catch (_) {}
        }
        // 清理超过 5 分钟未见的帐号
        const cutoff = Date.now() - 300000;
        for (const [name, profile] of Object.entries(_accountProfiles)) {
            if (profile.lastSeen < cutoff) delete _accountProfiles[name];
        }
        // 保存到 storage 供面板读取
        await chrome.storage.local.set({ 'lvscAccounts': JSON.stringify(Object.keys(_accountProfiles)) });
    } catch (_) {}
}

// ========== 11. 启动 ==========
TASKS.forEach(t => { chrome.alarms.create(t.name, { periodInMinutes: t.periodMin }); });
chrome.alarms.create('updateBadge', { periodInMinutes: 0.17 });
chrome.alarms.create('notifyCheck', { periodInMinutes: 0.5 });
chrome.alarms.create('scanAccounts', { periodInMinutes: 0.5 });
scanAccounts().catch(() => {});
chrome.alarms.onAlarm.addListener(alarm => {
    const task = TASKS.find(t => t.name === alarm.name);
    if (task) { task.fn().catch(() => {}); return; }
    if (alarm.name === 'updateBadge') updateBadge().catch(() => {});
    if (alarm.name === 'notifyCheck') notifyCheck().catch(() => {});
    if (alarm.name === 'scanAccounts') scanAccounts().catch(() => {});
});
console.log('[LVSC] SW initialized v' + VERSION);
