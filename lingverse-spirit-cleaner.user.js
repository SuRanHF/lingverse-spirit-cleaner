// ==UserScript==
// @name         LingVerse Spirit Cleaner
// @namespace    local.lingverse.tools
// @version      1.6.0
// @description  Authorized helper: spend LingVerse spirit, handle merchants, hire protectors, meditate, and maintain Void Body buff.
// @match        https://ling.muge.info/game.html*
// @match        http://ling.muge.info/game.html*
// @homepageURL  https://github.com/SuRanHF/lingverse-spirit-cleaner
// @supportURL   https://github.com/SuRanHF/lingverse-spirit-cleaner/issues
// @updateURL    https://gitee.com/wanoujj/lingverse-spirit-cleaner/raw/main/lingverse-spirit-cleaner.user.js
// @downloadURL  https://gitee.com/wanoujj/lingverse-spirit-cleaner/raw/main/lingverse-spirit-cleaner.user.js
// @grant        GM_xmlhttpRequest
// @connect      unreclaimable-unyieldingly-coretta.ngrok-free.dev
// @connect      qyapi.weixin.qq.com
// @run-at       document-idle
// ==/UserScript==

(function injectIntoPage() {
    'use strict';

    var GM_FETCH_EVENT = 'lvsc:gm-fetch';
    var ONLINE_BRIDGE_EVENT = 'lvsc:online-heartbeat';
    var gmFetchSeq = 0;
    var gmFetchPending = {};

    // 事件桥接 HTTP：注入代码发 CustomEvent，沙箱监听后用 GM_xmlhttpRequest 请求
    if (typeof GM_xmlhttpRequest === 'function' && !window.__lvscBridgeReady) {
        window.__lvscBridgeReady = true;

        // 通用 HTTP bridge
        window.addEventListener(GM_FETCH_EVENT, function (event) {
            var detail = {};
            try { detail = typeof event.detail === 'string' ? JSON.parse(event.detail) : (event.detail || {}); } catch (_) {}
            if (!detail.seq || !detail.url) return;
            var method = detail.method || 'GET';
            var headers = detail.headers || {};
            var body = detail.body || undefined;
            GM_xmlhttpRequest({
                method: method,
                url: detail.url,
                headers: headers,
                data: body,
                timeout: 30000,
                onload: function (resp) {
                    window.dispatchEvent(new CustomEvent(GM_FETCH_EVENT + ':done', {
                        detail: JSON.stringify({
                            seq: detail.seq,
                            ok: resp.status >= 200 && resp.status < 300,
                            status: resp.status,
                            body: resp.responseText
                        })
                    }));
                },
                onerror: function () {
                    window.dispatchEvent(new CustomEvent(GM_FETCH_EVENT + ':done', {
                        detail: JSON.stringify({ seq: detail.seq, ok: false, status: 0, body: '{}', err: 'GM_xmlhttpRequest failed' })
                    }));
                },
                ontimeout: function () {
                    window.dispatchEvent(new CustomEvent(GM_FETCH_EVENT + ':done', {
                        detail: JSON.stringify({ seq: detail.seq, ok: false, status: 0, body: '{}', err: 'timeout' })
                    }));
                }
            });
        });

        // 在线心跳 bridge（也复用做反馈发送）
        function bridgePost(event) {
            var detail = {};
            try { detail = typeof event.detail === 'string' ? JSON.parse(event.detail) : (event.detail || {}); } catch (_) {}
            if (!detail.endpoint || !detail.payload) return;
            try {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: detail.endpoint,
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify(detail.payload),
                    timeout: 10000
                });
            } catch (_) {}
        }
        window.addEventListener(ONLINE_BRIDGE_EVENT, bridgePost);
        window.addEventListener('lvsc:feedback', bridgePost);
    }

    var source = String.raw`
(function () {
    'use strict';

    if (window.__lvSpiritCleanerLoaded) return;
    window.__lvSpiritCleanerLoaded = true;

    var running = false;
    var monitoringSpirit = false;
    function persistRunning(v) { try { localStorage.setItem('lvSpiritCleaner.wasRunning', v ? '1' : '0'); } catch(_) {} }
    var autoTrialRunning = false;
    var autoTreasureRunning = false;
    var autoInscriptionRunning = false;
    var autoCraftRunning = false;

    async function fetchRecipes(type) {
        if (!gameApi()) return [];
        var ep = type === 'alchemy' ? '/api/game/alchemy/recipes' : '/api/game/forge/recipes';
        try {
            var res = await gameApi().get(ep);
            if (res && res.code === 200) {
                // 兼容多种返回格式
                if (Array.isArray(res.data)) return res.data;
                if (res.data && Array.isArray(res.data.recipes)) return res.data.recipes;
                if (res.data && Array.isArray(res.data.items)) return res.data.items;
                if (res.data && Array.isArray(res.data.list)) return res.data.list;
                // 可能 data 是对象，数字键
                var arr = [];
                for (var k in res.data) { if (res.data.hasOwnProperty(k) && !isNaN(Number(k))) arr.push(res.data[k]); else if (res.data.hasOwnProperty(k) && typeof res.data[k] === 'object' && res.data[k] !== null) arr.push(res.data[k]); }
                if (arr.length) return arr;
            }
            console.log('[fetchRecipes] unexpected format', JSON.stringify(res).substring(0, 300));
        } catch (_) {}
        return [];
    }
    function getCraftItemId(recipe, type) {
        return String(type === 'alchemy' ? (recipe.pillId || recipe.id || '') : (recipe.recipeId || recipe.id || ''));
    }
    function getCraftItemName(recipe, type) {
        return recipe.pillName || recipe.name || recipe.itemName || '';
    }
    var _craftStats = { total: 0, startCount: 0 };
    async function autoCraftLoop() {
        if (autoCraftRunning) { setStatus('炼制已在运行', 'warn'); return; }
        syncSettingsFromUi();
        if (!state.craftRecipeId || !gameApi()) { setStatus('请先选择配方', 'warn'); return; }
        autoCraftRunning = true;
        var type = state.craftType;
        var recipeId = state.craftRecipeId;
        var target = state.craftTargetCount;
        var autoBuy = state.craftAutoBuyMats;
        updateMeter();
        // 取配方信息
        var recipes = await fetchRecipes(type);
        var recipe = null;
        for (var ri = 0; ri < recipes.length; ri++) { if (getCraftItemId(recipes[ri], type) === recipeId) { recipe = recipes[ri]; break; } }
        if (!recipe) { setStatus('未找到配方', 'warn'); autoCraftRunning = false; return; }
        var name = getCraftItemName(recipe, type);
        // 查当前数量
        var invRes = await gameApi().get('/api/game/inventory');
        var current = 0;
        if (invRes && invRes.code === 200 && Array.isArray(invRes.data)) {
            for (var ii = 0; ii < invRes.data.length; ii++) {
                var item = invRes.data[ii];
                if (String(item.templateId || '') === recipeId || String(item.id || '') === recipeId || (item.name || item.itemName || '').indexOf(name) >= 0) {
                    current += Number(item.quantity || item.count || 1);
                }
            }
        }
        craftLog('开始炼制: ' + name + ' | 目标' + target + '次' + (autoBuy ? ' | 自动买材料' : ''));
        setStatus('开始炼制: ' + name + ' 目标' + target, 'run');
        // 每次炼制数量：用户设了就用（受游戏上限约束），没设用游戏上限
        var gameCap = type === 'alchemy' ? 100 : 50;
        var batchCap = state.craftBatchSize > 0 ? Math.min(state.craftBatchSize, gameCap) : gameCap;
        var crafted = 0;
        while (autoCraftRunning && crafted < target) {
            if (autoBuy && recipe.materials && recipe.materials.length) {
                for (var mi = 0; mi < recipe.materials.length; mi++) {
                    var mat = recipe.materials[mi];
                    var needed = Math.max(0, (mat.required || mat.amount || 1) * Math.min(batchCap, target - crafted));
                    if (needed > 0) {
                        try { await gameApi().post('/api/game/craft/quick-buy-mats', { type: type, id: recipeId, amount: needed }); } catch (_) {}
                        await sleep(300);
                    }
                }
            }
            // 每次炼上限或剩余数量
            var batchCount = Math.min(batchCap, target - crafted);
            var craftEp = type === 'alchemy' ? '/api/game/alchemy/batch-craft' : '/api/game/forge/batch-craft';
            var craftKey = type === 'alchemy' ? 'pillId' : 'recipeId';
            var payload = {}; payload[craftKey] = recipeId; payload.count = batchCount;
            var craftRes = await gameApi().post(craftEp, payload);
            if (!craftRes || craftRes.code !== 200) {
                craftLog('失败: ' + ((craftRes && craftRes.message) || '未知'));
                setStatus('炼制失败', 'warn');
                await sleep(2000);
                continue;
            }
            var actualCount = Number(craftRes.data && craftRes.data.craftCount) || batchCount;
            crafted += actualCount;
            // 从 message 字符串解析品质分布
            var qualityTally = {};
            var msg = (craftRes.data && craftRes.data.message) || '';
            var tallyMatch = msg.match(/共锻.*?:\s*(.+?)(?:\s*\(|$)/) || msg.match(/共炼.*?:\s*(.+?)(?:\s*\(|$)/);
            if (tallyMatch) {
                var items = tallyMatch[1].split(/[、，,\s]+/);
                for (var ti = 0; ti < items.length; ti++) {
                    var pair = items[ti].match(/^(.+?)x(\d+)$/);
                    if (pair) qualityTally[pair[1]] = (qualityTally[pair[1]] || 0) + parseInt(pair[2], 10);
                }
            }
            var parts = [];
            for (var qk in qualityTally) { if (qualityTally.hasOwnProperty(qk)) parts.push(qk + '×' + qualityTally[qk]); }
            craftLog('炼+' + actualCount + ' | ' + Math.min(crafted, target) + '/' + target + (parts.length ? ' | ' + parts.join(' ') : ''));
            setStatus('炼制: ' + name + ' ' + crafted + '/' + target, 'run');
            await sleep(600);
        }
        autoCraftRunning = false;
        updateMeter();
        craftLog(crafted >= target ? '完成! 共炼' + crafted + '次' : '停止 | ' + crafted + '/' + target);
        setStatus('炼制完成: ' + name + ' ' + crafted + '/' + target, 'run');
    }
    function stopCraft() {
        autoCraftRunning = false;
        updateMeter();
        setStatus('炼制已停止', 'idle');
    }
    var loopTimer = null;
    var busyEvent = false;
    var checkingCloudUpdate = false;
    var inscriptionStats = { total: 0, kept: 0, discarded: 0, best: '' };
    var hiddenCharmLastUseAt = 0;
    var recruitLastActionAt = 0;
    var recruitObserver = null;
    var recruitProcessedIds = {};
    var HIGH_FEE_CONFIRM_THRESHOLD = 500000;
    var PANEL_Z_INDEX = 2147483000;
    var UPDATE_MODAL_Z_INDEX = 2147483001;
    var SCRIPT_VERSION = '1.6.0';
    var CLOUD_UPDATE_POLL_MS = 60000;
    var CLOUD_UPDATE_REMIND_MS = 300000;
    var CLOUD_UPDATE_TIMEOUT_MS = 10000;
    var ONLINE_HEARTBEAT_MS = 30000;
    var GITHUB_REPO_SLUG = 'SuRanHF/lingverse-spirit-cleaner';
    var DEFAULT_UPDATE_MANIFEST_URL = 'https://gitee.com/wanoujj/lingverse-spirit-cleaner/raw/main/release.json?v=' + SCRIPT_VERSION;
    var DEFAULT_ONLINE_STATS_ENDPOINT = 'https://unreclaimable-unyieldingly-coretta.ngrok-free.dev/api/heartbeat';
    var onlineHeartbeatStarted = false;

    // 清理统计
    var _cleanStats = { explores: 0, combats: 0, combatExp: 0, deaths: 0, startTime: 0, startSpirit: 0, startRealm: '', startRealmPct: 0 };
    var _lastCleanReport = 0;
    var _lastMeditateReport = 0;

    function resetCleanStats() {
        _cleanStats = { explores: 0, combats: 0, combatExp: 0, deaths: 0, startTime: Date.now(), startSpirit: 0, startRealm: '', startRealmPct: 0 };
        _lastCleanReport = 0;
        _lastMeditateReport = 0;
        var p = getPlayer() || {};
        _cleanStats.startRealm = p.realm || p.realmName || '';
        _cleanStats.startRealmPct = p.cultivationNeeded > 0 ? (p.cultivation || 0) / p.cultivationNeeded * 100 : 0;
        var info = getSpiritInfo();
        _cleanStats.startSpirit = info.maxSpirit || 0;
    }

    function getPlayerRealmStr() {
        var p = getPlayer() || {};
        var realm = p.realm || p.realmName || '?';
        var pct = 0;
        if (p.cultivationNeeded > 0) {
            pct = Math.min(100, (p.cultivation || 0) / p.cultivationNeeded * 100);
        }
        return realm + ' ' + pct.toFixed(1) + '%';
    }
    function getCurrentAreaName() {
        var p = getPlayer() || {};
        // player 对象的区域字段
        var name = p.currentArea || p.area || p.zone || p.location || p.currentZone || '';
        if (name && !/^[a-zA-Z]+$/.test(name)) return name;
        // 兜底：从页面读取
        var el = document.getElementById('currentAreaName') || document.querySelector('.current-area,.area-name,.zone-name');
        if (el) name = (el.textContent || '').trim();
        if (name && name.length < 20) return name;
        return '未知区域';
    }
    var autoBailRunning = false;
    var autoFarmRunning = false;
    var autoPavilionRunning = false;
    var autoTalismanRunning = false;

    // --- 涅槃重生丹 ---
    async function ensureNirvanaPill() {
        if (!gameApi()) return;
        // 先查身上是否已有涅槃加成
        var p = getPlayer() || {};
        var buffs = Array.isArray(p.activeBuffs) ? p.activeBuffs : [];
        var hasNirvanaBuff = buffs.some(function(b) {
            var n = (b.name || '').toLowerCase();
            return n.indexOf('涅槃') >= 0 || n.indexOf('重生') >= 0;
        });
        if (hasNirvanaBuff) return; // 已有加成，不浪费
        // 查背包，有就直接用
        try { var invRes = await gameApi().get('/api/game/inventory'); } catch (_) { return; }
        if (!invRes || invRes.code !== 200 || !Array.isArray(invRes.data)) return;
        var item = invRes.data.find(function(it) {
            var t = String(it.templateId || '').toLowerCase();
            return t.indexOf('pill_nirvana_') >= 0 || t.indexOf('bp_pill_rebirth') >= 0;
        });
        if (item) {
            var itemId = item.id || item.itemId || item.instanceId;
            if (itemId) {
                setStatus('使用涅槃重生丹...', 'run');
                try { await gameApi().post('/api/game/use-item', { itemId: itemId }); } catch (_) {}
            }
            return;
        }
        // 背包没有 → 炼造
        try {
            var recipes = await gameApi().get('/api/game/alchemy/recipes');
            if (!recipes || recipes.code !== 200 || !recipes.data) return;
            var list = Array.isArray(recipes.data) ? recipes.data : (recipes.data.recipes || []);
            var rarity = state.nirvanaRarity || 3;
            // 按品质筛选匹配的涅槃丹配方
            var nirvana = list.find(function(r) {
                var name = (r.pillName || r.name || '').toLowerCase();
                var tid = String(r.pillId || r.id || '').toLowerCase();
                var rRarity = r.rarity || r.quality || 0;
                if (rRarity && Number(rRarity) !== Number(rarity)) return false;
                return name.indexOf('涅槃') >= 0 || name.indexOf('重生') >= 0 || tid.indexOf('pill_nirvana_') >= 0;
            });
            if (!nirvana) {
                // 没有精确匹配品质的，退而求其次找任意涅槃丹
                nirvana = list.find(function(r) {
                    var name = (r.pillName || r.name || '').toLowerCase();
                    var tid = String(r.pillId || r.id || '').toLowerCase();
                    return name.indexOf('涅槃') >= 0 || name.indexOf('重生') >= 0 || tid.indexOf('pill_nirvana_') >= 0;
                });
            }
            if (nirvana) {
                var pillId = nirvana.pillId || nirvana.id;
                var qty = Math.max(1, Math.min(999, state.nirvanaCraftQty || 1));
                var BATCH_CAP = 100;
                var batches = Math.ceil(qty / BATCH_CAP);
                setStatus('炼造涅槃重生丹 x' + qty + ' (' + batches + '批)...', 'run');
                for (var bi = 0; bi < batches; bi++) {
                    var batchCount = Math.min(BATCH_CAP, qty - bi * BATCH_CAP);
                    try { await gameApi().post('/api/game/alchemy/batch-craft', { pillId: pillId, count: batchCount }); } catch (_) {}
                    if (bi < batches - 1) await sleep(500 + Math.floor(Math.random() * 800));
                }
                await sleep(500);
                // 炼好了，查背包使用
                var invRes2 = await gameApi().get('/api/game/inventory');
                if (invRes2 && invRes2.code === 200 && Array.isArray(invRes2.data)) {
                    var crafted = invRes2.data.find(function(it) { var t = String(it.templateId || '').toLowerCase(); return t.indexOf('pill_nirvana_') >= 0 || t.indexOf('bp_pill_rebirth') >= 0; });
                    if (crafted) {
                        var cid = crafted.id || crafted.itemId || crafted.instanceId;
                        if (cid) { try { await gameApi().post('/api/game/use-item', { itemId: cid }); setStatus('涅槃重生丹已使用', 'run'); } catch (_) {} }
                    }
                }
            }
        } catch (_) {}
    }

    // --- 配置导入导出 ---
    function exportConfig() {
        var cfg = {};
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf('lvSpiritCleaner.') === 0) cfg[k] = localStorage.getItem(k);
        }
        var blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = 'lingverse-config-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click(); URL.revokeObjectURL(a.href);
        setStatus('配置已导出', 'run');
    }
    function importConfig() {
        var input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
        input.onchange = function() {
            var file = input.files[0]; if (!file) return;
            var reader = new FileReader();
            reader.onload = function() {
                try {
                    var cfg = JSON.parse(reader.result);
                    var cnt = 0;
                    for (var k in cfg) { if (cfg.hasOwnProperty(k) && k.indexOf('lvSpiritCleaner.') === 0) { localStorage.setItem(k, cfg[k]); cnt++; } }
                    setStatus('已导入' + cnt + '项，刷新生效', 'run');
                } catch (e) { setStatus('导入失败: ' + e.message, 'warn'); }
            };
            reader.readAsText(file);
        };
        input.click();
    }
    var autoSweepRunning = false;
    var _sweepCount = 0, _sweepMaps = 0, _sweepCost = 0;
    var _lastLuckCheck = 0, _lastBreakCheck = 0, _lastOriginCheck = 0, _lastSellCheck = 0;

    var autoRefreshLuckRunning = false;
    function updateLuckDisplay() {
        var el = document.getElementById('lvscLuckNow'); if (!el) return;
        var p = getPlayer() || {};
        var luck = Number(p.luck || 0);
        el.textContent = '当前: ' + (luck || '?');
        el.style.color = luck >= state.minLuck ? '#6bc9a0' : '#dbb970';
    }
    async function autoRefreshLuckLoop() {
        if (autoRefreshLuckRunning || !gameApi()) return;
        // 先刷新玩家数据拿到最新气运
        await refreshPlayer();
        var p = getPlayer() || {};
        var curLuck = Number(p.luck || 0);
        updateLuckDisplay();
        if (curLuck >= state.minLuck) {
            setStatus('气运已达标: ' + curLuck + ' ≥ ' + state.minLuck + '，无需刷新', 'run', 'Luck');
            return;
        }
        autoRefreshLuckRunning = true;
        var useAd = state.luckRefreshMethod === 'ad';
        var methodLabel = useAd ? '仙缘' : '灵石';
        setStatus('气运 ' + curLuck + ' < ' + state.minLuck + '，开始刷(' + methodLabel + ')...', 'run', 'Luck');
        try {
            var startBtn = document.getElementById('lvscLuckRefreshStartBtn');
            var stopBtn = document.getElementById('lvscLuckRefreshStopBtn');
            if (startBtn) startBtn.style.display = 'none';
            if (stopBtn) stopBtn.style.display = '';
        } catch (_) {}
        var count = 0;
        while (autoRefreshLuckRunning) {
            try {
                var r = await gameApi().post('/api/game/refresh-luck', { useAdPoints: useAd });
                if (!autoRefreshLuckRunning) break;
                if (r && r.code === 200 && r.data) {
                    count++;
                    var newLuck = Number(r.data.newLuck || 0);
                    setStatus('第' + count + '次: ' + curLuck + '→' + newLuck + (newLuck >= state.minLuck ? ' 达标' : ''), 'run');
                    // 更新缓存和显示
                    if (window._lastPlayerData) window._lastPlayerData.luck = newLuck;
                    updateLuckDisplay();
                    curLuck = newLuck;
                    if (newLuck >= state.minLuck) break;
                } else {
                    setStatus('刷新失败: ' + ((r && r.message) || '未知'), 'warn');
                    break;
                }
            } catch (e) { setStatus('异常: ' + (e.message || ''), 'warn'); break; }
            await sleep(1500);
        }
        autoRefreshLuckRunning = false;
        try {
            var startBtn2 = document.getElementById('lvscLuckRefreshStartBtn');
            var stopBtn2 = document.getElementById('lvscLuckRefreshStopBtn');
            if (startBtn2) startBtn2.style.display = '';
            if (stopBtn2) stopBtn2.style.display = 'none';
        } catch (_) {}
    }
    function stopLuckRefresh() { autoRefreshLuckRunning = false; }
    async function autoBreakthroughCheck() { if (!gameApi() || Date.now() - _lastBreakCheck < 300000) return; _lastBreakCheck = Date.now(); var p = getPlayer() || {}; if (!(p.breakthroughRate >= 0)) return; try { setStatus('尝试突破...', 'run', 'Break'); var r = await gameApi().post('/api/game/breakthrough', { daoBonusPercent: 0 }); if (r && r.code === 200 && r.data && r.data.success === 'true') { setStatus('突破成功!', 'run', 'Break'); wecomEnqueue('突破成功', (p.realm||'') + ' 突破成功'); } } catch (_) {} }
    async function autoOriginRepairCheck() { if (!gameApi() || Date.now() - _lastOriginCheck < 120000) return; _lastOriginCheck = Date.now(); var p = getPlayer() || {}; var od = p.originDamage; if (!od || !od.hasDamage) return; try { setStatus('修复本源碎裂...', 'run', 'Origin'); await gameApi().post('/api/player/origin-damage/repair', { type: 'stone' }); wecomEnqueue('本源修复', '已修复本源碎裂'); } catch (_) {} }
    var autoDisposeRunning = false;
    var SCOPE_LABELS = {equip:'装备',pill:'丹药',scroll:'卷轴',misc:'杂物',all:'全部'};
    var RARITY_LABELS = ['','普通','优良','稀有','史诗'];
    function disposeLog(msg) { if (window._disposeLog) window._disposeLog(msg); }
    async function autoDisposeLoop() {
        if (autoDisposeRunning || !gameApi()) return;
        autoDisposeRunning = true;
        disposeLog('监控已启动');
        try {
            var startBtn = document.getElementById('lvscDisposeStartBtn');
            var stopBtn = document.getElementById('lvscDisposeStopBtn');
            if (startBtn) startBtn.style.display = 'none';
            if (stopBtn) stopBtn.style.display = '';
        } catch (_) {}
        while (autoDisposeRunning) {
            var rules = Array.isArray(state.autoDisposeRules) ? state.autoDisposeRules.slice() : [];
            if (!rules.length) { await sleep(5000); continue; }
            disposeLog('── 开始一轮检测 ──');
            for (var ri = 0; ri < rules.length; ri++) {
                if (!autoDisposeRunning) break;
                var rule = rules[ri];
                if (!rule || !rule.action) continue;
                var scopeLabel = SCOPE_LABELS[rule.scope] || rule.scope;
                var rarityLabel = RARITY_LABELS[rule.maxRarity] || rule.maxRarity;
                var desc = scopeLabel + '[' + rarityLabel + '及以下]';
                var ok = false;
                try {
                    if (rule.action === 'sell') {
                        var p = { maxRarity: rule.maxRarity };
                        if (rule.scope !== 'all') p.scope = rule.scope;
                        // 收集排除ID：锁定物品 + 用户手动保护
                        var excludedIds = [];
                        try {
                            var _inv = await gameApi().get('/api/game/inventory');
                            if (_inv && _inv.code === 200 && Array.isArray(_inv.data)) {
                                for (var _ii = 0; _ii < _inv.data.length; _ii++) {
                                    var _it = _inv.data[_ii];
                                    if (_it && _it.isLocked && _it.templateId) excludedIds.push(String(_it.templateId));
                                }
                            }
                        } catch (_) {}
                        var protItems = Array.isArray(state.autoDisposeProtected) ? state.autoDisposeProtected : [];
                        for (var _pi = 0; _pi < protItems.length; _pi++) {
                            var _pid = typeof protItems[_pi] === 'string' ? protItems[_pi] : protItems[_pi].id;
                            if (_pid && excludedIds.indexOf(_pid) < 0) excludedIds.push(_pid);
                        }
                        // 游戏默认排除名单（对话框里默认不勾的）
                        var DEFAULT_EXCLUDED = ['blank_scroll_1','blank_scroll_2','blank_scroll_3','blank_scroll_4','blank_scroll_5'];
                        for (var _di = 0; _di < DEFAULT_EXCLUDED.length; _di++) {
                            if (excludedIds.indexOf(DEFAULT_EXCLUDED[_di]) < 0) excludedIds.push(DEFAULT_EXCLUDED[_di]);
                        }
                        if (excludedIds.length) p.excludedTemplateIds = excludedIds;
                        var preview = await gameApi().post('/api/game/sell-batch/preview', p);
                        if (preview && preview.code === 200 && preview.data && preview.data.count) {
                            var batch = await gameApi().post('/api/game/sell-batch', p);
                            if (batch && batch.code === 200 && batch.data) {
                                disposeLog('✓ 出售 ' + desc + '：' + batch.data.count + '件，+' + batch.data.totalGold + '灵石');
                                ok = true;
                            }
                        } else {
                            disposeLog('  出售 ' + desc + '：无待售物品');
                        }
                    } else if (rule.action === 'dismantle') {
                        var sp = { maxRarity: rule.maxRarity };
                        var spv = await gameApi().post('/api/game/salvage-batch/preview', sp);
                        if (spv && spv.code === 200 && spv.data && Array.isArray(spv.data.itemIds) && spv.data.itemIds.length) {
                            var sb = await gameApi().post('/api/game/salvage-batch', { maxRarity: rule.maxRarity, count: spv.data.itemIds.length, itemIds: spv.data.itemIds });
                            if (sb && sb.code === 200 && sb.data) {
                                var rewardStr = (sb.data.rewards || []).map(function(r) { return r.name + 'x' + r.quantity; }).join(', ');
                                disposeLog('✓ 分解 ' + desc + '：' + sb.data.count + '件' + (rewardStr ? ' → ' + rewardStr : ''));
                                ok = true;
                            }
                        } else {
                            disposeLog('  分解 ' + desc + '：无待分解装备');
                        }
                    }
                } catch (e) { disposeLog('  ✗ ' + desc + '：' + (e.message || '异常')); }
                if (!autoDisposeRunning) break;
                if (ok) await sleep(200);
            }
            if (!autoDisposeRunning) break;
            // 自动凝聚碎片
            if (state.autoSynthesize) {
                try {
                    var synRes = await gameApi().post('/api/game/items/synthesize-batch');
                    if (synRes && synRes.code === 200) disposeLog('  凝聚完成');
                } catch (_) {}
            }
            disposeLog('── 本轮完成，' + state.autoDisposeInterval + '秒后再次检测 ──');
            var waited = 0;
            while (autoDisposeRunning && waited < state.autoDisposeInterval * 1000) {
                await sleep(1000); waited += 1000;
            }
        }
        autoDisposeRunning = false;
        try {
            var startBtn2 = document.getElementById('lvscDisposeStartBtn');
            var stopBtn2 = document.getElementById('lvscDisposeStopBtn');
            if (startBtn2) startBtn2.style.display = '';
            if (stopBtn2) stopBtn2.style.display = 'none';
        } catch (_) {}
        disposeLog('监控已停止');
    }
    function stopDispose() { autoDisposeRunning = false; }

    // --- 试练塔扫荡 ---
    async function autoSweepLoop() {
        if (autoSweepRunning || !gameApi()) return;
        var maxSweep = Math.max(0, Number(document.getElementById('lvscSweepMax').value) || 0);
        var delay = Math.max(500, Number(document.getElementById('lvscSweepDelay').value) || 3000);
        autoSweepRunning = true; _sweepCount = 0; _sweepMaps = 0; _sweepCost = 0;
        document.getElementById('lvscSweepStartBtn').style.display = 'none';
        document.getElementById('lvscSweepStopBtn').style.display = '';
        updateMeter(); sweepLog('扫荡开始' + (maxSweep > 0 ? ' 上限' + maxSweep + '次' : ' 无限'));
        while (autoSweepRunning) {
            if (maxSweep > 0 && _sweepCount >= maxSweep) { sweepLog('达到上限' + maxSweep + '次，停止'); break; }
            try {
                var r = await gameApi().post('/api/trial-tower/sweep', {});
                if (!autoSweepRunning) break;
                if (r && r.code === 200) {
                    _sweepCount++;
                    var floor = (r.data && r.data.reachedFloor) || 0;
                    var maps = (r.data && r.data.rewardMaps) || (r.data && r.data.treasureMap) || 0;
                    _sweepMaps += maps;
                    _sweepCost += (r.data && r.data.cost) || 0;
                    sweepLog('✓ 第' + _sweepCount + '次 第' + floor + '层 藏宝图+' + maps);
                } else {
                    sweepLog('✗ 失败: ' + ((r && r.message) || ''));
                    if ((r && r.message || '').indexOf('灵石不足') >= 0) { sweepLog('灵石不足，停止'); break; }
                }
            } catch (e) { sweepLog('✗ ' + (e.message || '')); }
            if (autoSweepRunning) await sleep(delay);
        }
        autoSweepRunning = false;
        document.getElementById('lvscSweepStartBtn').style.display = '';
        document.getElementById('lvscSweepStopBtn').style.display = 'none';
        updateMeter();
        sweepLog('完成: ' + _sweepCount + '次 藏宝图+' + _sweepMaps + ' 耗灵石' + _sweepCost);
    }
    function stopSweep() { autoSweepRunning = false; }
    function sweepLog(msg) { var l = document.getElementById('lvscSweepLog'); if (!l) return; var t = new Date().toLocaleTimeString(); l.textContent = '[' + t + '] ' + msg + '\n' + (l.textContent || ''); if (l.textContent.length > 4000) l.textContent = l.textContent.substring(0, 4000); }

    // --- 灵田 ---
    async function farmOverview() { if (!gameApi()) return null; try { var r = await gameApi().get('/api/game/player-sect/farm/overview?page=1&pageSize=1'); return (r && r.code === 200 && r.data) ? r.data : null; } catch (_) { return null; } }
    async function farmHarvest() { if (!gameApi()) return false; var r = await gameApi().post('/api/game/player-sect/farm/harvest-all', {}); return !!(r && r.code === 200); }
    var _lastFarmExpandTime = 0;
    async function farmPlant(seedId) { if (!gameApi() || !seedId) return false; var r = await gameApi().post('/api/game/player-sect/farm/plant-all', { seedId: seedId }); return !!(r && r.code === 200); }
    async function farmInvasionAttack() { if (!gameApi()) return false; var r = await gameApi().post('/api/game/player-sect/farm/invasion/attack', {}); return !!(r && r.code === 200); }
    async function farmExpand(wantCount) {
        if (!gameApi() || !wantCount) return false;
        // 从 overview 动态计算最大开垦数
        var max = wantCount;
        try {
            var ov = await farmOverview();
            if (ov) {
                var realmLimit = Number(ov.maxFarmClaimCount) || 0;
                var contrib = Number(ov.myAvailableContribution) || 0;
                var cost = Number(ov.claimContribCost) || 1;
                var contribLimit = cost > 0 ? Math.floor(contrib / cost) : 5000;
                max = Math.min(wantCount, realmLimit || 5000, contribLimit || 5000, 5000);
                if (max <= 0) { farmLog('贡献不足或已达境界上限'); return false; }
                if (max < wantCount) farmLog('最大可开' + max + '块（境界上限' + realmLimit + ' 贡献' + contrib + '）');
            }
        } catch (_) {}
        var r = await gameApi().post('/api/game/player-sect/farm/claim-batch', { count: max });
        if (r && r.code === 200) { farmLog('开垦成功 ×' + max); return true; }
        if (max > 1) { var r2 = await gameApi().post('/api/game/player-sect/farm/claim-batch', { count: 1 }); if (r2 && r2.code === 200) { farmLog('开垦成功 ×1'); return true; } }
        farmLog('开垦失败: ' + (r2 ? (r2.message || r2.code) : (r ? (r.message || r.code) : 'err')));
        return false;
    }
    async function autoFarmLoop() { if (autoFarmRunning) return; autoFarmRunning = true; updateMeter(); farmLog('灵田监控启动'); while (autoFarmRunning) { try { var data = await farmOverview(); if (!data) { farmLog('获取灵田数据失败'); await sleep(10000); continue; } var mature = data.myMatureCount || 0, idle = data.myIdleCount || 0, total = data.myPlotTotal || 0; farmLog("成熟"+mature+" 空闲"+idle+" 总计"+total); if (mature > 0 && state.farmAutoHarvest) { farmLog('收获成熟 ×' + mature); await farmHarvest(); await sleep(500); } if (idle > 0 && state.farmAutoPlant && state.farmSeedId) { farmLog('种植 ' + state.farmSeedName + ' ×' + idle); await farmPlant(state.farmSeedId); await sleep(500); } if (data.farmInvasion && state.farmAutoInvasion) { farmLog('迎击灵田入侵...'); await farmInvasionAttack(); await sleep(500); } if (state.farmExpandEnabled && idle <= 0 && Date.now() - _lastFarmExpandTime > 3600000) { _lastFarmExpandTime = Date.now(); farmLog('开垦...'); await farmExpand(999); } updateFarmExpandTimer(); } catch (e) { farmLog('异常: ' + (e.message || '')); } await sleep(state.farmInterval * 1000); } updateMeter(); }
    function stopFarm() { autoFarmRunning = false; updateMeter(); }
    function farmLog(msg) { var log = document.getElementById('lvscFarmLog'); if (!log) return; var t = new Date().toLocaleTimeString(); log.textContent = '[' + t + '] ' + msg + '\n' + (log.textContent || ''); if (log.textContent.length > 4000) log.textContent = log.textContent.substring(0, 4000); }
    function updateFarmExpandTimer() {
        var el = document.getElementById('lvscFarmNextExpand'); if (!el) return;
        var next = _lastFarmExpandTime + 3600000;
        var remain = Math.max(0, next - Date.now());
        if (remain <= 0) { el.textContent = '可开垦'; return; }
        var m = Math.floor(remain / 60000);
        var s = Math.floor((remain % 60000) / 1000);
        el.textContent = '下次开垦: ' + m + '分' + s + '秒后';
    }

    // --- 珍宝阁 ---
    async function fetchPavilionShop() { if (!gameApi()) return []; try { var res = await gameApi().get('/api/game/player-sect/builtin-shop'); return (res && res.code === 200 && Array.isArray(res.data)) ? res.data : []; } catch (_) { return []; } }
    async function autoPavilionLoop() { if (autoPavilionRunning || running) return; syncSettingsFromUi(); if (!state.pavilionItemId || !gameApi()) { setStatus('请先选择珍宝阁商品', 'warn'); return; } autoPavilionRunning = true; var done = 0, succ = 0; updateMeter(); pavilionLog('开始兑换: ' + state.pavilionItemName + ' 每次' + state.pavilionQty + ' 循环' + state.pavilionLoop); while (autoPavilionRunning && done < state.pavilionLoop) { try { var r = await gameApi().post('/api/game/player-sect/buy-builtin-item', { itemId: state.pavilionItemId, quantity: state.pavilionQty }); if (r && r.code === 200) { succ++; pavilionLog('✓ ' + (done + 1) + '/' + state.pavilionLoop); } else { pavilionLog('✗ ' + (done + 1) + ': ' + ((r && r.message) || '')); } } catch (e) { pavilionLog('✗ 异常: ' + (e.message || '')); } done++; if (done < state.pavilionLoop) await sleep(state.pavilionDelay); } autoPavilionRunning = false; updateMeter(); pavilionLog('完成: ' + succ + '/' + done); setStatus('珍宝阁完成', 'run'); }
    function stopPavilion() { autoPavilionRunning = false; updateMeter(); }
    function pavilionLog(msg) { var log = document.getElementById('lvscPavilionLog'); if (!log) return; var t = new Date().toLocaleTimeString(); log.textContent = '[' + t + '] ' + msg + '\n' + (log.textContent || ''); if (log.textContent.length > 4000) log.textContent = log.textContent.substring(0, 4000); }

    // --- 批量用符 ---
    function talismanLog(msg) { var log = document.getElementById('lvscTalismanLog'); if (!log) return; var t = new Date().toLocaleTimeString(); log.textContent = '[' + t + '] ' + msg + '\n' + (log.textContent || ''); if (log.textContent.length > 4000) log.textContent = log.textContent.substring(0, 4000); }
    async function autoTalismanLoop() { if (autoTalismanRunning || !gameApi()) return; autoTalismanRunning = true; var batchSize = Math.max(1, Number(document.getElementById('lvscTalismanBatch').value) || 10); var loops = Math.max(1, Number(document.getElementById('lvscTalismanLoops').value) || 5); var delay = Math.max(500, Number(document.getElementById('lvscTalismanDelay').value) || 1500); var type = document.getElementById('lvscTalismanType').value; document.getElementById('lvscStartTalismanBtn').style.display = 'none'; document.getElementById('lvscStopTalismanBtn').style.display = ''; updateMeter(); talismanLog('开始: 每次' + batchSize + ' 循环' + loops); var used = 0; for (var i = 0; i < loops && autoTalismanRunning; i++) { try { var invRes = await gameApi().get('/api/game/inventory'); if (!invRes || invRes.code !== 200 || !Array.isArray(invRes.data)) { talismanLog('获取背包失败'); break; } var items = invRes.data.filter(function(item) { var tid = (item.templateId || '').toLowerCase(); if (!tid || tid.indexOf('talisman_') < 0) return false; if (item.isLocked || item.isEquipped) return false; if (type === 'stealth' && tid.indexOf('stealth') < 0) return false; if (type === 'combat' && tid.indexOf('stealth') >= 0) return false; return Number(item.quantity || item.count || 0) >= 1; }); if (!items.length) { talismanLog('没有可用符篆'); break; } var item = items[0]; var itemId = item.id || item.itemId || item.instanceId; var count = Math.min(batchSize, Number(item.quantity || item.count || 1)); var useRes = await gameApi().post('/api/game/use-item', { itemId: itemId, quantity: count }); if (useRes && useRes.code === 200) { used += count; talismanLog('✓ ' + (i + 1) + '/' + loops + ' ×' + count + ' (' + used + ')'); } else { talismanLog('✗ 失败: ' + ((useRes && useRes.message) || '')); } } catch (e) { talismanLog('✗ ' + (e.message || '')); } if (i < loops - 1) await sleep(delay); } autoTalismanRunning = false; document.getElementById('lvscStartTalismanBtn').style.display = ''; document.getElementById('lvscStopTalismanBtn').style.display = 'none'; updateMeter(); talismanLog('完成: ' + used + '张'); }
    function stopTalisman() { autoTalismanRunning = false; }

    // 装备套装切换
    async function captureEquipSet(setKey) {
        if (!gameApi()) { setStatus('API不可用', 'warn'); return; }
        var ids = [];
        try {
            var res = await gameApi().get('/api/game/equipment/current');
            if (res && res.code === 200 && Array.isArray(res.data)) {
                for (var ei = 0; ei < res.data.length; ei++) {
                    var id = res.data[ei].playerItemId || res.data[ei].id || res.data[ei].itemId;
                    if (id) ids.push(String(id));
                }
            }
        } catch (_) {}
        state[setKey] = ids;
        localStorage.setItem('lvSpiritCleaner.' + setKey, JSON.stringify(ids));
        var label = setKey === 'spiritEquipIds' ? '神识套' : '战斗套';
        setStatus(label + '已记录 ' + ids.length + ' 件', 'run');
    }
    async function equipSet(ids) {
        if (!gameApi() || !ids || !ids.length) return;
        for (var ei = 0; ei < ids.length; ei++) {
            try { await gameApi().post('/api/player/equip', { itemId: ids[ei] }); } catch (_) {}
            await sleep(200);
        }
        await refreshPlayer();
    }

    // 自动出狱：检测并保释
    async function checkAndAutoBail(manual) {
        if (autoBailRunning || !gameApi()) return;
        autoBailRunning = true;
        try {
            // 检测是否在监狱
            var stateRes = await gameApi().get('/api/game/immortal/state');
            if (!stateRes || stateRes.code !== 200 || !stateRes.data) {
                if (manual) setStatus('无法获取仙庭状态', 'warn');
                return;
            }
            var immState = stateRes.data;
            // 被关时 canBailWithStone 或 canBailWithMaterial 存在
            var canBailS = immState.canBailWithStone;
            var canBailM = immState.canBailWithMaterial;
            if (!canBailS && !canBailM) {
                if (manual) setStatus('当前未被禁闭', 'run');
                return;
            }
            var method = state.bailMethod || 'stone';
            if (method === 'stone' && !canBailS) method = 'material';
            if (!canBailM && !canBailS) { setStatus('保释资源不足', 'warn'); return; }
            var label = method === 'material' ? '仙材保释' : '灵石保释';
            setStatus('自动' + label + '...', 'run');
            var bailRes = await gameApi().post('/api/game/immortal/bail', { method: method });
            if (bailRes && bailRes.code === 200) {
                setStatus(label + '成功', 'run');
                wecomEnqueue('自动出狱', label);
                await refreshPlayer();
            } else {
                if (manual) setStatus(label + '失败: ' + ((bailRes && bailRes.message) || ''), 'warn');
            }
        } catch (err) {
            if (manual) setStatus('自动出狱异常', 'warn');
        } finally {
            autoBailRunning = false;
        }
    }

    // 自动解决反脚本验证（算术题）- 支持中文数字
    var ANTI_CHEAT_AUTO_SOLVE = true;
    var CHINESE_NUMS = { '零':0,'〇':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'百':100,'千':1000,'万':10000,'壹':1,'贰':2,'叁':3,'肆':4,'伍':5,'陆':6,'柒':7,'捌':8,'玖':9,'拾':10 };
    function parseChineseNum(s) {
        s = String(s || '').trim();
        var n = parseFloat(s); if (Number.isFinite(n)) return n;
        var r = 0, c = 0;
        for (var i = 0; i < s.length; i++) { var v = CHINESE_NUMS[s[i]]; if (v === undefined) return NaN; if (v >= 10) { if (c === 0) c = 1; r += c * v; c = 0; } else c = v; }
        r += c; return r || NaN;
    }
    function hookAntiCheatAutoSolve() {
        if (!ANTI_CHEAT_AUTO_SOLVE) return;
        // 拦截 gamePrompt，当问题是算式时自动计算答案
        var origGamePrompt = window.gamePrompt;
        if (!origGamePrompt || origGamePrompt.__lvHooked) return;
        window._origGamePrompt = origGamePrompt; // 保存原始引用，供手动测试用
        window.gamePrompt = function (message, title, onOk, onCancel, isDestructive, inputOpts) {
            // 检测是否是反脚本验证
            if (message && message.indexOf('请输入下方算式结果') >= 0) {
                var tmp = document.createElement('div');
                tmp.innerHTML = message;
                var text = (tmp.textContent || '').replace(/\s+/g, ' ');
                // 尝试直接匹配算式模式：数字 运算符 数字
                var numRe = '([\\d.]+|[一二三四五六七八九十百千万零〇壹贰叁肆伍陆柒捌玖拾]+)';
                var opRe = '([+\\-×÷*\\/xX＋－−])';
                var exprMatch = text.match(new RegExp(numRe + '\\s*' + opRe + '\\s*' + numRe));
                if (!exprMatch) { exprMatch = message.replace(/<[^>]+>/g, ' ').match(new RegExp(numRe + '\\s*' + opRe + '\\s*' + numRe)); }
                if (exprMatch) {
                    var a = parseChineseNum(exprMatch[1]);
                    var op = exprMatch[2];
                    var b = parseChineseNum(exprMatch[3]);
                    var answer = NaN;
                    if (op === '+' || op === '＋') answer = a + b;
                    else if (op === '-' || op === '－' || op === '−') answer = a - b;
                    else if (op === '×' || op === 'x' || op === 'X' || op === '*') answer = a * b;
                    else if (op === '÷' || op === '/') answer = a / b;
                    if (Number.isFinite(answer)) {
                        // 保持整数时不要小数点
                        if (answer === Math.floor(answer)) answer = Math.floor(answer);
                        else answer = Math.round(answer * 100) / 100;
                        setStatus('自动过验证: ' + a + ' ' + op + ' ' + b + ' = ' + answer, 'run');
                        // 直接调 onOk 提交答案
                        if (onOk) { onOk(String(answer)); return; }
                    }
                }
            }
            // 不是验证弹窗，走原始逻辑
            return origGamePrompt.apply(this, arguments);
        };
        window.gamePrompt.__lvHooked = true;
    }
    var wecomBusy = false;
    var wecomQueue = [];
    var BUILTIN_CHANGELOG = [
        {
            version: '1.6.0',
            title: '出售保护 + 自动凝聚 + 物品搜索 + 双模式修复',
            notes: ['一键出售增强：物品搜索（图鉴API）→保护列表（锁品质/全品质），锁定物品模板自动排除。', '自动凝聚碎片：勾选后每轮出售前自动合成碎片。', 'API模式回退原始逻辑，双模式完全独立不再互相干扰。', '突破/本源/师门请求提升为全局检测。', '冥想改为模拟点击按钮，进度条正常显示。', '高级冥想新增「只在夏季」选项。', '修复「只在夏季」复选框刷新取消勾选。', '修复高级冥想被跳过、修复探索后遭遇不处理等问题。', '空白卷轴默认排除，不再被出售。']
        },
        {
            version: '1.5.9',
            title: '冥想模拟点击 + 高级冥想夏季选项',
            notes: ['冥想改为模拟点击游戏冥想按钮，不再直调API，进度条正常显示。', '高级冥想新增「只在夏季」选项。', '修复API探索模式下高级冥想被跳过的问题。']
        },
        {
            version: '1.5.9',
            title: '冥想模拟点击 + 高级冥想夏季选项',
            notes: ['冥想改为模拟点击游戏冥想按钮，不再直调API，进度条正常显示。', '高级冥想新增「只在夏季」选项。', '修复API探索模式下高级冥想被跳过的问题。']
        },
        {
            version: '1.5.8',
            title: '系统模式完善 + 激进模式 + 在线公告',
            notes: ['系统自带模式功能对齐API模式：涅槃丹/虚空淬体/隐秘符/恢复/突破全接入。', '探索↔监测↔冥想全自动闭环，冥想完自动恢复探索。', '新增⚔激进模式：遇怪直接打不找护道，更快但更险。', '系统模式遭遇/商人卡死自动兜底接管。', '新增在线公告弹窗系统（dashboard发布，脚本端2分钟内弹窗）。', '修复系统模式死亡不复活、企业微信通知刷屏、冥想完不会收功等问题。', '⚠ 系统清理尚不稳定，如有bug请反馈。']
        },
        {
            version: '1.5.7',
            title: '探索模式 + 系统自带 + 联动闭环',
            notes: ['探索tab新增模式切换：脚本API（全功能）/ 系统自带（游戏内置自动探索+脚本监控）。', '系统自带模式：启动游戏自动探索，脚本5秒巡查，死亡复活/冥想衔接/恢复修复全覆盖。', '探索↔监测自动联动：神识耗尽自动转监测，满了自动收功恢复探索，双模式无缝闭环。', '页面刷新后自动恢复运行状态。', '涅槃丹优化：改用batch-craft批量炼制（单批上限100），检测身上buff避免重复浪费。', '反馈修复：改回GM_xmlhttpRequest桥接绕过CORS。', '企业微信：通知路由恢复fallback，webhook输入框始终可见。', '状态栏新增灵田/出售分解/气运/突破/本源5个分类开关。']
        },
        {
            version: '1.5.6',
            title: '出售&分解 + 一键气运 + 监控面板',
            notes: ['出售&分解监控列表：多规则批量出售/分解，类别+品质+操作类型，带执行日志。', '一键刷气运：灵石/仙缘消耗可选，当前气运实时显示，循环刷新达标自动停。', '涅槃重生丹完善：品质选择+炼制数量+批量循环炼造。', '新增自动突破、自动修复本源。', '所有功能标题加 自动/需启动 徽章，一眼分清。', '探索tab加已开启摘要+正在监控列表。', '灵田加下次开垦时间倒计时。', '修复修为进度通知显示0.0%。', '修复企业微信通知路由。']
        },
        {
            version: '1.5.3',
            title: '灵田优化 + 入侵迎击',
            notes: ['灵田自动开垦简化：去间隔手动输入，两次开垦自动间隔1小时。每次扫描显示实时状态。', '灵田新增妖怪入侵自动迎击（POST invasion/attack API）。']
        },
        {
            version: '1.5.2',
            title: '恢复重写 + 铭文装配修复 + 扫荡 + 涅槃丹 + 灵田',
            notes: ['恢复系统重写：严格按用户优先级，宗门服务一次回满，15秒冷却避免天罚。', '铭文装配修复：空槽重复装bug、maxSlots补全、当前装备选项、usedSlots去重。', '新增试练塔扫荡、涅槃重生丹自动炼造使用、灵田自动开垦(动态上限)、配置导入导出。', '安装链接永久走Gitee，同版本不重复弹公告。昼夜冥想优化。']
        },
        {
            version: '1.5.1',
            title: '珍宝阁+灵田+制符+批量用符',
            notes: ['炼制tab新增珍宝阁(宗门商品API直购)和批量用符(按类型批量使用符篆)。', '炼制类型新增制符。自动tab新增灵田自动收获+种植。', '动态DOM注入架构，不动HTML字符串，好维护。']
        },
        {
            version: '1.5.0',
            title: '8-Tab UI + 批量炼制 + 装备套装',
            notes: ['6tab升级为8tab(探索/战斗/装备/商人/自动/铭文/炼制/更新)。', '批量炼丹炼器：选配方设目标，自动买材料，品质分布日志。', '装备套装：神识套/战斗套冥想前后自动切换。', '自动出狱：ImmortalModule.bail()。微信通知增强。']
        },
        {
            version: '1.4.3',
            title: '地图+夜晚+倍率+状态栏',
            notes: ['复活地图名截掉渡劫等标签，areaId存localStorage。夜晚探索白天自动冥想。', '探索倍率优选+不足自动降档，高倍率弹窗自动确认。状态栏分类开关。']
        },
        {
            version: '1.4.2',
            title: '修复了一个bug',
            notes: ['修复在线统计连接问题。']
        },
        {
            version: '1.4.1',
            title: '批量炼丹炼器 + 装备套装',
            notes: ['新增批量炼丹炼器：选配方设目标数量，自动买材料，品质分布日志。', '装备套装切换：记录神识套/战斗套，冥想前后自动切换。', '统一操作按钮风格。']
        },
        {
            version: '1.4.0',
            title: '铭文装配重做 + 地图修复',
            notes: ['铭文自动装配改为API操作，策略：空槽→同属低品→同属同品低值。', '新增复选框：允许跨属性覆盖、跳过神识铭文。', '复活下拉过滤渡劫/传送等非地图节点。', '微信通知系统、自动出狱、自动过验证。']
        },
        {
            version: '1.3.9',
            title: '全新微信通知系统',
            notes: ['清理开始/清理中(10min)/冥想/高级冥想/死亡/复活/清理统计通知', '每10分钟推送剩余神识，每20分钟推送冥想进度']
        },
        { version: '1.3.8', title: '自动出狱', notes: ['每30秒检测天道禁闭并消耗仙缘保释'] },
        { version: '1.3.7', title: '自动过验证', notes: ['拦截游戏算术验证弹窗自动计算答案，支持中文数字'] },
        { version: '1.3.6', title: '铭文百连', notes: ['百连抽模式，百连找不到按钮自动回退十连'] },
        { version: '1.3.5', title: '铭文系统API重写', notes: ['纯API调用（draw-ten/hundred/discard/apply），装备从法相穿搭读取', '品质下拉凡纹~天纹，修复statType/天纹值÷10/属性名匹配'] },
        { version: '1.3.4', title: '铭文修复', notes: ['修复API字段解析、品质比较、装备ID获取'] },
        { version: '1.3.3', title: '复活下拉修复', notes: ['复活前往下拉从游戏地图弹窗抓取地名', '道韵检查改用自定义弹窗'] },
        { version: '1.3.2', title: '屏蔽更新提醒', notes: ['更新tab新增屏蔽更新复选框'] },
        { version: '1.3.0', title: '操作逻辑大优化', notes: ['清理↔监测自动衔接，复活后恢复HP/MP', '战斗后查血恢复，buff连续失败自动关闭', '藏宝图/试炼/铭文完成后自动切探索'] },
        { version: '1.2.0', title: '大版本更新', notes: ['铭文天纹适配、商人品质购买、企业微信三通道', '回血回蓝排序、自动收徒、徒弟请求处理'] }
    ];

    var BUILTIN_RELEASE = {
        version: SCRIPT_VERSION,
        title: '神识清理 v' + SCRIPT_VERSION,
        notes: [
            '修复本命吞噬：改查背包(/api/game/inventory)，兼容type/slot/attackBonus等多种字段名。'
        ]
    };

    var state = {
        // === 基础探索 ===
        reserve: readNumber('lvSpiritCleaner.reserve', 0),
        delayMs: readNumber('lvSpiritCleaner.delayMs', 1200),
        keepCurrentMultiplier: localStorage.getItem('lvSpiritCleaner.keepMultiplier') === '1',
        preferMultiplier: localStorage.getItem('lvSpiritCleaner.preferMultiplier') || '1',
        nightOnlyExplore: localStorage.getItem('lvSpiritCleaner.nightOnlyExplore') === '1',
        desktopNotify: localStorage.getItem('lvSpiritCleaner.desktopNotify') !== '0',
        updateManifestUrl: localStorage.getItem('lvSpiritCleaner.updateManifestUrl') || DEFAULT_UPDATE_MANIFEST_URL,
        onlineStatsEndpoint: DEFAULT_ONLINE_STATS_ENDPOINT,

        // === 商人 ===
        autoMerchantLegend: localStorage.getItem('lvSpiritCleaner.autoMerchantLegend') !== '0',
        merchantMode: localStorage.getItem('lvSpiritCleaner.merchantMode') || 'legend',
        merchantKeyword: localStorage.getItem('lvSpiritCleaner.merchantKeyword') || '',
        merchantQualityFirst: localStorage.getItem('lvSpiritCleaner.merchantQualityFirst') !== '0',
        merchantMaxPrice: readNumber('lvSpiritCleaner.merchantMaxPrice', 0),
        merchantStrictMatch: localStorage.getItem('lvSpiritCleaner.merchantStrictMatch') === '1',

        // === 护道 ===
        autoHireCheapest: localStorage.getItem('lvSpiritCleaner.autoHireCheapest') !== '0',
        hireMode: localStorage.getItem('lvSpiritCleaner.hireMode') || 'cheapest',
        hireRetryLimit: readNumber('lvSpiritCleaner.hireRetryLimit', 2),
        hireMaxFee: readNumber('lvSpiritCleaner.hireMaxFee', 0),

        // === 战斗恢复 ===
        autoSelfFightWeak: localStorage.getItem('lvSpiritCleaner.autoSelfFightWeak') !== '0',
        aggressiveMode: localStorage.getItem('lvSpiritCleaner.aggressiveMode') === '1',
        selfFightMargin: readNumber('lvSpiritCleaner.selfFightMargin', 1.15),
        autoRecoveryMode: localStorage.getItem('lvSpiritCleaner.autoRecoveryMode') || 'both',
        autoRecoveryThreshold: readNumber('lvSpiritCleaner.autoRecoveryThreshold', 80),
        autoRecoveryTarget: readNumber('lvSpiritCleaner.autoRecoveryTarget', 100),
        sectQuickRecovery: localStorage.getItem('lvSpiritCleaner.sectQuickRecovery') === '1',
        autoHpPriority: localStorage.getItem('lvSpiritCleaner.autoHpPriority') || '宗门,灵力,丹药',
        autoMpPriority: localStorage.getItem('lvSpiritCleaner.autoMpPriority') || '宗门,丹药,灵石',
        autoRepair: localStorage.getItem('lvSpiritCleaner.autoRepair') !== '0',
        repairThreshold: readNumber('lvSpiritCleaner.repairThreshold', 70),
        autoVoidBody: localStorage.getItem('lvSpiritCleaner.autoVoidBody') !== '0',
        voidBodyRarity: readNumber('lvSpiritCleaner.voidBodyRarity', 5),
        voidBodyBuyQty: readNumber('lvSpiritCleaner.voidBodyBuyQty', 1),
        autoHiddenCharm: localStorage.getItem('lvSpiritCleaner.autoHiddenCharm') === '1',
        hiddenCharmRarity: readNumber('lvSpiritCleaner.hiddenCharmRarity', 0),
        hiddenCharmBuyQty: readNumber('lvSpiritCleaner.hiddenCharmBuyQty', 1),
        hiddenCharmRetryMs: readNumber('lvSpiritCleaner.hiddenCharmRetryMs', 60000),
        autoNirvanaPill: localStorage.getItem('lvSpiritCleaner.autoNirvanaPill') === '1',
        autoReviveDeath: localStorage.getItem('lvSpiritCleaner.autoReviveDeath') !== '0',
        reviveExploreArea: localStorage.getItem('lvSpiritCleaner.reviveExploreArea') || '',

        // === 自动流程 ===
        autoMeditate: localStorage.getItem('lvSpiritCleaner.autoMeditate') !== '0',
        exploreMode: localStorage.getItem('lvSpiritCleaner.exploreMode') || 'api',
        autoExploreAfterMeditate: localStorage.getItem('lvSpiritCleaner.autoExploreAfterMeditate') !== '0',
        checkDaoyunBoost: localStorage.getItem('lvSpiritCleaner.checkDaoyunBoost') !== '0',
        useAdvancedMeditate: localStorage.getItem('lvSpiritCleaner.useAdvancedMeditate') === '1',
        summerOnlyAdvancedMeditate: localStorage.getItem('lvSpiritCleaner.summerOnlyAdvancedMeditate') === '1',
        meditateStopSpirit: readNumber('lvSpiritCleaner.meditateStopSpirit', 0),
        autoNatalDevour: localStorage.getItem('lvSpiritCleaner.autoNatalDevour') === '1',
        autoRecruit: localStorage.getItem('lvSpiritCleaner.autoRecruit') === '1',
        recruitIntervalMs: readNumber('lvSpiritCleaner.recruitIntervalMs', 5000),
        autoMasterRequests: localStorage.getItem('lvSpiritCleaner.autoMasterRequests') !== '0',
        autoBail: localStorage.getItem('lvSpiritCleaner.autoBail') !== '0',
        bailMethod: localStorage.getItem('lvSpiritCleaner.bailMethod') || 'stone',
        minLuck: readNumber('lvSpiritCleaner.minLuck', 5),
        luckRefreshMethod: localStorage.getItem('lvSpiritCleaner.luckRefreshMethod') || 'stone',
        autoBreakthrough: localStorage.getItem('lvSpiritCleaner.autoBreakthrough') === '1',
        autoOriginRepair: localStorage.getItem('lvSpiritCleaner.autoOriginRepair') === '1',
        nirvanaRarity: readNumber('lvSpiritCleaner.nirvanaRarity', 3),
        nirvanaCraftQty: readNumber('lvSpiritCleaner.nirvanaCraftQty', 1),
        autoDisposeEnabled: localStorage.getItem('lvSpiritCleaner.autoDisposeEnabled') === '1',
        autoDisposeRules: (function() { try { return JSON.parse(localStorage.getItem('lvSpiritCleaner.autoDisposeRules') || '[]'); } catch(_) { return []; } })(),
        autoDisposeInterval: readNumber('lvSpiritCleaner.autoDisposeInterval', 300),
        autoDisposeProtected: (function() { try { return JSON.parse(localStorage.getItem('lvSpiritCleaner.autoDisposeProtected') || '[]'); } catch(_) { return []; } })(),
        autoSynthesize: localStorage.getItem('lvSpiritCleaner.autoSynthesize') === '1',
        farmAutoHarvest: localStorage.getItem('lvSpiritCleaner.farmAutoHarvest') !== '0',
        farmAutoPlant: localStorage.getItem('lvSpiritCleaner.farmAutoPlant') !== '0',
        farmSeedId: localStorage.getItem('lvSpiritCleaner.farmSeedId') || '',
        farmSeedName: localStorage.getItem('lvSpiritCleaner.farmSeedName') || '',
        farmInterval: readNumber('lvSpiritCleaner.farmInterval', 30),
        farmExpandEnabled: localStorage.getItem('lvSpiritCleaner.farmExpandEnabled') === '1',
        farmAutoInvasion: localStorage.getItem('lvSpiritCleaner.farmAutoInvasion') !== '0',
        pavilionItemName: localStorage.getItem('lvSpiritCleaner.pavilionItemName') || '',
        pavilionQty: readNumber('lvSpiritCleaner.pavilionQty', 99),
        pavilionLoop: readNumber('lvSpiritCleaner.pavilionLoop', 10),
        pavilionDelay: readNumber('lvSpiritCleaner.pavilionDelay', 500),
        equipSwapEnabled: localStorage.getItem('lvSpiritCleaner.equipSwapEnabled') === '1',
        spiritEquipIds: JSON.parse(localStorage.getItem('lvSpiritCleaner.spiritEquipIds') || '[]'),
        combatEquipIds: JSON.parse(localStorage.getItem('lvSpiritCleaner.combatEquipIds') || '[]'),
        craftType: localStorage.getItem('lvSpiritCleaner.craftType') || 'alchemy',
        craftRecipeId: localStorage.getItem('lvSpiritCleaner.craftRecipeId') || '',
        craftTargetCount: readNumber('lvSpiritCleaner.craftTargetCount', 10),
        craftBatchSize: readNumber('lvSpiritCleaner.craftBatchSize', 0),
        craftAutoBuyMats: localStorage.getItem('lvSpiritCleaner.craftAutoBuyMats') === '1',

        // === 铭文 ===
        inscriptionTargets: localStorage.getItem('lvSpiritCleaner.inscriptionTargets') || '攻击:50,防御:50,气血:100,神识:20',
        inscriptionQuality: localStorage.getItem('lvSpiritCleaner.inscriptionQuality') || 'any',
        inscriptionStat: localStorage.getItem('lvSpiritCleaner.inscriptionStat') || '攻击',
        inscriptionMinValue: parseInscMinValue(localStorage.getItem('lvSpiritCleaner.inscriptionMinValue') || '50'),
        inscriptionStopMode: localStorage.getItem('lvSpiritCleaner.inscriptionStopMode') || 'any',
        inscriptionAutoEquip: localStorage.getItem('lvSpiritCleaner.inscriptionAutoEquip') === '1',
        inscriptionEquipCrossStat: localStorage.getItem('lvSpiritCleaner.inscriptionEquipCrossStat') === '1',
        inscriptionEquipSkipSpirit: localStorage.getItem('lvSpiritCleaner.inscriptionEquipSkipSpirit') === '1',
        inscriptionMaxAttempts: readNumber('lvSpiritCleaner.inscriptionMaxAttempts', 0),
        inscriptionResultDelay: readNumber('lvSpiritCleaner.inscriptionResultDelay', 1500),
        inscriptionDiscardDelay: readNumber('lvSpiritCleaner.inscriptionDiscardDelay', 600),
        inscriptionPullMode: Number(localStorage.getItem('lvSpiritCleaner.inscriptionPullMode') || 10),

        // === 藏宝图 ===
        treasureBatchSize: readNumber('lvSpiritCleaner.treasureBatchSize', 0),
        treasureUseQuantity: readNumber('lvSpiritCleaner.treasureUseQuantity', 1),
        treasureIntervalMs: readNumber('lvSpiritCleaner.treasureIntervalMs', 0),

        // === 神识监测 ===
        monitorStartSpirit: readNumber('lvSpiritCleaner.monitorStartSpirit', 0),

        // === 企业微信 ===
        chatOnTop: localStorage.getItem('lvSpiritCleaner.chatOnTop') !== '0',
        wecomNotify: localStorage.getItem('lvSpiritCleaner.wecomNotify') === '1',
        wecomNotifyWebhook: localStorage.getItem('lvSpiritCleaner.wecomNotifyWebhook') || '',
        wecomWorldWebhook: localStorage.getItem('lvSpiritCleaner.wecomWorldWebhook') || '',
        wecomPrivateWebhook: localStorage.getItem('lvSpiritCleaner.wecomPrivateWebhook') || '',
        wecomShowStatus: localStorage.getItem('lvSpiritCleaner.wecomShowStatus') !== '0'
    };

    function readNumber(key, fallback) {
        var value = Number(localStorage.getItem(key));
        return Number.isFinite(value) ? value : fallback;
    }

    function persistSetting(key, value) {
        localStorage.setItem(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
    }

    function sleep(ms) {
        return new Promise(function (resolve) {
            loopTimer = setTimeout(resolve, ms);
        });
    }

    function toast(message) {
        if (typeof window.showToast === 'function') window.showToast(message);
        setStatus(message, 'warn');
    }

    function notifyUser(title, body) {
        if (!state.desktopNotify || typeof Notification === 'undefined') return;
        if (Notification.permission === 'granted') {
            try { new Notification(title, { body: body || '' }); } catch (_) {}
            return;
        }
        if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(function (permission) {
                if (permission === 'granted') {
                    try { new Notification(title, { body: body || '' }); } catch (_) {}
                }
            }).catch(function () {});
        }
    }

    function onlineClientId() {
        var key = 'lvSpiritCleaner.onlineClientId';
        var saved = localStorage.getItem(key);
        if (saved) return saved;
        var id = '';
        try {
            if (window.crypto && typeof window.crypto.randomUUID === 'function') id = window.crypto.randomUUID();
        } catch (_) {}
        if (!id) id = 'lvsc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(key, id);
        return id;
    }

    function onlineStatsPayload() {
        var player = getPlayer() || {};
        return {
            clientId: onlineClientId(),
            version: SCRIPT_VERSION,
            page: location.origin + location.pathname,
            playerName: player.name || player.playerName || localStorage.getItem('playerName') || '',
            running: !!running,
            monitoringSpirit: !!monitoringSpirit,
            autoTrialRunning: !!autoTrialRunning,
            autoTreasureRunning: !!autoTreasureRunning,
            autoInscriptionRunning: !!autoInscriptionRunning,
            timestamp: Date.now()
        };
    }

    async function sendOnlineHeartbeat() {
        var endpoint = state.onlineStatsEndpoint || DEFAULT_ONLINE_STATS_ENDPOINT;
        if (!endpoint) return;
        var payload = onlineStatsPayload();
        var bridged = false;
        try {
            window.dispatchEvent(new CustomEvent('lvsc:online-heartbeat', {
                detail: JSON.stringify({ endpoint: endpoint, payload: payload })
            }));
            bridged = true;
        } catch (_) {}
        if (typeof fetch !== 'function') return;
        try {
            var res = await fetch(endpoint, {
                method: 'POST',
                mode: 'cors',
                cache: 'no-store',
                keepalive: true,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res || !res.ok) throw new Error('heartbeat failed');
        } catch (_) {
            if (!bridged) {
                try {
                    window.dispatchEvent(new CustomEvent('lvsc:online-heartbeat', {
                        detail: JSON.stringify({ endpoint: endpoint, payload: payload })
                    }));
                } catch (_) {}
            }
        }
    }

    function startOnlineHeartbeat() {
        if (onlineHeartbeatStarted) return;
        onlineHeartbeatStarted = true;
        setTimeout(sendOnlineHeartbeat, 2500);
        setInterval(sendOnlineHeartbeat, ONLINE_HEARTBEAT_MS);
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) sendOnlineHeartbeat();
        });
    }

    function getPlayer() {
        return window._lastPlayerData || null;
    }

    function gameApi() {
        return (typeof api !== 'undefined') ? api : window.api;
    }

    function isEncounterActive() {
        if (typeof _encounterActive !== 'undefined' && _encounterActive) return true;
        return !!window._encounterActive;
    }

    function setEncounterActive(value) {
        try {
            if (typeof _encounterActive !== 'undefined') _encounterActive = value;
        } catch (_) {}
        window._encounterActive = value;
    }

    function isMerchantActive() {
        if (typeof _merchantActive !== 'undefined' && _merchantActive) return true;
        if (window._merchantActive) return true;
        var overlay = document.getElementById('merchantOverlay');
        return !!(overlay && !overlay.classList.contains('hidden'));
    }

    function setMerchantActive(value) {
        try {
            if (typeof _merchantActive !== 'undefined') _merchantActive = value;
        } catch (_) {}
        window._merchantActive = value;
    }

    function callPageFunction(name, args) {
        var fn = window[name];
        if (typeof fn !== 'function') return null;
        return fn.apply(window, args || []);
    }

    function getSpiritInfo() {
        var player = getPlayer() || {};
        var spirit = Number(player.spirit || 0);
        var maxSpirit = Number(player.maxSpirit || 0);
        var cost = Number(player.spiritCost || 1);
        return {
            player: player,
            spirit: spirit,
            maxSpirit: maxSpirit,
            cost: Math.max(1, cost)
        };
    }

    var _statusMuted = {};
    function setStatus(text, tone, category) {
        if (category && _statusMuted[category]) return;
        var el = document.getElementById('lvscStatus');
        var compactEl = document.getElementById('lvscCompactStatus');
        if (el) {
            el.textContent = text;
            el.dataset.tone = tone || 'idle';
        }
        if (compactEl) {
            compactEl.textContent = text;
            compactEl.dataset.tone = tone || 'idle';
        }
    }

    function updateMeter() {
        var info = getSpiritInfo();
        var value = document.getElementById('lvscSpiritValue');
        var compactValue = document.getElementById('lvscCompactSpirit');
        var fill = document.getElementById('lvscSpiritFill');
        var runBtn = document.getElementById('lvscRunBtn');
        var compactRunBtn = document.getElementById('lvscCompactRunBtn');
        var monitorBtn = document.getElementById('lvscMonitorBtn');
        var compactMonitorBtn = document.getElementById('lvscCompactMonitorBtn');
        var trialBtn = document.getElementById('lvscAutoTrialBtn');
        var treasureBtn = document.getElementById('lvscAutoTreasureBtn');
        var text = info.spirit + ' / ' + info.maxSpirit + '  每次-' + info.cost;

        if (value) {
            value.textContent = text;
        }
        if (compactValue) {
            compactValue.textContent = info.spirit + '/' + info.maxSpirit;
        }
        if (fill) {
            var pct = info.maxSpirit > 0 ? Math.max(0, Math.min(100, info.spirit / info.maxSpirit * 100)) : 0;
            fill.style.width = pct + '%';
        }
        if (runBtn) {
            runBtn.textContent = running ? '停止清理' : '开始清理';
        }
        if (compactRunBtn) {
            compactRunBtn.textContent = running ? '停止' : '开始';
        }
        if (monitorBtn) {
            monitorBtn.textContent = monitoringSpirit ? '停止监测' : '监测神识';
        }
        if (compactMonitorBtn) {
            compactMonitorBtn.textContent = monitoringSpirit ? '停监' : '监测';
        }
        if (trialBtn) {
            trialBtn.textContent = autoTrialRunning ? '停止试炼' : '自动试炼';
        }
        if (treasureBtn) {
            treasureBtn.textContent = autoTreasureRunning ? '停止刷图' : '自动刷藏宝图';
        }
        var inscriptionBtn = document.getElementById('lvscAutoInscriptionBtn');
        if (inscriptionBtn) {
            inscriptionBtn.textContent = autoInscriptionRunning ? '停止洗练' : '自动刷铭文';
        }
    }

    // 从 UI 一次性读取所有设置到 state（不写 localStorage，仅批读用）
    function readUiToState() {
        function num(id, minVal, defaultVal) {
            var el = document.getElementById(id);
            return Math.max(minVal, Number(el && el.value || defaultVal));
        }
        function str(id, defaultVal) {
            var el = document.getElementById(id);
            return String(el && el.value || defaultVal).trim();
        }
        function chk(id) {
            var el = document.getElementById(id);
            return !!(el && el.checked);
        }
        function sel(id, defaultVal, validList) {
            var v = str(id, defaultVal);
            return validList.indexOf(v) >= 0 ? v : defaultVal;
        }

        state.reserve = num('lvscReserve', 0, 0);
        state.delayMs = num('lvscDelay', 600, 1200);
        state.hireRetryLimit = Math.max(1, Math.min(10, num('lvscHireRetryLimit', 1, 2)));
        state.hireMode = sel('lvscHireMode', 'cheapest', ['cheapest', 'together', 'alone']);
        state.hireMaxFee = num('lvscHireMaxFee', 0, 0);
        state.keepCurrentMultiplier = chk('lvscKeepMultiplier');
        state.merchantMode = sel('lvscMerchantMode', 'legend', ['legend', 'custom', 'leave']);
        state.merchantKeyword = str('lvscMerchantKeyword', '');
        state.merchantQualityFirst = chk('lvscMerchantQualityFirst');
        state.merchantMaxPrice = num('lvscMerchantMaxPrice', 0, 0);
        state.merchantStrictMatch = chk('lvscMerchantStrictMatch');
        state.autoMerchantLegend = chk('lvscAutoMerchant');
        state.autoHireCheapest = chk('lvscAutoHire');
        state.autoMeditate = chk('lvscAutoMeditate');
        state.autoExploreAfterMeditate = chk('lvscAutoExploreAfterMeditate');
        state.nightOnlyExplore = chk('lvscNightOnlyExplore');
        state.autoReviveDeath = chk('lvscAutoReviveDeath');
        state.checkDaoyunBoost = chk('lvscCheckDaoyunBoost');
        state.useAdvancedMeditate = chk('lvscUseAdvancedMeditate');
        state.meditateStopSpirit = num('lvscMeditateStopSpirit', 0, 0);
        var iQual = str('lvscInscriptionQuality', 'any');
        state.inscriptionQuality = (!iQual || iQual === '不限') ? 'any' : iQual;
        state.inscriptionStat = sel('lvscInscriptionStat', '攻击', ['攻击', '防御', '气血', '神识']);
        state.inscriptionMinValue = parseInscMinValue(str('lvscInscriptionMinValue', '0'));
        state.inscriptionTargets = state.inscriptionStat + ':' + state.inscriptionMinValue;
        state.inscriptionStopMode = sel('lvscInscriptionStopMode', 'any', ['any', 'all', 'manual']);
        state.inscriptionAutoEquip = chk('lvscInscriptionAutoEquip');
        state.inscriptionMaxAttempts = num('lvscInscriptionMaxAttempts', 0, 0);
        state.inscriptionResultDelay = num('lvscInscriptionResultDelay', 500, 1500);
        state.inscriptionDiscardDelay = num('lvscInscriptionDiscardDelay', 300, 600);
        state.inscriptionPullMode = Number(str('lvscInscriptionPullMode', '10')) || 10;
        state.treasureBatchSize = num('lvscTreasureBatchSize', 0, 0);
        state.treasureUseQuantity = num('lvscTreasureUseQuantity', 1, 1);
        state.treasureIntervalMs = num('lvscTreasureIntervalMs', 0, 0);
        state.desktopNotify = chk('lvscDesktopNotify');
        state.monitorStartSpirit = num('lvscMonitorStartSpirit', 0, 0);
        state.autoSelfFightWeak = chk('lvscAutoSelfFightWeak');
        state.selfFightMargin = Math.max(1, Math.min(3, num('lvscSelfFightMargin', 1, 1.15)));
        state.autoRecoveryMode = sel('lvscAutoRecoveryMode', 'both', ['none', 'hp', 'mp', 'both']);
        state.sectQuickRecovery = chk('lvscSectQuickRecovery');
        state.autoRecoveryThreshold = Math.max(0, Math.min(100, num('lvscAutoRecoveryThreshold', 0, 80)));
        state.autoRecoveryTarget = Math.max(0, Math.min(100, num('lvscAutoRecoveryTarget', 0, 100)));
        state.autoHpPriority = str('lvscAutoHpPriority', '灵力,丹药,宗门');
        state.autoMpPriority = str('lvscAutoMpPriority', '灵石,丹药,宗门');
        state.updateManifestUrl = str('lvscUpdateManifestUrl', '');
        state.autoVoidBody = chk('lvscAutoVoidBody');
        state.voidBodyRarity = Math.max(1, Math.min(5, num('lvscVoidRarity', 1, 5)));
        state.voidBodyBuyQty = Math.max(1, Math.min(999, num('lvscVoidBuyQty', 1, 1)));
        state.autoHiddenCharm = chk('lvscAutoHiddenCharm');
        state.hiddenCharmRarity = Math.max(0, Math.min(5, num('lvscHiddenCharmRarity', 0, 0)));
        state.hiddenCharmBuyQty = Math.max(1, Math.min(999, num('lvscHiddenCharmBuyQty', 1, 1)));
        state.hiddenCharmRetryMs = Math.max(3000, num('lvscHiddenCharmRetryMs', 3000, 60000));
        state.autoRepair = chk('lvscAutoRepair');
        state.repairThreshold = Math.max(0, Math.min(100, num('lvscRepairThreshold', 0, 70)));
        state.reviveExploreArea = str('lvscReviveExploreArea', '');
        state.autoNatalDevour = chk('lvscAutoNatalDevour');
        state.autoRecruit = chk('lvscAutoRecruit');
        state.recruitIntervalMs = Math.max(1000, num('lvscRecruitIntervalMs', 1000, 5000));
        state.chatOnTop = chk('lvscChatOnTop');
        state.wecomNotify = chk('lvscWecomNotify');
        state.wecomNotifyWebhook = str('lvscWecomNotifyWebhook', '');
        state.wecomWorldWebhook = str('lvscWecomWorldWebhook', '');
        state.wecomPrivateWebhook = str('lvscWecomPrivateWebhook', '');
        state.autoMasterRequests = chk('lvscAutoMasterRequests');
        state.autoBail = chk('lvscAutoBail');
    }

    // 保证别名：运行循环启动时需要从 UI 读取
    var syncSettingsFromUi = readUiToState;

    async function refreshPlayer() {
        if (typeof window.loadPlayerInfo === 'function') {
            try {
                await window.loadPlayerInfo(true);
            } catch (err) {
                console.warn('[LingVerse Spirit Cleaner] loadPlayerInfo failed', err);
            }
        }
        updateMeter();
    }

    // 自定义确认弹窗（和脚本面板统一风格）
    function showConfirmModal(message, onOk, onCancel) {
        var old = document.getElementById('lvscConfirmModal');
        if (old) old.remove();
        var modal = document.createElement('div');
        modal.id = 'lvscConfirmModal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:' + (PANEL_Z_INDEX + 1) + ';display:flex;align-items:center;justify-content:center;';
        modal.innerHTML =
            '<div style="position:absolute;inset:0;background:rgba(0,0,0,.55);"></div>' +
            '<div style="position:relative;width:min(360px,calc(100vw - 28px));background:rgba(17,20,29,.98);border:1px solid rgba(219,185,112,.4);border-radius:10px;padding:20px;color:#f5f1e8;font:13px/1.5 \'Microsoft YaHei\',sans-serif;box-shadow:0 16px 48px rgba(0,0,0,.45);">' +
            '<div style="font-size:15px;font-weight:700;color:#dbb970;margin-bottom:10px;">提示</div>' +
            '<div style="color:#cfc6b2;margin-bottom:16px;">' + message + '</div>' +
            '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
            '<button id="lvscConfirmCancel" style="height:32px;padding:0 16px;border-radius:6px;cursor:pointer;font-weight:700;font-size:13px;background:rgba(255,255,255,.08);color:#cfc6b2;border:1px solid rgba(255,255,255,.12);">取消</button>' +
            '<button id="lvscConfirmOk" style="height:32px;padding:0 16px;border-radius:6px;cursor:pointer;font-weight:700;font-size:13px;background:#dbb970;color:#17141d;border:0;">继续</button>' +
            '</div></div>';
        document.body.appendChild(modal);
        document.getElementById('lvscConfirmOk').onclick = function () { modal.remove(); if (onOk) onOk(); };
        document.getElementById('lvscConfirmCancel').onclick = function () { modal.remove(); if (onCancel) onCancel(); };
        modal.querySelector('div[style*="inset:0"]').onclick = function () { modal.remove(); if (onCancel) onCancel(); };
    }

    async function checkDaoyunBeforeStart(modeLabel) {
        if (!state.checkDaoyunBoost || !gameApi()) return true;
        try {
            var res = await gameApi().get('/api/master/overview');
            if (!res || res.code !== 200 || !res.data) {
                setStatus('道韵加成检查失败，等待确认', 'warn');
                return new Promise(function (resolve) {
                    showConfirmModal('道韵加成状态读取失败，是否继续' + modeLabel + '？',
                        function () { resolve(true); },
                        function () { resolve(false); }
                    );
                });
            }
            if (res.data.exploreBoostEnabled) {
                setStatus('道韵加成已开启', 'run');
                return true;
            }
            setStatus('道韵加成未开启，等待确认', 'warn');
            return new Promise(function (resolve) {
                showConfirmModal('道韵加成未开启，是否继续' + modeLabel + '？',
                    function () { resolve(true); },
                    function () { resolve(false); }
                );
            });
        } catch (err) {
            console.warn('[LingVerse Spirit Cleaner] daoyun boost check failed', err);
            setStatus('道韵加成检查异常，等待确认', 'warn');
            return new Promise(function (resolve) {
                showConfirmModal('道韵加成检查异常，是否继续' + modeLabel + '？',
                    function () { resolve(true); },
                    function () { resolve(false); }
                );
            });
        }
    }

    function applyExploreMultiplier() {
        if (state.keepCurrentMultiplier) return;
        // 尝试原生 select
        var select = document.getElementById('exploreMultiplier');
        var isSelect = select && select.options && select.options.length;
        if (!select) return;
        var preferred = state.preferMultiplier || '1';
        var info = getSpiritInfo();
        // 所有可用倍率（从DOM读取或硬编码）
        var availMultis = [];
        if (isSelect) {
            for (var oi = 0; oi < select.options.length; oi++) {
                availMultis.push(Number(select.options[oi].value) || 1);
            }
        } else {
            // 按钮组：读取所有倍率按钮的data-value或文本
            var btns = select.querySelectorAll('button, [data-value], .multiplier-btn');
            for (var bi = 0; bi < btns.length; bi++) {
                var dv = btns[bi].getAttribute('data-value') || btns[bi].textContent || '';
                var nv = parseInt(dv.replace(/[^\d]/g, ''), 10) || 0;
                if (nv > 0) availMultis.push(nv);
            }
            if (!availMultis.length) availMultis = [1, 5, 10, 20, 50];
        }
        availMultis.sort(function (a, b) { return b - a; }); // 从大到小
        var chosen = 1;
        // 首选能用就用首选
        var prefNum = Number(preferred) || 1;
        if (info.spirit >= info.cost * prefNum) {
            chosen = prefNum;
        } else {
            // 从大到小找第一个能用的
            for (var di = 0; di < availMultis.length; di++) {
                if (info.spirit >= info.cost * availMultis[di]) { chosen = availMultis[di]; break; }
            }
        }
        var chosenStr = String(chosen);
        var currentVal = isSelect ? select.value : getCurrentMultiplierValue();
        if (currentVal !== chosenStr) {
            setExploreMultiplier(chosenStr);
            if (chosenStr !== preferred && preferred !== '1') {
                setStatus('神识不足×' + preferred + '，降为×' + chosenStr, 'warn');
            }
        }
    }
    function getCurrentMultiplierValue() {
        var select = document.getElementById('exploreMultiplier');
        if (select && select.options) return select.value;
        // 按钮组：找高亮/active的按钮
        var active = document.querySelector('#exploreMultiplier .active, #exploreMultiplier [data-selected], #exploreMultiplier .multiplier-btn--active');
        if (active) return String(parseInt((active.textContent || '').replace(/[^\d]/g, ''), 10) || 1);
        return '1';
    }
    function setExploreMultiplier(val) {
        var select = document.getElementById('exploreMultiplier');
        if (select && select.options) {
            select.value = val;
            if (typeof window.onExploreMultiplierChange === 'function') window.onExploreMultiplierChange();
            dismissMultiplierWarning();
            return;
        }
        // 按钮组：点对应按钮
        var btns = document.querySelectorAll('#exploreMultiplier button, #exploreMultiplier [data-value], #exploreMultiplier .multiplier-btn');
        for (var i = 0; i < btns.length; i++) {
            var dv = btns[i].getAttribute('data-value') || btns[i].textContent || '';
            if (String(parseInt(dv.replace(/[^\d]/g, ''), 10) || '') === val) {
                btns[i].click();
                break;
            }
        }
        // 高倍率确认弹窗自动关
        setTimeout(dismissMultiplierWarning, 300);
    }
    function dismissMultiplierWarning() {
        var btn = document.getElementById('gameAlertOkBtn');
        if (btn && isElementVisible(btn)) btn.click();
    }

    function shouldStopBeforeAction() {
        var info = getSpiritInfo();
        if (!info.player || !gameApi() || typeof window.handleExplore !== 'function') {
            return '页面还没加载完成';
        }
        if ((info.player.isDead || window.playerDead) && !state.autoReviveDeath) {
            return '角色已陨落';
        }
        if (isEncounterActive()) {
            return '遭遇未处理';
        }
        if (info.spirit < info.cost) {
            return 'need_meditate';
        }
        if (info.spirit <= state.reserve || info.spirit - info.cost < state.reserve) {
            return state.autoMeditate ? 'need_meditate' : '已到保留神识';
        }
        return '';
    }

    function isDeathActive() {
        if (window.playerDead) return true;
        var player = getPlayer() || {};
        if (player.isDead) return true;
        var overlay = document.getElementById('deathOverlay');
        if (!overlay) return false;
        var hidden = overlay.classList.contains('hidden') || overlay.style.display === 'none';
        return !hidden && String(overlay.textContent || '').indexOf('引渡归来') >= 0;
    }

    function visibleButtonByText(root, text) {
        root = root || document;
        var buttons = root.querySelectorAll('button, .btn, [role=button]');
        for (var i = 0; i < buttons.length; i++) {
            var btn = buttons[i];
            if (String(btn.textContent || '').indexOf(text) < 0) continue;
            if (isElementDisabled(btn) || !isElementVisible(btn)) continue;
            return btn;
        }
        return null;
    }

    function isElementVisible(el) {
        if (!el || !el.getBoundingClientRect) return false;
        var style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0)) return false;
        var rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function isElementDisabled(el) {
        if (!el) return true;
        var node = el.closest && el.closest('button,[aria-disabled],[disabled]') || el;
        return !!(node.disabled || node.getAttribute && (node.getAttribute('disabled') !== null || node.getAttribute('aria-disabled') === 'true') || node.classList && node.classList.contains('disabled'));
    }

    async function humanClick(el) {
        if (!el || isElementDisabled(el)) return false;
        var target = el.closest && el.closest('button,[role=button],.modal-action-btn,.modal-btn') || el;
        if (!isElementVisible(target)) target = el;
        try { target.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
        await sleep(80);
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (type) {
            try {
                target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
            } catch (_) {}
        });
        try { target.click(); } catch (_) {}
        return true;
    }

    async function handleDeathReviveEvent(manual) {
        if ((!manual && !state.autoReviveDeath) || busyEvent || !isDeathActive()) return false;
        busyEvent = true;
        try {
            setStatus('检测到陨落，尝试引渡归来', 'warn');
            _cleanStats.deaths++;
            var deadArea = getCurrentAreaName();
            wecomEnqueue('💀 角色陨落', '位置：' + (deadArea || '未知') + '\n正在尝试引渡复活...');
            var revived = false;
            if (typeof window.revivePlayer === 'function') {
                try {
                    await window.revivePlayer();
                    revived = true;
                } catch (err) {
                    console.warn('[LingVerse Spirit Cleaner] native revivePlayer failed', err);
                }
            }

            if (!revived) {
                var overlay = document.getElementById('deathOverlay');
                var btn = visibleButtonByText(overlay || document, '引渡归来');
                if (btn) {
                    btn.click();
                    revived = true;
                }
            }

            if (!revived) {
                setStatus('未找到“引渡归来”按钮', 'warn');
                return false;
            }

            await sleep(1200);
            window.playerDead = false;
            var deathOverlay = document.getElementById('deathOverlay');
            if (deathOverlay) deathOverlay.classList.add('hidden');
            if (typeof window.loadGameLogs === 'function') window.loadGameLogs();
            await refreshPlayer();

            // 如果配置了复活后自动前往的区域（下拉有值才跳转）
            if (state.reviveExploreArea && state.reviveExploreArea !== '（不跳转）') {
                var navigated = false;
                // 死后地图节点不可见，从 localStorage 恢复映射
                if (!_areaNameToId[state.reviveExploreArea]) {
                    try { var saved = JSON.parse(localStorage.getItem('lvSpiritCleaner.areaNameToId') || '{}'); _areaNameToId = saved; } catch (_) {}
                }
                var areaId = _areaNameToId[state.reviveExploreArea];
                if (areaId && gameApi()) {
                    try {
                        var moveRes = await gameApi().post('/api/game/move', { areaId: areaId });
                        if (moveRes && moveRes.code === 200) {
                            setStatus('已引渡归来，前往 ' + state.reviveExploreArea, 'run');
                            navigated = true;
                        }
                    } catch (_) {}
                }
                // 兜底：原生 select
                if (!navigated) {
                    var areaSelect = document.getElementById('exploreArea') || document.querySelector('select[name="area"]');
                    if (!areaSelect) {
                        var all = document.querySelectorAll('select');
                        for (var ai = 0; ai < all.length; ai++) {
                            if (all[ai].closest && all[ai].closest('#lvscPanel')) continue;
                            if (all[ai].options && all[ai].options.length > 1) { areaSelect = all[ai]; break; }
                        }
                    }
                    if (areaSelect) {
                        for (var oi = 0; oi < areaSelect.options.length; oi++) {
                            if (areaSelect.options[oi].text.indexOf(state.reviveExploreArea) >= 0 || areaSelect.options[oi].value.indexOf(state.reviveExploreArea) >= 0) {
                                areaSelect.value = areaSelect.options[oi].value;
                                if (typeof window.onExploreAreaChange === 'function') window.onExploreAreaChange();
                                setStatus('已引渡归来，前往 ' + state.reviveExploreArea, 'run');
                                navigated = true;
                                break;
                            }
                        }
                    }
                }
                // 最后兜底：直接点地图节点
                if (!navigated) {
                    var nodes = document.querySelectorAll('.map-node[data-map-area-id]');
                    for (var ni = 0; ni < nodes.length; ni++) {
                        if ((nodes[ni].textContent || '').indexOf(state.reviveExploreArea) >= 0) {
                            nodes[ni].click();
                            setStatus('已引渡归来，前往 ' + state.reviveExploreArea, 'run');
                            break;
                        }
                    }
                }
            }
            // 复活后恢复 HP/MP/神识，避免残血连死
            await sleep(800);
            setStatus('复活后恢复 HP/MP', 'run');
            if (state.sectQuickRecovery) await activeRecover();
            if (state.autoMeditate) {
                var reviveInfo = getSpiritInfo();
                if (reviveInfo.spirit < reviveInfo.cost) {
                    await meditateUntilSpiritFull();
                }
            }
            setStatus('已引渡归来，继续流程', 'run');
            var toArea = state.reviveExploreArea || '原地';
            var s = getPlayerHpMp();
            wecomEnqueue('🔄 已引渡归来', '前往：' + toArea + '\n血量 ' + s.hp + '/' + s.maxHp + ' 灵力 ' + s.mp + '/' + s.maxMp + '\n将恢复后继续清理');
            return true;
        } catch (err2) {
            console.warn('[LingVerse Spirit Cleaner] death revive failed', err2);
            setStatus('自动复活失败，等待处理', 'warn');
            return false;
        } finally {
            busyEvent = false;
        }
    }

    function isGameNight() {
        if (typeof window.calcGameTime === 'function') {
            try {
                var gt = window.calcGameTime();
                if (gt && typeof gt.isNight === 'boolean') return gt.isNight;
            } catch (_) {}
        }

        var timeEl = document.getElementById('headerGameTime');
        if (!timeEl) return false;
        return timeEl.classList.contains('is-night') || String(timeEl.textContent || '').indexOf('(夜') >= 0;
    }

    function getMeditateTargetSpirit(info) {
        var maxSpirit = Number(info && info.maxSpirit || 0);
        if (maxSpirit <= 0) return 0;
        if (state.meditateStopSpirit > 0) return Math.min(maxSpirit, state.meditateStopSpirit);
        return maxSpirit;
    }

    function pickNumber(source, keys, fallback) {
        source = source || {};
        for (var i = 0; i < keys.length; i++) {
            var value = Number(source[keys[i]]);
            if (Number.isFinite(value)) return value;
        }
        return fallback;
    }

    function estimateMeditateProgress(statusData, startInfo, spiritPerMinute, startedAt) {
        var current = Number(startInfo && startInfo.spirit || 0);
        var maxSpirit = Number(startInfo && startInfo.maxSpirit || 0);
        var directTotal = pickNumber(statusData, ['currentSpirit', 'playerSpirit', 'spiritAfter', 'estimatedSpirit'], NaN);
        if (Number.isFinite(directTotal)) {
            return {
                current: current,
                gained: Math.max(0, directTotal - current),
                total: Math.min(maxSpirit, directTotal)
            };
        }

        var gained = pickNumber(statusData, ['spiritGained', 'gainedSpirit', 'totalSpiritGained', 'estimatedSpiritGain', 'spirit'], NaN);
        if (!Number.isFinite(gained)) {
            var durationSeconds = pickNumber(statusData, ['durationSeconds', 'elapsedSeconds', 'seconds', 'duration'], NaN);
            if (!Number.isFinite(durationSeconds)) durationSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
            gained = spiritPerMinute > 0 ? Math.floor(durationSeconds / 60 * spiritPerMinute) : 0;
        }
        gained = Math.max(0, gained);
        return {
            current: current,
            gained: gained,
            total: Math.min(maxSpirit, current + gained)
        };
    }

    function forceClearMeditationUi() {
        if (typeof window.stopMeditationUI === 'function') {
            try { window.stopMeditationUI(); } catch (_) {}
        }
        var bar = document.getElementById('meditationBar');
        if (bar) bar.classList.add('hidden');
        var btn = document.getElementById('meditateBtn');
        if (btn) {
            btn.classList.remove('meditating');
            btn.innerHTML = '冥想修炼';
        }
        window.meditationHpRate = 0;
        window.meditationMpRate = 0;
        window.meditationSpiritRate = 0;
    }

    async function getMeditationStatus() {
        if (!gameApi()) return null;
        try {
            var res = await gameApi().get('/api/game/meditate/status');
            if (res && res.code === 200 && res.data) return res.data;
        } catch (err) {
            console.warn('[LingVerse Spirit Cleaner] meditate status failed', err);
        }
        return null;
    }

    function isMeditatingStatus(data) {
        if (!data) return false;
        if (typeof data.isMeditating === 'boolean') return data.isMeditating;
        if (typeof data.meditating === 'boolean') return data.meditating;
        return Number(data.durationSeconds || data.elapsedSeconds || 0) > 0;
    }

    async function stopMeditationAndRefresh() {
        var stopRes = null;
        try {
            stopRes = await gameApi().post('/api/game/meditate/stop', {});
        } catch (err) {
            console.warn('[LingVerse Spirit Cleaner] meditate stop failed', err);
        }
        forceClearMeditationUi();
        if (stopRes && stopRes.code === 200 && stopRes.data && Array.isArray(stopRes.data.logs)) {
            if (typeof window.appendLogs === 'function') window.appendLogs(stopRes.data.logs, 'cultivation');
        }
        await refreshPlayer();
        return !!(stopRes && stopRes.code === 200);
    }

    async function stopMeditationBeforeRun() {
        var status = await getMeditationStatus();
        if (!isMeditatingStatus(status)) {
            forceClearMeditationUi();
            return true;
        }
        setStatus('检测到正在冥想，先自动收功', 'run');
        await stopMeditationAndRefresh();
        await sleep(500);
        return true;
    }

    async function tryAdvancedMeditateOnce() {
        if (!state.useAdvancedMeditate || !gameApi()) return false;
        // 只在夏季高级冥想 选项
        if (state.summerOnlyAdvancedMeditate) {
            var seasonEl = document.getElementById('envSeasonTitle');
            if (!seasonEl || (seasonEl.textContent || '').indexOf('夏') < 0) return false;
        }
        try {
            setStatus('尝试仙缘高级冥想', 'run');
            var adBefore = Number((getPlayer() || {}).adPoints || 0);
            if (!adBefore) {
                try { var adRes = await gameApi().get('/api/master/overview'); adBefore = (adRes && adRes.data && adRes.data.adPoints) || 0; } catch (_) {}
            }
            var res = await gameApi().post('/api/game/meditate/instant', { grade: 2 });
            if (!res || res.code !== 200) {
                setStatus('高级冥想失败，转普通冥想：' + ((res && res.message) || '未知原因'), 'warn');
                return false;
            }
            if (res.data && Array.isArray(res.data.logs)) {
                if (typeof window.appendLogs === 'function') window.appendLogs(res.data.logs, 'cultivation');
            }
            if (typeof window.loadGameLogs === 'function') window.loadGameLogs();
            await refreshPlayer();
            await refreshPlayer();
            var adAfter = Number((getPlayer() || {}).adPoints || 0);
            setStatus('高级冥想已完成', 'run');
            wecomEnqueue('✨ 高级冥想', '使用前仙缘：' + adBefore + '\n使用后仙缘：' + adAfter + '\n神识：已恢复');
            return true;
        } catch (err) {
            console.warn('[LingVerse Spirit Cleaner] advanced meditate failed', err);
            setStatus('高级冥想异常，转普通冥想', 'warn');
            return false;
        }
    }

    async function meditateUntilSpiritFull() {
        if (!state.autoMeditate || !gameApi()) return false;
        // 清除旧的冥想UI残留
        forceClearMeditationUi();
        window._meditationActive = false;
        window._meditationInProgress = false;
        var info = getSpiritInfo();
        if (!info.player || info.player.isDead || window.playerDead) return false;
        var targetSpirit = getMeditateTargetSpirit(info);
        if (info.maxSpirit <= 0 || info.spirit >= targetSpirit) return true;

        setStatus('神识不足，开始冥想到 ' + targetSpirit, 'run');
        // 切换神识套
        if (state.equipSwapEnabled && state.spiritEquipIds.length) {
            setStatus('切换神识套...', 'run');
            await equipSet(state.spiritEquipIds);
        }
        if (await tryAdvancedMeditateOnce()) {
            info = getSpiritInfo();
            if (info.spirit >= info.cost && info.spirit > state.reserve) return true;
            if (info.spirit >= targetSpirit) return true;
        }
        // 模拟点击冥想按钮，让游戏自己处理 API + UI
        var medBtn = document.getElementById('meditateBtn');
        if (medBtn && !medBtn.classList.contains('meditating')) {
            await humanClick(medBtn);
            await sleep(2000);
        } else {
            // 兜底：按钮不存在或已在冥想中，用 API
            var startRes = await gameApi().post('/api/game/meditate/start', {});
            if (!startRes || (startRes.code !== 200 && String(startRes.message || '').indexOf('冥想') < 0)) {
                toast('自动冥想启动失败：' + ((startRes && startRes.message) || '未知错误'));
                return false;
            }
            if (typeof window.startMeditationUI === 'function') { try { window.startMeditationUI(); } catch (_) {} }
            if (startRes.data && typeof startRes.data.spiritPerMinute === 'number') { window.meditationSpiritRate = startRes.data.spiritPerMinute; }
        }

        var spiritPerMinute = Number(window.meditationSpiritRate || 0);
        // 兜底：如果没获取到速率，每5秒查一次
        if (!spiritPerMinute) spiritPerMinute = (info.maxSpirit - info.spirit) / 60; // 粗糙估计1分钟满
        var estMin = info.maxSpirit > 0 && spiritPerMinute > 0 ? Math.ceil((targetSpirit - info.spirit) / spiritPerMinute) : 5;
        wecomEnqueue('🧘 开始冥想', '当前神识：' + info.spirit + '/' + info.maxSpirit + '\n目标神识：' + targetSpirit + '\n预计恢复：约 ' + estMin + '分钟后\n预计下一轮清理：' + new Date(Date.now() + (Number(estMin) || 0) * 60000).toLocaleTimeString());
        _lastMeditateReport = Date.now();
        var startedAt = Date.now();
        if (typeof window.startMeditationUI === 'function') {
            try { window.startMeditationUI(); } catch (_) {}
        }

        while (running) {
            await sleep(5000);
            var statusRes = await gameApi().get('/api/game/meditate/status');
            if (statusRes && statusRes.code === 200 && statusRes.data) {
                spiritPerMinute = Number(statusRes.data.spiritPerMinute || spiritPerMinute || 0);
                var progress = estimateMeditateProgress(statusRes.data, info, spiritPerMinute, startedAt);
                setStatus('冥想中：' + progress.current + ' + ' + progress.gained + ' = ' + progress.total + '/' + targetSpirit, 'run');
                // 每20分钟冥想进度通知
                if (Date.now() - _lastMeditateReport > 1200000) {
                    _lastMeditateReport = Date.now();
                    var remainMin = spiritPerMinute > 0 ? Math.ceil((targetSpirit - progress.total) / spiritPerMinute) : '?';
                    wecomEnqueue('🧘 冥想中', '预计收工神识：' + progress.total + '/' + targetSpirit + '\n还需约：' + remainMin + '分钟');
                }
                if (progress.total >= targetSpirit) break;
            } else if (spiritPerMinute > 0) {
                var fallbackProgress = estimateMeditateProgress({}, info, spiritPerMinute, startedAt);
                setStatus('冥想中：' + fallbackProgress.current + ' + ' + fallbackProgress.gained + ' = ' + fallbackProgress.total + '/' + targetSpirit, 'run');
                if (fallbackProgress.total >= targetSpirit) break;
            } else {
                setStatus('冥想中，等待神识恢复', 'run');
            }
        }

        if (!running) return false;

        setStatus('神识已到阈值，收功', 'run');
        await stopMeditationAndRefresh();
        // 切换回战斗套
        if (state.equipSwapEnabled && state.combatEquipIds.length) {
            setStatus('切回战斗套...', 'run');
            await equipSet(state.combatEquipIds);
        }
        return true;
    }

    function rarityName(rarity) {
        return ({ 1: '普通', 2: '优良', 3: '稀有', 4: '史诗', 5: '传说' })[Number(rarity)] || '传说';
    }

    function hasVoidBodyBuff() {
        var p = getPlayer() || {};
        var expire = Number(p.voidBodyBuffExpire || window._voidBodyExpire || 0);
        if (expire && expire > Date.now() + 30000) return true;

        var row = document.getElementById('statVoidBodyRow');
        var value = document.getElementById('statVoidBodyExpire');
        if (!row || !value || row.style.display === 'none') return false;
        var text = String(value.textContent || '').trim();
        return !!text && text !== '--' && text.indexOf('0秒') < 0;
    }

    async function loadInventoryItems() {
        var loaded = callPageFunction('loadInventory');
        if (loaded && typeof loaded.then === 'function') {
            try { await loaded; } catch (_) {}
        }
        try {
            if (typeof _inventoryCache !== 'undefined' && Array.isArray(_inventoryCache) && _inventoryCache.length) {
                return _inventoryCache;
            }
        } catch (_) {}
        var res = await gameApi().get('/api/game/inventory');
        if (res && res.code === 200 && Array.isArray(res.data)) return res.data;
        return [];
    }

    function itemQuantity(item) {
        return Number(item.quantity || item.count || item.stackCount || 1);
    }

    function itemIdOf(item) {
        return Number(item && (item.id || item.itemId || item.inventoryId || item.instanceId) || 0);
    }

    function isVoidBodyPill(item, rarity) {
        var name = String(item.name || item.itemName || '');
        var templateId = String(item.templateId || item.itemTemplateId || item.blueprintTemplateId || '');
        var itemRarity = Number(item.rarity || item.grade || 0);
        var desiredName = rarityName(rarity) + '虚空淬体丹';
        var exactTemplate = templateId.indexOf('void_body_' + rarity) >= 0;
        var nameMatch = name.indexOf('虚空淬体丹') >= 0;
        var rarityMatch = itemRarity === Number(rarity) || name.indexOf(desiredName) >= 0 || exactTemplate;
        return nameMatch && rarityMatch && itemQuantity(item) > 0;
    }

    async function findVoidBodyPillInInventory(rarity) {
        var items = await loadInventoryItems();
        return items.filter(function (item) {
            return isVoidBodyPill(item, rarity);
        }).sort(function (a, b) {
            return Number(a.id || a.itemId || 0) - Number(b.id || b.itemId || 0);
        })[0] || null;
    }

    async function useVoidBodyPill(item) {
        if (!item) return false;
        var itemId = itemIdOf(item);
        if (!itemId) return false;

        setStatus('使用' + (item.name || rarityName(state.voidBodyRarity) + '虚空淬体丹'), 'run');
        var used = callPageFunction('useItem', [itemId]);
        if (used && typeof used.then === 'function') {
            await used;
        } else if (!used) {
            var res = await gameApi().post('/api/game/use-item', { itemId: itemId });
            if (!res || res.code !== 200) {
                toast('虚空淬体丹使用失败：' + ((res && res.message) || '未知错误'));
                return false;
            }
        }

        await sleep(800);
        await refreshPlayer();
        return hasVoidBodyBuff();
    }

    function normalizeMarketItems(data) {
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.items)) return data.items;
        if (data && Array.isArray(data.list)) return data.list;
        if (data && Array.isArray(data.records)) return data.records;
        return [];
    }

    async function loadVoidBodyMarketListings(rarity) {
        var url = '/api/game/market/listings?page=1&type=pill&sort=price_asc&rarity=' + rarity + '&keyword=' + encodeURIComponent('虚空淬体丹');
        var res = await gameApi().get(url);
        if (!res || res.code !== 200) return [];
        return normalizeMarketItems(res.data).filter(function (item) {
            return !item.isMine && isVoidBodyPill(item, rarity);
        }).sort(function (a, b) {
            return Number(a.unitPrice || a.price || 0) - Number(b.unitPrice || b.price || 0);
        });
    }

    async function buyVoidBodyPills(rarity, quantity) {
        var listings = await loadVoidBodyMarketListings(rarity);
        var remaining = Math.max(1, Number(quantity || 1));
        if (!listings.length) {
            toast('坊市没有找到' + rarityName(rarity) + '虚空淬体丹');
            return false;
        }

        for (var i = 0; i < listings.length && remaining > 0; i++) {
            var listing = listings[i];
            var listingId = Number(listing.id || listing.listingId || 0);
            var canBuy = Math.max(1, Number(listing.quantity || listing.qty || 1));
            var buyQty = Math.min(remaining, canBuy);
            if (!listingId || buyQty <= 0) continue;

            setStatus('坊市购买' + rarityName(rarity) + '虚空淬体丹x' + buyQty, 'run');
            var res = await gameApi().post('/api/game/market/buy', { listingId: listingId, quantity: buyQty });
            if (!res || res.code !== 200) {
                var errMsg = (res && res.message) || '';
                if (/交易.*上限|上限.*交易|已达.*上限|每日.*次/.test(errMsg)) continue; // 换下一个卖家
                toast('坊市购买失败：' + errMsg);
                return false;
            }
            remaining -= buyQty;
            await sleep(600);
        }

        if (remaining > 0) {
            toast('坊市库存不足，只买到 ' + (quantity - remaining) + ' 个');
        }
        if (typeof window.loadMarketListings === 'function') {
            try { window.loadMarketListings(true); } catch (_) {}
        }
        return remaining < quantity;
    }

    async function ensureVoidBodyBuff(manual) {
        if (!gameApi()) return false;
        syncSettingsFromUi();
        if (hasVoidBodyBuff()) {
            if (manual) setStatus('虚空淬体已生效', 'run');
            return true;
        }

        var rarity = state.voidBodyRarity;
        var item = await findVoidBodyPillInInventory(rarity);
        if (!item) {
            var bought = await buyVoidBodyPills(rarity, state.voidBodyBuyQty);
            if (!bought) return false;
            await sleep(1000);
            item = await findVoidBodyPillInInventory(rarity);
        }
        if (!item) {
            toast('购买后仍未在背包找到' + rarityName(rarity) + '虚空淬体丹');
            return false;
        }

        var ok = await useVoidBodyPill(item);
        if (ok) { setStatus('虚空淬体已补齐', 'run'); wecomEnqueue('虚空淬体', '已补齐 ' + rarityName(rarity) + '虚空淬体加成'); }
        return ok;
    }

    function isHiddenCharmItem(item, rarity) {
        var name = String(item.name || item.itemName || item.title || item.goodsName || item.displayName || '');
        var templateId = String(item.templateId || item.itemTemplateId || item.blueprintTemplateId || '').toLowerCase();
        var haystack = (name + ' ' + templateId).toLowerCase();
        var keywordMatch = name.indexOf('隐秘符') >= 0 || name.indexOf('隐匿符') >= 0 || name.indexOf('隐身符') >= 0 || name.indexOf('秘符') >= 0 || /hidden|stealth|secret|charm|talisman/.test(haystack);
        if (!keywordMatch || itemQuantity(item) <= 0) return false;
        var desiredRarity = Number(rarity || 0);
        if (!desiredRarity) return true;
        var itemRarity = Number(item.rarity || item.grade || 0);
        return itemRarity === desiredRarity || name.indexOf(rarityName(desiredRarity)) >= 0 || templateId.indexOf(String(desiredRarity)) >= 0;
    }

    async function findHiddenCharmInInventory(rarity) {
        var items = await loadInventoryItems();
        return items.filter(function (item) {
            return isHiddenCharmItem(item, rarity);
        }).sort(function (a, b) {
            return itemIdOf(a) - itemIdOf(b);
        })[0] || null;
    }

    async function useHiddenCharm(item) {
        var itemId = itemIdOf(item);
        if (!itemId) return false;
        setStatus('使用' + (item.name || '隐秘符'), 'run');
        if (gameApi()) {
            var res = await gameApi().post('/api/game/use-item', { itemId: itemId });
            if (!res || res.code !== 200) {
                toast('隐秘符使用失败：' + ((res && res.message) || '未知错误'));
                return false;
            }
        } else {
            var used = callPageFunction('useItem', [itemId]);
            if (used && typeof used.then === 'function') await used;
            if (!used) return false;
        }
        await sleep(800);
        await refreshPlayer();
        hiddenCharmLastUseAt = Date.now();
        setStatus('隐秘符已尝试使用', 'run');
        return true;
    }

    async function loadHiddenCharmMarketListings(rarity) {
        var urls = [
            '/api/game/market/listings?page=1&sort=price_asc&keyword=' + encodeURIComponent('隐秘符'),
            '/api/game/market/listings?page=1&type=item&sort=price_asc&keyword=' + encodeURIComponent('隐秘符'),
            '/api/game/market/listings?page=1&type=talisman&sort=price_asc&keyword=' + encodeURIComponent('隐秘符')
        ];
        var seen = {};
        var results = [];
        for (var i = 0; i < urls.length; i++) {
            var res = null;
            try {
                res = await gameApi().get(urls[i]);
            } catch (err) {
                console.warn('[LingVerse Spirit Cleaner] hidden charm listing failed', err);
                continue;
            }
            if (!res || res.code !== 200) continue;
            normalizeMarketItems(res.data).forEach(function (item) {
                var listingId = Number(item.id || item.listingId || 0);
                if (!listingId || seen[listingId] || item.isMine || !isHiddenCharmItem(item, rarity)) return;
                seen[listingId] = true;
                results.push(item);
            });
        }
        return results.sort(function (a, b) {
            return Number(a.unitPrice || a.price || 0) - Number(b.unitPrice || b.price || 0);
        });
    }

    async function buyHiddenCharms(rarity, quantity) {
        var listings = await loadHiddenCharmMarketListings(rarity);
        var remaining = Math.max(1, Number(quantity || 1));
        if (!listings.length) {
            toast('坊市没有找到隐秘符');
            return false;
        }
        for (var i = 0; i < listings.length && remaining > 0; i++) {
            var listing = listings[i];
            var listingId = Number(listing.id || listing.listingId || 0);
            var canBuy = Math.max(1, Number(listing.quantity || listing.qty || 1));
            var buyQty = Math.min(remaining, canBuy);
            if (!listingId || buyQty <= 0) continue;
            setStatus('坊市购买隐秘符x' + buyQty, 'run');
            var res = await gameApi().post('/api/game/market/buy', { listingId: listingId, quantity: buyQty });
            if (!res || res.code !== 200) {
                var errMsg2 = (res && res.message) || '';
                if (/交易.*上限|上限.*交易|已达.*上限|每日.*次/.test(errMsg2)) continue;
                toast('隐秘符购买失败：' + errMsg2);
                return false;
            }
            remaining -= buyQty;
            await sleep(600);
        }
        if (typeof window.loadMarketListings === 'function') {
            try { window.loadMarketListings(true); } catch (_) {}
        }
        return remaining < quantity;
    }

    async function ensureHiddenCharm(manual) {
        if (!gameApi()) return false;
        syncSettingsFromUi();
        if (!manual && hiddenCharmLastUseAt && Date.now() - hiddenCharmLastUseAt < state.hiddenCharmRetryMs) return true;
        var rarity = state.hiddenCharmRarity;
        var item = await findHiddenCharmInInventory(rarity);
        if (!item) {
            var bought = await buyHiddenCharms(rarity, state.hiddenCharmBuyQty);
            if (!bought) return false;
            await sleep(1000);
            item = await findHiddenCharmInInventory(rarity);
        }
        if (!item) {
            toast('购买后仍未在背包找到隐秘符');
            return false;
        }
        var ok = await useHiddenCharm(item);
        if (ok && manual) setStatus('隐秘符已尝试使用', 'run');
        return ok;
    }

    // 失败安全阀：虚空淬体和隐秘符连续失败超限自动关闭
    var voidBodyFailStreak = 0;
    var hiddenCharmFailStreak = 0;
    var MAX_BUFF_FAIL_STREAK = 10;

    function hasVoidBodyFailSafe() {
        voidBodyFailStreak++;
        if (voidBodyFailStreak >= MAX_BUFF_FAIL_STREAK) {
            state.autoVoidBody = false;
            persistSetting('lvSpiritCleaner.autoVoidBody', false);
            voidBodyFailStreak = 0;
            setStatus('虚空淬体连续失败超限，已自动关闭', 'warn');
            wecomEnqueue('虚空淬体自动关闭', '连续失败 ' + MAX_BUFF_FAIL_STREAK + ' 次，已关闭开关');
            document.getElementById('lvscAutoVoidBody').checked = false;
            return false;
        }
        return true;
    }

    function hasHiddenCharmFailSafe() {
        hiddenCharmFailStreak++;
        if (hiddenCharmFailStreak >= MAX_BUFF_FAIL_STREAK) {
            state.autoHiddenCharm = false;
            persistSetting('lvSpiritCleaner.autoHiddenCharm', false);
            hiddenCharmFailStreak = 0;
            setStatus('隐秘符连续失败超限，已自动关闭', 'warn');
            wecomEnqueue('隐秘符自动关闭', '连续失败 ' + MAX_BUFF_FAIL_STREAK + ' 次，已关闭开关');
            document.getElementById('lvscAutoHiddenCharm').checked = false;
            return false;
        }
        return true;
    }

    var MERCHANT_RARITY_TEXT = {
        '普通': 1,
        '优良': 2,
        '稀有': 3,
        '史诗': 4,
        '传说': 5
    };

    function parseMerchantRarity(value, name) {
        if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
        var text = String(value || '') + ' ' + String(name || '');
        var best = 0;
        Object.keys(MERCHANT_RARITY_TEXT).forEach(function (key) {
            if (text.indexOf(key) >= 0) best = Math.max(best, MERCHANT_RARITY_TEXT[key]);
        });
        return best;
    }

    function normalizeMerchantItem(item, fallbackIndex) {
        item = item || {};
        var name = item.name || item.itemName || item.title || item.goodsName || item.displayName || '';
        var price = Number(item.price || item.cost || item.fee || item.stone || item.spiritStone || 0);
        if (!Number.isFinite(price)) price = Number(String(item.price || item.cost || '').replace(/[^\d]/g, '')) || 0;
        var index = Number(item.index);
        if (!Number.isFinite(index)) index = Number(item.idx);
        if (!Number.isFinite(index)) index = Number(item.id);
        if (!Number.isFinite(index)) index = fallbackIndex;
        return {
            index: index,
            name: String(name || ''),
            price: price,
            rarity: parseMerchantRarity(item.rarity || item.quality || item.rank || item.level, name),
            raw: item
        };
    }

    function getMerchantItemsFromDom() {
        return Array.prototype.map.call(document.querySelectorAll('#merchantItemsList .merchant-item'), function (card, position) {
            var button = card.querySelector('.merchant-item__buy-btn');
            var indexMatch = button && String(button.getAttribute('onclick') || '').match(/buyMerchantItem\((\d+)\)/);
            var name = (card.querySelector('.merchant-item__name') || {}).textContent || '';
            var priceText = (button || {}).textContent || '';
            return normalizeMerchantItem({
                index: indexMatch ? Number(indexMatch[1]) : NaN,
                name: name,
                price: Number(String(priceText).replace(/[^\d]/g, '')) || 0
            }, position);
        }).filter(function (item) {
            return Number.isFinite(item.index);
        });
    }

    function isLegendary(item) {
        return Number(item.rarity || 0) >= 5 || String(item.name || '').indexOf('传说') >= 0;
    }

    function merchantKeywordList() {
        return String(state.merchantKeyword || '').split(/[\s,，、；|]+/).map(function (part) {
            return part.trim();
        }).filter(Boolean);
    }

    var MERCHANT_RARITY_NAMES = { '普通': 1, '优良': 2, '稀有': 3, '史诗': 4, '传说': 5 };

    function chooseMerchantItem(items) {
        var keywords = merchantKeywordList();
        var rarityFilters = [];
        var nameFilters = [];
        for (var k = 0; k < keywords.length; k++) {
            if (MERCHANT_RARITY_NAMES[keywords[k]] !== undefined) {
                rarityFilters.push(MERCHANT_RARITY_NAMES[keywords[k]]);
            } else {
                nameFilters.push(keywords[k]);
            }
        }
        var candidates = items.map(normalizeMerchantItem).filter(function (item) {
            if (!Number.isFinite(item.index)) return false;
            if (state.merchantMode === 'legend' && !isLegendary(item)) return false;
            if (state.merchantMaxPrice > 0 && Number(item.price || 0) > state.merchantMaxPrice) return false;
            var matchRarity = !rarityFilters.length || rarityFilters.indexOf(Number(item.rarity || 0)) >= 0;
            var matchName = !nameFilters.length || nameFilters.some(function (keyword) {
                return String(item.name || '').indexOf(keyword) >= 0;
            });
            if (!nameFilters.length && !rarityFilters.length) return true;
            if (!nameFilters.length) return matchRarity;
            if (!rarityFilters.length) return matchName;
            // 严格匹配 AND 或宽松匹配 OR
            if (state.merchantStrictMatch) return matchRarity && matchName;
            return matchRarity || matchName;
        });
        candidates.sort(function (a, b) {
            if (state.merchantQualityFirst) {
                return (Number(b.rarity || 0) - Number(a.rarity || 0)) ||
                    (Number(a.price || 0) - Number(b.price || 0)) ||
                    (Number(a.index || 0) - Number(b.index || 0));
            }
            return (Number(a.price || 0) - Number(b.price || 0)) ||
                (Number(b.rarity || 0) - Number(a.rarity || 0)) ||
                (Number(a.index || 0) - Number(b.index || 0));
        });
        return candidates[0] || null;
    }

    async function leaveMerchantSafely() {
        var ok = false;
        if (typeof window.leaveMerchant === 'function') {
            try {
                await window.leaveMerchant();
                ok = true;
            } catch (err) {
                console.warn('[LingVerse Spirit Cleaner] native leaveMerchant failed', err);
            }
        }

        if (!ok) {
            try {
                var leaveRes = await gameApi().post('/api/game/merchant/leave', {});
                ok = !!(leaveRes && leaveRes.code === 200);
            } catch (err2) {
                console.warn('[LingVerse Spirit Cleaner] merchant leave api failed', err2);
            }
        }

        if (!ok) {
            var leaveBtn = document.getElementById('merchantLeaveBtn');
            if (leaveBtn) {
                try {
                    leaveBtn.click();
                    ok = true;
                } catch (err3) {
                    console.warn('[LingVerse Spirit Cleaner] merchant leave button failed', err3);
                }
            }
        }

        if (ok) {
            await sleep(500);
            setMerchantActive(false);
            var overlay = document.getElementById('merchantOverlay');
            if (overlay) overlay.classList.add('hidden');
        }
        return ok;
    }

    async function handleMerchantEvent() {
        if (!state.autoMerchantLegend || busyEvent || !isMerchantActive() || !gameApi()) return false;
        busyEvent = true;
        try {
            setStatus('处理商人事件', 'run');
            if (state.merchantMode === 'leave') {
                if (await leaveMerchantSafely()) {
                    toast('遇到商人，已直接离去');
                    if (typeof window.loadGameLogs === 'function') window.loadGameLogs();
                    await refreshPlayer();
                    return true;
                }
                setStatus('商人离开失败，等待重试', 'warn');
                return false;
            }

            var res = await gameApi().get('/api/game/merchant');
            var items = [];
            if (res && res.code === 200 && res.data && Array.isArray(res.data.items)) {
                items = res.data.items;
            } else if (res && res.code === 200 && Array.isArray(res.data)) {
                items = res.data;
            }
            if (!items.length) {
                items = getMerchantItemsFromDom();
            }

            var target = chooseMerchantItem(items);
            if (target) {
                var buyOk = false;
                if (typeof window.buyMerchantItem === 'function') {
                    await window.buyMerchantItem(target.index);
                    buyOk = true;
                } else {
                    var buyRes = await gameApi().post('/api/game/merchant/buy', { index: target.index });
                    buyOk = !!(buyRes && buyRes.code === 200);
                    if (!buyOk) toast('商人商品购买失败，准备离开：' + ((buyRes && buyRes.message) || '未知错误'));
                }
                if (buyOk) {
                    toast('已购买商人商品：' + (target.name || ('index ' + target.index)));
                    wecomEnqueue('商人购买', '已购买 ' + (target.name || '商品') + ' | 价格 ' + (target.price || 0) + ' 灵石');
                } else {
                    await leaveMerchantSafely();
                }
            } else {
                if (await leaveMerchantSafely()) {
                    toast('商人无符合配置的商品，已离开');
                } else {
                    setStatus('商人离开失败，等待重试', 'warn');
                    return false;
                }
            }

            if (!isMerchantActive()) setMerchantActive(false);
            if (typeof window.loadGameLogs === 'function') window.loadGameLogs();
            await refreshPlayer();
            return true;
        } catch (err) {
            console.warn('[LingVerse Spirit Cleaner] merchant handling failed', err);
            setStatus('商人处理异常，等待重试', 'warn');
            return false;
        } finally {
            busyEvent = false;
        }
    }

    function combatNumber(value) {
        if (typeof window.parseCombatNumber === 'function') return window.parseCombatNumber(value);
        if (typeof value === 'number') return value;
        var text = String(value || '').replace(/,/g, '').trim();
        var match = text.match(/-?\d+(?:\.\d+)?/);
        if (!match) return 0;
        var num = Number(match[0]);
        if (!Number.isFinite(num)) return 0;
        if (/亿/.test(text)) num *= 100000000;
        else if (/万/.test(text)) num *= 10000;
        return Math.round(num);
    }

    function firstCombatValue(source, keys) {
        source = source || {};
        for (var i = 0; i < keys.length; i++) {
            var value = source[keys[i]];
            if (value === 0 || value) {
                var parsed = combatNumber(value);
                if (parsed > 0) return parsed;
            }
        }
        return 0;
    }

    function textFromFirstElement(ids) {
        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (el && el.textContent) return el.textContent.trim();
        }
        return '';
    }

    function overlayText() {
        var overlay = document.getElementById('encounterOverlay');
        return overlay && overlay.textContent || '';
    }

    async function loadCurrentEncounterData() {
        if (!gameApi()) return null;
        try {
            var res = await gameApi().get('/api/game/check-encounter');
            if (res && res.code === 200 && res.data && res.data.hasEncounter) return res.data;
        } catch (err) {
            console.warn('[LingVerse Spirit Cleaner] encounter check failed', err);
        }
        return null;
    }

    function encounterDataFromWindow() {
        var overlay = document.getElementById('encounterOverlay');
        var hasDom = overlay && !overlay.classList.contains('hidden');
        if (!hasDom && !isEncounterActive()) return null;
        return {
            monsterName: ((document.getElementById('encounterMonsterName') || {}).textContent || '当前妖兽').trim(),
            monsterRealmName: ((document.getElementById('encounterMonsterRealm') || {}).textContent || '').trim(),
            monsterHp: window._currentEncounterMonsterHp || ((document.getElementById('encounterMonsterHp') || {}).textContent || 0),
            monsterAtk: window._currentEncounterMonsterAtk || ((document.getElementById('encounterMonsterAtk') || {}).textContent || 0),
            monsterDef: ((document.getElementById('encounterMonsterDef') || {}).textContent || 0),
            monsterRealmLevel: window._currentEncounterMonsterLevel || 1,
            monsterPower: window._currentEncounterMonsterPower || textFromFirstElement(['encounterMonsterPower', 'encounterMonsterCombatPower']),
            powerRelation: textFromFirstElement(['encounterPowerRelation', 'encounterCombatPowerRelation', 'encounterPowerCompare', 'encounterPowerComparison'])
        };
    }

    function encounterSelfFightDecision(encounterData) {
        var p = getPlayer() || {};
        if (!p || !encounterData) return { safe: false, reason: '缺少角色或妖兽数据' };
        if (p.isDead || window.playerDead) return { safe: false, reason: '角色已陨落' };

        var margin = Math.max(1, Number(state.selfFightMargin || 1));
        var playerPower = firstCombatValue(p, ['combatPower', 'battlePower', 'power', 'fightPower', 'strength', 'totalPower']);
        var monsterPower = firstCombatValue(encounterData, ['monsterPower', 'monsterCombatPower', 'combatPower', 'battlePower', 'power', 'fightPower', 'strength', 'totalPower']);

        if (!(playerPower > 0) || !(monsterPower > 0)) {
            return {
                safe: false,
                reason: '缺少战力数值，已跳过自战',
                summary: '自身战力 ' + (playerPower || '?') + '；妖兽战力 ' + (monsterPower || '?')
            };
        }

        if (monsterPower > playerPower * margin) {
            return {
                safe: false,
                reason: '妖兽战力超过自战倍率',
                summary: '自身战力 ' + playerPower + '；妖兽战力 ' + monsterPower + '；上限 ' + Math.floor(playerPower * margin)
            };
        }

        return {
            safe: true,
            reason: '妖兽战力未超过自战倍率',
            summary: '自身战力 ' + playerPower + '；妖兽战力 ' + monsterPower + '；倍率 ' + margin
        };
    }

    function appendCombatLogs(data) {
        if (!data || !Array.isArray(data.logs) || !data.logs.length) return;
        var logType = (['death', 'victory', 'retreat', 'rescued', 'defeat'].indexOf(data.status) >= 0) ? 'battle' : 'explore';
        if (typeof window.appendLogs === 'function') window.appendLogs(data.logs, logType);
        else if (typeof window.appendLog === 'function') data.logs.forEach(function (line) { window.appendLog(line, logType); });
    }

    async function finishCombatResult(data, sourceLabel) {
        appendCombatLogs(data);
        if (data && data.status === 'death') {
            window.playerDead = true;
            if (typeof window.showDeathOverlay === 'function') {
                var p = getPlayer() || {};
                window.showDeathOverlay(!!window.playerCanSelfRevive, p.reviveCost || 0, p.adPoints || 0, data.lastBattle);
            }
            if (state.autoReviveDeath) {
                await sleep(500);
                return await handleDeathReviveEvent(false);
            }
            setStatus(sourceLabel + '后角色陨落，等待处理', 'warn');
            return false;
        }
        if (data && data.status === 'encounter_expired') {
            setStatus('妖兽遭遇已结束', 'warn');
        } else if (data && data.status === 'defeat') {
            setStatus(sourceLabel + '失败，等待重试或手动处理', 'warn');
        } else {
            setStatus(sourceLabel + '完成', 'run');
        }
        setEncounterActive(false);
        if (typeof window.hideEncounterPanel === 'function') window.hideEncounterPanel();
        if (typeof window.loadInventory === 'function') window.loadInventory();
        if (typeof window.loadGameLogs === 'function') window.loadGameLogs();
        await refreshPlayer();
        return true;
    }

    async function handleSelfFightEvent(manual) {
        if ((!manual && !state.autoSelfFightWeak) || busyEvent || !gameApi()) return false;
        if (!manual && !isEncounterActive()) return false;
        busyEvent = true;
        try {
            await refreshPlayer();
            var encounterData = await loadCurrentEncounterData();
            if (!encounterData) encounterData = encounterDataFromWindow();
            if (!encounterData) {
                if (manual) setStatus('当前没有可处理的妖兽遭遇', 'warn');
                return false;
            }

            var decision = encounterSelfFightDecision(encounterData);
            if (!decision.safe) {
                setStatus('不自战：' + decision.reason, manual ? 'warn' : 'run');
                return false;
            }

            setStatus('弱怪自战：' + (encounterData.monsterName || '当前妖兽'), 'run');
            var fightRes = await gameApi().post('/api/game/combat-choice', { choice: 'fight' });
            if (!fightRes || fightRes.code !== 200 || !fightRes.data) {
                setStatus('自战失败：' + ((fightRes && fightRes.message) || '未知错误'), 'warn');
                if (typeof window.checkPendingEncounter === 'function') await window.checkPendingEncounter();
                return false;
            }
            await finishCombatResult(fightRes.data, '自战');
            _cleanStats.combats++;
            await recoverAfterCombat();
            return true;
        } catch (err) {
            console.warn('[LingVerse Spirit Cleaner] self fight failed', err);
            setStatus('弱怪自战异常，等待处理', 'warn');
            return false;
        } finally {
            busyEvent = false;
        }
    }

    async function applyAutoRecoverySettings() {
        // 所有恢复由脚本 activeRecover() 主动完成，不依赖游戏内置自动恢复设置。
        syncSettingsFromUi();
        setStatus('已保存恢复配置（脚本主动恢复）', 'run');
    }

    // 战后检查血量，残血自动恢复（避免连战暴毙）
    async function recoverAfterCombat() {
        if (!state.sectQuickRecovery || !gameApi()) return;
        await sleep(300);
        await refreshPlayer();
        var s = getPlayerHpMp();
        if (pct(s.hp, s.maxHp) < 50 || pct(s.mp, s.maxMp) < 30) {
            setStatus('战后血量/灵力偏低，自动恢复', 'run');
            await activeRecover();
        }
    }

    async function fetchSectShopServices() {
        var services = [];
        try {
            var res = await gameApi().get('/api/game/player-sect/builtin-shop');
            if (res && res.code === 200 && Array.isArray(res.data)) {
                for (var i = 0; i < res.data.length; i++) {
                    if (res.data[i].type === 'service') {
                        services.push({
                            templateId: res.data[i].templateId,
                            name: res.data[i].name,
                            cost: res.data[i].costContrib || 0,
                            buyUrl: '/api/game/player-sect/buy-builtin-item',
                            buyPayload: { itemId: String(res.data[i].templateId), quantity: 1 }
                        });
                    }
                }
            }
        } catch (_) {}
        return services;
    }

    async function triggerSectRecovery(manual) {
        if (!gameApi()) return false;
        syncSettingsFromUi();
        if (!state.sectQuickRecovery && !manual) return false;

        var player = getPlayer() || {};
        var hp = Number(player.hp || player.currentHp || 0);
        var maxHp = Number(player.maxHp || player.hpMax || 1);
        var mp = Number(player.mp || player.currentMp || player.spiritPower || 0);
        var maxMp = Number(player.maxMp || player.mpMax || 1);
        var hpPct = maxHp > 0 ? hp / maxHp * 100 : 100;
        var mpPct = maxMp > 0 ? mp / maxMp * 100 : 100;

        if (!manual) {
            var threshold = state.autoRecoveryThreshold;
            var mode = state.autoRecoveryMode;
            if (mode === 'none') return false;
            var needHp = (mode === 'hp' || mode === 'both') && hpPct < threshold;
            var needMp = (mode === 'mp' || mode === 'both') && mpPct < threshold;
            if (!needHp && !needMp) return false;
        }

        var didSomething = false;

        var services = await fetchSectShopServices();
        if (services.length > 0) {
            for (var i = 0; i < services.length; i++) {
                var svc = services[i];
                try {
                    setStatus('宗门治疗: ' + svc.name, 'run');
                    var res = await gameApi().post(svc.buyUrl, svc.buyPayload);
                    if (res && res.code === 200) {
                        setStatus('宗门治疗完成: ' + svc.name, 'run');
                        didSomething = true;
                        await sleep(400);
                    }
                } catch (err) {
                    console.warn('[LingVerse Spirit Cleaner] sect service buy failed', err);
                }
            }
        }

        if (!didSomething && (manual || hpPct < 70) && hpPct < mpPct && mp > 0) {
            try {
                var healAmount = Math.min(Math.floor(maxHp * 0.3), mp);
                setStatus('灵气疗伤 HP+' + healAmount, 'run');
                var healRes = await gameApi().post('/api/game/heal-with-mp', { hpAmount: healAmount });
                if (healRes && healRes.code === 200) {
                    setStatus('灵气疗伤完成', 'run');
                    didSomething = true;
                }
            } catch (err) {
                console.warn('[LingVerse Spirit Cleaner] heal-with-mp failed', err);
            }
        }

        if (didSomething) {
            await sleep(500);
            await refreshPlayer();
            return true;
        }
        if (manual) setStatus('未找到宗门治疗服务，请确认已加入宗门', 'warn');
        return false;
    }

    async function hasLowDurabilityFromApi() {
        if (!gameApi()) return false;
        try {
            var res = await gameApi().get('/api/game/equipment/current');
            if (res && res.code === 200 && Array.isArray(res.data)) {
                for (var i = 0; i < res.data.length; i++) {
                    if (Number(res.data[i].wearRate || 0) > 0) return true;
                }
            }
        } catch (_) {}
        return false;
    }

    async function triggerAutoNatalDevour(manual) {
        if (!gameApi()) return false;
        syncSettingsFromUi();
        if (!state.autoNatalDevour && !manual) return false;

        try {
            var infoRes = await gameApi().get('/api/game/natal/artifact');
            if (!infoRes || infoRes.code !== 200 || !infoRes.data || !infoRes.data.exists) {
                if (manual) setStatus('未找到本命法宝，请先凝练', 'warn');
                return false;
            }
            var info = infoRes.data;
            var slot = String(info.slot || info.equipSlot || 'weapon').toLowerCase();
            setStatus('本命吞噬：查背包', 'run');

            // 从背包找可吞噬装备
            var inv = [];
            try {
                var invRes = await gameApi().get('/api/game/inventory');
                if (invRes && invRes.code === 200 && Array.isArray(invRes.data)) inv = invRes.data;
            } catch (_) {}

            for (var i = 0; i < inv.length; i++) {
                var item = inv[i];
                if (!item) continue;
                if (item.isNatalArtifact || item.isNatal || item.isLocked || item.isEquipped || item.isIncarnationEquipped) continue;
                var itemType = String(item.type || item.equipSlot || '').toLowerCase();
                if (itemType && itemType !== slot) continue;
                var itemId = item.id || item.itemId || item.instanceId;
                if (!itemId) continue;
                setStatus('本命吞噬: ' + (item.name || item.itemName || '?'), 'run');
                try {
                    var devRes = await gameApi().post('/api/game/natal/artifact/devour-equipment', { itemId: Number(itemId), investPercent: 100 });
                    if (devRes && devRes.code === 200) {
                        setStatus('吞噬装备完成', 'run');
                        wecomEnqueue('本命吞噬', '装备: ' + (item.name || item.itemName || ''));
                        await sleep(500);
                        await refreshPlayer();
                        return true;
                    }
                    if (devRes && devRes.message) setStatus('吞噬失败: ' + devRes.message, 'warn');
                } catch (_) {}
                break;
            }

            // 无装备时吞噬材料
            setStatus('本命吞噬材料', 'run');
            try {
                var matRes = await gameApi().post('/api/game/natal/artifact/devour', { investPercent: 100 });
                if (matRes && matRes.code === 200) {
                    setStatus('本命吞噬材料完成', 'run');
                    wecomEnqueue('本命吞噬', '已吞噬材料，第 ' + ((info.devourCount || 0) + 1) + ' 次');
                    await sleep(500);
                    await refreshPlayer();
                    return true;
                }
                if (matRes && matRes.message) setStatus('吞噬材料失败: ' + matRes.message, 'warn');
            } catch (_) {}
        } catch (err) {
            console.warn('[LingVerse Spirit Cleaner] natal devour failed', err);
        }
        if (manual) setStatus('未找到可吞噬装备或材料不足', 'warn');
        return false;
    }

    async function triggerAutoRepair(manual) {
        if (!gameApi()) return false;
        syncSettingsFromUi();
        if (!state.autoRepair && !manual) return false;

        if (!manual) {
            var low = await hasLowDurabilityFromApi();
            if (!low) return false;
        }

        setStatus('调用修复 API', 'run');
        try {
            var preview = await gameApi().get('/api/game/equipment/repair-all/preview');
            if (preview && preview.code === 200 && preview.data && preview.data.count > 0) {
                var afford = (preview.data.currentStones || 0) >= (preview.data.totalCost || 0);
                if (!afford && !manual) {
                    setStatus('灵石不足，跳过修复（需 ' + preview.data.totalCost + '，有 ' + preview.data.currentStones + '）', 'warn');
                    return false;
                }
            }
            var res = await gameApi().post('/api/game/equipment/repair-all', {});
            if (res && res.code === 200) {
                var fixedCnt = (res.data && res.data.count) || '?';
                setStatus('装备修复完成', 'run');
                wecomEnqueue('装备维修', '修复完成，共修 ' + fixedCnt + ' 件');
                await sleep(500);
                await refreshPlayer();
                return true;
            }
            if (res && res.message) {
                setStatus('修复失败：' + res.message, 'warn');
                return false;
            }
        } catch (err) {
            console.warn('[LingVerse Spirit Cleaner] repair API failed', err);
        }

        if (manual) setStatus('维修 API 调用失败，请检查网络', 'warn');
        return false;
    }

    // 企业微信应用消息
    function gmFetch(url, options) {
        return new Promise(function (resolve) {
            var seq = 'wcf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
            function onDone(e) {
                var d = {};
                try { d = typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail; } catch (_) {}
                if (d.seq !== seq) return;
                window.removeEventListener('lvsc:gm-fetch:done', onDone);
                resolve({ ok: !!d.ok, status: d.status || 0, json: function () { return Promise.resolve(JSON.parse(d.body || '{}')); }, text: function () { return Promise.resolve(d.body || ''); } });
            }
            window.addEventListener('lvsc:gm-fetch:done', onDone);
            window.dispatchEvent(new CustomEvent('lvsc:gm-fetch', { detail: JSON.stringify({ seq: seq, url: url, method: (options && options.method) || 'GET', headers: (options && options.headers) || {}, body: (options && options.body) || undefined }) }));
        });
    }

    async function sendWeComMessage(webhookUrl, title, content) {
        if (!state.wecomNotify || !webhookUrl) return;
        var text = title + '\n' + content + '\n' + new Date().toLocaleString();
        try {
            var resp = await gmFetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ msgtype: 'text', text: { content: text } }) });
            var data = await resp.json();
            if (data && data.errcode === 0) return;
            setStatus('企业微信失败: ' + ((data && data.errmsg) || '未知').substring(0, 40), 'warn', 'Wecom');
        } catch (err) { setStatus('企业微信异常: ' + (err.message || '').substring(0, 40), 'warn', 'Wecom'); }
    }

    function wecomEnqueue(title, content, webhookUrl) {
        if (!state.wecomNotify) return;
        var url = webhookUrl || state.wecomNotifyWebhook;
        if (!url) return;
        wecomQueue.push({ title: title, content: content, url: url });
        if (wecomQueue.length > 50) wecomQueue.shift();
        wecomDrainQueue();
    }

    async function wecomDrainQueue() {
        if (wecomBusy || !wecomQueue.length) return;
        wecomBusy = true;
        try {
            while (wecomQueue.length > 0) {
                var msg = wecomQueue.shift();
                await sendWeComMessage(msg.url, msg.title, msg.content);
                if (wecomQueue.length > 0) await sleep(2000);
            }
        } finally {
            wecomBusy = false;
        }
    }

    // 聊天消息转发
    var chatForwardMaxId = 0;

    function isPrivateMessage(msgEl) {
        if (msgEl.classList.contains('chat-msg-system') || msgEl.classList.contains('chat-msg-recalled') || msgEl.classList.contains('chat-msg-recruit')) return false;
        // 检查消息自身的频道属性
        var epChannel = msgEl.getAttribute('data-ephemeral-channel') || '';
        if (epChannel === 'MASTER' || epChannel === 'SECT') return true;
        if (msgEl.classList.contains('chat-msg-direct') || msgEl.classList.contains('chat-msg-friend')) return true;
        var channel = window.currentChatChannel || 'WORLD';
        if (channel === 'SECT' || channel === 'MASTER') return true;
        return false;
    }

    function forwardChatMessage(msgEl) {
        if (!state.wecomNotify) return;
        var msgId = Number(msgEl.getAttribute('data-chat-message-id') || 0);
        if (msgId <= chatForwardMaxId) return;
        if (msgId > chatForwardMaxId) chatForwardMaxId = msgId;
        var info = extractChatPlayerInfo(msgEl);
        var text = extractChatMessageText(msgEl);
        if (!info.name && !text) return;
        var epChannel = msgEl.getAttribute('data-ephemeral-channel') || '';
        var isPrivate = isPrivateMessage(msgEl);
        var label = epChannel === 'MASTER' ? '师门' : epChannel === 'SECT' ? '宗门' : isPrivate ? '私信' : '世界';
        var prefix = '[' + label + '] ';
        var webhook = isPrivate ? (state.wecomPrivateWebhook || state.wecomNotifyWebhook) : (state.wecomWorldWebhook || state.wecomNotifyWebhook);
        if (!webhook) return;
        wecomEnqueue(prefix + info.name + (info.realm ? ' [' + info.realm + ']' : ''), text || '(空消息)', webhook);
    }

    function extractChatMessageText(msgEl) {
        var textEl = msgEl.querySelector('.chat-msg-text');
        return String(textEl && textEl.textContent || '').trim();
    }

    // 自动处理徒弟请求
    async function handleMasterRequests() {
        if (!state.autoMasterRequests || !gameApi()) return;
        try {
            var res = await gameApi().get('/api/master/overview');
            if (!res || res.code !== 200 || !res.data) return;
            var requests = (res.data.incomingRequests || []).filter(function (r) { return r.status === 'OPEN'; });
            if (!requests.length) return;
            for (var i = 0; i < requests.length; i++) {
                var req = requests[i];
                var kind = req.kind || '';
                var name = req.fromName || req.toName || '徒弟';
                recruitLog('处理请求: ' + kind + ' from ' + name);
                if (kind === 'WENDAO') {
                    try { await gameApi().post('/api/master/wendao/fulfill', { requestId: req.id }); } catch (_) {}
                    wecomEnqueue('问道处理', '已帮徒弟 ' + name + ' 解惑');
                } else if (kind === 'HUDAO') {
                    try { await gameApi().post('/api/master/hudao/accept', { requestId: req.id }); } catch (_) {}
                    wecomEnqueue('互道突破', '已应允徒弟 ' + name + ' 的护道');
                } else if (kind === 'LILIAN') {
                    try { await gameApi().post('/api/master/lilian/accept', { requestId: req.id }); } catch (_) {}
                    wecomEnqueue('历练应允', '已接取徒弟 ' + name + ' 的历练');
                }
                await sleep(800);
            }
        } catch (err) {
            console.warn('[LingVerse Spirit Cleaner] master requests failed', err);
        }
    }

    // 主动恢复（回血回蓝）
    var HP_PILL_PREFIXES = ['pill_recovery_', 'pill_blood_', 'pill_life_', 'pill_nirvana_', 'pill_heavenly_', 'pill_chaos_life_', 'sect_pill_blood_'];
    var MP_PILL_PREFIXES = ['pill_spirit_', 'pill_spring_', 'pill_mana_', 'pill_xuan_spirit_', 'pill_clarity_', 'sect_pill_spirit_'];
    var MP_PILL_EXCLUDES = ['pill_spirit_voyage_'];

    function isHpPill(item) { var tid = String(item.templateId || '').toLowerCase(); for (var i = 0; i < HP_PILL_PREFIXES.length; i++) { if (tid.indexOf(HP_PILL_PREFIXES[i]) >= 0) return true; } return false; }
    function isMpPill(item) { var tid = String(item.templateId || '').toLowerCase(); for (var i = 0; i < MP_PILL_EXCLUDES.length; i++) { if (tid.indexOf(MP_PILL_EXCLUDES[i]) >= 0) return false; } for (var i = 0; i < MP_PILL_PREFIXES.length; i++) { if (tid.indexOf(MP_PILL_PREFIXES[i]) >= 0) return true; } return false; }

    async function fetchInventory() { try { var res = await gameApi().get('/api/game/inventory'); if (res && res.code === 200 && Array.isArray(res.data)) return res.data; } catch (_) {} return []; }
    function getPlayerHpMp() { var p = getPlayer() || {}; return { hp: Number(p.hp || p.currentHp || 0), maxHp: Number(p.maxHp || p.hpMax || 1), mp: Number(p.mp || p.currentMp || 0), maxMp: Number(p.maxMp || p.mpMax || 1) }; }
    function pct(cur, max) { return max > 0 ? Math.round(cur / max * 100) : 100; }

    async function fetchSectShopServicesNew() {
        var services = [];
        try { var res = await gameApi().get('/api/game/player-sect/builtin-shop'); if (res && res.code === 200 && Array.isArray(res.data)) { for (var i = 0; i < res.data.length; i++) { if (res.data[i].type === 'service') { services.push({ templateId: res.data[i].templateId, name: res.data[i].name, cost: res.data[i].costContrib || 0, buyUrl: '/api/game/player-sect/buy-builtin-item', buyPayload: { itemId: String(res.data[i].templateId), quantity: 1 } }); } } } } catch (_) {}
        return services;
    }

    function translatePriority(chineseStr) {
        var map = { '灵力': 'mp', '丹药': 'pill', '宗门': 'sect', '仙缘': 'adpoint', '灵石': 'stone' };
        return chineseStr.split(',').map(function(s) { var k = s.trim(); return map[k] || k; });
    }

    var _lastRecoverTime = 0;
    async function activeRecover() {
        if (!gameApi()) return;
        // 游戏服务端设置最多15秒同步一次（战后自动恢复）
        if (Date.now() - _lastRecoverTime >= 15000) {
            _lastRecoverTime = Date.now();
            syncSettingsFromUi();
            var mode = state.autoRecoveryMode, t = state.autoRecoveryThreshold, g = state.autoRecoveryTarget;
            var hpOn = (mode === 'hp' || mode === 'both') ? 1 : 0;
            var mpOn = (mode === 'mp' || mode === 'both') ? 1 : 0;
            var hpP = mapPriorityToGame(state.autoHpPriority, 'hp');
            var mpP = mapPriorityToGame(state.autoMpPriority, 'mp');
            try { await gameApi().post('/api/player/settings', { auto_hp_ratio: hpOn ? t : 0, auto_hp_target: hpOn ? g : 0, auto_mp_ratio: mpOn ? t : 0, auto_mp_target: mpOn ? g : 0, auto_hp_priority: hpP, auto_mp_priority: mpP }); } catch (_) {}
        }
        // 主动恢复：严格按用户设置的优先级顺序
        var s = getPlayerHpMp();
        var hpPct = pct(s.hp, s.maxHp), mpPct = pct(s.mp, s.maxMp);
        var threshold = state.autoRecoveryThreshold;
        var needHp = (state.autoRecoveryMode === 'hp' || state.autoRecoveryMode === 'both') && hpPct < threshold;
        var needMp = (state.autoRecoveryMode === 'mp' || state.autoRecoveryMode === 'both') && mpPct < threshold;
        if (!needHp && !needMp) return;

        // HP: 按用户优先级顺序
        if (needHp) {
            var hpPri = String(state.autoHpPriority || '灵力,丹药,宗门').split(/[,，]+/);
            for (var hi = 0; hi < hpPri.length; hi++) {
                var m = hpPri[hi].trim();
                if (m === 'mp' && s.mp > s.maxMp * 0.2) { var heal = Math.floor(Math.min(s.maxHp - s.hp, s.maxHp * 0.3)); if (heal > 0) { try { var r1 = await gameApi().post('/api/game/heal-with-mp', { hpAmount: heal }); if (r1 && r1.code === 200) { needHp = false; break; } } catch (_) {} } }
                else if (m === 'pill') { try { var inv = await fetchInventory(); for (var pi = 0; pi < inv.length; pi++) { if (!isHpPill(inv[pi])) continue; if ((inv[pi].quantity || inv[pi].count || 0) <= 0) continue; var iid = inv[pi].id || inv[pi].itemId; if (!iid) continue; var r2 = await gameApi().post('/api/game/use-item', { itemId: iid }); if (r2 && r2.code === 200) { needHp = false; break; } } } catch (_) {} if (!needHp) break; }
                else if (m === 'sect') { try { var svcs = await fetchSectShopServicesNew(); for (var si = 0; si < svcs.length; si++) { var nm = String(svcs[si].name || '').toLowerCase(); if (nm.indexOf('回血') < 0 && nm.indexOf('气血') < 0 && nm.indexOf('治疗') < 0 && nm.indexOf('疗伤') < 0) continue; var r3 = await gameApi().post(svcs[si].buyUrl, svcs[si].buyPayload); if (r3 && r3.code === 200) { needHp = false; break; } } } catch (_) {} if (!needHp) break; }
            }
            if (needHp) needHp = false; // 所有方式都失败了，不再重试
        }
        // MP: 按用户优先级顺序
        if (needMp) {
            var mpPri = String(state.autoMpPriority || '灵石,丹药,宗门').split(/[,，]+/);
            for (var mi = 0; mi < mpPri.length; mi++) {
                var mm = mpPri[mi].trim();
                if (mm === 'stone') { try { var r4 = await gameApi().post('/api/game/absorb-stone', { stoneType: 'spirit', amount: 50 }); if (r4 && r4.code === 200) { needMp = false; break; } } catch (_) {} }
                else if (mm === 'pill') { try { var inv2 = await fetchInventory(); for (var pj = 0; pj < inv2.length; pj++) { if (!isMpPill(inv2[pj])) continue; if ((inv2[pj].quantity || inv2[pj].count || 0) <= 0) continue; var iid2 = inv2[pj].id || inv2[pj].itemId; if (!iid2) continue; var r5 = await gameApi().post('/api/game/use-item', { itemId: iid2 }); if (r5 && r5.code === 200) { needMp = false; break; } } } catch (_) {} if (!needMp) break; }
                else if (mm === 'sect') { try { var svcs2 = await fetchSectShopServicesNew(); for (var sj = 0; sj < svcs2.length; sj++) { var nm2 = String(svcs2[sj].name || '').toLowerCase(); if (nm2.indexOf('回灵') < 0 && nm2.indexOf('灵力') < 0) continue; var r6 = await gameApi().post(svcs2[sj].buyUrl, svcs2[sj].buyPayload); if (r6 && r6.code === 200) { needMp = false; break; } } } catch (_) {} if (!needMp) break; }
            }
        }
    }

    function mapPriorityToGame(pStr, type) {
        var parts = String(pStr || '').split(/[,，]+/);
        var valid = type === 'hp' ? ['mp', 'pill', 'adpoint'] : ['stone', 'pill', 'adpoint'];
        return parts.map(function(p) { var v = p.trim(); return valid.indexOf(v) >= 0 ? v : null; }).filter(Boolean).join(',') || 'pill';
    }

    function extractChatPlayerInfo(msgEl) {
        var avatarBtn = msgEl.querySelector('.chat-msg-avatar');
        var onclick = String(avatarBtn && avatarBtn.getAttribute('onclick') || '');
        var idMatch = onclick.match(/showPlayerProfile\((\d+)\)/);
        var playerId = idMatch ? Number(idMatch[1]) : 0;
        var nameEl = msgEl.querySelector('.chat-msg-name');
        var name = String(nameEl && nameEl.textContent || '').trim();
        var realmEl = msgEl.querySelector('.chat-msg-realm');
        var realm = String(realmEl && realmEl.textContent || '').trim();
        return { playerId: playerId, name: name, realm: realm };
    }

    async function handleNewChatMessage(msgEl) {
        if (!state.autoRecruit) return;
        var msgId = Number(msgEl.getAttribute('data-chat-message-id') || 0);
        if (!msgId || recruitProcessedIds[msgId]) return;
        recruitProcessedIds[msgId] = true;
        if (msgId > 999999000) recruitProcessedIds[msgId] = false;

        var now = Date.now();
        if (now - recruitLastActionAt < state.recruitIntervalMs) return;

        var info = extractChatPlayerInfo(msgEl);
        if (!info.playerId) return;

        var me = getPlayer() || {};
        var myId = Number(me.playerId || me.id || 0);
        if (info.playerId === myId) return;

        recruitLastActionAt = now;
        setStatus('收徒 ' + info.name + (info.realm ? ' [' + info.realm + ']' : ''), 'run');
        recruitLog('检测 ' + info.name + (info.realm ? ' [' + info.realm + ']' : '') + ' → 发起收徒');

        try {
            var apiRes = await gameApi().post('/api/master/invite', { apprenticeId: info.playerId });
            if (apiRes && apiRes.code === 200) {
                setStatus('已收徒：' + info.name, 'run');
                toast('收徒成功：' + info.name);
                recruitLog('✔ ' + info.name + ' 收徒成功');
                wecomEnqueue('收徒成功', info.name + ' [' + (info.realm || '?') + '] 已被收为弟子');
                return true;
            }
            if (apiRes && apiRes.message) {
                setStatus('收徒 ' + info.name + ' 失败：' + apiRes.message, 'warn');
                recruitLog('✘ ' + info.name + ' ' + apiRes.message);
            }
        } catch (err) {
            console.warn('[LingVerse Spirit Cleaner] recruit failed', err);
            recruitLog('✘ ' + info.name + ' 网络异常');
        }
        return false;
    }

    async function handleChatMessagesBatch() {
        // 世界频道
        var container = document.getElementById('inlineChatMessages');
        if (container) {
            var msgs = container.querySelectorAll('.chat-msg[data-chat-message-id]');
            for (var i = 0; i < msgs.length; i++) {
                var msgEl = msgs[i];
                if (state.wecomNotify) forwardChatMessage(msgEl);
                var msgId = Number(msgEl.getAttribute('data-chat-message-id') || 0);
                if (!msgId || recruitProcessedIds[msgId]) continue;
                if (state.autoRecruit) await handleNewChatMessage(msgEl);
            }
        }
        // 道友私聊
        var friendContainer = document.getElementById('friendChatMessages');
        if (friendContainer && state.wecomNotify) {
            var fmsgs = friendContainer.querySelectorAll('.chat-msg[data-chat-message-id]');
            for (var j = 0; j < fmsgs.length; j++) {
                var fmsgEl = fmsgs[j];
                var fmsgId = Number(fmsgEl.getAttribute('data-chat-message-id') || 0);
                if (!fmsgId || chatForwardMaxId >= fmsgId) continue;
                if (fmsgEl.classList.contains('chat-msg-system') || fmsgEl.classList.contains('chat-msg-recalled')) continue;
                forwardChatMessage(fmsgEl);
            }
        }
    }

    function pruneRecruitCache(maxKeep) {
        var keys = Object.keys(recruitProcessedIds);
        if (keys.length <= (maxKeep || 300)) return;
        var sorted = keys.map(Number).sort(function (a, b) { return a - b; });
        var remove = sorted.slice(0, sorted.length - (maxKeep || 300));
        for (var i = 0; i < remove.length; i++) {
            delete recruitProcessedIds[remove[i]];
        }
    }

    function startRecruitObserver() {
        if (recruitObserver) return;
        var container = document.getElementById('inlineChatMessages');
        if (!container) return;

        // 记下当前最大消息 ID，只转发之后的新消息
        var maxId = 0;
        function scanMaxId(sel) { var els = document.querySelectorAll(sel); for (var k = 0; k < els.length; k++) { var eid = Number(els[k].getAttribute('data-chat-message-id') || 0); if (eid > maxId) maxId = eid; } }
        scanMaxId('#inlineChatMessages .chat-msg[data-chat-message-id]');
        scanMaxId('#friendChatMessages .chat-msg[data-chat-message-id]');
        chatForwardMaxId = maxId;

        recruitObserver = new MutationObserver(function () {
            handleChatMessagesBatch();
            pruneRecruitCache(300);
        });
        recruitObserver.observe(container, { childList: true, subtree: true });
        // 同时监听道友私聊容器
        var friendContainer = document.getElementById('friendChatMessages');
        if (friendContainer) recruitObserver.observe(friendContainer, { childList: true, subtree: true });
        handleChatMessagesBatch();
    }

    function stopRecruitObserver() {
        if (recruitObserver) {
            recruitObserver.disconnect();
            recruitObserver = null;
        }
    }

    function protectorQuery() {
        if (typeof window.buildEncounterProtectorQuery === 'function') {
            return window.buildEncounterProtectorQuery();
        }
        return '';
    }

    function isDisabledMasterProtector(p) {
        if (typeof p.quotaRemaining === 'number' && p.quotaRemaining <= 0) return true;
        if (p.role === 'masterIncarnation') return Number(p.hp || 0) <= 0;
        if (p.role === 'masterBody') return !!(p.isDead || p.isMeditating);
        return false;
    }

    function protectorCandidates(list) {
        var candidates = [];
        (list || []).forEach(function (p) {
            var isDead = !!p.isDead || Number(p.hp || 0) <= 0;
            if (p.role === 'masterBody' || p.role === 'masterIncarnation') {
                if (isDisabledMasterProtector(p)) return;
                candidates.push({
                    id: p.playerId,
                    name: p.name || '师父',
                    fee: 0,
                    mode: p.role === 'masterBody' ? 'together' : 'alone',
                    role: p.role
                });
                return;
            }

            if (!p.isAvailable || p.isMeditating || isDead) return;
            var togetherFee = Math.max(0, Number(p.feeTogether || 0));
            var aloneFee = Math.max(0, Number(p.feeAlone || 0));
            candidates.push({
                id: p.playerId,
                name: p.name || '护道',
                fee: togetherFee,
                mode: 'together'
            });
            candidates.push({
                id: p.playerId,
                name: p.name || '护道',
                fee: aloneFee,
                mode: 'alone'
            });
        });
        candidates = candidates.filter(function (candidate) {
            if (state.hireMode !== 'cheapest' && candidate.mode !== state.hireMode) return false;
            if (state.hireMaxFee > 0 && candidate.fee > state.hireMaxFee) return false;
            return true;
        });
        return candidates.sort(function (a, b) {
            if (a.fee !== b.fee) return a.fee - b.fee;
            if (a.mode !== b.mode) return a.mode === 'together' ? -1 : 1;
            return String(a.name).localeCompare(String(b.name));
        });
    }

    function hireModeLabel(mode) {
        if (mode === 'together') return '合击';
        if (mode === 'alone') return '单独';
        return '最低价';
    }

    async function hireProtector(candidate) {
        var payload = {
            protectorId: candidate.id,
            mode: candidate.mode
        };
        if (candidate.role) payload.role = candidate.role;
        if (candidate.fee > HIGH_FEE_CONFIRM_THRESHOLD) payload.confirmedFee = candidate.fee;

        setStatus('雇佣护道：' + candidate.name + ' / ' + candidate.fee + '灵石', 'run');
        return await gameApi().post('/api/game/encounter-hire-protector', payload);
    }

    async function handleEncounterEvent() {
        if (busyEvent || !isEncounterActive() || !gameApi()) return false;
        // 激进模式：不找护道，直接打
        if (state.aggressiveMode) {
            busyEvent = true;
            try {
                setStatus('激进模式：直接迎战', 'run');
                var fightBtn = document.querySelector('#encounterPanel button, .encounter-actions button');
                if (fightBtn) { fightBtn.click(); return true; }
                var res = await gameApi().post('/api/game/combat-choice', { choice: 'fight' });
                return res && res.code === 200;
            } catch (_) { return false; }
            finally { busyEvent = false; }
        }
        if (!state.autoHireCheapest) return false;
        busyEvent = true;
        try {
            setStatus('寻找护道：' + hireModeLabel(state.hireMode), 'run');
            var res = await gameApi().get('/api/dungeon/protectors?' + protectorQuery());
            if (!res || res.code !== 200 || !Array.isArray(res.data)) {
                toast('护道列表加载失败');
                return false;
            }

            var candidates = protectorCandidates(res.data);
            if (!candidates.length) {
                setStatus('暂无符合条件的护道，等待重试' + (state.hireMaxFee > 0 ? '（上限 ' + state.hireMaxFee + ' 灵石）' : ''), 'warn');
                return false;
            }

            var cheapest = null;
            var hireRes = null;
            var lastError = '';
            var attempts = Math.min(state.hireRetryLimit, candidates.length);
            for (var i = 0; i < attempts; i++) {
                cheapest = candidates[i];
                hireRes = await hireProtector(cheapest);
                if (hireRes && hireRes.code === 200) break;

                lastError = (hireRes && hireRes.message) || '未知错误';
                toast('雇佣护道失败，准备重试：' + lastError);
                if (typeof window.checkPendingEncounter === 'function') await window.checkPendingEncounter();
                if (!isEncounterActive()) return true;
                await sleep(800);
            }

            if (!hireRes || hireRes.code !== 200) {
                toast('雇佣护道重试后仍失败：' + lastError);
                if (typeof window.checkPendingEncounter === 'function') await window.checkPendingEncounter();
                return false;
            }

            var data = hireRes.data || {};
            setEncounterActive(false);
            if (typeof window.hideEncounterPanel === 'function') window.hideEncounterPanel();
            if (typeof window.hideEncounterProtectorDialog === 'function') window.hideEncounterProtectorDialog();
            if (typeof window.closePanel === 'function') window.closePanel();

            if (Array.isArray(data.logs) && data.logs.length) {
                if (typeof window.appendLogs === 'function') window.appendLogs(data.logs, 'battle');
                else if (typeof window.appendLog === 'function') window.appendLog(data.logs[data.logs.length - 1], 'battle');
            }
            if (data.status === 'death') {
                window.playerDead = true;
                if (typeof window.showDeathOverlay === 'function') {
                    window.showDeathOverlay(true, data.reviveCost || 0, data.adPoints || 0);
                }
                if (state.autoReviveDeath) {
                    await sleep(500);
                    return await handleDeathReviveEvent(false);
                }
                setStatus('护道后角色陨落，等待处理', 'warn');
                return false;
            }

            toast('已雇佣护道：' + cheapest.name + '，' + cheapest.fee + '灵石，' + (cheapest.mode === 'alone' ? '单独' : '协同') + '。');
            _cleanStats.combats++;
            if (typeof window.loadInventory === 'function') window.loadInventory();
            if (typeof window.loadGameLogs === 'function') window.loadGameLogs();
            await refreshPlayer();
            await recoverAfterCombat();
            return true;
        } catch (err) {
            console.warn('[LingVerse Spirit Cleaner] protector hiring failed', err);
            setStatus('护道处理异常，等待重试', 'warn');
            return false;
        } finally {
            busyEvent = false;
        }
    }

    async function handleSpecialEvents() {
        if (state.autoReviveDeath && isDeathActive()) {
            return await handleDeathReviveEvent(false);
        }
        if (isMerchantActive() && state.autoMerchantLegend) {
            return await handleMerchantEvent();
        }
        if (isEncounterActive() && state.autoSelfFightWeak) {
            if (await handleSelfFightEvent(false)) return true;
        }
        if (isEncounterActive() && state.autoHireCheapest) {
            return await handleEncounterEvent();
        }
        return false;
    }

    function trialBuffScore(buff) {
        var text = String((buff && (buff.name + ' ' + buff.desc + ' ' + buff.rarity)) || '');
        var score = 0;
        if (text.indexOf('传说') >= 0) score += 500;
        if (text.indexOf('稀有') >= 0) score += 180;
        [
            ['不死', 1000],
            ['斩杀', 900],
            ['汲取', 850],
            ['灵根共鸣', 760],
            ['吸血', 720],
            ['连击', 660],
            ['暴击', 620],
            ['攻击', 560],
            ['技能触发', 520],
            ['防御', 460],
            ['生命', 430],
            ['气血', 430],
            ['回血', 400],
            ['再生', 400],
            ['反伤', 360],
            ['灵力', 260]
        ].forEach(function (entry) {
            if (text.indexOf(entry[0]) >= 0) score += entry[1];
        });
        return score;
    }

    function chooseBestTrialBuff(buffs) {
        return (buffs || []).slice().sort(function (a, b) {
            return trialBuffScore(b) - trialBuffScore(a);
        })[0] || null;
    }

    async function refreshTrialPanel() {
        if (window.TrialTowerModule && typeof window.TrialTowerModule.loadInfo === 'function') {
            try { window.TrialTowerModule.loadInfo(); } catch (_) {}
        }
    }

    async function autoTrialLoop() {
        if (autoTrialRunning || running) return;
        autoTrialRunning = true;
        updateMeter();
        setStatus('自动试炼启动', 'run');

        var trialFailRounds = 0;
        while (autoTrialRunning) {
            try {
                var infoRes = await gameApi().get('/api/trial-tower/info');
                if (!infoRes || infoRes.code !== 200 || !infoRes.data) {
                    setStatus('试炼信息读取失败，等待重试', 'warn');
                    await sleep(state.delayMs);
                    continue;
                }
                var info = infoRes.data;
                if (!info.hasActiveTrial) {
                    setStatus('开始新一轮试炼', 'run');
                    var startRes = await gameApi().post('/api/trial-tower/start', { useAdPoints: false });
                    if (!startRes || startRes.code !== 200) {
                        trialFailRounds++;
                        if (trialFailRounds >= 10) {
                            setStatus('试炼连续失败，自动切换为探索', 'run');
                            wecomEnqueue('自动切换', '试炼无法继续，切换为探索模式');
                            autoTrialRunning = false;
                            updateMeter();
                            await sleep(500);
                            runLoop();
                            return;
                        }
                        setStatus('试炼开始失败（' + trialFailRounds + '/10），等待重试', 'warn');
                        await sleep(state.delayMs);
                        continue;
                    }
                    trialFailRounds = 0;
                    await refreshTrialPanel();
                    await sleep(state.delayMs);
                    continue;
                }

                if (info.pendingBuffs && info.pendingBuffs.length) {
                    var pendingBest = chooseBestTrialBuff(info.pendingBuffs);
                    setStatus('试炼选择天赋：' + (pendingBest.name || pendingBest.id), 'run');
                    var choosePendingRes = await gameApi().post('/api/trial-tower/choose-buff', { buffId: pendingBest.id });
                    if (!choosePendingRes || choosePendingRes.code !== 200) {
                        setStatus('试炼天赋选择失败，等待重试', 'warn');
                    }
                    await refreshTrialPanel();
                    await sleep(state.delayMs);
                    continue;
                }

                setStatus('试炼挑战第' + (info.activeFloor || '?') + '层', 'run');
                var fightRes = await gameApi().post('/api/trial-tower/fight', {});
                if (!fightRes || fightRes.code !== 200 || !fightRes.data) {
                    setStatus('试炼挑战失败，等待重试', 'warn');
                    await sleep(state.delayMs);
                    continue;
                }
                var data = fightRes.data;
                if (data.victory && data.buffs && data.buffs.length) {
                    var best = chooseBestTrialBuff(data.buffs);
                    setStatus('通关，选择天赋：' + (best.name || best.id), 'run');
                    await gameApi().post('/api/trial-tower/choose-buff', { buffId: best.id });
                } else if (!data.victory) {
                    setStatus('试炼结束，藏宝图 +' + (data.rewardMaps || 0) + '，准备重开', 'run');
                }
                await refreshTrialPanel();
                await sleep(state.delayMs);
            } catch (err) {
                console.warn('[LingVerse Spirit Cleaner] auto trial failed', err);
                setStatus('自动试炼异常，等待重试', 'warn');
                await sleep(state.delayMs);
            }
        }

        updateMeter();
        if (!running && !monitoringSpirit && !autoTreasureRunning) setStatus('自动试炼已停止', 'idle');
    }

    function toggleAutoTrial() {
        if (autoTrialRunning) {
            autoTrialRunning = false;
            updateMeter();
            setStatus('自动试炼已停止', 'idle');
            return;
        }
        if (running) {
            setStatus('清理运行中，不能同时自动试炼', 'warn');
            return;
        }
        autoTrialLoop();
    }

    async function findTreasureMap() {
        var items = await loadInventoryItems();
        return items.filter(function (item) {
            return String(item.templateId || '') === 'treasure_map' && itemQuantity(item) > 0 && !item.isLocked;
        }).sort(function (a, b) {
            return Number(a.id || 0) - Number(b.id || 0);
        })[0] || null;
    }

    async function autoTreasureLoop() {
        if (autoTreasureRunning || running) return;
        syncSettingsFromUi();
        if (!await checkDaoyunBeforeStart('自动刷藏宝图')) {
            setStatus('道韵加成未确认，已取消刷图', 'warn');
            return;
        }
        autoTreasureRunning = true;
        var usedCount = 0;
        var treasureIdleRounds = 0;
        updateMeter();
        setStatus('自动刷藏宝图启动', 'run');

        while (autoTreasureRunning) {
            try {
                await refreshPlayer();
                if (isEncounterActive()) {
                    if (state.autoSelfFightWeak && await handleSelfFightEvent(false)) {
                        await sleep(state.delayMs);
                        continue;
                    }
                    if (state.autoHireCheapest) {
                        await handleEncounterEvent();
                    }
                    await sleep(state.delayMs);
                    continue;
                }

                var info = getSpiritInfo();
                if (info.player && (info.player.isDead || window.playerDead)) {
                    setStatus('角色已陨落，等待处理后继续刷图', 'warn');
                    await sleep(state.treasureIntervalMs || state.delayMs);
                    continue;
                }
                if (info.player && info.spirit < 3) {
                    setStatus('神识不足 3，等待恢复后继续刷图', 'warn');
                    await sleep(state.treasureIntervalMs || state.delayMs);
                    continue;
                }
                if (state.treasureBatchSize > 0 && usedCount >= state.treasureBatchSize) {
                    setStatus('本批藏宝图已使用 ' + usedCount + ' 次，等待手动停止或调整上限', 'run');
                    wecomEnqueue('藏宝图批次完成', '本批已消耗 ' + usedCount + ' 张藏宝图（上限 ' + state.treasureBatchSize + '）');
                    await sleep(state.treasureIntervalMs || state.delayMs);
                    continue;
                }

                var map = await findTreasureMap();
                if (!map) {
                    treasureIdleRounds++;
                    // 无图超过 30 轮自动切探索模式
                    if (treasureIdleRounds >= 30) {
                        setStatus('藏宝图长期无货，自动切换为探索', 'run');
                        wecomEnqueue('自动切换', '藏宝图已耗尽，切换为探索模式');
                        autoTreasureRunning = false;
                        updateMeter();
                        await sleep(500);
                        runLoop();
                        return;
                    }
                    setStatus('背包没有藏宝图（' + treasureIdleRounds + '/30），等待补充', 'warn');
                    await sleep(state.treasureIntervalMs || state.delayMs);
                    continue;
                }
                treasureIdleRounds = 0;

                if (state.autoHiddenCharm) {
                    if (!await ensureHiddenCharm(false)) {
                        setStatus('隐秘符未能使用，等待重试', 'warn');
                        await sleep(state.hiddenCharmRetryMs || state.delayMs);
                        continue;
                    }
                }

                var qty = Math.max(1, Math.min(state.treasureUseQuantity, itemQuantity(map)));
                setStatus('使用藏宝图：本次 ' + qty + '，剩余' + itemQuantity(map) + (state.treasureBatchSize > 0 ? '，批次' + usedCount + '/' + state.treasureBatchSize : ''), 'run');
                var mapItemId = Number(map.id || map.itemId || 0);
                if (gameApi()) {
                    var useMapRes = await gameApi().post('/api/game/use-item', { itemId: mapItemId, quantity: qty });
                    if (!useMapRes || useMapRes.code !== 200) throw new Error((useMapRes && useMapRes.message) || '藏宝图使用失败');
                } else {
                    var used = callPageFunction('useItem', [mapItemId]);
                    if (used && typeof used.then === 'function') await used;
                    if (!used) throw new Error('藏宝图使用失败');
                }
                usedCount += qty;
                await sleep(state.treasureIntervalMs || state.delayMs);
            } catch (err) {
                console.warn('[LingVerse Spirit Cleaner] auto treasure failed', err);
                setStatus('自动刷藏宝图异常，等待重试', 'warn');
                await sleep(state.treasureIntervalMs || state.delayMs);
            }
        }

        updateMeter();
    }

    var INSCRIPTION_QUALITY_RANK = {
        '普通': 1,
        '优良': 2,
        '稀有': 3,
        '史诗': 4,
        '传说': 5,
        '凡品': 1,
        '下品': 2,
        '中品': 3,
        '上品': 4,
        '极品': 5,
        '绝品': 6,
        '仙品': 7,
        '凡纹': 1, '灵纹': 2, '宝纹': 3, '仙纹': 4, '神纹': 5, '圣纹': 6, '天纹': 7,
        '神品': 8
    };

    function inscriptionQualityRank(quality) {
        return INSCRIPTION_QUALITY_RANK[String(quality || '').trim()] || 0;
    }

    function inscriptionQualityNumber(quality) {
        var match = String(quality || '').match(/(\d+(?:\.\d+)?)/);
        return match ? Number(match[1]) : 0;
    }

    function inscriptionQualityOk(resultQuality, targetQuality) {
        var target = String(targetQuality || '').trim();
        if (!target || target === 'any' || target === '不限') return true;
        var result = String(resultQuality || '').trim();
        if (!result) return false;
        var targetRank = inscriptionQualityRank(target);
        var resultRank = inscriptionQualityRank(result);
        if (targetRank || resultRank) return resultRank >= targetRank;
        var targetNumber = inscriptionQualityNumber(target);
        var resultNumber = inscriptionQualityNumber(result);
        if (targetNumber || resultNumber) return resultNumber >= targetNumber;
        return result.indexOf(target) >= 0 || target.indexOf(result) >= 0;
    }

    var INSC_STAT_NAMES = { attack: '攻击', defense: '防御', hp: '气血', spirit: '神识' };
    var INSC_HEAVEN_STAT_NAMES = { attack: '锋', defense: '御', hp: '命', spirit: '灵' };
    function inscriptionQualityName(q) {
        var map = { 1: '凡纹', 2: '灵纹', 3: '宝纹', 4: '仙纹', 5: '神纹', 6: '圣纹', 7: '天纹' };
        return map[Number(q)] || '凡纹';
    }
    var INSC_HEAVEN_TO_NORMAL = { '锋': '攻击', '御': '防御', '命': '气血', '灵': '神识' };
    function inscriptionStatName(statType, quality) {
        if (Number(quality) === 7) return INSC_HEAVEN_STAT_NAMES[statType] || '纹';
        return INSC_STAT_NAMES[statType] || '属性';
    }
    // 天纹属性名映射回普通属性名，用于匹配用户目标
    function normalizeStatForMatch(statName) {
        return INSC_HEAVEN_TO_NORMAL[statName] || statName;
    }
    function parseInscMinValue(raw) {
        raw = String(raw || '').trim();
        if (!raw) return 0;
        if (/%$/.test(raw)) return parseFloat(raw) || 0; // 保留百分比数值，如 "80%" → 80
        return Math.max(0, Number(raw) || 0);
    }

    // API 直调铭文（不再点按钮，也支持未打开铭文弹窗时后台运行）
    var _inscItemId = '';
    var _inscItemName = '';
    async function fetchInscriptionInfo() {
        if (!_inscItemId || !gameApi()) return null;
        var res = await gameApi().get('/api/game/inscription/info?itemId=' + _inscItemId);
        return (res && res.code === 200 && res.data) ? res.data : null;
    }
    async function inscriptionApiDraw(mode) {
        if (!_inscItemId || !gameApi()) return null;
        var ep = mode === 100 ? '/api/game/inscription/draw-hundred' : '/api/game/inscription/draw-ten';
        var res = await gameApi().post(ep, { itemId: _inscItemId });
        if (!res || res.code !== 200 || !res.data) return null;
        // 游戏返回格式: { inscriptions: [...], info: {...} }
        return res.data;
    }
    async function inscriptionApiDiscardAll() {
        if (!_inscItemId || !gameApi()) return false;
        var res = await gameApi().post('/api/game/inscription/discard-all', { itemId: _inscItemId });
        return !!(res && res.code === 200);
    }
    async function inscriptionApiApply(pendingIndex, slotIndex) {
        if (!_inscItemId || !gameApi()) return false;
        var res = await gameApi().post('/api/game/inscription/apply', { itemId: _inscItemId, pendingIndex: pendingIndex, slotIndex: slotIndex });
        return !!(res && res.code === 200);
    }
    async function inscriptionApiDiscardAll() {
        if (!_inscItemId || !gameApi()) return false;
        var res = await gameApi().post('/api/game/inscription/discard-all', { itemId: _inscItemId });
        return !!(res && res.code === 200);
    }
    async function inscriptionApiApply(pendingIndex, slotIndex) {
        if (!_inscItemId || !gameApi()) return false;
        var res = await gameApi().post('/api/game/inscription/apply', { itemId: _inscItemId, pendingIndex: pendingIndex, slotIndex: slotIndex });
        return !!(res && res.code === 200);
    }
    function parseDrawResults(data) {
        if (!data) return [];
        var items = data.inscriptions || data.results || data.pendingInscriptions || [];
        if (!Array.isArray(items) || !items.length) return [];
        var results = [];
        for (var di = 0; di < items.length; di++) {
            var item = items[di];
            if (!item) continue;
            var qNum = Number(item.quality || 0);
            var qName = inscriptionQualityName(qNum);
            var st = item.statType || item.stat || item.statName || '';
            var sName = inscriptionStatName(st, qNum);
            var rawVal = Number(item.value || 0);
            // 天纹 value 除以10才是百分比（45 → 4.5%）
            var val = qNum === 7 ? rawVal / 10 : rawVal;
            var valText = qNum === 7 ? '+' + val.toFixed(1) + '%' : '+' + val;
            results.push({
                quality: qName,
                qualityNum: qNum,
                qualityName: qName,
                stat: sName,
                statKey: st,
                value: val,
                rawValue: rawVal,
                pendingIndex: item.pendingIndex != null ? Number(item.pendingIndex) : di,
                text: qName + '·' + sName + valText
            });
        }
        return results;
    }

    function parseInscriptionTargets() {
        if (state.inscriptionStat) {
            return [{
                quality: state.inscriptionQuality || 'any',
                stat: state.inscriptionStat,
                minValue: Number(state.inscriptionMinValue || 0)
            }];
        }
        return String(state.inscriptionTargets || '').split(/[,，；\n]+/).map(function (item) {
            var parts = item.split(/[:：=]+/);
            var stat = String(parts[0] || '').trim();
            var minValue = Number(String(parts[1] || '0').replace(/[^\d.-]/g, '')) || 0;
            return stat ? { quality: 'any', stat: stat, minValue: minValue } : null;
        }).filter(Boolean);
    }

    function updateInscriptionPanel() {
        var stats = document.getElementById('lvscInscriptionStats');
        if (stats) {
            stats.textContent = '次数 ' + inscriptionStats.total + ' / 达成 ' + inscriptionStats.kept + ' / 放弃 ' + inscriptionStats.discarded + (inscriptionStats.best ? ' / 最高' + inscriptionStats.best : '');
        }
        var log = document.getElementById('lvscInscriptionLog');
        if (log && !log.textContent) log.textContent = '待命';
        updateMeter();
    }

    function inscriptionLog(message) {
        var log = document.getElementById('lvscInscriptionLog');
        if (!log) return;
        var time = new Date().toLocaleTimeString();
        log.textContent = '[' + time + '] ' + message + '\n' + (log.textContent || '');
    }

    function recruitLog(message) {
        var log = document.getElementById('lvscRecruitLog');
        if (!log) return;
        var time = new Date().toLocaleTimeString();
        log.textContent = '[' + time + '] ' + message + '\n' + (log.textContent || '');
        if (log.textContent.length > 8000) {
            log.textContent = log.textContent.substring(0, 8000);
        }
    }
    function craftLog(message) {
        var log = document.getElementById('lvscCraftLog');
        if (!log) return;
        var time = new Date().toLocaleTimeString();
        log.textContent = '[' + time + '] ' + message + '\n' + (log.textContent || '');
        if (log.textContent.length > 5000) log.textContent = log.textContent.substring(0, 5000);
    }

    function parseInscriptionResultCards() {
        var cards = document.querySelectorAll('.insc-result-card');
        return Array.prototype.map.call(cards, function (card) {
            var quality = ((card.querySelector('.insc-result-card__quality') || {}).textContent || '').trim();
            var stat = ((card.querySelector('.insc-result-card__stat') || {}).textContent || '').trim();
            var valueText = ((card.querySelector('.insc-result-card__value') || {}).textContent || '').trim();
            var value = Number(valueText.replace(/[^\d.-]/g, '')) || 0;
            return stat ? { quality: quality, stat: stat, value: value, element: card, text: (quality ? quality + ' ' : '') + stat + '+' + value } : null;
        }).filter(Boolean);
    }

    function inscriptionResultLabel(result) {
        return (result && result.quality ? result.quality + '·' : '') + (result && result.stat || '') + '+' + (result && result.value || 0);
    }

    function readInscriptionSlots() {
        var slots = [];
        var container = document.getElementById('customModal') || document;
        Array.prototype.forEach.call(container.querySelectorAll('span,.insc-slot-btn__value'), function (el) {
            var text = String(el.textContent || '').trim();
            if (!text || text === '-') return;
            var match = text.match(/(?:槽位\d+\s*[:：]\s*)?(.+?)\s*\+(\d+)/);
            if (!match) return;
            var name = match[1].trim();
            var parts = name.split(/[·.]/);
            slots.push({
                quality: parts.length > 1 ? parts[0] : '',
                stat: parts.length > 1 ? parts.slice(1).join('·') : name,
                value: Number(match[2]) || 0,
                text: text
            });
        });
        return slots;
    }

    function slotMatchesTargets(slot) {
        var targets = parseInscriptionTargets();
        return targets.some(function (target) {
            return String(slot.stat || '').indexOf(target.stat) >= 0 && inscriptionQualityOk(slot.quality, target.quality);
        });
    }

    function chooseInscriptionSlotButton(value) {
        var buttons = document.querySelectorAll('.insc-slot-btn, button');
        var fallback = null;
        var lowestTargetButton = null;
        var lowestTargetValue = Infinity;
        for (var i = 0; i < buttons.length; i++) {
            var btn = buttons[i];
            var text = String(btn.textContent || '').trim();
            if (!text) continue;
            if (text.indexOf('空') >= 0) return { button: btn, reason: '空槽' };
            var match = text.match(/(.+?)\s*\+(\d+)/);
            if (!match) continue;
            var name = match[1].trim();
            var parts = name.split(/[·.]/);
            var slot = {
                quality: parts.length > 1 ? parts[0] : '',
                stat: parts.length > 1 ? parts.slice(1).join('·') : name,
                value: Number(match[2]) || 0,
                text: text
            };
            if (!slotMatchesTargets(slot)) {
                fallback = fallback || { button: btn, reason: '替换非目标槽：' + text };
                continue;
            }
            if (slot.value < lowestTargetValue) {
                lowestTargetValue = slot.value;
                lowestTargetButton = btn;
            }
        }
        if (fallback) return fallback;
        if (lowestTargetButton && Number(value || 0) > lowestTargetValue) {
            return { button: lowestTargetButton, reason: '替换最低值+' + lowestTargetValue };
        }
        return null;
    }

    async function clickInscriptionDetailButton(result) {
        if (result && result.element) {
            var localBtn = Array.prototype.filter.call(result.element.querySelectorAll('button,[role=button]'), function (btn) {
                return String(btn.textContent || '').indexOf('详情') >= 0 || String(btn.textContent || '').indexOf('装配') >= 0 || String(btn.textContent || '').indexOf('铭刻') >= 0;
            })[0];
            if (localBtn && await humanClick(localBtn)) return true;
        }
        var detailBtn = visibleButtonByText(document, '查看详情') || visibleButtonByText(document, '详情');
        if (detailBtn) return await humanClick(detailBtn);
        return false;
    }

    async function autoEquipInscriptionResults(matches) {
        if (!state.inscriptionAutoEquip || !_inscItemId || !gameApi()) return false;
        var info = await fetchInscriptionInfo();
        if (!info) { inscriptionLog('装配跳过：无法获取铭文信息'); return false; }
        var slots = info.inscriptions || info.slots || [];
        if (!Array.isArray(slots)) slots = [];
        // API 可能只返回已填槽位，用 maxSlots 补全空槽
        var maxSlots = Number(info.maxSlots || info.totalSlots || info.slotCount || 0);
        while (maxSlots > 0 && slots.length < maxSlots) { slots.push({ quality: 0, stat: '', value: 0 }); }
        var equipped = 0;
        var usedSlots = {}; // 记录本轮已装槽位，防止重复装同一个空槽
        var cross = state.inscriptionEquipCrossStat;
        var skipSpirit = state.inscriptionEquipSkipSpirit;
        var sorted = (matches || []).slice().sort(function (a, b) { return Number((b.result || {}).value || 0) - Number((a.result || {}).value || 0); });
        // 兜底：读不到槽位就直接装，不跳过
        if (!slots.length) {
            for (var mi0 = 0; mi0 < sorted.length && autoInscriptionRunning; mi0++) {
                var r0 = sorted[mi0].result; if (!r0) continue;
                var ok0 = await inscriptionApiApply(r0.pendingIndex, 0);
                if (ok0) { equipped++; inscriptionLog('装配: ' + r0.text + ' → 槽位1'); }
            }
            return equipped > 0;
        }
        function slotVal(s) { var v = Number(s.value || 0); var q = Number(s.quality || 0); return q === 7 ? v / 10 : v; }
        function slotValText(s) { var q = Number(s.quality || 0); var v = slotVal(s); return q === 7 ? v.toFixed(1) + '%' : '+' + v; }
        function slotStatNorm(s) { var q = Number(s.quality || 0); return normalizeStatForMatch(inscriptionStatName(s.statType || s.stat, q)); }
        var slotDebug = slots.map(function(s, i) { var q = s && s.quality || 0; return '#' + (i + 1) + ':' + (q > 0 ? inscriptionQualityName(q) + '·' + inscriptionStatName(s.statType || s.stat, q) + slotValText(s) : '空'); }).join(' ');
        inscriptionLog('槽位: ' + (slotDebug || '无') + (cross ? ' 跨属性' : '') + (skipSpirit ? ' 跳神识' : ''));
        for (var mi = 0; mi < sorted.length && autoInscriptionRunning; mi++) {
            var result = sorted[mi].result;
            var target = sorted[mi].target;
            if (!result) continue;
            if (skipSpirit && (result.statKey === 'spirit' || target.stat === '神识')) { inscriptionLog('装配跳过(神识): ' + result.text); continue; }
            var bestSlot = -1, bestReason = '';
            var qNum = result.qualityNum || 0;
            // 1. 空槽位（跳过本轮已装过的）
            for (var s1 = 0; s1 < slots.length; s1++) { if (usedSlots[s1]) continue; if (!slots[s1] || (slots[s1].quality || 0) <= 0) { bestSlot = s1; bestReason = '空槽' + (s1 + 1); break; } }
            // 2. 同属性低品质
            if (bestSlot < 0) { var loQ = Infinity; for (var s2 = 0; s2 < slots.length; s2++) { if (!slots[s2] || (slots[s2].quality || 0) <= 0) continue; var q2 = Number(slots[s2].quality || 0); if (q2 >= qNum) continue; if (slotStatNorm(slots[s2]).indexOf(target.stat) < 0) continue; if (q2 < loQ) { bestSlot = s2; loQ = q2; bestReason = '替同属低品' + (s2 + 1); } } }
            // 3. 同属性同品质低数值
            if (bestSlot < 0) { var loV = Infinity; for (var s3 = 0; s3 < slots.length; s3++) { if (!slots[s3] || (slots[s3].quality || 0) <= 0) continue; var q3 = Number(slots[s3].quality || 0); if (q3 !== qNum) continue; if (slotStatNorm(slots[s3]).indexOf(target.stat) < 0) continue; var sv3 = slotVal(slots[s3]); if (sv3 < result.value && sv3 < loV) { bestSlot = s3; loV = sv3; bestReason = '替同属同品低值' + (s3 + 1) + '(旧' + slotValText(slots[s3]) + ')'; } } }
            // 跨属性
            if (cross) {
                if (bestSlot < 0) { var loQD = Infinity; for (var s4 = 0; s4 < slots.length; s4++) { if (!slots[s4] || (slots[s4].quality || 0) <= 0) continue; var q4 = Number(slots[s4].quality || 0); if (q4 >= qNum) continue; if (slotStatNorm(slots[s4]).indexOf(target.stat) >= 0) continue; if (q4 < loQD) { bestSlot = s4; loQD = q4; bestReason = '替异属低品' + (s4 + 1); } } }
                if (bestSlot < 0) { var loVD = Infinity; for (var s5 = 0; s5 < slots.length; s5++) { if (!slots[s5] || (slots[s5].quality || 0) <= 0) continue; var q5 = Number(slots[s5].quality || 0); if (q5 !== qNum) continue; if (slotStatNorm(slots[s5]).indexOf(target.stat) >= 0) continue; var sv5 = slotVal(slots[s5]); if (sv5 < result.value && sv5 < loVD) { bestSlot = s5; loVD = sv5; bestReason = '替异属同品低值' + (s5 + 1) + '(旧' + slotValText(slots[s5]) + ')'; } } }
            }
            if (bestSlot < 0) { inscriptionLog('装配跳过: ' + result.text); continue; }
            inscriptionLog('装配: ' + result.text + ' → ' + bestReason);
            var ok = await inscriptionApiApply(result.pendingIndex, bestSlot);
            if (ok) { equipped++; usedSlots[bestSlot] = true; await sleep(300); info = await fetchInscriptionInfo(); slots = (info && (info.inscriptions || info.slots)) || []; }
        }
        if (equipped > 0) inscriptionLog('装配完成: ' + equipped + ' 个');
        return equipped > 0;
    }

    function inscriptionTargetDecision(results) {
        var targets = parseInscriptionTargets();
        if (!targets.length) return { met: true, matches: [], reason: '未设置目标' };
        var matches = [];
        results.forEach(function (result) {
            targets.forEach(function (target) {
                var qualityOk = inscriptionQualityOk(result.quality, target.quality);
                var rStat = normalizeStatForMatch(result.stat || '');
                var tStat = normalizeStatForMatch(target.stat || '');
                if (qualityOk && rStat.indexOf(tStat) >= 0 && Number(result.value || 0) >= Number(target.minValue || 0)) {
                    matches.push({ result: result, target: target });
                }
            });
        });
        if (state.inscriptionStopMode === 'manual') return { met: false, matches: matches, reason: '手动停止模式' };
        if (state.inscriptionStopMode === 'all') {
            var matchedStats = {};
            matches.forEach(function (match) { matchedStats[match.target.stat] = true; });
            var allMet = targets.every(function (target) { return matchedStats[target.stat]; });
            return { met: allMet, matches: matches, reason: allMet ? '全部目标达成' : '未满足全部目标' };
        }
        return { met: matches.length > 0, matches: matches, reason: matches.length ? '任一目标达成' : '未命中目标' };
    }

    async function clickInscriptionPull(mode) {
        var selectors = [
            '.modal-action-btn__text',
            'button',
            '.modal-action-btn',
            '[role=button]',
            '[onclick*="TenPull"]',
            '[onclick*="tenPull"]',
            '[onclick*="HundredPull"]',
            '[onclick*="hundredPull"]',
            '[onclick*="Inscription"]',
            '[onclick*="inscription"]'
        ];
        var tenKw = mode === 100 ? ['百连灵纹', '百连'] : ['十连灵纹', '十连'];
        var hundredKw = mode === 10 ? [] : ['百连灵纹', '百连'];
        var keywords = tenKw.concat(hundredKw);
        // 文本匹配兜底
        var extraKw = mode === 100 ? ['HundredPull', 'hundredPull', '百次'] : ['TenPull', 'tenPull', '十次'];
        var buttons = document.querySelectorAll(selectors.join(','));
        for (var i = 0; i < buttons.length; i++) {
            var text = String(buttons[i].textContent || '').trim();
            var onclickText = String(buttons[i].getAttribute && buttons[i].getAttribute('onclick') || '');
            var haystack = text + ' ' + onclickText;
            var matched = false;
            for (var k = 0; k < keywords.length; k++) { if (text.indexOf(keywords[k]) >= 0) { matched = true; break; } }
            if (!matched) {
                for (var e = 0; e < extraKw.length; e++) { if (haystack.indexOf(extraKw[e]) >= 0) { matched = true; break; } }
            }
            if (matched) {
                var target = buttons[i].closest && buttons[i].closest('button') || buttons[i];
                if (target && !isElementDisabled(target) && isElementVisible(target)) {
                    await humanClick(target);
                    return true;
                }
            }
        }
        // 如果百连找不到，回退十连
        if (mode === 100) {
            return await clickInscriptionPull(10);
        }
        return false;
    }

    async function clickInscriptionDiscardAll() {
        var labels = ['全部放弃', '一键放弃'];
        for (var i = 0; i < labels.length; i++) {
            var btn = visibleButtonByText(document, labels[i]);
            if (btn) {
                await humanClick(btn);
                await sleep(300);
                var confirmBtn = document.getElementById('gameDialogConfirmBtn') || visibleButtonByText(document, '确定') || visibleButtonByText(document, '确认');
                if (confirmBtn) {
                    await humanClick(confirmBtn);
                    await sleep(500);
                    return parseInscriptionResultCards().length === 0;
                }
                await sleep(500);
                return parseInscriptionResultCards().length === 0;
            }
        }
        return false;
    }

    async function waitInscriptionResults(timeoutMs) {
        var started = Date.now();
        while (autoInscriptionRunning && Date.now() - started < timeoutMs) {
            var results = parseInscriptionResultCards();
            if (results.length) return results;
            await sleep(250);
        }
        return [];
    }

    async function autoInscriptionLoop() {
        if (autoInscriptionRunning) return;
        if (running || autoTreasureRunning) {
            setStatus('清理或刷图运行中，不能同时刷铭文', 'warn');
            return;
        }
        syncSettingsFromUi();
        // 下拉选了"当前装备" → 读游戏铭文弹窗里的 itemId
        if (_inscItemId === '__current__') {
            var foundId = getCurrentInscItemId();
            if (foundId) {
                _inscItemId = String(foundId);
                _inscItemName = '当前装备';
            } else {
                setStatus('请先在游戏里打开装备的铭文页面', 'warn');
                return;
            }
        }
        // 兜底：如果 _inscItemId 没设置，直接从 DOM 读
        if (!_inscItemId) {
            var selEl = document.getElementById('lvscInscriptionEquipment');
            if (selEl && selEl.value) {
                _inscItemId = selEl.value;
                _inscItemName = selEl.options[selEl.selectedIndex].textContent || '';
            }
        }
        if (!_inscItemId || !gameApi()) {
            setStatus('请先选择要铭文的装备', 'warn');
            return;
        }
        inscriptionStats = { total: 0, kept: 0, discarded: 0, best: '' };
        autoInscriptionRunning = true;
        inscriptionLog('开始铭文洗练：' + (state.inscriptionQuality === 'any' ? '不限等级' : state.inscriptionQuality + '及以上') + ' / ' + state.inscriptionStat + ' ≥ ' + state.inscriptionMinValue + ' / 装备 ' + (_inscItemName || _inscItemId));
        updateInscriptionPanel();
        while (autoInscriptionRunning) {
            try {
                // 先用 API 拉取当前待处理结果
                var info = await fetchInscriptionInfo();
                if (info && info.pendingInscriptions && info.pendingInscriptions.length) {
                    var existingResults = parseDrawResults({ inscriptions: info.pendingInscriptions });
                    var existingDecision = inscriptionTargetDecision(existingResults);
                    if (existingDecision.met) {
                        inscriptionLog('已有' + existingResults.length + '条结果命中目标，尝试自动装配...');
                        if (state.inscriptionAutoEquip && await autoEquipInscriptionResults(existingDecision.matches)) {
                            inscriptionStats.kept += 1;
                            updateInscriptionPanel();
                            await inscriptionApiDiscardAll();
                            await sleep(state.inscriptionDiscardDelay);
                            continue;
                        }
                        if (!state.inscriptionAutoEquip) inscriptionLog('自动装配未开启，停止等待处理');
                        setStatus('铭文目标达成，已停止', 'run');
                        wecomEnqueue('铭文命中', '铭文目标已达成');
                        autoInscriptionRunning = false;
                        updateInscriptionPanel();
                        updateMeter();
                        return;
                    }
                    await inscriptionApiDiscardAll();
                    inscriptionStats.discarded += 1;
                    updateInscriptionPanel();
                    await sleep(state.inscriptionDiscardDelay);
                    continue;
                }
                if (state.inscriptionMaxAttempts > 0 && inscriptionStats.total >= state.inscriptionMaxAttempts) {
                    inscriptionLog('达到最大次数，等待手动停止或调整上限');
                    setStatus('铭文已达到最大次数，仍保持运行', 'warn');
                    await sleep(Math.max(state.inscriptionResultDelay, 2000));
                    continue;
                }
                // API 直调抽铭文
                var drawData = await inscriptionApiDraw(state.inscriptionPullMode);
                if (!drawData) {
                    var modeLabel = state.inscriptionPullMode === 100 ? '百连' : '十连';
                    inscriptionLog('铭文' + modeLabel + 'API 失败，等待重试');
                    setStatus('铭文' + modeLabel + ' API 失败，等待重试', 'warn');
                    await sleep(Math.max(state.inscriptionResultDelay, 2000));
                    continue;
                }
                inscriptionStats.total += 1;
                updateInscriptionPanel();
                // API 返回结果直接在 drawData 里
                var results = parseDrawResults(drawData);
                if (!results.length) {
                    inscriptionLog('第' + inscriptionStats.total + ' 次没有解析到结果，等待重试');
                    setStatus('铭文结果为空，等待重试', 'warn');
                    await sleep(Math.max(state.inscriptionResultDelay, 2000));
                    continue;
                }
                var best = results.slice().sort(function (a, b) { return Number(b.qualityNum || 0) - Number(a.qualityNum || 0) || Number(b.value || 0) - Number(a.value || 0); })[0];
                if (best) inscriptionStats.best = best.text;
                var decision = inscriptionTargetDecision(results);
                // 日志只显示最优3条 + 汇总
                var sorted = results.slice().sort(function (a, b) { return Number(b.qualityNum || 0) - Number(a.qualityNum || 0) || Number(b.value || 0) - Number(a.value || 0); });
                var top3 = sorted.slice(0, 3).map(function (r) { return r.text; }).join('，');
                var isHundred = drawData && drawData.drawCount;
                var summary = (isHundred ? '百连(' + drawData.keptCount + '/' + drawData.drawCount + ')' : '十连') + ' 最优: ' + top3;
                inscriptionLog('第' + inscriptionStats.total + ' 次 ' + summary + ' → ' + decision.reason);
                if (decision.met) {
                    inscriptionStats.kept += 1;
                    updateInscriptionPanel();
                    wecomEnqueue('铭文命中', '第' + inscriptionStats.total + '次 | ' + results.map(function (item) { return item.text; }).join('，'));
                    inscriptionLog('命中' + decision.matches.length + '条，尝试自动装配...');
                    if (state.inscriptionAutoEquip && await autoEquipInscriptionResults(decision.matches)) {
                        await inscriptionApiDiscardAll();
                        await sleep(state.inscriptionDiscardDelay);
                        continue;
                    }
                    if (!state.inscriptionAutoEquip) inscriptionLog('自动装配未开启，停止等待处理');
                    setStatus('铭文目标达成，已停止', 'run');
                    autoInscriptionRunning = false;
                    updateInscriptionPanel();
                    updateMeter();
                    return;
                }
                if (await inscriptionApiDiscardAll()) {
                    inscriptionStats.discarded += 1;
                    updateInscriptionPanel();
                    await sleep(state.inscriptionDiscardDelay);
                } else {
                    inscriptionLog('未找到放弃按钮，等待重试以免误操作');
                    setStatus('未找到放弃按钮，等待重试', 'warn');
                    await sleep(Math.max(state.inscriptionDiscardDelay, 2000));
                    continue;
                }
            } catch (err) {
                console.warn('[LingVerse Spirit Cleaner] inscription loop failed', err);
                inscriptionLog('铭文洗练异常：' + (err.message || '未知错误') + '，等待重试');
                notifyUser('铭文洗练异常', err.message || '未知错误');
                await sleep(Math.max(state.inscriptionResultDelay, 2000));
            }
        }
        updateInscriptionPanel();
    }

    function toggleAutoInscription() {
        if (autoInscriptionRunning) {
            autoInscriptionRunning = false;
            inscriptionLog('手动停止');
            updateInscriptionPanel();
            return;
        }
        autoInscriptionLoop();
    }

    function toggleAutoTreasure() {
        if (autoTreasureRunning) {
            autoTreasureRunning = false;
            updateMeter();
            setStatus('自动刷藏宝图已停止', 'idle');
            return;
        }
        if (running) {
            setStatus('清理运行中，不能同时刷藏宝图', 'warn');
            return;
        }
        if (autoInscriptionRunning) {
            setStatus('铭文洗练中，不能同时刷藏宝图', 'warn');
            return;
        }
        autoTreasureLoop();
    }

    function getMonitorTargetSpirit(info) {
        var maxSpirit = Number(info && info.maxSpirit || 0);
        if (state.monitorStartSpirit > 0) return Math.min(maxSpirit || state.monitorStartSpirit, state.monitorStartSpirit);
        return maxSpirit;
    }

    async function monitorSpiritLoop() {
        if (monitoringSpirit || running) return;
        monitoringSpirit = true;
        syncSettingsFromUi();
        updateMeter();
        var monitorStartedAt = Date.now();
        var monitorSpiritPerMinute = Number(window.meditationSpiritRate || 0);
        var MIN_MONITOR_MS = 30000; // 最短监测30秒，防止秒级反复横跳

        while (monitoringSpirit && !running) {
            await refreshPlayer();
            if (state.autoBreakthrough) await autoBreakthroughCheck();
            if (state.autoOriginRepair) await autoOriginRepairCheck();
            if (state.autoMasterRequests) await handleMasterRequests();
            var info = getSpiritInfo();
            var target = getMonitorTargetSpirit(info);
            if (!info.player || target <= 0) {
                setStatus('监测中：等待角色数据', 'warn');
            } else {
                var statusRes = null;
                try {
                    statusRes = await gameApi().get('/api/game/meditate/status');
                } catch (_) {}

                if (statusRes && statusRes.code === 200 && statusRes.data) {
                    monitorSpiritPerMinute = Number(statusRes.data.spiritPerMinute || monitorSpiritPerMinute || 0);
                    var progress = estimateMeditateProgress(statusRes.data, info, monitorSpiritPerMinute, monitorStartedAt);
                    setStatus('监测冥想：' + progress.current + ' + ' + progress.gained + ' = ' + progress.total + '/' + target, 'run');
                    if (progress.total >= target && Date.now() - monitorStartedAt > MIN_MONITOR_MS) {
                        monitoringSpirit = false;
                        updateMeter();
                        setStatus('预计神识已到，收功后开始清理', 'run');
                        await stopMeditationAndRefresh();
                        await sleep(300);
                        if (state.exploreMode === 'system') { await systemExploreLoop(); }
                        else { await runLoop(); }
                        return;
                    }
                } else if (info.spirit >= target && Date.now() - monitorStartedAt > MIN_MONITOR_MS) {
                    monitoringSpirit = false;
                    updateMeter();
                    setStatus('神识已到 ' + info.spirit + '/' + target + '，开始清理', 'run');
                    await sleep(300);
                    if (state.exploreMode === 'system') { await systemExploreLoop(); }
                    else { await runLoop(); }
                    return;
                } else if (state.autoMeditate && info.spirit < info.maxSpirit) {
                    // 没有在冥想，点按钮开始
                    setStatus('监测中：开始冥想...', 'run');
                    var medBtn2 = document.getElementById('meditateBtn');
                    if (medBtn2 && !medBtn2.classList.contains('meditating')) {
                        await humanClick(medBtn2);
                        await sleep(1000);
                        monitorStartedAt = Date.now();
                    } else {
                        setStatus('监测中：冥想启动失败，等待重试', 'warn');
                    }
                } else {
                    setStatus('监测中：神识 ' + info.spirit + '/' + target, 'run');
                }
            }
            await sleep(Math.max(3000, state.delayMs));
        }

        updateMeter();
        if (!running) setStatus('神识监测已停止', 'idle');
    }

    function toggleSpiritMonitor() {
        if (running) {
            setStatus('清理运行中，无需监测', 'warn');
            return;
        }
        if (monitoringSpirit) {
            monitoringSpirit = false;
            if (loopTimer) {
                clearTimeout(loopTimer);
                loopTimer = null;
            }
            updateMeter();
            setStatus('神识监测已停止', 'idle');
            return;
        }
        monitorSpiritLoop();
    }

    // 检查商家/遭遇阻塞 → 返回 true 表示已处理（应 continue）
    async function checkEventBlockers() {
        if (await handleSpecialEvents()) return true;
        if (isEncounterActive() && state.autoHireCheapest) return true;
        if (isMerchantActive() && state.autoMerchantLegend) return true;
        if (isMerchantActive()) {
            setStatus('商人事件待处理，等待中', 'warn');
            return true;
        }
        return false;
    }

    // 检查夜间限制 → 返回 true 表示应 continue
    function checkNightRestriction() {
        if (state.nightOnlyExplore && !isGameNight()) {
            // 自动冥想等夜晚
            if (state.autoMeditate && !monitoringSpirit) {
                setStatus('白天自动冥想，等夜晚收工探索', 'run');
                return 'meditate_until_night';
            }
            setStatus('当前不是夜晚，等待夜晚探索', 'warn');
            return true;
        }
        return false;
    }

    // 冥想后继续流程 → 无返回值，直接 continue（调用方负责处理）
    async function meditateThenWait() {
        if (!await meditateUntilSpiritFull()) {
            setStatus('神识不足，自动冥想失败，等待重试', 'warn');
            return false;
        }
        if (!state.autoExploreAfterMeditate) {
            setStatus('已收功，等待手动停止或开启自动继续探索', 'warn');
        }
        return true;
    }

    // 神识不足时自动转入监测模式（等待自然恢复后自动重启清理）
    async function switchToMonitor(reason) {
        console.log('[switchToMonitor] called, reason=' + reason + ' running=' + running + ' monitoringSpirit=' + monitoringSpirit);
        // 冥想前先清理遭遇/商人，否则卡住无法冥想
        if (typeof _encounterActive !== 'undefined' && _encounterActive) {
            try { if (state.aggressiveMode) await handleEncounterEvent(); else await handleSelfFightEvent(false); } catch(_) {}
            await sleep(500);
        }
        if (typeof _merchantActive !== 'undefined' && _merchantActive) {
            try { await handleMerchantEvent(); } catch(_) {}
            await sleep(500);
        }
        running = false;
        monitoringSpirit = false;
        persistRunning(false);
        updateMeter();
        setStatus(reason + '，自动转入神识监测', 'run');
        wecomEnqueue('转入监测', reason);
        // 点击冥想按钮，让游戏自己处理
        if (state.autoMeditate) {
            var _info = getSpiritInfo();
            if (_info.player && _info.spirit < _info.maxSpirit) {
                setStatus('开始冥想...', 'run');
                try {
                    var _medBtn = document.getElementById('meditateBtn');
                    if (_medBtn && !_medBtn.classList.contains('meditating')) {
                        await humanClick(_medBtn);
                        await sleep(1500);
                    }
                } catch (_) {}
            }
        }
        await sleep(500);
        monitorSpiritLoop();
    }

    // --- 系统自带探索 + 脚本特性监控 ---
    async function systemExploreLoop() {
        if (running || autoInscriptionRunning) { console.log('[SysExplore] blocked: running=' + running + ' insc=' + autoInscriptionRunning); return; }
        if (monitoringSpirit) { monitoringSpirit = false; updateMeter(); }
        if (typeof startAutoExplore !== 'function') { setStatus('系统自动探索不可用', 'warn'); return; }
        console.log('[SysExplore] start. medActive=' + window._meditationActive + ' medProg=' + window._meditationInProgress + ' _autoExploreRunning=' + (typeof _autoExploreRunning !== 'undefined' ? _autoExploreRunning : 'undef'));
        // 如果正在冥想，先收功再启动
        var playerNow = getPlayer() || {};
        if (playerNow.isMeditating) {
            setStatus('检测到正在冥想，先收功...', 'run');
            console.log('[SysExplore] player isMeditating, stopping meditation...');
            try {
                await gameApi().post('/api/game/meditate/stop', {});
                await sleep(1500);
                // 强制清除UI残留
                if (typeof forceClearMeditationUi === 'function') forceClearMeditationUi();
                window._meditationActive = false;
                window._meditationInProgress = false;
                // 点"收工并继续" — 刷新玩家数据
                await refreshPlayer();
            } catch (e) { console.log('[SysExplore] meditate stop err:', e.message); }
            setStatus('已收功，启动系统探索', 'run');
        }
        running = true;
        persistRunning(true);
        updateMeter();
        setStatus('系统自动探索启动（脚本监控中）', 'run');
        var pName = (getPlayer() || {}).name || '';
        wecomEnqueue('🧹 开始清理', '角色：' + pName + '\n模式：系统自带');
        while (running) {
            await refreshPlayer();
            // === 全局检测 ===
            if (state.autoBreakthrough) await autoBreakthroughCheck();
            if (state.autoOriginRepair) await autoOriginRepairCheck();
            if (state.autoMasterRequests) await handleMasterRequests();
            var _sci = getSpiritInfo();
            if (_sci.player && _sci.spirit < _sci.cost) {
                if (typeof stopAutoExplore === 'function') { try { stopAutoExplore('神识不足', true); } catch(_) {} }
                if (state.autoMeditate && await meditateThenWait()) continue;
                await switchToMonitor('系统探索神识不足');
                return;
            }
            // 启动/重启系统自动探索
            console.log('[SysExplore] loop top. _autoExploreRunning=' + (typeof _autoExploreRunning !== 'undefined' ? _autoExploreRunning : 'undef'));
            if (typeof _autoExploreRunning === 'undefined' || !_autoExploreRunning) {
                // 如果还在冥想状态，先收功
                var pNow = getPlayer() || {};
                if (pNow.isMeditating) {
                    console.log('[SysExplore] still meditating before restart, stopping...');
                    try { await gameApi().post('/api/game/meditate/stop', {}); await sleep(1500); await refreshPlayer(); } catch(_) {}
                }
                // 确保游戏自带的自动探索开关是勾上的，否则 startAutoExplore 会直接 return
                var toggle = document.getElementById('autoExploreToggle');
                if (toggle && !toggle.checked) { toggle.checked = true; console.log('[SysExplore] autoExploreToggle forced on'); }
                // 清理可能阻塞自动探索的事件
                if (typeof _encounterActive !== 'undefined' && _encounterActive) {
                    console.log('[SysExplore] encounter active, handling...');
                    try { await handleSelfFightEvent(false); } catch(_) {}
                }
                if (typeof _merchantActive !== 'undefined' && _merchantActive) {
                    console.log('[SysExplore] merchant active, handling...');
                    try { await handleMerchantEvent(); } catch(_) {}
                }
                // 先调倍率再启动，避免第一发就高倍率来不及切
                applyExploreMultiplier();
                console.log('[SysExplore] calling startAutoExplore...');
                startAutoExplore();
                await sleep(3000);
                console.log('[SysExplore] after start: _autoExploreRunning=' + (typeof _autoExploreRunning !== 'undefined' ? _autoExploreRunning : 'undef'));
            }
            // 监控循环
            console.log('[SysExplore] entering monitor loop');
            while (running && typeof _autoExploreRunning !== 'undefined' && _autoExploreRunning) {
                // 每10分钟清理中通知
                if (Date.now() - _lastCleanReport > 600000) {
                    _lastCleanReport = Date.now();
                    var _rci = getSpiritInfo();
                    wecomEnqueue('🔄 清理中', '神识剩余：' + _rci.spirit + '/' + _rci.maxSpirit + '\n修为：' + getPlayerRealmStr());
                }
                try {
                    // 兜底：游戏自动探索有时卡遭遇，脚本接管
                    if (typeof _encounterActive !== 'undefined' && _encounterActive) {
                        console.log('[SysExplore] encounter stuck, script handling...');
                        if (state.aggressiveMode) { await handleEncounterEvent(); }
                        else { await handleSelfFightEvent(false); }
                        await sleep(500);
                        continue;
                    }
                    if (typeof _merchantActive !== 'undefined' && _merchantActive) {
                        console.log('[SysExplore] merchant stuck, script handling...');
                        try { await handleMerchantEvent(); } catch(_) {}
                        await sleep(500);
                        continue;
                    }
                    if (state.autoNirvanaPill) await ensureNirvanaPill();
                    if (state.autoVoidBody && !hasVoidBodyBuff()) await ensureVoidBodyBuff(false);
                    if (state.autoHiddenCharm) await ensureHiddenCharm(false);
                    if (state.sectQuickRecovery) await activeRecover();
                    if (state.autoRepair) await triggerAutoRepair(false);
                    if (state.autoNatalDevour) await triggerAutoNatalDevour(false);
                    if (state.autoBreakthrough) await autoBreakthroughCheck();
                    if (state.autoOriginRepair) await autoOriginRepairCheck();
                    if (await checkEventBlockers()) { await sleep(state.delayMs); continue; }
                    if (state.autoMasterRequests) await handleMasterRequests();
                    applyExploreMultiplier();
                } catch (_) {}
                await sleep(5000);
            }
            console.log('[SysExplore] monitor loop exited. running=' + running + ' _autoExploreRunning=' + (typeof _autoExploreRunning !== 'undefined' ? _autoExploreRunning : 'undef'));
            if (!running) break;
            var p = getPlayer() || {};
            var ci = getSpiritInfo();
            console.log('[SysExplore] stopped. dead=' + (p.isDead || window.playerDead) + ' spirit=' + ci.spirit + ' cost=' + ci.cost);
            if (p.isDead || window.playerDead) {
                setStatus('系统探索因死亡停止，尝试复活', 'warn');
                if (state.autoReviveDeath && isDeathActive()) { await handleDeathReviveEvent(false); await sleep(2000); continue; }
                setStatus('死亡，停止', 'warn'); break;
            }
            if (ci.spirit < ci.cost) {
                if (typeof stopAutoExplore === 'function') { try { stopAutoExplore('神识不足', true); } catch(_) {} }
                if (state.autoMeditate && await meditateThenWait()) continue;
                await switchToMonitor('系统探索神识不足');
                return;
            }
            console.log('[SysExplore] unknown stop, retry in 3s');
            setStatus('系统探索中断，3秒后重启', 'run');
            await sleep(3000);
            if (!running) break;
        }
        running = false;
        persistRunning(false);
        // 清理完成统计
        if (_cleanStats.explores > 0) {
            var _elapsed = Math.floor((Date.now() - _cleanStats.startTime) / 60000);
            var _realmNow = getPlayerRealmStr();
            var _lines = ['运行时长：' + _elapsed + '分钟', '探索次数：' + _cleanStats.explores, '遭遇妖兽：' + _cleanStats.combats + '次'];
            if (_cleanStats.deaths > 0) _lines.push('死亡次数：' + _cleanStats.deaths);
            if (_cleanStats.startRealm) _lines.push('修为变化：' + _cleanStats.startRealm + ' → ' + _realmNow);
            wecomEnqueue('✅ 清理结束', _lines.join('\n'));
        }
        updateMeter();
        setStatus('系统探索已停止', 'idle');
    }

    async function runLoop() {
        if (running) return;
        if (monitoringSpirit) { monitoringSpirit = false; updateMeter(); }
        if (autoInscriptionRunning) {
            setStatus('铭文洗练中，不能开始清理', 'warn');
            return;
        }
        monitoringSpirit = false;
        running = true;
        persistRunning(true);
        syncSettingsFromUi();
        applyExploreMultiplier();
        updateMeter();
        setStatus('启动中', 'run');
        if (!await checkDaoyunBeforeStart('自动清理')) {
            running = false;
            updateMeter();
            setStatus('道韵加成未确认，已取消启动', 'warn');
            return;
        }
        await stopMeditationBeforeRun();
        if (!running) return;
        setStatus('运行中', 'run');
        resetCleanStats();
        var pName = (getPlayer() || {}).name || '';
        wecomEnqueue('🧹 开始清理', '角色：' + pName);

        while (running) {
            await refreshPlayer();
            // === 全局检测 ===
            if (state.autoBreakthrough) await autoBreakthroughCheck();
            if (state.autoOriginRepair) await autoOriginRepairCheck();
            if (state.autoMasterRequests) await handleMasterRequests();
            // 每10分钟清理中通知
            if (Date.now() - _lastCleanReport > 600000) {
                _lastCleanReport = Date.now();
                var ci = getSpiritInfo();
                wecomEnqueue('🔄 清理中', '神识剩余：' + ci.spirit + '/' + ci.maxSpirit + '\n修为：' + getPlayerRealmStr());
                if (window._renderRunningMonitors) window._renderRunningMonitors();
            }

            if (await checkEventBlockers()) {
                await sleep(state.delayMs);
                continue;
            }
            var nightCheck = checkNightRestriction();
            if (nightCheck === 'meditate_until_night') {
                var nightMedStarted = false, nightMedRetries = 0, lastIsNight = isGameNight();
                while (running && !isGameNight()) {
                    var ni = getSpiritInfo();
                    if (ni.spirit < ni.maxSpirit && gameApi()) {
                        if (!nightMedStarted) {
                            setStatus('白天挂机冥想等入夜', 'run');
                            var startNRes = await gameApi().post('/api/game/meditate/start', {});
                            if (startNRes && startNRes.code === 200) {
                                if (typeof window.startMeditationUI === 'function') { try { window.startMeditationUI(); } catch (_) {} }
                                nightMedStarted = true; nightMedRetries = 0;
                            } else {
                                nightMedRetries++;
                                if (nightMedRetries <= 3) { setStatus('冥想启动失败，重试(' + nightMedRetries + '/3)', 'warn'); await sleep(3000); continue; }
                                setStatus('冥想启动失败超限，直接等待入夜', 'warn');
                            }
                        }
                    } else if (nightMedStarted) {
                        // 神识满了，停止冥想干等
                        await stopMeditationAndRefresh();
                        nightMedStarted = false;
                    }
                    await sleep(10000);
                }
                if (nightMedStarted) { setStatus('已入夜，收功', 'run'); await stopMeditationAndRefresh(); }
                setStatus('入夜了，继续探索', 'run');
                continue;
            }
            if (nightCheck) {
                await sleep(Math.max(30000, state.delayMs));
                continue;
            }

            // 探索前加成（支持失败自动降级）
            try {
                if (state.autoNirvanaPill) { await ensureNirvanaPill(); }
                if (state.autoVoidBody && !hasVoidBodyBuff()) {
                    var vOk = await ensureVoidBodyBuff(false);
                    if (!vOk) {
                        if (!hasVoidBodyFailSafe()) { await switchToMonitor('虚空淬体连续失败'); return; }
                        await sleep(state.delayMs);
                        continue;
                    }
                }
                if (state.autoHiddenCharm) {
                    var hOk = await ensureHiddenCharm(false);
                    if (!hOk) {
                        if (!hasHiddenCharmFailSafe()) { await switchToMonitor('隐秘符连续失败'); return; }
                        await sleep(state.hiddenCharmRetryMs || state.delayMs);
                        continue;
                    }
                }
            } catch (err) {
                console.warn('[LingVerse Spirit Cleaner] pre explore buff failed', err);
                setStatus('探索前加成处理异常，等待重试', 'warn');
                await sleep(state.hiddenCharmRetryMs || state.delayMs);
                continue;
            }

            // 恢复、维修、吞噬、师门
            if (state.sectQuickRecovery) await activeRecover();
            if (state.autoRepair) await triggerAutoRepair(false);
            if (state.autoNatalDevour) await triggerAutoNatalDevour(false);
            applyExploreMultiplier();

            // 神识检查 + 冥想
            var stopReason = shouldStopBeforeAction();
            if (stopReason) {
                if (stopReason === 'need_meditate') {
                    if (!await meditateThenWait()) {
                        await switchToMonitor('神识不足且无法恢复');
                        return;
                    }
                    await sleep(state.delayMs);
                    continue;
                }
                setStatus(stopReason + '，等待重试', 'warn');
                await sleep(state.delayMs);
                continue;
            }

            // 探索
            try {
                var result = await window.handleExplore();
                updateMeter();
                if (result === 'stop') {
                    await sleep(500);
                    if (!await checkEventBlockers()) {
                        await refreshPlayer();
                        var afterExplore = getSpiritInfo();
                        if (state.autoMeditate && afterExplore.player && afterExplore.spirit < afterExplore.cost) {
                            if (!await meditateThenWait()) {
                                await switchToMonitor('探索后神识不足且无法恢复');
                                return;
                            }
                            await sleep(state.delayMs);
                            continue;
                        }
                        setStatus('游戏事件触发，等待处理后重试', 'warn');
                    }
                    await sleep(state.delayMs);
                    continue;
                }
            } catch (err) {
                console.warn('[LingVerse Spirit Cleaner] explore failed', err);
                setStatus('探索异常，等待重试', 'warn');
                await sleep(state.delayMs);
                continue;
            }

            _cleanStats.explores++;
            var jitter = Math.floor(Math.random() * 350);
            await sleep(state.delayMs + jitter);
        }
    }
    function stop(reason) {
        running = false;
        persistRunning(false);
        // 清理完成统计
        if (_cleanStats.explores > 0) {
            var elapsed = Math.floor((Date.now() - _cleanStats.startTime) / 60000);
            var realmNow = getPlayerRealmStr();
            var lines = [
                '运行时长：' + elapsed + '分钟',
                '探索次数：' + _cleanStats.explores,
                '遭遇妖兽：' + _cleanStats.combats + '次',
            ];
            if (_cleanStats.deaths > 0) lines.push('死亡次数：' + _cleanStats.deaths);
            if (_cleanStats.startRealm) lines.push('修为变化：' + _cleanStats.startRealm + ' → ' + realmNow);
            wecomEnqueue('✅ 清理结束', lines.join('\n'));
        }
        wecomEnqueue('脚本停止', reason || '手动停止');
        if (loopTimer) {
            clearTimeout(loopTimer);
            loopTimer = null;
        }
        updateMeter();
        setStatus(reason || '已停止', reason ? 'warn' : 'idle');
    }

    function makePanelDraggable(panel) {
        var header = panel.querySelector('header');
        var compactBar = panel.querySelector('#lvscCompactBar');
        if (!header && !compactBar) return;
        if (header) header.style.cursor = 'move';
        if (compactBar) compactBar.style.cursor = 'move';

        var savedLeftRaw = localStorage.getItem('lvSpiritCleaner.panelLeft');
        var savedTopRaw = localStorage.getItem('lvSpiritCleaner.panelTop');
        var savedLeft = Number(savedLeftRaw);
        var savedTop = Number(savedTopRaw);
        if (savedLeftRaw !== null && savedTopRaw !== null && Number.isFinite(savedLeft) && Number.isFinite(savedTop)) {
            panel.style.left = savedLeft + 'px';
            panel.style.top = savedTop + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        }

        var dragging = false;
        var startX = 0;
        var startY = 0;
        var startLeft = 0;
        var startTop = 0;

        function dragPoint(event) {
            if (event.touches && event.touches.length) return event.touches[0];
            if (event.changedTouches && event.changedTouches.length) return event.changedTouches[0];
            return event;
        }

        function canDrag(event) {
            return !(event.target && event.target.closest && event.target.closest('button'));
        }

        function beginDrag(event) {
            if (!canDrag(event)) return;
            var point = dragPoint(event);
            dragging = true;
            var rect = panel.getBoundingClientRect();
            startX = point.clientX;
            startY = point.clientY;
            startLeft = rect.left;
            startTop = rect.top;
            panel.style.left = startLeft + 'px';
            panel.style.top = startTop + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            event.preventDefault();
        }

        function moveDrag(event) {
            if (!dragging) return;
            var point = dragPoint(event);
            var nextLeft = Math.max(0, Math.min(window.innerWidth - Math.min(panel.offsetWidth, window.innerWidth), startLeft + point.clientX - startX));
            var nextTop = Math.max(0, Math.min(window.innerHeight - 40, startTop + point.clientY - startY));
            panel.style.left = nextLeft + 'px';
            panel.style.top = nextTop + 'px';
            event.preventDefault();
        }

        function endDrag() {
            if (!dragging) return;
            dragging = false;
            var rect = panel.getBoundingClientRect();
            localStorage.setItem('lvSpiritCleaner.panelLeft', String(Math.round(rect.left)));
            localStorage.setItem('lvSpiritCleaner.panelTop', String(Math.round(rect.top)));
        }

        if (header) {
            header.addEventListener('mousedown', beginDrag);
            header.addEventListener('touchstart', beginDrag, { passive: false });
        }
        if (compactBar) {
            compactBar.addEventListener('mousedown', beginDrag);
            compactBar.addEventListener('touchstart', beginDrag, { passive: false });
        }
        document.addEventListener('mousemove', moveDrag);
        document.addEventListener('touchmove', moveDrag, { passive: false });
        document.addEventListener('mouseup', endDrag);
        document.addEventListener('touchend', endDrag);
        document.addEventListener('touchcancel', endDrag);
    }

    function clampPanelBounds(panel) {
        if (!panel || panel.classList.contains('lvsc-collapsed')) return;
        var rect = panel.getBoundingClientRect();
        var maxWidth = Math.max(300, window.innerWidth - 16);
        var maxHeight = Math.max(260, window.innerHeight - 16);
        var width = Math.min(rect.width || panel.offsetWidth, maxWidth);
        var height = Math.min(rect.height || panel.offsetHeight, maxHeight);
        panel.style.width = Math.max(300, Math.round(width)) + 'px';
        panel.style.height = Math.max(260, Math.round(height)) + 'px';

        rect = panel.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            panel.style.left = Math.max(0, window.innerWidth - rect.width - 8) + 'px';
            panel.style.right = 'auto';
        }
        if (rect.bottom > window.innerHeight) {
            panel.style.top = Math.max(0, window.innerHeight - rect.height - 8) + 'px';
            panel.style.bottom = 'auto';
        }
    }

    function restorePanelSize(panel) {
        var savedWidth = Number(localStorage.getItem('lvSpiritCleaner.panelWidth'));
        var savedHeight = Number(localStorage.getItem('lvSpiritCleaner.panelHeight'));
        if (Number.isFinite(savedWidth) && savedWidth > 0) panel.style.width = savedWidth + 'px';
        if (Number.isFinite(savedHeight) && savedHeight > 0) panel.style.height = savedHeight + 'px';
        setTimeout(function () { clampPanelBounds(panel); }, 0);
    }

    function makePanelResizable(panel) {
        var handle = panel.querySelector('#lvscResizeHandle');
        if (!handle) return;
        var resizing = false;
        var startX = 0;
        var startY = 0;
        var startWidth = 0;
        var startHeight = 0;
        var startLeft = 0;
        var startTop = 0;
        var startRight = 0;
        var startBottom = 0;

        function resizePoint(event) {
            if (event.touches && event.touches.length) return event.touches[0];
            if (event.changedTouches && event.changedTouches.length) return event.changedTouches[0];
            return event;
        }

        function beginResize(event) {
            if (panel.classList.contains('lvsc-collapsed')) return;
            var point = resizePoint(event);
            var rect = panel.getBoundingClientRect();
            resizing = true;
            startX = point.clientX;
            startY = point.clientY;
            startWidth = rect.width;
            startHeight = rect.height;
            startLeft = rect.left;
            startTop = rect.top;
            startRight = rect.right;
            startBottom = rect.bottom;
            panel.style.left = rect.left + 'px';
            panel.style.top = rect.top + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            event.preventDefault();
            event.stopPropagation();
        }

        function moveResize(event) {
            if (!resizing) return;
            var point = resizePoint(event);
            var maxWidth = Math.max(300, window.innerWidth - 16);
            var maxHeight = Math.max(260, window.innerHeight - 16);
            var nextWidth = Math.max(300, Math.min(maxWidth, startWidth + point.clientX - startX));
            var nextHeight = Math.max(260, Math.min(maxHeight, startHeight + point.clientY - startY));
            var nextLeft = startLeft;
            var nextTop = startTop;
            if (startRight > window.innerWidth - 40) nextLeft = Math.max(8, startRight - nextWidth);
            if (startBottom > window.innerHeight - 40) nextTop = Math.max(8, startBottom - nextHeight);
            if (nextLeft + nextWidth > window.innerWidth - 8) nextLeft = Math.max(8, window.innerWidth - nextWidth - 8);
            if (nextTop + nextHeight > window.innerHeight - 8) nextTop = Math.max(8, window.innerHeight - nextHeight - 8);
            panel.style.left = Math.round(nextLeft) + 'px';
            panel.style.top = Math.round(nextTop) + 'px';
            panel.style.width = Math.round(nextWidth) + 'px';
            panel.style.height = Math.round(nextHeight) + 'px';
            event.preventDefault();
        }

        function endResize() {
            if (!resizing) return;
            resizing = false;
            var rect = panel.getBoundingClientRect();
            localStorage.setItem('lvSpiritCleaner.panelWidth', String(Math.round(rect.width)));
            localStorage.setItem('lvSpiritCleaner.panelHeight', String(Math.round(rect.height)));
            localStorage.setItem('lvSpiritCleaner.panelLeft', String(Math.round(rect.left)));
            localStorage.setItem('lvSpiritCleaner.panelTop', String(Math.round(rect.top)));
        }

        handle.addEventListener('mousedown', beginResize);
        handle.addEventListener('touchstart', beginResize, { passive: false });
        document.addEventListener('mousemove', moveResize);
        document.addEventListener('touchmove', moveResize, { passive: false });
        document.addEventListener('mouseup', endResize);
        document.addEventListener('touchend', endResize);
        document.addEventListener('touchcancel', endResize);
        window.addEventListener('resize', function () { clampPanelBounds(panel); });
    }

    function clampCollapsedPanel(panel) {
        if (!panel || !panel.classList.contains('lvsc-collapsed')) return;
        var rect = panel.getBoundingClientRect();
        var nextLeft = rect.left;
        var nextTop = rect.top;
        if (!Number.isFinite(nextLeft) || !Number.isFinite(nextTop)) {
            nextLeft = window.innerWidth - Math.min(420, window.innerWidth - 16) - 8;
            nextTop = window.innerHeight - 48;
        }
        if (rect.right > window.innerWidth - 8) nextLeft = window.innerWidth - rect.width - 8;
        if (rect.bottom > window.innerHeight - 8) nextTop = window.innerHeight - rect.height - 8;
        if (nextLeft < 8) nextLeft = 8;
        if (nextTop < 8) nextTop = 8;
        panel.style.left = Math.round(nextLeft) + 'px';
        panel.style.top = Math.round(nextTop) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    }

    function setPanelCollapsed(panel, collapsed) {
        if (collapsed && !panel.classList.contains('lvsc-collapsed')) {
            var rect = panel.getBoundingClientRect();
            localStorage.setItem('lvSpiritCleaner.panelLeft', String(Math.round(rect.left)));
            localStorage.setItem('lvSpiritCleaner.panelTop', String(Math.round(rect.top)));
        }
        panel.classList.toggle('lvsc-collapsed', collapsed);
        localStorage.setItem('lvSpiritCleaner.collapsed', collapsed ? '1' : '0');
        var btn = document.getElementById('lvscCollapseBtn');
        var expandBtn = document.getElementById('lvscExpandBtn');
        if (btn) btn.textContent = collapsed ? '展开' : '收起';
        if (expandBtn) expandBtn.textContent = collapsed ? '展开' : '收起';
        if (collapsed) setTimeout(function () { clampCollapsedPanel(panel); }, 0);
    }

    function escapeLocalHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function simpleHash(text) {
        var hash = 0;
        text = String(text || '');
        for (var i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(36);
    }

    function compareVersion(a, b) {
        var pa = String(a || '').replace(/^v/i, '').split(/[.-]/);
        var pb = String(b || '').replace(/^v/i, '').split(/[.-]/);
        var len = Math.max(pa.length, pb.length);
        for (var i = 0; i < len; i++) {
            var na = parseInt(pa[i] || '0', 10);
            var nb = parseInt(pb[i] || '0', 10);
            if (!Number.isFinite(na)) na = 0;
            if (!Number.isFinite(nb)) nb = 0;
            if (na > nb) return 1;
            if (na < nb) return -1;
        }
        return 0;
    }

    function normalizeNotes(notes) {
        if (Array.isArray(notes)) {
            return notes.map(function (item) {
                if (typeof item === 'string') return item;
                return item && (item.text || item.title || item.desc || item.description) || '';
            }).filter(Boolean);
        }
        if (typeof notes === 'string') {
            return notes.split(/\r?\n/).map(function (line) {
                return line.replace(/^[-*]\s*/, '').trim();
            }).filter(Boolean);
        }
        return [];
    }

    function normalizeReleaseData(rawText, sourceUrl) {
        var data = null;
        try { data = JSON.parse(rawText); } catch (_) {}
        if (data) {
            var notes = normalizeNotes(data.notes || data.changes || data.releaseNotes);
            var changelog = null;
            if (Array.isArray(data.changelog)) {
                changelog = data.changelog.map(function (entry) {
                    return {
                        version: entry.version || '',
                        title: entry.title || '',
                        notes: normalizeNotes(entry.notes || [])
                    };
                });
            }
            return {
                version: String(data.version || data.latestVersion || data.tag || '').replace(/^v/i, ''),
                title: data.title || data.name || '',
                notes: notes,
                changelog: changelog,
                downloadUrl: data.downloadUrl || data.url || data.updateUrl || '',
                sourceUrl: sourceUrl || ''
            };
        }

        var versionMatch = String(rawText || '').match(/@version\s+([^\s]+)/);
        var changelog = [];
        String(rawText || '').replace(/^\/\/\s*@changelog\s+(.+)$/mg, function (_, line) {
            changelog.push(line.trim());
            return '';
        });
        return {
            version: versionMatch ? versionMatch[1].replace(/^v/i, '') : '',
            title: '云端脚本更新',
            notes: changelog,
            downloadUrl: sourceUrl || '',
            sourceUrl: sourceUrl || ''
        };
    }

    function versionedInstallUrl(release) {
        // 始终用 Gitee 国内直连，不用 GitHub
        var v = String((release && release.version) || '').trim();
        var url = 'https://gitee.com/wanoujj/lingverse-spirit-cleaner/raw/main/lingverse-spirit-cleaner.user.js';
        if (v) url += '?v=' + encodeURIComponent(v);
        return url;
    }

    function copyTextToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        var input = document.createElement('textarea');
        input.value = text;
        input.style.position = 'fixed';
        input.style.left = '-9999px';
        document.body.appendChild(input);
        input.select();
        try { document.execCommand('copy'); } finally { input.remove(); }
        return Promise.resolve();
    }

    function showUpdateNotice(release, options) {
        release = release || BUILTIN_RELEASE;
        options = options || {};
        var old = document.getElementById('lvscUpdateModal');
        if (old) old.remove();

        var rawNotes = normalizeNotes(release.notes);
        if (!rawNotes.length) rawNotes = ['暂无详细变更说明。'];

        var changelog = Array.isArray(release.changelog) ? release.changelog : (Array.isArray(release.history) ? release.history : (typeof BUILTIN_CHANGELOG !== 'undefined' ? BUILTIN_CHANGELOG : []));
        var changelogHtml = '';
        if (changelog.length > 0) {
            changelogHtml = '<div class="lvsc-changelog">';
            changelogHtml += '<div class="lvsc-changelog-title">历史公告</div>';
            for (var c = 0; c < changelog.length; c++) {
                var entry = changelog[c];
                var entryNotes = normalizeNotes(entry.notes || entry.changes || []);
                changelogHtml += '<div class="lvsc-changelog-entry">';
                changelogHtml += '<div class="lvsc-changelog-entry__head"><span class="lvsc-changelog-entry__ver">v' + escapeLocalHtml(entry.version || '-') + '</span>';
                if (entry.title) changelogHtml += '<span class="lvsc-changelog-entry__title">' + escapeLocalHtml(entry.title.replace(/^神识清理\s*v?[\d.]+/, '').trim()) + '</span>';
                changelogHtml += '</div>';
                changelogHtml += '<ul>' + entryNotes.map(function (n) { return '<li>' + escapeLocalHtml(n) + '</li>'; }).join('') + '</ul>';
                changelogHtml += '</div>';
            }
            changelogHtml += '</div>';
        }

        var installUrl = versionedInstallUrl(release);
        var modal = document.createElement('div');
        modal.id = 'lvscUpdateModal';
        modal.innerHTML =
            '<div class="lvsc-update-backdrop"></div>' +
            '<div class="lvsc-update-card">' +
            '<div class="lvsc-update-kicker">' + escapeLocalHtml(options.kicker || '更新公告') + '</div>' +
            '<div class="lvsc-update-title">' + escapeLocalHtml(release.title || ('神识清理 v' + release.version)) + '</div>' +
            '<div class="lvsc-update-version">当前 ' + escapeLocalHtml(SCRIPT_VERSION) + ' · 最新 ' + escapeLocalHtml(release.version || '-') + '</div>' +
            '<div class="lvsc-update-section-label">本次更新</div>' +
            '<ul>' + rawNotes.map(function (note) { return '<li>' + escapeLocalHtml(note) + '</li>'; }).join('') + '</ul>' +
            changelogHtml +
            (installUrl ? '<div class="lvsc-update-actions"><a class="lvsc-update-link" href="' + escapeLocalHtml(installUrl) + '" target="_blank" rel="noopener">打开安装页</a><button id="lvscUpdateCopyBtn">复制更新地址</button></div>' : '') +
            '<button id="lvscUpdateCloseBtn">知道了</button>' +
            '</div>';
        document.body.appendChild(modal);
        modal.style.zIndex = String(UPDATE_MODAL_Z_INDEX);

        var copyBtn = document.getElementById('lvscUpdateCopyBtn');
        if (copyBtn && installUrl) {
            copyBtn.onclick = function () {
                copyTextToClipboard(installUrl).then(function () {
                    copyBtn.textContent = '已复制';
                }).catch(function () {
                    copyBtn.textContent = '复制失败';
                });
            };
        }
        document.getElementById('lvscUpdateCloseBtn').onclick = function () {
            if (options.seenKey) localStorage.setItem(options.seenKey, String(release.version || SCRIPT_VERSION));
            modal.remove();
        };
    }

    function showBuiltinReleaseOnce() {
        var key = 'lvSpiritCleaner.seenBuiltinVersion';
        if (localStorage.getItem(key) === SCRIPT_VERSION) return;
        setTimeout(function () {
            showUpdateNotice(BUILTIN_RELEASE, { seenKey: key, kicker: '本地脚本已更新' });
        }, 900);
    }

    async function checkCloudUpdate(manual) {
        if (checkingCloudUpdate) return false;
        // 屏蔽更新时只有手动检查才执行
        if (!manual && localStorage.getItem('lvSpiritCleaner.updateMuted') === '1') return false;
        syncSettingsFromUi();
        checkingCloudUpdate = true;
        try {
            if (manual) setStatus('检测云端更新中', 'run');

            var release = null;
            var baseUrl = state.updateManifestUrl || DEFAULT_UPDATE_MANIFEST_URL;
            var urls = [baseUrl];
            // 回退：online-server + GitHub + jsDelivr
            urls.push((state.onlineStatsEndpoint || DEFAULT_ONLINE_STATS_ENDPOINT).replace('/api/heartbeat', '/api/version'));
            urls.push('https://raw.githubusercontent.com/' + GITHUB_REPO_SLUG + '/main/release.json?v=' + SCRIPT_VERSION);
            urls.push('https://cdn.jsdelivr.net/gh/' + GITHUB_REPO_SLUG + '@main/release.json?v=' + SCRIPT_VERSION);

            for (var u = 0; u < urls.length; u++) {
                try {
                    var controller = new AbortController();
                    var timer = setTimeout(function () { controller.abort(); }, CLOUD_UPDATE_TIMEOUT_MS);
                    var sep = urls[u].indexOf('?') >= 0 ? '&' : '?';
                    var res = await fetch(urls[u] + sep + '_lvsc=' + Date.now(), { cache: 'no-store', signal: controller.signal });
                    clearTimeout(timer);
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    var text = await res.text();
                    release = normalizeReleaseData(text, urls[u]);
                    if (release.version) break;
                } catch (fetchErr) {
                    console.warn('[LingVerse Spirit Cleaner] CDN fetch failed: ' + urls[u], fetchErr.message || fetchErr);
                }
            }

            if (!release || !release.version) {
                if (manual) setStatus('云端公告获取失败，请检查网络或公告地址', 'warn');
                return;
            }

            var newer = compareVersion(release.version, SCRIPT_VERSION) > 0;
            var seenKey = 'lvSpiritCleaner.seenCloudVersion';
            // 同一版本已经点过"知道了"就不再弹
            if (newer && localStorage.getItem(seenKey) === release.version) newer = false;
            if (newer) {
                if (!document.getElementById('lvscUpdateModal')) {
                    showUpdateNotice(release, { seenKey: seenKey, kicker: '发现云端新版' });
                }
                setStatus('发现云端新版：' + release.version, 'warn');
                wecomEnqueue('脚本新版', '神识清理 v' + release.version + ' 已发布，当前 v' + SCRIPT_VERSION);
            } else if (manual) {
                showUpdateNotice(release, { kicker: newer ? '云端新版' : '云端公告' });
                setStatus(newer ? '云端有新版本 ' + release.version : '当前已是最新：' + SCRIPT_VERSION, newer ? 'warn' : 'run');
            }
        } catch (err) {
            console.warn('[LingVerse Spirit Cleaner] cloud update check failed', err);
            if (manual) setStatus('云端更新检测失败：' + (err.message || '未知错误'), 'warn');
        } finally {
            checkingCloudUpdate = false;
        }
    }

    // --- 在线公告拉取 ---
    var _lastAnnounceSeen = localStorage.getItem('lvSpiritCleaner.lastAnnounceId') || '';
    async function checkAnnounce() {
        try {
            var endpoint = (state.onlineStatsEndpoint || DEFAULT_ONLINE_STATS_ENDPOINT).replace('/api/heartbeat', '/api/announce');
            var res = await fetch(endpoint, { headers: { 'ngrok-skip-browser-warning': 'true' } });
            if (!res.ok) return;
            var data = await res.json();
            if (!data || !data.active || !data.message) return;
            if (data.id && data.id === _lastAnnounceSeen) return;
            showAnnounceModal(data);
        } catch (_) {}
    }
    function showAnnounceModal(data) {
        // 移除旧弹窗
        var old = document.getElementById('lvscAnnounceModal');
        if (old) old.remove();
        var modal = document.createElement('div');
        modal.id = 'lvscAnnounceModal';
        var title = data.title || '📢 来自作者的公告';
        var msg = (data.message || '').replace(/\n/g, '<br>');
        modal.innerHTML =
            '<div style="position:fixed;inset:0;z-index:2147483003;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center">' +
            '<div style="background:#1e1b2a;border:2px solid #dbb970;border-radius:12px;padding:24px;max-width:420px;width:90%;color:#cfc6b2;font-size:14px;box-shadow:0 0 40px rgba(219,185,112,.2)">' +
            '<div style="font-size:18px;font-weight:700;color:#dbb970;margin-bottom:12px">' + title + '</div>' +
            '<div style="line-height:1.8;margin-bottom:20px">' + msg + '</div>' +
            '<button id="lvscAnnounceClose" style="width:100%;height:40px;background:#dbb970;color:#17141d;border:0;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer">我知道了</button>' +
            '</div></div>';
        document.body.appendChild(modal);
        document.getElementById('lvscAnnounceClose').onclick = function() {
            modal.remove();
            if (data.id) {
                _lastAnnounceSeen = data.id;
                localStorage.setItem('lvSpiritCleaner.lastAnnounceId', data.id);
            }
        };
    }

    function activatePanelTab(tabName) {
        var allowed = ['explore','fight','equip','merchant','auto','inscription','craft','update','basic','combat','flow'];
        if (allowed.indexOf(tabName) < 0) tabName = 'explore';
        Array.prototype.forEach.call(document.querySelectorAll('#lvscTabs .lvsc-tab'), function (button) {
            var active = button.getAttribute('data-tab') === tabName;
            button.classList.toggle('lvsc-active', active);
            button.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        Array.prototype.forEach.call(document.querySelectorAll('.lvsc-tab-panel'), function (panel) {
            panel.classList.toggle('lvsc-active', panel.getAttribute('data-tab-panel') === tabName);
        });
        localStorage.setItem('lvSpiritCleaner.activeTab', tabName);
    }

    function applyChatZIndex(enabled) {
        var styleId = 'lvscChatZIndex';
        var existing = document.getElementById(styleId);
        if (enabled) {
            if (!existing) {
                var style = document.createElement('style');
                style.id = styleId;
                style.textContent = '#inlineChat{z-index:' + (PANEL_Z_INDEX - 100) + '!important}';
                (document.head || document.documentElement).appendChild(style);
            }
        } else {
            if (existing) existing.remove();
        }
    }

    // 排序列表构建 (回血/回灵顺序)
    var SORT_CN_MAP = { 'mp': '灵力', 'pill': '丹药', 'sect': '宗门', 'adpoint': '仙缘', 'stone': '灵石' };
    var SORT_EN_MAP = { '灵力': 'mp', '丹药': 'pill', '宗门': 'sect', '仙缘': 'adpoint', '灵石': 'stone' };

    function buildSortList(id, items) {
        var current = (id === 'hp' ? state.autoHpPriority : state.autoMpPriority) || '';
        var enabled = current.split(',').map(function(s){return SORT_EN_MAP[s.trim()] || s.trim();}).filter(Boolean);
        var order = {};
        for (var i = 0; i < enabled.length; i++) order[enabled[i]] = i;
        var nextOrder = enabled.length;
        var html = '<div class="sort-list" id="sortList_' + id + '">';
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var checked = order[it.key] !== undefined;
            var pos = checked ? order[it.key] : nextOrder++;
            html += '<div class="sort-row" data-key="' + it.key + '" data-order="' + pos + '">';
            html += '<label class="lvsc-check sort-check"><input type="checkbox" class="sort-cb" id="lvscSort_' + id + '_' + it.key + '" ' + (checked ? 'checked' : '') + ' onchange="window._sortRebuild(\x27' + id + '\x27)">' + it.label + '</label>';
            html += '<span class="sort-desc">' + (it.desc || '') + '</span>';
            html += '<button class="sort-btn sort-up" onclick="window._sortMove(\x27' + id + '\x27,\x27' + it.key + '\x27,-1)">▲</button>';
            html += '<button class="sort-btn sort-dn" onclick="window._sortMove(\x27' + id + '\x27,\x27' + it.key + '\x27,1)">▼</button>';
            html += '</div>';
        }
        html += '</div>';
        var val = enabled.join(',');
        html += '<input type="hidden" id="lvscAuto' + (id === 'hp' ? 'H' : 'M') + 'pPriority" value="' + val + '">';
        return html;
    }

    function sortRebuild(id) {
        var list = document.getElementById('sortList_' + id);
        if (!list) return;
        var rows = list.querySelectorAll('.sort-row');
        var parts = [];
        // Sort rows by data-order
        var sorted = [];
        for (var i = 0; i < rows.length; i++) sorted.push(rows[i]);
        sorted.sort(function(a,b){return (a.getAttribute('data-order')|0)-(b.getAttribute('data-order')|0);});
        for (var i = 0; i < sorted.length; i++) {
            var cb = sorted[i].querySelector('.sort-cb');
            if (cb && cb.checked) parts.push(sorted[i].getAttribute('data-key'));
        }
        // Convert English keys to Chinese for storage
        var cnParts = [];
        for (var p = 0; p < parts.length; p++) cnParts.push(SORT_CN_MAP[parts[p]] || parts[p]);
        var val = cnParts.join(',');
        var hid = document.getElementById('lvscAuto' + (id === 'hp' ? 'H' : 'M') + 'pPriority');
        if (hid) hid.value = val;
        // Also update state immediately
        if (id === 'hp') state.autoHpPriority = val;
        else state.autoMpPriority = val;
        syncSettingsFromUi();
    }

    function sortMove(id, key, delta) {
        var list = document.getElementById('sortList_' + id);
        if (!list) return;
        var rows = list.querySelectorAll('.sort-row');
        // Collect rows with their data-order
        var arr = [];
        for (var i = 0; i < rows.length; i++) arr.push({ el: rows[i], order: rows[i].getAttribute('data-order')|0, key: rows[i].getAttribute('data-key') });
        // Find the target
        for (var i = 0; i < arr.length; i++) {
            if (arr[i].key === key) {
                var newOrder = arr[i].order + delta;
                // Find existing item at newOrder and swap
                for (var j = 0; j < arr.length; j++) {
                    if (j !== i && arr[j].order === newOrder) { arr[j].order = arr[i].order; break; }
                }
                arr[i].order = Math.max(0, newOrder);
                break;
            }
        }
        // Apply new orders to DOM
        arr.sort(function(a,b){return a.order-b.order;});
        for (var i = 0; i < arr.length; i++) {
            arr[i].el.setAttribute('data-order', i);
            // Move element in DOM to match
            list.appendChild(arr[i].el);
        }
        sortRebuild(id);
    }

    window._sortRebuild = sortRebuild;
    window._sortMove = sortMove;

    // 从游戏地图弹窗抓取区域名+ID（地图打开时 .map-node 才存在）
    var _cachedAreaNames = [];
    var _areaNameToId = {};  // 地名 → areaId 映射
    function scanMapNodes() {
        var names = [];
        var nodes = document.querySelectorAll('.map-node[data-map-area-id]');
        for (var i = 0; i < nodes.length; i++) {
            var areaId = nodes[i].getAttribute('data-map-area-id') || nodes[i].getAttribute('data-area-id') || '';
            var t = (nodes[i].textContent || '').replace(/[\s\d①②③④⑤⑥⑦⑧⑨⑩★☆⚔🛡]+/g, ' ').trim();
            // 去掉地名尾部的标签（渡劫/传送/飞升/突破等）
            t = t.replace(/(渡劫|传送|飞升|轮回|天劫|雷劫|突破|修炼|入道|道场|宗门|师门|返回).*$/, '').trim();
            var m = t.match(/^[一-鿿]{2,6}/);
            if (m && areaId) {
                names.push(m[0]);
                _areaNameToId[m[0]] = areaId;
            }
        }
        if (names.length) {
            _cachedAreaNames = names;
            localStorage.setItem('lvSpiritCleaner.areaNameToId', JSON.stringify(_areaNameToId));
        }
        return names;
    }

    function findGameAreaOptions() {
        if (_cachedAreaNames.length) return _cachedAreaNames.slice();
        var scanned = scanMapNodes();
        if (scanned.length) return scanned;
        var sel = document.getElementById('exploreArea') || document.querySelector('select[name="area"]');
        if (sel && sel.options) {
            var result = [];
            for (var oi = 0; oi < sel.options.length; oi++) {
                var txt = String(sel.options[oi].text || '').trim();
                if (txt) result.push(txt);
            }
            if (result.length > 1) return result;
        }
        return [];
    }

    // 单字段 onchange 工具函数（读UI → 更新state → 只写一个localStorage key）
    function numVal(id) { var el = document.getElementById(id); return Number(el && el.value || 0); }
    function strVal(id) { var el = document.getElementById(id); return String(el && el.value || '').trim(); }
    function chkVal(id) { var el = document.getElementById(id); return !!(el && el.checked); }

    function onNum(id, stateKey, minVal, maxVal) {
        var el = document.getElementById(id);
        if (!el) return;
        el.onchange = function () {
            state[stateKey] = Math.max(minVal, Math.min(maxVal || Infinity, numVal(id)));
            persistSetting('lvSpiritCleaner.' + stateKey, String(state[stateKey]));
        };
    }
    function onChk(id, stateKey) {
        var el = document.getElementById(id);
        if (!el) return;
        el.onchange = function () {
            state[stateKey] = chkVal(id);
            persistSetting('lvSpiritCleaner.' + stateKey, state[stateKey]);
        };
    }
    function onStr(id, stateKey) {
        var el = document.getElementById(id);
        if (!el) return;
        el.onchange = function () {
            state[stateKey] = strVal(id);
            persistSetting('lvSpiritCleaner.' + stateKey, state[stateKey]);
        };
    }
    function onSel(id, stateKey, validList) {
        var el = document.getElementById(id);
        if (!el) return;
        el.onchange = function () {
            var v = strVal(id);
            state[stateKey] = validList.indexOf(v) >= 0 ? v : validList[0];
            persistSetting('lvSpiritCleaner.' + stateKey, state[stateKey]);
        };
    }
    function onNumAlt(id, stateKey, storageKey, minVal, maxVal) {
        var el = document.getElementById(id);
        if (!el) return;
        el.onchange = function () {
            state[stateKey] = Math.max(minVal, Math.min(maxVal || Infinity, numVal(id)));
            persistSetting(storageKey, String(state[stateKey]));
        };
    }
    function onChkAlt(id, stateKey, storageKey) {
        var el = document.getElementById(id);
        if (!el) return;
        el.onchange = function () {
            state[stateKey] = chkVal(id);
            persistSetting(storageKey, state[stateKey]);
        };
    }

    function buildPanel() {
        var oldPanel = document.getElementById('lvscPanel');
        if (oldPanel) oldPanel.remove();

        var oldStyle = document.getElementById('lvscStyle');
        if (oldStyle) oldStyle.remove();

        var style = document.createElement('style');
        style.id = 'lvscStyle';
        style.textContent = [
            '#lvscPanel{position:fixed;right:18px;bottom:18px;z-index:' + PANEL_Z_INDEX + ';width:min(460px,calc(100vw - 36px));height:min(720px,calc(100vh - 36px));min-width:300px;min-height:260px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);display:flex;flex-direction:column;background:rgba(17,20,29,.94);color:#f5f1e8;border:1px solid rgba(219,185,112,.45);box-shadow:0 16px 48px rgba(0,0,0,.38);border-radius:10px;font:13px/1.45 "Microsoft YaHei",sans-serif;overflow:hidden;resize:none;touch-action:none;container-type:inline-size}',
            '#lvscPanel header{display:flex;align-items:center;justify-content:space-between;flex:0 0 auto;padding:10px 12px;background:rgba(219,185,112,.12);font-weight:700}',
            '#lvscTitle{display:flex;align-items:center;gap:8px;min-width:0}',
            '#lvscTitleText{white-space:nowrap}',
            '#lvscHeaderActions{display:flex;align-items:center;gap:6px}',
            '#lvscPanel button{border:0;border-radius:6px;cursor:pointer;font-weight:700}',
            '#lvscClose,#lvscCollapseBtn,#lvscExpandBtn{height:28px;background:rgba(255,255,255,.08);color:#f5f1e8;border:1px solid rgba(255,255,255,.1)!important}',
            '#lvscClose{width:28px}',
            '#lvscCollapseBtn,#lvscExpandBtn{padding:0 8px}',
            '#lvscStatus{flex:0 0 auto;margin:0;padding:8px 12px;border-top:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08);background:rgba(155,231,195,.08);font-size:12px;color:#cfc6b2;min-height:18px;white-space:normal;overflow-wrap:anywhere}',
            '#lvscStatus[data-tone=run]{color:#9be7c3;background:rgba(155,231,195,.11)}',
            '#lvscStatus[data-tone=warn]{color:#ffd166;background:rgba(255,209,102,.11)}',
            '#lvscBody{flex:1 1 auto;min-height:0;padding:12px;display:flex;flex-direction:column;gap:10px;overflow:auto}',
            '#lvscCompactBar{display:none;align-items:center;gap:8px;flex:0 0 auto;padding:8px 10px;min-width:0}',
            '#lvscCompactSpirit{color:#d8b4fe;white-space:nowrap;font-size:12px}',
            '#lvscCompactStatus{flex:1;min-width:76px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#cfc6b2}',
            '#lvscCompactStatus[data-tone=run]{color:#9be7c3}',
            '#lvscCompactStatus[data-tone=warn]{color:#ffd166}',
            '#lvscCompactRunBtn,#lvscCompactMonitorBtn{height:30px;min-width:52px;background:#dbb970;color:#17141d}',
            '#lvscCompactMonitorBtn{background:rgba(155,231,195,.16);color:#9be7c3;border:1px solid rgba(155,231,195,.28)!important}',
            '#lvscPanel.lvsc-collapsed{width:min(520px,calc(100vw - 16px))!important;height:auto!important;min-width:0;min-height:0;max-width:96vw;overflow:hidden;border-radius:999px}',
            '#lvscPanel.lvsc-collapsed header{display:none}',
            '#lvscPanel.lvsc-collapsed #lvscStatus{display:none}',
            '#lvscPanel.lvsc-collapsed #lvscBody{display:none}',
            '#lvscPanel.lvsc-collapsed #lvscActions{display:none}',
            '#lvscPanel.lvsc-collapsed #lvscCompactBar{display:flex}',
            '#lvscPanel.lvsc-collapsed #lvscResizeHandle{display:none}',
            '#lvscPanel label{display:grid;gap:4px;min-width:0;color:#cfc6b2;font-size:12px}',
            '#lvscPanel input[type=number],#lvscPanel input[type=text],#lvscPanel select{width:100%;height:29px;border-radius:6px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;padding:0 8px;font-size:12px}',
            '#lvscPanel input[type=checkbox]{margin-right:6px}',
            '#lvscPanel select option{background:#17141d;color:#fff}',
            '.lvsc-meter{display:grid;gap:7px;padding:9px;border:1px solid rgba(216,180,254,.2);border-radius:8px;background:rgba(216,180,254,.05)}',
            '#lvscTabs{position:sticky;top:-12px;z-index:3;display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:6px;margin:-2px -2px 0;padding:4px 2px 6px;background:rgba(17,20,29,.96);border-bottom:1px solid rgba(255,255,255,.08)}',
            '.lvsc-tab{height:30px;padding:0 6px;background:rgba(255,255,255,.06);color:#cfc6b2;border:1px solid rgba(255,255,255,.1)!important;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '.lvsc-tab.lvsc-active{background:#dbb970;color:#17141d;border-color:#dbb970!important}',
            '.lvsc-category{display:grid;gap:9px;min-width:0;padding:10px;border:1px solid rgba(219,185,112,.16);border-radius:9px;background:rgba(255,255,255,.025)}',
            '.lvsc-tab-panel{display:none}',
            '.lvsc-tab-panel.lvsc-active{display:grid}',
            '.lvsc-category-title{display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:800;color:#dbb970;letter-spacing:0}',
            '.lvsc-category-title small{font-size:11px;font-weight:600;color:#9be7c3}',
            '.lvsc-field-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(156px,100%),1fr));gap:8px;align-items:end}',
            '.lvsc-card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(238px,100%),1fr));gap:9px;align-items:start}',
            '.lvsc-section{display:grid;align-content:start;gap:8px;min-width:0;padding:9px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:rgba(255,255,255,.035)}',
            '.lvsc-section-title,.lvsc-section-title-row>span{font-weight:700;color:#dbb970}',
            '.lvsc-section-title-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}',
            '.lvsc-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr));gap:8px}',
            '.lvsc-span2{grid-column:1 / -1}',
            '.lvsc-help{font-size:11px;color:#cfc6b2;opacity:.82;line-height:1.45}',
            '.sort-list{display:grid;gap:3px;margin:4px 0}',
            '.sort-row{display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:4px;background:rgba(255,255,255,.03)}',
            '.sort-check{flex:1;min-width:0;display:flex!important;align-items:center!important;gap:4px!important}',
            '.sort-desc{font-size:10px;color:#8f846f;margin-left:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '.sort-btn{width:22px;height:18px;padding:0;background:rgba(255,255,255,.06);color:#cfc6b2;border:1px solid rgba(255,255,255,.1)!important;border-radius:3px!important;font-size:9px;cursor:pointer;line-height:1;text-align:center;flex-shrink:0}',
            '.lvsc-check{display:flex!important;align-items:center;gap:0;line-height:1.35;font-size:12px}',
            '#lvscSpiritTrack{height:8px;background:rgba(255,255,255,.12);border-radius:999px;overflow:hidden}',
            '#lvscSpiritFill{height:100%;width:0;background:linear-gradient(90deg,#8667ff,#d8b4fe)}',
            '#lvscSpiritValue{font-size:12px;color:#d8b4fe}',
            '#lvscAuthor{font-size:11px;color:#8f846f;text-align:center;border-top:1px solid rgba(255,255,255,.08);padding-top:8px;display:flex;align-items:center;justify-content:center;gap:10px}',
            '#lvscFeedbackBtn{background:rgba(216,180,254,.12);color:#d8b4fe;border:1px solid rgba(216,180,254,.2)!important;font-size:11px;padding:2px 10px;cursor:pointer;border-radius:4px!important;height:auto!important}',
            '#lvscFeedbackBtn:hover{background:rgba(216,180,254,.22)}',
            '.lvsc-fb-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.55)}',
            '.lvsc-fb-card{position:relative;width:min(380px,calc(100vw - 28px));background:rgba(17,20,29,.98);border:1px solid rgba(219,185,112,.4);border-radius:10px;padding:18px;color:#f5f1e8;box-shadow:0 16px 48px rgba(0,0,0,.45)}',
            '.lvsc-fb-title{font-size:15px;font-weight:700;color:#dbb970;margin-bottom:12px}',
            '.lvsc-fb-textarea{width:100%;min-height:100px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:6px;color:#f5f1e8;font:13px/1.5 "Microsoft YaHei",sans-serif;padding:10px;resize:vertical;box-sizing:border-box}',
            '.lvsc-fb-textarea::placeholder{color:#8f846f}',
            '.lvsc-fb-actions{display:flex;gap:8px;margin-top:12px;justify-content:flex-end}',
            '.lvsc-fb-btn{height:32px;padding:0 16px;border-radius:6px;cursor:pointer;font-weight:700;font-size:13px;border:0}',
            '.lvsc-fb-cancel{background:rgba(255,255,255,.08);color:#cfc6b2;border:1px solid rgba(255,255,255,.12)!important}',
            '.lvsc-fb-send{background:#dbb970;color:#17141d}',
            '#lvscActions{flex:0 0 auto;display:flex;gap:8px;padding:10px 12px 12px;background:linear-gradient(180deg,rgba(17,20,29,.9),rgba(17,20,29,.98));border-top:1px solid rgba(255,255,255,.08)}',
            '#lvscRunBtn{flex:1;height:34px;background:#dbb970;color:#17141d}',
            '#lvscRefreshBtn{width:72px;height:34px;background:rgba(255,255,255,.08);color:#f5f1e8;border:1px solid rgba(255,255,255,.12)!important}',
            '#lvscMonitorBtn{height:34px;background:rgba(155,231,195,.16);color:#9be7c3;border:1px solid rgba(155,231,195,.28)!important}',
            '#lvscAutoTrialBtn,#lvscAutoTreasureBtn{height:34px;background:rgba(216,180,254,.14);color:#d8b4fe;border:1px solid rgba(216,180,254,.28)!important}',
            '#lvscSelfFightBtn,#lvscAutoRecoveryBtn,#lvscSectRecoveryBtn,#lvscRepairBtn,#lvscRecruitBtn,#lvscVoidBodyBtn,#lvscHiddenCharmBtn,#lvscCheckUpdateBtn,#lvscNatalDevourBtn,#lvscWecomTestBtn,#lvscCaptureSpiritSet,#lvscCaptureCombatSet,#lvscReportBtn,#lvscUnmuteUpdateBtn,#lvscFarmStartBtn,#lvscStartTalismanBtn,#lvscSweepStartBtn{height:32px;background:rgba(155,231,195,.16);color:#9be7c3;border:1px solid rgba(155,231,195,.28)!important;border-radius:6px;cursor:pointer;font-weight:700}',
            '#lvscAutoInscriptionBtn{height:34px;background:rgba(216,180,254,.14);color:#d8b4fe;border:1px solid rgba(216,180,254,.28)!important}',
            '#lvscInscriptionStats{font-size:12px;color:#9be7c3}',
            '#lvscInscriptionLog,#lvscRecruitLog{min-height:130px;max-height:190px;overflow:auto;white-space:pre-wrap;font-size:11px;color:#cfc6b2;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:8px}',
            '#lvscAutoRecoveryBtn{align-self:end}',
            '#lvscUpdateModal{position:fixed;inset:0;z-index:' + UPDATE_MODAL_Z_INDEX + ';color:#f5f1e8;font:13px/1.55 "Microsoft YaHei",sans-serif}',
            '.lvsc-update-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(2px)}',
            '.lvsc-update-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(420px,calc(100vw - 28px));max-height:82vh;overflow:auto;padding:18px;border-radius:12px;background:rgba(17,20,29,.98);border:1px solid rgba(219,185,112,.5);box-shadow:0 18px 60px rgba(0,0,0,.55)}',
            '.lvsc-update-kicker{font-size:12px;color:#dbb970;font-weight:700;margin-bottom:4px}',
            '.lvsc-update-title{font-size:18px;font-weight:800;margin-bottom:2px}',
            '.lvsc-update-version{font-size:12px;color:#9be7c3;margin-bottom:12px}',
            '.lvsc-update-card ul{margin:0 0 14px 18px;padding:0;color:#e9dfcf}',
            '.lvsc-update-card li{margin:6px 0}',
            '.lvsc-update-section-label{font-size:11px;font-weight:700;color:#dbb970;margin:10px 0 4px;text-transform:uppercase;letter-spacing:1px}',
            '.lvsc-changelog{margin-top:14px;border-top:1px solid rgba(219,185,112,.2);padding-top:12px}',
            '.lvsc-changelog-title{font-size:13px;font-weight:700;color:#dbb970;margin-bottom:10px}',
            '.lvsc-changelog-entry{margin-bottom:10px;padding:8px 10px;border-radius:6px;background:rgba(255,255,255,.03)}',
            '.lvsc-changelog-entry__head{display:flex;align-items:center;gap:8px;margin-bottom:2px}',
            '.lvsc-changelog-entry__ver{font-size:11px;font-weight:700;color:#d8b4fe;background:rgba(216,180,254,.12);padding:1px 6px;border-radius:4px}',
            '.lvsc-changelog-entry__title{font-size:11px;color:#cfc6b2}',
            '.lvsc-changelog-entry ul{margin:4px 0 0 16px!important;padding:0!important}',
            '.lvsc-changelog-entry li{font-size:11px;color:#9b927f!important;margin:3px 0!important}',
            '.lvsc-update-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}',
            '.lvsc-update-link,#lvscUpdateCopyBtn{display:flex;align-items:center;justify-content:center;min-height:34px;border-radius:7px;text-decoration:none;border:1px solid rgba(216,180,254,.28)!important;background:rgba(216,180,254,.12);color:#d8b4fe;font-weight:700}',
            '#lvscUpdateCloseBtn{width:100%;height:34px;background:#dbb970;color:#17141d}',
            '#lvscResizeHandle{position:absolute;right:3px;bottom:3px;z-index:5;width:18px;height:18px;cursor:nwse-resize;border-radius:3px;background:linear-gradient(135deg,transparent 0 45%,rgba(219,185,112,.75) 46% 52%,transparent 53% 62%,rgba(219,185,112,.65) 63% 69%,transparent 70%);opacity:.85}',
            '@container (max-width: 380px){.lvsc-grid2,.lvsc-field-grid,.lvsc-card-grid{grid-template-columns:1fr}#lvscTabs{grid-template-columns:repeat(4,minmax(0,1fr))}.lvsc-tab{font-size:11px}}',
            '@media (max-width: 520px){#lvscPanel{right:8px;bottom:8px;width:min(340px,calc(100vw - 16px));height:min(620px,calc(100vh - 16px));max-width:calc(100vw - 16px);max-height:78vh;font-size:12px}#lvscBody{gap:8px;padding:10px}#lvscTabs{top:-10px}#lvscPanel input[type=number],#lvscPanel input[type=text],#lvscPanel select{height:34px}#lvscActions button,#lvscSelfFightBtn,#lvscAutoRecoveryBtn,#lvscVoidBodyBtn,#lvscHiddenCharmBtn,#lvscCheckUpdateBtn{height:38px}#lvscPanel.lvsc-collapsed{width:calc(100vw - 16px)!important;border-radius:12px}#lvscCompactStatus{max-width:none}}'
        ].join('');
        document.head.appendChild(style);

        var panel = document.createElement('div');
        panel.id = 'lvscPanel';
        panel.innerHTML =
            '<header><span id="lvscTitle"><span id="lvscTitleText">神识清理</span></span><span id="lvscHeaderActions"><button id="lvscCollapseBtn" title="收起成横幅">收起</button><button id="lvscClose" title="隐藏">×</button></span></header>' +
            '<div id="lvscStatus" data-tone="idle">待命</div>' +
            '<div id="lvscCompactBar"><span id="lvscCompactSpirit">读取中</span><span id="lvscCompactStatus" data-tone="idle">待命</span><button id="lvscCompactRunBtn">开始</button><button id="lvscCompactMonitorBtn">监测</button><button id="lvscExpandBtn">展开</button></div>' +
            '<div id="lvscBody">' +
            '<div class="lvsc-meter"><div id="lvscSpiritValue">读取中...</div><div id="lvscSpiritTrack"><div id="lvscSpiritFill"></div></div></div>' +
            '<div id="lvscTabs">' +
            '<button class="lvsc-tab" data-tab="explore">探索</button>' +
            '<button class="lvsc-tab" data-tab="fight">战斗</button>' +
            '<button class="lvsc-tab" data-tab="equip">装备</button>' +
            '<button class="lvsc-tab" data-tab="merchant">商人</button>' +
            '<button class="lvsc-tab" data-tab="auto">自动</button>' +
            '<button class="lvsc-tab" data-tab="inscription">铭文</button>' +
            '<button class="lvsc-tab" data-tab="craft">炼制</button>' +
            '<button class="lvsc-tab" data-tab="update">更新</button>' +
            '</div>' +
            '<div class="lvsc-category lvsc-tab-panel" data-tab-panel="explore">' +
            '<div class="lvsc-category-title">基础清理</div>' +
            '<div class="lvsc-field-grid">' +
            '<label>保留神识<input id="lvscReserve" type="number" min="0" step="1"></label>' +
            '<label>间隔毫秒<input id="lvscDelay" type="number" min="600" step="100"></label>' +
            '<label>监测到神识<input id="lvscMonitorStartSpirit" type="number" min="0" step="1" title="填 0 表示神识满了再开始清理"></label>' +
            '<label>优先倍率<select id="lvscPreferMultiplier"><option value="1">×1</option><option value="2">×2</option><option value="5">×5</option><option value="10">×10</option><option value="20">×20</option><option value="50">×50</option></select></label>' +
            '<label class="lvsc-check"><input id="lvscKeepMultiplier" type="checkbox">使用当前探索倍率</label>' +
            '</div>' +
            '</div>' +
            '<div class="lvsc-category lvsc-tab-panel" data-tab-panel="merchant">' +
            '<div class="lvsc-section"><div class="lvsc-section-title-row"><span>护道</span></div>' +
            '<div class="lvsc-field-grid">' +
            '<label>护道方式<select id="lvscHireMode"><option value="cheapest">最低价</option><option value="together">合击</option><option value="alone">单独</option></select></label>' +
            '<label>灵石上限<input id="lvscHireMaxFee" type="number" min="0" step="1" title="填 0 表示不限"></label>' +
            '<label>护道重试上限<input id="lvscHireRetryLimit" type="number" min="1" max="10" step="1"></label>' +
            '</div></div>' +
            '<div class="lvsc-section"><div class="lvsc-section-title-row"><span>商人购买</span></div>' +
            '<div class="lvsc-field-grid">' +
            '<label>商人策略<select id="lvscMerchantMode"><option value="legend">传说才买</option><option value="custom">按条件购买</option><option value="leave">直接离去</option></select></label>' +
            '<label>商品关键词<input id="lvscMerchantKeyword" type="text" placeholder="多个用空格或逗号隔开"></label>' +
            '<label>高价阈值(灵石)<input id="lvscMerchantMaxPrice" type="number" min="0" step="1" title="填 0 表示不限"></label>' +
            '<label class="lvsc-check"><input id="lvscMerchantQualityFirst" type="checkbox">品质优先</label>' +
            '<label class="lvsc-check"><input id="lvscMerchantStrictMatch" type="checkbox">严格匹配（品质 AND 名字）</label>' +
            '<label class="lvsc-check"><input id="lvscAutoMerchant" type="checkbox">自动处理商人</label>' +
            '</div>' +
            '<div class="lvsc-help">传说才买会固定要求传说品质；按条件购买会按关键词和价格筛选，品质优先开启后先买更高品质。</div>' +
            '</div>' +
            '</div>' +
            '<div class="lvsc-category lvsc-tab-panel" data-tab-panel="fight">' +
            '<div class="lvsc-category-title">妖兽与恢复</div>' +
            '<div class="lvsc-card-grid">' +
            '<div class="lvsc-section">' +
            '<div class="lvsc-section-title-row"><span>妖兽遭遇</span><label class="lvsc-check"><input id="lvscAutoSelfFightWeak" type="checkbox">弱怪自战</label></div>' +
            '<div class="lvsc-grid2">' +
            '<label>战力倍率<input id="lvscSelfFightMargin" type="number" min="1" max="3" step="0.05" title="1.00 表示妖兽战力小于等于自身时自战；1.15 表示妖兽战力不超过自身 115% 时自战"></label>' +
            '<button id="lvscSelfFightBtn">检查并自战</button>' +
            '</div>' +
            '<label class="lvsc-check"><input id="lvscAutoHire" type="checkbox">无法自战时自动雇最低价护道</label>' +
            '<div class="lvsc-help">只按战力数值判断：妖兽战力 ≤ 自身战力 × 战力倍率时自战；缺少战力数值时不会用境界或三围兜底。可自战时优先于护道。</div>' +
            '</div>' +
            '<div class="lvsc-section">' +
            '<div class="lvsc-section-title">自动恢复</div>' +
            '<div class="lvsc-grid2">' +
            '<label>恢复项目<select id="lvscAutoRecoveryMode"><option value="both">回血+回灵</option><option value="hp">只回血</option><option value="mp">只回灵</option><option value="none">关闭两项</option></select></label>' +
            '<button id="lvscAutoRecoveryBtn">保存配置</button>' +
            '<label>低于百分比<input id="lvscAutoRecoveryThreshold" type="number" min="0" max="100" step="1"></label>' +
            '<label>恢复到百分比<input id="lvscAutoRecoveryTarget" type="number" min="0" max="100" step="1"></label>' +
            '<label class="lvsc-check"><input id="lvscSectQuickRecovery" type="checkbox">主动恢复（回血/回蓝）</label>' +
            '<button id="lvscSectRecoveryBtn">立即恢复</button>' +
            '<div class="lvsc-section-title">回血顺序</div>' +
            buildSortList('hp', [
                { key: 'mp',      label: '灵力疗伤', desc: '消耗灵力恢复血量' },
                { key: 'pill',    label: '回血丹药', desc: '自动使用背包丹药' },
                { key: 'sect',    label: '宗门治疗', desc: '宗门商铺治疗服务' },
                { key: 'adpoint', label: '仙缘恢复', desc: '需手动操作' }
            ]) +
            '<div class="lvsc-section-title">回灵顺序</div>' +
            buildSortList('mp', [
                { key: 'stone',   label: '灵石凝炼', desc: '吸收灵石化灵力' },
                { key: 'pill',    label: '回灵丹药', desc: '自动使用背包丹药' },
                { key: 'sect',    label: '宗门恢复', desc: '宗门商铺灵力服务' },
                { key: 'adpoint', label: '仙缘恢复', desc: '需手动操作' }
            ]) +
            '</div>' +
            '</div>' +
            '<div class="lvsc-section">' +
            '<div class="lvsc-section-title-row"><span>装备维修</span><label class="lvsc-check"><input id="lvscAutoRepair" type="checkbox">自动维修</label></div>' +
            '<div class="lvsc-grid2">' +
            '<label>耐久低于%<input id="lvscRepairThreshold" type="number" min="0" max="100" step="1" title="耐久百分比低于此值时触发维修"></label>' +
            '<button id="lvscRepairBtn">手动维修</button>' +
            '</div>' +
            '<div class="lvsc-help">通过 API 检测装备耐久（/api/equipment），低于阈值时调用 /api/equipment/repair-all 维修。不依赖页面按钮。</div>' +
            '</div>' +
            '<div class="lvsc-section">' +
            '<div class="lvsc-section-title-row"><span>本命武器</span><label class="lvsc-check"><input id="lvscAutoNatalDevour" type="checkbox">自动吞噬</label></div>' +
            '<div class="lvsc-grid2">' +
            '<button id="lvscNatalDevourBtn">手动吞噬</button>' +
            '</div>' +
            '<div class="lvsc-help">自动吞噬装备（优先同类型有属性的装备）或材料。装备吞噬：POST /api/game/natal/artifact/devour-equipment；材料吞噬：POST /api/game/natal/artifact/devour。</div>' +
            '</div>' +
            '<div class="lvsc-section">' +
            '<div class="lvsc-section-title-row"><span>批量炼制</span></div>' +
            '<div class="lvsc-grid2">' +
            '<label>类型<select id="lvscCraftType"><option value="alchemy">炼丹</option><option value="forge">炼器</option></select></label>' +
            '<label>配方<select id="lvscCraftRecipe"><option value="">点击刷新</option></select><button id="lvscRefreshRecipes" style="height:29px;padding:0 8px;margin-left:4px;background:rgba(255,255,255,.08);color:#cfc6b2;border:1px solid rgba(255,255,255,.1)!important;border-radius:6px;font-size:11px;">刷新</button></label>' +
            '<label>目标数量<input id="lvscCraftTargetCount" type="number" min="1" step="1"></label>' +
            '<label>每次炼制<input id="lvscCraftBatchSize" type="number" min="1" max="50" step="1" placeholder="上限"></label>' +
            '<label class="lvsc-check"><input id="lvscCraftAutoBuyMats" type="checkbox">自动购买材料</label>' +
            '</div>' +
            '<div style="display:flex;gap:6px;"><button id="lvscAutoCraftBtn" style="flex:1;height:34px;background:#dbb970;color:#17141d;border:0;border-radius:6px;cursor:pointer;font-weight:700;">开始炼制</button><button id="lvscStopCraftBtn" style="flex:1;height:34px;background:rgba(255,107,107,.16);color:#ff6b6b;border:1px solid rgba(255,107,107,.28)!important;border-radius:6px;cursor:pointer;font-weight:700;display:none;">停止</button></div>' +
            '<div id="lvscCraftLog" style="min-height:80px;max-height:150px;overflow:auto;white-space:pre-wrap;font-size:11px;color:#cfc6b2;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:8px;font-family:Consolas,monospace;">待命</div>' +
            '</div>' +
            '<div class="lvsc-section">' +
            '<div class="lvsc-section-title-row"><span>自动出狱</span><label class="lvsc-check"><input id="lvscAutoBail" type="checkbox">检测禁闭并保释</label></div>' +
            '<div class="lvsc-grid2"><label>保释方式<select id="lvscBailMethod"><option value="stone">灵石保释</option><option value="material">仙材保释</option></select></label></div>' +
            '<div class="lvsc-help">每30秒检测一次是否被天道禁闭，仙缘足够时自动保释出狱。</div>' +
            '</div>' +
            '<div class="lvsc-section">' +
            '<div class="lvsc-section-title-row"><span>自动收徒</span><label class="lvsc-check"><input id="lvscAutoRecruit" type="checkbox">监控世界聊天</label></div>' +
            '<div class="lvsc-grid2">' +
            '<label>冷却间隔(ms)<input id="lvscRecruitIntervalMs" type="number" min="1000" step="500" title="两次收徒之间的最小间隔"></label>' +
            '<button id="lvscRecruitBtn">手动收徒</button>' +
            '</div>' +
            '<div class="lvsc-help">监控世界聊天每条新发言，直接调收徒 API，由服务器判断是否满足收徒条件。</div>' +
            '<label class="lvsc-check"><input id="lvscAutoMasterRequests" type="checkbox">自动处理徒弟请求（问道/护道/历练）</label>' +
            '<div id="lvscRecruitLog">待命</div>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '<div class="lvsc-category lvsc-tab-panel" data-tab-panel="auto">' +
            '<div class="lvsc-category-title">自动流程</div>' +
            '<div class="lvsc-card-grid">' +
            '<div class="lvsc-section">' +
            '<div class="lvsc-section-title">冥想探索</div>' +
            '<label class="lvsc-check"><input id="lvscAutoMeditate" type="checkbox">神识不足自动冥想回满</label>' +
            '<label>收功神识<input id="lvscMeditateStopSpirit" type="number" min="0" step="1" title="填 0 表示冥想到神识上限"></label>' +
            '<label class="lvsc-check"><input id="lvscAutoExploreAfterMeditate" type="checkbox">收功后自动继续探索</label>' +
            '<label class="lvsc-check"><input id="lvscNightOnlyExplore" type="checkbox">只在游戏夜晚探索</label>' +
            '<label class="lvsc-check"><input id="lvscAutoReviveDeath" type="checkbox">陨落后自动引渡归来</label>' +
            '<label>复活后前往<select id="lvscReviveExploreArea"><option value="">（不跳转）</option></select><button id="lvscRefreshAreas" style="height:29px;padding:0 8px;margin-left:4px;background:rgba(255,255,255,.08);color:#cfc6b2;border:1px solid rgba(255,255,255,.1)!important;border-radius:6px;font-size:11px;">刷新地图</button></label>' +
            '<label class="lvsc-check"><input id="lvscCheckDaoyunBoost" type="checkbox">启动前检查道韵加成</label>' +
            '<label class="lvsc-check"><input id="lvscUseAdvancedMeditate" type="checkbox">优先仙缘高级冥想</label>' +
            '<div class="lvsc-section-title-row"><span>装备套装</span><label class="lvsc-check"><input id="lvscEquipSwapEnabled" type="checkbox">冥想前后自动切换</label></div>' +
            '<div class="lvsc-grid2"><button id="lvscCaptureSpiritSet">记录为神识套</button><button id="lvscCaptureCombatSet">记录为战斗套</button></div>' +
            '<div class="lvsc-help">先穿好神识装点"记录为神识套"，再穿好战斗装点"记录为战斗套"。勾上后冥想前自动切神识套，收功后切回战斗套。</div>' +
            '</div>' +
            '<div class="lvsc-section">' +
            '<div class="lvsc-section-title">藏宝图</div>' +
            '<div class="lvsc-grid2">' +
            '<label>最多用几张<input id="lvscTreasureBatchSize" type="number" min="0" step="1" title="填 0 表示一直用到没有藏宝图"></label>' +
            '<label>一次用几张<input id="lvscTreasureUseQuantity" type="number" min="1" step="1"></label>' +
            '<label>每次间隔(ms)<input id="lvscTreasureIntervalMs" type="number" min="0" step="100" title="填 0 表示沿用基础间隔"></label>' +
            '<button id="lvscAutoTrialBtn">自动试炼</button>' +
            '<button id="lvscAutoTreasureBtn">自动刷藏宝图</button>' +
            '</div>' +
            '<div class="lvsc-help">例：最多用 10、一次用 2，就是这轮最多消耗 10 张，每次向游戏提交 2 张；最多用 0 表示一直刷到没图。遇守卫按护道配置处理。</div>' +
            '</div>' +
            '<div class="lvsc-section">' +
            '<div class="lvsc-section-title">虚空淬体</div>' +
            '<label class="lvsc-check"><input id="lvscAutoVoidBody" type="checkbox">探索前自动补加成</label>' +
            '<div class="lvsc-grid2">' +
            '<label>丹药等级<select id="lvscVoidRarity"><option value="1">普通</option><option value="2">优良</option><option value="3">稀有</option><option value="4">史诗</option><option value="5">传说</option></select></label>' +
            '<label>坊市购买量<input id="lvscVoidBuyQty" type="number" min="1" max="999" step="1"></label>' +
            '</div>' +
            '<button id="lvscVoidBodyBtn">检查/补淬体</button>' +
            '<div class="lvsc-section-title">隐秘符</div>' +
            '<label class="lvsc-check"><input id="lvscAutoHiddenCharm" type="checkbox">探索/刷图前自动尝试使用</label>' +
            '<div class="lvsc-grid2">' +
            '<label>符等级<select id="lvscHiddenCharmRarity"><option value="0">不限</option><option value="1">普通</option><option value="2">优良</option><option value="3">稀有</option><option value="4">史诗</option><option value="5">传说</option></select></label>' +
            '<label>坊市购买量<input id="lvscHiddenCharmBuyQty" type="number" min="1" max="999" step="1"></label>' +
            '<label>使用/重试间隔(ms)<input id="lvscHiddenCharmRetryMs" type="number" min="3000" step="1000"></label>' +
            '</div>' +
            '<button id="lvscHiddenCharmBtn">检查/用隐秘符</button>' +
            '<div class="lvsc-help">无法可靠检测隐秘符加成时，以使用接口成功为准；成功后会按间隔等待，避免每次探索都消耗。</div>' +
            '</div>' +
            '</div>' +
            '</div>' +
            // —— 装备 tab ——
            '<div class="lvsc-category lvsc-tab-panel" data-tab-panel="equip">' +
            '<div class="lvsc-section"><div class="lvsc-section-title">装备</div><div class="lvsc-help">从战斗&恢复面板迁移中...</div></div>' +
            '</div>' +
            // —— 炼制 tab ——
            '<div class="lvsc-category lvsc-tab-panel" data-tab-panel="craft">' +
            '<div class="lvsc-section"><div class="lvsc-section-title">炼制</div><div class="lvsc-help">从自动流程面板迁移中...</div></div>' +
            '</div>' +
            '<div class="lvsc-category lvsc-tab-panel" data-tab-panel="inscription">' +
            '<div class="lvsc-category-title">铭文洗练</div>' +
            '<div class="lvsc-section">' +
            '<label>铭文装备<select id="lvscInscriptionEquipment"><option value="">点击刷新选择装备</option></select><button id="lvscRefreshEquipment" style="height:29px;padding:0 8px;margin-left:4px;background:rgba(255,255,255,.08);color:#cfc6b2;border:1px solid rgba(255,255,255,.1)!important;border-radius:6px;font-size:11px;">刷新</button></label>' +
            '<div id="lvscInscriptionStats">次数 0 / 达成 0 / 放弃 0</div>' +
            '<div class="lvsc-grid2">' +
            '<label>最低品质<select id="lvscInscriptionQuality"><option value="any">不限</option><option value="凡纹">凡纹</option><option value="灵纹">灵纹</option><option value="宝纹">宝纹</option><option value="仙纹">仙纹</option><option value="神纹">神纹</option><option value="圣纹">圣纹</option><option value="天纹">天纹</option></select></label>' +
            '<label>目标属性<select id="lvscInscriptionStat"><option value="攻击">攻击</option><option value="防御">防御</option><option value="气血">气血</option><option value="神识">神识</option></select></label>' +
            '<label>最小数值<input id="lvscInscriptionMinValue" type="text" placeholder="如 50 或 80%"></label>' +
            '<label>命中模式<select id="lvscInscriptionStopMode"><option value="any">任一满足即保留</option><option value="all">全部满足才保留</option><option value="manual">只手动停止</option></select></label>' +
            '<label class="lvsc-check"><input id="lvscInscriptionAutoEquip" type="checkbox">命中后自动装配</label>' +
            '<label class="lvsc-check"><input id="lvscEquipCrossStat" type="checkbox" style="margin-left:18px;">允许覆盖不同属性</label>' +
            '<label class="lvsc-check"><input id="lvscEquipSkipSpirit" type="checkbox" style="margin-left:18px;">跳过神识铭文</label>' +
            '<label>最大次数<input id="lvscInscriptionMaxAttempts" type="number" min="0" step="1" title="填 0 表示无限"></label>' +
            '<label>结果等待(ms)<input id="lvscInscriptionResultDelay" type="number" min="500" step="100"></label>' +
            '<label>洗练模式<select id="lvscInscriptionPullMode"><option value="10">十连</option><option value="100">百连</option></select></label>' +
            '<label>放弃等待(ms)<input id="lvscInscriptionDiscardDelay" type="number" min="300" step="100"></label>' +
            '<button id="lvscAutoInscriptionBtn">自动刷铭文</button>' +
            '</div>' +
            '<div class="lvsc-help">先打开游戏里的铭文洗练界面。自动装配优先级：空槽位 → 非目标槽位 → 目标槽最低值且新值更高。关闭自动装配时，命中目标会保留结果等待处理。</div>' +
            '<div id="lvscInscriptionLog">待命</div>' +
            '</div>' +
            '</div>' +
            '<div class="lvsc-category lvsc-tab-panel" data-tab-panel="update">' +
            '<div class="lvsc-category-title">更新公告<small>v' + SCRIPT_VERSION + '</small></div>' +
            '<div class="lvsc-field-grid">' +
            '<label>云端公告 JSON<input id="lvscUpdateManifestUrl" type="text" placeholder="' + DEFAULT_UPDATE_MANIFEST_URL + '"></label>' +
            '<label class="lvsc-check"><input id="lvscDesktopNotify" type="checkbox">浏览器通知</label>' +
            '<label class="lvsc-check"><input id="lvscChatOnTop" type="checkbox">传音筒始终上层</label>' +
            '<label class="lvsc-check"><input id="lvscWecomNotify" type="checkbox">企业微信通知</label>' +
            '<div class="lvsc-help" style="margin-top:4px;">状态栏提示（默认全开，取消勾选不再显示对应类型）：</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 8px;">' +
            '<label class="lvsc-check" style="font-size:11px;"><input id="lvscStatusRun" type="checkbox" checked>运行</label>' +
            '<label class="lvsc-check" style="font-size:11px;"><input id="lvscStatusFight" type="checkbox" checked>战斗</label>' +
            '<label class="lvsc-check" style="font-size:11px;"><input id="lvscStatusMerchant" type="checkbox" checked>商人</label>' +
            '<label class="lvsc-check" style="font-size:11px;"><input id="lvscStatusMeditate" type="checkbox" checked>冥想</label>' +
            '<label class="lvsc-check" style="font-size:11px;"><input id="lvscStatusRecover" type="checkbox" checked>恢复</label>' +
            '<label class="lvsc-check" style="font-size:11px;"><input id="lvscStatusBuff" type="checkbox" checked>Buff</label>' +
            '<label class="lvsc-check" style="font-size:11px;"><input id="lvscStatusInsc" type="checkbox" checked>铭文</label>' +
            '<label class="lvsc-check" style="font-size:11px;"><input id="lvscStatusCraft" type="checkbox" checked>炼制</label>' +
            '<label class="lvsc-check" style="font-size:11px;"><input id="lvscStatusFarm" type="checkbox" checked>灵田</label>' +
            '<label class="lvsc-check" style="font-size:11px;"><input id="lvscStatusDispose" type="checkbox" checked>出售分解</label>' +
            '<label class="lvsc-check" style="font-size:11px;"><input id="lvscStatusLuck" type="checkbox" checked>气运</label>' +
            '<label class="lvsc-check" style="font-size:11px;"><input id="lvscStatusBreak" type="checkbox" checked>突破</label>' +
            '<label class="lvsc-check" style="font-size:11px;"><input id="lvscStatusOrigin" type="checkbox" checked>本源</label>' +
            '<label class="lvsc-check" style="font-size:11px;"><input id="lvscStatusWecom" type="checkbox" checked>企业微信</label>' +
            '</div>' +
            '<label class="lvsc-check"><input id="lvscUpdateMuted" type="checkbox">屏蔽更新提醒</label>' +
            '<button id="lvscCheckUpdateBtn">检查云端更新</button>' +
            '<button id="lvscTestNotifyBtn" style="height:32px;background:rgba(155,231,195,.16);color:#9be7c3;border:1px solid rgba(155,231,195,.28)!important;">测试通知</button>' +
            '</div>' +
            '<div class="lvsc-section" id="lvscWecomFields" style="display:none;">' +
            '<div class="lvsc-section-title">群机器人 Webhook</div>' +
            '<label>脚本通知<input id="lvscWecomNotifyWebhook" type="text" placeholder="清理/收徒/陨落/新版"></label>' +
            '<label>世界消息<input id="lvscWecomWorldWebhook" type="text" placeholder="世界频道聊天"></label>' +
            '<label>私信<input id="lvscWecomPrivateWebhook" type="text" placeholder="师门/道友私聊"></label>' +
            '<button id="lvscWecomTestBtn">测试发送</button>' +
            '<div class="lvsc-help">在企业微信内部群添加群机器人获取 webhook URL。三个 URL 分别对应三类消息。留空则不发送该类消息。</div>' +
            '</div>' +
            '<div class="lvsc-help">默认读取 GitHub 公告。脚本管理器会根据 updateURL/downloadURL 检测并提示下载安装。</div>' +
            '</div>' +
            '<div id="lvscAuthor"><span>作者：SuH2RanZ1</span><button id="lvscFeedbackBtn">&#x1F4AC; 反馈</button></div>' +
            '</div>' +
            '<div id="lvscActions"><button id="lvscRunBtn">开始清理</button><button id="lvscMonitorBtn">监测神识</button><button id="lvscRefreshBtn">刷新</button></div>' +
            '<div id="lvscResizeHandle" title="拖拽调节面板大小"></div>';
        document.body.appendChild(panel);
        panel.style.zIndex = String(PANEL_Z_INDEX);
        restorePanelSize(panel);
        makePanelDraggable(panel);
        makePanelResizable(panel);

        document.getElementById('lvscReserve').value = String(state.reserve);
        document.getElementById('lvscDelay').value = String(state.delayMs);
        document.getElementById('lvscHireRetryLimit').value = String(state.hireRetryLimit);
        document.getElementById('lvscHireMode').value = String(state.hireMode);
        document.getElementById('lvscHireMaxFee').value = String(state.hireMaxFee);
        document.getElementById('lvscKeepMultiplier').checked = state.keepCurrentMultiplier;
        document.getElementById('lvscMerchantMode').value = String(state.merchantMode);
        document.getElementById('lvscMerchantKeyword').value = String(state.merchantKeyword);
        document.getElementById('lvscMerchantQualityFirst').checked = state.merchantQualityFirst;
        document.getElementById('lvscMerchantStrictMatch').checked = state.merchantStrictMatch;
        document.getElementById('lvscMerchantMaxPrice').value = String(state.merchantMaxPrice);
        document.getElementById('lvscAutoMerchant').checked = state.autoMerchantLegend;
        document.getElementById('lvscAutoSelfFightWeak').checked = state.autoSelfFightWeak;
        document.getElementById('lvscSelfFightMargin').value = String(state.selfFightMargin);
        document.getElementById('lvscAutoHire').checked = state.autoHireCheapest;
        document.getElementById('lvscAutoRecoveryMode').value = String(state.autoRecoveryMode);
        document.getElementById('lvscAutoRecoveryThreshold').value = String(state.autoRecoveryThreshold);
        document.getElementById('lvscAutoRecoveryTarget').value = String(state.autoRecoveryTarget);
        document.getElementById('lvscSectQuickRecovery').checked = state.sectQuickRecovery;
        document.getElementById('lvscAutoRepair').checked = state.autoRepair;
        document.getElementById('lvscRepairThreshold').value = String(state.repairThreshold);
        document.getElementById('lvscAutoNatalDevour').checked = state.autoNatalDevour;
        // reviveExploreArea 已由 refreshReviveAreaSelect 从 localStorage 恢复选中
        document.getElementById('lvscAutoRecruit').checked = state.autoRecruit;
        document.getElementById('lvscRecruitIntervalMs').value = String(state.recruitIntervalMs);
        document.getElementById('lvscAutoHpPriority').value = String(state.autoHpPriority);
        document.getElementById('lvscAutoMpPriority').value = String(state.autoMpPriority);
        document.getElementById('lvscUpdateManifestUrl').value = String(state.updateManifestUrl);
        document.getElementById('lvscAutoMeditate').checked = state.autoMeditate;
        document.getElementById('lvscMeditateStopSpirit').value = String(state.meditateStopSpirit);
        document.getElementById('lvscMonitorStartSpirit').value = String(state.monitorStartSpirit);
        document.getElementById('lvscAutoExploreAfterMeditate').checked = state.autoExploreAfterMeditate;
        document.getElementById('lvscNightOnlyExplore').checked = state.nightOnlyExplore;
        document.getElementById('lvscAutoReviveDeath').checked = state.autoReviveDeath;
        document.getElementById('lvscCheckDaoyunBoost').checked = state.checkDaoyunBoost;
        document.getElementById('lvscUseAdvancedMeditate').checked = state.useAdvancedMeditate;
        // 铭文装备下拉：从法相穿搭（已装备）读取
        function refreshEquipmentSelect() {
            var sel = document.getElementById('lvscInscriptionEquipment');
            if (!sel) return;
            var saved = _inscItemId || localStorage.getItem('lvSpiritCleaner.inscriptionEquipmentId') || '';
            sel.innerHTML = '<option value="">点击刷新选择装备</option>';
            if (!gameApi()) return;
            gameApi().get('/api/game/equipment/current').then(function (res) {
                if (!res || res.code !== 200 || !Array.isArray(res.data)) return;
                var items = res.data;
                // 追加"当前装备"选项（读取游戏打开的铭文界面）
                var curOpt = document.createElement('option');
                curOpt.value = '__current__';
                curOpt.textContent = '当前装备（需打开铭文页）';
                if (saved === '__current__') curOpt.selected = true;
                sel.appendChild(curOpt);
                for (var ei = 0; ei < items.length; ei++) {
                    var item = items[ei];
                    var name = item.name || item.itemName || item.equipmentName || '';
                    // equipment/current 返回 playerItemId（实例ID），铭文API需要这个
                    var id = String(item.playerItemId || item.id || item.itemId || item.equipmentId || item.instanceId || '');
                    if (!name || !id) continue;
                    var slot = item.slot || item.equipSlot || item.slotName || item.equipmentSlot || '';
                    var opt = document.createElement('option');
                    opt.value = id;
                    opt.textContent = (slot ? '[' + slot + '] ' : '') + name;
                    if (id === saved) opt.selected = true;
                    sel.appendChild(opt);
                }
                if (saved && !sel.value) sel.value = saved;
                // 恢复上次选中的装备 ID
                if (sel.value) {
                    if (sel.value === '__current__') {
                        _inscItemId = getCurrentInscItemId();
                        _inscItemName = '当前装备';
                    } else {
                        _inscItemId = sel.value;
                        _inscItemName = sel.options[sel.selectedIndex].textContent || '';
                    }
                }
            }).catch(function () {});
        }
        document.getElementById('lvscRefreshEquipment').onclick = refreshEquipmentSelect;
        function getCurrentInscItemId() {
            var id = window._lastInscItemId || '';
            if (!id) {
                var btns = document.querySelectorAll('[onclick*="drawTenInscription"],[onclick*="drawInscription"],[onclick*="showInscriptionPanel"]');
                for (var bi = 0; bi < btns.length; bi++) { var m = String(btns[bi].getAttribute('onclick') || '').match(/(\d+)/); if (m) { id = m[1]; break; } }
            }
            return id;
        }
        document.getElementById('lvscInscriptionEquipment').onchange = function () {
            if (this.value === '__current__') {
                _inscItemId = getCurrentInscItemId();
                _inscItemName = '当前装备';
            } else {
                _inscItemId = this.value;
                _inscItemName = this.options[this.selectedIndex].textContent || '';
            }
            localStorage.setItem('lvSpiritCleaner.inscriptionEquipmentId', _inscItemId);
            state.inscriptionQuality = 'any';
        };
        setTimeout(refreshEquipmentSelect, 1500);
        document.getElementById('lvscInscriptionQuality').value = String(state.inscriptionQuality);
        document.getElementById('lvscInscriptionStat').value = String(state.inscriptionStat);
        document.getElementById('lvscInscriptionMinValue').value = localStorage.getItem('lvSpiritCleaner.inscriptionMinValue') || '50';
        document.getElementById('lvscInscriptionStopMode').value = String(state.inscriptionStopMode);
        document.getElementById('lvscInscriptionAutoEquip').checked = state.inscriptionAutoEquip;
        document.getElementById('lvscInscriptionMaxAttempts').value = String(state.inscriptionMaxAttempts);
        document.getElementById('lvscInscriptionResultDelay').value = String(state.inscriptionResultDelay);
        document.getElementById('lvscInscriptionDiscardDelay').value = String(state.inscriptionDiscardDelay);
        document.getElementById('lvscTreasureBatchSize').value = String(state.treasureBatchSize);
        document.getElementById('lvscTreasureUseQuantity').value = String(state.treasureUseQuantity);
        document.getElementById('lvscTreasureIntervalMs').value = String(state.treasureIntervalMs);
        document.getElementById('lvscDesktopNotify').checked = state.desktopNotify;
        document.getElementById('lvscChatOnTop').checked = state.chatOnTop;
        document.getElementById('lvscWecomNotify').checked = state.wecomNotify;
        document.getElementById('lvscWecomNotifyWebhook').value = String(state.wecomNotifyWebhook);
        document.getElementById('lvscWecomWorldWebhook').value = String(state.wecomWorldWebhook);
        document.getElementById('lvscWecomPrivateWebhook').value = String(state.wecomPrivateWebhook);
        document.getElementById('lvscAutoMasterRequests').checked = state.autoMasterRequests;
        document.getElementById('lvscWecomFields').style.display = '';
        document.getElementById('lvscAutoVoidBody').checked = state.autoVoidBody;
        document.getElementById('lvscVoidRarity').value = String(state.voidBodyRarity);
        document.getElementById('lvscVoidBuyQty').value = String(state.voidBodyBuyQty);
        document.getElementById('lvscAutoHiddenCharm').checked = state.autoHiddenCharm;
        document.getElementById('lvscHiddenCharmRarity').value = String(state.hiddenCharmRarity);
        document.getElementById('lvscHiddenCharmBuyQty').value = String(state.hiddenCharmBuyQty);
        document.getElementById('lvscHiddenCharmRetryMs').value = String(state.hiddenCharmRetryMs);
        document.getElementById('lvscRunBtn').onclick = function () {
            if (running) { stop('手动停止'); return; }
            if (state.exploreMode === 'system') { systemExploreLoop(); return; }
            runLoop();
        };
        document.getElementById('lvscCompactRunBtn').onclick = function () {
            if (running) { stop('手动停止'); return; }
            if (state.exploreMode === 'system') { systemExploreLoop(); return; }
            runLoop();
        };
        // 停止时同步停止系统自动探索
        var _origStop = stop;
        stop = function(reason) {
            if (typeof stopAutoExplore === 'function') { try { stopAutoExplore(reason || '脚本停止', false); } catch(_) {} }
            _origStop(reason);
        };
        document.getElementById('lvscMonitorBtn').onclick = toggleSpiritMonitor;
        document.getElementById('lvscFeedbackBtn').onclick = function () {
            var old = document.getElementById('lvscFeedbackModal');
            if (old) { old.style.display = old.style.display === 'none' ? 'flex' : 'none'; return; }
            var modal = document.createElement('div');
            modal.id = 'lvscFeedbackModal';
            modal.innerHTML =
                '<div class="lvsc-fb-backdrop"></div>' +
                '<div class="lvsc-fb-card">' +
                '<div class="lvsc-fb-title">意见反馈</div>' +
                '<textarea id="lvscFeedbackText" class="lvsc-fb-textarea" placeholder="欢迎提出意见、建议或 Bug 反馈...&#10;请留下角色名以便回复" rows="5"></textarea>' +
                '<div class="lvsc-fb-actions">' +
                '<button id="lvscFeedbackCancel" class="lvsc-fb-btn lvsc-fb-cancel">取消</button>' +
                '<button id="lvscFeedbackSend" class="lvsc-fb-btn lvsc-fb-send">发送</button>' +
                '</div></div>';
            modal.style.cssText = 'position:fixed;inset:0;z-index:2147483002;display:flex;align-items:center;justify-content:center;';
            document.body.appendChild(modal);
            modal.querySelector('.lvsc-fb-backdrop').onclick = function () { modal.remove(); };
            document.getElementById('lvscFeedbackCancel').onclick = function () { modal.remove(); };
            document.getElementById('lvscFeedbackSend').onclick = function () {
                var text = document.getElementById('lvscFeedbackText').value.trim();
                if (!text) return;
                var player = getPlayer() || {};
                var payload = { text: text,  playerName: player.name || player.playerName || '', version: SCRIPT_VERSION, timestamp: Date.now() };
                var endpoint = (state.onlineStatsEndpoint || DEFAULT_ONLINE_STATS_ENDPOINT).replace('/api/heartbeat', '/api/feedback');
                window.dispatchEvent(new CustomEvent('lvsc:feedback', { detail: JSON.stringify({ endpoint: endpoint, payload: payload }) }));
                setStatus('感谢反馈！', 'run');
                modal.remove();
            };
        };
        document.getElementById('lvscCompactMonitorBtn').onclick = toggleSpiritMonitor;
        document.getElementById('lvscRefreshBtn').onclick = refreshPlayer;
        document.getElementById('lvscAutoTrialBtn').onclick = toggleAutoTrial;
        document.getElementById('lvscAutoTreasureBtn').onclick = toggleAutoTreasure;
        document.getElementById('lvscAutoInscriptionBtn').onclick = toggleAutoInscription;
        document.getElementById('lvscSelfFightBtn').onclick = function () {
            syncSettingsFromUi();
            handleSelfFightEvent(true);
        };
        document.getElementById('lvscAutoRecoveryBtn').onclick = applyAutoRecoverySettings;
        document.getElementById('lvscSectRecoveryBtn').onclick = function () {
            syncSettingsFromUi();
            activeRecover();
        };
        document.getElementById('lvscRepairBtn').onclick = function () {
            triggerAutoRepair(true);
        };
        document.getElementById('lvscNatalDevourBtn').onclick = function () {
            triggerAutoNatalDevour(true);
        };
        document.getElementById('lvscRecruitBtn').onclick = function () {
            handleChatMessagesBatch();
        };
        document.getElementById('lvscCheckUpdateBtn').onclick = function () {
            checkCloudUpdate(true);
        };
        // 测试通知按钮
        document.getElementById('lvscTestNotifyBtn').onclick = function () {
            var pName = (getPlayer() || {}).name || '测试角色';
            var now = new Date().toLocaleTimeString();
            wecomEnqueue('🧹 开始清理', '角色：' + pName);
            wecomEnqueue('🔄 清理中', '神识剩余：180/200');
            wecomEnqueue('🧘 开始冥想', '当前神识：5/200\n目标神识：200\n预计恢复：约 8分钟后\n预计下一轮清理：' + now);
            wecomEnqueue('🧘 冥想中', '预计收工神识：120/200\n还需约：5分钟');
            wecomEnqueue('✨ 高级冥想', '使用前仙缘：125\n使用后仙缘：123\n神识：已恢复');
            wecomEnqueue('💀 角色陨落', '位置：青云城\n正在尝试引渡复活...');
            wecomEnqueue('🔄 已引渡归来', '前往：灵溪村\n血量 350/1200 灵力 80/500\n将恢复后继续清理');
            wecomEnqueue('✅ 清理结束', '运行时长：120分钟\n探索次数：342\n遭遇妖兽：47次\n死亡次数：1');
            setStatus('测试通知已发送', 'run');
        };
        // 批量炼制
        document.getElementById('lvscCraftType').value = state.craftType;
        document.getElementById('lvscCraftType').onchange = function () { state.craftType = this.value; persistSetting('lvSpiritCleaner.craftType', this.value); refreshCraftRecipes(); };
        document.getElementById('lvscCraftRecipe').value = state.craftRecipeId;
        document.getElementById('lvscCraftRecipe').onchange = function () { state.craftRecipeId = this.value; persistSetting('lvSpiritCleaner.craftRecipeId', this.value); };
        document.getElementById('lvscCraftTargetCount').value = String(state.craftTargetCount);
        document.getElementById('lvscCraftTargetCount').onchange = function () { state.craftTargetCount = Math.max(1, Number(this.value) || 10); persistSetting('lvSpiritCleaner.craftTargetCount', String(state.craftTargetCount)); };
        document.getElementById('lvscCraftBatchSize').value = String(state.craftBatchSize || '');
        document.getElementById('lvscCraftBatchSize').onchange = function () { state.craftBatchSize = Math.max(0, Number(this.value) || 0); persistSetting('lvSpiritCleaner.craftBatchSize', String(state.craftBatchSize)); };
        document.getElementById('lvscCraftAutoBuyMats').checked = state.craftAutoBuyMats;
        document.getElementById('lvscCraftAutoBuyMats').onchange = function () { state.craftAutoBuyMats = this.checked; persistSetting('lvSpiritCleaner.craftAutoBuyMats', this.checked); };
        async function refreshCraftRecipes() {
            var sel = document.getElementById('lvscCraftRecipe');
            if (!sel) return;
            sel.innerHTML = '<option value="">加载中...</option>';
            var recipes = await fetchRecipes(state.craftType);
            console.log('[refreshCraftRecipes] got', recipes.length, 'recipes for', state.craftType);
            sel.innerHTML = '<option value="">选择配方</option>';
            if (!recipes.length) { sel.innerHTML = '<option value="">无配方或加载失败</option>'; return; }
            for (var ri = 0; ri < recipes.length; ri++) {
                var r = recipes[ri];
                var id = getCraftItemId(r, state.craftType);
                var name = getCraftItemName(r, state.craftType);
                if (!id || !name) continue;
                sel.innerHTML += '<option value="' + id + '"' + (state.craftRecipeId === id ? ' selected' : '') + '>' + name + '</option>';
            }
            if (state.craftRecipeId && !sel.value) sel.value = state.craftRecipeId;
        }
        document.getElementById('lvscRefreshRecipes').onclick = refreshCraftRecipes;
        setTimeout(refreshCraftRecipes, 1500);
        document.getElementById('lvscAutoCraftBtn').onclick = function () {
            if (autoCraftRunning) return;
            document.getElementById('lvscAutoCraftBtn').style.display = 'none';
            document.getElementById('lvscStopCraftBtn').style.display = '';
            autoCraftLoop().finally(function () {
                document.getElementById('lvscAutoCraftBtn').style.display = '';
                document.getElementById('lvscStopCraftBtn').style.display = 'none';
            });
        };
        document.getElementById('lvscStopCraftBtn').onclick = stopCraft;

        // 每30秒自动检查是否入狱（需开启自动出狱）
        document.getElementById('lvscAutoBail').checked = state.autoBail;
        document.getElementById('lvscAutoBail').onchange = function () {
            state.autoBail = this.checked;
            persistSetting('lvSpiritCleaner.autoBail', state.autoBail);
        };
        document.getElementById('lvscBailMethod').value = state.bailMethod;
        document.getElementById('lvscBailMethod').onchange = function () { state.bailMethod = this.value; persistSetting('lvSpiritCleaner.bailMethod', this.value); };
        setInterval(function () { if (state.autoBail) checkAndAutoBail(false); }, 30000);
        // 屏蔽更新 checkbox
        document.getElementById('lvscUpdateMuted').checked = localStorage.getItem('lvSpiritCleaner.updateMuted') === '1';
        document.getElementById('lvscUpdateMuted').onchange = function () {
            if (this.checked) {
                localStorage.setItem('lvSpiritCleaner.updateMuted', '1');
            } else {
                localStorage.removeItem('lvSpiritCleaner.updateMuted');
            }
        };
        document.getElementById('lvscCollapseBtn').onclick = function () {
            setPanelCollapsed(panel, true);
        };
        document.getElementById('lvscExpandBtn').onclick = function () {
            setPanelCollapsed(panel, false);
        };
        document.getElementById('lvscVoidBodyBtn').onclick = function () {
            ensureVoidBodyBuff(true);
        };
        document.getElementById('lvscHiddenCharmBtn').onclick = function () {
            ensureHiddenCharm(true);
        };
        document.getElementById('lvscClose').onclick = function () {
            stop('已隐藏');
            panel.style.display = 'none';
        };
        Array.prototype.forEach.call(document.querySelectorAll('#lvscTabs .lvsc-tab'), function (button) {
            button.onclick = function () {
                activatePanelTab(button.getAttribute('data-tab'));
                if (button.getAttribute('data-tab') === 'explore') {
                    if (window._renderAutoStatus) window._renderAutoStatus();
                    if (window._renderRunningMonitors) window._renderRunningMonitors();
                }
            };
        });
        // === 单字段 onchange 绑定（只写一个 key）===
        onNum('lvscReserve', 'reserve', 0);
        onNum('lvscDelay', 'delayMs', 600);
        onNum('lvscHireRetryLimit', 'hireRetryLimit', 1);
        onSel('lvscHireMode', 'hireMode', ['cheapest', 'together', 'alone']);
        onNum('lvscHireMaxFee', 'hireMaxFee', 0);
        onChkAlt('lvscKeepMultiplier', 'keepCurrentMultiplier', 'lvSpiritCleaner.keepMultiplier');
        document.getElementById('lvscPreferMultiplier').value = state.preferMultiplier;
        document.getElementById('lvscPreferMultiplier').onchange = function () { state.preferMultiplier = this.value; persistSetting('lvSpiritCleaner.preferMultiplier', this.value); };
        onSel('lvscMerchantMode', 'merchantMode', ['legend', 'custom', 'leave']);
        onStr('lvscMerchantKeyword', 'merchantKeyword');
        onChk('lvscMerchantQualityFirst', 'merchantQualityFirst');
        onChk('lvscMerchantStrictMatch', 'merchantStrictMatch');
        onNum('lvscMerchantMaxPrice', 'merchantMaxPrice', 0);
        onChk('lvscAutoMerchant', 'autoMerchantLegend');
        onChk('lvscAutoSelfFightWeak', 'autoSelfFightWeak');
        onNum('lvscSelfFightMargin', 'selfFightMargin', 1);
        onChk('lvscAutoHire', 'autoHireCheapest');
        onSel('lvscAutoRecoveryMode', 'autoRecoveryMode', ['none', 'hp', 'mp', 'both']);
        onNum('lvscAutoRecoveryThreshold', 'autoRecoveryThreshold', 0);
        onNum('lvscAutoRecoveryTarget', 'autoRecoveryTarget', 0);
        onChk('lvscSectQuickRecovery', 'sectQuickRecovery');
        onChk('lvscAutoRepair', 'autoRepair');
        onChk('lvscAutoNatalDevour', 'autoNatalDevour');
        onNum('lvscRepairThreshold', 'repairThreshold', 0);
        // 复活后前往：从游戏地图弹窗抓取区域名，或从原生 select 读取
        var reviveAreaRetries = 0;
        function refreshReviveAreaSelect() {
            var targetSel = document.getElementById('lvscReviveExploreArea');
            if (!targetSel) return;
            var areas = findGameAreaOptions();
            var saved = localStorage.getItem('lvSpiritCleaner.reviveExploreArea') || '';
            targetSel.innerHTML = '<option value="">（不跳转）</option>';
            if (!areas.length) {
                if (reviveAreaRetries < 30) {
                    reviveAreaRetries++;
                    setTimeout(refreshReviveAreaSelect, 2000);
                }
                return;
            }
            reviveAreaRetries = 0;
            for (var ai = 0; ai < areas.length; ai++) {
                var txt = areas[ai];
                targetSel.innerHTML += '<option value="' + txt.replace(/"/g, '&quot;') + '"' + (saved === txt ? ' selected' : '') + '>' + txt + '</option>';
            }
        }
        refreshReviveAreaSelect();
        // 每3秒扫描地图弹窗节点（用户打开地图时就能抓取到区域名）
        setInterval(function () {
            if (scanMapNodes().length) refreshReviveAreaSelect();
        }, 3000);
        // 刷新按钮
        document.getElementById('lvscRefreshAreas').onclick = function () {
            reviveAreaRetries = 0;
            _cachedAreaNames = [];
            _areaNameToId = {};
            refreshReviveAreaSelect();
        };
        // 保存选中值
        document.getElementById('lvscReviveExploreArea').onchange = function () {
            state.reviveExploreArea = this.value;
            localStorage.setItem('lvSpiritCleaner.reviveExploreArea', state.reviveExploreArea);
        };
        // 自动收徒：需要额外启停 observer
        document.getElementById('lvscAutoRecruit').onchange = function () {
            state.autoRecruit = chkVal('lvscAutoRecruit');
            persistSetting('lvSpiritCleaner.autoRecruit', state.autoRecruit);
            if (state.autoRecruit) startRecruitObserver(); else stopRecruitObserver();
        };
        onNum('lvscRecruitIntervalMs', 'recruitIntervalMs', 1000);
        onStr('lvscAutoHpPriority', 'autoHpPriority');
        onStr('lvscAutoMpPriority', 'autoMpPriority');
        onStr('lvscUpdateManifestUrl', 'updateManifestUrl');
        onChk('lvscAutoMeditate', 'autoMeditate');
        onNum('lvscMeditateStopSpirit', 'meditateStopSpirit', 0);
        onNum('lvscMonitorStartSpirit', 'monitorStartSpirit', 0);
        onChk('lvscAutoExploreAfterMeditate', 'autoExploreAfterMeditate');
        onChk('lvscNightOnlyExplore', 'nightOnlyExplore');
        onChk('lvscAutoReviveDeath', 'autoReviveDeath');
        onChk('lvscCheckDaoyunBoost', 'checkDaoyunBoost');
        onChk('lvscUseAdvancedMeditate', 'useAdvancedMeditate');
        // 装备套装
        document.getElementById('lvscEquipSwapEnabled').checked = state.equipSwapEnabled;
        document.getElementById('lvscEquipSwapEnabled').onchange = function () { state.equipSwapEnabled = this.checked; persistSetting('lvSpiritCleaner.equipSwapEnabled', this.checked); };
        document.getElementById('lvscCaptureSpiritSet').onclick = function () { captureEquipSet('spiritEquipIds'); };
        document.getElementById('lvscCaptureCombatSet').onclick = function () { captureEquipSet('combatEquipIds'); };
        onSel('lvscInscriptionQuality', 'inscriptionQuality', ['any', '凡纹', '灵纹', '宝纹', '仙纹', '神纹', '圣纹', '天纹']);
        // 铭文属性和最小值变化时需要同步 targets
        document.getElementById('lvscInscriptionStat').onchange = function () {
            state.inscriptionStat = strVal('lvscInscriptionStat');
            state.inscriptionTargets = state.inscriptionStat + ':' + state.inscriptionMinValue;
            persistSetting('lvSpiritCleaner.inscriptionStat', state.inscriptionStat);
            persistSetting('lvSpiritCleaner.inscriptionTargets', state.inscriptionTargets);
        };
        document.getElementById('lvscInscriptionMinValue').onchange = function () {
            var raw = strVal('lvscInscriptionMinValue');
            state.inscriptionMinValue = parseInscMinValue(raw);
            state.inscriptionTargets = state.inscriptionStat + ':' + raw;
            persistSetting('lvSpiritCleaner.inscriptionMinValue', raw);
            persistSetting('lvSpiritCleaner.inscriptionTargets', state.inscriptionTargets);
        };
        onSel('lvscInscriptionStopMode', 'inscriptionStopMode', ['any', 'all', 'manual']);
        onNum('lvscInscriptionMaxAttempts', 'inscriptionMaxAttempts', 0);
        onNum('lvscInscriptionResultDelay', 'inscriptionResultDelay', 500);
        onNum('lvscInscriptionDiscardDelay', 'inscriptionDiscardDelay', 300);
        onChk('lvscInscriptionAutoEquip', 'inscriptionAutoEquip');
        document.getElementById('lvscEquipCrossStat').checked = state.inscriptionEquipCrossStat;
        document.getElementById('lvscEquipCrossStat').onchange = function () { state.inscriptionEquipCrossStat = this.checked; persistSetting('lvSpiritCleaner.inscriptionEquipCrossStat', this.checked); };
        document.getElementById('lvscEquipSkipSpirit').checked = state.inscriptionEquipSkipSpirit;
        document.getElementById('lvscEquipSkipSpirit').onchange = function () { state.inscriptionEquipSkipSpirit = this.checked; persistSetting('lvSpiritCleaner.inscriptionEquipSkipSpirit', this.checked); };
        document.getElementById('lvscInscriptionPullMode').value = String(state.inscriptionPullMode);
        document.getElementById('lvscInscriptionPullMode').onchange = function () {
            state.inscriptionPullMode = Number(this.value) || 10;
            persistSetting('lvSpiritCleaner.inscriptionPullMode', String(state.inscriptionPullMode));
        };
        onNum('lvscTreasureBatchSize', 'treasureBatchSize', 0);
        onNum('lvscTreasureUseQuantity', 'treasureUseQuantity', 1);
        onNum('lvscTreasureIntervalMs', 'treasureIntervalMs', 0);
        onChk('lvscDesktopNotify', 'desktopNotify');
        // chatOnTop: 额外应用 z-index
        document.getElementById('lvscChatOnTop').onchange = function () {
            state.chatOnTop = chkVal('lvscChatOnTop');
            persistSetting('lvSpiritCleaner.chatOnTop', state.chatOnTop);
            applyChatZIndex(state.chatOnTop);
        };
        // wecomNotify: 额外切换字段显示 + 启停 observer
        document.getElementById('lvscWecomNotify').onchange = function () {
            state.wecomNotify = chkVal('lvscWecomNotify');
            persistSetting('lvSpiritCleaner.wecomNotify', state.wecomNotify);
            document.getElementById('lvscWecomFields').style.display = '';
            if (state.wecomNotify) startRecruitObserver();
        };
        onStr('lvscWecomNotifyWebhook', 'wecomNotifyWebhook');
        // 状态栏分类开关
        var statusCats = ['Run','Fight','Merchant','Meditate','Recover','Buff','Insc','Craft','Farm','Dispose','Luck','Break','Origin','Wecom'];
        for (var sci = 0; sci < statusCats.length; sci++) {
            var cat = statusCats[sci];
            var key = 'lvSpiritCleaner.statusMuted' + cat;
            var muted = localStorage.getItem(key) === '1';
            _statusMuted[cat] = muted;
            var cb = document.getElementById('lvscStatus' + cat);
            if (cb) { cb.checked = !muted; cb.onchange = function (c, k) { return function () { _statusMuted[c] = !this.checked; localStorage.setItem(k, this.checked ? '0' : '1'); }; }(cat, key); }
        }
        onStr('lvscWecomWorldWebhook', 'wecomWorldWebhook');
        onStr('lvscWecomPrivateWebhook', 'wecomPrivateWebhook');
        onChk('lvscAutoMasterRequests', 'autoMasterRequests');
        // 企业微信测试按钮：直接从 DOM 读值
        document.getElementById('lvscWecomTestBtn').onclick = function () {
            state.wecomNotifyWebhook = strVal('lvscWecomNotifyWebhook');
            state.wecomWorldWebhook = strVal('lvscWecomWorldWebhook');
            state.wecomPrivateWebhook = strVal('lvscWecomPrivateWebhook');
            if (state.wecomNotifyWebhook) wecomEnqueue('通知测试', '通知 OK！', state.wecomNotifyWebhook);
            if (state.wecomWorldWebhook) wecomEnqueue('世界测试', '世界 OK！', state.wecomWorldWebhook);
            if (state.wecomPrivateWebhook) wecomEnqueue('私信测试', '私信 OK！', state.wecomPrivateWebhook);
        };
        onChk('lvscAutoVoidBody', 'autoVoidBody');
        onNum('lvscVoidRarity', 'voidBodyRarity', 1);
        onNum('lvscVoidBuyQty', 'voidBodyBuyQty', 1);
        onChk('lvscAutoHiddenCharm', 'autoHiddenCharm');
        onNum('lvscHiddenCharmRarity', 'hiddenCharmRarity', 0);
        onNum('lvscHiddenCharmBuyQty', 'hiddenCharmBuyQty', 1);
        onNum('lvscHiddenCharmRetryMs', 'hiddenCharmRetryMs', 3000);

        setPanelCollapsed(panel, localStorage.getItem('lvSpiritCleaner.collapsed') === '1');
        activatePanelTab(localStorage.getItem('lvSpiritCleaner.activeTab') || 'explore');
        refreshPlayer();
        showBuiltinReleaseOnce();
        hookAntiCheatAutoSolve();
        startOnlineHeartbeat();
        setTimeout(function () { checkCloudUpdate(false); }, 1500);
        setInterval(function () { checkCloudUpdate(false); }, CLOUD_UPDATE_POLL_MS);
        setTimeout(function () { checkAnnounce(); }, 3000);
        setInterval(function () { checkAnnounce(); }, 120000); // 每2分钟检查在线公告
        setInterval(updateMeter, 2000);
        applyChatZIndex(state.chatOnTop);
        if (state.autoRecruit || state.wecomNotify) {
            setTimeout(function () { startRecruitObserver(); }, 2000);
        }
        // === 内容搬迁：把section归位到正确面板 ===
        try{(function(){
            var panels={};
            ['explore','fight','equip','merchant','auto','inscription','craft','update'].forEach(function(n){
                panels[n]=document.querySelector('[data-tab-panel="'+n+'"]');
            });
            // 1. 搬家：.lvsc-section 元素归位
            document.querySelectorAll('.lvsc-section').forEach(function(sec){
                var t=(sec.querySelector('.lvsc-section-title,.lvsc-section-title-row span')||{}).textContent||'';
                var parent=sec.closest('.lvsc-tab-panel');
                var target=null;
                if (/^(妖兽遭遇|自动恢复|回血顺序|回灵顺序|护道)/.test(t)) target='fight';
                else if (/^(装备维修|本命武器|装备套装)/.test(t)) target='equip';
                else if (/^(冥想探索|虚空淬体|隐秘符|自动出狱|自动收徒)/.test(t)) target='auto';
                else if (/^(批量炼制|藏宝图)/.test(t)) target='craft';
                else if (/^(群机器人|Webhook)/.test(t)) target='update';
                else if (/^(装备|炼制)/.test(t)){} // 占位符跳过
                if (target && panels[target] && parent!==panels[target]) panels[target].appendChild(sec);
            });
            // 2. 护道与商人拆开：整个merchant面板的section逐个处理
            var merchantOld = panels['merchant'];
            if (merchantOld) {
                merchantOld.querySelectorAll('.lvsc-section').forEach(function(sec){
                    var t=(sec.querySelector('.lvsc-section-title,.lvsc-section-title-row span')||{}).textContent||'';
                    if (/^(妖兽遭遇|自动恢复|回血|回灵|护道)/.test(t)) panels['fight'].appendChild(sec);
                });
            }
            // 3. 清除装备和炼制面板的占位section
            ['equip','craft'].forEach(function(k){
                if (!panels[k]) return;
                panels[k].querySelectorAll('.lvsc-section').forEach(function(s){
                    if (s.querySelector('.lvsc-help') && s.textContent.indexOf('迁移中')>=0) s.remove();
                });
            });
        })();}catch(e){console.warn('tab content migrate err',e);}

        // ====== 动态功能注入 ======
        try {(function() {
            function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h) e.innerHTML = h; return e; }
            function sec(title, badge) { var s = el('div', 'lvsc-section'); var bh = ''; if (badge === 'auto') { bh = '<span class="lvsc-badge" style="font-size:10px;padding:1px 6px;border-radius:3px;margin-left:6px;background:rgba(107,201,160,.14);color:#6bc9a0">自动</span>'; s.setAttribute('data-badge', 'auto'); } else if (badge === 'manual') { bh = '<span class="lvsc-badge" style="font-size:10px;padding:1px 6px;border-radius:3px;margin-left:6px;background:rgba(224,160,64,.14);color:#e0a040">需启动</span>'; s.setAttribute('data-badge', 'manual'); } s.appendChild(el('div', 'lvsc-section-title-row', '<span>' + title + bh + '</span>')); return s; }
            function rfrBtn(id) { var b = el('button'); b.id = id; b.style.cssText = 'height:29px;padding:0 8px;margin-left:4px;background:rgba(255,255,255,.08);color:#cfc6b2;border:1px solid rgba(255,255,255,.1);border-radius:6px;font-size:11px;cursor:pointer'; b.textContent = '刷新'; return b; }
            function goldBtn(id, text) { var b = el('button'); b.id = id; b.style.cssText = 'flex:1;height:34px;background:#dbb970;color:#17141d;border:0;border-radius:6px;cursor:pointer;font-weight:700'; b.textContent = text; return b; }
            function actBtn(id, text) { var b = el('button'); b.id = id; b.className = 'lvsc-action-btn'; b.style.cssText = 'flex:1;height:32px'; b.textContent = text; return b; }
            function stopBtn(id) { var b = el('button'); b.id = id; b.style.cssText = 'flex:1;height:32px;background:rgba(255,107,107,.16);color:#ff6b6b;border:1px solid rgba(255,107,107,.28);border-radius:6px;cursor:pointer;font-weight:700;display:none'; b.textContent = '停止'; return b; }
            function logDiv(id) { var d = el('div'); d.id = id; d.style.cssText = 'min-height:60px;max-height:120px;overflow:auto;white-space:pre-wrap;font-size:11px;color:#cfc6b2;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:8px;font-family:Consolas,monospace'; d.textContent = '待命'; return d; }

            // 涅槃重生丹 → auto tab
            (function() {
                var p = document.querySelector('[data-tab-panel="auto"]'); if (!p) return;
                var s = sec('涅槃重生丹', 'auto'), g = el('div', 'lvsc-grid2');
                g.innerHTML = '<label class="lvsc-check" style="font-size:11px"><input id="lvscAutoNirvanaPill" type="checkbox">自动炼造使用</label><label>品质<select id="lvscNirvanaRarity"><option value="3">稀有</option><option value="4">史诗</option><option value="5">传说</option></select></label><label>炼制数量<input id="lvscNirvanaCraftQty" type="number" min="1" max="999" value="' + state.nirvanaCraftQty + '"></label>';
                s.appendChild(g);
                p.insertBefore(s, p.firstChild);
            })();

            // ---------- 气运+突破+本源 → auto ----------
            (function() {
                var p = document.querySelector('[data-tab-panel="auto"]'); if (!p) return;
                var s = sec('气运 & 突破');
                s.innerHTML = '<div class="lvsc-grid2"><label style="font-size:11px">最低气运<input id="lvscMinLuck" type="number" min="1" max="10" value="' + state.minLuck + '" style="height:24px"></label><label style="font-size:11px">消耗<select id="lvscLuckRefreshMethod"><option value="stone">灵石</option><option value="ad">仙缘</option></select></label><span id="lvscLuckNow" style="font-size:11px;color:#dbb970;line-height:28px">当前: ?</span><div style="display:flex;gap:4px"><button id="lvscLuckRefreshStartBtn" class="lvsc-action-btn" style="flex:1;height:28px;font-size:11px">开始刷气运</button><button id="lvscLuckRefreshStopBtn" style="flex:1;height:28px;background:rgba(255,107,107,.16);color:#ff6b6b;border:1px solid rgba(255,107,107,.28);border-radius:6px;cursor:pointer;font-weight:700;display:none;font-size:11px">停止</button></div><label class="lvsc-check" style="font-size:11px"><input id="lvscAutoBreakthrough" type="checkbox">自动突破</label><label class="lvsc-check" style="font-size:11px"><input id="lvscAutoOriginRepair" type="checkbox">自动修复本源</label></div>';
                p.insertBefore(s, p.firstChild);
            })();
            // ---------- 出售 & 分解 → auto ----------
            (function() {
                var p = document.querySelector('[data-tab-panel="auto"]'); if (!p) return;
                var s = sec('出售 & 分解', 'manual');
                // 添加规则行
                var addRow = el('div'); addRow.style.cssText = 'display:flex;gap:4px;align-items:center;flex-wrap:wrap';
                var actSel = el('select'); actSel.id = 'lvscDisposeAction'; actSel.innerHTML = '<option value="sell">出售</option><option value="dismantle">分解</option>';
                var scopeSel = el('select'); scopeSel.id = 'lvscDisposeScope'; scopeSel.innerHTML = '<option value="equip">装备</option><option value="pill">丹药</option><option value="scroll">卷轴</option><option value="misc">杂物</option><option value="all">全部</option>';
                var raritySel = el('select'); raritySel.id = 'lvscDisposeRarity'; raritySel.innerHTML = '<option value="1">普通及以下</option><option value="2">优良及以下</option><option value="3">稀有及以下</option><option value="4">史诗及以下</option>';
                var addBtn = el('button'); addBtn.id = 'lvscDisposeAddBtn'; addBtn.textContent = '+ 添加监控'; addBtn.style.cssText = 'height:28px;padding:0 10px;background:#4a7c5c;color:#e8f0e0;border:0;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;white-space:nowrap';
                addRow.appendChild(actSel); addRow.appendChild(scopeSel); addRow.appendChild(raritySel); addRow.appendChild(addBtn);
                s.appendChild(addRow);
                // 启用 + 间隔
                var cfgRow = el('div'); cfgRow.style.cssText = 'display:flex;gap:6px;align-items:center';
                cfgRow.innerHTML = '<label class="lvsc-check" style="font-size:11px"><input id="lvscAutoDisposeEnabled" type="checkbox">启用监控</label><label class="lvsc-check" style="font-size:11px"><input id="lvscAutoSynthesize" type="checkbox">自动凝聚碎片</label><label style="font-size:11px">间隔(秒)<input id="lvscAutoDisposeInterval" type="number" min="60" value="' + state.autoDisposeInterval + '" style="width:70px;height:24px"></label>';
                s.appendChild(cfgRow);
                // 开始/停止
                var btnRow = el('div'); btnRow.style.cssText = 'display:flex;gap:6px';
                btnRow.appendChild(actBtn('lvscDisposeStartBtn', '开始监控'));
                btnRow.appendChild(stopBtn('lvscDisposeStopBtn'));
                s.appendChild(btnRow);
                // 监控列表
                var listDiv = el('div'); listDiv.id = 'lvscDisposeRulesList'; listDiv.style.cssText = 'min-height:20px;font-size:11px;color:#cfc6b2';
                s.appendChild(listDiv);
                // 搜索保护
                var searchRow = el('div'); searchRow.style.cssText = 'display:flex;gap:4px;margin-top:4px';
                var searchInput = el('input'); searchInput.id = 'lvscDisposeSearch'; searchInput.placeholder = '搜物品名加入保护'; searchInput.style.cssText = 'flex:1;height:24px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.1);border-radius:4px;color:#cfc6b2;padding:0 6px;font-size:11px';
                var searchBtn = el('button'); searchBtn.textContent = '搜索'; searchBtn.style.cssText = 'height:24px;padding:0 8px;background:rgba(219,185,112,.16);color:#dbb970;border:1px solid rgba(219,185,112,.3);border-radius:4px;cursor:pointer;font-size:10px;white-space:nowrap';
                searchRow.appendChild(searchInput); searchRow.appendChild(searchBtn);
                s.appendChild(searchRow);
                var searchResults = el('div'); searchResults.id = 'lvscDisposeSearchResults'; searchResults.style.cssText = 'display:none;max-height:200px;overflow:auto;font-size:10px;color:#cfc6b2;background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.06);border-radius:4px;padding:4px;margin-top:2px';
                s.appendChild(searchResults);
                // 保护列表
                var protDiv = el('div'); protDiv.id = 'lvscDisposeProtectedList'; protDiv.style.cssText = 'min-height:16px;font-size:10px;color:var(--text-muted);margin-top:2px';
                s.appendChild(protDiv);
                // 日志
                var logDiv2 = el('div'); logDiv2.id = 'lvscDisposeLog'; logDiv2.style.cssText = 'min-height:40px;max-height:100px;overflow:auto;white-space:pre-wrap;font-size:10px;color:var(--text-muted);background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.06);border-radius:6px;padding:6px;font-family:Consolas,monospace;margin-top:4px'; logDiv2.textContent = '等待执行...';
                s.appendChild(logDiv2);
                p.insertBefore(s, p.firstChild);
                // 日志函数
                window._disposeLog = function(msg) {
                    var l = document.getElementById('lvscDisposeLog'); if (!l) return;
                    var t = new Date().toLocaleTimeString();
                    l.textContent = '[' + t + '] ' + msg + '\n' + (l.textContent || '');
                    if (l.textContent.length > 2000) l.textContent = l.textContent.substring(0, 2000);
                };
                // 渲染函数
                window._renderDisposeRules = function() {
                    var list = document.getElementById('lvscDisposeRulesList'); if (!list) return;
                    var rules = state.autoDisposeRules || [];
                    var actionNames = {sell:'出售',dismantle:'分解'};
                    var scopeNames = {equip:'装备',pill:'丹药',scroll:'卷轴',misc:'杂物',all:'全部'};
                    var rarityNames = ['','普通','优良','稀有','史诗'];
                    if (!rules.length) { list.innerHTML = '<div style="color:var(--text-muted)">暂无监控规则，请添加</div>'; return; }
                    var html = '';
                    for (var i = 0; i < rules.length; i++) {
                        var r = rules[i];
                        html += '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)">' +
                            '<span style="color:' + (r.action === 'dismantle' ? '#6bc9a0' : '#dbb970') + ';min-width:28px">' + (actionNames[r.action]||r.action) + '</span>' +
                            '<span style="min-width:28px">' + (scopeNames[r.scope]||r.scope) + '</span>' +
                            '<span style="min-width:72px">' + (rarityNames[r.maxRarity]||r.maxRarity) + '及以下</span>' +
                            '<button onclick="window._removeDisposeRule(' + i + ')" style="margin-left:auto;height:20px;padding:0 6px;background:rgba(255,107,107,.16);color:#ff6b6b;border:1px solid rgba(255,107,107,.28);border-radius:4px;cursor:pointer;font-size:10px">删除</button>' +
                            '</div>';
                    }
                    list.innerHTML = html;
                };
                window._addDisposeRule = function() {
                    var a = document.getElementById('lvscDisposeAction');
                    var s2 = document.getElementById('lvscDisposeScope');
                    var r2 = document.getElementById('lvscDisposeRarity');
                    if (!a || !s2 || !r2) return;
                    var rule = { action: a.value, scope: s2.value, maxRarity: Number(r2.value) };
                    var rules = Array.isArray(state.autoDisposeRules) ? state.autoDisposeRules.slice() : [];
                    rules.push(rule);
                    state.autoDisposeRules = rules;
                    persistSetting('lvSpiritCleaner.autoDisposeRules', JSON.stringify(rules));
                    window._renderDisposeRules();
                };
                window._removeDisposeRule = function(idx) {
                    var rules = Array.isArray(state.autoDisposeRules) ? state.autoDisposeRules.slice() : [];
                    rules.splice(idx, 1);
                    state.autoDisposeRules = rules;
                    persistSetting('lvSpiritCleaner.autoDisposeRules', JSON.stringify(rules));
                    window._renderDisposeRules();
                };
                addBtn.addEventListener('click', window._addDisposeRule);
                window._renderDisposeRules();
                // 搜索物品
                var _searchCache = [];
                searchBtn.addEventListener('click', async function() {
                    var q = (searchInput.value || '').trim().toLowerCase();
                    if (!q) return;
                    searchResults.style.display = 'block';
                    searchResults.innerHTML = '搜索中...';
                    try {
                        if (!_searchCache.length) {
                            try {
                                var encR = await gameApi().get('/api/game/encyclopedia');
                                if (encR && encR.code === 200 && Array.isArray(encR.data)) _searchCache = encR.data;
                            } catch (_) {}
                        }
                        searchResults.innerHTML = '';
                        var seen = {}; var RAR = ['','普通','优良','稀有','史诗','传说'];
                        var groups = {}; var groupOrder = [];
                        for (var _si = 0; _si < _searchCache.length; _si++) {
                            var item = _searchCache[_si];
                            var nm = (item.name || item.itemName || '').toLowerCase();
                            if (!nm || nm.indexOf(q) < 0) continue;
                            var tid = String(item.templateId || item.id || '');
                            if (seen[tid]) continue;
                            seen[tid] = true;
                            var tname = (item.name || item.itemName || '');
                            var baseId = tid.replace(/_\d+$/, '');
                            if (!groups[baseId]) { groups[baseId] = []; groupOrder.push(baseId); }
                            groups[baseId].push({ id: tid, name: tname });
                        }
                        var found = groupOrder.length > 0;
                        groupOrder.forEach(function(baseId) {
                            var g = groups[baseId];
                            // [不论品质] 入口
                            if (g.length >= 1) {
                                var allRow = document.createElement('div');
                                allRow.style.cssText = 'display:flex;align-items:center;padding:3px 8px;cursor:pointer;border-radius:3px;background:rgba(219,185,112,.1);margin-bottom:2px';
                                allRow.addEventListener('mouseover', function() { this.style.background = 'rgba(219,185,112,.22)'; });
                                allRow.addEventListener('mouseout', function() { this.style.background = 'rgba(219,185,112,.1)'; });
                                allRow.innerHTML = '<span style="flex:1;color:#dbb970;font-weight:700">' + (g[0].name || baseId) + '</span><span style="color:#dbb970;font-size:10px">[不论品质]</span>';
                                (function(bid, gname) {
                                    allRow.addEventListener('click', function() {
                                        var items = Array.isArray(state.autoDisposeProtected) ? state.autoDisposeProtected.slice() : [];
                                        for (var ri = 1; ri <= 5; ri++) {
                                            var fid = bid + '_' + ri;
                                            if (!items.some(function(x) { return (typeof x === 'string' ? x : x.id) === fid; })) {
                                                items.push({ id: fid, name: gname });
                                            }
                                        }
                                        state.autoDisposeProtected = items;
                                        persistSetting('lvSpiritCleaner.autoDisposeProtected', JSON.stringify(items));
                                        window._renderProtectedList();
                                    });
                                })(baseId, g[0].name);
                                searchResults.appendChild(allRow);
                            }
                            // 各品质明细
                            g.forEach(function(gi) {
                                var _id = gi.id, _nm = gi.name;
                                var quality = '';
                                var m2 = _id.match(/_(\d+)$/);
                                if (m2 && RAR[parseInt(m2[1])]) quality = ' [' + RAR[parseInt(m2[1])] + ']';
                                var row = document.createElement('div');
                                row.style.cssText = 'display:flex;align-items:center;padding:2px 6px;cursor:pointer;border-radius:3px;margin-left:12px';
                                row.addEventListener('mouseover', function() { this.style.background = 'rgba(107,201,160,.12)'; });
                                row.addEventListener('mouseout', function() { this.style.background = 'transparent'; });
                                row.innerHTML = '<span style="flex:1;color:#6bc9a0;font-size:11px">' + _nm + quality + '</span><span style="color:#6a6560;font-size:9px;margin-right:6px">' + _id + '</span><span style="color:#6bc9a0;font-size:9px">+保护</span>';
                                (function(id, nm) {
                                    row.addEventListener('click', function() {
                                        var items = Array.isArray(state.autoDisposeProtected) ? state.autoDisposeProtected.slice() : [];
                                        if (!items.some(function(x) { return (typeof x === 'string' ? x : x.id) === id; })) {
                                            items.push({ id: id, name: nm });
                                            state.autoDisposeProtected = items;
                                            persistSetting('lvSpiritCleaner.autoDisposeProtected', JSON.stringify(items));
                                            window._renderProtectedList();
                                        }
                                    });
                                })(_id, _nm);
                                searchResults.appendChild(row);
                            });
                        });
                        if (!found) {
                            searchResults.innerHTML = '<div style="color:var(--text-muted);padding:2px 6px">无结果，点此直接添加ID</div>';
                            searchResults.style.cursor = 'pointer';
                            searchResults.onclick = function() {
                                var rawId = (searchInput.value || '').trim();
                                if (!rawId) return;
                                var items = Array.isArray(state.autoDisposeProtected) ? state.autoDisposeProtected.slice() : [];
                                if (!items.some(function(x) { return (typeof x === 'string' ? x : x.id) === rawId; })) {
                                    items.push({ id: rawId, name: '' });
                                    state.autoDisposeProtected = items;
                                    persistSetting('lvSpiritCleaner.autoDisposeProtected', JSON.stringify(items));
                                    window._renderProtectedList();
                                }
                                searchResults.style.display = 'none';
                            };
                        } else { searchResults.style.cursor = ''; searchResults.onclick = null; }
                    } catch (_) { searchResults.innerHTML = '搜索失败'; }
                });
                searchInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') searchBtn.click(); });
                // 渲染保护列表
                window._renderProtectedList = function() {
                    var el = document.getElementById('lvscDisposeProtectedList'); if (!el) return;
                    var items = Array.isArray(state.autoDisposeProtected) ? state.autoDisposeProtected : [];
                    if (!items.length) { el.innerHTML = ''; return; }
                    var html = '<span style="font-size:10px;color:var(--text-muted)">保护 ' + items.length + ' 种：</span>';
                    for (var _i = 0; _i < items.length; _i++) {
                        var it = items[_i];
                        var tid = typeof it === 'string' ? it : it.id;
                        var tname = typeof it === 'string' ? tid : (it.name || tid);
                        html += '<span style="padding:1px 5px;background:rgba(107,201,160,.1);color:#6bc9a0;border-radius:3px;margin:1px 2px;font-size:10px;display:inline-block" title="' + tid + '">' + tname + '<span data-delidx="' + _i + '" style="color:#ff6b6b;cursor:pointer;margin-left:3px">✕</span></span>';
                    }
                    html += ' <span style="color:#ff6b6b;cursor:pointer;font-size:10px" id="lvscClearProtect">清空</span>';
                    el.innerHTML = html;
                    el.querySelectorAll('[data-delidx]').forEach(function(sp) {
                        sp.addEventListener('click', function() {
                            var idx = parseInt(this.getAttribute('data-delidx'));
                            var arr = Array.isArray(state.autoDisposeProtected) ? state.autoDisposeProtected.slice() : [];
                            arr.splice(idx, 1);
                            state.autoDisposeProtected = arr;
                            persistSetting('lvSpiritCleaner.autoDisposeProtected', JSON.stringify(arr));
                            window._renderProtectedList();
                        });
                    });
                    var clearBtn = document.getElementById('lvscClearProtect');
                    if (clearBtn) clearBtn.addEventListener('click', function() {
                        state.autoDisposeProtected = [];
                        persistSetting('lvSpiritCleaner.autoDisposeProtected', '[]');
                        window._renderProtectedList();
                    });
                };
                window._renderProtectedList();
            })();
            // ---------- 灵田 → auto ----------
            (function() {
                var p = document.querySelector('[data-tab-panel="auto"]'); if (!p) return;
                var s = sec('灵田', 'manual'), g = el('div', 'lvsc-grid2');
                g.innerHTML = '<label>种子<select id="lvscFarmSeed"><option value="">点击刷新</option></select></label><label>检测间隔(秒)<input id="lvscFarmInterval" type="number" min="5" step="5" value="' + state.farmInterval + '"></label>';
                g.querySelector('label').appendChild(rfrBtn('lvscRefreshFarm'));
                s.appendChild(g);
                s.innerHTML += '<div class="lvsc-grid2" style="grid-template-columns:1fr 1fr 1fr"><label class="lvsc-check" style="font-size:11px"><input id="lvscFarmAutoHarvest" type="checkbox" checked>收获</label><label class="lvsc-check" style="font-size:11px"><input id="lvscFarmAutoPlant" type="checkbox" checked>种植</label></div>';
                s.innerHTML += '<label class="lvsc-check" style="font-size:11px"><input id="lvscFarmExpandEn" type="checkbox">自动开垦</label><span id="lvscFarmNextExpand" style="font-size:10px;color:var(--text-muted);margin-left:4px"></span>';
                s.innerHTML += '<label class="lvsc-check" style="font-size:11px"><input id="lvscFarmAutoInvasion" type="checkbox" checked>迎击入侵</label>';
                var btnRow = el('div'); btnRow.style.cssText = 'display:flex;gap:6px';
                btnRow.appendChild(actBtn('lvscFarmStartBtn', '开始监控'));
                btnRow.appendChild(stopBtn('lvscFarmStopBtn'));
                s.appendChild(btnRow); s.appendChild(logDiv('lvscFarmLog'));
                p.insertBefore(s, p.firstChild);
            })();

            // ---------- 珍宝阁 → craft ----------
            (function() {
                var p = document.querySelector('[data-tab-panel="craft"]'); if (!p) return;
                var s = sec('珍宝阁', 'manual'), g = el('div', 'lvsc-grid2');
                g.innerHTML = '<label>商品<select id="lvscPavilionItem"><option value="">点击刷新</option></select></label><label>单次数量<input id="lvscPavilionQty" type="number" min="1" max="999" value="' + state.pavilionQty + '"></label><label>循环次数<input id="lvscPavilionLoop" type="number" min="1" value="' + state.pavilionLoop + '"></label><label>间隔(ms)<input id="lvscPavilionDelay" type="number" min="100" step="100" value="' + state.pavilionDelay + '"></label>';
                g.querySelector('label').appendChild(rfrBtn('lvscRefreshPavilion'));
                s.appendChild(g);
                var btnRow = el('div'); btnRow.style.cssText = 'display:flex;gap:6px';
                btnRow.appendChild(goldBtn('lvscAutoPavilionBtn', '开始兑换'));
                btnRow.appendChild(stopBtn('lvscStopPavilionBtn'));
                s.appendChild(btnRow); s.appendChild(logDiv('lvscPavilionLog'));
                p.insertBefore(s, p.firstChild);
            })();

            // ---------- 扫荡 → craft ----------
            (function() {
                var p = document.querySelector('[data-tab-panel="craft"]'); if (!p) return;
                var s = sec('试练塔扫荡', 'manual'), g = el('div', 'lvsc-grid2');
                g.innerHTML = '<label>最大次数<input id="lvscSweepMax" type="number" min="0" value="0" placeholder="0=无限"></label><label>间隔(ms)<input id="lvscSweepDelay" type="number" min="500" step="500" value="3000"></label>';
                s.appendChild(g);
                var btnRow = el('div'); btnRow.style.cssText = 'display:flex;gap:6px';
                btnRow.appendChild(actBtn('lvscSweepStartBtn', '开始扫荡'));
                btnRow.appendChild(stopBtn('lvscSweepStopBtn'));
                s.appendChild(btnRow); s.appendChild(logDiv('lvscSweepLog'));
                p.insertBefore(s, p.firstChild);
            })();

            // ---------- 制符+批量用符 → craft ----------
            (function() {
                var p = document.querySelector('[data-tab-panel="craft"]'); if (!p) return;
                var s = sec('批量用符'), g = el('div', 'lvsc-grid2');
                g.innerHTML = '<label>符篆类型<select id="lvscTalismanType"><option value="all">全部</option><option value="stealth">隐秘符</option><option value="combat">战斗符</option></select></label><label>每次几张<input id="lvscTalismanBatch" type="number" min="1" value="10"></label><label>循环次数<input id="lvscTalismanLoops" type="number" min="1" value="5"></label><label>间隔(ms)<input id="lvscTalismanDelay" type="number" min="500" step="100" value="1500"></label>';
                s.appendChild(g);
                var btnRow = el('div'); btnRow.style.cssText = 'display:flex;gap:6px';
                btnRow.appendChild(actBtn('lvscStartTalismanBtn', '开始用符'));
                btnRow.appendChild(stopBtn('lvscStopTalismanBtn'));
                s.appendChild(btnRow); s.appendChild(logDiv('lvscTalismanLog'));
                p.insertBefore(s, p.firstChild);
                // 炼制类型加"制符"
                var ct = document.getElementById('lvscCraftType');
                if (ct && !ct.querySelector('option[value="talisman"]')) { var o = document.createElement('option'); o.value = 'talisman'; o.textContent = '制符'; ct.appendChild(o); }
            })();

            // ---------- 探索模式 → explore tab ----------
            (function() {
                var ep = document.querySelector('[data-tab-panel="explore"]'); if (!ep) return;
                var s = sec('探索模式');
                s.innerHTML = '<div style="display:flex;gap:6px;align-items:center"><label style="font-size:11px"><input id="lvscExploreModeApi" type="radio" name="lvscExploreMode" value="api"> 脚本API（自定义倍率/事件处理）</label><label style="font-size:11px"><input id="lvscExploreModeSystem" type="radio" name="lvscExploreMode" value="system"> 系统自带（游戏内置自动探索）</label></div>';
                ep.insertBefore(s, ep.firstChild);
            })();

            // 高级冥想夏季选项——紧跟在后面
            (function() {
                var advCb = document.getElementById('lvscUseAdvancedMeditate');
                if (!advCb) return;
                var prt = advCb.parentElement;
                if (!prt) return;
                var lbl = document.createElement('label');
                lbl.className = 'lvsc-check';
                lbl.style.cssText = 'font-size:11px';
                lbl.innerHTML = '<input id="lvscSummerOnlyAdvancedMeditate" type="checkbox">只在夏季';
                prt.parentElement.insertBefore(lbl, prt.nextSibling);
            })();

            // ---------- 激进模式 → explore tab ----------
            (function() {
                var ep = document.querySelector('[data-tab-panel="explore"]'); if (!ep) return;
                var s = sec('战斗模式');
                s.innerHTML = '<label class="lvsc-check" style="font-size:11px"><input id="lvscAggressiveMode" type="checkbox">⚔ 激进模式（遇怪直接打，不找护道，更快但更险）</label>';
                ep.insertBefore(s, ep.firstChild);
            })();

            // ---------- 已开启功能摘要 → explore tab ----------
            (function() {
                var ep = document.querySelector('[data-tab-panel="explore"]'); if (!ep) return;
                var s = sec('已开启', 'auto');
                var tagsDiv = el('div'); tagsDiv.id = 'lvscAutoStatusTags'; tagsDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;font-size:11px';
                s.appendChild(tagsDiv);
                ep.insertBefore(s, ep.firstChild);
                window._renderAutoStatus = function() {
                    var td = document.getElementById('lvscAutoStatusTags'); if (!td) return;
                    var items = [];
                    var add = function(cond, name) { if (cond) items.push(name); };
                    add(state.autoMeditate, '自动冥想');
                    add(state.autoHireCheapest, '自动护道');
                    add(state.autoMerchantLegend, '传奇商人');
                    add(state.autoSelfFightWeak, '自战弱者');
                    add(state.autoReviveDeath, '自动复活');
                    add(state.checkDaoyunBoost, '道运检测');
                    add(state.autoVoidBody, '虚空淬体');
                    add(state.autoHiddenCharm, '隐藏仙缘');
                    add(state.autoRepair, '修复装备');
                    add(state.autoNatalDevour, '吞噬法宝');
                    add(state.autoRecruit, '自动招募');
                    add(state.autoBreakthrough, '自动突破');
                    add(state.autoOriginRepair, '本源修复');
                    add(state.autoDisposeEnabled && (state.autoDisposeRules||[]).length, '出售&分解');
                    add(state.autoNirvanaPill, '涅槃丹');
                    add(state.autoBail, '自动保释');
                    add(state.autoMasterRequests, '师门请求');
                    add(state.equipSwapEnabled, '装备切换');
                    add(state.inscriptionAutoEquip, '铭文装配');
                    add(state.wecomNotify, '企微通知');
                    add(state.autoRecoveryMode !== 'none', '自动恢复');
                    add(state.sectQuickRecovery, '宗门恢复');
                    add(state.autoSweepMode || state.autoExploreMode, '自动模式');
                    if (!items.length) { td.innerHTML = '<span style="color:var(--text-muted)">暂无已开启的自动功能</span>'; return; }
                    td.innerHTML = items.map(function(n) { return '<span style="padding:2px 7px;background:rgba(107,201,160,.1);color:#6bc9a0;border-radius:4px;white-space:nowrap">' + n + '</span>'; }).join('');
                };
                window._renderAutoStatus();
                // 正在监控
                var s2 = sec('正在监控', 'manual');
                var monDiv = el('div'); monDiv.id = 'lvscRunningMonitors'; monDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;font-size:11px';
                s2.appendChild(monDiv);
                ep.insertBefore(s2, ep.firstChild);
                window._renderRunningMonitors = function() {
                    var md = document.getElementById('lvscRunningMonitors'); if (!md) return;
                    var items = [];
                    if (typeof autoFarmRunning !== 'undefined' && autoFarmRunning) items.push('灵田');
                    if (typeof autoSweepRunning !== 'undefined' && autoSweepRunning) items.push('扫荡');
                    if (typeof autoPavilionRunning !== 'undefined' && autoPavilionRunning) items.push('珍宝阁');
                    if (typeof autoTalismanRunning !== 'undefined' && autoTalismanRunning) items.push('批量用符');
                    if (typeof autoInscriptionRunning !== 'undefined' && autoInscriptionRunning) items.push('铭文洗练');
                    if (typeof autoCraftRunning !== 'undefined' && autoCraftRunning) items.push('炼制');
                    if (typeof autoTreasureRunning !== 'undefined' && autoTreasureRunning) items.push('藏宝图');
                    if (typeof autoDisposeRunning !== 'undefined' && autoDisposeRunning) items.push('出售&分解');
                    if (typeof autoRefreshLuckRunning !== 'undefined' && autoRefreshLuckRunning) items.push('刷气运');
                    if (typeof autoTrialRunning !== 'undefined' && autoTrialRunning) items.push('试练塔');
                    if (!items.length) { md.innerHTML = '<span style="color:var(--text-muted)">暂无正在运行的监控</span>'; return; }
                    md.innerHTML = items.map(function(n) { return '<span style="padding:2px 7px;background:rgba(224,160,64,.12);color:#e0a040;border-radius:4px;white-space:nowrap">● ' + n + '</span>'; }).join('');
                };
                window._renderRunningMonitors();
            })();

            // --- 统一给所有 section 标题打徽章 ---
            window._stampSectionBadges = function() {
                // 用内部控件 ID 识别，比标题文本更稳定
                var ID_BADGE = {
                    // auto（只有 checkbox/input，无 start 按钮）
                    lvscAutoHireCheapest:'auto', lvscAutoMerchant:'auto', lvscAutoMerchantLegend:'auto',
                    lvscAutoSelfFightWeak:'auto', lvscAutoRecoveryMode:'auto', lvscAutoHpPriority:'auto',
                    lvscAutoMpPriority:'auto', lvscAutoRepair:'auto', lvscAutoNatalDevour:'auto',
                    lvscAutoBail:'auto', lvscAutoRecruit:'auto', lvscAutoMeditate:'auto',
                    lvscEquipSwapEnabled:'auto', lvscAutoVoidBody:'auto', lvscAutoHiddenCharm:'auto',
                    lvscWecomNotify:'auto',
                    // manual（有 start/stop 按钮）
                    lvscCraftRecipe:'manual', lvscFarmStartBtn:'manual',
                    lvscAutoPavilionBtn:'manual', lvscSweepStartBtn:'manual',
                    lvscStartTalismanBtn:'manual', lvscDisposeStartBtn:'manual',
                    lvscAutoTreasureBtn:'manual', lvscAutoTrialBtn:'manual',
                    lvscLuckRefreshStartBtn:'manual'
                };
                var sections = document.querySelectorAll('.lvsc-section');
                for (var si = 0; si < sections.length; si++) {
                    var sct = sections[si];
                    // 已有 data-badge（sec() 设置）或已有徽章 → 跳过
                    if (sct.getAttribute('data-badge') || sct.querySelector('.lvsc-badge')) continue;
                    // 查找 section 内第一个匹配的控件 ID
                    var badgeType = null;
                    var inputs = sct.querySelectorAll('[id]');
                    for (var ii = 0; ii < inputs.length; ii++) {
                        if (ID_BADGE[inputs[ii].id]) { badgeType = ID_BADGE[inputs[ii].id]; break; }
                    }
                    if (!badgeType) continue;
                    sct.setAttribute('data-badge', badgeType);
                    var titleEl = sct.querySelector('.lvsc-section-title-row > span') || sct.querySelector('.lvsc-section-title');
                    if (!titleEl) continue;
                    var badge = document.createElement('span');
                    badge.className = 'lvsc-badge';
                    badge.style.cssText = 'font-size:10px;padding:1px 6px;border-radius:3px;margin-left:6px;white-space:nowrap;' + (badgeType === 'auto' ? 'background:rgba(107,201,160,.14);color:#6bc9a0' : 'background:rgba(224,160,64,.14);color:#e0a040');
                    badge.textContent = badgeType === 'auto' ? '自动' : '需启动';
                    titleEl.appendChild(badge);
                }
            };
            window._stampSectionBadges();

            // 绑定新元素的事件（延迟执行避免ID未注册）
            setTimeout(function() {
                // 再跑一次确保全部到位
                if (window._stampSectionBadges) window._stampSectionBadges();
                // 灵田
                var fsStart = document.getElementById('lvscFarmStartBtn');
                if (fsStart) fsStart.onclick = function() { this.style.display = 'none'; document.getElementById('lvscFarmStopBtn').style.display = ''; autoFarmLoop(); };
                var fsStop = document.getElementById('lvscFarmStopBtn');
                if (fsStop) fsStop.onclick = function() { stopFarm(); document.getElementById('lvscFarmStartBtn').style.display = ''; this.style.display = 'none'; };
                var fIntv = document.getElementById('lvscFarmInterval');
                if (fIntv) fIntv.onchange = function() { state.farmInterval = Math.max(5, Number(this.value)||30); persistSetting('lvSpiritCleaner.farmInterval', String(state.farmInterval)); };
                var fHarv = document.getElementById('lvscFarmAutoHarvest');
                if (fHarv) { fHarv.checked = state.farmAutoHarvest; fHarv.onchange = function() { state.farmAutoHarvest = this.checked; persistSetting('lvSpiritCleaner.farmAutoHarvest', this.checked); }; }
                var fPlant = document.getElementById('lvscFarmAutoPlant');
                if (fPlant) { fPlant.checked = state.farmAutoPlant; fPlant.onchange = function() { state.farmAutoPlant = this.checked; persistSetting('lvSpiritCleaner.farmAutoPlant', this.checked); }; }
                async function refreshFarmSeeds() {
                    var sel = document.getElementById('lvscFarmSeed'); if (!sel) return;
                    sel.innerHTML = '<option value="">加载中...</option>';
                    var data = await farmOverview();
                    sel.innerHTML = '<option value="">选择种子</option>';
                    if (data && data.seeds) for (var fi = 0; fi < data.seeds.length; fi++) { var s = data.seeds[fi]; if (s.seedId) sel.innerHTML += '<option value="' + s.seedId + '"' + (state.farmSeedId === s.seedId ? ' selected' : '') + '>' + (s.seedName || s.seedId) + '</option>'; }
                }
                var fSeed = document.getElementById('lvscFarmSeed');
                if (fSeed) fSeed.onchange = function() { state.farmSeedId = this.value; state.farmSeedName = this.options[this.selectedIndex].textContent || ''; persistSetting('lvSpiritCleaner.farmSeedId', state.farmSeedId); persistSetting('lvSpiritCleaner.farmSeedName', state.farmSeedName); };
                var fRef = document.getElementById('lvscRefreshFarm'); if (fRef) fRef.onclick = refreshFarmSeeds;
                var fExpC = document.getElementById('lvscFarmExpandEn');
                if (fExpC) { fExpC.checked = state.farmExpandEnabled; fExpC.onchange = function() { state.farmExpandEnabled = this.checked; persistSetting('lvSpiritCleaner.farmExpandEnabled', this.checked); }; }
                var fInv = document.getElementById('lvscFarmAutoInvasion'); if (fInv) { fInv.checked = state.farmAutoInvasion; fInv.onchange = function() { state.farmAutoInvasion = this.checked; persistSetting('lvSpiritCleaner.farmAutoInvasion', this.checked); }; }
                var fExpH = document.getElementById('lvscFarmExpandHours');
                setTimeout(refreshFarmSeeds, 2500);

                // 珍宝阁
                async function refreshPavilionItems() {
                    var sel = document.getElementById('lvscPavilionItem'); if (!sel) return;
                    sel.innerHTML = '<option value="">加载中...</option>';
                    var items = await fetchPavilionShop();
                    sel.innerHTML = '<option value="">选择商品</option>';
                    for (var pi = 0; pi < items.length; pi++) { var it = items[pi]; var id = String(it.templateId || it.itemId || it.id || ''); var name = it.name || it.itemName || ''; if (id && name) sel.innerHTML += '<option value="' + id + '"' + (state.pavilionItemId === id ? ' selected' : '') + '>' + name + '</option>'; }
                }
                var pItem = document.getElementById('lvscPavilionItem');
                if (pItem) pItem.onchange = function() { state.pavilionItemId = this.value; state.pavilionItemName = this.options[this.selectedIndex].textContent || ''; persistSetting('lvSpiritCleaner.pavilionItemId', state.pavilionItemId); persistSetting('lvSpiritCleaner.pavilionItemName', state.pavilionItemName); };
                var pRef = document.getElementById('lvscRefreshPavilion'); if (pRef) pRef.onclick = refreshPavilionItems;
                var pQty = document.getElementById('lvscPavilionQty'); if (pQty) { pQty.value = String(state.pavilionQty); pQty.onchange = function() { state.pavilionQty = Math.max(1, Number(this.value)||99); persistSetting('lvSpiritCleaner.pavilionQty', String(state.pavilionQty)); }; }
                var pLoop = document.getElementById('lvscPavilionLoop'); if (pLoop) { pLoop.value = String(state.pavilionLoop); pLoop.onchange = function() { state.pavilionLoop = Math.max(1, Number(this.value)||10); persistSetting('lvSpiritCleaner.pavilionLoop', String(state.pavilionLoop)); }; }
                var pDelay = document.getElementById('lvscPavilionDelay'); if (pDelay) { pDelay.value = String(state.pavilionDelay); pDelay.onchange = function() { state.pavilionDelay = Math.max(100, Number(this.value)||500); persistSetting('lvSpiritCleaner.pavilionDelay', String(state.pavilionDelay)); }; }
                var pStart = document.getElementById('lvscAutoPavilionBtn');
                if (pStart) pStart.onclick = function() { if (autoPavilionRunning) return; this.style.display = 'none'; document.getElementById('lvscStopPavilionBtn').style.display = ''; autoPavilionLoop().finally(function() { document.getElementById('lvscAutoPavilionBtn').style.display = ''; document.getElementById('lvscStopPavilionBtn').style.display = 'none'; }); };
                var pStop = document.getElementById('lvscStopPavilionBtn'); if (pStop) pStop.onclick = stopPavilion;
                // 配置导入导出按钮
            (function() {
                var p = document.querySelector('[data-tab-panel="update"]');
                if (!p) return;
                var div = el('div'); div.style.cssText = 'display:flex;gap:6px;margin-top:6px';
                var expBtn = el('button'); expBtn.textContent = '导出配置'; expBtn.className = 'lvsc-action-btn'; expBtn.style.cssText = 'flex:1;height:32px';
                var impBtn = el('button'); impBtn.textContent = '导入配置'; impBtn.className = 'lvsc-action-btn'; impBtn.style.cssText = 'flex:1;height:32px';
                div.appendChild(expBtn); div.appendChild(impBtn);
                p.appendChild(div);
                expBtn.onclick = exportConfig; impBtn.onclick = importConfig;
            })();

            setTimeout(refreshPavilionItems, 2000);

                // 批量用符
                var tStart = document.getElementById('lvscStartTalismanBtn'); if (tStart) tStart.onclick = autoTalismanLoop;
                var tStop = document.getElementById('lvscStopTalismanBtn'); if (tStop) tStop.onclick = stopTalisman;

                // 气运/突破/本源/出售
                var ml = document.getElementById('lvscMinLuck'); if (ml) { ml.value = state.minLuck; ml.onchange = function() { state.minLuck = Math.max(1, Math.min(10, Number(this.value)||5)); persistSetting('lvSpiritCleaner.minLuck', String(state.minLuck)); }; }
                var lm = document.getElementById('lvscLuckRefreshMethod'); if (lm) { lm.value = state.luckRefreshMethod || 'stone'; lm.onchange = function() { state.luckRefreshMethod = this.value; persistSetting('lvSpiritCleaner.luckRefreshMethod', this.value); }; }
                var lrStart = document.getElementById('lvscLuckRefreshStartBtn'); if (lrStart) lrStart.onclick = function() { autoRefreshLuckLoop(); };
                var lrStop = document.getElementById('lvscLuckRefreshStopBtn'); if (lrStop) lrStop.onclick = stopLuckRefresh;
                updateLuckDisplay();
                // 探索模式
                var emApi = document.getElementById('lvscExploreModeApi');
                var emSys = document.getElementById('lvscExploreModeSystem');
                if (emApi) { emApi.checked = state.exploreMode === 'api'; emApi.onchange = function() { if (this.checked) { state.exploreMode = 'api'; persistSetting('lvSpiritCleaner.exploreMode', 'api'); } }; }
                if (emSys) { emSys.checked = state.exploreMode === 'system'; emSys.onchange = function() { if (this.checked) { state.exploreMode = 'system'; persistSetting('lvSpiritCleaner.exploreMode', 'system'); } }; }
                var ag = document.getElementById('lvscAggressiveMode');
                if (ag) { ag.checked = state.aggressiveMode; ag.onchange = function() { state.aggressiveMode = this.checked; persistSetting('lvSpiritCleaner.aggressiveMode', this.checked); }; }
                var sumCb = document.getElementById('lvscSummerOnlyAdvancedMeditate');
                if (sumCb) { sumCb.checked = state.summerOnlyAdvancedMeditate; sumCb.onchange = function() { state.summerOnlyAdvancedMeditate = this.checked; persistSetting('lvSpiritCleaner.summerOnlyAdvancedMeditate', this.checked); }; }
                var bt = document.getElementById('lvscAutoBreakthrough'); if (bt) { bt.checked = state.autoBreakthrough; bt.onchange = function() { state.autoBreakthrough = this.checked; persistSetting('lvSpiritCleaner.autoBreakthrough', this.checked); }; }
                var or = document.getElementById('lvscAutoOriginRepair'); if (or) { or.checked = state.autoOriginRepair; or.onchange = function() { state.autoOriginRepair = this.checked; persistSetting('lvSpiritCleaner.autoOriginRepair', this.checked); }; }
                // 出售 & 分解
                var deCb = document.getElementById('lvscAutoDisposeEnabled');
                if (deCb) { deCb.checked = state.autoDisposeEnabled; deCb.onchange = function() { state.autoDisposeEnabled = this.checked; persistSetting('lvSpiritCleaner.autoDisposeEnabled', this.checked); }; }
                var synCb = document.getElementById('lvscAutoSynthesize');
                if (synCb) { synCb.checked = state.autoSynthesize; synCb.onchange = function() { state.autoSynthesize = this.checked; persistSetting('lvSpiritCleaner.autoSynthesize', this.checked); }; }
                var deIntv = document.getElementById('lvscAutoDisposeInterval'); if (deIntv) { deIntv.value = state.autoDisposeInterval || 300; deIntv.onchange = function() { state.autoDisposeInterval = Math.max(60, Number(this.value)||300); persistSetting('lvSpiritCleaner.autoDisposeInterval', String(state.autoDisposeInterval)); }; }
                var dsStart = document.getElementById('lvscDisposeStartBtn');
                if (dsStart) dsStart.onclick = function() { this.style.display = 'none'; document.getElementById('lvscDisposeStopBtn').style.display = ''; autoDisposeLoop(); };
                var dsStop = document.getElementById('lvscDisposeStopBtn');
                if (dsStop) dsStop.onclick = stopDispose;
                // 重新渲染规则列表 + 自动状态 + 运行状态
                if (window._renderDisposeRules) window._renderDisposeRules();
                if (window._renderAutoStatus) window._renderAutoStatus();
                if (window._renderRunningMonitors) window._renderRunningMonitors();
                // 涅槃丹
                var nirvCb = document.getElementById('lvscAutoNirvanaPill');
                if (nirvCb) { nirvCb.checked = state.autoNirvanaPill; nirvCb.onchange = function() { state.autoNirvanaPill = this.checked; persistSetting('lvSpiritCleaner.autoNirvanaPill', this.checked); }; }
                var nirvRarity = document.getElementById('lvscNirvanaRarity');
                if (nirvRarity) { nirvRarity.value = String(state.nirvanaRarity || 3); nirvRarity.onchange = function() { state.nirvanaRarity = Number(this.value); persistSetting('lvSpiritCleaner.nirvanaRarity', String(state.nirvanaRarity)); }; }
                var nirvQty = document.getElementById('lvscNirvanaCraftQty');
                if (nirvQty) { nirvQty.value = state.nirvanaCraftQty || 1; nirvQty.onchange = function() { state.nirvanaCraftQty = Math.max(1, Math.min(999, Number(this.value)||1)); persistSetting('lvSpiritCleaner.nirvanaCraftQty', String(state.nirvanaCraftQty)); }; }

                // 扫荡
                var swStart = document.getElementById('lvscSweepStartBtn');
                if (swStart) swStart.onclick = function() { this.style.display = 'none'; document.getElementById('lvscSweepStopBtn').style.display = ''; autoSweepLoop(); };
                var swStop = document.getElementById('lvscSweepStopBtn'); if (swStop) swStop.onclick = stopSweep;
            }, 100);
        })();} catch(e) { console.warn('feature injection err', e); }
    }

    function waitForGame() {
        if (document.body && (window.api || window._lastPlayerData || document.getElementById('exploreBtn'))) {
            buildPanel();
            // 刷新后自动恢复运行状态（冥想中不打断，转监测等收功）
            var wasRunning = localStorage.getItem('lvSpiritCleaner.wasRunning') === '1';
            if (wasRunning && !running) {
                setTimeout(function() {
                    var p = getPlayer() || {};
                    if (p.isMeditating) {
                        // 正在冥想中，不打断，启动监测模式等收功后自动衔接
                        setStatus('刷新检测：冥想中，转入监测', 'run');
                        monitorSpiritLoop();
                        return;
                    }
                    if (state.exploreMode === 'system') { systemExploreLoop(); }
                    else { runLoop(); }
                }, 2000);
            }
            return;
        }
        setTimeout(waitForGame, 800);
    }

    waitForGame();
})();`;

    var script = document.createElement('script');
    script.textContent = source;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
})();
