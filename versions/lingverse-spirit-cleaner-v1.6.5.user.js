// ==UserScript==
// @name         LingVerse Spirit Cleaner
// @namespace    local.lingverse.tools
// @version      1.6.5
// @description  Authorized helper: spend LingVerse spirit, handle merchants, hire protectors, meditate, and maintain Void Body buff.
// @match        https://ling.muge.info/*
// @match        http://ling.muge.info/*
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

    // 拉取区域名缓存（放外层，不受 shield.js 影响）
    if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://ling.muge.info/api/game/areas',
            timeout: 15000,
            onload: function(resp) {
                try {
                    var d = JSON.parse(resp.responseText);
                    if (d && d.code === 200 && Array.isArray(d.data)) {
                        var m = {};
                        d.data.forEach(function(a) { if (a.id && a.name) m[a.id] = {n:a.name, c:a.continent||''}; });
                        localStorage.setItem('lvscAreaNameCache', JSON.stringify(m));
                        localStorage.setItem('lvscAreaNameCacheRaw', JSON.stringify(d.data));
                        window.dispatchEvent(new CustomEvent('lvsc:areas-loaded'));
                    }
                } catch(_) {}
            }
        });
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
    var autoMysteryBoxRunning = false;
    var autoInscriptionRunning = false;
    var autoCraftRunning = false;
    var autoCraftTimerInterval = null;
    var autoNirvanaRunning = false;
    var autoNirvanaTimerInterval = null;
    var _autoPetHealTimer = null;

    async function fetchRecipes(type) {
        if (!gameApi()) return [];
        var ep = type === 'alchemy' ? '/api/game/alchemy/recipes' : type === 'talisman' ? '/api/game/talisman/recipes' : '/api/game/forge/recipes';
        try {
            var res = await Promise.race([
                gameApi().get(ep),
                new Promise(function(_, reject) { setTimeout(function() { reject(new Error('timeout')); }, 10000); })
            ]);
            if (res && res.code === 200) {
                if (Array.isArray(res.data)) return res.data;
                if (res.data && Array.isArray(res.data.recipes)) return res.data.recipes;
                if (res.data && Array.isArray(res.data.items)) return res.data.items;
                if (res.data && Array.isArray(res.data.list)) return res.data.list;
                var arr = [];
                for (var k in res.data) { if (res.data.hasOwnProperty(k) && !isNaN(Number(k))) arr.push(res.data[k]); else if (res.data.hasOwnProperty(k) && typeof res.data[k] === 'object' && res.data[k] !== null) arr.push(res.data[k]); }
                if (arr.length) return arr;
            }
            console.log('[fetchRecipes] unexpected format', JSON.stringify(res).substring(0, 300));
        } catch (e) { console.log('[fetchRecipes] error', e && e.message ? e.message : String(e)); }
        return [];
    }
    function getCraftItemId(recipe, type) {
        return String(type === 'alchemy' ? (recipe.pillId || recipe.id || '') : (recipe.recipeId || recipe.id || ''));
    }
    function getCraftItemName(recipe, type) {
        return recipe.pillName || recipe.name || recipe.itemName || '';
    }
    function getItemQuality(item) {
        var v = item.rarity || item.quality || item.grade || item.qualityLevel || item.itemQuality || item.tier || item.star || 0;
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
            var n = Number(v);
            if (Number.isFinite(n)) return n;
            var map = {'普通': 1, '优良': 2, '稀有': 3, '史诗': 4, '传说': 5};
            return map[v] || 0;
        }
        return 0;
    }
    function itemMatchesCraft(item, recipeId, name) {
        var itemName = String(item.name || item.itemName || '');
        var recipeName = String(name || '');
        // 优先用名称匹配（配方ID和物品templateId格式不同）
        if (itemName && recipeName && itemName.indexOf(recipeName) >= 0) return true;
        if (itemName && recipeName && recipeName.indexOf(itemName) >= 0) return true;
        // 备用：比较templateId
        var itemId = String(item.templateId || item.id || '');
        if (itemId && String(recipeId) && itemId === String(recipeId)) return true;
        return false;
    }
    var _craftStats = { total: 0, startCount: 0 };
    async function autoCraftLoop() {
        if (autoCraftRunning) { setStatus('炼制已在运行', 'warn'); return; }
        if (autoInscriptionRunning) { setStatus('铭文洗练中，停止后再炼制', 'warn'); return; }
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
craftLog('开始炼制: ' + name + ' | 目标' + target + '次' + (autoBuy ? ' | 自动买材料' : ''));
        setStatus('开始炼制: ' + name + ' 目标' + target, 'run');
        // 每次炼制数量：用户设了就用（受游戏上限约束），没设用游戏上限
        var gameCap = 100;
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
            var craftEp = type === 'alchemy' ? '/api/game/alchemy/batch-craft' : type === 'talisman' ? '/api/game/talisman/batch-craft' : '/api/game/forge/batch-craft';
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
        if (state.craftAutoTimer) updateNextAutoCraftTime();
    }
    function stopCraft() {
        autoCraftRunning = false;
        updateMeter();
        setStatus('炼制已停止', 'idle');
        if (state.craftAutoTimer) updateNextAutoCraftTime();
    }
    function updateNextAutoCraftTime() {
        var now = Date.now();
        state.nextAutoCraftTime = now + state.craftTimerMin * 60000;
        persistSetting('lvSpiritCleaner.nextAutoCraftTime', String(state.nextAutoCraftTime));
    }
function startAutoCraftTimer() {
    if (autoCraftTimerInterval) clearInterval(autoCraftTimerInterval);
    if (state.craftAutoTimer) {
        // 页面加载或重启时，重新计算下次炼制时间，避免使用过期的旧时间
        updateNextAutoCraftTime();
    }
    autoCraftTimerInterval = setInterval(function () {
        if (!state.craftAutoTimer) return;
        if (autoCraftRunning || autoInscriptionRunning) return;
        if (!state.craftRecipeId || !gameApi()) return;
        var now = Date.now();
        if (now >= state.nextAutoCraftTime) {
            console.log('[AutoCraftTimer] 触发定时炼制，模式:', state.craftTimerMode);
            if (state.craftTimerMode === 'quality') {
                autoQualityCraftLoop();
            } else {
                autoCraftLoop();
            }
            updateNextAutoCraftTime();
        }
    }, 1000);
}
    // --- 品质炼制 ---
    async function autoQualityCraftLoop() {
        if (autoCraftRunning || autoInscriptionRunning) return;
        syncSettingsFromUi();
        if (!state.craftRecipeId || !gameApi()) { setStatus('请先选择配方', 'warn'); return; }
        var qualTarget = state.craftQualityTarget || 0;
        var qualNeed = state.craftQualityCount || 0;
        if (!qualTarget || !qualNeed) { setStatus('请设置品质目标和个数', 'warn'); return; }
        autoCraftRunning = true;
        var type = state.craftType; var recipeId = state.craftRecipeId; var autoBuy = state.craftAutoBuyMats;
        var QUAL_NAMES = ['','普通','优良','稀有','史诗','传说'];
        updateMeter();
        var recipes = await fetchRecipes(type);
        var recipe = null;
        for (var ri = 0; ri < recipes.length; ri++) { if (getCraftItemId(recipes[ri], type) === recipeId) { recipe = recipes[ri]; break; } }
        if (!recipe) { setStatus('未找到配方', 'warn'); autoCraftRunning = false; return; }
        var name = getCraftItemName(recipe, type);
        var gameCap = 100;
        var batchCap = state.craftBatchSize > 0 ? Math.min(state.craftBatchSize, gameCap) : gameCap;
        var totalCrafted = 0, qualMet = 0;
        craftLog('品质炼制: ' + name + ' | 目标' + QUAL_NAMES[qualTarget] + '×' + qualNeed + (autoBuy ? ' | 自动买材料' : ''));
        setStatus('品质炼制: ' + name + ' ' + QUAL_NAMES[qualTarget] + '×' + qualNeed, 'run');
        // 先查背包，已有足够数量就不炼制
        // 先查背包，已有足够数量就不炼制
        try {
            var initChk = await gameApi().get('/api/game/inventory/category?tab=all&page=1&size=200');
            if (!initChk || initChk.code !== 200 || !initChk.data || !Array.isArray(initChk.data.items)) {
                craftLog('错误: 无法获取背包数据 (code=' + (initChk ? initChk.code : 'null') + ', items=' + (initChk && initChk.data ? (Array.isArray(initChk.data.items) ? initChk.data.items.length : 'not array') : 'null') + ')');
                setStatus('获取背包失败', 'warn');
                autoCraftRunning = false;
                updateMeter();
                return;
            }
            var invArr = initChk.data.items;
            for (var iqi = 0; iqi < invArr.length; iqi++) {
                var iqit = invArr[iqi];
                if (itemMatchesCraft(iqit, recipeId, name)) {
                    if (getItemQuality(iqit) >= qualTarget) qualMet += Number(iqit.quantity || iqit.count || 1);
                }
            }
        } catch (e) {
            craftLog('错误: 获取背包异常 ' + (e.message || ''));
            autoCraftRunning = false;
            updateMeter();
            return;
        }
        if (qualMet >= qualNeed) {
            craftLog('已有足量，无需炼制! ' + QUAL_NAMES[qualTarget] + qualMet + '件');
            setStatus('品质炼制: 已有足量', 'run');
            autoCraftRunning = false;
            updateMeter();
            if (state.craftAutoTimer) updateNextAutoCraftTime();
            return;
        }
        while (autoCraftRunning && qualMet < qualNeed) {
            if (autoBuy && recipe.materials && recipe.materials.length) {
                for (var mi = 0; mi < recipe.materials.length; mi++) {
                    var mat = recipe.materials[mi];
                    var needed = Math.max(0, (mat.required || mat.amount || 1) * batchCap);
                    if (needed > 0) { try { await gameApi().post('/api/game/craft/quick-buy-mats', { type: type, id: recipeId, amount: needed }); } catch (_) {} await sleep(1500 + Math.floor(Math.random() * 2500)); }
                }
            }
            var craftEp = type === 'alchemy' ? '/api/game/alchemy/batch-craft' : type === 'talisman' ? '/api/game/talisman/batch-craft' : '/api/game/forge/batch-craft';
            var craftKey = type === 'alchemy' ? 'pillId' : 'recipeId';
            var payload = {}; payload[craftKey] = recipeId; payload.count = batchCap;
            var craftRes = await gameApi().post(craftEp, payload);
            if (!craftRes || craftRes.code !== 200) { await sleep(2000); continue; }
            totalCrafted += batchCap;
            try {
                qualMet = 0;
                var chkRes = await gameApi().get('/api/game/inventory/category?tab=all&page=1&size=200');
                var chkArr = [];
                if (chkRes && chkRes.code === 200 && Array.isArray(chkRes.data && chkRes.data.items)) {
                    chkArr = chkRes.data.items;
                }
                if (Array.isArray(chkArr)) {
                    for (var qi = 0; qi < chkArr.length; qi++) {
                        var qit = chkArr[qi];
                        if (itemMatchesCraft(qit, recipeId, name)) {
                            if (getItemQuality(qit) >= qualTarget) qualMet += Number(qit.quantity || qit.count || 1);
                        }
                    }
                }
            } catch (e) {
                craftLog('错误: 获取背包异常 ' + (e.message || ''));
            }
            craftLog('炼+' + batchCap + ' | ' + QUAL_NAMES[qualTarget] + qualMet + '/' + qualNeed + ' | 总' + totalCrafted + '次');
            setStatus('品质炼制: ' + name + ' ' + QUAL_NAMES[qualTarget] + qualMet + '/' + qualNeed, 'run');
            await sleep(1500 + Math.floor(Math.random() * 2500));
        }
        autoCraftRunning = false;
        updateMeter();
        if (qualMet >= qualNeed) { craftLog('完成! ' + QUAL_NAMES[qualTarget] + qualMet + '件'); setStatus('品质炼制完成', 'run'); }
        else { setStatus('品质炼制停止', 'idle'); }
        if (state.craftAutoTimer) updateNextAutoCraftTime();
    }

    // --- 功法洗练 ---
    var autoSkillWashRunning = false;
    async function fetchSkillList(scope) {
        if (!gameApi()) return [];
        try { var r = await gameApi().get('/api/custom-skill/list?scope=' + (scope || 'body')); return (r && r.code === 200 && r.data && Array.isArray(r.data.skills)) ? r.data.skills : []; } catch (_) { return []; }
    }
    async function autoSkillWashLoop() {
        if (autoSkillWashRunning || !gameApi()) return;
        syncSettingsFromUi();
        if (!state.skillWashSkillId || !state.skillWashSlot) { setStatus('请选择功法和槽位', 'warn'); return; }
        if (!state.skillWashTargetType) { setStatus('请填写目标词条', 'warn'); return; }
        autoSkillWashRunning = true;
        var scope = state.skillWashScope || 'body';
        var skillId = state.skillWashSkillId;
        var slotIdx = state.skillWashSlot;
        var stoneQ = state.skillWashStoneQuality || 1;
        var targetType = (state.skillWashTargetType || '').trim();
        var targetMin = (state.skillWashTargetMin || '').trim();
        // 支持多词条：空格/逗号分隔
        var targetTypes = targetType ? targetType.split(/[\s,]+/).filter(Boolean) : [];
        var targetMins = targetMin ? targetMin.split(/[\s,]+/).filter(Boolean).map(function(v) { return parseFloat(v.replace('%', '')) || 0; }) : [];
        var count = 0, lastAffix = '';
        // 构建目标描述：燃血≥22%  攻击≥2.7
        var targetDesc = '';
        if (targetTypes.length > 0) {
            var parts = [];
            for (var tdi = 0; tdi < targetTypes.length; tdi++) {
                var p = targetTypes[tdi];
                if (tdi < targetMins.length) p += '≥' + targetMins[tdi];
                parts.push(p);
            }
            targetDesc = parts.join('  ');
        }
        skillWashLog('开始洗练 槽位' + slotIdx + ' 品质' + stoneQ + ' 目标:' + targetDesc);
        setStatus('功法洗练中...', 'run');
        var startBtn = document.getElementById('lvscSkillWashStartBtn');
        var stopBtn = document.getElementById('lvscSkillWashStopBtn');
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = '';
        while (autoSkillWashRunning) {
            try {
                // 找合适的洗炼石
                var invRes = await gameApi().get('/api/game/inventory/category?tab=all&page=1&size=200');
                var stoneItem = null;
                if (invRes && invRes.code === 200 && Array.isArray(invRes.data && invRes.data.items)) {
                    var invArr = invRes.data.items;
                    for (var si = 0; si < invArr.length; si++) {
                        var it = invArr[si];
                        var tid = String(it.templateId || '');
                        if (tid.indexOf('wash_stone_') >= 0 && (it.rarity || 0) >= stoneQ) {
                            stoneItem = it; break;
                        }
                    }
                }
                if (!stoneItem) { skillWashLog('没有符合品质' + stoneQ + '的洗炼石，停止'); break; }
                // 调洗练API
                var r = await gameApi().post('/api/custom-skill/wash', {
                    skillId: parseInt(skillId), slotIndex: parseInt(slotIdx),
                    stoneItemId: parseInt(stoneItem.id || stoneItem.itemId),
                    scope: scope, category: state.skillWashCategory || 'ATTACK'
                });
                count++;
                if (r && r.code === 200 && r.data) {
                    var d = r.data;
                    var newType = d.newAffixType || '';
                    var newAffix = d.newAffix || '';
                    var haystack = newType + ' ' + newAffix;
                    // 1:1 映射匹配：targetTypes[i] → targetMins[i]
                    var met = targetTypes.length === 0;
                    if (!met) {
                        var numMatch = newAffix.match(/([\d.]+)/);
                        var affixVal = numMatch ? parseFloat(numMatch[1]) : NaN;
                        for (var ti = 0; ti < targetTypes.length; ti++) {
                            if (haystack.indexOf(targetTypes[ti]) >= 0) {
                                if (ti < targetMins.length) {
                                    if (!isNaN(affixVal) && affixVal >= targetMins[ti]) { met = true; break; }
                                } else { met = true; break; }
                            }
                        }
                    }
                    lastAffix = newAffix;
                    skillWashLog((met ? '✓' : '  ') + ' 第' + count + '次: ' + newAffix + ' (' + (d.oldAffix||'?') + '→' + newType + ')');
                    if (met) { skillWashLog('达标! ' + newAffix); break; }
                } else {
                    skillWashLog('✗ 失败: ' + ((r && r.message) || '未知'));
                    break;
                }
            } catch (e) { skillWashLog('✗ 异常: ' + (e.message || '')); break; }
            await sleep(500 + Math.floor(Math.random() * 800));
        }
        autoSkillWashRunning = false;
        if (startBtn) startBtn.style.display = '';
        if (stopBtn) stopBtn.style.display = 'none';
        setStatus('功法洗练' + (lastAffix ? '完成' : '停止'), 'run');
    }
    function stopSkillWash() { autoSkillWashRunning = false; }
    function skillWashLog(msg) { var l = document.getElementById('lvscSkillWashLog'); if (!l) return; var t = new Date().toLocaleTimeString(); l.textContent = '[' + t + '] ' + msg + '\n' + (l.textContent || ''); if (l.textContent.length > 4000) l.textContent = l.textContent.substring(0, 4000); }
    function washStoneLog(msg) { var l = document.getElementById('lvscWashStoneUpgradeLog'); if (!l) return; var t = new Date().toLocaleTimeString(); l.textContent = '[' + t + '] ' + msg + '\n' + (l.textContent || ''); if (l.textContent.length > 4000) l.textContent = l.textContent.substring(0, 4000); }

    // --- 洗炼石一键升品（独立监控循环） --
    var autoWashStoneUpgradeRunning = false;
    async function autoUpgradeWashStonesLoop() {
        if (autoWashStoneUpgradeRunning) return;
        if (!gameApi()) { setStatus('API不可用', 'warn'); return; }
        autoWashStoneUpgradeRunning = true;
        try { localStorage.setItem('lvSpiritCleaner.washStoneUpgradeRunning', '1'); } catch(_) {}
        updateMeter();
        var startBtn = document.getElementById('lvscWashStoneUpgradeStartBtn');
        var stopBtn = document.getElementById('lvscWashStoneUpgradeStopBtn');
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = '';
        washStoneLog('洗炼石升品监控启动');
        while (autoWashStoneUpgradeRunning) {
            try {
                var invRes = await gameApi().get('/api/game/inventory/category?tab=all&page=1&size=200');
                if (!invRes || invRes.code !== 200 || !invRes.data || !Array.isArray(invRes.data.items)) { await sleep(3000); continue; }
                var stones = [];
                for (var si = 0; si < invRes.data.items.length; si++) {
                    var it = invRes.data.items[si];
                    var tid = String(it.templateId || '');
                    if (tid.indexOf('wash_stone_') >= 0 && (it.rarity || 0) < 5) {
                        stones.push({ id: it.id || it.itemId, rarity: it.rarity || 0, name: it.name || tid, quantity: it.quantity || 1 });
                    }
                }
                if (!stones.length) { await sleep((state.washStoneMonitorInterval || 30) * 1000); continue; }
                stones.sort(function(a,b){ return a.rarity - b.rarity; });
                var upgraded = false;
                for (var si = 0; si < stones.length; si++) {
                    if (upgraded) break;
                    var s = stones[si];
                    if (s.quantity >= 5) {
                        var times = Math.floor(s.quantity / 5);
                        washStoneLog('🔃 升品: ' + s.name + ' ×' + s.quantity + '颗 → 升' + times + '次');
                        var r = await gameApi().post('/api/custom-skill/upgrade-wash-stone', { washStoneItemId: parseInt(s.id), times: times });
                        if (r && r.code === 200) {
                            washStoneLog('✅ 升品成功: ' + (r.data||''));
                            upgraded = true;
                        } else {
                            washStoneLog('❌ 接口返回: ' + JSON.stringify(r));
                        }
                    }
                }
                if (!upgraded) {
                    var total = 0; for (var si = 0; si < stones.length; si++) total += stones[si].quantity;
                    if (total === 0) { await sleep((state.washStoneMonitorInterval || 30) * 1000); continue; }
                    washStoneLog('⏳ 不足5颗(共' + total + '颗)，' + (state.washStoneMonitorInterval || 30) + '秒后再扫');
                    await sleep((state.washStoneMonitorInterval || 30) * 1000);
                    continue;
                }
            } catch (e) { washStoneLog('❌ 错误: ' + (e.message || '异常')); }
            await sleep(2000);
        }
        autoWashStoneUpgradeRunning = false;
        try { localStorage.setItem('lvSpiritCleaner.washStoneUpgradeRunning', '0'); } catch(_) {}
        if (startBtn) startBtn.style.display = '';
        if (stopBtn) stopBtn.style.display = 'none';
        updateMeter();
        washStoneLog('洗炼石升品监控停止');
    }
    function stopWashStoneUpgrade() { autoWashStoneUpgradeRunning = false; }
        // --- 丹药自动升阶（独立监控循环） ---
    var autoPillUpgradeRunning = false;
    async function autoUpgradePillsLoop() {
        if (autoPillUpgradeRunning) return;
        if (!gameApi()) { setStatus('API不可用', 'warn'); return; }
        autoPillUpgradeRunning = true;
        try { localStorage.setItem('lvSpiritCleaner.pillUpgradeRunning', '1'); } catch(_) {}
        updateMeter();
        var startBtn = document.getElementById('lvscPillUpgradeStartBtn');
        var stopBtn = document.getElementById('lvscPillUpgradeStopBtn');
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = '';
        pillUpgradeLog('丹药升阶监控启动');
        while (autoPillUpgradeRunning) {
            var interval = (state.pillUpgradeMonitorInterval || 30) * 1000;
            try {
                var upRes = await gameApi().get('/api/game/alchemy/upgradeable-pills');
                if (!upRes || upRes.code !== 200 || !Array.isArray(upRes.data) || upRes.data.length === 0) {
                    pillUpgradeLog('⏳ 无可升阶丹药，' + (state.pillUpgradeMonitorInterval || 30) + '秒后再检查');
                    await sleep(interval);
                    continue;
                }
                var totalPills = 0;
                for (var pi = 0; pi < upRes.data.length; pi++) {
                    var p = upRes.data[pi];
                    if (p.grades) {
                        for (var gi = 0; gi < p.grades.length; gi++) {
                            totalPills += (p.grades[gi].qty || 0);
                        }
                    }
                }
                pillUpgradeLog('🔃 发现' + upRes.data.length + '种可升阶丹药，共' + totalPills + '颗，执行升阶...');
                var r = await gameApi().post('/api/game/items/synthesize-batch');
                if (r && r.code === 200) {
                    pillUpgradeLog('✅ ' + (r.data || '升阶成功'));
                } else {
                    var msg = (r && r.message) ? r.message : JSON.stringify(r);
                    pillUpgradeLog('❌ ' + msg);
                }
            } catch (e) { pillUpgradeLog('❌ 错误: ' + (e.message || '异常')); }
            await sleep(interval);
        }
        autoPillUpgradeRunning = false;
        try { localStorage.setItem('lvSpiritCleaner.pillUpgradeRunning', '0'); } catch(_) {}
        if (startBtn) startBtn.style.display = '';
        if (stopBtn) stopBtn.style.display = 'none';
        updateMeter();
        pillUpgradeLog('丹药升阶监控停止');
    }
    function stopPillUpgrade() { autoPillUpgradeRunning = false; }
    function pillUpgradeLog(msg) { var l = document.getElementById('lvscPillUpgradeLog'); if (!l) return; var t = new Date().toLocaleTimeString(); l.textContent = '[' + t + '] ' + msg + '\n' + (l.textContent || ''); if (l.textContent.length > 4000) l.textContent = l.textContent.substring(0, 4000); }

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
    var SCRIPT_VERSION = '1.6.5';
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
        var realm = p.realmLevelName || p.realmName || p.realm || '?';
        var pct = 0;
        if (p.cultivationNeeded > 0) {
            pct = Math.min(100, (p.cultivation || 0) / p.cultivationNeeded * 100);
        }
        return realm + ' ' + pct.toFixed(1) + '%';
    }
    // 地图名缓存（优先 localStorage，其次 API，兜底空）
    var _areaNameCache = {};
    function loadAreaNameCache() {
        function _refresh() {
            try { var s = localStorage.getItem('lvscAreaNameCache'); if (s) { _areaNameCache = JSON.parse(s); refreshReviveAreaSelect(); } } catch(_) {}
        }
        _refresh();
        window.addEventListener('lvsc:areas-loaded', _refresh);
    }
    function getCurrentAreaName() {
        var p = getPlayer() || {};
        // 优先用游戏自带的 areaName（中文）
        if (p.areaName && p.areaName.length < 20) return p.areaName;
        // 页面 DOM 显示的区域名
        var statEl = document.getElementById('statArea');
        if (statEl) { var t = (statEl.textContent || '').trim(); if (t && t.length < 20) return t; }
        // 玩家对象其他字段
        var name = p.currentArea || p.area || p.zone || p.location || p.currentZone || '';
        if (name && !/^[a-zA-Z_]+$/.test(name)) return name;
        // 缓存翻译（新格式 {id: {n:name, c:continent}}）
        if (p.currentArea && _areaNameCache[p.currentArea] && _areaNameCache[p.currentArea].n) return _areaNameCache[p.currentArea].n;
        if (name && _areaNameCache[name] && typeof _areaNameCache[name] === 'string') return _areaNameCache[name];
        // 兜底：从游戏全局变量 _mapAllAreas 查找
        try {
            if (typeof _mapAllAreas !== 'undefined' && Array.isArray(_mapAllAreas) && p.currentArea) {
                for (var _ai = 0; _ai < _mapAllAreas.length; _ai++) {
                    if (_mapAllAreas[_ai].id === p.currentArea) return _mapAllAreas[_ai].name || p.currentArea;
                }
            }
        } catch(_) {}
        return name || '未知区域';
    }
    var autoBailRunning = false;
    var autoFarmRunning = false;
    var autoPavilionRunning = false;
    var autoTalismanRunning = false;

function nirvanaLog(msg) {
    var l = document.getElementById('lvscNirvanaLog');
    if (!l) return;
    var t = new Date().toLocaleTimeString();
    l.textContent = '[' + t + '] ' + msg + '\n' + (l.textContent || '');
    if (l.textContent.length > 4000) l.textContent = l.textContent.substring(0, 4000);
}
function updateNextAutoNirvanaTime() {
    var now = Date.now();
    state.nirvanaNextTimerTime = now + state.nirvanaTimerMin * 60000;
    persistSetting('lvSpiritCleaner.nirvanaNextTimerTime', String(state.nirvanaNextTimerTime));
}
function startAutoNirvanaTimer() {
    if (autoNirvanaTimerInterval) clearInterval(autoNirvanaTimerInterval);
    if (state.nirvanaAutoTimer) {
        updateNextAutoNirvanaTime();
    }
    autoNirvanaTimerInterval = setInterval(function () {
        if (!state.nirvanaAutoTimer) return;
        if (autoNirvanaRunning) return;
        if (!gameApi()) return;
        var now = Date.now();
        if (now >= state.nirvanaNextTimerTime) {
            console.log('[AutoNirvana] 触发定时炼制');
            autoNirvanaLoop();
            updateNextAutoNirvanaTime();
        }
    }, 1000);
}
function stopNirvana() {
    autoNirvanaRunning = false;
    if (autoNirvanaTimerInterval) { clearInterval(autoNirvanaTimerInterval); autoNirvanaTimerInterval = null; }
    updateMeter();
    var btn = document.getElementById('lvscAutoNirvanaBtn');
    var stopBtn = document.getElementById('lvscStopNirvanaBtn');
    if (btn) btn.style.display = '';
    if (stopBtn) stopBtn.style.display = 'none';
    setStatus('涅槃丹已停止', 'idle');
}
async function autoNirvanaLoop() {
    if (autoNirvanaRunning) return;
    autoNirvanaRunning = true;
    syncSettingsFromUi();
    if (!gameApi()) {
        setStatus('API不可用', 'warn');
        autoNirvanaRunning = false;
        updateMeter();
        return;
    }

    var targetQuality = state.nirvanaQualityTarget || 5;
    var targetCount = state.nirvanaQualityCount || 10;
    var batchSize = state.nirvanaBatchSize || 10;
    var useQty = state.nirvanaUseQty || 1;

    updateMeter();

// 获取配方信息
var recipes = await fetchRecipes('alchemy');
var recipe = null;
if (state.nirvanaRecipeId) {
    for (var ri = 0; ri < recipes.length; ri++) {
        if (getCraftItemId(recipes[ri], 'alchemy') === state.nirvanaRecipeId) {
            recipe = recipes[ri];
            break;
        }
    }
}
    if (!recipe) {
        setStatus('未找到涅槃丹配方，请在自动tab涅槃面板选择配方', 'warn');
        autoNirvanaRunning = false;
        updateMeter();
        return;
    }
// 如果还没找到，再放宽条件找包含涅槃/重生的（最后兜底）
if (!recipe) {
    for (var ri = 0; ri < recipes.length; ri++) {
        var r = recipes[ri];
        var name = (getCraftItemName(r, 'alchemy') || '').toLowerCase();
        var id = String(getCraftItemId(r, 'alchemy') || '').toLowerCase();
        if (name.indexOf('涅槃') >= 0 || name.indexOf('重生') >= 0 || id.indexOf('nirvana') >= 0 || id.indexOf('rebirth') >= 0) {
            recipe = r;
            state.nirvanaRecipeId = getCraftItemId(r, 'alchemy');
            persistSetting('lvSpiritCleaner.nirvanaRecipeId', state.nirvanaRecipeId);
            break;
        }
    }
}
    if (!recipe) {
        setStatus('未找到涅槃丹配方', 'warn');
        autoNirvanaRunning = false;
        updateMeter();
        return;
    }

    var name = getCraftItemName(recipe, 'alchemy');
    var QUAL_NAMES = ['','普通','优良','稀有','史诗','传说'];
    nirvanaLog('开始炼制: ' + name + ' | 目标' + targetCount + '个' + QUAL_NAMES[targetQuality]);
    setStatus('开始炼制: ' + name + ' 目标' + targetCount, 'run');

    // 检查当前背包中达标数量
    var invRes = await gameApi().get('/api/game/inventory/category?tab=all&page=1&size=200');
    var current = 0;
    if (invRes && invRes.code === 200 && Array.isArray(invRes.data && invRes.data.items)) {
        for (var ii = 0; ii < invRes.data.items.length; ii++) {
            var item = invRes.data.items[ii];
            if (String(item.templateId || '') === state.nirvanaRecipeId || (item.name || item.itemName || '').indexOf(name) >= 0) {
                if ((item.rarity || 0) >= targetQuality) {
                    current += Number(item.quantity || item.count || 1);
                }
            }
        }
    } else {
        nirvanaLog('[错误] 背包API获取异常，请检查');
        setStatus('背包API异常', 'warn');
        autoNirvanaRunning = false;
        updateMeter();
        return;
    }

if (current >= targetCount) {
    nirvanaLog('已有 ' + current + ' 件达标，尝试使用');
    var used = await useNirvanaPills(useQty);
    if (used) {
        nirvanaLog('成功使用 ' + useQty + ' 个涅槃丹');
    } else {
        nirvanaLog('使用失败，可能已达效果上限，跳过并等待下次');
    }
    if (state.nirvanaAutoTimer) updateNextAutoNirvanaTime();
    autoNirvanaRunning = false;
    updateMeter();
    var btn = document.getElementById('lvscAutoNirvanaBtn');
    var stopBtn = document.getElementById('lvscStopNirvanaBtn');
    if (btn) btn.style.display = '';
    if (stopBtn) stopBtn.style.display = 'none';
    return;
}

var needCraft = targetCount - current;

    while (autoNirvanaRunning && needCraft > 0) {
        var batchCount = batchSize;
        // 自动补充材料
        if (recipe.materials && recipe.materials.length) {
            for (var mi = 0; mi < recipe.materials.length; mi++) {
                var mat = recipe.materials[mi];
                var needed = Math.max(0, (mat.required || mat.amount || 1) * batchCount);
                if (needed > 0) {
                    try { await gameApi().post('/api/game/craft/quick-buy-mats', { type: 'alchemy', id: state.nirvanaRecipeId, amount: needed }); } catch (_) {}
                    await sleep(300);
                }
            }
        }
        var craftRes = await gameApi().post('/api/game/alchemy/batch-craft', { pillId: state.nirvanaRecipeId, count: batchCount });
        if (!craftRes || craftRes.code !== 200) {
            nirvanaLog('失败: ' + ((craftRes && craftRes.message) || '未知'));
            setStatus('炼制失败', 'warn');
            await sleep(2000);
            continue;
        }

    var actualCount = Number(craftRes.data && craftRes.data.craftCount) || batchCount;

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
    nirvanaLog('炼+' + actualCount + ' | 品质:' + (parts.length ? parts.join(' ') : '未知') + ' | 还需' + needCraft + '个传说');
    setStatus('炼制: ' + name + ' 还需' + needCraft + '个传说', 'run');

    // 炼制后重新检查背包达标数量
    var invRes2 = await gameApi().get('/api/game/inventory/category?tab=all&page=1&size=200');
    var currentAfterCraft = 0;
    if (invRes2 && invRes2.code === 200 && Array.isArray(invRes2.data && invRes2.data.items)) {
        for (var ii = 0; ii < invRes2.data.items.length; ii++) {
            var item = invRes2.data.items[ii];
            if (String(item.templateId || '') === state.nirvanaRecipeId || (item.name || item.itemName || '').indexOf(name) >= 0) {
                if ((item.rarity || 0) >= targetQuality) {
                    currentAfterCraft += Number(item.quantity || item.count || 1);
                }
            }
        }
    } else {
        nirvanaLog('[错误] 背包API获取异常，请检查');
        setStatus('背包API异常', 'warn');
        break;
    }

if (currentAfterCraft >= targetCount) {
    nirvanaLog('已达 ' + currentAfterCraft + ' 件传说品质，开始使用...');
    var used = await useNirvanaPills(useQty);
    if (used) {
        nirvanaLog('成功使用 ' + useQty + ' 个涅槃丹');
    } else {
        nirvanaLog('使用失败，可能已达效果上限，跳过并等待下次');
    }
    if (state.nirvanaAutoTimer) updateNextAutoNirvanaTime();
    break;
}

    // 更新还需数量
    needCraft = Math.max(0, targetCount - currentAfterCraft);
    await sleep(600);
}

    autoNirvanaRunning = false;
    updateMeter();
    var btn = document.getElementById('lvscAutoNirvanaBtn');
    var stopBtn = document.getElementById('lvscStopNirvanaBtn');
    if (btn) btn.style.display = '';
    if (stopBtn) stopBtn.style.display = 'none';
    setStatus('涅槃丹炼制完成', 'run');
    if (state.nirvanaAutoTimer) updateNextAutoNirvanaTime();
}

async function ensureNirvanaPill() {
    if (!gameApi()) return;
    if (autoNirvanaRunning) return;
    // 只有开启定时炼制才自动炼制
    if (!state.nirvanaAutoTimer) return;
    // 如果定时炼制已开启且倒计时未结束，跳过（让定时器处理）
    if (state.nirvanaNextTimerTime > Date.now()) return;
    await autoNirvanaLoop();
}
    window.exportConfig = function exportConfig() {
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
    window.importConfig = function importConfig() {
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
    // 自动维持气运（监控模式，每5分钟检查一次）
    var autoMaintainLuckBusy = false;
    async function autoMaintainLuckCheck() {
        if (autoMaintainLuckBusy || !gameApi() || !state.autoMaintainLuck) return;
        autoMaintainLuckBusy = true;
        try {
            var p = getPlayer() || {};
            var curLuck = Number(p.luck || 0);
            updateLuckDisplay();
            if (curLuck >= state.minLuck) return;
            var useAd = state.luckRefreshMethod === 'ad';
            setStatus('气运 ' + curLuck + ' < ' + state.minLuck + '，自动刷新...', 'run', 'Luck');
            while (true) {
                var r = await gameApi().post('/api/game/refresh-luck', { useAdPoints: useAd });
                if (r && r.code === 200 && r.data) {
                    var newLuck = Number(r.data.newLuck || 0);
                    if (window._lastPlayerData) window._lastPlayerData.luck = newLuck;
                    updateLuckDisplay();
                    if (newLuck >= state.minLuck) { setStatus('气运达标: ' + newLuck + ' ≥ ' + state.minLuck, 'run', 'Luck'); break; }
                } else { break; }
                await sleep(1500);
            }
        } catch (_) {}
        autoMaintainLuckBusy = false;
    }
    async function autoBreakthroughCheck() { if (!gameApi() || Date.now() - _lastBreakCheck < 300000) return; _lastBreakCheck = Date.now(); var p = getPlayer() || {}; if (!(p.breakthroughRate >= 0)) return; try { setStatus('尝试突破...', 'run', 'Break'); var r = await gameApi().post('/api/game/breakthrough', { daoBonusPercent: 0 }); if (r && r.code === 200 && r.data && r.data.success === 'true') { setStatus('突破成功!', 'run', 'Break'); wecomEnqueue('突破成功', (p.realm||'') + ' 突破成功'); } } catch (_) {} }
    async function autoOriginRepairCheck() { if (!gameApi() || Date.now() - _lastOriginCheck < 120000) return; _lastOriginCheck = Date.now(); var p = getPlayer() || {}; var od = p.originDamage; if (!od || !od.hasDamage) return; var repairType = (od.entries && od.entries.length > 0 && od.entries[0].type) ? od.entries[0].type : 'major'; try { setStatus('修复本源碎裂(' + repairType + ')...', 'run', 'Origin'); await gameApi().post('/api/player/origin-damage/repair', { type: repairType }); wecomEnqueue('本源修复', '已修复本源碎裂(' + repairType + ')'); } catch (_) {} }
    var autoDisposeRunning = false;
    var SCOPE_LABELS = {equip:'装备',pill:'丹药',scroll:'卷轴',misc:'杂物',all:'全部'};
    var RARITY_LABELS = ['','普通','优良','稀有','史诗'];
    function disposeLog(msg) {
        var l = document.getElementById('lvscDisposeLog');
        if (!l) { if (window._disposeLog) window._disposeLog(msg); return; }
        var t = new Date().toLocaleTimeString();
        l.textContent = '[' + t + '] ' + msg + '\n' + (l.textContent || '');
        if (l.textContent.length > 2000) l.textContent = l.textContent.substring(0, 2000);
    }
    async function autoDisposeLoop() {
        if (autoDisposeRunning || !gameApi()) return;
        autoDisposeRunning = true;
        try { localStorage.setItem('lvSpiritCleaner.disposeRunning', '1'); } catch(_) {}
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
                            var _inv = await gameApi().get('/api/game/inventory/category?tab=all&page=1&size=200');
                            if (_inv && _inv.code === 200 && _inv.data && Array.isArray(_inv.data.items)) {
                                for (var _ii = 0; _ii < _inv.data.items.length; _ii++) {
                                    var _it = _inv.data.items[_ii];
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
                    } else if (rule.action === 'discard') {
                        try {
                            var invRes = await gameApi().get('/api/game/inventory/category?tab=all&page=1&size=200');
                            if (invRes && invRes.code === 200 && invRes.data && Array.isArray(invRes.data.items)) {
                                var filtered = invRes.data.items.filter(function(it) {
                                    if (it.isLocked || it.isEquipped || it.isNatalArtifact || it.isNatal) return false;
                                    var r = Number(it.rarity || it.grade || 0);
                                    if (r > rule.maxRarity) return false;
                                    if (rule.scope === 'all') return true;
                                    var tid = String(it.templateId || '').toLowerCase();
                                    var tp = String(it.type || '').toLowerCase();
                                    if (rule.scope === 'talisman') return tid.indexOf('talisman_') === 0 || tp === 'talisman';
                                    if (rule.scope === 'pill') return tid.indexOf('pill_') === 0 || tp === 'pill';
                                    if (rule.scope === 'scroll') return tid.indexOf('scroll_') === 0 || tid.indexOf('blank_scroll_') === 0 || tp === 'scroll';
                                    if (rule.scope === 'equip') return tp === 'equip';
                                    if (rule.scope === 'misc') return tid.indexOf('talisman_') !== 0 && tid.indexOf('pill_') !== 0 && tid.indexOf('scroll_') !== 0 && tid.indexOf('blank_scroll_') !== 0 && tp !== 'equip' && tp !== 'talisman' && tp !== 'pill' && tp !== 'scroll';
                                    return true;
                                });
                                if (filtered.length) {
                                    var gmap = {};
                                    filtered.forEach(function(it) {
                                        var tid = String(it.templateId || '');
                                        if (!tid) return;
                                        if (!gmap[tid]) gmap[tid] = { templateId: tid, snapshot: [] };
                                        var itemId = Number(it.id || it.itemId || it.inventoryId || it.instanceId || 0);
                                        var qty = Number(it.quantity || it.count || 1);
                                        if (gmap[tid].snapshot.length === 0) {
                                            gmap[tid].snapshot.push({ itemId: itemId, quantity: qty });
                                        } else {
                                            gmap[tid].snapshot[0].quantity += qty;
                                        }
                                    });
                                    var groups = Object.keys(gmap).map(function(k) { return gmap[k]; }).filter(function(g) { return g.snapshot.length > 0 && g.snapshot[0].quantity > 0; });
                                    if (groups.length) {
                                        var db = await gameApi().post('/api/game/discard-batch-multi', { groups: groups });
                                        if (db && db.code === 200 && db.data) {
                                            disposeLog('✓ 丢弃 ' + desc + '：' + db.data.totalDiscarded + '件');
                                            ok = true;
                                        }
                                    } else {
                                        disposeLog('  丢弃 ' + desc + '：无可丢弃物品');
                                    }
                                } else {
                                    disposeLog('  丢弃 ' + desc + '：无可丢弃物品');
                                }
                            }
                        } catch (_) {}
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
        try { localStorage.setItem('lvSpiritCleaner.disposeRunning', '0'); } catch(_) {}
        try {
            var startBtn2 = document.getElementById('lvscDisposeStartBtn');
            var stopBtn2 = document.getElementById('lvscDisposeStopBtn');
            if (startBtn2) startBtn2.style.display = '';
            if (stopBtn2) stopBtn2.style.display = 'none';
        } catch (_) {}
        disposeLog('监控已停止');
    }
    function stopDispose() { autoDisposeRunning = false; try { localStorage.setItem('lvSpiritCleaner.disposeRunning', '0'); } catch(_) {} }

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
    async function autoFarmLoop() { if (autoFarmRunning) return; autoFarmRunning = true; try { localStorage.setItem('lvSpiritCleaner.farmRunning', '1'); } catch(_) {} updateMeter(); farmLog('灵田监控启动'); while (autoFarmRunning) { try { var data = await farmOverview(); if (!data) { farmLog('获取灵田数据失败'); await sleep(10000); continue; } var mature = data.myMatureCount || 0, idle = data.myIdleCount || 0, total = data.myPlotTotal || 0; farmLog("成熟"+mature+" 空闲"+idle+" 总计"+total); if (mature > 0 && state.farmAutoHarvest) { farmLog('收获成熟 ×' + mature); await farmHarvest(); await sleep(500); } if (idle > 0 && state.farmAutoPlant && state.farmSeedId) { farmLog('种植 ' + state.farmSeedName + ' ×' + idle); await farmPlant(state.farmSeedId); await sleep(500); } if (data.farmInvasion && state.farmAutoInvasion) { farmLog('迎击灵田入侵...'); await farmInvasionAttack(); await sleep(500); } if (state.farmExpandEnabled && idle <= 0 && Date.now() - _lastFarmExpandTime > 3600000) { _lastFarmExpandTime = Date.now(); farmLog('开垦...'); await farmExpand(999); } updateFarmExpandTimer(); } catch (e) { farmLog('异常: ' + (e.message || '')); } await sleep(state.farmInterval * 1000); } updateMeter(); autoFarmRunning = false; try { localStorage.setItem('lvSpiritCleaner.farmRunning', '0'); } catch(_) {} }
    function stopFarm() { autoFarmRunning = false; try { localStorage.setItem('lvSpiritCleaner.farmRunning', '0'); } catch(_) {} updateMeter(); }
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
    async function fetchPavilionShop() { if (!gameApi()) return []; try { var res = await gameApi().get('/api/game/player-sect/builtin-shop'); if (res && res.code === 200 && Array.isArray(res.data) && res.data.length > 0) return res.data; } catch (_) {} try { var res2 = await gameApi().get('/api/game/sect/shop'); if (res2 && res2.code === 200 && Array.isArray(res2.data)) return res2.data; } catch (_) {} return []; }
    async function autoPavilionLoop() { if (autoPavilionRunning || running) return; syncSettingsFromUi(); if (!state.pavilionItemId || !gameApi()) { setStatus('请先选择珍宝阁商品', 'warn'); return; } autoPavilionRunning = true; var done = 0, succ = 0; updateMeter(); pavilionLog('开始兑换: ' + state.pavilionItemName + ' 每次' + state.pavilionQty + ' 循环' + state.pavilionLoop); while (autoPavilionRunning && done < state.pavilionLoop) { try { var r = await gameApi().post('/api/game/player-sect/buy-builtin-item', { itemId: state.pavilionItemId, quantity: state.pavilionQty }); if (!r || r.code !== 200) { r = await gameApi().post('/api/game/sect/shop/buy', { itemId: state.pavilionItemId, quantity: state.pavilionQty }); } if (r && r.code === 200) { succ++; pavilionLog('✓ ' + (done + 1) + '/' + state.pavilionLoop); } else { pavilionLog('✗ ' + (done + 1) + ': ' + ((r && r.message) || '')); } } catch (e) { pavilionLog('✗ 异常: ' + (e.message || '')); } done++; if (done < state.pavilionLoop) await sleep(state.pavilionDelay + Math.floor(Math.random() * 500)); } autoPavilionRunning = false; updateMeter(); pavilionLog('完成: ' + succ + '/' + done); setStatus('珍宝阁完成', 'run'); }
    function stopPavilion() { autoPavilionRunning = false; updateMeter(); }
    function pavilionLog(msg) { var log = document.getElementById('lvscPavilionLog'); if (!log) return; var t = new Date().toLocaleTimeString(); log.textContent = '[' + t + '] ' + msg + '\n' + (log.textContent || ''); if (log.textContent.length > 4000) log.textContent = log.textContent.substring(0, 4000); }

    // --- 批量用符 ---
    function talismanLog(msg) { var log = document.getElementById('lvscTalismanLog'); if (!log) return; var t = new Date().toLocaleTimeString(); log.textContent = '[' + t + '] ' + msg + '\n' + (log.textContent || ''); if (log.textContent.length > 4000) log.textContent = log.textContent.substring(0, 4000); }
    async function autoTalismanLoop() {
        if (autoTalismanRunning || !gameApi()) return;
        autoTalismanRunning = true;
        var batchSize = Math.max(1, Number(document.getElementById('lvscTalismanBatch').value) || 10);
        var loops = Math.max(1, Number(document.getElementById('lvscTalismanLoops').value) || 5);
        var delay = Math.max(500, Number(document.getElementById('lvscTalismanDelay').value) || 1500);
        var type = document.getElementById('lvscTalismanType').value;
        document.getElementById('lvscStartTalismanBtn').style.display = 'none';
        document.getElementById('lvscStopTalismanBtn').style.display = '';
        updateMeter();
        talismanLog('开始: 每次' + batchSize + ' 循环' + loops);
        var used = 0;
        for (var i = 0; i < loops && autoTalismanRunning; i++) {
            try {
                var invRes = await gameApi().get('/api/game/inventory/category?tab=all&page=1&size=200');
                if (!invRes || invRes.code !== 200 || !invRes.data || !Array.isArray(invRes.data.items)) {
                    talismanLog('获取背包失败');
                    break;
                }
                var items = invRes.data.items.filter(function(item) {
                    var tid = (item.templateId || '').toLowerCase();
                    if (!tid || tid.indexOf('talisman_') < 0) return false;
                    if (item.isLocked || item.isEquipped) return false;
                    if (type === 'stealth' && tid.indexOf('stealth') < 0) return false;
                    if (type === 'combat' && tid.indexOf('stealth') >= 0) return false;
                    return Number(item.quantity || item.count || 0) >= 1;
                });
                if (!items.length) {
                    talismanLog('没有可用符篆');
                    break;
                }
                var item = items[0];
                var itemId = item.id || item.itemId || item.instanceId;
                var count = Math.min(batchSize, Number(item.quantity || item.count || 1));
                var useRes = await gameApi().post('/api/game/use-item', { itemId: itemId, quantity: count });
                if (useRes && useRes.code === 200) {
                    used += count;
                    talismanLog('✓ ' + (i + 1) + '/' + loops + ' ×' + count + ' (' + used + ')');
                } else {
                    talismanLog('✗ 失败: ' + ((useRes && useRes.message) || ''));
                }
            } catch (e) {
                talismanLog('✗ ' + (e.message || ''));
            }
            if (i < loops - 1) await sleep(delay);
        }
        autoTalismanRunning = false;
        document.getElementById('lvscStartTalismanBtn').style.display = '';
        document.getElementById('lvscStopTalismanBtn').style.display = 'none';
        updateMeter();
        talismanLog('完成: 共使用 ' + used);
        setStatus('批量用符完成', 'run');
    }
    function stopTalisman() { autoTalismanRunning = false; }

    // 装备套装切换（使用游戏内置换装方案 API）
    async function equipLoadoutApply(slot) {
        if (!gameApi() || !slot) return;
        try {
            var res = await gameApi().post('/api/equip-loadout/apply', { slot: slot, target: 'body' });
            if (res && res.code === 200 && res.data && res.data.success) {
                await sleep(300);
                await refreshPlayer();
            }
        } catch (_) {}
    }

    // 读取游戏内装备方案名
    // 读取游戏内装备方案名
    function getGameLoadoutNames() {
        var saved = localStorage.getItem('lvscLoadoutNames');
        if (saved) {
            try { return JSON.parse(saved); } catch(_) {}
        }
        return ['方案1', '方案2'];
    }
        // 自动监听装备弹窗，同步方案名到localStorage
    (function autoSyncEquipNames() {
        var check = function() {
            var els = document.querySelectorAll('.equip-loadout-card__name');
            if (els && els.length >= 2) {
                var names = [els[0].textContent.trim(), els[1].textContent.trim()];
                try { localStorage.setItem('lvscLoadoutNames', JSON.stringify(names)); } catch(_) {}
                var spiritSel = document.getElementById('lvscEquipSpiritSlot');
                var combatSel = document.getElementById('lvscEquipCombatSlot');
                if (spiritSel && combatSel) {
                    spiritSel.options[0].text = names[0];
                    spiritSel.options[1].text = names[1];
                    combatSel.options[0].text = names[0];
                    combatSel.options[1].text = names[1];
                }
            }
        };
        // 立即执行一次，然后每3秒检查
        setTimeout(check, 500);
        setInterval(function() { if (!state.safeMode) check(); }, 3000);
    })();

    // 自动领取月卡仙缘
    var autoMonthlyCardLastClaimDate = '';
    async function claimMonthlyCard() {
        if (!state.autoMonthlyCard || !gameApi()) return;
        try {
            var r = await gameApi().post('/api/player/monthly-card/claim', {});
            if (r && r.code === 200) {
                var today = new Date().toDateString();
                autoMonthlyCardLastClaimDate = today;
                localStorage.setItem('lvSpiritCleaner.monthlyCardLastDate', today);
                setStatus('月卡仙缘领取成功 +5仙缘', 'run');
                wecomEnqueue('自动月卡仙缘', '已自动领取月卡仙缘 +5仙缘');
                updateMonthlyCardStatusDisplay();
            }
        } catch (_) {}
    }
        function updateMonthlyCardStatusDisplay() {
        var el = document.getElementById('lvscMonthlyCardStatus');
        if (!el) return;
        var last = localStorage.getItem('lvSpiritCleaner.monthlyCardLastDate') || '';
        var today = new Date().toDateString();
        if (last === today) {
            el.textContent = '\u2705 今日仙缘已领取';
            el.style.color = '#4caf50';
        } else {
            el.textContent = '\u274c 今日仙缘未领取';
            el.style.color = '#f44336';
        }
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

    function autoVerifySolver() { try { if (!state.autoVerify) return; var inp=document.getElementById("gamePromptInput"); var btn=document.getElementById("gamePromptConfirmBtn"); if(!inp||!btn||inp.offsetHeight===0)return; var card=document.querySelector(".modal-content"); var txt=(card&&card.textContent)||""; var numRe=/([\d.]+|[一二三四五六七八九十百千万零壹贰叁肆伍陆柒捌玖拾]+)/g; var nums=[],m; while((m=numRe.exec(txt))!==null){var v=m[1]; nums.push(isNaN(Number(v))?(typeof parseChineseNum==="function"?parseChineseNum(v):NaN):Number(v))} if(nums.length<2)return; var a=nums[nums.length-2],b=nums[nums.length-1],ans; if(txt.indexOf("加")>=0||txt.indexOf("+")>=0)ans=a+b;else if(txt.indexOf("减")>=0||txt.indexOf("-")>=0)ans=a-b;else if(txt.indexOf("乘")>=0||txt.indexOf("×")>=0)ans=a*b;else ans=a/b; if(!isNaN(ans)&&isFinite(ans)){inp.value=ans===Math.floor(ans)?String(Math.floor(ans)):String(Math.round(ans*100)/100);setTimeout(function(){btn.click()},200)} }catch(_){} } setInterval(autoVerifySolver,2000);

    // 自动解决反脚本验证（算术题）- 支持中文数字
    var CHINESE_NUMS = { '零':0,'〇':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'百':100,'千':1000,'万':10000,'壹':1,'贰':2,'叁':3,'肆':4,'伍':5,'陆':6,'柒':7,'捌':8,'玖':9,'拾':10 };
    function parseChineseNum(s) {
        s = String(s || '').trim();
        var n = parseFloat(s); if (Number.isFinite(n)) return n;
        var r = 0, c = 0;
        for (var i = 0; i < s.length; i++) { var v = CHINESE_NUMS[s[i]]; if (v === undefined) return NaN; if (v >= 10) { if (c === 0) c = 1; r += c * v; c = 0; } else c = v; }
        r += c; return r || NaN;
    }
    function hookAntiCheatAutoSolve() {
        if (!state.autoVerify) return;
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
                        if (answer === Math.floor(answer)) answer = Math.floor(answer);
                        else answer = Math.round(answer * 100) / 100;
                        setStatus('自动过验证: ' + a + ' ' + op + ' ' + b + ' = ' + answer, 'run');
                        if (onOk) { onOk(String(answer)); return; }
                    }
                }
            }

            // 不是验证弹窗，走原始逻辑
            return origGamePrompt.apply(this, arguments);
        };
        window.gamePrompt.__lvHooked = true;
                    // 自动点击解除天道禁闭弹窗（每2秒检测，用DOM方式点确认按钮）
            function autoClickBailConfirm() {
                if (!state.autoBailClick) return;
                try {
                    var modal = document.getElementById('gameDialogModal');
                    if (!modal || modal.classList.contains('hidden')) return;
                    var all = modal.querySelectorAll('*');
                    for (var i = 0; i < all.length; i++) {
                        var el = all[i];
                        if (el.offsetHeight === 0 || !el.textContent) continue;
                        if (el.children.length > 0) continue;
                        var t = (el.textContent || '').trim();
                        if (t.indexOf('仙缘') >= 0 || t.indexOf('解除') >= 0) {
                            el.click();
                            setStatus('自动点击解除天道禁闭', 'run');
                            wecomEnqueue('自动解除禁闭', '消耗仙缘解除天道禁闭');
                            return;
                        }
                    }
                } catch(_) {}
            }
            setInterval(autoClickBailConfirm, 2000);
    }
    var wecomBusy = false;
    var wecomQueue = [];
    var BUILTIN_CHANGELOG = [
         {
            version: '1.6.5',
            title: '丹药自动升阶+全局安全模式+多项优化',
            notes: ['丹药自动升阶监控(定时批量操作)', '全局安全模式一键开关', '自动解答反脚本算术题验证', '自动点击解除天道禁闭', '涅槃丹单次使用数量自定义', '月卡仙缘领取状态实时显示', '面板新增全局搜索与折叠', '背包API升级至全新分页接口', '物品品质识别与配方匹配优化', '网络请求增加十秒超时保护', '自动操作增加随机延迟防检测', '冥想改为直接调用API启动', '神识消耗支持动态读取与倍率', '面板Tab精简合并至三个核心', '功能模块卡片式分类重组', 'UI动态注入与兜底恢复机制', '自动登录剥离至后台独立运行', '修复DOM元素空指针异常', '配置导出自动过滤敏感信息', '优化面板视觉层级与折叠动画', '通知推送支持分类独立开关']
         },
         {
            version: '1.6.4',
            title: '涅槃炼制重写+徒弟互动+多项修复',
            notes: ['匹配规则扩展至整个网站域名', '区域名缓存提升地图准确性', '自动炼制定时器(可设间隔)', '涅槃丹自动炼制(品质目标+定时)', '洗炼石一键升品监控', '自动月卡仙缘领取', '徒弟互动自动化(授业/赠物/赠灵石)', '智能处理徒弟请求(问道/护道/历练)', '炼制上限提升至100', '气运系统改为自动维持模式', '灵宠回血新增冥想检测', '高级冥想冷却时间配置', '装备切换状态显示', '自动登录功能(邮箱密码保存)', '登录页暂停自动刷新', '状态监控与恢复机制优化']
        },
         {
            version: '1.6.3',
            title: '自动回血+定时刷新+异常自启',
            notes: ['自动回血(耗灵)：定时回满角色血', '灵兽自动回血：定时给灵兽回血', '自动刷新页面：定时刷新+倒计时', '异常自启：脚本停止自动恢复', '刷新后自启：灵田/出售/升品自动启动', '神识输入改百分比', '高级冥想加15分钟冷却', '通知显示境界+刷新倒计时']
        },
        {
            version: '1.6.2',
            title: '洗炼石升品+换装同步+多项修复',
            notes: ['洗炼石一键升品', '换装原生API+方案名同步', '启动切战斗套', '恢复优先级不丢失', '铭文装备名自动抓取', '排序按启用顺序']
        },
        {
            version: '1.6.1',
            title: '功法洗练 + 品质炼制 + 珍宝阁九霄宗 + 多项修复',
            notes: ['新增功法自动洗练：选功法→槽位→分类(攻击/防御/辅助)→石头品质→目标词条(多关键词+1:1数值映射)→自动循环洗到命中。', '新增品质炼制：独立按钮+循环，设目标品质×个数，炼到达标自动停。', '珍宝阁支持九霄宗：API兜底自动切换sect/shop端点。', '高级冥想夏季检测：DOM取不到时兜底calcGameTime判断季节。', '保护列表品质分组：同名物品5品质全有时合并显示[全部品质]，可一键删除整个baseId。', '炼制阻塞提示：清理/铭文运行时点炼制明确提示原因。', '清理完成通知显示修为进度差值（32.1% → 45.2%（+13.1%））。', '炼制配方/批量炼制API支持制符（talisman）。', '珍宝阁购买间隔加随机抖动。', '反验证新增DOM轮询兜底（autoVerifySolver每2秒检测弹窗）。']
        },
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
        autoReloadMin: readNumber('lvSpiritCleaner.autoReloadMin', 0),
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
        autoMysteryBox: localStorage.getItem('lvSpiritCleaner.autoMysteryBox') === '1',
        noMasterProtector: localStorage.getItem('lvSpiritCleaner.noMasterProtector') === '1',

        // === 战斗恢复 ===
        autoSelfFightWeak: localStorage.getItem('lvSpiritCleaner.autoSelfFightWeak') !== '0',
        autoPetHeal: localStorage.getItem('lvSpiritCleaner.autoPetHeal') !== '0',
        autoPetHealInterval: readNumber('lvSpiritCleaner.autoPetHealInterval', 30000),
        aggressiveMode: localStorage.getItem('lvSpiritCleaner.aggressiveMode') === '1',
        selfFightMargin: readNumber('lvSpiritCleaner.selfFightMargin', 1.15),
        noCrossRealmFight: localStorage.getItem('lvSpiritCleaner.noCrossRealmFight') === '1',
        noCrossRealmGap: readNumber('lvSpiritCleaner.noCrossRealmGap', 0),
        autoRecoveryMode: localStorage.getItem('lvSpiritCleaner.autoRecoveryMode') || 'both',
        autoRecoveryThreshold: readNumber('lvSpiritCleaner.autoRecoveryThreshold', 80),
        autoRecoveryTarget: readNumber('lvSpiritCleaner.autoRecoveryTarget', 100),
        sectQuickRecovery: localStorage.getItem('lvSpiritCleaner.sectQuickRecovery') === '1',
        autoHpPriority: localStorage.getItem('lvSpiritCleaner.autoHpPriority') || '宗门,灵力,丹药',
        autoMpPriority: localStorage.getItem('lvSpiritCleaner.autoMpPriority') || '宗门,丹药,灵石',
        autoRepair: localStorage.getItem('lvSpiritCleaner.autoRepair') !== '0',
        autoOriginRepair: localStorage.getItem('lvSpiritCleaner.autoOriginRepair') !== '0',
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
        advMedCooldownMin: readNumber('lvSpiritCleaner.advMedCooldownMin', 15),
        summerOnlyAdvMeditate: localStorage.getItem('lvSpiritCleaner.summerOnlyAdvMeditate') === '1',
        summerOnlyAdvancedMeditate: localStorage.getItem('lvSpiritCleaner.summerOnlyAdvancedMeditate') === '1',
        meditateStopSpirit: readNumber('lvSpiritCleaner.meditateStopSpirit', 0),
        autoNatalDevour: localStorage.getItem('lvSpiritCleaner.autoNatalDevour') === '1',
        autoRecruit: localStorage.getItem('lvSpiritCleaner.autoRecruit') === '1',
        recruitIntervalMs: readNumber('lvSpiritCleaner.recruitIntervalMs', 5000),
        autoMasterRequests: localStorage.getItem('lvSpiritCleaner.autoMasterRequests') !== '0',
        autoTeachDaily: localStorage.getItem('lvSpiritCleaner.autoTeachDaily') === '1',
        autoHudaoBreakMeditate: localStorage.getItem('lvSpiritCleaner.autoHudaoBreakMeditate') === '1',
        autoGiftItemsDaily: localStorage.getItem('lvSpiritCleaner.autoGiftItemsDaily') === '1',
        autoGiftStonesDaily: localStorage.getItem('lvSpiritCleaner.autoGiftStonesDaily') === '1',
        giftItemsDiscipleQtys: (function(){try{return JSON.parse(localStorage.getItem('lvSpiritCleaner.giftItemsDiscipleQtys')||'{}');}catch(_){return{};}})(),
        giftStonesDiscipleQtys: (function(){try{return JSON.parse(localStorage.getItem('lvSpiritCleaner.giftStonesDiscipleQtys')||'{}');}catch(_){return{};}})(),
        giftItemsSelected: (function(){try{return JSON.parse(localStorage.getItem('lvSpiritCleaner.giftItemsSelected')||'[]');}catch(_){return[];}})(),
        giftStonesSelected: (function(){try{return JSON.parse(localStorage.getItem('lvSpiritCleaner.giftStonesSelected')||'[]');}catch(_){return[];}})(),
	    giftItemsDiscipleQtys: (function(){try{return JSON.parse(localStorage.getItem('lvSpiritCleaner.giftItemsDiscipleQtys')||'{}');}catch(_){return{};}})(),
	    giftItemsDiscipleItems: (function(){try{return JSON.parse(localStorage.getItem('lvSpiritCleaner.giftItemsDiscipleItems')||'{}');}catch(_){return{};}})(),
	    giftStonesDiscipleQtys: (function(){try{return JSON.parse(localStorage.getItem('lvSpiritCleaner.giftStonesDiscipleQtys')||'{}');}catch(_){return{};}})(),
	    giftItemsMode: (function(){var v=localStorage.getItem('lvSpiritCleaner.giftItemsMode');return v==='each'?'each':'all';})(),
	    giftStonesMode: (function(){var v=localStorage.getItem('lvSpiritCleaner.giftStonesMode');return v==='each'?'each':'all';})(),
        giftStonesQty: readNumber('lvSpiritCleaner.giftStonesQty', 1),
        giftPlayerItemId: parseInt(localStorage.getItem('lvSpiritCleaner.giftPlayerItemId') || '0', 10) || 0,
        giftItemName: localStorage.getItem('lvSpiritCleaner.giftItemName') || '',
        giftItemQty: readNumber('lvSpiritCleaner.giftItemQty', 1),
        autoBail: localStorage.getItem('lvSpiritCleaner.autoBail') !== '0',
        autoBailClick: localStorage.getItem('lvSpiritCleaner.autoBailClick') !== '0',
        safeMode: localStorage.getItem('lvSpiritCleaner.safeMode') === '1',
        autoMonthlyCard: localStorage.getItem('lvSpiritCleaner.autoMonthlyCard') === '1',
        bailMethod: localStorage.getItem('lvSpiritCleaner.bailMethod') || 'stone',
        autoVerify: localStorage.getItem('lvSpiritCleaner.autoVerify') !== '0',
        minLuck: readNumber('lvSpiritCleaner.minLuck', 5),
        luckRefreshMethod: localStorage.getItem('lvSpiritCleaner.luckRefreshMethod') || 'stone',
        autoMaintainLuck: localStorage.getItem('lvSpiritCleaner.autoMaintainLuck') === '1',
autoBreakthrough: localStorage.getItem('lvSpiritCleaner.autoBreakthrough') === '1',
nirvanaRarity: readNumber('lvSpiritCleaner.nirvanaRarity', 3),
nirvanaCraftQty: readNumber('lvSpiritCleaner.nirvanaCraftQty', 1),
        nirvanaRecipeId: localStorage.getItem('lvSpiritCleaner.nirvanaRecipeId') || '',
        nirvanaBatchSize: readNumber('lvSpiritCleaner.nirvanaBatchSize', 10),
        nirvanaQualityTarget: readNumber('lvSpiritCleaner.nirvanaQualityTarget', 5),
        nirvanaQualityCount: readNumber('lvSpiritCleaner.nirvanaQualityCount', 10),
        nirvanaUseQty: readNumber('lvSpiritCleaner.nirvanaUseQty', 1),
        nirvanaAutoTimer: localStorage.getItem('lvSpiritCleaner.nirvanaAutoTimer') === '1',
        nirvanaTimerMin: readNumber('lvSpiritCleaner.nirvanaTimerMin', 10),
        nirvanaNextTimerTime: readNumber('lvSpiritCleaner.nirvanaNextTimerTime', 0),
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
        autoRestart: localStorage.getItem('lvSpiritCleaner.autoRestart') === '1',
        farmExpandEnabled: localStorage.getItem('lvSpiritCleaner.farmExpandEnabled') === '1',
        farmAutoInvasion: localStorage.getItem('lvSpiritCleaner.farmAutoInvasion') !== '0',
        pavilionItemName: localStorage.getItem('lvSpiritCleaner.pavilionItemName') || '',
        pavilionQty: readNumber('lvSpiritCleaner.pavilionQty', 99),
        pavilionLoop: readNumber('lvSpiritCleaner.pavilionLoop', 10),
        pavilionDelay: readNumber('lvSpiritCleaner.pavilionDelay', 500),
        equipSwapEnabled: localStorage.getItem('lvSpiritCleaner.equipSwapEnabled') === '1',
        equipSpiritSlot: readNumber('lvSpiritCleaner.equipSpiritSlot', 1),
        equipCombatSlot: readNumber('lvSpiritCleaner.equipCombatSlot', 2),
        craftType: localStorage.getItem('lvSpiritCleaner.craftType') || 'alchemy',
        craftRecipeId: localStorage.getItem('lvSpiritCleaner.craftRecipeId') || '',
        craftTargetCount: readNumber('lvSpiritCleaner.craftTargetCount', 10),
        craftBatchSize: readNumber('lvSpiritCleaner.craftBatchSize', 0),
        craftQualityTarget: readNumber('lvSpiritCleaner.craftQualityTarget', 0),
        craftQualityCount: readNumber('lvSpiritCleaner.craftQualityCount', 0),
        skillWashScope: localStorage.getItem('lvSpiritCleaner.skillWashScope') || 'body',
        skillWashSkillId: localStorage.getItem('lvSpiritCleaner.skillWashSkillId') || '',
        skillWashSlot: readNumber('lvSpiritCleaner.skillWashSlot', 0),
        skillWashStoneQuality: readNumber('lvSpiritCleaner.skillWashStoneQuality', 1),
        skillWashCategory: localStorage.getItem('lvSpiritCleaner.skillWashCategory') || 'ATTACK',
        skillWashTargetType: localStorage.getItem('lvSpiritCleaner.skillWashTargetType') || '',
        skillWashTargetMin: localStorage.getItem('lvSpiritCleaner.skillWashTargetMin') || '',
        washStoneMonitorInterval: readNumber('lvSpiritCleaner.washStoneMonitorInterval', 30),
        pillUpgradeMonitorInterval: readNumber('lvSpiritCleaner.pillUpgradeMonitorInterval', 30),
        craftAutoBuyMats: localStorage.getItem('lvSpiritCleaner.craftAutoBuyMats') === '1',
        craftAutoTimer: localStorage.getItem('lvSpiritCleaner.craftAutoTimer') === '1',
        craftTimerMin: readNumber('lvSpiritCleaner.craftTimerMin', 10),
        craftTimerMode: localStorage.getItem('lvSpiritCleaner.craftTimerMode') || 'normal',
        nextAutoCraftTime: readNumber('lvSpiritCleaner.nextAutoCraftTime', 0),


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
            realm: getPlayerRealmStr(),
            location: getCurrentAreaName(),
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
        // 登录页不调用游戏API，防止401触发页面重定向死循环
        if ((location.pathname === '/' || location.pathname === '') && !document.getElementById('exploreBtn')) {
            return null;
        }
        return (typeof api !== 'undefined') ? api : window.api;
    }
    // 自动灵宠回血
function autoPetHeal() {
    if (!state.autoPetHeal) return;
    // 冥想中不执行灵宠回血
    var p = getPlayer() || {};
    if (p.isMeditating) return;
    // 冥想检测：如果冥想中则跳过
    // 用原生 DOM 检测冥想按钮状态（兼容白天挂机）
    try {
        var _medBtn = document.getElementById('meditateBtn');
        if (window._meditationActive || window._meditationInProgress || (_medBtn && _medBtn.classList.contains('meditating'))) {
            console.log('[LingVerse] 冥想中，跳过灵兽回血');
            return;
        }
    } catch(_) {}
    try {
            var a = gameApi();
            if (!a || typeof a.get !== 'function') return;
            a.get('/api/game/pets').then(function(res) {
                if (res && res.code === 200 && res.data && Array.isArray(res.data.pets)) {
                    for (var i = 0; i < res.data.pets.length; i++) {
                        var pet = res.data.pets[i];
                        if (pet && pet.isDeployed === true) {
                            a.post('/api/game/pets/heal', {petId: pet.id});
                            return;
                        }
                    }
                }
            });
        } catch(e) {}
    }
function startAutoPetHealTimer() {
    stopAutoPetHealTimer();
    if (state.autoPetHeal && state.autoPetHealInterval >= 1500) {
        _autoPetHealTimer = setInterval(autoPetHeal, state.autoPetHealInterval);
    }
}
function stopAutoPetHealTimer() {
    if (_autoPetHealTimer) { clearInterval(_autoPetHealTimer); _autoPetHealTimer = null; }
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
        var cost = Number(player.spiritCost || player.exploreCost || player.exploreSpiritCost || 0);
        if (cost <= 0) {
            var _costEl = document.querySelector('#exploreCost, [data-spirit-cost], .explore-cost');
            if (_costEl) { var _m = String(_costEl.textContent || '').match(/(\d[\d,]*)/); if (_m) cost = parseInt(_m[1].replace(/,/g, ''), 10) || 1; }
        }
        if (cost <= 0) cost = 1;
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
        var effMult = 1;
        if (state.keepCurrentMultiplier) {
            var gSel = document.getElementById('exploreMultiplier');
            if (gSel && gSel.value) effMult = Number(gSel.value) || 1;
        } else {
            effMult = Number(state.preferMultiplier) || 1;
        }
        var text = info.spirit + ' / ' + info.maxSpirit + '  每次-' + (info.cost * effMult);

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
        state.inscriptionEquipCrossStat = chk('lvscEquipCrossStat');
        state.inscriptionEquipSkipSpirit = chk('lvscEquipSkipSpirit');
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
        state.autoPetHeal = document.getElementById('autoPetHeal').checked;
        state.autoPetHealInterval = Math.max(1500, parseInt(document.getElementById('autoPetHealInterval').value) || 30000);
        state.selfFightMargin = Math.max(1, Math.min(3, num('lvscSelfFightMargin', 1, 1.15)));
        state.autoRecoveryMode = sel('lvscAutoRecoveryMode', 'both', ['none', 'hp', 'mp', 'both']);
        state.sectQuickRecovery = chk('lvscSectQuickRecovery');
        state.autoRecoveryThreshold = Math.max(0, Math.min(100, num('lvscAutoRecoveryThreshold', 0, 80)));
        state.autoRecoveryTarget = Math.max(0, Math.min(100, num('lvscAutoRecoveryTarget', 0, 100)));
        state.autoHpPriority = localStorage.getItem('lvSpiritCleaner.autoHpPriority') || str('lvscAutoHpPriority', '灵力,丹药,宗门');
        state.autoMpPriority = localStorage.getItem('lvSpiritCleaner.autoMpPriority') || str('lvscAutoMpPriority', '灵石,丹药,宗门');
        state.updateManifestUrl = str('lvscUpdateManifestUrl', '');
        state.autoVoidBody = chk('lvscAutoVoidBody');
        state.voidBodyRarity = Math.max(1, Math.min(5, num('lvscVoidRarity', 1, 5)));
        state.voidBodyBuyQty = Math.max(1, Math.min(999, num('lvscVoidBuyQty', 1, 1)));
        state.autoHiddenCharm = chk('lvscAutoHiddenCharm');
        state.hiddenCharmRarity = Math.max(0, Math.min(5, num('lvscHiddenCharmRarity', 0, 0)));
        state.hiddenCharmBuyQty = Math.max(1, Math.min(999, num('lvscHiddenCharmBuyQty', 1, 1)));
        state.hiddenCharmRetryMs = Math.max(3000, num('lvscHiddenCharmRetryMs', 3000, 60000));
        state.autoRepair = chk('lvscAutoRepair');
        state.autoOriginRepair = chkVal('lvscAutoOriginRepair');
        state.repairThreshold = Math.max(0, Math.min(100, num('lvscRepairThreshold', 0, 70)));
        state.autoNatalDevour = chk('lvscAutoNatalDevour');
        state.reviveExploreArea = str('lvscReviveExploreArea', '');
        state.autoRecruit = chk('lvscAutoRecruit');
        state.recruitIntervalMs = Math.max(1000, num('lvscRecruitIntervalMs', 1000, 5000));
        state.chatOnTop = chk('lvscChatOnTop');
        state.wecomNotify = chk('lvscWecomNotify');
        state.wecomNotifyWebhook = str('lvscWecomNotifyWebhook', '');
        state.wecomWorldWebhook = str('lvscWecomWorldWebhook', '');
        state.wecomPrivateWebhook = str('lvscWecomPrivateWebhook', '');
        state.autoMasterRequests = chk('lvscAutoMasterRequests');
        state.autoBail = chk('lvscAutoBail');
        state.autoReloadMin = num('lvscAutoReloadMin', 0, 0);
        state.skillWashScope = sel('lvscSkillWashScope', 'body', ['body', 'incarnation']);
        state.skillWashSkillId = str('lvscSkillWashSkill', '');
        state.skillWashSlot = num('lvscSkillWashSlot', 0, 0);
        state.skillWashCategory = sel('lvscSkillWashCategory', 'ATTACK', ['ATTACK', 'DEFENSE', 'SUPPORT']);
        state.skillWashStoneQuality = num('lvscSkillWashStoneQ', 1, 1);
        state.skillWashTargetType = str('lvscSkillWashTarget', '');
        state.skillWashTargetMin = str('lvscSkillWashMin', '');
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
        if (state.meditateStopSpirit > 0) return Math.max(1, Math.floor(maxSpirit * state.meditateStopSpirit / 100));
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
        // 冷却（默认15分钟，可配置）
        var cooldownMs = state.advMedCooldownMin * 60000;
        if (state.advMedCooldownMin > 0 && window._advMedCooldown && Date.now() - window._advMedCooldown < cooldownMs) {
            return false;
        }
        // 只在夏季及以后 高级冥想 选项
        if (state.summerOnlyAdvancedMeditate) {
            // 现实时间0-7点不执行高级冥想
            var h = new Date().getHours();
            if (h >= 0 && h < 7) return false;
            var seasonEl = document.getElementById('envSeasonTitle');
            var seasonOk = false;
            if (seasonEl && ((seasonEl.textContent || '').indexOf('夏') >= 0 || (seasonEl.textContent || '').indexOf('秋') >= 0 || (seasonEl.textContent || '').indexOf('冬') >= 0)) seasonOk = true;
            else if (typeof calcGameTime === 'function') { try { var gt = calcGameTime(); if (gt && (gt.seasonIdx === 1 || gt.seasonIdx === 2 || gt.seasonIdx === 3)) seasonOk = true; } catch (_) {} }
            if (!seasonOk) return false;
        }
        // 神识低于20%才能使用高级冥想
        var spi = getSpiritInfo();
        if (spi.spirit >= Math.floor(spi.maxSpirit * 0.2)) {
            return false;
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
            window._advMedCooldown = Date.now(); // 记录冷却时间
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
        if (state.equipSwapEnabled && state.equipSpiritSlot) {
            setStatus('切换神识套...', 'run', 'Equip');
            await equipLoadoutApply(state.equipSpiritSlot);
        }
        if (await tryAdvancedMeditateOnce()) {
            info = getSpiritInfo();
            if (info.spirit >= info.cost && info.spirit > state.reserve) return true;
            if (info.spirit >= targetSpirit) return true;
        }
        // 直接用API启动冥想
        var startRes = await gameApi().post('/api/game/meditate/start', {});
        if (!startRes || startRes.code !== 200) {
            toast('自动冥想启动失败：' + ((startRes && startRes.message) || '未知错误'));
            return false;
        }
        if (typeof window.startMeditationUI === 'function') { try { window.startMeditationUI(); } catch (_) {} }
        if (startRes.data && typeof startRes.data.spiritPerMinute === 'number') { window.meditationSpiritRate = startRes.data.spiritPerMinute; }

        var spiritPerMinute = Number(window.meditationSpiritRate || 0);
        // 兜底：如果没获取到速率，每5秒查一次
        if (!spiritPerMinute) spiritPerMinute = (info.maxSpirit - info.spirit) / 60; // 粗糙估计1分钟满
        var estMin = info.maxSpirit > 0 && spiritPerMinute > 0 ? Math.ceil((targetSpirit - info.spirit) / spiritPerMinute) : 5;
        var _rPct = getPlayerRealmStr();
        wecomEnqueue('🧘 开始冥想', '境界：' + _rPct + '\n当前神识：' + info.spirit + '/' + info.maxSpirit + '\n目标神识：' + targetSpirit + '\n预计恢复：约 ' + estMin + '分钟后\n预计下一轮清理：' + new Date(Date.now() + (Number(estMin) || 0) * 60000).toLocaleTimeString() + '\n下次刷新：' + (document.getElementById('lvscReloadCountdown') || {}).textContent || '未设置');
        _lastMeditateReport = Date.now();
        var startedAt = Date.now();
        if (typeof window.startMeditationUI === 'function') {
            try { window.startMeditationUI(); } catch (_) {}
        }

        while (running) {
            await sleep(5000);
            var statusRes = await gameApi().get('/api/game/meditate/status');
            if (statusRes && statusRes.code === 200 && statusRes.data && isMeditatingStatus(statusRes.data)) {
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
        if (state.equipSwapEnabled && state.equipCombatSlot) {
            setStatus('切回战斗套...', 'run', 'Equip');
            await equipLoadoutApply(state.equipCombatSlot);
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
        var res = await gameApi().get('/api/game/inventory/category?tab=all&page=1&size=200');
        if (res && res.code === 200 && res.data && Array.isArray(res.data.items)) return res.data.items;
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
    async function useNirvanaPills(count) {
    if (!gameApi()) return false;
    var invRes = await gameApi().get('/api/game/inventory/category?tab=all&page=1&size=200');
    if (!invRes || invRes.code !== 200 || !invRes.data || !Array.isArray(invRes.data.items)) return false;
var pills = [];
var targetQuality = state.nirvanaQualityTarget || 5;
for (var i = 0; i < invRes.data.items.length; i++) {
    var item = invRes.data.items[i];
    var name = (item.name || item.itemName || '').toLowerCase();
    var tid = String(item.templateId || '').toLowerCase();
    var itemRarity = Number(item.rarity || item.quality || 0);
    if ((name.indexOf('涅槃') >= 0 || name.indexOf('重生') >= 0 || tid.indexOf('nirvana') >= 0 || tid.indexOf('rebirth') >= 0) && itemRarity >= targetQuality) {
        pills.push(item);
    }
}
    if (!pills.length) {
        nirvanaLog('背包没有涅槃丹');
        return false;
    }
    pills.sort(function(a, b) { return (b.rarity || 0) - (a.rarity || 0); });
    var used = 0;
    for (var i = 0; i < pills.length && used < count; i++) {
        var pill = pills[i];
        var qty = Number(pill.quantity || pill.count || 1);
        var need = Math.min(qty, count - used);
        var useRes = await gameApi().post('/api/game/use-item', { itemId: pill.id || pill.itemId, quantity: need });
        if (useRes && useRes.code === 200) {
            used += need;
            nirvanaLog('使用涅槃丹 ×' + need);
        } else {
            nirvanaLog('使用涅槃丹失败: ' + ((useRes && useRes.message) || '未知'));
        }
        await sleep(600);
    }
    return used >= count;
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
                    // 购买确认弹窗：自动点击"确定"按钮，失败重试
                    var confirmClicked = false;
                    for (var retry = 0; retry < 12 && !confirmClicked; retry++) {
                        await sleep(retry === 0 ? 400 : 800);
                        var confirmBtn = document.getElementById('gameDialogConfirmBtn')
                            || document.querySelector('.modal-btn--gold')
                            || document.querySelector('.modal--decorated .modal-btn:last-child');
                        if (confirmBtn && confirmBtn.offsetParent !== null) {
                            confirmBtn.click();
                            confirmClicked = true;
                            console.log('[Merchant] confirm clicked after ' + (retry + 1) + ' tries');
                        }
                    }
                    if (!confirmClicked) {
                        // 兜底：尝试点取消，避免卡在弹窗
                        var cancelBtn = document.getElementById('gameDialogCancelBtn')
                            || document.querySelector('.modal-btn--outline');
                        if (cancelBtn && cancelBtn.offsetParent !== null) {
                            cancelBtn.click();
                            console.log('[Merchant] confirm not found, clicked cancel');
                        }
                    }
                    // 等待购买完成，多检查几轮
                    for (var check = 0; check < 6; check++) {
                        await sleep(1500);
                        buyOk = !isMerchantActive();
                        if (buyOk) break;
                    }
                    if (!buyOk) {
                        // 最后一次：用API状态再确认
                        try {
                            var checkRes = await gameApi().get('/api/game/merchant');
                            if (!checkRes || checkRes.code !== 200 || !checkRes.data) buyOk = true;
                        } catch(_) { buyOk = true; }
                    }
                    if (!buyOk) toast('商人购买可能失败，准备离开');
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

        if (state.noCrossRealmFight) {
            var REALM_MAJOR = ['锻体期','练气期','筑基期','金丹期','元婴期','化神期','炼虚期','合道期','大乘期','渡劫期','真仙境','玄仙境','上仙境','天仙境','仙君境','仙王境','仙帝境','仙尊境','仙祖境','圣人境'];
            var REALM_MINOR_SUFFIX = ['一重','二重','三重','四重','五重','六重','七重','八重','九重','一层','二层','三层','四层','五层','六层','七层','八层','九层','前期','初期','中期','后期','大圆满','一劫仙人','二劫仙人','三劫仙人','四劫仙人','五劫仙人','六劫仙人','七劫仙人','八劫仙人','九劫仙人','十劫仙人'];
            var REALM_MINOR_IDX = { '一重':0,'二重':1,'三重':2,'四重':3,'五重':4,'六重':5,'七重':6,'八重':7,'九重':8, '一层':0,'二层':1,'三层':2,'四层':3,'五层':4,'六层':5,'七层':6,'八层':7,'九层':8, '前期':0,'初期':0,'中期':1,'后期':2,'大圆满':3, '一劫仙人':0,'二劫仙人':1,'三劫仙人':2,'四劫仙人':3,'五劫仙人':4,'六劫仙人':5,'七劫仙人':6,'八劫仙人':7,'九劫仙人':8,'十劫仙人':9 };

            function __parseMajorRealm(fullName) {
                var best = null, bestLen = 0;
                for (var i = 0; i < REALM_MAJOR.length; i++) {
                    var r = REALM_MAJOR[i];
                    if (fullName.indexOf(r) === 0 && r.length > bestLen) { best = r; bestLen = r.length; }
                }
                return best;
            }

            function __parseMinorIdx(fullName, majorName) {
                var suffix = fullName.substring(majorName.length);
                if (REALM_MINOR_IDX.hasOwnProperty(suffix)) return REALM_MINOR_IDX[suffix];
                return -1;
            }

            var playerMajor = (p.realmName || '').trim();
            var playerMajorIdx = REALM_MAJOR.indexOf(playerMajor);
            var playerMinorIdx = Number(p.realmLevel || 0);

            var monsterFull = (encounterData.monsterRealmName || '').trim();
            var monsterMajor = __parseMajorRealm(monsterFull);
            var monsterMajorIdx = monsterMajor ? REALM_MAJOR.indexOf(monsterMajor) : -1;
            var monsterMinorIdx = monsterMajor ? __parseMinorIdx(monsterFull, monsterMajor) : -1;

            if (monsterMajorIdx >= 0 && playerMajorIdx >= 0) {
                if (monsterMajorIdx > playerMajorIdx) {
                    return {
                        safe: false,
                        reason: '妖兽大境界过高（不越阶：' + monsterMajor + ' > ' + playerMajor + '）',
                        summary: '自身 ' + playerMajor + '；妖兽 ' + monsterMajor + '；禁止跨大境界'
                    };
                }
                if (monsterMajorIdx === playerMajorIdx && monsterMinorIdx >= 0 && playerMinorIdx >= 0) {
                    var gap = Number(state.noCrossRealmGap || 0);
                    if (monsterMinorIdx - playerMinorIdx >= gap) {
                        return {
                            safe: false,
                            reason: '妖兽小境界过高（不越阶：差距' + (monsterMinorIdx - playerMinorIdx) + ' ≥ 上限' + gap + '）',
                            summary: '自身 ' + playerMajor + ' 小阶' + playerMinorIdx + '；妖兽 小阶' + monsterMinorIdx + '；允许越阶上限 ' + gap
                        };
                    }
                }
            }
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
                if (!manual && state.autoHireCheapest) {
                    busyEvent = false;
                    return await handleEncounterEvent();
                }
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
        syncSettingsFromUi();
        ['hp', 'mp'].forEach(function(id) {
            var rows = document.querySelectorAll('#sortList_' + id + ' .sort-row');
            var enabled = [];
            rows.forEach(function(row) {
                var cb = row.querySelector('.sort-cb');
                if (cb && cb.checked) {
                    var key = row.getAttribute('data-key');
                    var map = { 'mp':'灵力', 'pill':'丹药', 'sect':'宗门', 'adpoint':'仙缘', 'stone':'灵石' };
                    enabled.push(map[key] || key);
                }
            });
            var val = enabled.join(',');
            var key = 'lvSpiritCleaner.auto' + (id === 'hp' ? 'H' : 'M') + 'pPriority';
            localStorage.setItem(key, val);
            if (id === 'hp') state.autoHpPriority = val;
            else state.autoMpPriority = val;
        });
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
                var healAmount = -1;
                setStatus('灵气疗伤 回满HP', 'run');
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
                var invRes = await gameApi().get('/api/game/inventory/category?tab=all&page=1&size=200');
                if (invRes && invRes.code === 200 && invRes.data && Array.isArray(invRes.data.items)) inv = invRes.data.items;
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

    // 每日自动授业
    async function autoTeachDaily() {
        if (!state.autoTeachDaily || !gameApi()) return;
        var today = new Date().toDateString();
        if (localStorage.getItem('lvscTeachDate') === today) return;
        try {
            var res = await gameApi().post('/api/master/trial/grant-all', {});
            if (res && res.code === 200) {
                localStorage.setItem('lvscTeachDate', today);
                var names = [];
                if (res.data && res.data.items) {
                    for (var i = 0; i < res.data.items.length; i++) {
                        names.push(res.data.items[i].apprenticeName || '徒弟');
                    }
                }
                var msg = names.length ? '已对 ' + names.join('、') + ' 授业' : '已执行一键授业';
                setStatus(msg, 'run');
                wecomEnqueue('授业完成', msg);
                masterLog('✅ ' + msg);
            } else {
                masterLog('❌ 授业失败: ' + (res ? res.message || JSON.stringify(res) : '无响应'));
            }
        } catch (err) {
            masterLog('❌ 授业异常: ' + err);
        }
    }
    // 每日自动赠物（正确API：imprint-all，显示游戏提示）
    async function autoGiftItemsDaily() {
        if (!state.autoGiftItemsDaily || !gameApi()) return;
        var today = new Date().toDateString();
        if (localStorage.getItem('lvscGiftItemsDate') === today) return;
        if (!state.giftPlayerItemId) { masterLog('❌ 赠物: 未选择物品'); return; }
        try {
                    // 获取徒弟名称映射
            var _nameMap = {};
            try {
                var _apprRes = await gameApi().get('/api/master/overview');
                if (_apprRes && _apprRes.code === 200 && _apprRes.data && _apprRes.data.apprentices) {
                    for (var _ai = 0; _ai < _apprRes.data.apprentices.length; _ai++) {
                        var _a = _apprRes.data.apprentices[_ai];
                        _nameMap[_a.playerId || _a.id || _a.apprenticeId] = _a.name || _a.apprenticeName || '?';
                    }
                }
            } catch(_) {}
            if (state.giftItemsMode === 'each') {
                // 逐个模式：按(物品ID,数量)分组，每组调一次-all接口+apprenticeIds
                var qtys = state.giftItemsDiscipleQtys || {};
                var discItems = state.giftItemsDiscipleItems || {};
                var ids = state.giftItemsSelected || [];
                if (!ids.length) { masterLog('❌ 赠物: 未选择徒弟'); return; }
                var groupMap = {};
                for (var giIdx = 0; giIdx < ids.length; giIdx++) {
                    var sid = ids[giIdx];
                    var q = parseInt(qtys['id_' + sid], 10) || parseInt(state.giftItemQty, 10) || 1;
                    var ditem = discItems['id_' + sid] || {};
                    var itemId = ditem.itemId || state.giftPlayerItemId;
                    var itemName = ditem.itemName || state.giftItemName || '物品';
                    var key = itemId + '_' + q;
                    if (!groupMap[key]) groupMap[key] = {itemId: itemId, itemName: itemName, qty: q, ids: []};
                    groupMap[key].ids.push(sid);
                }
                var groupKeys = Object.keys(groupMap);
                var _okCount = 0;
                for (var gkIdx = 0; gkIdx < groupKeys.length; gkIdx++) {
                    var group = groupMap[groupKeys[gkIdx]];
                    var gids = group.ids;
                    var groupQty = group.qty;
                    var itemId = group.itemId;
                    var itemName = group.itemName;
                    var _giftNames = []; for (var _gi2 = 0; _gi2 < gids.length; _gi2++) { _giftNames.push(_nameMap[gids[_gi2]] || '?' + gids[_gi2]); }
                    masterLog('📦 赠物 [' + itemName + '] x' + groupQty + ' -> ' + _giftNames.join(', '));
                    var giftRes = await gameApi().post('/api/master/legacy/imprint-all', {
                        playerItemId: itemId,
                        quantity: groupQty,
                        apprenticeIds: gids,
                        reason: ''
                    });
                    if (!giftRes || giftRes.code !== 200 || !giftRes.data || /失败|已送完|操作太快/.test(giftRes.message || '')) { masterLog('⚠️ 赠物失败(x' + groupQty + '): ' + ((giftRes && giftRes.message) || 'Empty response')); } else { _okCount++; }
                    if (gkIdx < groupKeys.length - 1) await new Promise(function(r){setTimeout(r,5000);});
                }
                masterLog('✅ 赠物完成：成功 ' + _okCount + '/' + groupKeys.length + ' 组');
            }
 else {
                var qty = parseInt(state.giftItemQty, 10) || 1;
                var ids = state.giftItemsSelected || [];
                if (ids.length === 0) ids = undefined;
                var body = {playerItemId: state.giftPlayerItemId, quantity: qty, reason: ''};
                if (ids) body.apprenticeIds = ids;
                var giftRes = await gameApi().post('/api/master/legacy/imprint-all', body);
                if (giftRes && giftRes.code === 200 && giftRes.data && !/失败|已送完|操作太快/.test(giftRes.message || '')) {
                    masterLog('✅ 赠物完成：成功 1/1');
                } else {
                    masterLog('⚠️ 赠物失败: ' + ((giftRes && giftRes.message) || 'Empty response'));
                }
            }
            localStorage.setItem('lvscGiftItemsDate', today);
            wecomEnqueue('赠物完成', '已完成每日赠物');
        } catch (err) { masterLog('❌ 赠物异常: ' + err); }
    }

    // 每日自动赠灵石（正确API：gift-stones-all，显示游戏提示）
    async function autoGiftStonesDaily() {
        if (!state.autoGiftStonesDaily || !gameApi()) return;
        var today = new Date().toDateString();
        if (localStorage.getItem('lvscGiftStonesDate') === today) return;
        try {
                    // 获取徒弟名称映射
            var _nameMap2 = {};
            try {
                var _apprRes2 = await gameApi().get('/api/master/overview');
                if (_apprRes2 && _apprRes2.code === 200 && _apprRes2.data && _apprRes2.data.apprentices) {
                    for (var _ai2 = 0; _ai2 < _apprRes2.data.apprentices.length; _ai2++) {
                        var _a2 = _apprRes2.data.apprentices[_ai2];
                        _nameMap2[_a2.playerId || _a2.id || _a2.apprenticeId] = _a2.name || _a2.apprenticeName || '?';
                    }
                }
            } catch(_) {}
            if (state.giftStonesMode === 'each') {
                // 逐个模式：按数量分组，每组调一次-all接口+apprenticeIds
                var qtys = state.giftStonesDiscipleQtys || {};
                var ids = state.giftStonesSelected || [];
                if (!ids.length) { masterLog('❌ 赠灵石: 未选择徒弟'); return; }
                var qtyGroups = {};
                for (var gsIdx = 0; gsIdx < ids.length; gsIdx++) {
                    var sid = ids[gsIdx];
                    var q = parseInt(qtys['id_' + sid], 10) || Math.max(1, state.giftStonesQty || 1);
                    if (!qtyGroups[q]) qtyGroups[q] = [];
                    qtyGroups[q].push(sid);
                }
                var qtyKeys = Object.keys(qtyGroups);
                var _okCount2 = 0;
                for (var gkIdx = 0; gkIdx < qtyKeys.length; gkIdx++) {
                    var groupQty = parseInt(qtyKeys[gkIdx], 10);
                    var gids = qtyGroups[qtyKeys[gkIdx]];
                                        var _stoneNames = []; for (var _gi3 = 0; _gi3 < gids.length; _gi3++) { _stoneNames.push(_nameMap2[gids[_gi3]] || '?' + gids[_gi3]); }
                    masterLog('💎 赠灵石 x' + groupQty + ' -> ' + _stoneNames.join(', '));
                    var stoneRes = await gameApi().post('/api/master/gift-stones-all', {
                        amount: groupQty,
                        apprenticeIds: gids,
                        reason: ''
                    });
                    if (stoneRes && stoneRes.code === 200 && stoneRes.data && !/失败|已送完|操作太快/.test(stoneRes.message || '')) {
                        _okCount2++;
                        masterLog('✅ 赠灵石完成 x' + groupQty + ' -> ' + _stoneNames.join(', '));
                    } else {
                        masterLog('⚠️ 赠灵石失败(x' + groupQty + '): ' + ((stoneRes && stoneRes.message) || 'Empty response'));
                    }
                    if (gkIdx < qtyKeys.length - 1) await new Promise(function(r){setTimeout(r,5000);});
                }
            } else {
                var qty = Math.max(1, state.giftStonesQty || 1);
                var ids = state.giftStonesSelected || [];
                if (ids.length === 0) ids = undefined;
                var body = {amount: qty, reason: ''};
                if (ids) body.apprenticeIds = ids;
                var stoneRes = await gameApi().post('/api/master/gift-stones-all', body);
                if (stoneRes && stoneRes.code === 200 && stoneRes.data && !/失败|已送完|操作太快/.test(stoneRes.message || '')) {
                    masterLog('✅ 赠灵石完成：成功 1/1');
                } else {
                    masterLog('⚠️ 赠灵石失败: ' + ((stoneRes && stoneRes.message) || 'Empty response'));
                }
            }
            localStorage.setItem('lvscGiftStonesDate', today);
            wecomEnqueue('赠灵石完成', '已完成每日赠灵石');
        } catch (err) { masterLog('❌ 赠灵石异常: ' + err); }
    }

    // 自动处理徒弟请求
    async function handleMasterRequests() {
        if (!state.autoMasterRequests || !gameApi()) return;
        try {
            var res = await gameApi().get('/api/master/overview');
            if (!res || res.code !== 200 || !res.data) return;
            var requests = (res.data.incomingRequests || []).filter(function (r) { return r.status === 'OPEN'; });
            if (!requests.length) return;
            masterLog('📋 检测到 ' + requests.length + ' 个待处理请求');
            for (var i = 0; i < requests.length; i++) {
                var req = requests[i];
                var kind = req.kind || '';
                var name = req.fromName || req.toName || '徒弟';
                masterLog('处理请求: ' + kind + ' from ' + name);
                if (kind === 'WENDAO') {
                    try { await gameApi().post('/api/master/wendao/fulfill', { requestId: req.id }); masterLog('✅ 已帮 ' + name + ' 解惑'); } catch (_) { masterLog('❌ 解惑失败: ' + name); }
                    wecomEnqueue('问道处理', '已帮徒弟 ' + name + ' 解惑');
                } else if (kind === 'HUDAO') {
                    if (state.autoHudaoBreakMeditate) {
                        var _p = getPlayer() || {};
                        if (_p.isMeditating || window._meditationActive || window._meditationInProgress) {
                            setStatus('检测到护道申请，中断冥想处理...', 'run');
                            masterLog('⏸️ 中断冥想处理护道');
                            await stopMeditationAndRefresh();
                            await sleep(1000);
                        }
                    }
                    try { await gameApi().post('/api/master/hudao/accept', { requestId: req.id }); masterLog('✅ 已应允 ' + name + ' 的护道'); } catch (_) { masterLog('❌ 护道失败: ' + name); }
                    wecomEnqueue('互道突破', '已应允徒弟 ' + name + ' 的护道');
                    if (state.autoHudaoBreakMeditate && state.autoMeditate) {
                        var _info = getSpiritInfo();
                        if (_info.player && _info.spirit < _info.maxSpirit) {
                            await sleep(2000);
                            var _medBtn = document.getElementById('meditateBtn');
                            if (_medBtn && !_medBtn.classList.contains('meditating')) {
                                await humanClick(_medBtn);
                                masterLog('🔁 护道完成，恢复冥想');
                            }
                        }
                    }
                } else if (kind === 'LILIAN') {
                    try { await gameApi().post('/api/master/lilian/accept', { requestId: req.id }); masterLog('✅ 已接取 ' + name + ' 的历练'); } catch (_) { masterLog('❌ 历练失败: ' + name); }
                    wecomEnqueue('历练应允', '已接取徒弟 ' + name + ' 的历练');
                } else if (kind === 'OFFERING') {
                    try { await gameApi().post('/api/master/offering/accept', { requestId: req.id }); masterLog('✅ 已收取 ' + name + ' 的贡品'); } catch (_) { masterLog('❌ 纳贡失败: ' + name); }
                    wecomEnqueue('纳贡收取', '已收取徒弟 ' + name + ' 的贡品');
                }
                await sleep(800);
            }
        } catch (err) {
            console.warn('[LingVerse Spirit Cleaner] master requests failed', err);
            masterLog('❌ 处理请求异常: ' + err);
        }
    }

    // 主动恢复（回血回蓝）
    var HP_PILL_PREFIXES = ['pill_recovery_', 'pill_blood_', 'pill_life_', 'pill_nirvana_', 'pill_heavenly_', 'pill_chaos_life_', 'sect_pill_blood_'];
    var MP_PILL_PREFIXES = ['pill_spirit_', 'pill_spring_', 'pill_mana_', 'pill_xuan_spirit_', 'pill_clarity_', 'sect_pill_spirit_'];
    var MP_PILL_EXCLUDES = ['pill_spirit_voyage_'];

    function isHpPill(item) { var tid = String(item.templateId || '').toLowerCase(); for (var i = 0; i < HP_PILL_PREFIXES.length; i++) { if (tid.indexOf(HP_PILL_PREFIXES[i]) >= 0) return true; } return false; }
    function isMpPill(item) { var tid = String(item.templateId || '').toLowerCase(); for (var i = 0; i < MP_PILL_EXCLUDES.length; i++) { if (tid.indexOf(MP_PILL_EXCLUDES[i]) >= 0) return false; } for (var i = 0; i < MP_PILL_PREFIXES.length; i++) { if (tid.indexOf(MP_PILL_PREFIXES[i]) >= 0) return true; } return false; }

    async function fetchInventory() { try { var res = await gameApi().get('/api/game/inventory/category?tab=all&page=1&size=200'); if (res && res.code === 200 && res.data && Array.isArray(res.data.items)) return res.data.items; } catch (_) {} return []; }
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
                if (m === 'mp' && s.mp > s.maxMp * 0.2) { try { var r1 = await gameApi().post('/api/game/heal-with-mp', { hpAmount: -1 }); if (r1 && r1.code === 200) { needHp = false; break; } } catch (_) {} }
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
                if (state.noMasterProtector) return;
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
    function masterLog(message) {
        var log = document.getElementById('lvscMasterLog');
        if (!log) return;
        var time = new Date().toLocaleTimeString();
        log.textContent = '[' + time + '] ' + message + '\n' + (log.textContent || '');
        if (log.textContent.length > 8000) {
            log.textContent = log.textContent.substring(0, 8000);
        }
        // 保存到localStorage最多50条，刷新不清空
        var logs = [];
        try { logs = JSON.parse(localStorage.getItem('lvscMasterLogArr') || '[]'); } catch(_) {}
        logs.unshift('[' + time + '] ' + message);
        if (logs.length > 50) logs = logs.slice(0, 50);
        localStorage.setItem('lvscMasterLogArr', JSON.stringify(logs));
    }

    function craftLog(message) {
        var log = document.getElementById('lvscCraftQualityLog');
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

        function getCurrentInscItemId() {
            var id = window._lastInscItemId || '';
            if (!id) {
                var titleEl = document.querySelector('.inscription-header-title');
                if (titleEl) {
                    var container = titleEl.closest('[class*="inscription"], [class*="modal"], [class*="dialog"], [class*="panel"], [class*="draw"]');
                    if (!container && titleEl.parentElement) container = titleEl.parentElement.parentElement;
                    if (container) {
                        var insideBtns = container.querySelectorAll('[onclick]');
                        for (var i = 0; i < insideBtns.length; i++) {
                            var oc2 = String(insideBtns[i].getAttribute('onclick') || '');
                            var mm2 = oc2.match(/(\d+)/);
                            if (mm2) { id = mm2[1]; break; }
                        }
                    }
                }
                if (!id) {
                    var btns = document.querySelectorAll('[onclick]');
                    for (var bi = 0; bi < btns.length; bi++) {
                        var oc = String(btns[bi].getAttribute('onclick') || '');
                        if (oc.indexOf('inscri') >= 0 || oc.indexOf('Inscri') >= 0 || oc.indexOf('draw') >= 0) {
                            var mm = oc.match(/(\d+)/);
                            if (mm) { id = mm[1]; break; }
                        }
                    }
                }
            }
            return id;
        }

        function getCurrentInscItemName() {
            var el = document.querySelector('.inscription-header-title');
            if (el) return el.textContent.trim();
            return '';
        }

    async function autoInscriptionLoop() {

        if (autoInscriptionRunning) return;
        syncSettingsFromUi();
        // 每次启动都从下拉框重新读取选中的装备
        var selEl = document.getElementById('lvscInscriptionEquipment');
        if (selEl && selEl.value) {
            if (selEl.value === '__current__') {
                var foundId = getCurrentInscItemId();
                if (foundId) {
                    _inscItemId = String(foundId);
                    _inscItemName = getCurrentInscItemName() || '当前装备';
                } else {
                    setStatus('请先在游戏里打开装备的铭文页面', 'warn');
                    return;
                }
            } else {
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
    
    var MYSTERY_BOX_LOG_KEY = 'lvSpiritCleaner.mysteryBoxLog';
    var MYSTERY_BOX_OPENED_KEY = 'lvSpiritCleaner.mysteryBoxOpenedToday';
    var MYSTERY_BOX_DATE_KEY = 'lvSpiritCleaner.mysteryBoxLastDate';

    function getMysteryBoxLog() {
        try { return JSON.parse(localStorage.getItem(MYSTERY_BOX_LOG_KEY) || '[]'); } catch(_) { return []; }
    }
    function saveMysteryBoxLog(log) {
        try { localStorage.setItem(MYSTERY_BOX_LOG_KEY, JSON.stringify(log)); } catch(_) {}
    }
    function appendMysteryBoxLog(entry) {
        var log = getMysteryBoxLog();
        log.push(entry);
        saveMysteryBoxLog(log);
        renderMysteryBoxLog();
    }
    function renderMysteryBoxLog() {
        var el = document.getElementById('lvscMysteryBoxLog');
        if (!el) return;
        var log = getMysteryBoxLog();
        if (!log.length) { el.textContent = '暂无记录'; return; }
        el.innerHTML = log.map(function(e) {
            return '<span style=\"color:#8f846f\">' + e.time + '</span> ' + e.text;
        }).join('\n');
        el.scrollTop = el.scrollHeight;
    }

    function mysteryBoxOpenedToday() {
        var d = localStorage.getItem(MYSTERY_BOX_DATE_KEY);
        var today = new Date().toLocaleDateString('zh-CN');
        return d === today && localStorage.getItem(MYSTERY_BOX_OPENED_KEY) === '10';
    }

    async function openMysteryBoxOnce() {
        if (!gameApi()) return null;
        var res = await gameApi().post('/api/game/mystery-box/open', {});
        return res;
    }

    async function toggleAutoMysteryBox() {
        if (autoMysteryBoxRunning) {
            autoMysteryBoxRunning = false;
            updateMeter();
            setStatus('自动秘匣已停止', 'idle');
            var sb = document.getElementById('lvscMysteryBoxStopBtn'); if (sb) sb.style.display = 'none';
            var st = document.getElementById('lvscMysteryBoxStartBtn'); if (st) st.style.display = '';
            var ss = document.getElementById('lvscMysteryBoxStatus'); if (ss) ss.textContent = '';
            return;
        }
        if (!state.autoMysteryBox) {
            setStatus('请先勾选「每天自动开启10次造化秘匣」', 'warn');
            return;
        }
        autoMysteryBoxLoop();
    }

    async function autoMysteryBoxLoop() {
        autoMysteryBoxRunning = true;
        updateMeter();
        var st = document.getElementById('lvscMysteryBoxStartBtn'); if (st) st.style.display = 'none';
        var sb = document.getElementById('lvscMysteryBoxStopBtn'); if (sb) sb.style.display = '';
        var ss = document.getElementById('lvscMysteryBoxStatus'); if (ss) ss.textContent = '开启中...';
        setStatus('自动秘匣启动', 'run');

        var today = new Date().toLocaleDateString('zh-CN');
        var lastDate = localStorage.getItem(MYSTERY_BOX_DATE_KEY);
        if (lastDate !== today) {
            localStorage.setItem(MYSTERY_BOX_DATE_KEY, today);
            localStorage.setItem(MYSTERY_BOX_OPENED_KEY, '0');
            appendMysteryBoxLog({ time: new Date().toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit',second:'2-digit'}), text: '<span style=\"color:#dbb970\">━━━ ' + today + ' ━━━</span>' });
        }

        var opened = parseInt(localStorage.getItem(MYSTERY_BOX_OPENED_KEY) || '0', 10);
        var RAR = ['','普通','优良','稀有','史诗','传说'];

        for (var i = opened; i < 10 && autoMysteryBoxRunning; i++) {
            setStatus('自动秘匣 ' + (i+1) + '/10', 'run');
            try {
                var res = await openMysteryBoxOnce();
                if (!res || res.code !== 200 || !res.data) {
                    appendMysteryBoxLog({ time: new Date().toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit',second:'2-digit'}), text: '<span style=\"color:#ff6b6b\">✗ 第' + (i+1) + '次失败：' + ((res && res.message) || '未知错误') + '</span>' });
                    if (ss) ss.textContent = '开启失败，已停止';
                    break;
                }
                var d = res.data;
                if (!d.success) {
                    appendMysteryBoxLog({ time: new Date().toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit',second:'2-digit'}), text: '<span style=\"color:#ff6b6b\">✗ 第' + (i+1) + '次：' + (d.reason || '开启失败') + '</span>' });
                    if (ss) ss.textContent = '已停止（' + (d.reason || '失败') + '）';
                    break;
                }
                var item = d.item;
                var rName = RAR[item.rarity] || '未知';
                var colorMap = {1:'#aaa',2:'#6bc9a0',3:'#5b9bd5',4:'#c080e0',5:'#dbb970'};
                var color = colorMap[item.rarity] || '#cfc6b2';
                appendMysteryBoxLog({ time: new Date().toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit',second:'2-digit'}), text: '<span style=\"color:' + color + '\">[' + rName + ']</span> ' + (item.name || '未知物品') });

                var newOpened = parseInt(d.openedToday || (i+1), 10);
                localStorage.setItem(MYSTERY_BOX_OPENED_KEY, String(newOpened));
                if (newOpened >= 10) {
                    if (ss) ss.textContent = '今日秘匣已开启（10/10）';
                    break;
                }
                if (ss) ss.textContent = '已开 ' + newOpened + '/10';
                await sleep(800);
            } catch(err) {
                console.warn('[MysteryBox] error', err);
                appendMysteryBoxLog({ time: new Date().toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit',second:'2-digit'}), text: '<span style=\"color:#ff6b6b\">✗ 第' + (i+1) + '次异常：' + (err.message || err) + '</span>' });
                if (ss) ss.textContent = '异常，已停止';
                break;
            }
        }

        autoMysteryBoxRunning = false;
        updateMeter();
        if (sb) sb.style.display = 'none';
        if (st) st.style.display = '';
        var finalOpened = parseInt(localStorage.getItem(MYSTERY_BOX_OPENED_KEY) || opened, 10);
        if (finalOpened >= 10 && ss) ss.textContent = '今日秘匣已开启（10/10）';
        setStatus('自动秘匣完成', 'idle');
    }

    function getMonitorTargetSpirit(info) {
        var maxSpirit = Number(info && info.maxSpirit || 0);
        if (state.monitorStartSpirit > 0) return Math.max(1, Math.floor(maxSpirit * state.monitorStartSpirit / 100));
        return maxSpirit;
    }

    async function monitorSpiritLoop() {
        if (monitoringSpirit || running) return;
        monitoringSpirit = true;
        try { localStorage.setItem('lvSpiritCleaner.monitoringSpirit', '1'); } catch(_) {}
        syncSettingsFromUi();
        updateMeter();
        var monitorStartedAt = Date.now();
        var monitorSpiritPerMinute = Number(window.meditationSpiritRate || 0);
        var MIN_MONITOR_MS = 30000; // 最短监测30秒，防止秒级反复横跳

        while (monitoringSpirit && !running) {
            await refreshPlayer();
            if (state.autoBreakthrough) await autoBreakthroughCheck();
            if (state.autoOriginRepair) await autoOriginRepairCheck();
            if (state.autoTeachDaily) await autoTeachDaily();
            if (state.autoGiftItemsDaily) await autoGiftItemsDaily();
            if (state.autoGiftStonesDaily) await autoGiftStonesDaily();
            if (state.autoMasterRequests) await handleMasterRequests();

                        // 非冥想状态自动疗伤
            if (state.sectQuickRecovery) {
                var _pRec = getPlayer() || {};
                if (!_pRec.isMeditating && !window._meditationActive && !window._meditationInProgress) {
                    await activeRecover();
                }
            }
            var info = getSpiritInfo();
            var target = getMonitorTargetSpirit(info);
            if (!info.player || target <= 0) {
                setStatus('监测中：等待角色数据', 'warn');
            } else {
                var statusRes = null;
                try {
                    statusRes = await gameApi().get('/api/game/meditate/status');
                } catch (_) {}

            if (statusRes && statusRes.code === 200 && statusRes.data && isMeditatingStatus(statusRes.data)) {
                    monitorSpiritPerMinute = Number(statusRes.data.spiritPerMinute || monitorSpiritPerMinute || 0);
                    var progress = estimateMeditateProgress(statusRes.data, info, monitorSpiritPerMinute, monitorStartedAt);
                    setStatus('监测冥想：' + progress.current + ' + ' + progress.gained + ' = ' + progress.total + '/' + target, 'run');
                    if (progress.total >= target && Date.now() - monitorStartedAt > MIN_MONITOR_MS) {
                        monitoringSpirit = false; try { localStorage.setItem('lvSpiritCleaner.monitoringSpirit', '0'); } catch(_) {}
                        updateMeter();
                        setStatus('预计神识已到，收功后开始清理', 'run');
                        await stopMeditationAndRefresh();
                        await sleep(300);
                        if (state.exploreMode === 'system') { await systemExploreLoop(); }
                        else { await runLoop(); }
                        return;
                    }
                } else if (info.spirit >= target && Date.now() - monitorStartedAt > MIN_MONITOR_MS) {
                    monitoringSpirit = false; try { localStorage.setItem('lvSpiritCleaner.monitoringSpirit', '0'); } catch(_) {}
                    updateMeter();
                    setStatus('神识已到 ' + info.spirit + '/' + target + '，开始清理', 'run');
                    await sleep(300);
                    if (state.exploreMode === 'system') { await systemExploreLoop(); }
                    else { await runLoop(); }
                    return;
                } else if (state.autoMeditate && info.spirit < info.maxSpirit) {
                    try {
                        await gameApi().post('/api/game/meditate/start', {});
                        await sleep(1000);
                        monitorStartedAt = Date.now();
                    } catch (_) {
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
            if (state.autoTeachDaily) await autoTeachDaily();
            if (state.autoGiftItemsDaily) await autoGiftItemsDaily();
            if (state.autoGiftStonesDaily) await autoGiftStonesDaily();
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
                    wecomEnqueue('🔄 清理中', '神识剩余：' + _rci.spirit + '/' + _rci.maxSpirit + '\n境界：' + getPlayerRealmStr());
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
                    if (state.autoMaintainLuck) await autoMaintainLuckCheck();
                    if (state.autoVoidBody && !hasVoidBodyBuff()) await ensureVoidBodyBuff(false);
                    if (state.autoHiddenCharm) await ensureHiddenCharm(false);
                    if (state.sectQuickRecovery) await activeRecover();
                    if (state.autoRepair) await triggerAutoRepair(false);
                    if (state.autoNatalDevour) await triggerAutoNatalDevour(false);
                    if (state.autoBreakthrough) await autoBreakthroughCheck();
                    if (state.autoOriginRepair) await autoOriginRepairCheck();
                    if (await checkEventBlockers()) { await sleep(state.delayMs); continue; }
                    if (state.autoTeachDaily) await autoTeachDaily();
                    if (state.autoMasterRequests) await handleMasterRequests();
                    applyExploreMultiplier();
                } catch (_) {}
                await sleep(5000);
            }
            console.log('[SysExplore] monitor loop exited. running=' + running + ' _autoExploreRunning=' + (typeof _autoExploreRunning !== 'undefined' ? _autoExploreRunning : 'undef'));
            if (!running) break;
            // 立即处理导致探索中断的事件（商人/遭遇），不要等"异常自启"兜底
            if (typeof _merchantActive !== 'undefined' && _merchantActive) {
                console.log('[SysExplore] merchant caused stop, handling immediately...');
                setStatus('处理商人事件...', 'run');
                try { await handleMerchantEvent(); } catch(_) {}
                await sleep(500);
                continue; // 回到外层循环，重新启动探索
            }
            if (typeof _encounterActive !== 'undefined' && _encounterActive) {
                console.log('[SysExplore] encounter caused stop, handling immediately...');
                setStatus('处理妖兽遭遇...', 'run');
                try { if (state.aggressiveMode) await handleEncounterEvent(); else await handleSelfFightEvent(false); } catch(_) {}
                await sleep(500);
                continue;
            }
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
            var _endPct = 0; var _p = getPlayer() || {}; if (_p.cultivationNeeded > 0) _endPct = Math.min(100, (_p.cultivation || 0) / _p.cultivationNeeded * 100);
            var _diffPct = (_endPct - (_cleanStats.startRealmPct || 0));
            var _progressLine = '修为进度：' + (_cleanStats.startRealmPct || 0).toFixed(1) + '% → ' + _endPct.toFixed(1) + '%';
            if (_diffPct > 0.01 || _diffPct < -0.01) _progressLine += '（' + (_diffPct > 0 ? '+' : '') + _diffPct.toFixed(1) + '%）';
            var _lines = ['运行时长：' + _elapsed + '分钟', '探索次数：' + _cleanStats.explores, '遭遇妖兽：' + _cleanStats.combats + '次', _progressLine];
            if (_cleanStats.deaths > 0) _lines.push('死亡次数：' + _cleanStats.deaths);
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
                // 启动时切战斗套
        if (state.equipSwapEnabled && state.equipCombatSlot) {
            setStatus('切换战斗套...', 'run', 'Equip');
            await equipLoadoutApply(state.equipCombatSlot);
        }

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
            if (state.autoTeachDaily) await autoTeachDaily();
            if (state.autoGiftItemsDaily) await autoGiftItemsDaily();
            if (state.autoGiftStonesDaily) await autoGiftStonesDaily();
            if (state.autoMasterRequests) await handleMasterRequests();

            // 每10分钟清理中通知
            if (Date.now() - _lastCleanReport > 600000) {
                _lastCleanReport = Date.now();
                var ci = getSpiritInfo();
                wecomEnqueue('🔄 清理中', '神识剩余：' + ci.spirit + '/' + ci.maxSpirit + '\n境界：' + getPlayerRealmStr());
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
                                                    // 白天冥想前切换神识套
                            if (state.equipSwapEnabled && state.equipSpiritSlot) {
                                setStatus('切换神识套...', 'run', 'Equip');
                                await equipLoadoutApply(state.equipSpiritSlot);
                            }
                            setStatus('白天挂机冥想等入夜', 'run');
                            var _nMedBtn = document.getElementById('meditateBtn');
                            if (_nMedBtn && !_nMedBtn.classList.contains('meditating')) {
                                await humanClick(_nMedBtn);
                                await sleep(2000);
                            }
                            var startNRes = await gameApi().get('/api/game/meditate/status');
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
                // 入夜后切回战斗套
                if (state.equipSwapEnabled && state.equipCombatSlot) {
                    setStatus('切回战斗套...', 'run', 'Equip');
                    await equipLoadoutApply(state.equipCombatSlot);
                }
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
                if (state.autoMaintainLuck) { await autoMaintainLuckCheck(); }
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
                        // 夜晚探索失败时，如果人物在冥想则强制收功重试
                        var _pAfterStop = getPlayer() || {};
                        if (_pAfterStop.isMeditating) {
                            setStatus('夜晚探索阻塞，强制收功重试', 'warn');
                            try { await gameApi().post('/api/game/meditate/stop', {}); } catch(_) {}
                            await sleep(2000);
                        } else {
                            setStatus('游戏事件触发，10秒后重试', 'warn');
                        }
                    }
                    await sleep(10000);
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
    if (autoNirvanaTimerInterval) { clearInterval(autoNirvanaTimerInterval); autoNirvanaTimerInterval = null; }
    autoNirvanaRunning = false;
    running = false;
        persistRunning(false);
        // 清理完成统计
        if (_cleanStats.explores > 0) {
            var elapsed = Math.floor((Date.now() - _cleanStats.startTime) / 60000);
            var realmNow = getPlayerRealmStr();
            var endPct = 0; var _pp = getPlayer() || {}; if (_pp.cultivationNeeded > 0) endPct = Math.min(100, (_pp.cultivation || 0) / _pp.cultivationNeeded * 100);
            var diffPct = (endPct - (_cleanStats.startRealmPct || 0));
            var progressLine = '修为进度：' + (_cleanStats.startRealmPct || 0).toFixed(1) + '% → ' + endPct.toFixed(1) + '%';
            if (diffPct > 0.01 || diffPct < -0.01) progressLine += '（' + (diffPct > 0 ? '+' : '') + diffPct.toFixed(1) + '%）';
            var lines = [
                '运行时长：' + elapsed + '分钟',
                '探索次数：' + _cleanStats.explores,
                '遭遇妖兽：' + _cleanStats.combats + '次',
                progressLine,
            ];
            if (_cleanStats.deaths > 0) lines.push('死亡次数：' + _cleanStats.deaths);
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
    function initSectionCollapse(){}
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
        var allowed = ['explore','auto','other'];
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
        var sortedItems = items.slice().sort(function(a,b){
            var oa = order[a.key] !== undefined ? order[a.key] : 999;
            var ob = order[b.key] !== undefined ? order[b.key] : 999;
            return oa - ob;
        });
        var html = '<div class="sort-list" id="sortList_' + id + '">';
        for (var i = 0; i < sortedItems.length; i++) {
            var it = sortedItems[i];
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
        // Also update state immediately + persist
        if (id === 'hp') { state.autoHpPriority = val; persistSetting('lvSpiritCleaner.autoHpPriority', val); }
        else { state.autoMpPriority = val; persistSetting('lvSpiritCleaner.autoMpPriority', val); }
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
        var result = [];
        if (_cachedAreaNames.length) return _cachedAreaNames.slice();
        var scanned = scanMapNodes();
        if (scanned.length) return scanned;
        var sel = document.getElementById('exploreArea') || document.querySelector('select[name="area"]');
        if (sel && sel.options) {
            for (var oi = 0; oi < sel.options.length; oi++) {
                var txt = String(sel.options[oi].text || '').trim();
                if (txt) result.push(txt);
            }
            if (result.length > 1) return result;
        }
        // 从缓存取当前大陆的子区域
        var raw = localStorage.getItem('lvscAreaNameCache');
        if (raw) {
            try {
                var cached = JSON.parse(raw);
                // 当前区域名（从页面 statArea 或 player 拿）
                var myName = '';
                var sa = document.getElementById('statArea'); if (sa) myName = (sa.textContent||'').trim();
                if (!myName) { var p = getPlayer()||{}; myName = p.areaName||''; }
                // 用名称反查 continent
                var myCont = '';
                var ks = Object.keys(cached);
                for (var ki=0;ki<ks.length;ki++) { var v=cached[ks[ki]]; var nm=(v&&v.n)||v; if (nm===myName) { myCont=(v&&v.c)||''; break; } }
                if (myCont) {
                    for (var ki=0;ki<ks.length;ki++) { var v=cached[ks[ki]]; var nm=(v&&v.n)||v; if ((v&&v.c)===myCont && nm && result.indexOf(nm)<0) result.push(nm); }
                    result.sort();
                    if (result.length) return result;
                }
                // 兜底全列
                for (var ki=0;ki<ks.length;ki++) { var v=cached[ks[ki]]; var nm=(v&&v.n)||v; if (nm&&result.indexOf(nm)<0) result.push(nm); }
                result.sort();
                if (result.length) return result;
            } catch(_) {}
        }
        if (!result.length) result.push('点刷新地图加载区域');
        return result;
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
            '.lvsc-action-btn{background:linear-gradient(135deg,#dbb970,#c9a050);color:#17141d;border:0!important;font-weight:700}',
            '.lvsc-action-btn:hover{opacity:.9}',
            '.lvsc-stop-btn{background:rgba(255,107,107,.16);color:#ff6b6b;border:1px solid rgba(255,107,107,.28)!important;font-weight:700}',
            '.lvsc-stop-btn:hover{background:rgba(255,107,107,.28)}',
            '.lvsc-rfr-btn{background:rgba(255,255,255,.08);color:#cfc6b2;border:1px solid rgba(255,255,255,.1)!important;font-size:11px}',
            '.lvsc-rfr-btn:hover{background:rgba(255,255,255,.14)}',
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
            '#lvscTabs{position:sticky;top:-12px;z-index:3;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:-2px -2px 0;padding:4px 2px 6px;background:rgba(17,20,29,.96);border-bottom:1px solid rgba(255,255,255,.08)}',
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
            '.lvsc-section-title-row{display:flex;align-items:center;gap:8px;min-width:0}',
            '.lvsc-section>.lvsc-section-title,.lvsc-section-title-row{cursor:pointer;user-select:none}',
            '.lvsc-section>.lvsc-section-title::before{content:"▼ ";font-size:10px}',
            '.lvsc-section-title-row>span::before{content:"▼ ";font-size:10px;color:#dbb970}',
            '.lvsc-section>.lvsc-section-title.lvsc-title-collapsed::before{content:"▶ "}',
            '.lvsc-big-cat-title-row>span{font-size:14px!important;color:#f0d890!important}',
            '.lvsc-big-cat-title-row{background:rgba(219,185,112,.06);border-radius:6px;padding:4px 8px;margin:0 -4px}',
            '.lvsc-section-title-row.lvsc-title-collapsed>span::before{content:"▶ "}',
'body .lvsc-section-content-hidden{display:none!important}',
'body .lvsc-search-hidden{display:none!important}',
'.lvsc-big-cat-title-row.lvsc-title-collapsed~*{display:none!important}',
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
                var loadoutNames = getGameLoadoutNames();
        panel.innerHTML =
            '<header><span id="lvscTitle"><span id="lvscTitleText">神识清理</span></span><span id="lvscHeaderActions"><button id="lvscCollapseBtn" title="收起成横幅">收起</button><button id="lvscClose" title="隐藏">×</button></span></header>' +
            '<div id="lvscStatus" data-tone="idle">待命</div>' +
            '<div id="lvscCompactBar"><span id="lvscCompactSpirit">读取中</span><span id="lvscCompactStatus" data-tone="idle">待命</span><button id="lvscCompactRunBtn">开始</button><button id="lvscCompactMonitorBtn">监测</button><button id="lvscCompactAutoRestartBtn" style="height:30px;min-width:36px;font-size:10px;background:rgba(255,255,255,.08);color:#cfc6b2;border:1px solid rgba(255,255,255,.12)!important">自启</button><button id="lvscExpandBtn">展开</button></div>' +
            '<div id="lvscBody">' +
            '<div class="lvsc-meter"><div id="lvscSpiritValue">读取中...</div><div id="lvscSpiritTrack"><div id="lvscSpiritFill"></div></div></div>' +
            '<div id="lvscTabs">' +
            '<button class="lvsc-tab" data-tab="explore">探索</button>' +
            '<button class="lvsc-tab" data-tab="auto">自动</button>' +
            '<button class="lvsc-tab" data-tab="other">其他</button>' +
            '</div>' +
            '<div style="display:flex;gap:6px;margin-bottom:4px;align-items:center"><button id="lvscExpandAll" style="height:24px;padding:0 10px;background:rgba(255,255,255,.08);color:#cfc6b2;border:1px solid rgba(255,255,255,.1);border-radius:6px;font-size:11px;cursor:pointer;white-space:nowrap">全部展开</button><button id="lvscCollapseAll" style="height:24px;padding:0 10px;background:rgba(255,255,255,.08);color:#cfc6b2;border:1px solid rgba(255,255,255,.1);border-radius:6px;font-size:11px;cursor:pointer;white-space:nowrap">全部折叠</button><input id="lvscSearchFunc" placeholder="搜索功能..." style="height:24px;padding:0 8px;background:rgba(255,255,255,.06);color:#cfc6b2;border:1px solid rgba(255,255,255,.1);border-radius:6px;font-size:11px;flex:1;min-width:60px;outline:none"></div>' +
            // ===== 探索 tab =====
            '<div class="lvsc-category lvsc-tab-panel" data-tab-panel="explore">' +
            // ⑴状态
            '<div class="lvsc-section"><div class="lvsc-section-title-row lvsc-big-cat-title-row"><span>状态</span></div>' +
'<div class=\"lvsc-section-title-row\"><span>已开启</span></div>' +
'<div id=\"lvscAutoStatusTags\" style=\"display:flex;flex-wrap:wrap;gap:4px;font-size:11px\"></div>' +
'<div class=\"lvsc-section-title-row\" style=\"margin-top:6px\"><span>正在监控</span></div>' +
'<div id=\"lvscRunningMonitors\" style=\"display:flex;flex-wrap:wrap;gap:4px;font-size:11px\"></div>' +
            '</div>' +
            // ⑵清理
'<div class=\"lvsc-section\"><div class=\"lvsc-section-title-row lvsc-big-cat-title-row\"><span>清理</span></div>' +
'<div class=\"lvsc-section-title-row\"><span>基础</span></div>' +
'<div class=\"lvsc-field-grid\">' +
'<label>保留神识<input id=\"lvscReserve\" type=\"number\" min=\"0\" step=\"1\"></label>' +
'<label>间隔毫秒<input id=\"lvscDelay\" type=\"number\" min=\"600\" step=\"100\"></label>' +
'<label>监测到神识(%)<input id=\"lvscMonitorStartSpirit\" type=\"number\" min=\"0\" max=\"100\" step=\"1\"></label>' +
'<label>优先倍率<select id=\"lvscPreferMultiplier\"><option value=\"1\">×1</option><option value=\"2\">×2</option><option value=\"5\">×5</option><option value=\"10\">×10</option><option value=\"20\">×20</option><option value=\"50\">×50</option></select></label>' +
'<label class=\"lvsc-check\"><input id=\"lvscKeepMultiplier\" type=\"checkbox\">使用当前探索倍率</label>' +
'</div>' +
'<label class=\"lvsc-check\"><input id=\"lvscCheckDaoyunBoost\" type=\"checkbox\">启动前检查道韵加成</label>' +
'<label class=\"lvsc-check\" style=\"font-size:11px\"><input id=\"lvscAggressiveMode\" type=\"checkbox\">⚔ 激进模式（遇怪直接打，不找护道，更快但更险）</label>' +
'<div class=\"lvsc-section-title-row\"><span>模式</span></div>' +
'<div style=\"font-size:11px;margin-top:4px;display:flex;gap:8px;white-space:nowrap\"><label><input id=\"lvscExploreModeApi\" type=\"radio\" name=\"lvscExploreMode\" value=\"api\"> 脚本API(推荐)</label><label><input id=\"lvscExploreModeSystem\" type=\"radio\" name=\"lvscExploreMode\" value=\"system\"> 系统自带</label></div>' +
'</div>' +
            // ⑶遭遇 → 妖兽/护道/商人
            '<div class="lvsc-section"><div class="lvsc-section-title-row lvsc-big-cat-title-row"><span>遭遇</span></div>' +
            '<div class="lvsc-section-title-row" style="font-size:12px;color:#dbb970;margin-top:4px"><span>妖兽</span></div>' +
            '<div class="lvsc-grid2">' +
            '<label>战力倍率<input id="lvscSelfFightMargin" type="number" min="1" max="3" step="0.05"></label>' +
            '<button id="lvscSelfFightBtn">检查并自战</button>' +
            '</div>' +
            '<label class="lvsc-check"><input id="lvscAutoSelfFightWeak" type="checkbox">弱怪自战</label>' +
            '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap"><label class="lvsc-check"><input id="lvscNoCrossRealmFight" type="checkbox">不越阶战斗</label><span style="font-size:11px">允许越阶上限</span><input id="lvscNoCrossRealmGap" type="number" min="0" step="1" style="width:50px;height:22px;font-size:11px;background:rgba(0,0,0,.3);color:#cfc6b2;border:1px solid rgba(255,255,255,.1);border-radius:4px;padding:0 4px"><span style="font-size:11px">个小境界（0=同境也不打）</span></div>' +
            '<label class="lvsc-check"><input id="lvscAutoHire" type="checkbox">无法自战时自动雇最低价护道</label>' +
            '<div class="lvsc-help">只按战力数值判断：妖兽战力 ≤ 自身战力 × 战力倍率时自战。</div>' +
            '<div class="lvsc-section-title-row" style="font-size:12px;color:#dbb970;margin-top:8px"><span>护道</span></div>' +
            '<div class="lvsc-grid2">' +
            '<label>护道方式<select id="lvscHireMode"><option value="cheapest">最低价</option><option value="together">合击</option><option value="alone">单独</option></select></label>' +
            '<label>灵石上限<input id="lvscHireMaxFee" type="number" min="0" step="1"></label>' +
            '<label>护道重试上限<input id="lvscHireRetryLimit" type="number" min="1" max="10" step="1"></label>' +
            '</div>' +
            '<label class="lvsc-check"><input id="lvscNoMasterProtector" type="checkbox">不使用师父护道</label>' +
            '<div class="lvsc-section-title-row" style="font-size:12px;color:#dbb970;margin-top:8px"><span>商人</span></div>' +
            '<div class="lvsc-grid2">' +
            '<label>商人策略<select id="lvscMerchantMode"><option value="legend">传说才买</option><option value="custom">按条件购买</option><option value="leave">直接离去</option></select></label>' +
            '<label>商品关键词<input id="lvscMerchantKeyword" type="text" placeholder="多个用空格或逗号隔开"></label>' +
            '<label>高价阈值(灵石)<input id="lvscMerchantMaxPrice" type="number" min="0" step="1"></label>' +
            '<label class="lvsc-check"><input id="lvscMerchantQualityFirst" type="checkbox">品质优先</label>' +
            '<label class="lvsc-check"><input id="lvscMerchantStrictMatch" type="checkbox">严格匹配</label>' +
            '<label class="lvsc-check"><input id="lvscAutoMerchant" type="checkbox">自动处理商人</label>' +
            '</div>' +
            '<div class="lvsc-help">传说才买会固定要求传说品质；按条件购买会按关键词和价格筛选。</div>' +
            '</div>' +
            // ⑷恢复 → 本体/灵兽
            '<div class="lvsc-section"><div class="lvsc-section-title-row lvsc-big-cat-title-row"><span>恢复</span></div>' +
            '<div class="lvsc-section-title-row" style="font-size:12px;color:#dbb970;margin-top:4px"><span>本体</span></div>' +
            '<div class="lvsc-grid2">' +
            '<label>恢复项目<select id="lvscAutoRecoveryMode"><option value="both">回血+回灵</option><option value="hp">只回血</option><option value="mp">只回灵</option><option value="none">关闭两项</option></select></label>' +
            '<button id="lvscAutoRecoveryBtn">保存配置</button>' +
            '<label>低于百分比<input id="lvscAutoRecoveryThreshold" type="number" min="0" max="100" step="1"></label>' +
            '<label>恢复到百分比<input id="lvscAutoRecoveryTarget" type="number" min="0" max="100" step="1"></label>' +
            '<label class="lvsc-check"><input id="lvscSectQuickRecovery" type="checkbox">主动恢复（回血/回蓝）</label>' +
            '<button id="lvscSectRecoveryBtn">立即恢复</button>' +
            '</div>' +
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
            '<div class="lvsc-section-title-row" style="font-size:12px;color:#dbb970;margin-top:8px"><span>灵兽</span></div>' +
            '<div class="lvsc-grid2">' +
            '<label class="lvsc-check"><input id="autoPetHeal" type="checkbox">启用灵兽回血</label>' +
            '<label>间隔(ms): <input id="autoPetHealInterval" type="number" min="1500" step="500" value="30000"></label>' +
            '</div>' +
            '</div>' +
            '<div class=\"lvsc-section\"><div class=\"lvsc-section-title-row lvsc-big-cat-title-row\"><span>冥想</span></div>' +
            '<div class=\"lvsc-section-title-row\"><span>神识</span></div>' +
            '<label class=\"lvsc-check\"><input id=\"lvscAutoMeditate\" type=\"checkbox\">神识不足自动冥想回满</label>' +
            '<label>收功神识(%)<input id=\"lvscMeditateStopSpirit\" type=\"number\" min=\"0\" max=\"100\" step=\"1\"></label>' +
            '<label class=\"lvsc-check\"><input id=\"lvscAutoExploreAfterMeditate\" type=\"checkbox\">收功后自动继续探索</label>' +
            '<label class=\"lvsc-check\"><input id=\"lvscNightOnlyExplore\" type=\"checkbox\">只在游戏夜晚探索</label>' +
            '<label class=\"lvsc-check\"><input id=\"lvscUseAdvancedMeditate\" type=\"checkbox\">优先仙缘高级冥想(冷却<input id=\"lvscAdvMedCooldownMin\" type=\"number\" min=\"0\" value=\"' + state.advMedCooldownMin + '\" style=\"width:60px;height:20px;font-size:11px\">分钟)</label>' +
            '<label class=\"lvsc-check\" style=\"font-size:11px\"><input id=\"lvscSummerOnlyAdvancedMeditate\" type=\"checkbox\">仙缘冥想只在夏季以后</label>' +
            '<div class=\"lvsc-section-title-row\"><span>复活</span></div>' +
            '<label class=\"lvsc-check\"><input id=\"lvscAutoReviveDeath\" type=\"checkbox\">陨落后自动引渡归来</label>' +
            '<label>复活后前往<select id=\"lvscReviveExploreArea\"><option value=\"\">（不跳转）</option></select><button id=\"lvscRefreshAreas\" style=\"height:29px;padding:0 8px;margin-left:4px;background:rgba(255,255,255,.08);color:#cfc6b2;border:1px solid rgba(255,255,255,.1)!important;border-radius:6px;font-size:11px;\">刷新地图</button></label>' +
            '</div>' +
            // ⑹装备 → 自动切换/自动修复/本命吞噬
            '<div class="lvsc-section"><div class="lvsc-section-title-row lvsc-big-cat-title-row"><span>装备</span></div>' +
            '<div class="lvsc-section-title-row" style="font-size:12px;color:#dbb970;margin-top:4px"><span>自动切换</span><label class="lvsc-check"><input id="lvscEquipSwapEnabled" type="checkbox">冥想前后自动切换</label></div>' +
            '<div class="lvsc-grid2"><label>神识套方案<select id="lvscEquipSpiritSlot"><option value="1">' + loadoutNames[0] + '</option><option value="2">' + loadoutNames[1] + '</option></select></label><label>战斗套方案<select id="lvscEquipCombatSlot"><option value="1">' + loadoutNames[0] + '</option><option value="2">' + loadoutNames[1] + '</option></select></label></div>' +
            '<div class="lvsc-help">勾上后冥想自动切神识套，收功切回战斗套。</div>' +
            '<div class="lvsc-section-title-row" style="font-size:12px;color:#dbb970;margin-top:8px"><span>自动修复</span><label class="lvsc-check"><input id="lvscAutoRepair" type="checkbox">自动修复装备</label></div>' +
            '<div class="lvsc-field-grid"><label>耐久低于(%)<input id="lvscRepairThreshold" type="number" min="0" max="100" step="1"></label><button id="lvscRepairBtn" style="height:32px;background:rgba(155,231,195,.16);color:#9be7c3;border:1px solid rgba(155,231,195,.28)!important;border-radius:6px;cursor:pointer;font-weight:700">手动修复</button></div>' +
            '<div class="lvsc-section-title-row" style="font-size:12px;color:#dbb970;margin-top:8px"><span>本命吞噬</span><label class="lvsc-check"><input id="lvscAutoNatalDevour" type="checkbox">自动吞噬</label></div>' +
            '<button id="lvscNatalDevourBtn">手动吞噬</button>' +
            '<div class="lvsc-help">自动吞噬装备（优先同类型有属性的装备）或材料。</div>' +
            '</div>' +
            // ⑺自动刷新
            '<div class="lvsc-section"><div class="lvsc-section-title-row lvsc-big-cat-title-row"><span>刷新</span></div>' +
            '<div id="lvscReloadCountdown" style="font-size:12px;color:#64c8ff;text-align:center;padding:4px 0;font-weight:bold">已关闭自动刷新</div>' +
            '<div class="lvsc-field-grid">' +
            '<label>间隔（分钟）<input id="lvscAutoReloadMin" type="number" min="0" step="1"></label>' +
            '</div></div>' +
            '</div>' +
            // ===== 自动 tab =====
            '<div class="lvsc-category lvsc-tab-panel" data-tab-panel="auto">' +
            // ⑴炼制（批量炼制/涅槃/虚空淬体丹/隐匿符/批量用符 → 动态注入）
            '<div class="lvsc-section"><div class="lvsc-section-title-row lvsc-big-cat-title-row"><span>炼制</span></div>' +
            '<div class="lvsc-card-grid"><div class="lvsc-section"><div class="lvsc-section-title-row"><span>批量炼制</span></div><div class="lvsc-field-grid"><label>炼制类型<select id="lvscCraftType"><option value="alchemy">炼丹</option><option value="forge">炼器</option><option value="talisman">制符</option></select></label><label>配方<select id="lvscCraftRecipe"><option value="">点击刷新</option></select></label><label>目标数量<input id="lvscCraftTargetCount" type="number" min="1" value="10"></label><label>每次炼制<input id="lvscCraftBatchSize" type="number" min="0" value="0" placeholder="0=全部"></label><label>目标品质<select id="lvscCraftQualityTarget"><option value="0">任意</option><option value="1">普通+</option><option value="2">优良+</option><option value="3">稀有+</option><option value="4">史诗+</option><option value="5">传说</option></select></label><label>品质达标<input id="lvscCraftQualityCount" type="number" min="0" value="0">个</label><label class="lvsc-check"><input id="lvscCraftAutoBuyMats" type="checkbox">自动买材料</label><label class="lvsc-check"><input id="lvscCraftAutoTimer" type="checkbox">定时炼制</label><label>间隔(分钟)<input id="lvscCraftTimerMin" type="number" min="1" value="10"></label><label>炼制模式<select id="lvscCraftTimerMode"><option value="normal">普通炼制</option><option value="quality">品质炼制</option></select></label><span id="lvscCraftTimerCountdown" style="font-size:11px;color:#dbb970;margin-left:4px;white-space:nowrap"></span></div><div style="display:flex;gap:6px"><button id="lvscRefreshRecipes" style="height:32px;background:rgba(255,255,255,.08);color:#cfc6b2;border:1px solid rgba(255,255,255,.1)!important;border-radius:6px;cursor:pointer;font-weight:700;flex:1">刷新配方</button><button id="lvscAutoCraftBtn" style="height:32px;background:linear-gradient(135deg,#dbb970,#c9a050);color:#17141d;border:0!important;border-radius:6px;cursor:pointer;font-weight:700;flex:1">开始炼制</button><button id="lvscQualityCraftBtn" style="height:34px;background:#c08060;color:#17141d;border:0;border-radius:6px;cursor:pointer;font-weight:700;font-size:12px;flex:1">品质炼制</button><button id="lvscStopCraftBtn" style="height:32px;background:rgba(255,107,107,.16);color:#ff6b6b;border:1px solid rgba(255,107,107,.28)!important;border-radius:6px;cursor:pointer;font-weight:700;flex:1;display:none">停止</button></div><div id="lvscCraftQualityLog" style="min-height:60px;max-height:100px;overflow:auto;white-space:pre-wrap;font-size:11px;color:#cfc6b2;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:8px">待命</div></div></div>' +
            '<div class="lvsc-section"><div class="lvsc-section-title-row"><span>虚空淬体</span></div>' +
            '<label class="lvsc-check"><input id="lvscAutoVoidBody" type="checkbox">探索前自动补加成</label>' +
            '<div class="lvsc-grid2">' +
            '<label>丹药等级<select id="lvscVoidRarity"><option value="1">普通</option><option value="2">优良</option><option value="3">稀有</option><option value="4">史诗</option><option value="5">传说</option></select></label>' +
            '<label>坊市购买量<input id="lvscVoidBuyQty" type="number" min="1" max="999" step="1"></label>' +
            '</div>' +
            '<button id="lvscVoidBodyBtn">检查/补淬体</button>' +
            '</div>' +
            '<div class="lvsc-section"><div class="lvsc-section-title-row"><span>隐秘符</span></div>' +
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
            // ⑵铭文（动态注入）
            '<div class="lvsc-section"><div class="lvsc-section-title-row lvsc-big-cat-title-row"><span>铭文</span></div>' +
            '<div class="lvsc-card-grid"></div>' +
            '</div>' +
            // ⑶功法（动态注入）
            '<div class="lvsc-section"><div class="lvsc-section-title-row lvsc-big-cat-title-row"><span>功法</span></div>' +
            '<div class="lvsc-card-grid"></div>' +
            '</div>' +
            // ⑷师徒
            '<div class=\"lvsc-section\"><div class=\"lvsc-section-title-row lvsc-big-cat-title-row\"><span>师徒</span></div>' +
            '<div class=\"lvsc-section-title-row\"><span>徒弟互动</span></div>' +
            '<label class=\"lvsc-check\"><input id=\"lvscAutoMasterRequests\" type=\"checkbox\">自动处理徒弟请求（问道/护道/历练）</label>' +
            '<label class=\"lvsc-check\"><input id=\"lvscAutoTeachDaily\" type=\"checkbox\">每日自动授业（静默，每天一次）</label>' +
            '<label class=\"lvsc-check\"><input id=\"lvscAutoHudaoBreakMeditate\" type=\"checkbox\">冥想中断自动护道（断冥想→接护道→恢复冥想）</label>' +
            '<label class=\"lvsc-check\"><input id=\"lvscAutoGiftItemsDaily\" type=\"checkbox\">每日自动一键赠物</label>' +
            '<div style=\"margin:2px 0 2px 22px;display:flex;align-items:center;gap:4px\">' +
            '<span style=\"font-size:11px;color:#aaa;white-space:nowrap\">物品：</span>' +
            '<input id=\"lvscGiftItemSearch\" type=\"text\" placeholder=\"搜物品名\" style=\"flex:1;height:22px;font-size:11px;background:rgba(0,0,0,.3);color:#cfc6b2;border:1px solid rgba(255,255,255,.1);border-radius:4px;padding:0 6px\">' +
            '<button id=\"lvscGiftItemSearchBtn\" style=\"height:22px;padding:0 8px;background:rgba(219,185,112,.16);color:#dbb970;border:1px solid rgba(219,185,112,.3);border-radius:4px;cursor:pointer;font-size:10px;white-space:nowrap\">搜索</button>' +
            '</div>' +
            '<div id=\"lvscGiftItemSearchResults\" style=\"display:none;margin:0 0 2px 22px;max-height:200px;overflow:auto;font-size:10px;color:#cfc6b2;background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.06);border-radius:4px;padding:4px\"></div>' +
            '<div style=\"margin:0 0 2px 22px;display:flex;align-items:center;gap:6px\">' +
            '<span style=\"font-size:11px;color:#6bc9a0\">全部相同已选：<span id=\"lvscGiftItemSelected\">未选择</span></span>' +
            '<span style=\"font-size:11px;color:#aaa\">数量：</span>' +
            '<input id=\"lvscGiftItemQty\" type=\"number\" min=\"1\" step=\"1\" value=\"1\" style=\"width:50px;height:22px;font-size:11px;background:rgba(0,0,0,.3);color:#cfc6b2;border:1px solid rgba(255,255,255,.1);border-radius:4px;padding:0 4px\">' +
            '</div>' +
            '<div style=\"margin:2px 0 2px 22px;display:flex;align-items:center;gap:8px\">' +
            '<span style=\"font-size:10px;color:#aaa\">赠物模式：</span>' +
            '<select id=\"lvscGiftItemsMode\" style=\"height:22px;font-size:10px;background:rgba(0,0,0,.3);color:#cfc6b2;border:1px solid rgba(255,255,255,.1);border-radius:4px;padding:0 4px\">' +
            '<option value=\"all\">全部相同</option>' +
            '<option value=\"each\">逐个设置</option>' +
            '</select>' +
            '</div>' +
            '<div style=\"margin:2px 0 2px 22px;display:flex;align-items:center;gap:6px;flex-wrap:wrap\">' +
            '<span id=\"lvscToggleGiftItemsDisciple\" style=\"font-size:11px;color:#dbb970;cursor:pointer\">▶ 赠物-选徒弟：</span>' +
            '<button id=\"lvscRefreshGiftItemsDiscipleList\" style=\"height:24px;padding:0 8px;background:rgba(255,255,255,.08);color:#cfc6b2;border:1px solid rgba(255,255,255,.1);border-radius:6px;font-size:10px;cursor:pointer\">刷新</button>' +
            '</div>' +
            '<div id=\"lvscGiftItemsDiscipleList\" style=\"margin:0 0 2px 22px;display:none;flex-wrap:wrap;gap:4px;max-height:100px;overflow-y:auto;padding:4px;background:rgba(0,0,0,.15);border-radius:6px\"></div>' +
            '<label class=\"lvsc-check\"><input id=\"lvscAutoGiftStonesDaily\" type=\"checkbox\">每日自动一键赠灵石</label>' +
            '<div style=\"margin:2px 0 2px 22px;display:flex;align-items:center;gap:6px;flex-wrap:wrap\">' +
            '<span style=\"font-size:11px;color:#aaa\">全部相同灵石数量：</span>' +
            '<input id=\"lvscGiftStonesQty\" type=\"number\" min=\"1\" step=\"1\" value=\"1\" style=\"width:85px;height:22px;font-size:11px;background:rgba(255,255,255,.08);color:#cfc6b2;border:1px solid rgba(255,255,255,.12);border-radius:4px;padding:0 4px\">' +
            '</div>' +
            '<div style=\"margin:2px 0 2px 22px;display:flex;align-items:center;gap:8px\">' +
            '<span style=\"font-size:10px;color:#aaa\">赠灵石模式：</span>' +
            '<select id=\"lvscGiftStonesMode\" style=\"height:22px;font-size:10px;background:rgba(0,0,0,.3);color:#cfc6b2;border:1px solid rgba(255,255,255,.1);border-radius:4px;padding:0 4px\">' +
            '<option value=\"all\">全部相同</option>' +
            '<option value=\"each\">逐个设置</option>' +
            '</select>' +
            '</div>' +
            '<div style=\"margin:2px 0 2px 22px;display:flex;align-items:center;gap:6px;flex-wrap:wrap\">' +
            '<span id=\"lvscToggleGiftStonesDisciple\" style=\"font-size:11px;color:#dbb970;cursor:pointer\">▶ 赠灵石-选徒弟：</span>' +
            '<button id=\"lvscRefreshGiftStonesDiscipleList\" style=\"height:24px;padding:0 8px;background:rgba(255,255,255,.08);color:#cfc6b2;border:1px solid rgba(255,255,255,.1);border-radius:6px;font-size:10px;cursor:pointer\">刷新</button>' +
            '</div>' +
            '<div id=\"lvscGiftStonesDiscipleList\" style=\"margin:0 0 2px 22px;display:none;flex-wrap:wrap;gap:4px;max-height:100px;overflow-y:auto;padding:4px;background:rgba(0,0,0,.15);border-radius:6px\"></div>' +
            '<div class=\"lvsc-help\">自动处理徒弟的问答解惑、护道突破、历练请求。授业每天自动一次。勾选冥想中断护道后：自动收功→接护道→恢复冥想。赠物/赠灵石每天各自动一次，勾选后生效。</div>' +
            '<div style=\"margin:2px 0;display:flex;gap:6px;align-items:center\"><span style=\"color:#ff6b6b;cursor:pointer;font-size:10px\" id=\"lvscClearGiftToday\">清空今日记录（重置赠物/赠灵石/授业）</span></div>' +
            '<div id=\"lvscMasterLog\" style=\"min-height:30px;max-height:100px;overflow:auto;white-space:pre-wrap;font-size:10px;color:var(--text-muted);background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.06);border-radius:6px;padding:6px;font-family:Consolas,monospace;margin-top:4px\">等待执行...</div>' +
            '</div>' +
            // ⑸监控（自动出售/洗练石升品/气运/出狱/灵田）
            '<div class=\"lvsc-section\"><div class=\"lvsc-section-title-row lvsc-big-cat-title-row\"><span>监控</span></div>' +
            // ①自动出售
            '<div class=\"lvsc-section-title-row\"><span>自动出售＆分解</span></div>' +
            '<div class=\"lvsc-card-grid\" id=\"lvscMonitorSell\"></div>' +
            // ②自动洗练石升品
            '<div class=\"lvsc-section-title-row\"><span>自动洗练石升品</span></div>' +
            '<div class=\"lvsc-card-grid\" id=\"lvscMonitorWashStone\"></div>' +
                        // ③自动丹药升阶
            '<div class=\"lvsc-section-title-row\"><span>自动丹药升阶</span></div>' +
            '<div class=\"lvsc-card-grid\" id=\"lvscMonitorPillUpgrade\"></div>' +
            // ③自动气运
            '<div class=\"lvsc-section-title-row\"><span>自动维持气运</span></div>' +
            '<div class=\"lvsc-card-grid\" id=\"lvscMonitorLuck\"></div>' +
            // ④自动出狱
            '<div class=\"lvsc-section-title-row\"><span>自动解除禁闭</span></div>' +
            '<label class=\"lvsc-check\"><input id=\"lvscAutoBail\" type=\"checkbox\">自动混天典狱保释</label>' +
            '<label>保释方式<select id=\"lvscBailMethod\"><option value=\"stone\">灵石</option><option value=\"ad\">仙缘</option></select></label>' +
            '<label class=\"lvsc-check\"><input id=\"lvscAutoBailClick\" type=\"checkbox\">自动禁闭解除（点击天道禁闭解除按钮）</label>' +
            '<label class=\"lvsc-check\"><input id=\"lvscAutoVerify\" type=\"checkbox\">自动过验证（算术题自动答题）</label>' +
            // ⑤自动灵田
            '<div class=\"lvsc-section-title-row\"><span>自动灵田</span></div>' +
            '<div class=\"lvsc-card-grid\" id=\"lvscMonitorFarm\"></div>' +
            '</div>' +
            // ⑹其他（自动登录/月卡仙缘/收徒/藏宝图/珍宝阁 → 部分动态注入）
            '<div class=\"lvsc-section\"><div class=\"lvsc-section-title-row lvsc-big-cat-title-row\"><span>其他</span></div>' +
            '<div class=\"lvsc-section-title-row\"><span>自动收徒</span></div>' +
            '<label class=\"lvsc-check\"><input id=\"lvscAutoRecruit\" type=\"checkbox\">自动收徒</label>' +
            '<label>收徒间隔ms<input id=\"lvscRecruitIntervalMs\" type=\"number\" min=\"500\" step=\"500\"></label>' +
            '<button id=\"lvscRecruitBtn\">手动收徒</button>' +
            '<div class=\"lvsc-section-title-row\"><span>自动月卡仙缘</span></div>' +
            '<label class=\"lvsc-check\"><input id=\"lvscAutoMonthlyCard\" type=\"checkbox\">每日自动领取月卡仙缘</label>' +
            '<span id=\"lvscMonthlyCardStatus\" style=\"margin-left:8px;font-size:12px;color:#888;\">检测中...</span>' +
            '<div class=\"lvsc-help\">每天自动静默领取月卡日俸（+5仙缘），不打开界面。每小时检测一次。</div>' +
            '<div class=\"lvsc-section-title-row\"><span>突破 & 本源</span></div>' +
            '<label class=\"lvsc-check\" style=\"font-size:11px\"><input id=\"lvscAutoBreakthrough\" type=\"checkbox\"' + (state.autoBreakthrough ? ' checked' : '') + '>自动突破</label>' +
            '<label class=\"lvsc-check\" style=\"font-size:11px\"><input id=\"lvscAutoOriginRepair\" type=\"checkbox\"' + (state.autoOriginRepair ? ' checked' : '') + '>自动修复本源</label>' +
            '<div class=\"lvsc-section-title-row\"><span>珍宝阁</span></div>' +
            '<div class=\"lvsc-card-grid\" id=\"lvscMonitorPavilion\">' +
            '<div class=\"lvsc-grid2\">' +
            '<label>商品<select id=\"lvscPavilionItem\"><option value=\"\">点击刷新</option></select></label>' +
            '<label>单次数量<input id=\"lvscPavilionQty\" type=\"number\" min=\"1\" max=\"999\" value=\"' + state.pavilionQty + '\"></label>' +
            '<label>循环次数<input id=\"lvscPavilionLoop\" type=\"number\" min=\"1\" value=\"' + state.pavilionLoop + '\"></label>' +
            '<label>间隔(ms)<input id=\"lvscPavilionDelay\" type=\"number\" min=\"100\" step=\"100\" value=\"' + state.pavilionDelay + '\"></label>' +
            '</div>' +
            '<div style=\"display:flex;gap:6px\">' +
            '<button id=\"lvscAutoPavilionBtn\" class=\"lvsc-action-btn\" style=\"flex:1;height:34px\">开始兑换</button>' +
            '<button id=\"lvscStopPavilionBtn\" class=\"lvsc-stop-btn\" style=\"flex:1;height:32px;display:none\">停止</button>' +
            '<button id=\"lvscRefreshPavilion\" class=\"lvsc-rfr-btn\">刷新</button>' +
            '</div>' +
            '<div id=\"lvscPavilionLog\" style=\"min-height:30px;max-height:100px;overflow:auto;white-space:pre-wrap;font-size:10px;color:#cfc6b2;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:8px;font-family:Consolas,monospace;margin-top:4px\">等待执行...</div>' +
            '</div>' +
            '<div class=\"lvsc-section-title-row\"><span>试练塔扫荡</span></div>' +
            '<div class=\"lvsc-card-grid\" id=\"lvscMonitorSweep\">' +
            '<div class=\"lvsc-grid2\">' +
            '<label>最大次数<input id=\"lvscSweepMax\" type=\"number\" min=\"0\" value=\"0\" placeholder=\"0=无限\"></label>' +
            '<label>间隔(ms)<input id=\"lvscSweepDelay\" type=\"number\" min=\"500\" step=\"500\" value=\"3000\"></label>' +
            '</div>' +
            '<div style=\"display:flex;gap:6px\">' +
            '<button id=\"lvscSweepStartBtn\" class=\"lvsc-action-btn\" style=\"flex:1;height:32px\">开始扫荡</button>' +
            '<button id=\"lvscSweepStopBtn\" class=\"lvsc-stop-btn\" style=\"flex:1;height:32px;display:none\">停止</button>' +
            '</div>' +
            '<div id=\"lvscSweepLog\" style=\"min-height:30px;max-height:100px;overflow:auto;white-space:pre-wrap;font-size:10px;color:#cfc6b2;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:8px;font-family:Consolas,monospace;margin-top:4px\">等待执行...</div>' +
            '</div>' +
            '<div class=\"lvsc-section-title-row\"><span>自动登录</span></div>' +
            '<div class=\"lvsc-grid2\">' +
            '<label>道籍邮箱<input id=\"lvscAutoLoginEmail\" type=\"text\" placeholder=\"输入道籍邮箱\" value=\"' + (localStorage.getItem('lvSpiritCleaner.autoLoginEmail') || '') + '\"></label>' +
            '<label>登录密码<input id=\"lvscAutoLoginPassword\" type=\"password\" placeholder=\"输入登录密码\" value=\"' + (localStorage.getItem('lvSpiritCleaner.autoLoginPassword') || '') + '\"></label>' +
            '<label class=\"lvsc-check\" style=\"font-size:11px\"><input id=\"lvscAutoLoginEnabled\" type=\"checkbox\"' + (localStorage.getItem('lvSpiritCleaner.autoLoginEnabled') === '1' ? ' checked' : '') + '>启用自动登录</label>' +
            '</div>' +
            '<div style=\"font-size:10px;color:#8f846f;margin-top:4px\">密码仅保存在浏览器本地，不会上传到任何服务器。</div>' +
            '<div class=\"lvsc-section-title-row\" style=\"margin-top:6px\"><span>自动秘匣</span></div>' +
            '<label class=\"lvsc-check\"><input id=\"lvscAutoMysteryBox\" type=\"checkbox\">每天自动开启10次造化秘匣</label>' +
            '<div style=\"display:flex;gap:6px;align-items:center\">' +
            '<button id=\"lvscMysteryBoxStartBtn\" style=\"height:32px;background:rgba(155,231,195,.16);color:#9be7c3;border:1px solid rgba(155,231,195,.28)!important;border-radius:6px;cursor:pointer;font-weight:700\">开始秘匣</button>' +
            '<button id=\"lvscMysteryBoxStopBtn\" class=\"lvsc-stop-btn\" style=\"height:32px;display:none\">停止</button>' +
            '<span id=\"lvscMysteryBoxStatus\" style=\"font-size:11px;color:#dbb970;margin-left:4px\"></span>' +
            '</div>' +
            '<div id=\"lvscMysteryBoxLog\" style=\"min-height:40px;max-height:160px;overflow:auto;white-space:pre-wrap;font-size:10px;color:#cfc6b2;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:8px;font-family:Consolas,monospace\">等待执行...</div>' +
            '</div>' +
            '</div>' +
            // ===== 其他 tab =====
            '<div class=\"lvsc-category lvsc-tab-panel\" data-tab-panel=\"other\">' +
            '<div class="lvsc-section"><div class="lvsc-section-title-row lvsc-big-cat-title-row"><span>更新</span></div>' +
            '<div class="lvsc-category-title">更新公告<small>v' + SCRIPT_VERSION + '</small></div>' +
            '<div class="lvsc-field-grid">' +
            '<label>云端公告 JSON<input id="lvscUpdateManifestUrl" type="text" placeholder="' + DEFAULT_UPDATE_MANIFEST_URL + '"></label>' +
            '<label class="lvsc-check"><input id="lvscUpdateMuted" type="checkbox">屏蔽更新提醒</label>' +
            '<button id="lvscCheckUpdateBtn">检查云端更新</button>' +
            '</div></div>' +
            '<div class="lvsc-section"><div class="lvsc-section-title-row lvsc-big-cat-title-row"><span>通知</span></div>' +
            '<div class="lvsc-section-title-row" style="font-size:12px;color:#dbb970;margin-top:4px"><span>脚本</span></div>' +
            '<div class="lvsc-field-grid">' +
            '<label class="lvsc-check"><input id="lvscDesktopNotify" type="checkbox">浏览器通知</label>' +
            '<label class="lvsc-check"><input id="lvscChatOnTop" type="checkbox">传音筒始终上层</label>' +
            '<label class="lvsc-check"><input id="lvscWecomNotify" type="checkbox">企业微信通知</label>' +
            '<button id="lvscTestNotifyBtn" style="height:32px;background:rgba(155,231,195,.16);color:#9be7c3;border:1px solid rgba(155,231,195,.28)!important;">测试通知</button>' +
            '</div>' +
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
            '<label class="lvsc-check" style="font-size:11px;"><input id="lvscStatusEquip" type="checkbox" checked>装备切换</label>' +
            '</div>' +
            '<div class="lvsc-section-title-row" style="font-size:12px;color:#dbb970;margin-top:8px"><span>企微</span></div>' +
            '<div id="lvscWecomFields" style="display:none;">' +
            '<div class="lvsc-section-title">群机器人 Webhook</div>' +
            '<label>脚本通知<input id="lvscWecomNotifyWebhook" type="text" placeholder="清理/收徒/陨落/新版"></label>' +
            '<label>世界消息<input id="lvscWecomWorldWebhook" type="text" placeholder="世界频道聊天"></label>' +
            '<label>私信<input id="lvscWecomPrivateWebhook" type="text" placeholder="师门/道友私聊"></label>' +
            '<button id="lvscWecomTestBtn">测试发送</button>' +
            '<div class="lvsc-help">在企业微信内部群添加群机器人获取 webhook URL。</div>' +
            '</div></div>' +
            '<div class="lvsc-section"><div class="lvsc-section-title-row lvsc-big-cat-title-row"><span>配置</span></div>' +
            '<div style="display:flex;gap:6px;margin-top:6px">' +
            '<button id="lvscExportConfigBtn" style="flex:1;height:32px;background:rgba(219,185,112,.16);color:#dbb970;border:1px solid rgba(219,185,112,.3);border-radius:6px;cursor:pointer;font-weight:700;">导出配置</button>' +
            '<button id="lvscImportConfigBtn" style="flex:1;height:32px;background:rgba(107,201,160,.16);color:#6bc9a0;border:1px solid rgba(107,201,160,.3);border-radius:6px;cursor:pointer;font-weight:700;">导入配置</button>' +
            '</div></div>' +
            '<div class=\"lvsc-section\"><div class=\"lvsc-section-title-row lvsc-big-cat-title-row\"><span>安全</span></div>' +
            '<label class=\"lvsc-check\"><input id=\"lvscSafeMode\" type=\"checkbox\">安全模式（禁用所有自动功能）</label>' +
            '<div class=\"lvsc-help\" style=\"margin-top:4px\">开启后所有自动操作立即停止，手动操作不受影响。可用于排查问题或临时暂停脚本。</div>' +
            '</div>' +
            '<div class=\"lvsc-section\"><div class=\"lvsc-section-title-row lvsc-big-cat-title-row\"><span>主题</span></div>' +
            '<div style="color:var(--text-muted);font-size:12px;padding:8px 0">① 待开发</div>' +
            '</div>' +
            '</div>' +
            '<div id="lvscAuthor"><span>by：SuH2RanZ1＆青喵   Q群：901064639</span><button id="lvscFeedbackBtn">&#x1F4AC; 反馈</button></div>' +
            '</div>' + '</div>' +
            '<div id="lvscActions" style="flex-wrap:wrap"><button id="lvscRunBtn">开始清理</button><button id="lvscMonitorBtn">监测神识</button><button id="lvscRefreshBtn">刷新</button><label class="lvsc-check" style="font-size:11px;white-space:nowrap"><input id="lvscAutoRestart" type="checkbox">异常自启</label></div>' +
            '<div id="lvscResizeHandle" title="拖拽调节面板大小"></div>';
document.body.appendChild(panel);
panel.style.display = 'flex';
panel.style.visibility = 'visible';
panel.style.opacity = '1';
panel.style.zIndex = String(PANEL_Z_INDEX);
        restorePanelSize(panel);
        makePanelDraggable(panel);
        makePanelResizable(panel);

        document.getElementById('lvscReserve').value = String(state.reserve);
        document.getElementById('lvscDelay').value = String(state.delayMs);
        document.getElementById('lvscHireRetryLimit').value = String(state.hireRetryLimit);
        document.getElementById('lvscHireMode').value = String(state.hireMode);
        document.getElementById('lvscHireMaxFee').value = String(state.hireMaxFee);
        document.getElementById('lvscNoMasterProtector').checked = state.noMasterProtector;
        document.getElementById('lvscAutoMysteryBox').checked = state.autoMysteryBox;
        renderMysteryBoxLog();
        document.getElementById('lvscKeepMultiplier').checked = state.keepCurrentMultiplier;
        document.getElementById('lvscMerchantMode').value = String(state.merchantMode);
        document.getElementById('lvscMerchantKeyword').value = String(state.merchantKeyword);
        document.getElementById('lvscMerchantQualityFirst').checked = state.merchantQualityFirst;
        document.getElementById('lvscMerchantStrictMatch').checked = state.merchantStrictMatch;
        document.getElementById('lvscMerchantMaxPrice').value = String(state.merchantMaxPrice);
        document.getElementById('lvscAutoMerchant').checked = state.autoMerchantLegend;
        document.getElementById('lvscAutoSelfFightWeak').checked = state.autoSelfFightWeak;
        document.getElementById('autoPetHeal').checked = state.autoPetHeal;
        document.getElementById('autoPetHealInterval').value = String(state.autoPetHealInterval);
        document.getElementById('lvscSelfFightMargin').value = String(state.selfFightMargin);
        document.getElementById('lvscNoCrossRealmFight').checked = state.noCrossRealmFight;
        document.getElementById('lvscNoCrossRealmGap').value = String(state.noCrossRealmGap);
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
        document.getElementById('lvscSummerOnlyAdvancedMeditate').checked = state.summerOnlyAdvMeditate;
        document.getElementById('lvscAutoReloadMin').value = String(state.autoReloadMin);
        document.getElementById('lvscAggressiveMode').checked = state.aggressiveMode;
        var emApi = document.getElementById('lvscExploreModeApi');
        var emSys = document.getElementById('lvscExploreModeSystem');
        if (emApi) emApi.checked = (state.exploreMode === 'api');
        if (emSys) emSys.checked = (state.exploreMode === 'system');
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
                                window._lvscEquipItems = items;
                // 追加"当前装备"选项（读取游戏打开的铭文界面）
                var curOpt = document.createElement('option');
                curOpt.value = '__current__';
                curOpt.textContent = (getCurrentInscItemName() || '当前装备') + '（需打开铭文页）';
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
                        _inscItemName = getCurrentInscItemName() || '当前装备';
                    } else {
                        _inscItemId = sel.value;
                        _inscItemName = sel.options[sel.selectedIndex].textContent || '';
                    }
                }
            }).catch(function () {});
        }
        // 登录页跳过，防止API 401触发重定向死循环
        if (location.pathname !== '/' && location.pathname !== '') {
            setTimeout(refreshEquipmentSelect, 1500);
        }
        var re = document.getElementById('lvscRefreshEquipment'); if (re) re.onclick = refreshEquipmentSelect;
        if (location.pathname !== '/' && location.pathname !== '') {
            setTimeout(refreshEquipmentSelect, 1500);
        }
        document.getElementById('lvscInscriptionQuality') && (document.getElementById('lvscInscriptionQuality').value = String(state.inscriptionQuality));
        document.getElementById('lvscInscriptionStat') && (document.getElementById('lvscInscriptionStat').value = String(state.inscriptionStat));
        document.getElementById('lvscInscriptionMinValue') && (document.getElementById('lvscInscriptionMinValue').value = localStorage.getItem('lvSpiritCleaner.inscriptionMinValue') || '50');
        document.getElementById('lvscInscriptionStopMode') && (document.getElementById('lvscInscriptionStopMode').value = String(state.inscriptionStopMode));
        document.getElementById('lvscInscriptionAutoEquip') && (document.getElementById('lvscInscriptionAutoEquip').checked = state.inscriptionAutoEquip);
        document.getElementById('lvscInscriptionMaxAttempts') && (document.getElementById('lvscInscriptionMaxAttempts').value = String(state.inscriptionMaxAttempts));
        document.getElementById('lvscInscriptionResultDelay') && (document.getElementById('lvscInscriptionResultDelay').value = String(state.inscriptionResultDelay));
        document.getElementById('lvscInscriptionDiscardDelay') && (document.getElementById('lvscInscriptionDiscardDelay').value = String(state.inscriptionDiscardDelay));
        document.getElementById('lvscTreasureBatchSize') && (document.getElementById('lvscTreasureBatchSize').value = String(state.treasureBatchSize));
        document.getElementById('lvscTreasureUseQuantity') && (document.getElementById('lvscTreasureUseQuantity').value = String(state.treasureUseQuantity));
        document.getElementById('lvscTreasureIntervalMs') && (document.getElementById('lvscTreasureIntervalMs').value = String(state.treasureIntervalMs));
        document.getElementById('lvscDesktopNotify').checked = state.desktopNotify;
        document.getElementById('lvscChatOnTop').checked = state.chatOnTop;
        document.getElementById('lvscWecomNotify').checked = state.wecomNotify;
        document.getElementById('lvscWecomNotifyWebhook').value = String(state.wecomNotifyWebhook);
        document.getElementById('lvscWecomWorldWebhook').value = String(state.wecomWorldWebhook);
        document.getElementById('lvscWecomPrivateWebhook').value = String(state.wecomPrivateWebhook);
        document.getElementById('lvscAutoMasterRequests').checked = state.autoMasterRequests;
        document.getElementById('lvscAutoTeachDaily').checked = state.autoTeachDaily;
        document.getElementById('lvscAutoGiftItemsDaily').checked = state.autoGiftItemsDaily;
        document.getElementById('lvscAutoGiftStonesDaily').checked = state.autoGiftStonesDaily;
        document.getElementById('lvscGiftStonesQty').value = String(state.giftStonesQty);
        document.getElementById('lvscGiftItemQty').value = String(state.giftItemQty);
        document.getElementById('lvscGiftItemSelected').textContent = state.giftItemName || '未选择';
        document.getElementById('lvscGiftItemsMode').value = state.giftItemsMode;
        document.getElementById('lvscGiftStonesMode').value = state.giftStonesMode;
        document.getElementById('lvscAutoHudaoBreakMeditate').checked = state.autoHudaoBreakMeditate;
        document.getElementById('lvscWecomFields').style.display = '';
        document.getElementById('lvscAutoVoidBody').checked = state.autoVoidBody;
        document.getElementById('lvscVoidRarity').value = String(state.voidBodyRarity);
        document.getElementById('lvscVoidBuyQty').value = String(state.voidBodyBuyQty);
        document.getElementById('lvscAutoHiddenCharm').checked = state.autoHiddenCharm;
        document.getElementById('lvscHiddenCharmRarity').value = String(state.hiddenCharmRarity);
        document.getElementById('lvscHiddenCharmBuyQty').value = String(state.hiddenCharmBuyQty);
        document.getElementById('lvscHiddenCharmRetryMs').value = String(state.hiddenCharmRetryMs);
                // === 异常自启 ===
        document.getElementById('lvscAutoRestart').checked = state.autoRestart;
        document.getElementById('lvscAutoRestart').onchange = function() {
            state.autoRestart = this.checked;
            persistSetting('lvSpiritCleaner.autoRestart', this.checked);
            updateAutoRestartBtnStyle();
        };
        function updateAutoRestartBtnStyle() {
            var cab = document.getElementById('lvscCompactAutoRestartBtn');
            if (!cab) return;
            if (state.autoRestart) {
                cab.style.background = '#dbb970';
                cab.style.color = '#17141d';
                cab.style.borderColor = '#dbb970';
                cab.textContent = '自启✔';
            } else {
                cab.style.background = 'rgba(255,255,255,.08)';
                cab.style.color = '#cfc6b2';
                cab.style.borderColor = 'rgba(255,255,255,.12)';
                cab.textContent = '自启';
            }
        }
        document.getElementById('lvscCompactAutoRestartBtn').onclick = function() {
            var cb = document.getElementById('lvscAutoRestart');
            cb.checked = !cb.checked;
            cb.onchange();
        };
        updateAutoRestartBtnStyle();
        // === 看门狗：每10秒检查，脚本异常停止时自动重启 ===
        window._lvscWatchdogTimer = setInterval(function() {
            if (!state.autoRestart) return;
            if (running || monitoringSpirit) return;
            // 手动停止标记，不清除的话不自动重启
            if (window._lvscManualStop) { window._lvscManualStop = false; return; }
            // 检查是否有其他正在运行的任务
            if (autoTrialRunning || autoTreasureRunning || autoInscriptionRunning || autoCraftRunning || autoPavilionRunning || autoBailRunning) return;
            // 检测到脚本非正常停止，自动重启
            console.log('[AutoRestart] 检测到脚本停止，自动重启');
            setStatus('异常停止，自动重启...', 'warn');
            window._lvscManualStop = false;
            if (state.exploreMode === 'system') { systemExploreLoop(); return; }
            runLoop();
        }, 10000);

        document.getElementById('lvscRunBtn').onclick = function () {
            if (running) { window._lvscManualStop = true; stop('手动停止'); return; }
            if (state.exploreMode === 'system') { systemExploreLoop(); return; }
            runLoop();
        };
        document.getElementById('lvscCompactRunBtn').onclick = function () {
            if (running) { window._lvscManualStop = true; stop('手动停止'); return; }
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
        var atb = document.getElementById('lvscAutoTrialBtn'); if (atb) atb.onclick = toggleAutoTrial;
        var atrb = document.getElementById('lvscAutoTreasureBtn'); if (atrb) atrb.onclick = toggleAutoTreasure;
        var mbStart = document.getElementById('lvscMysteryBoxStartBtn'); if (mbStart) mbStart.onclick = toggleAutoMysteryBox;
        var mbStop = document.getElementById('lvscMysteryBoxStopBtn'); if (mbStop) mbStop.onclick = toggleAutoMysteryBox;
        var aib = document.getElementById('lvscAutoInscriptionBtn'); if (aib) aib.onclick = toggleAutoInscription;
        var ie = document.getElementById('lvscInscriptionEquipment'); if (ie) ie.onchange = function () {
            if (this.value && this.value !== '__current__') {
                _inscItemId = this.value;
                _inscItemName = this.options[this.selectedIndex].textContent || '';
                localStorage.setItem('lvSpiritCleaner.inscriptionEquipmentId', this.value);
            } else if (this.value === '__current__') {
                _inscItemId = '__current__';
                _inscItemName = '当前装备';
                localStorage.setItem('lvSpiritCleaner.inscriptionEquipmentId', '__current__');
            }
        };
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
        var rBtn = document.getElementById('lvscRecruitBtn'); if (rBtn) rBtn.onclick = function () {
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
        var ct = document.getElementById('lvscCraftType'); if (ct) { ct.value = state.craftType; ct.onchange = function () { state.craftType = this.value; persistSetting('lvSpiritCleaner.craftType', this.value); refreshCraftRecipes(); }; }
        var cr = document.getElementById('lvscCraftRecipe'); if (cr) { cr.value = state.craftRecipeId; cr.onchange = function () { state.craftRecipeId = this.value; persistSetting('lvSpiritCleaner.craftRecipeId', this.value); }; }
        var ctc = document.getElementById('lvscCraftTargetCount'); if (ctc) { ctc.value = String(state.craftTargetCount); ctc.onchange = function () { state.craftTargetCount = Math.max(1, Number(this.value) || 10); persistSetting('lvSpiritCleaner.craftTargetCount', String(state.craftTargetCount)); }; }
        var cbs = document.getElementById('lvscCraftBatchSize'); if (cbs) { cbs.value = String(state.craftBatchSize || ''); cbs.onchange = function () { state.craftBatchSize = Math.max(0, Number(this.value) || 0); persistSetting('lvSpiritCleaner.craftBatchSize', String(state.craftBatchSize)); }; }
        var cQual = document.getElementById('lvscCraftQualityTarget');
        if (cQual) { cQual.value = String(state.craftQualityTarget || 0); cQual.onchange = function() { state.craftQualityTarget = Number(this.value); persistSetting('lvSpiritCleaner.craftQualityTarget', String(state.craftQualityTarget)); }; }
        var cQualCnt = document.getElementById('lvscCraftQualityCount');
        if (cQualCnt) { cQualCnt.value = state.craftQualityCount || 0; cQualCnt.onchange = function() { state.craftQualityCount = Math.max(0, Number(this.value) || 0); persistSetting('lvSpiritCleaner.craftQualityCount', String(state.craftQualityCount)); }; }
        var qBtn = document.getElementById('lvscQualityCraftBtn');
        if (qBtn) qBtn.onclick = function() {
            if (autoCraftRunning) return;
            var qb = document.getElementById('lvscQualityCraftBtn'); if (qb) qb.style.display = 'none';
            var ab = document.getElementById('lvscAutoCraftBtn'); if (ab) ab.style.display = 'none';
            var scb = document.getElementById('lvscStopCraftBtn'); if (scb) scb.style.display = '';
            autoQualityCraftLoop().finally(function() {
                var qb2 = document.getElementById('lvscQualityCraftBtn'); if (qb2) qb2.style.display = '';
                var ab2 = document.getElementById('lvscAutoCraftBtn'); if (ab2) ab2.style.display = '';
                var scb2 = document.getElementById('lvscStopCraftBtn'); if (scb2) scb2.style.display = 'none';
            });
        };
        var cbm = document.getElementById('lvscCraftAutoBuyMats'); if (cbm) { cbm.checked = state.craftAutoBuyMats; cbm.onchange = function () { state.craftAutoBuyMats = this.checked; persistSetting('lvSpiritCleaner.craftAutoBuyMats', this.checked); }; }
        var ctm = document.getElementById('lvscCraftAutoTimer'); if (ctm) { ctm.checked = state.craftAutoTimer; ctm.onchange = function () { state.craftAutoTimer = this.checked; persistSetting('lvSpiritCleaner.craftAutoTimer', this.checked); if (this.checked) updateNextAutoCraftTime(); }; }
        var ctm2 = document.getElementById('lvscCraftTimerMin'); if (ctm2) { ctm2.value = String(state.craftTimerMin); ctm2.onchange = function () { state.craftTimerMin = Math.max(1, Number(this.value) || 10); persistSetting('lvSpiritCleaner.craftTimerMin', String(state.craftTimerMin)); if (state.craftAutoTimer) updateNextAutoCraftTime(); }; }
        var timerModeSel = document.getElementById('lvscCraftTimerMode');
        if (timerModeSel) { timerModeSel.value = state.craftTimerMode; timerModeSel.onchange = function () { state.craftTimerMode = this.value; persistSetting('lvSpiritCleaner.craftTimerMode', this.value); }; }
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
        var rr = document.getElementById('lvscRefreshRecipes'); if (rr) rr.onclick = refreshCraftRecipes;
        // 登录页跳过，防止API 401触发重定向死循环
        if (location.pathname !== '/' && location.pathname !== '') { setTimeout(refreshCraftRecipes, 1500); }
        var acb = document.getElementById('lvscAutoCraftBtn'); if (acb) acb.onclick = function () {
            if (autoCraftRunning) return;
            var acb2 = document.getElementById('lvscAutoCraftBtn'); if (acb2) acb2.style.display = 'none';
            var scb = document.getElementById('lvscStopCraftBtn'); if (scb) scb.style.display = '';
            autoCraftLoop().finally(function () {
                var acb3 = document.getElementById('lvscAutoCraftBtn'); if (acb3) acb3.style.display = '';
                var scb2 = document.getElementById('lvscStopCraftBtn'); if (scb2) scb2.style.display = 'none';
            });
        };
        var scb3 = document.getElementById('lvscStopCraftBtn'); if (scb3) scb3.onclick = stopCraft;

        // 每30秒自动检查是否入狱（需开启自动出狱）
        var ab = document.getElementById('lvscAutoBail'); if (ab) { ab.checked = state.autoBail; ab.onchange = function () { state.autoBail = this.checked; persistSetting('lvSpiritCleaner.autoBail', state.autoBail); }; }
        var bm = document.getElementById('lvscBailMethod'); if (bm) { bm.value = state.bailMethod; bm.onchange = function () { state.bailMethod = this.value; persistSetting('lvSpiritCleaner.bailMethod', this.value); }; }
        var av = document.getElementById('lvscAutoVerify'); if (av) { av.checked = state.autoVerify; av.onchange = function () { state.autoVerify = this.checked; persistSetting('lvSpiritCleaner.autoVerify', this.checked); }; }
        var sm = document.getElementById('lvscSafeMode'); if (sm) { sm.checked = state.safeMode; sm.onchange = function () { state.safeMode = this.checked; persistSetting('lvSpiritCleaner.safeMode', this.checked ? '1' : '0'); if (state.safeMode) { stopAllAuto(); setStatus('🛡 安全模式已开启', 'warn'); } else { setStatus('✅ 安全模式已关闭', 'ok'); } }; window._lvscStopAllAuto = stopAllAuto; }
        var abc = document.getElementById('lvscAutoBailClick'); if (abc) { abc.checked = state.autoBailClick; abc.onchange = function () { state.autoBailClick = this.checked; persistSetting('lvSpiritCleaner.autoBailClick', state.autoBailClick); }; }
        setInterval(function () { if (!state.safeMode && state.autoBail) checkAndAutoBail(false); }, 30000);
        var amc = document.getElementById('lvscAutoMonthlyCard'); if (amc) { amc.checked = state.autoMonthlyCard; amc.onchange = function () { state.autoMonthlyCard = this.checked; persistSetting('lvSpiritCleaner.autoMonthlyCard', state.autoMonthlyCard ? '1' : '0'); }; }
        updateMonthlyCardStatusDisplay();
        var lastClaimDate = localStorage.getItem('lvSpiritCleaner.monthlyCardLastDate') || '';
        var today = new Date().toDateString();
        (function trySyncMonthlyCard() {
            if (!gameApi() || !gameApi().post) {
                setTimeout(trySyncMonthlyCard, 2000);
                return;
            }
            if (lastClaimDate === today) { updateMonthlyCardStatusDisplay(); return; }
            if (state.autoMonthlyCard) {
                claimMonthlyCard().then(function () {
                    lastClaimDate = localStorage.getItem('lvSpiritCleaner.monthlyCardLastDate') || '';
                    updateMonthlyCardStatusDisplay();
                });
            } else {
                gameApi().post('/api/player/monthly-card/claim', {}).then(function(info) {
                    if (info && info.code === 200 && info.data && info.data.dailyClaimed) {
                        localStorage.setItem('lvSpiritCleaner.monthlyCardLastDate', today);
                        updateMonthlyCardStatusDisplay();
                    }
                });
            }
        })();
        setInterval(function () {
            if (state.safeMode || !state.autoMonthlyCard || !gameApi()) return;
            var today = new Date().toDateString();
            if (lastClaimDate === today) return;
            claimMonthlyCard().then(function () {
                lastClaimDate = localStorage.getItem('lvSpiritCleaner.monthlyCardLastDate') || '';
            });
        }, 3600000);
        updateLuckDisplay(); setInterval(function() { updateLuckDisplay(); if (!state.safeMode && state.autoMaintainLuck) autoMaintainLuckCheck(); }, 300000);
        // 屏蔽更新 checkbox
        document.getElementById('lvscUpdateMuted').checked = localStorage.getItem('lvSpiritCleaner.updateMuted') === '1';
        document.getElementById('lvscUpdateMuted').onchange = function () {
            if (this.checked) {
                localStorage.setItem('lvSpiritCleaner.updateMuted', '1');
            } else {
                localStorage.removeItem('lvSpiritCleaner.updateMuted');
            }
        };
        startAutoCraftTimer();
        document.getElementById('lvscCollapseBtn').onclick = function () {
            setPanelCollapsed(panel, true);
        };
        document.getElementById('lvscExpandBtn').onclick = function () {
            setPanelCollapsed(panel, false);
        };
        var vbb = document.getElementById('lvscVoidBodyBtn'); if (vbb) vbb.onclick = function () {
            ensureVoidBodyBuff(true);
        };
                // 刷新赠物徒弟列表（全部模式=只勾选，逐个模式=勾选+数量框）
        function refreshGiftItemsDiscipleList() {
            var container = document.getElementById('lvscGiftItemsDiscipleList');
            if (!container) return;
            container.innerHTML = '<span style="font-size:10px;color:#888">加载中...</span>';
            var api = gameApi();
            if (!api) { container.innerHTML = '<span style="font-size:10px;color:#888">API不可用</span>'; return; }
            api.get('/api/master/overview').then(function(res) {
                if (!res || res.code !== 200 || !res.data) {
                    container.innerHTML = '<span style="font-size:10px;color:#888">获取失败</span>';
                    return;
                }
                var apprentices = res.data.apprentices || [];
                if (!apprentices.length) {
                    container.innerHTML = '<span style="font-size:10px;color:#888">暂无徒弟</span>';
                    return;
                }
                var isEach = state.giftItemsMode === 'each';
                var selected = state.giftItemsSelected || [];
                var qtys = state.giftItemsDiscipleQtys || {};
                var defaultQty = parseInt(state.giftItemQty, 10) || 1;
                var html = '';
                for (var dgi = 0; dgi < apprentices.length; dgi++) {
                    var ap = apprentices[dgi];
                    var apName = ap.name || ap.apprenticeName || '徒弟' + dgi;
                    var apId = ap.playerId || ap.id || ap.apprenticeId || 0;
                    var checked = (selected.indexOf(apId) !== -1) ? 'checked' : '';
                    if (isEach) {
                        var qtyVal = (typeof qtys['id_' + apId] !== 'undefined') ? qtys['id_' + apId] : defaultQty;
                        var discItems = state.giftItemsDiscipleItems || {};
                        var discItem = discItems['id_' + apId] || {};
                        var discItemName = discItem.itemName || state.giftItemName || '默认';
                        html += '<div style="display:flex;align-items:center;gap:4px;padding:2px 6px;background:rgba(255,255,255,.05);border-radius:4px;font-size:11px">' +
                            '<input type="checkbox" class="lvsc-gift-items-cb" data-id="' + apId + '" ' + checked + '>' +
                            '<span style="flex:0 0 auto;max-width:55px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + apName + '</span>' +
                            '<span class="lvsc-gift-items-item" data-id="' + apId + '" style="flex:1;cursor:pointer;color:#6bc9a0;font-size:10px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="点击更换物品">[' + discItemName + ']</span>' +
                            '<input type="number" class="lvsc-gift-items-qty" data-id="' + apId + '" min="1" step="1" value="' + qtyVal + '" style="width:40px;height:20px;font-size:10px;background:rgba(0,0,0,.3);color:#cfc6b2;border:1px solid rgba(255,255,255,.1);border-radius:3px;padding:0 3px;text-align:center">' +
                            '</div>';
                    }
 else {
                        html += '<label style="font-size:11px;display:flex;align-items:center;gap:3px;padding:2px 6px;background:rgba(255,255,255,.05);border-radius:4px;cursor:pointer">' +
                            '<input type="checkbox" class="lvsc-gift-items-cb" data-id="' + apId + '" ' + checked + '>' +
                            apName + '</label>';
                    }
                }
                container.innerHTML = html;
                // 逐个模式：加物品搜索面板（隐藏）
                var _giftSearchPanel = document.getElementById('lvscGiftItemSearchPanel');
                if (!_giftSearchPanel) {
                    _giftSearchPanel = document.createElement('div');
                    _giftSearchPanel.id = 'lvscGiftItemSearchPanel';
                    _giftSearchPanel.style.cssText = 'display:none;margin:4px 0;padding:4px;background:rgba(0,0,0,.25);border-radius:4px;font-size:10px;color:#cfc6b2';
                    _giftSearchPanel.innerHTML = '<div style="display:flex;gap:4px;margin-bottom:4px"><input id="lvscGiftItemSearchPerDisc" type="text" placeholder="搜物品名..." style="flex:1;height:20px;font-size:10px;background:rgba(0,0,0,.3);color:#cfc6b2;border:1px solid rgba(255,255,255,.1);border-radius:3px;padding:0 4px"><button id="lvscGiftItemSearchPerDiscBtn" style="height:20px;padding:0 6px;background:rgba(219,185,112,.16);color:#dbb970;border:1px solid rgba(219,185,112,.3);border-radius:3px;cursor:pointer;font-size:9px">搜索</button></div><div id="lvscGiftItemSearchPerDiscResults" style="max-height:120px;overflow:auto"></div>';
                    container.parentNode.insertBefore(_giftSearchPanel, container.nextSibling);
                }
                // 点击物品名弹出搜索面板
                var _itemSpans = container.querySelectorAll('.lvsc-gift-items-item');
                var _currentTargetId = null;
                for (var _itmIdx = 0; _itmIdx < _itemSpans.length; _itmIdx++) {
                    (function(span) {
                        span.onclick = function() {
                            _currentTargetId = this.getAttribute('data-id');
                            _giftSearchPanel.style.display = 'block';
                            document.getElementById('lvscGiftItemSearchPerDisc').value = '';
                            document.getElementById('lvscGiftItemSearchPerDiscResults').innerHTML = '<span style="color:#888">输入物品名搜索</span>';
                            document.getElementById('lvscGiftItemSearchPerDisc').focus();
                        };
                    })(_itemSpans[_itmIdx]);
                }
                // 点击其他地方关闭搜索面板
                document.addEventListener('click', function _closePanel(e) {
                    if (_giftSearchPanel.style.display !== 'none' && !_giftSearchPanel.contains(e.target) && !e.target.classList.contains('lvsc-gift-items-item')) {
                        _giftSearchPanel.style.display = 'none';
                    }
                });
                // 搜索按钮
                var _searchBtn = document.getElementById('lvscGiftItemSearchPerDiscBtn');
                var _searchInput = document.getElementById('lvscGiftItemSearchPerDisc');
                var _searchResults = document.getElementById('lvscGiftItemSearchPerDiscResults');
                _searchBtn.onclick = function() {
                    var q = (_searchInput.value || '').trim().toLowerCase();
                    if (!q || !_currentTargetId) return;
                    _searchResults.innerHTML = '搜索中...';
                    gameApi().get('/api/game/inventory/category?tab=all&page=1&size=200').then(function(invR) {
                        if (!invR || invR.code !== 200 || !invR.data || !Array.isArray(invR.data.items)) {
                            _searchResults.innerHTML = '<span style="color:#888">获取背包失败</span>';
                            return;
                        }
                        var items = invR.data.items.filter(function(item) {
                            var nm = (item.name || item.itemName || '').toLowerCase();
                            return nm && nm.indexOf(q) >= 0;
                        });
                        var RAR = ['','普通','优良','稀有','史诗','传说'];
                        var html2 = '';
                        for (var _gii2 = 0; _gii2 < items.length; _gii2++) {
                            var item = items[_gii2];
                            var nm = item.name || item.itemName || '未知';
                            var pid = parseInt(item.id || item.itemId || item.instanceId || 0, 10);
                            if (!pid) continue;
                            var qty2 = item.quantity || item.count || 1;
                            var rarityVal = item.rarity || item.quality || 0;
                            var qualityStr = RAR[rarityVal] ? '[' + RAR[rarityVal] + ']' : '';
                            html2 += '<div class="lvsc-gift-item-per-disc-opt" data-pid="' + pid + '" data-nm="' + nm.replace(/"/g,'&quot;') + '" style="padding:2px 6px;cursor:pointer;border-radius:3px;color:#6bc9a0">' + nm + ' ' + qualityStr + ' <span style="color:#888">x' + qty2 + '</span></div>';
                        }
                        if (!html2) { _searchResults.innerHTML = '<span style="color:#888">无匹配物品</span>'; return; }
                        _searchResults.innerHTML = html2;
                        var opts = _searchResults.querySelectorAll('.lvsc-gift-item-per-disc-opt');
                        for (var _opIdx = 0; _opIdx < opts.length; _opIdx++) {
                            (function(opt) {
                                opt.onclick = function() {
                                    var pid2 = Number(this.getAttribute('data-pid'));
                                    var nm2 = this.getAttribute('data-nm');
                                    var discItems2 = JSON.parse(JSON.stringify(state.giftItemsDiscipleItems || {}));
                                    discItems2['id_' + _currentTargetId] = {itemId: pid2, itemName: nm2};
                                    state.giftItemsDiscipleItems = discItems2;
                                    localStorage.setItem('lvSpiritCleaner.giftItemsDiscipleItems', JSON.stringify(discItems2));
                                    // 更新显示
                                    var targetSpan = container.querySelector('.lvsc-gift-items-item[data-id="' + _currentTargetId + '"]');
                                    if (targetSpan) targetSpan.textContent = '[' + nm2 + ']';
                                    _giftSearchPanel.style.display = 'none';
                                };
                            })(opts[_opIdx]);
                        }
                    }).catch(function(){_searchResults.innerHTML = '<span style="color:#888">搜索失败</span>';});
                };
                _searchInput.onkeydown = function(e) { if (e.key === 'Enter') _searchBtn.click(); };
                function saveGiftItems() {
                    var cbs = container.querySelectorAll('.lvsc-gift-items-cb');
                    var newIds = [];
                    for (var ci = 0; ci < cbs.length; ci++) {
                        if (cbs[ci].checked) newIds.push(Number(cbs[ci].getAttribute('data-id')));
                    }
                    state.giftItemsSelected = newIds;
                    localStorage.setItem('lvSpiritCleaner.giftItemsSelected', JSON.stringify(newIds));
                    if (isEach) {
                        var qtysInp = container.querySelectorAll('.lvsc-gift-items-qty');
                        var newQtys = {};
                        for (var ci2 = 0; ci2 < qtysInp.length; ci2++) {
                            var id = Number(qtysInp[ci2].getAttribute('data-id'));
                            var val = parseInt(qtysInp[ci2].value, 10) || 1;
                            if (document.querySelector('.lvsc-gift-items-cb[data-id="' + id + '"]') && document.querySelector('.lvsc-gift-items-cb[data-id="' + id + '"]').checked) {
                                newQtys['id_' + id] = val;
                            }
                        }
                        state.giftItemsDiscipleQtys = newQtys;
                        localStorage.setItem('lvSpiritCleaner.giftItemsDiscipleQtys', JSON.stringify(newQtys));
                    }
                }
                var cbs = container.querySelectorAll('.lvsc-gift-items-cb');
                for (var dgi2 = 0; dgi2 < cbs.length; dgi2++) {
                    cbs[dgi2].onchange = saveGiftItems;
                }
                if (isEach) {
                    var qtysInp = container.querySelectorAll('.lvsc-gift-items-qty');
                    for (var dgi3 = 0; dgi3 < qtysInp.length; dgi3++) {
                        qtysInp[dgi3].onchange = saveGiftItems;
                        qtysInp[dgi3].oninput = saveGiftItems;
                    }
                }
            }).catch(function() {
                container.innerHTML = '<span style="font-size:10px;color:#888">加载失败</span>';
            });
        }
        // 刷新赠灵石徒弟列表（全部模式=只勾选，逐个模式=勾选+数量框）
        function refreshGiftStonesDiscipleList() {
            var container = document.getElementById('lvscGiftStonesDiscipleList');
            if (!container) return;
            container.innerHTML = '<span style="font-size:10px;color:#888">加载中...</span>';
            var api = gameApi();
            if (!api) { container.innerHTML = '<span style="font-size:10px;color:#888">API不可用</span>'; return; }
            api.get('/api/master/overview').then(function(res) {
                if (!res || res.code !== 200 || !res.data) {
                    container.innerHTML = '<span style="font-size:10px;color:#888">获取失败</span>';
                    return;
                }
                var apprentices = res.data.apprentices || [];
                if (!apprentices.length) {
                    container.innerHTML = '<span style="font-size:10px;color:#888">暂无徒弟</span>';
                    return;
                }
                var isEach = state.giftStonesMode === 'each';
                var selected = state.giftStonesSelected || [];
                var qtys = state.giftStonesDiscipleQtys || {};
                var defaultQty = Math.max(1, state.giftStonesQty || 1);
                var html = '';
                for (var dgi = 0; dgi < apprentices.length; dgi++) {
                    var ap = apprentices[dgi];
                    var apName = ap.name || ap.apprenticeName || '徒弟' + dgi;
                    var apId = ap.playerId || ap.id || ap.apprenticeId || 0;
                    var checked = (selected.indexOf(apId) !== -1) ? 'checked' : '';
                    if (isEach) {
                        var qtyVal = (typeof qtys['id_' + apId] !== 'undefined') ? qtys['id_' + apId] : defaultQty;
                        html += '<div style="display:flex;align-items:center;gap:4px;padding:2px 6px;background:rgba(255,255,255,.05);border-radius:4px;font-size:11px">' +
                            '<input type="checkbox" class="lvsc-gift-stones-cb" data-id="' + apId + '" ' + checked + '>' +
                            '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + apName + '</span>' +
                            '<input type="number" class="lvsc-gift-stones-qty" data-id="' + apId + '" min="1" step="1" value="' + qtyVal + '" style="width:80px;height:20px;font-size:10px;background:rgba(0,0,0,.3);color:#cfc6b2;border:1px solid rgba(255,255,255,.1);border-radius:3px;padding:0 3px;text-align:center">' +
                            '</div>';
                    } else {
                        html += '<label style="font-size:11px;display:flex;align-items:center;gap:3px;padding:2px 6px;background:rgba(255,255,255,.05);border-radius:4px;cursor:pointer">' +
                            '<input type="checkbox" class="lvsc-gift-stones-cb" data-id="' + apId + '" ' + checked + '>' +
                            apName + '</label>';
                    }
                }
                container.innerHTML = html;
                function saveGiftStones() {
                    var cbs = container.querySelectorAll('.lvsc-gift-stones-cb');
                    var newIds = [];
                    for (var ci = 0; ci < cbs.length; ci++) {
                        if (cbs[ci].checked) newIds.push(Number(cbs[ci].getAttribute('data-id')));
                    }
                    state.giftStonesSelected = newIds;
                    localStorage.setItem('lvSpiritCleaner.giftStonesSelected', JSON.stringify(newIds));
                    if (isEach) {
                        var qtysInp = container.querySelectorAll('.lvsc-gift-stones-qty');
                        var newQtys = {};
                        for (var ci2 = 0; ci2 < qtysInp.length; ci2++) {
                            var id = Number(qtysInp[ci2].getAttribute('data-id'));
                            var val = parseInt(qtysInp[ci2].value, 10) || 1;
                            if (document.querySelector('.lvsc-gift-stones-cb[data-id="' + id + '"]') && document.querySelector('.lvsc-gift-stones-cb[data-id="' + id + '"]').checked) {
                                newQtys['id_' + id] = val;
                            }
                        }
                        state.giftStonesDiscipleQtys = newQtys;
                        localStorage.setItem('lvSpiritCleaner.giftStonesDiscipleQtys', JSON.stringify(newQtys));
                    }
                }
                var cbs = container.querySelectorAll('.lvsc-gift-stones-cb');
                for (var dgi2 = 0; dgi2 < cbs.length; dgi2++) {
                    cbs[dgi2].onchange = saveGiftStones;
                }
                if (isEach) {
                    var qtysInp = container.querySelectorAll('.lvsc-gift-stones-qty');
                    for (var dgi3 = 0; dgi3 < qtysInp.length; dgi3++) {
                        qtysInp[dgi3].onchange = saveGiftStones;
                        qtysInp[dgi3].oninput = saveGiftStones;
                    }
                }
            }).catch(function() {
                container.innerHTML = '<span style="font-size:10px;color:#888">加载失败</span>';
            });
        }
                try {
                // 选徒弟折叠切换（auto tab元素，动态创建后才存在）
        document.getElementById('lvscToggleGiftItemsDisciple').onclick = function() {
            var list = document.getElementById('lvscGiftItemsDiscipleList');
            if (!list) return;
            var isHidden = list.style.display === 'none';
            list.style.display = isHidden ? 'flex' : 'none';
            this.textContent = isHidden ? '▼ 赠物-选徒弟：' : '▶ 赠物-选徒弟：';
        };
        document.getElementById('lvscToggleGiftStonesDisciple').onclick = function() {
            var list = document.getElementById('lvscGiftStonesDiscipleList');
            if (!list) return;
            var isHidden = list.style.display === 'none';
            list.style.display = isHidden ? 'flex' : 'none';
            this.textContent = isHidden ? '▼ 赠灵石-选徒弟：' : '▶ 赠灵石-选徒弟：';
        };

        document.getElementById('lvscRefreshGiftItemsDiscipleList').onclick = refreshGiftItemsDiscipleList;
        document.getElementById('lvscRefreshGiftStonesDiscipleList').onclick = refreshGiftStonesDiscipleList;
        document.getElementById('lvscGiftItemsMode').onchange = function() {
            state.giftItemsMode = this.value;
            localStorage.setItem('lvSpiritCleaner.giftItemsMode', this.value);
            refreshGiftItemsDiscipleList();
        };
        document.getElementById('lvscGiftStonesMode').onchange = function() {
            state.giftStonesMode = this.value;
            localStorage.setItem('lvSpiritCleaner.giftStonesMode', this.value);
            refreshGiftStonesDiscipleList();
        };
        setTimeout(refreshGiftItemsDiscipleList, 2000);
        setTimeout(refreshGiftStonesDiscipleList, 2000);

        // 清空今日记录
        document.getElementById('lvscClearGiftToday').onclick = function() {
            localStorage.removeItem('lvscGiftItemsDate');
            localStorage.removeItem('lvscGiftStonesDate');
            localStorage.removeItem('lvscTeachDate');
            masterLog('🗑️ 已清空今日记录（赠物/赠灵石/授业可再次执行）');
        };
        // 恢复日志
        var savedLogs = [];
        try { savedLogs = JSON.parse(localStorage.getItem('lvscMasterLogArr') || '[]'); } catch(_) {}
        if (savedLogs.length) {
            var logEl = document.getElementById('lvscMasterLog');
            if (logEl) {
                logEl.textContent = savedLogs.join('\n');
            }
        }

        // 物品搜索逻辑
        var giftSearchBtn = document.getElementById('lvscGiftItemSearchBtn');
        var giftSearchInput = document.getElementById('lvscGiftItemSearch');
        var giftSearchResults = document.getElementById('lvscGiftItemSearchResults');
        giftSearchBtn.addEventListener('click', async function() {
            var q = (giftSearchInput.value || '').trim().toLowerCase();
            if (!q) return;
            giftSearchResults.style.display = 'block';
            giftSearchResults.innerHTML = '搜索中...';
            try {
                var invR = await gameApi().get('/api/game/inventory/category?tab=all&page=1&size=200');
                if (!invR || invR.code !== 200 || !invR.data || !Array.isArray(invR.data.items)) {
                    giftSearchResults.innerHTML = '<div style="color:var(--text-muted);padding:2px 6px">获取背包失败</div>';
                    return;
                }
                giftSearchResults.innerHTML = '';
                var items = invR.data.items.filter(function(item) {
                    var nm = (item.name || item.itemName || '').toLowerCase();
                    return nm && nm.indexOf(q) >= 0;
                });
                var RAR = ['','普通','优良','稀有','史诗','传说'];
                var found = false;
                for (var _gii = 0; _gii < items.length; _gii++) {
                    var item = items[_gii];
                    var nm = item.name || item.itemName || '未知';
                    var pid = parseInt(item.id || item.itemId || item.instanceId || 0, 10);
                    if (!pid) continue;
                    var qty = item.quantity || item.count || 1;
                    var rarityVal = item.rarity || item.quality || 0;
                    var qualityStr = RAR[rarityVal] ? ' [' + RAR[rarityVal] + ']' : '';
                    found = true;
                    var row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;padding:3px 8px;cursor:pointer;border-radius:3px';
                    row.addEventListener('mouseover', function() { this.style.background = 'rgba(107,201,160,.12)'; });
                    row.addEventListener('mouseout', function() { this.style.background = 'transparent'; });
                    row.innerHTML = '<span style="flex:1;color:#6bc9a0;font-size:11px">' + nm + qualityStr + ' <span style="color:#888;font-size:9px">x' + qty + '</span></span><span style="color:#6a6560;font-size:9px">ID:' + pid + '</span>';
                    (function(pid, nm) {
                        row.addEventListener('click', function() {
                            state.giftPlayerItemId = pid;
                            state.giftItemName = nm;
                            localStorage.setItem('lvSpiritCleaner.giftPlayerItemId', String(pid));
                            localStorage.setItem('lvSpiritCleaner.giftItemName', nm);
                            document.getElementById('lvscGiftItemSelected').textContent = nm;
                            giftSearchResults.style.display = 'none';
                        });
                    })(pid, nm);
                    giftSearchResults.appendChild(row);
                }
                if (!found) {
                    giftSearchResults.innerHTML = '<div style="color:var(--text-muted);padding:2px 6px">背包中无匹配物品</div>';
                }
            } catch (_) { giftSearchResults.innerHTML = '搜索失败'; }
        });
        if (giftSearchInput) giftSearchInput.addEventListener('keydown', function(e) { if (e.key === 'Enter' && giftSearchBtn) giftSearchBtn.click(); });
        } catch(e) {}
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
        onChk('lvscNoMasterProtector', 'noMasterProtector');
        onChk('lvscAutoMysteryBox', 'autoMysteryBox');
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
        (function() {
            var cb = document.getElementById('autoPetHeal');
            if (cb) {
                cb.onchange = function() {
                    state.autoPetHeal = cb.checked;
                    persistSetting('lvSpiritCleaner.autoPetHeal', state.autoPetHeal ? '1' : '0');
                    startAutoPetHealTimer();
                };
            }
        })();
        (function() {
            var el = document.getElementById('autoPetHealInterval');
            if (!el) return;
            el.oninput = function () {
                var v = Math.max(1500, Number(el.value)) || 30000;
                state.autoPetHealInterval = v;
                persistSetting('lvSpiritCleaner.autoPetHealInterval', String(v));
                startAutoPetHealTimer();
            };
        })();
        onNum('lvscSelfFightMargin', 'selfFightMargin', 1);
        onChk('lvscNoCrossRealmFight', 'noCrossRealmFight');
        onNum('lvscNoCrossRealmGap', 'noCrossRealmGap', 0);
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
            var saved = localStorage.getItem('lvSpiritCleaner.reviveExploreArea') || '';
            targetSel.innerHTML = '<option value="">（不跳转）</option>';
            var areas = findGameAreaOptions();
            if (!areas.length) {
                if (reviveAreaRetries < 30) { reviveAreaRetries++; setTimeout(refreshReviveAreaSelect, 2000); }
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
            reviveAreaRetries = 0;
            _cachedAreaNames = [];
            _areaNameToId = {};
            var a = gameApi(); if (a&&a.get) { a.get('/api/game/areas').then(function(d){ if(d&&d.code===200&&Array.isArray(d.data)){ var m={}; d.data.forEach(function(x){if(x.id&&x.name)m[x.id]={n:x.name,c:x.continent||''};}); localStorage.setItem('lvscAreaNameCache',JSON.stringify(m)); } refreshReviveAreaSelect(); }).catch(function(){ refreshReviveAreaSelect(); }); }
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
        onNum('lvscMeditateStopSpirit', 'meditateStopSpirit', 0, 100);  // %输入限0-100
        onNum('lvscMonitorStartSpirit', 'monitorStartSpirit', 0, 100); // %输入限0-100
        onChk('lvscAutoExploreAfterMeditate', 'autoExploreAfterMeditate');
        onChk('lvscNightOnlyExplore', 'nightOnlyExplore');
        onChk('lvscAutoReviveDeath', 'autoReviveDeath');
        onChk('lvscCheckDaoyunBoost', 'checkDaoyunBoost');
        onChk('lvscUseAdvancedMeditate', 'useAdvancedMeditate');
        (function(){ var el=document.getElementById('lvscAdvMedCooldownMin'); if(el){ el.value=String(state.advMedCooldownMin); el.onchange=function(){ state.advMedCooldownMin=Math.max(0,Number(this.value));
 persistSetting('lvSpiritCleaner.advMedCooldownMin',String(state.advMedCooldownMin)); }; } })();
        (function() {
            var el = document.getElementById('lvscAutoReloadMin');
            if (!el) return;
            el.onchange = function () {
                var v = Math.max(0, Number(el.value)) || 0;
                state.autoReloadMin = v;
                persistSetting('lvSpiritCleaner.autoReloadMin', String(v));
                if (v > 0) {
                    localStorage.setItem('lvSpiritCleaner.lastReloadTime', String(Date.now()));
                    var cd = document.getElementById('lvscReloadCountdown');
                    if (cd) cd.textContent = v + '分钟后自动刷新';
                } else {
                    var cd = document.getElementById('lvscReloadCountdown');
                    if (cd) cd.textContent = '自动刷新网站，0为关闭';
                }
            };
        })();
        // 装备套装
        document.getElementById('lvscEquipSwapEnabled').checked = state.equipSwapEnabled;
        document.getElementById('lvscEquipSwapEnabled').onchange = function () { state.equipSwapEnabled = this.checked; persistSetting('lvSpiritCleaner.equipSwapEnabled', this.checked); };
        var eqSpirit = document.getElementById('lvscEquipSpiritSlot');
        if (eqSpirit) { eqSpirit.value = String(state.equipSpiritSlot); eqSpirit.onchange = function() { state.equipSpiritSlot = Number(this.value); persistSetting('lvSpiritCleaner.equipSpiritSlot', String(this.value)); }; }
        var eqCombat = document.getElementById('lvscEquipCombatSlot');
        if (eqCombat) { eqCombat.value = String(state.equipCombatSlot); eqCombat.onchange = function() { state.equipCombatSlot = Number(this.value); persistSetting('lvSpiritCleaner.equipCombatSlot', String(this.value)); }; }
        onSel('lvscInscriptionQuality', 'inscriptionQuality', ['any', '凡纹', '灵纹', '宝纹', '仙纹', '神纹', '圣纹', '天纹']);
        try {
        // 铭文属性和最小值变化时需要同步 targets（auto tab元素，创建后才有）
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
        } catch(e) {}
        onChk('lvscDesktopNotify', 'desktopNotify');
        // chatOnTop: 额外应用 z-index
        var cto = document.getElementById('lvscChatOnTop'); if (cto) cto.onchange = function () {
            state.chatOnTop = chkVal('lvscChatOnTop');
            persistSetting('lvSpiritCleaner.chatOnTop', state.chatOnTop);
            applyChatZIndex(state.chatOnTop);
        };
        // wecomNotify: 额外切换字段显示 + 启停 observer
        var wn = document.getElementById('lvscWecomNotify'); if (wn) wn.onchange = function () {
            state.wecomNotify = chkVal('lvscWecomNotify');
            persistSetting('lvSpiritCleaner.wecomNotify', state.wecomNotify);
            var wf = document.getElementById('lvscWecomFields'); if (wf) wf.style.display = '';
            if (state.wecomNotify) startRecruitObserver();
        };
        onStr('lvscWecomNotifyWebhook', 'wecomNotifyWebhook');
        // 状态栏分类开关
        var statusCats = ['Run','Fight','Merchant','Meditate','Recover','Buff','Insc','Craft','Farm','Dispose','Luck','Break','Origin','Wecom','Equip'];
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
        onChk('lvscAutoTeachDaily', 'autoTeachDaily');
        onChk('lvscAutoGiftItemsDaily', 'autoGiftItemsDaily');
        onChk('lvscAutoGiftStonesDaily', 'autoGiftStonesDaily');
        onNum('lvscGiftStonesQty', 'giftStonesQty', 1);
        onNum('lvscGiftItemQty', 'giftItemQty', 1);
        onChk('lvscAutoHudaoBreakMeditate', 'autoHudaoBreakMeditate');

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
        // 登录页不调用玩家API，防止401触发重定向死循环
        if (location.pathname !== '/' && location.pathname !== '') {
            refreshPlayer();
        }
        loadAreaNameCache();
        showBuiltinReleaseOnce();
        hookAntiCheatAutoSolve();
        startOnlineHeartbeat();
        setTimeout(function () { checkCloudUpdate(false); }, 1500);
        setInterval(function () { checkCloudUpdate(false); }, CLOUD_UPDATE_POLL_MS);
        setTimeout(function () { checkAnnounce(); }, 3000);
        setInterval(function () { checkAnnounce(); }, 120000); // 每2分钟检查在线公告
        setInterval(updateMeter, 2000);
        applyChatZIndex(state.chatOnTop);
        // 定时炼制倒计时显示
setInterval(function() {
    var cdEl = document.getElementById('lvscCraftTimerCountdown');
    if (!cdEl) return;
    if (!state.craftAutoTimer || !state.nextAutoCraftTime) {
        cdEl.textContent = '';
        return;
    }
    var now = Date.now();
    var remain = state.nextAutoCraftTime - now;
    if (remain <= 0) {
        // 检查为什么没有开始炼制
        var reason = '';
        if (autoCraftRunning) {
            reason = '炼制已在运行';
        } else if (running) {
            reason = '清理运行中';
        } else if (autoInscriptionRunning) {
            reason = '铭文洗练中';
        } else if (!state.craftRecipeId) {
            reason = '请先选择配方';
        } else if (!gameApi()) {
            reason = 'API不可用';
        } else {
            reason = '即将执行...';
        }

        if (reason !== '即将执行...') {
            cdEl.textContent = reason;
            // 3秒后恢复显示
            setTimeout(function() {
                if (cdEl) cdEl.textContent = '即将执行...';
            }, 3000);
        } else {
            cdEl.textContent = '即将执行...';
        }
        return;
    }
    var totalSec = Math.ceil(remain / 1000);
    var min = Math.floor(totalSec / 60);
    var sec = totalSec % 60;
    cdEl.textContent = '(' + min + '分' + (sec < 10 ? '0' : '') + sec + '秒后执行)';
}, 1000);
        if (state.autoRecruit || state.wecomNotify) {
            setTimeout(function () { startRecruitObserver(); }, 2000);
        }
                (function(){document.querySelectorAll('.lvsc-tab-panel>.lvsc-section').forEach(function(sec){var t=(sec.querySelector('.lvsc-section-title-row span')||{}).textContent||'';var target='explore';if(/^(妖兽|护道|商人|冥想|装备|本命|自动刷新)/.test(t))target='explore';else if(/^(炼制|批量炼制|铭文|功法|师徒|监控|其他|出售|洗练石|气运|出狱|灵田|登录|月卡|收徒|藏宝图|珍宝阁|扫荡)/.test(t))target='auto';else if(/^(更新|通知|配置|安全|主题)/.test(t))target='other';var panel=document.querySelector('[data-tab-panel="'+target+'"]');if(panel&&sec.parentNode!==panel)panel.appendChild(sec)})})();
        // ====== 动态功能注入 ======
        try {(function() {
            function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h) e.innerHTML = h; return e; }
            function sec(title, badge) { var s = el('div', 'lvsc-section'); var bh = ''; if (badge === 'auto') { bh = '<span class="lvsc-badge" style="font-size:10px;padding:1px 6px;border-radius:3px;margin-left:6px;background:rgba(107,201,160,.14);color:#6bc9a0">自动</span>'; s.setAttribute('data-badge', 'auto'); } else if (badge === 'manual') { bh = '<span class="lvsc-badge" style="font-size:10px;padding:1px 6px;border-radius:3px;margin-left:6px;background:rgba(224,160,64,.14);color:#e0a040">需启动</span>'; s.setAttribute('data-badge', 'manual'); } s.appendChild(el('div', 'lvsc-section-title-row', '<span>' + title + bh + '</span>')); return s; }
            function cat(h,t){var p=document.querySelector('[data-tab-panel="auto"]');if(!p)return h;var cs=p.children;for(var i=0;i<cs.length;i++){var sec=cs[i];if(sec.classList&&sec.classList.contains('lvsc-section')){var tr=sec.querySelector('.lvsc-section-title-row');if(!tr)continue;var sp=tr.querySelector('span');if(sp&&sp.textContent.trim()===t){var nx=sec.querySelector('.lvsc-card-grid');if(nx)nx.appendChild(h);else sec.appendChild(h);return h}}}p.appendChild(h);return h}
function rfrBtn(id) { var b = el('button'); b.id = id; b.className = 'lvsc-rfr-btn'; b.style.cssText = 'height:29px;padding:0 8px;margin-left:4px'; b.textContent = '刷新'; return b; }
            function goldBtn(id, text) { var b = el('button'); b.id = id; b.className = 'lvsc-action-btn'; b.style.cssText = 'flex:1;height:34px'; b.textContent = text; return b; }
            function actBtn(id, text) { var b = el('button'); b.id = id; b.className = 'lvsc-action-btn'; b.style.cssText = 'flex:1;height:32px'; b.textContent = text; return b; }
            function stopBtn(id) { var b = el('button'); b.id = id; b.className = 'lvsc-stop-btn'; b.style.cssText = 'flex:1;height:32px;display:none'; b.textContent = '停止'; return b; }
            function logDiv(id) { var d = el('div'); d.id = id; d.style.cssText = 'min-height:60px;max-height:120px;overflow:auto;white-space:pre-wrap;font-size:11px;color:#cfc6b2;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:8px;font-family:Consolas,monospace'; d.textContent = '待命'; return d; }

// 涅槃重生丹 → auto tab
(function() {
    var p = document.querySelector('[data-tab-panel="auto"]'); if (!p) return;
    var s = sec('涅槃重生丹', 'manual'), g = el('div', 'lvsc-grid2');
    g.innerHTML = '<label>配方<select id="lvscNirvanaRecipeSelect" style="min-width:140px"><option value="">点击刷新</option></select><button id="lvscNirvanaRefreshBtn" style="height:29px;padding:0 8px;margin-left:4px;background:rgba(255,255,255,.08);color:#cfc6b2;border:1px solid rgba(255,255,255,.1)!important;border-radius:6px;font-size:11px;">刷新</button></label>' +
    '<label>品质<select id="lvscNirvanaRarity"><option value="1">普通</option><option value="2">优良</option><option value="3">稀有</option><option value="4">史诗</option><option value="5">传说</option></select></label>' +
    '<label>目标数量<input id="lvscNirvanaQualityCount" type="number" min="1" max="999" value="' + (state.nirvanaQualityCount || 10) + '" style="width:70px"></label>' +
    '<label>每次炼制<input id=\"lvscNirvanaBatchSize\" type=\"number\" min=\"1\" max=\"100\" value=\"' + (state.nirvanaBatchSize || 10) + '\" style=\"width:70px\"></label>' +
    '<label>每次使用<input id=\"lvscNirvanaUseQty\" type=\"number\" min=\"1\" max=\"999\" value=\"' + (state.nirvanaUseQty || 1) + '\" style=\"width:70px\"></label>' +
    '<label class="lvsc-check" style="font-size:11px"><input id="lvscNirvanaAutoTimer" type="checkbox">定时炼制</label>' +
    '<label style="font-size:11px">间隔(分钟)<input id="lvscNirvanaTimerMin" type="number" min="1" value="' + (state.nirvanaTimerMin || 10) + '" style="width:60px;height:20px"></label>' +
    '<span id="lvscNirvanaCountdown" style="font-size:11px;color:#dbb970;margin-left:4px;white-space:nowrap"></span>' +
    '<div style="display:flex;gap:6px;margin-top:4px"><button id="lvscAutoNirvanaBtn" style="flex:1;height:32px;background:linear-gradient(135deg,#dbb970,#c9a050);color:#17141d;border:0!important;border-radius:6px;cursor:pointer;font-weight:700;">开始炼制</button><button id="lvscStopNirvanaBtn" style="flex:1;height:32px;background:rgba(255,255,255,.08);color:#cfc6b2;border:1px solid rgba(255,255,255,.1)!important;border-radius:6px;cursor:pointer;font-weight:700;display:none;">停止</button></div>';
    s.appendChild(g);
    s.appendChild(logDiv('lvscNirvanaLog'));
    cat(s,'炼制');
    // 涅槃重生丹功能绑定
    (function() {
        var el = document.getElementById('lvscNirvanaRecipeSelect');
        if (!el) return;
        // 恢复配方选择
        if (state.nirvanaRecipeId) el.value = state.nirvanaRecipeId;
        el.onchange = function() { state.nirvanaRecipeId = this.value; persistSetting('lvSpiritCleaner.nirvanaRecipeId', this.value); };
        async function refreshNirvanaRecipes() {
            var recipes = await fetchRecipes('alchemy');
            console.log('[Nirvana] 配方列表加载完成，共', recipes.length, '个配方');
            el.innerHTML = '<option value="">选择配方</option>';
            if (!recipes.length) { el.innerHTML = '<option value="">无配方或加载失败</option>'; return; }
            for (var ri = 0; ri < recipes.length; ri++) {
                var r = recipes[ri];
                var id = String(getCraftItemId(r, 'alchemy') || '').toLowerCase();
                var name = (getCraftItemName(r, 'alchemy') || '').toLowerCase();
                if (name.indexOf('涅槃') < 0 && name.indexOf('重生') < 0 && id.indexOf('nirvana') < 0 && id.indexOf('rebirth') < 0) continue;
                var realId = getCraftItemId(r, 'alchemy');
                var realName = getCraftItemName(r, 'alchemy');
                el.innerHTML += '<option value="' + realId + '"' + (state.nirvanaRecipeId === realId ? ' selected' : '') + '>' + realName + '</option>';
            }
            if (state.nirvanaRecipeId && !el.value) el.value = state.nirvanaRecipeId;
        }
        setTimeout(refreshNirvanaRecipes, 2000);
        var nirvRefreshBtn = document.getElementById('lvscNirvanaRefreshBtn');
        if (nirvRefreshBtn) nirvRefreshBtn.onclick = refreshNirvanaRecipes;
        // 恢复品质/数量/每次炼制/定时炼制/间隔
        var nirvRarity = document.getElementById('lvscNirvanaRarity');
        if (nirvRarity) { nirvRarity.value = String(state.nirvanaRarity || 3); nirvRarity.onchange = function() { state.nirvanaRarity = Number(this.value); persistSetting('lvSpiritCleaner.nirvanaRarity', String(state.nirvanaRarity)); }; }
        var nirvBatchSize = document.getElementById('lvscNirvanaBatchSize');
        if (nirvBatchSize) { nirvBatchSize.value = state.nirvanaBatchSize || 10; nirvBatchSize.onchange = function() { state.nirvanaBatchSize = Math.max(1, Number(this.value)||10); persistSetting('lvSpiritCleaner.nirvanaBatchSize', String(state.nirvanaBatchSize)); }; }
        var nirvQualityCount = document.getElementById('lvscNirvanaQualityCount');
        if (nirvQualityCount) { nirvQualityCount.value = state.nirvanaQualityCount || 10; nirvQualityCount.onchange = function() { state.nirvanaQualityCount = Math.max(1, Number(this.value)||10); persistSetting('lvSpiritCleaner.nirvanaQualityCount', String(state.nirvanaQualityCount)); }; }
        var nirvUseQty = document.getElementById('lvscNirvanaUseQty');
        if (nirvUseQty) { nirvUseQty.value = state.nirvanaUseQty || 1; nirvUseQty.onchange = function() { state.nirvanaUseQty = Math.max(1, Number(this.value)||1); persistSetting('lvSpiritCleaner.nirvanaUseQty', String(state.nirvanaUseQty)); }; }
        var nirvAutoTimer = document.getElementById('lvscNirvanaAutoTimer');
        if (nirvAutoTimer) { nirvAutoTimer.checked = state.nirvanaAutoTimer; nirvAutoTimer.onchange = function() { state.nirvanaAutoTimer = this.checked; persistSetting('lvSpiritCleaner.nirvanaAutoTimer', this.checked); if (this.checked) { updateNextAutoNirvanaTime(); startAutoNirvanaTimer(); } }; }
        var nirvTimerMin = document.getElementById('lvscNirvanaTimerMin');
        if (nirvTimerMin) { nirvTimerMin.value = state.nirvanaTimerMin || 10; nirvTimerMin.onchange = function() { state.nirvanaTimerMin = Math.max(1, Number(this.value)||10); persistSetting('lvSpiritCleaner.nirvanaTimerMin', String(state.nirvanaTimerMin)); if (state.nirvanaAutoTimer) updateNextAutoNirvanaTime(); }; }
        // 恢复自动定时炼制（如果之前勾选了，恢复后启动倒计时）
        if (state.nirvanaAutoTimer) {
            setTimeout(function() { updateNextAutoNirvanaTime(); startAutoNirvanaTimer(); }, 2000);
        }
        // 定时炼制倒计时
        setInterval(function() {
            var cdEl = document.getElementById('lvscNirvanaCountdown');
            if (!cdEl) return;
            if (!state.nirvanaAutoTimer || !state.nirvanaNextTimerTime) { cdEl.textContent = ''; return; }
            var now = Date.now();
            var remain = state.nirvanaNextTimerTime - now;
            if (remain <= 0) {
                var reason = '';
                if (autoNirvanaRunning) reason = '炼制已在运行';
                else if (running) reason = '清理运行中';
                else reason = '即将执行...';
                cdEl.textContent = reason;
                setTimeout(function() { if (cdEl) cdEl.textContent = '即将执行...'; }, 3000);
                return;
            }
            var totalSec = Math.ceil(remain / 1000);
            var min = Math.floor(totalSec / 60);
            var sec = totalSec % 60;
            cdEl.textContent = '(' + min + '分' + (sec < 10 ? '0' : '') + sec + '秒后执行)';
        }, 1000);
        // 开始/停止按钮
        var startBtn = document.getElementById('lvscAutoNirvanaBtn');
        if (startBtn) startBtn.onclick = function() { if (autoNirvanaRunning) return; startBtn.style.display = 'none'; var stopBtn = document.getElementById('lvscStopNirvanaBtn'); if (stopBtn) stopBtn.style.display = ''; autoNirvanaLoop().finally(function() { startBtn.style.display = ''; if (stopBtn) stopBtn.style.display = 'none'; }); };
        var stopBtn = document.getElementById('lvscStopNirvanaBtn');
        if (stopBtn) stopBtn.onclick = stopNirvana;
    })();
})();

            // ---------- 铭文洗练 → auto ----------
            (function() {
                var p = document.querySelector('[data-tab-panel="auto"]'); if (!p) return;
                var s = sec('铭文洗练', 'manual');
                var g = el('div', 'lvsc-grid2');
                g.innerHTML = '<label>铭文装备<select id="lvscInscriptionEquipment"><option value="">点击刷新选择装备</option></select><button id="lvscRefreshEquipment" style="height:29px;padding:0 8px;margin-left:4px;background:rgba(255,255,255,.08);color:#cfc6b2;border:1px solid rgba(255,255,255,.1)!important;border-radius:6px;font-size:11px;">刷新</button></label>' +
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
                '<button id="lvscAutoInscriptionBtn" style="height:34px;background:rgba(216,180,254,.14);color:#d8b4fe;border:1px solid rgba(216,180,254,.28)!important;border-radius:6px;cursor:pointer;font-weight:700">自动刷铭文</button>';
                s.appendChild(g);
                var pa = document.querySelector('[data-tab-panel="auto"]');
                if (!pa) return;
                var ss = pa.querySelectorAll(':scope>.lvsc-section');
                for (var i = 0; i < ss.length; i++) {
                    var sp = ss[i].querySelector(':scope>.lvsc-section-title-row>span');
                    if (sp && sp.textContent.trim() === '铭文') {
                        var cg = ss[i].querySelector('.lvsc-card-grid');
                        if (cg) cg.appendChild(s);
                        
                        // 绑定铭文洗练按钮
                        var _inscBtn = document.getElementById('lvscAutoInscriptionBtn');
                        if (_inscBtn) _inscBtn.onclick = toggleAutoInscription;
                        s.appendChild(el('div', 'lvsc-help', '先打开游戏里的铭文洗练界面。自动装配优先级：空槽位 → 非目标槽位 → 目标槽最低值且新值更高。关闭自动装配时，命中目标会保留结果等待处理。'));
                        s.appendChild(el('div', '', '<div id="lvscInscriptionStats">次数 0 / 达成 0 / 放弃 0</div><div id="lvscInscriptionLog" style="min-height:130px;max-height:190px;overflow:auto;white-space:pre-wrap;font-size:11px;color:#cfc6b2;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:8px">待命</div>'));
                        
                        // 恢复铭文洗练控件值 + 绑定onchange保存（元素已在DOM中）
                        (function(){
                            var binds = [
                                ['lvscInscriptionQuality', 'inscriptionQuality', 'lvSpiritCleaner.inscriptionQuality'],
                                ['lvscInscriptionStat', 'inscriptionStat', 'lvSpiritCleaner.inscriptionStat'],
                                ['lvscInscriptionMinValue', 'inscriptionMinValue', 'lvSpiritCleaner.inscriptionMinValue'],
                                ['lvscInscriptionStopMode', 'inscriptionStopMode', 'lvSpiritCleaner.inscriptionStopMode'],
                                ['lvscInscriptionMaxAttempts', 'inscriptionMaxAttempts', 'lvSpiritCleaner.inscriptionMaxAttempts'],
                                ['lvscInscriptionResultDelay', 'inscriptionResultDelay', 'lvSpiritCleaner.inscriptionResultDelay'],
                                ['lvscInscriptionDiscardDelay', 'inscriptionDiscardDelay', 'lvSpiritCleaner.inscriptionDiscardDelay'],
                                ['lvscInscriptionPullMode', 'inscriptionPullMode', 'lvSpiritCleaner.inscriptionPullMode'],
                                ['lvscInscriptionAutoEquip', 'inscriptionAutoEquip', 'lvSpiritCleaner.inscriptionAutoEquip'],
                                ['lvscEquipCrossStat', 'inscriptionEquipCrossStat', 'lvSpiritCleaner.inscriptionEquipCrossStat'],
                                ['lvscEquipSkipSpirit', 'inscriptionEquipSkipSpirit', 'lvSpiritCleaner.inscriptionEquipSkipSpirit']
                            ];
                            binds.forEach(function(b) {
                                var el = document.getElementById(b[0]);
                                if (!el) return;
                                var key = b[2], stateKey = b[1];
                                if (el.type === 'checkbox') {
                                    el.checked = state[stateKey];
                                } else {
                                    el.value = String(state[stateKey] !== undefined && state[stateKey] !== null ? state[stateKey] : localStorage.getItem(key) || '');
                                }
                                el.onchange = function() {
                                    var val = this.type === 'checkbox' ? this.checked : this.value;
                                    state[stateKey] = val;
                                    persistSetting(key, val);
                                };
                            });
                            var eq = document.getElementById('lvscInscriptionEquipment');
                            if (eq) {
                                eq.onchange = function() {
                                    _inscItemId = this.value;
                                    _inscItemName = this.options[this.selectedIndex] ? this.options[this.selectedIndex].textContent || '' : '';
                                    localStorage.setItem('lvSpiritCleaner.inscriptionEquipmentId', this.value);
                                };
                            }
                            var ref = document.getElementById('lvscRefreshEquipment');
                            if (ref) ref.onclick = function() {
                                var sel = document.getElementById('lvscInscriptionEquipment');
                                if (!sel || !gameApi()) return;
                                var saved = _inscItemId || localStorage.getItem('lvSpiritCleaner.inscriptionEquipmentId') || '';
                                sel.innerHTML = '<option value="">点击刷新选择装备</option>';
                                gameApi().get('/api/game/equipment/current').then(function (res) {
                                    if (!res || res.code !== 200 || !Array.isArray(res.data)) return;
                                    var curOpt = document.createElement('option');
                                    curOpt.value = '__current__';
                                    curOpt.textContent = (typeof getCurrentInscItemName === 'function' ? getCurrentInscItemName() : '当前装备') + '（需打开铭文页）';
                                    if (saved === '__current__') curOpt.selected = true;
                                    sel.appendChild(curOpt);
                                    res.data.forEach(function (item) {
                                        var name = item.name || item.itemName || item.equipmentName || '';
                                        var id = String(item.playerItemId || item.id || item.itemId || item.equipmentId || item.instanceId || '');
                                        if (!name || !id) return;
                                        var slot = item.slot || item.equipSlot || item.slotName || item.equipmentSlot || '';
                                        var opt = document.createElement('option');
                                        opt.value = id;
                                        opt.textContent = (slot ? '[' + slot + '] ' : '') + name;
                                        if (id === saved) opt.selected = true;
                                        sel.appendChild(opt);
                                    });
                                    if (saved && !sel.value) sel.value = saved;
                                    if (sel.value) {
                                        _inscItemId = sel.value;
                                        _inscItemName = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent || '' : '';
                                    }
                                }).catch(function(){});
                            };
                        })();
                        
                        return;
                    }
                }
})();

            // ---------- 气运+突破+本源 → 监控 ----------
            (function() {
                var c = document.getElementById('lvscMonitorLuck'); if (!c) return;
                c.insertAdjacentHTML('beforeend', '<div class=\"lvsc-grid2\"><label style=\"font-size:11px\">最低气运<input id=\"lvscMinLuck\" type=\"number\" min=\"1\" max=\"10\" value=\"' + state.minLuck + '\" style=\"height:24px\"></label><label style=\"font-size:11px\">消耗<select id=\"lvscLuckRefreshMethod\"><option value=\"stone\">灵石</option><option value=\"ad\">仙缘</option></select></label><span id=\"lvscLuckNow\" style=\"font-size:11px;color:#dbb970;line-height:28px\">当前: ?</span><label class=\"lvsc-check\" style=\"font-size:11px\"><input id=\"lvscAutoMaintainLuck\" type=\"checkbox\"' + (state.autoMaintainLuck ? ' checked' : '') + '>自动维持气运（低于目标自动刷到达标）</label></div>');
            })();
            // ---------- 出售 & 分解 → auto ----------
            (function() {
                var s = el('div');
                // 添加规则行
                var addRow = el('div'); addRow.style.cssText = 'display:flex;gap:4px;align-items:center;flex-wrap:wrap';
                var actSel = el('select'); actSel.id = 'lvscDisposeAction'; actSel.innerHTML = '<option value="sell">出售</option><option value="dismantle">分解</option><option value="discard">丢弃</option>';
                var scopeSel = el('select'); scopeSel.id = 'lvscDisposeScope'; scopeSel.innerHTML = '<option value="all">全部</option><option value="equip">装备</option><option value="pill">丹药</option><option value="scroll">卷轴</option><option value="misc">杂物</option>';
                var raritySel = el('select'); raritySel.id = 'lvscDisposeRarity'; raritySel.innerHTML = '<option value="1">普通及以下</option><option value="2">优良及以下</option><option value="3">稀有及以下</option><option value="4">史诗及以下</option>';
                var addBtn = el('button'); addBtn.id = 'lvscDisposeAddBtn'; addBtn.textContent = '+ 添加监控'; addBtn.style.cssText = 'height:28px;padding:0 10px;background:#4a7c5c;color:#e8f0e0;border:0;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;white-space:nowrap';
                function updateScopeOptions() {
                    var act = actSel.value;
                    if (act === 'dismantle') { scopeSel.innerHTML = '<option value="equip">装备</option>'; }
                    else if (act === 'discard') { scopeSel.innerHTML = '<option value="talisman">符箓</option><option value="pill">丹药</option><option value="scroll">卷轴</option><option value="misc">杂物</option><option value="all">全部</option>'; }
                    else { scopeSel.innerHTML = '<option value="all">全部</option><option value="equip">装备</option><option value="pill">丹药</option><option value="scroll">卷轴</option><option value="misc">杂物</option>'; }
                }
                actSel.addEventListener('change', updateScopeOptions);
                addRow.appendChild(actSel); addRow.appendChild(scopeSel); addRow.appendChild(raritySel); addRow.appendChild(addBtn);
                s.appendChild(addRow);
                // 启用 + 间隔
                var cfgRow = el('div'); cfgRow.style.cssText = 'display:flex;gap:6px;align-items:center';
                cfgRow.innerHTML = '<label class="lvsc-check" style="font-size:11px"><input id="lvscAutoDisposeEnabled" type="checkbox">启用监控</label><label class="lvsc-check" style="font-size:11px"><input id="lvscAutoSynthesize" type="checkbox">自动凝聚碎片</label><label style="font-size:11px">间隔(秒)<input id="lvscAutoDisposeInterval" type="number" min="60" value="' + state.autoDisposeInterval + '" style="width:70px;height:24px"></label>';
                s.appendChild(cfgRow);
                // 立即恢复 checkbox 状态（防止 buildPanel 后续中断导致状态丢失）
                var deCb = document.getElementById('lvscAutoDisposeEnabled');
                if (deCb) {
                    deCb.checked = state.autoDisposeEnabled;
                    deCb.onchange = function() {
                        state.autoDisposeEnabled = this.checked;
                        persistSetting('lvSpiritCleaner.autoDisposeEnabled', this.checked);
                    };
                }
                var synCb = document.getElementById('lvscAutoSynthesize');
                if (synCb) {
                    synCb.checked = state.autoSynthesize;
                    synCb.onchange = function() {
                        state.autoSynthesize = this.checked;
                        persistSetting('lvSpiritCleaner.autoSynthesize', this.checked);
                    };
                }
                var deIntv = document.getElementById('lvscAutoDisposeInterval');
                if (deIntv) {
                    deIntv.value = state.autoDisposeInterval || 300;
                    deIntv.onchange = function() {
                        state.autoDisposeInterval = Math.max(60, Number(this.value) || 300);
                        persistSetting('lvSpiritCleaner.autoDisposeInterval', String(state.autoDisposeInterval));
                    };
                }
                var btnRow = el('div'); btnRow.style.cssText = 'display:flex;gap:6px';
                var dsBtn = actBtn('lvscDisposeStartBtn', '开始监控');
                dsBtn.onclick = function() {
                    this.style.display = 'none';
                    var sb = document.getElementById('lvscDisposeStopBtn');
                    if (sb) sb.style.display = '';
                    autoDisposeLoop();
                };
                btnRow.appendChild(dsBtn);
                var dpStop = stopBtn('lvscDisposeStopBtn');
                dpStop.onclick = function() {
                    autoDisposeRunning = false;
                    var db = document.getElementById('lvscDisposeStartBtn');
                    if (db) db.style.display = '';
                    this.style.display = 'none';
                };
                btnRow.appendChild(dpStop);
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
                var _c = document.getElementById('lvscMonitorSell'); if (_c) { while (s.children.length > 0) _c.appendChild(s.children[0]); }
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
                    var actionNames = {sell:'出售',dismantle:'分解',discard:'丢弃'};
                    var scopeNames = {equip:'装备',pill:'丹药',scroll:'卷轴',talisman:'符箓',misc:'杂物',all:'全部'};
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
                // 渲染保护列表（品质分组）
                window._renderProtectedList = function() {
                    var el = document.getElementById('lvscDisposeProtectedList'); if (!el) return;
                    var items = Array.isArray(state.autoDisposeProtected) ? state.autoDisposeProtected : [];
                    if (!items.length) { el.innerHTML = '<span style=\"font-size:10px;color:var(--text-muted)\">未保护额外物品（锁定物品和空白卷轴自动排除）</span>'; return; }
                    var RAR = ['','普通','优良','稀有','史诗','传说'];
                    // 分组：同 baseId 的放一起
                    var groups = {};
                    for (var _i = 0; _i < items.length; _i++) {
                        var it = items[_i];
                        var tid = typeof it === 'string' ? it : it.id;
                        var tname = typeof it === 'string' ? tid : (it.name || tid);
                        var baseId = tid.replace(/_\d+$/, '');
                        if (!groups[baseId]) groups[baseId] = { name: tname, ids: {} };
                        groups[baseId].ids[tid] = _i;
                    }
                    var html = '<div style=\"font-size:10px;color:#6bc9a0;margin-bottom:4px\">🛡 额外保护：</div>';
                    Object.keys(groups).forEach(function(baseId) {
                        var g = groups[baseId];
                        var idKeys = Object.keys(g.ids);
                        // 5个品质全有 → 合并成一条
                        if (idKeys.length === 5 && idKeys.every(function(k) { return /_\d$/.test(k); })) {
                            html += '<div style=\"display:flex;align-items:center;padding:2px 4px;margin:1px 0;background:rgba(107,201,160,.06);border-radius:3px;font-size:10px\"><span style=\"flex:1;color:#cfc6b2\">' + (g.name || baseId) + ' <span style=\"color:#dbb970\">[全部品质]</span></span><span data-delbase=\"' + baseId + '\" style=\"color:#ff6b6b;cursor:pointer\">✕</span></div>';
                        } else {
                            // 单个或部分品质 → 逐条显示
                            idKeys.forEach(function(tid) {
                                var origIdx = g.ids[tid];
                                var origIt = items[origIdx];
                                var nm = typeof origIt === 'string' ? tid : (origIt.name || tid);
                                var quality = '';
                                var m2 = tid.match(/_(\d+)$/);
                                if (m2 && RAR[parseInt(m2[1])]) quality = ' [' + RAR[parseInt(m2[1])] + ']';
                                html += '<div style=\"display:flex;align-items:center;padding:2px 4px;margin:1px 0;background:rgba(107,201,160,.06);border-radius:3px;font-size:10px\"><span style=\"flex:1;color:#cfc6b2\">' + (nm || tid) + quality + '</span><span style=\"color:#6a6560;margin:0 6px;font-size:9px\">' + tid + '</span><span data-delidx=\"' + origIdx + '\" style=\"color:#ff6b6b;cursor:pointer\">✕</span></div>';
                            });
                        }
                    });
                    html += '<div style=\"margin-top:4px\"><span style=\"color:#ff6b6b;cursor:pointer;font-size:10px\" id=\"lvscClearProtect\">清空全部</span></div>';
                    el.innerHTML = html;
                    // 单个删除
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
                    // 全部品质删除
                    el.querySelectorAll('[data-delbase]').forEach(function(sp) {
                        sp.addEventListener('click', function() {
                            var baseId = this.getAttribute('data-delbase');
                            var arr = Array.isArray(state.autoDisposeProtected) ? state.autoDisposeProtected.slice() : [];
                            arr = arr.filter(function(x) {
                                var xid = typeof x === 'string' ? x : x.id;
                                return xid.replace(/_\d+$/, '') !== baseId;
                            });
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
                var c = document.getElementById('lvscMonitorFarm'); if (!c) return;
                var g = el('div', 'lvsc-grid2');
                g.innerHTML = '<label>种子<select id=\"lvscFarmSeed\"><option value=\"\">点击刷新</option></select></label><label>检测间隔(秒)<input id=\"lvscFarmInterval\" type=\"number\" min=\"5\" step=\"5\" value=\"' + state.farmInterval + '\"></label>';
                g.querySelector('label').appendChild(rfrBtn('lvscRefreshFarm'));
                c.appendChild(g);
                c.insertAdjacentHTML('beforeend', '<div class=\"lvsc-grid2\" style=\"grid-template-columns:1fr 1fr 1fr\"><label class=\"lvsc-check\" style=\"font-size:11px\"><input id=\"lvscFarmAutoHarvest\" type=\"checkbox\" checked>收获</label><label class=\"lvsc-check\" style=\"font-size:11px\"><input id=\"lvscFarmAutoPlant\" type=\"checkbox\" checked>种植</label></div>');
                c.insertAdjacentHTML('beforeend', '<label class=\"lvsc-check\" style=\"font-size:11px\"><input id=\"lvscFarmExpandEn\" type=\"checkbox\"' + (state.farmExpandEnabled ? ' checked' : '') + '>自动开垦</label><span id=\"lvscFarmNextExpand\" style=\"font-size:10px;color:var(--text-muted);margin-left:4px\"></span>');
                c.insertAdjacentHTML('beforeend', '<label class=\"lvsc-check\" style=\"font-size:11px\"><input id=\"lvscFarmAutoInvasion\" type=\"checkbox\" checked>迎击入侵</label>');
                var btnRow = el('div'); btnRow.style.cssText = 'display:flex;gap:6px';
                btnRow.appendChild(actBtn('lvscFarmStartBtn', '开始监控'));
                btnRow.appendChild(stopBtn('lvscFarmStopBtn'));
                c.appendChild(btnRow); c.appendChild(logDiv('lvscFarmLog'));
                // 绑定灵田控件
                var fs = document.getElementById('lvscFarmSeed'); if (fs) { fs.value = state.farmSeedId; fs.onchange = function() { state.farmSeedId = this.value; state.farmSeedName = this.options[this.selectedIndex].textContent || ''; persistSetting('lvSpiritCleaner.farmSeedId', state.farmSeedId); persistSetting('lvSpiritCleaner.farmSeedName', state.farmSeedName); }; }
                var fi = document.getElementById('lvscFarmInterval'); if (fi) { fi.value = String(state.farmInterval); fi.onchange = function() { state.farmInterval = Math.max(5, Number(this.value)||30); persistSetting('lvSpiritCleaner.farmInterval', String(state.farmInterval)); }; }
                var fah = document.getElementById('lvscFarmAutoHarvest'); if (fah) { fah.onchange = function() { state.farmAutoHarvest = this.checked; persistSetting('lvSpiritCleaner.farmAutoHarvest', this.checked); }; }
                var fap = document.getElementById('lvscFarmAutoPlant'); if (fap) { fap.onchange = function() { state.farmAutoPlant = this.checked; persistSetting('lvSpiritCleaner.farmAutoPlant', this.checked); }; }
                var fee = document.getElementById('lvscFarmExpandEn'); if (fee) { fee.onchange = function() { state.farmExpandEnabled = this.checked; persistSetting('lvSpiritCleaner.farmExpandEnabled', this.checked ? '1' : '0'); }; }
                var fai = document.getElementById('lvscFarmAutoInvasion'); if (fai) { fai.onchange = function() { state.farmAutoInvasion = this.checked; persistSetting('lvSpiritCleaner.farmAutoInvasion', this.checked); }; }
                var fst = document.getElementById('lvscFarmStartBtn'); if (fst) fst.onclick = function() { this.style.display = 'none'; var sb = document.getElementById('lvscFarmStopBtn'); if (sb) sb.style.display = ''; autoFarmLoop(); };
                var fsp = document.getElementById('lvscFarmStopBtn'); if (fsp) fsp.onclick = function() { stopFarm(); var sb = document.getElementById('lvscFarmStartBtn'); if (sb) sb.style.display = ''; this.style.display = 'none'; };
            })();

            // ---------- 功法洗练 → craft ----------
            (function() {
                var p = document.querySelector('[data-tab-panel="auto"]'); if (!p) return;
                var s = sec('功法洗练', 'manual'), g = el('div', 'lvsc-grid2');
                g.innerHTML = '<label>范围<select id="lvscSkillWashScope"><option value="body">本体</option><option value="incarnation">化身</option></select></label><label>功法<select id="lvscSkillWashSkill"><option value="">点击刷新</option></select></label><label>槽位<select id="lvscSkillWashSlot"><option value="0">点击刷新</option></select></label>' +
                    '<label>分类<select id="lvscSkillWashCategory"><option value="ATTACK">攻击</option><option value="DEFENSE">防御</option><option value="SUPPORT">辅助</option></select></label>' +
                    '<label>石头品质<select id="lvscSkillWashStoneQ"><option value="1">普通</option><option value="2">优良</option><option value="3">稀有</option><option value="4">史诗</option><option value="5">传说</option></select></label>' +
                    '<label>目标词条<input id="lvscSkillWashTarget" type="text" placeholder="如: 暴击 燃血 攻击"></label>' +
                    '<label>最低数值<input id="lvscSkillWashMin" type="text" placeholder="如: 22 或 22% 2.7"></label>';
                g.querySelector('label').appendChild(rfrBtn('lvscRefreshSkillWash'));
                s.appendChild(g);
                var btnRow = el('div'); btnRow.style.cssText = 'display:flex;gap:6px';
                btnRow.appendChild(actBtn('lvscSkillWashStartBtn', '开始洗练'));
                btnRow.appendChild(stopBtn('lvscSkillWashStopBtn'));
                s.appendChild(btnRow); s.appendChild(logDiv('lvscSkillWashLog'));
                            cat(s,'功法');
                // 绑定功法洗练控件
                var swScope = document.getElementById('lvscSkillWashScope');
                if (swScope) { swScope.value = state.skillWashScope; swScope.onchange = function() { state.skillWashScope = this.value; persistSetting('lvSpiritCleaner.skillWashScope', this.value); }; }
                var swSkill = document.getElementById('lvscSkillWashSkill');
                if (swSkill) { swSkill.value = state.skillWashSkillId; }
                var swSlot = document.getElementById('lvscSkillWashSlot');
                if (swSlot) { swSlot.value = String(state.skillWashSlot); swSlot.onchange = function() { state.skillWashSlot = Number(this.value); persistSetting('lvSpiritCleaner.skillWashSlot', String(this.value)); }; }
                var swCat = document.getElementById('lvscSkillWashCategory');
                if (swCat) { swCat.value = state.skillWashCategory || 'ATTACK'; swCat.onchange = function() { state.skillWashCategory = this.value; persistSetting('lvSpiritCleaner.skillWashCategory', this.value); }; }
                var swStone = document.getElementById('lvscSkillWashStoneQ');
                if (swStone) { swStone.value = String(state.skillWashStoneQuality); swStone.onchange = function() { state.skillWashStoneQuality = Number(this.value); persistSetting('lvSpiritCleaner.skillWashStoneQuality', String(this.value)); }; }
                var swTarget = document.getElementById('lvscSkillWashTarget');
                if (swTarget) { swTarget.value = state.skillWashTargetType; swTarget.onchange = function() { state.skillWashTargetType = this.value; persistSetting('lvSpiritCleaner.skillWashTargetType', this.value); }; }
                var swMin = document.getElementById('lvscSkillWashMin');
                if (swMin) { swMin.value = state.skillWashTargetMin; swMin.onchange = function() { state.skillWashTargetMin = this.value; persistSetting('lvSpiritCleaner.skillWashTargetMin', this.value); }; }
                var swRefresh = document.getElementById('lvscRefreshSkillWash');
                if (swRefresh) swRefresh.onclick = async function() {
                    var skills = await fetchSkillList(state.skillWashScope);
                    var sel = document.getElementById('lvscSkillWashSkill');
                    if (sel) { sel.innerHTML = '<option value="">选择功法</option>'; skills.forEach(function(sk) { sel.innerHTML += '<option value="' + sk.id + '">' + (sk.name||'功法#'+sk.id) + '</option>'; }); }
                };
                if (swSkill) swSkill.onchange = async function() {
                    state.skillWashSkillId = this.value;
                    persistSetting('lvSpiritCleaner.skillWashSkillId', this.value);
                    var skills = await fetchSkillList(state.skillWashScope);
                    var sk = null; for (var _si = 0; _si < skills.length; _si++) { if (String(skills[_si].id) === this.value) { sk = skills[_si]; break; } }
                    var ssel = document.getElementById('lvscSkillWashSlot');
                    if (ssel && sk) {
                        ssel.innerHTML = '<option value="">选择槽位</option>';
                        var slots = sk.slots || [];
                        for (var i = 0; i < slots.length; i++) {
                            ssel.innerHTML += '<option value="' + (i + 1) + '">槽' + (i + 1) + ': ' + (slots[i].desc || slots[i].type || '空') + '</option>';
                        }
                        if (slots.length > 0) {
                            ssel.selectedIndex = 0;
                            state.skillWashSlot = 0;
                            persistSetting('lvSpiritCleaner.skillWashSlot', '0');
                        } else {
                            state.skillWashSlot = 0;
                            persistSetting('lvSpiritCleaner.skillWashSlot', '0');
                        }
                    }
                };
                var swStart = document.getElementById('lvscSkillWashStartBtn');
                if (swStart) swStart.onclick = autoSkillWashLoop;
                var swStop = document.getElementById('lvscSkillWashStopBtn');
                if (swStop) swStop.onclick = stopSkillWash;
            })();

            // ---------- 洗炼石升品 → craft ----------
            (function() {
                var c = document.getElementById('lvscMonitorWashStone'); if (!c) return;
                var g = el('div', 'lvsc-grid2');
                g.innerHTML = '<label>检测间隔(秒)<input id=\"lvscWashStoneMonitorInterval\" type=\"number\" min=\"10\" step=\"5\" value=\"' + (state.washStoneMonitorInterval || 30) + '\"></label>';
                c.appendChild(g);
                var upgRow = el('div'); upgRow.style.cssText = 'display:flex;gap:6px';
                upgRow.appendChild(actBtn('lvscWashStoneUpgradeStartBtn', '一键升品'));
                upgRow.appendChild(stopBtn('lvscWashStoneUpgradeStopBtn'));
                // 立即绑定按钮事件（防止 buildPanel 后续中断导致事件丢失）
                var usStartBtn = document.getElementById('lvscWashStoneUpgradeStartBtn');
                if (usStartBtn) usStartBtn.onclick = autoUpgradeWashStonesLoop;
                var usStopBtn = document.getElementById('lvscWashStoneUpgradeStopBtn');
                if (usStopBtn) usStopBtn.onclick = stopWashStoneUpgrade;
                c.appendChild(upgRow);
                c.appendChild(logDiv('lvscWashStoneUpgradeLog'));
            })();
                        // ---------- 丹药升阶 → 监控 ----------
            (function() {
                var c = document.getElementById('lvscMonitorPillUpgrade'); if (!c) return;
                var g = el('div', 'lvsc-grid2');
                g.innerHTML = '<label>检测间隔(秒)<input id=\"lvscPillUpgradeMonitorInterval\" type=\"number\" min=\"10\" step=\"5\" value=\"' + (state.pillUpgradeMonitorInterval || 30) + '\"></label>';
                c.appendChild(g);
                var upgRow = el('div'); upgRow.style.cssText = 'display:flex;gap:6px';
                upgRow.appendChild(actBtn('lvscPillUpgradeStartBtn', '一键升阶'));
                upgRow.appendChild(stopBtn('lvscPillUpgradeStopBtn'));
                c.appendChild(upgRow);
                c.appendChild(logDiv('lvscPillUpgradeLog'));
                // 事件绑定必须放 appendChild 之后，否则按钮不在DOM中取不到
                var puStartBtn = document.getElementById('lvscPillUpgradeStartBtn');
                if (puStartBtn) puStartBtn.onclick = autoUpgradePillsLoop;
                var puStopBtn = document.getElementById('lvscPillUpgradeStopBtn');
                if (puStopBtn) puStopBtn.onclick = stopPillUpgrade;
            })();

            // ---------- 珍宝阁 → craft ----------
            // HTML已静态化，仅保留事件绑定

            // ---------- 制符+批量用符 → craft ----------
            (function() {
                var p = document.querySelector('[data-tab-panel="auto"]'); if (!p) return;
                var s = sec('批量用符'), g = el('div', 'lvsc-grid2');
                g.innerHTML = '<label>符篆类型<select id="lvscTalismanType"><option value="all">全部</option><option value="stealth">隐秘符</option><option value="combat">战斗符</option></select></label><label>每次几张<input id="lvscTalismanBatch" type="number" min="1" value="10"></label><label>循环次数<input id="lvscTalismanLoops" type="number" min="1" value="5"></label><label>间隔(ms)<input id="lvscTalismanDelay" type="number" min="500" step="100" value="1500"></label>';
                s.appendChild(g);
                var btnRow = el('div'); btnRow.style.cssText = 'display:flex;gap:6px';
                btnRow.appendChild(actBtn('lvscStartTalismanBtn', '开始用符'));
                btnRow.appendChild(stopBtn('lvscStopTalismanBtn'));
                s.appendChild(btnRow); s.appendChild(logDiv('lvscTalismanLog'));
                            cat(s,'炼制');
                // 炼制类型加"制符"
                var ct = document.getElementById('lvscCraftType');
                if (ct && !ct.querySelector('option[value="talisman"]')) { var o = document.createElement('option'); o.value = 'talisman'; o.textContent = '制符'; ct.appendChild(o); }
                // 绑定按钮事件（避开 setTimeout 回调中断问题）
                var _tStart = document.getElementById('lvscStartTalismanBtn');
                if (_tStart) _tStart.onclick = autoTalismanLoop;
                var _tStop = document.getElementById('lvscStopTalismanBtn');
                if (_tStop) _tStop.onclick = stopTalisman;
            })();

            // 高级冥想夏季选项——绑定 onchange
            (function() {
                var scb = document.getElementById('lvscSummerOnlyAdvancedMeditate');
                if (scb) {
                    scb.onchange = function() {
                        state.summerOnlyAdvMeditate = this.checked;
                        persistSetting('lvSpiritCleaner.summerOnlyAdvMeditate', this.checked ? '1' : '0');
                    };
                }
            })();

            // ---------- 已开启功能摘要 → explore tab ----------
            (function() {
                window._renderAutoStatus = function() {
                    var td = document.getElementById('lvscAutoStatusTags'); if (!td) return;
                    var items = [];
                    var add = function(cond, name) { if (cond) items.push(name); };
                    add(state.autoMeditate, '自动冥想');
                    add(state.autoHireCheapest, '自动护道');
                    add(state.noMasterProtector, '不用师父护道');
                    add(state.autoMerchantLegend, '传奇商人');
                    add(state.autoSelfFightWeak, '自战弱者');
                    add(state.noCrossRealmFight, '不越阶战斗(≤' + (state.noCrossRealmGap||0) + ')');
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
                    add(state.nirvanaAutoTimer, '涅槃丹定时');
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
                window._renderRunningMonitors = function() {
                    var md = document.getElementById('lvscRunningMonitors'); if (!md) return;
                    var items = [];
                    if (typeof autoFarmRunning !== 'undefined' && autoFarmRunning) items.push('灵田');
                    if (typeof autoSweepRunning !== 'undefined' && autoSweepRunning) items.push('扫荡');
                    if (typeof autoPavilionRunning !== 'undefined' && autoPavilionRunning) items.push('珍宝阁');
                    if (typeof autoTalismanRunning !== 'undefined' && autoTalismanRunning) items.push('批量用符');
                    if (typeof autoInscriptionRunning !== 'undefined' && autoInscriptionRunning) items.push('铭文洗练');
                    if (typeof autoCraftRunning !== 'undefined' && autoCraftRunning) items.push('炼制');
                    if (typeof autoWashStoneUpgradeRunning !== 'undefined' && autoWashStoneUpgradeRunning) items.push('洗炼石升品');
                    else if (localStorage.getItem('lvSpiritCleaner.washStoneUpgradeRunning') === '1') items.push('洗炼石升品');
                    if (typeof autoTreasureRunning !== 'undefined' && autoTreasureRunning) items.push('藏宝图');
                    if (typeof autoDisposeRunning !== 'undefined' && autoDisposeRunning) items.push('出售&分解');
                    if (state.autoMaintainLuck) items.push('维持气运');
                    if (typeof autoTrialRunning !== 'undefined' && autoTrialRunning) items.push('试练塔');
                    if (typeof autoMysteryBoxRunning !== 'undefined' && autoMysteryBoxRunning) items.push('秘匣');
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
                    lvscMysteryBoxStartBtn:'manual',
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
                if (fExpC) { fExpC.checked = state.farmExpandEnabled; fExpC.onchange = function() { state.farmExpandEnabled = this.checked; persistSetting('lvSpiritCleaner.farmExpandEnabled', this.checked ? '1' : '0'); }; }
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
                // 配置导入导出按钮绑定
                var expBtn = document.getElementById('lvscExportConfigBtn');
                var impBtn = document.getElementById('lvscImportConfigBtn');
                if (expBtn) expBtn.onclick = exportConfig;
                if (impBtn) impBtn.onclick = importConfig;

            setTimeout(refreshPavilionItems, 2000);

                // 批量用符（已在UI创建时绑定）

                // 气运/突破/本源/出售
                var ml = document.getElementById('lvscMinLuck'); if (ml) { ml.value = state.minLuck; ml.onchange = function() { state.minLuck = Math.max(1, Math.min(10, Number(this.value)||5)); persistSetting('lvSpiritCleaner.minLuck', String(state.minLuck)); }; }
                var lm = document.getElementById('lvscLuckRefreshMethod'); if (lm) { lm.value = state.luckRefreshMethod || 'stone'; lm.onchange = function() { state.luckRefreshMethod = this.value; persistSetting('lvSpiritCleaner.luckRefreshMethod', this.value); }; }
                var luckChk = document.getElementById('lvscAutoMaintainLuck'); if (luckChk) { luckChk.checked = state.autoMaintainLuck; luckChk.onchange = function() { state.autoMaintainLuck = this.checked; persistSetting('lvSpiritCleaner.autoMaintainLuck', this.checked); }; }
                updateLuckDisplay();
                // 探索模式
                var upgInterval = document.getElementById('lvscWashStoneMonitorInterval');
                var pillInterval = document.getElementById('lvscPillUpgradeMonitorInterval');
                if (pillInterval) { pillInterval.value = String(state.pillUpgradeMonitorInterval || 30); pillInterval.onchange = function() { state.pillUpgradeMonitorInterval = Math.max(10, Number(this.value) || 30); persistSetting('lvSpiritCleaner.pillUpgradeMonitorInterval', String(state.pillUpgradeMonitorInterval)); }; }
                var pillStart = document.getElementById('lvscPillUpgradeStartBtn');
                if (pillStart) pillStart.onclick = autoUpgradePillsLoop;
                var pillStop = document.getElementById('lvscPillUpgradeStopBtn');
                if (pillStop) pillStop.onclick = stopPillUpgrade;
                if (upgInterval) { upgInterval.value = String(state.washStoneMonitorInterval || 30); upgInterval.onchange = function() { state.washStoneMonitorInterval = Math.max(10, Number(this.value) || 30); persistSetting('lvSpiritCleaner.washStoneMonitorInterval', String(state.washStoneMonitorInterval)); }; }
                var upgStart = document.getElementById('lvscWashStoneUpgradeStartBtn');
                if (upgStart) upgStart.onclick = autoUpgradeWashStonesLoop;
                var upgStop = document.getElementById('lvscWashStoneUpgradeStopBtn');
                if (upgStop) upgStop.onclick = stopWashStoneUpgrade;
                var emApi = document.getElementById('lvscExploreModeApi');
                var emSys = document.getElementById('lvscExploreModeSystem');
                if (emApi) { emApi.checked = state.exploreMode === 'api'; emApi.onchange = function() { if (this.checked) { state.exploreMode = 'api'; persistSetting('lvSpiritCleaner.exploreMode', 'api'); } }; }
                if (emSys) { emSys.checked = state.exploreMode === 'system'; emSys.onchange = function() { if (this.checked) { state.exploreMode = 'system'; persistSetting('lvSpiritCleaner.exploreMode', 'system'); } }; }
                var ag = document.getElementById('lvscAggressiveMode');
                if (ag) { ag.checked = state.aggressiveMode; ag.onchange = function() { state.aggressiveMode = this.checked; persistSetting('lvSpiritCleaner.aggressiveMode', this.checked); }; }
                var sumCb = document.getElementById('lvscSummerOnlyAdvancedMeditate');
                if (sumCb) { sumCb.checked = state.summerOnlyAdvancedMeditate; sumCb.onchange = function() { state.summerOnlyAdvancedMeditate = this.checked; persistSetting('lvSpiritCleaner.summerOnlyAdvancedMeditate', this.checked); }; }
                var bt = document.getElementById('lvscAutoBreakthrough'); if (bt) { bt.checked = state.autoBreakthrough; bt.onchange = function() { state.autoBreakthrough = this.checked; persistSetting('lvSpiritCleaner.autoBreakthrough', this.checked); }; }
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
                if (typeof autoPillUpgradeRunning !== 'undefined' && autoPillUpgradeRunning) items.push('丹药升阶');
                else if (localStorage.getItem('lvSpiritCleaner.pillUpgradeRunning') === '1') items.push('丹药升阶');

var nirvRarity = document.getElementById('lvscNirvanaRarity');
if (nirvRarity) { nirvRarity.value = String(state.nirvanaRarity || 3); nirvRarity.onchange = function() { state.nirvanaRarity = Number(this.value); persistSetting('lvSpiritCleaner.nirvanaRarity', String(state.nirvanaRarity)); }; }
var nirvBatchSize = document.getElementById('lvscNirvanaBatchSize');
if (nirvBatchSize) { nirvBatchSize.value = state.nirvanaBatchSize || 10; nirvBatchSize.onchange = function() { state.nirvanaBatchSize = Math.max(1, Number(this.value)||10); persistSetting('lvSpiritCleaner.nirvanaBatchSize', String(state.nirvanaBatchSize)); }; }
var nirvQualityCount = document.getElementById('lvscNirvanaQualityCount');
if (nirvQualityCount) { nirvQualityCount.value = state.nirvanaQualityCount || 10; nirvQualityCount.onchange = function() { state.nirvanaQualityCount = Math.max(1, Number(this.value)||10); persistSetting('lvSpiritCleaner.nirvanaQualityCount', String(state.nirvanaQualityCount)); }; }
var nirvAutoTimer = document.getElementById('lvscNirvanaAutoTimer');
if (nirvAutoTimer) { nirvAutoTimer.checked = state.nirvanaAutoTimer; nirvAutoTimer.onchange = function() { state.nirvanaAutoTimer = this.checked; persistSetting('lvSpiritCleaner.nirvanaAutoTimer', this.checked); if (this.checked) { updateNextAutoNirvanaTime(); startAutoNirvanaTimer(); } }; }
var nirvTimerMin = document.getElementById('lvscNirvanaTimerMin');
if (nirvTimerMin) { nirvTimerMin.value = state.nirvanaTimerMin || 10; nirvTimerMin.onchange = function() { state.nirvanaTimerMin = Math.max(1, Number(this.value)||10); persistSetting('lvSpiritCleaner.nirvanaTimerMin', String(state.nirvanaTimerMin)); if (state.nirvanaAutoTimer) updateNextAutoNirvanaTime(); }; }
// 定时炼制倒计时
setInterval(function() {
    var cdEl = document.getElementById('lvscNirvanaCountdown');
    if (!cdEl) return;
    if (!state.nirvanaAutoTimer || !state.nirvanaNextTimerTime) {
        cdEl.textContent = '';
        return;
    }
    var now = Date.now();
    var remain = state.nirvanaNextTimerTime - now;
    if (remain <= 0) {
        var reason = '';
        if (autoNirvanaRunning) reason = '炼制已在运行';
        else if (running) reason = '清理运行中';
        else reason = '即将执行...';
        cdEl.textContent = reason;
        setTimeout(function() { if (cdEl) cdEl.textContent = '即将执行...'; }, 3000);
        return;
    }
    var totalSec = Math.ceil(remain / 1000);
    var min = Math.floor(totalSec / 60);
    var sec = totalSec % 60;
    cdEl.textContent = '(' + min + '分' + (sec < 10 ? '0' : '') + sec + '秒后执行)';
}, 1000);

                // 扫荡
                var swStart = document.getElementById('lvscSweepStartBtn');
                if (swStart) swStart.onclick = function() { this.style.display = 'none'; document.getElementById('lvscSweepStopBtn').style.display = ''; autoSweepLoop(); };
                var swStop = document.getElementById('lvscSweepStopBtn'); if (swStop) swStop.onclick = stopSweep;
            }, 100);
    })();} catch(e) { console.warn('feature injection err', e); }

    // 初始化动态创建的checkbox
    var originRepairCb = document.getElementById('lvscAutoOriginRepair');
    if (originRepairCb) {
        originRepairCb.checked = state.autoOriginRepair;
        originRepairCb.onchange = function() {
            state.autoOriginRepair = this.checked;
            persistSetting('lvSpiritCleaner.autoOriginRepair', this.checked);
        };
    }
    // 折叠功能初始化（同步执行，不会被重刷覆盖）
try{document.querySelectorAll('.lvsc-section-title-row').forEach(function(r){r.style.cursor='pointer';r.onclick=function(ev){if(ev.target.closest('label,input,button,select'))return;var cp=this.classList.toggle('lvsc-title-collapsed');try{localStorage.setItem('lvscCS_'+this.textContent.trim(),cp?'1':'0')}catch(_){};if(!this.classList.contains('lvsc-big-cat-title-row')){var el=this.nextElementSibling;while(el&&!el.classList.contains('lvsc-section-title-row')){if(cp)el.classList.add('lvsc-section-content-hidden');else el.classList.remove('lvsc-section-content-hidden');el=el.nextElementSibling}}};var v=localStorage.getItem('lvscCS_'+r.textContent.trim());if(v!=='0'){r.classList.add('lvsc-title-collapsed');if(!r.classList.contains('lvsc-big-cat-title-row')){var el=r.nextElementSibling;while(el&&!el.classList.contains('lvsc-section-title-row')){el.classList.add('lvsc-section-content-hidden');el=el.nextElementSibling}}}})}catch(e){}
    // 全部展开/折叠按钮
    var _expandAll = document.getElementById('lvscExpandAll');
    var _collapseAll = document.getElementById('lvscCollapseAll');
    if (_expandAll) _expandAll.onclick = function() {
        document.querySelectorAll('.lvsc-section-title-row').forEach(function(r) {
            r.classList.remove('lvsc-title-collapsed');
            try { localStorage.setItem('lvscCS_' + r.textContent.trim(), '0'); } catch(_) {}
            if (!r.classList.contains('lvsc-big-cat-title-row')) {
                var el = r.nextElementSibling;
                while (el && !el.classList.contains('lvsc-section-title-row')) {
                    el.classList.remove('lvsc-section-content-hidden');
                    el = el.nextElementSibling;
                }
            }
        });
    };
    if (_collapseAll) _collapseAll.onclick = function() {
        document.querySelectorAll('.lvsc-section-title-row').forEach(function(r) {
            r.classList.add('lvsc-title-collapsed');
            try { localStorage.setItem('lvscCS_' + r.textContent.trim(), '1'); } catch(_) {}
            if (!r.classList.contains('lvsc-big-cat-title-row')) {
                var el = r.nextElementSibling;
                while (el && !el.classList.contains('lvsc-section-title-row')) {
                    el.classList.add('lvsc-section-content-hidden');
                    el = el.nextElementSibling;
                }
            }
        });
    };
        var _searchInput = document.getElementById('lvscSearchFunc');
    if (_searchInput) {
        _searchInput.addEventListener('input', function() {
            var q = this.value.trim().toLowerCase();
            // 清除上一次搜索的隐藏标记 + 清除折叠class（只动class，不动 inline style）
            document.querySelectorAll('.lvsc-search-hidden').forEach(function(el) { el.classList.remove('lvsc-search-hidden'); });
            document.querySelectorAll('.lvsc-section-title-row').forEach(function(r) {
                r.classList.remove('lvsc-title-collapsed');
                if (!r.classList.contains('lvsc-big-cat-title-row')) {
                    var el = r.nextElementSibling;
                    while (el && !el.classList.contains('lvsc-section-title-row')) {
                        el.classList.remove('lvsc-section-content-hidden');
                        el = el.nextElementSibling;
                    }
                }
            });
            if (q) {
                // 按区块文字匹配（标题行 + 内容区所有文字，big-cat 也要收内容）
                document.querySelectorAll('.lvsc-section-title-row').forEach(function(r) {
                    var blockText = r.textContent || '';
                    var el = r.nextElementSibling;
                    while (el && !el.classList.contains('lvsc-section-title-row')) {
                        blockText += ' ' + (el.textContent || '');
                        el = el.nextElementSibling;
                    }
                    if (blockText.toLowerCase().indexOf(q) === -1) {
                        r.classList.add('lvsc-search-hidden');
                        var el2 = r.nextElementSibling;
                        while (el2 && !el2.classList.contains('lvsc-section-title-row')) {
                            el2.classList.add('lvsc-search-hidden');
                            el2 = el2.nextElementSibling;
                        }
                    }
                });
                // 修正 big-cat：有可见子标题的把已隐藏的 big-cat 重新显示出来
                document.querySelectorAll('.lvsc-section-title-row.lvsc-big-cat-title-row').forEach(function(bigCat) {
                    if (!bigCat.classList.contains('lvsc-search-hidden')) return;
                    var anyVisible = false;
                    var el = bigCat.nextElementSibling;
                    while (el && !el.classList.contains('lvsc-big-cat-title-row')) {
                        if (el.classList.contains('lvsc-section-title-row') && !el.classList.contains('lvsc-search-hidden')) {
                            anyVisible = true;
                            break;
                        }
                        el = el.nextElementSibling;
                    }
                    if (anyVisible) bigCat.classList.remove('lvsc-search-hidden');
                });
            } else {
                // 清空搜索：清除所有搜索隐藏标记，恢复折叠状态
                document.querySelectorAll('.lvsc-search-hidden').forEach(function(el) { el.classList.remove('lvsc-search-hidden'); });
                document.querySelectorAll('.lvsc-section-title-row').forEach(function(r) {
                    var v = localStorage.getItem('lvscCS_' + r.textContent.trim());
                    if (v !== '0') {
                        r.classList.add('lvsc-title-collapsed');
                        if (!r.classList.contains('lvsc-big-cat-title-row')) {
                            var el = r.nextElementSibling;
                            while (el && !el.classList.contains('lvsc-section-title-row')) {
                                el.classList.add('lvsc-section-content-hidden');
                                el = el.nextElementSibling;
                            }
                        }
                    }
                });
            }
        });
    }
}
    // 登录页防无限循环：上次刷新在30秒内的跳过自动刷新
    if (location.pathname === '/' || location.pathname === '') {
        var _pageReload = Number(sessionStorage.getItem('lvscReloadGuard')) || 0;
        if (_pageReload > 0 && Date.now() - _pageReload < 30000) {
            var _rm = Number(localStorage.getItem('lvSpiritCleaner.autoReloadMin')) || 0;
            console.warn('[LingVerse] 登录页距上次刷新不足30秒，跳过自动刷新');
        } else {
            sessionStorage.setItem('lvscReloadGuard', String(Date.now()));
        }
    }
    function stopAllAuto() {
        autoCraftRunning = false;
        autoDisposeRunning = false;
        autoFarmRunning = false;
        autoPavilionRunning = false;
        autoSweepRunning = false;
        autoTalismanRunning = false;
        autoSkillWashRunning = false;
        autoWashStoneUpgradeRunning = false;
        autoNirvanaRunning = false;
        autoInscriptionRunning = false;
        try { localStorage.setItem('lvSpiritCleaner.farmRunning', '0'); } catch (_) {}
        try { localStorage.setItem('lvSpiritCleaner.disposeRunning', '0'); } catch (_) {}
    }
    function waitForGame() {
        if (document.body && (window.api || window._lastPlayerData || document.getElementById('exploreBtn') || location.pathname === '/' || location.pathname === '' || location.pathname === '/game.html')) {
                        try { buildPanel(); } catch (err) { console.warn('[LingVerse] 面板加载失败，2秒后重试:', err); setTimeout(waitForGame, 2000); return; }
            // ★ 强制兜底恢复：无论 buildPanel 内部是否中断，这里直接通过 localStorage 强制设置
            try {
                var _deCb = document.getElementById('lvscAutoDisposeEnabled');
                if (_deCb) _deCb.checked = localStorage.getItem('lvSpiritCleaner.autoDisposeEnabled') === '1';
                var _synCb = document.getElementById('lvscAutoSynthesize');
                if (_synCb) _synCb.checked = localStorage.getItem('lvSpiritCleaner.autoSynthesize') === '1';
                var _deIntv = document.getElementById('lvscAutoDisposeInterval');
                if (_deIntv) _deIntv.value = state.autoDisposeInterval || 300;
            } catch(_) {}
            // ★ 强制兜底恢复："其他"分类全部事件绑定（防止 buildPanel 内部异常导致丢失）
            try {
                // 自动收徒
                var _rCb = document.getElementById('lvscAutoRecruit');
                if (_rCb) { _rCb.checked = state.autoRecruit; _rCb.onchange = function() { state.autoRecruit = this.checked; persistSetting('lvSpiritCleaner.autoRecruit', this.checked); }; }
                var _rIntv = document.getElementById('lvscRecruitIntervalMs');
                if (_rIntv) { _rIntv.value = state.recruitIntervalMs || 3000; _rIntv.onchange = function() { state.recruitIntervalMs = Math.max(500, Number(this.value)||3000); persistSetting('lvSpiritCleaner.recruitIntervalMs', String(state.recruitIntervalMs)); }; }
                var _rBtn = document.getElementById('lvscRecruitBtn');
                if (_rBtn) _rBtn.onclick = handleChatMessagesBatch;
                // 月卡
                var _mc = document.getElementById('lvscAutoMonthlyCard');
                if (_mc) { _mc.checked = state.autoMonthlyCard; _mc.onchange = function() { state.autoMonthlyCard = this.checked; persistSetting('lvSpiritCleaner.autoMonthlyCard', this.checked); }; }
                // 突破 & 本源
                var _bt = document.getElementById('lvscAutoBreakthrough');
                if (_bt) { _bt.checked = state.autoBreakthrough; _bt.onchange = function() { state.autoBreakthrough = this.checked; persistSetting('lvSpiritCleaner.autoBreakthrough', this.checked); }; }
                var _or = document.getElementById('lvscAutoOriginRepair');
                if (_or) { _or.checked = state.autoOriginRepair; _or.onchange = function() { state.autoOriginRepair = this.checked; persistSetting('lvSpiritCleaner.autoOriginRepair', this.checked); }; }
                // 系统自带探索模式
                var _emApi = document.getElementById('lvscExploreModeApi');
                var _emSys = document.getElementById('lvscExploreModeSystem');
                if (_emApi) { _emApi.checked = state.exploreMode === 'api'; _emApi.onchange = function() { if (this.checked) { state.exploreMode = 'api'; persistSetting('lvSpiritCleaner.exploreMode', 'api'); } }; }
                if (_emSys) { _emSys.checked = state.exploreMode === 'system'; _emSys.onchange = function() { if (this.checked) { state.exploreMode = 'system'; persistSetting('lvSpiritCleaner.exploreMode', 'system'); } }; }
                // 珍宝阁
                var _pi = document.getElementById('lvscPavilionItem');
                if (_pi) _pi.onchange = function() { state.pavilionItemId = this.value; state.pavilionItemName = this.options[this.selectedIndex].textContent || ''; persistSetting('lvSpiritCleaner.pavilionItemId', state.pavilionItemId); persistSetting('lvSpiritCleaner.pavilionItemName', state.pavilionItemName); };
                var _pr = document.getElementById('lvscRefreshPavilion'); if (_pr) _pr.onclick = refreshPavilionItems;
                var _pq = document.getElementById('lvscPavilionQty'); if (_pq) { _pq.value = String(state.pavilionQty); _pq.onchange = function() { state.pavilionQty = Math.max(1, Number(this.value)||99); persistSetting('lvSpiritCleaner.pavilionQty', String(state.pavilionQty)); }; }
                var _pl = document.getElementById('lvscPavilionLoop'); if (_pl) { _pl.value = String(state.pavilionLoop); _pl.onchange = function() { state.pavilionLoop = Math.max(1, Number(this.value)||10); persistSetting('lvSpiritCleaner.pavilionLoop', String(state.pavilionLoop)); }; }
                var _pd = document.getElementById('lvscPavilionDelay'); if (_pd) { _pd.value = String(state.pavilionDelay); _pd.onchange = function() { state.pavilionDelay = Math.max(100, Number(this.value)||500); persistSetting('lvSpiritCleaner.pavilionDelay', String(state.pavilionDelay)); }; }
                var _ps = document.getElementById('lvscAutoPavilionBtn');
                if (_ps) _ps.onclick = function() { if (typeof autoPavilionRunning !== 'undefined' && autoPavilionRunning) return; this.style.display = 'none'; var s = document.getElementById('lvscStopPavilionBtn'); if (s) s.style.display = ''; autoPavilionLoop().finally(function() { var b = document.getElementById('lvscAutoPavilionBtn'); var s = document.getElementById('lvscStopPavilionBtn'); if (b) b.style.display = ''; if (s) s.style.display = 'none'; }); };
                var _pst = document.getElementById('lvscStopPavilionBtn'); if (_pst) _pst.onclick = stopPavilion;
                // 扫荡
                var _ss = document.getElementById('lvscSweepStartBtn');
                if (_ss) _ss.onclick = function() { this.style.display = 'none'; var s = document.getElementById('lvscSweepStopBtn'); if (s) s.style.display = ''; autoSweepLoop(); };
                var _sst = document.getElementById('lvscSweepStopBtn'); if (_sst) _sst.onclick = stopSweep;
                // 自动登录
                var _le = document.getElementById('lvscAutoLoginEmail');
                var _lp = document.getElementById('lvscAutoLoginPassword');
                var _len = document.getElementById('lvscAutoLoginEnabled');
                if (_le) { _le.value = localStorage.getItem('lvSpiritCleaner.autoLoginEmail') || ''; _le.onchange = function() { localStorage.setItem('lvSpiritCleaner.autoLoginEmail', this.value || ''); }; }
                if (_lp) { _lp.value = localStorage.getItem('lvSpiritCleaner.autoLoginPassword') || ''; _lp.onchange = function() { localStorage.setItem('lvSpiritCleaner.autoLoginPassword', this.value || ''); }; }
                if (_len) { _len.checked = localStorage.getItem('lvSpiritCleaner.autoLoginEnabled') === '1'; _len.onchange = function() { localStorage.setItem('lvSpiritCleaner.autoLoginEnabled', this.checked ? '1' : '0'); }; }
                // 配置导入导出按钮 —— 匿名自包含
                var _expB = document.getElementById('lvscExportConfigBtn');
                var _impB = document.getElementById('lvscImportConfigBtn');
                if (_expB) _expB.onclick = function() {
                    try{var c={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf('lvSpiritCleaner.')===0&&k.indexOf('autoLoginEmail')===-1&&k.indexOf('autoLoginPassword')===-1)c[k]=localStorage.getItem(k)}var b=new Blob([JSON.stringify(c,null,2)],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='lingverse-config-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(a.href);}catch(e){alert('导出失败:'+e.message)}
                };
                if (_impB) _impB.onclick = function() {
                    try{var inp=document.createElement('input');inp.type='file';inp.accept='.json';inp.onchange=function(){var f=this.files[0];if(!f)return;var r=new FileReader();r.onload=function(){try{var d=JSON.parse(r.result);var cnt=0;for(var k in d){if(k.indexOf('autoLoginEmail')!==-1||k.indexOf('autoLoginPassword')!==-1)continue;try{localStorage.setItem(k,d[k]);cnt++}catch(e){}}alert('导入了 '+cnt+' 项配置');location.reload();}catch(e){alert('导入失败:'+e.message)}};r.readAsText(f)};inp.click();}catch(e){alert('导入失败:'+e.message)}
                };
            } catch(_) {}
            // 灵田种子兜底刷新（确保刷新按钮和种子下拉始终可用）
            setTimeout(function() {
                var fsRef = document.getElementById('lvscRefreshFarm');
                if (fsRef) fsRef.onclick = async function() {
                    var sel = document.getElementById('lvscFarmSeed'); if (!sel) return;
                    sel.innerHTML = '<option value="">加载中...</option>';
                    var data = await farmOverview();
                    sel.innerHTML = '<option value="">选择种子</option>';
                    if (data && data.seeds) for (var fi = 0; fi < data.seeds.length; fi++) { var s = data.seeds[fi]; if (s.seedId) sel.innerHTML += '<option value="' + s.seedId + '"' + (state.farmSeedId === s.seedId ? ' selected' : '') + '>' + (s.seedName || s.seedId) + '</option>'; }
                };
                var fSeed = document.getElementById('lvscFarmSeed');
                if (fSeed) fSeed.onchange = function() { state.farmSeedId = this.value; state.farmSeedName = this.options[this.selectedIndex].textContent || ''; persistSetting('lvSpiritCleaner.farmSeedId', state.farmSeedId); persistSetting('lvSpiritCleaner.farmSeedName', state.farmSeedName); };
                var fIntv = document.getElementById('lvscFarmInterval');
                if (fIntv) { fIntv.value = state.farmInterval; fIntv.onchange = function() { state.farmInterval = Math.max(5, Number(this.value)||30); persistSetting('lvSpiritCleaner.farmInterval', String(state.farmInterval)); }; }
                var fHarv = document.getElementById('lvscFarmAutoHarvest');
                if (fHarv) { fHarv.checked = state.farmAutoHarvest; fHarv.onchange = function() { state.farmAutoHarvest = this.checked; persistSetting('lvSpiritCleaner.farmAutoHarvest', this.checked); }; }
                var fPlant = document.getElementById('lvscFarmAutoPlant');
                if (fPlant) { fPlant.checked = state.farmAutoPlant; fPlant.onchange = function() { state.farmAutoPlant = this.checked; persistSetting('lvSpiritCleaner.farmAutoPlant', this.checked); }; }
                var fExpC = document.getElementById('lvscFarmExpandEn');
                if (fExpC) { fExpC.checked = state.farmExpandEnabled; fExpC.onchange = function() { state.farmExpandEnabled = this.checked; persistSetting('lvSpiritCleaner.farmExpandEnabled', this.checked ? '1' : '0'); }; }
                var fInv = document.getElementById('lvscFarmAutoInvasion');
                if (fInv) { fInv.checked = state.farmAutoInvasion; fInv.onchange = function() { state.farmAutoInvasion = this.checked; persistSetting('lvSpiritCleaner.farmAutoInvasion', this.checked); }; }
                var fStart = document.getElementById('lvscFarmStartBtn');
                if (fStart) fStart.onclick = function() { this.style.display = 'none'; var sb = document.getElementById('lvscFarmStopBtn'); if (sb) sb.style.display = ''; autoFarmLoop(); };
                var fStop = document.getElementById('lvscFarmStopBtn');
                if (fStop) fStop.onclick = function() { stopFarm(); var sb = document.getElementById('lvscFarmStartBtn'); if (sb) sb.style.display = ''; this.style.display = 'none'; };
                // 3秒后自动拉种子列表
                if (fsRef) fsRef.click();
            }, 3000);
            
            // 珍宝阁商品兜底刷新（确保刷新按钮和商品下拉始终可用）
            setTimeout(function() {
                var prRef = document.getElementById('lvscRefreshPavilion');
                if (prRef) prRef.onclick = async function() {
                    var sel = document.getElementById('lvscPavilionItem'); if (!sel) return;
                    sel.innerHTML = '<option value="">加载中...</option>';
                    var items = await fetchPavilionShop();
                    sel.innerHTML = '<option value="">选择商品</option>';
                    for (var pi = 0; pi < items.length; pi++) { var it = items[pi]; var id = String(it.templateId || it.itemId || it.id || ''); var name = it.name || it.itemName || ''; if (id && name) sel.innerHTML += '<option value="' + id + '"' + (state.pavilionItemId === id ? ' selected' : '') + '>' + name + '</option>'; }
                };
                var pItem = document.getElementById('lvscPavilionItem');
                if (pItem) pItem.onchange = function() { state.pavilionItemId = this.value; state.pavilionItemName = this.options[this.selectedIndex].textContent || ''; persistSetting('lvSpiritCleaner.pavilionItemId', state.pavilionItemId); persistSetting('lvSpiritCleaner.pavilionItemName', state.pavilionItemName); };
                var pQty = document.getElementById('lvscPavilionQty'); if (pQty) { pQty.value = String(state.pavilionQty || 99); pQty.onchange = function() { state.pavilionQty = Math.max(1, Number(this.value)||99); persistSetting('lvSpiritCleaner.pavilionQty', String(state.pavilionQty)); }; }
                var pLoop = document.getElementById('lvscPavilionLoop'); if (pLoop) { pLoop.value = String(state.pavilionLoop || 10); pLoop.onchange = function() { state.pavilionLoop = Math.max(1, Number(this.value)||10); persistSetting('lvSpiritCleaner.pavilionLoop', String(state.pavilionLoop)); }; }
                var pDelay = document.getElementById('lvscPavilionDelay'); if (pDelay) { pDelay.value = String(state.pavilionDelay || 500); pDelay.onchange = function() { state.pavilionDelay = Math.max(100, Number(this.value)||500); persistSetting('lvSpiritCleaner.pavilionDelay', String(state.pavilionDelay)); }; }
                var pStart = document.getElementById('lvscAutoPavilionBtn');
                if (pStart) pStart.onclick = function() { if (autoPavilionRunning) return; this.style.display = 'none'; document.getElementById('lvscStopPavilionBtn').style.display = ''; autoPavilionLoop().finally(function() { document.getElementById('lvscAutoPavilionBtn').style.display = ''; document.getElementById('lvscStopPavilionBtn').style.display = 'none'; }); };
                var pStop = document.getElementById('lvscStopPavilionBtn'); if (pStop) pStop.onclick = stopPavilion;
                // 3秒后自动拉商品列表
                if (prRef) prRef.click();
            }, 3500);
            
            // 试练塔扫荡兜底（确保开始/停止按钮始终可用）
            setTimeout(function() {
                var _ss = document.getElementById('lvscSweepStartBtn');
                if (_ss) _ss.onclick = function() { this.style.display = 'none'; var s = document.getElementById('lvscSweepStopBtn'); if (s) s.style.display = ''; autoSweepLoop(); };
                var _sst = document.getElementById('lvscSweepStopBtn'); if (_sst) _sst.onclick = stopSweep;
            }, 3600);
            // 刷新后自动恢复运行状态（冥想中不打断，转监测等收功）
            var wasRunning = localStorage.getItem('lvSpiritCleaner.wasRunning') === '1';
            var wasMonitoring = localStorage.getItem('lvSpiritCleaner.monitoringSpirit') === '1';
            startAutoPetHealTimer();
            if (wasMonitoring) { setTimeout(function() { monitorSpiritLoop(); }, 1000); }
            if (wasRunning && !running) {
                setTimeout(function() {
                    var p = getPlayer() || {};
                    if (p.isMeditating) {
                        setStatus('刷新检测：冥想中，转入监测', 'run');
                        monitorSpiritLoop();
                        return;
                    }
                    if (state.exploreMode === 'system') { systemExploreLoop(); }
                    else { runLoop(); }
                }, 2000);
            }
            // === 刷新后自启（记忆模式：刷新前运行 → 刷新后自动恢复）===
            if (localStorage.getItem('lvSpiritCleaner.farmRunning') === '1') {
                setTimeout(function() {
                    autoFarmLoop();
                    var fb = document.getElementById('lvscFarmStartBtn'); if (fb) fb.style.display = 'none';
                    var fs = document.getElementById('lvscFarmStopBtn'); if (fs) fs.style.display = '';
                }, 3000);
            }
            if (localStorage.getItem('lvSpiritCleaner.disposeRunning') === '1') {
                setTimeout(function() { var db = document.getElementById('lvscDisposeStartBtn'); if (db) db.click(); }, 5000);
            }
if (localStorage.getItem('lvSpiritCleaner.washStoneUpgradeRunning') === '1') {
    setTimeout(function() { autoUpgradeWashStonesLoop(); }, 4000);
}
if (localStorage.getItem('lvSpiritCleaner.pillUpgradeRunning') === '1') {
    setTimeout(function() { autoUpgradePillsLoop(); }, 5000);
}
if (localStorage.getItem('lvSpiritCleaner.nirvanaAutoTimer') === '1' && state.nirvanaAutoTimer) {
    setTimeout(function() { updateNextAutoNirvanaTime(); startAutoNirvanaTimer(); }, 2000);
}
if (localStorage.getItem('lvSpiritCleaner.craftAutoTimer') === '1' && state.craftAutoTimer) {
    setTimeout(function() { startAutoCraftTimer(); }, 2000);
}
// === 自动刷新（登录页且启用自动登录时禁用）===
var _reloadMin = Number(localStorage.getItem('lvSpiritCleaner.autoReloadMin')) || 0;
// 登录页 → 允许自动刷新
if (_reloadMin > 0) {
                var _lastReload = Number(localStorage.getItem('lvSpiritCleaner.lastReloadTime')) || 0;
                var _now = Date.now();
                if (_lastReload === 0) {
                    localStorage.setItem('lvSpiritCleaner.lastReloadTime', String(_now));
                } else if (_now - _lastReload > _reloadMin * 60 * 1000) {
                    localStorage.setItem('lvSpiritCleaner.lastReloadTime', String(_now));
                    var _rn = (getPlayer() || {}).name || '';
                    var _rs = getPlayerRealmStr();
                    wecomEnqueue('🔄 自动刷新', '角色：' + _rn + '\n境界：' + _rs + '\n间隔：' + _reloadMin + '分钟\n3秒后刷新页面');
                    setTimeout(function() { location.reload(); }, 3000);
                }
            }
            // 倒计时更新
            var _cdEl = document.getElementById('lvscReloadCountdown');
            if (_cdEl) {
(function triggerReload() {
    var min = Number(localStorage.getItem('lvSpiritCleaner.autoReloadMin')) || 0;
    if (min <= 0) { _cdEl.textContent = '已关闭自动刷新'; return; }
    var last = Number(localStorage.getItem('lvSpiritCleaner.lastReloadTime')) || 0;
    if (last === 0) { _cdEl.textContent = '等待首次计时...'; return; }
                    var remain = last + min * 60 * 1000 - Date.now();
                    if (remain <= 0) {
                        localStorage.setItem('lvSpiritCleaner.lastReloadTime', String(Date.now()));
                        _cdEl.textContent = '正在刷新...';
                        var _rn2 = (getPlayer() || {}).name || '';
                        var _rs2 = getPlayerRealmStr();
                        wecomEnqueue('🔄 自动刷新', '角色：' + _rn2 + '\n境界：' + _rs2 + '\n间隔：' + min + '分钟\n正在刷新页面');
                        location.reload();
                        return;
                    }
                    var ts = Math.ceil(remain / 1000);
                    _cdEl.textContent = ' ' + Math.floor(ts / 60) + '分' + (ts % 60) + '秒';
                })();
setInterval(function() {
    var min = Number(localStorage.getItem('lvSpiritCleaner.autoReloadMin')) || 0;
    if (min <= 0) { _cdEl.textContent = '已关闭自动刷新'; return; }
    var last = Number(localStorage.getItem('lvSpiritCleaner.lastReloadTime')) || 0;
    if (last === 0) { _cdEl.textContent = '等待首次计时...'; return; }
                    var remain = last + min * 60 * 1000 - Date.now();
                    if (remain <= 0) {
                        localStorage.setItem('lvSpiritCleaner.lastReloadTime', String(Date.now()));
                        _cdEl.textContent = '正在刷新...';
                        var _rn3 = (getPlayer() || {}).name || '';
                        var _rs3 = getPlayerRealmStr();
                        wecomEnqueue('🔄 自动刷新', '角色：' + _rn3 + '\n境界：' + _rs3 + '\n间隔：' + min + '分钟\n正在刷新页面');
                        location.reload();
                        return;
                    }
                    var ts = Math.ceil(remain / 1000);
                    _cdEl.textContent = ' ' + Math.floor(ts / 60) + '分' + (ts % 60) + '秒';
                }, 1000);
            }
            return;
        }
        setTimeout(waitForGame, 800);
    }

    waitForGame();
    // 导出/导入按钮永久保底（每3秒检查一次，DOM重建后自动重新绑定）
    setInterval(function() {
        var eb = document.getElementById('lvscExportConfigBtn');
        var ib = document.getElementById('lvscImportConfigBtn');
        if (eb && !eb._bound) {
            eb._bound = true;
            eb.onclick = function() {
                try{var c={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf('lvSpiritCleaner.')===0&&k.indexOf('autoLoginEmail')===-1&&k.indexOf('autoLoginPassword')===-1)c[k]=localStorage.getItem(k)}var b=new Blob([JSON.stringify(c,null,2)],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='lingverse-config-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(a.href);}catch(e){alert('导出失败:'+e.message)}
            };
        }
        if (ib && !ib._bound) {
            ib._bound = true;
            ib.onclick = function() {
                try{var inp=document.createElement('input');inp.type='file';inp.accept='.json';inp.onchange=function(){var f=this.files[0];if(!f)return;var r=new FileReader();r.onload=function(){try{var d=JSON.parse(r.result);var cnt=0;for(var k in d){if(k.indexOf('autoLoginEmail')!==-1||k.indexOf('autoLoginPassword')!==-1)continue;try{localStorage.setItem(k,d[k]);cnt++}catch(e){}}alert('导入了 '+cnt+' 项配置');location.reload();}catch(e){alert('导入失败:'+e.message)}};r.readAsText(f)};inp.click();}catch(e){alert('导入失败:'+e.message)}
            };
        }
    }, 3000);
})();
`;

    var script = document.createElement('script');
    script.textContent = source;
    (document.head || document.documentElement).appendChild(script);
        // 独立自动登录：不依赖面板DOM，直接在登录页生效，每2秒重试最多30次
    (function() {
        var loginTries = 0;
        var maxTries = 30;
        var loginTimer = setInterval(function() {
            loginTries++;
            if (loginTries > maxTries) { clearInterval(loginTimer); return; }
            var enabled = localStorage.getItem('lvSpiritCleaner.autoLoginEnabled') === '1';
            if (!enabled) { clearInterval(loginTimer); return; }
            var _lastTry = Number(sessionStorage.getItem('lvscAutoLoginTry')) || 0;
            if (Date.now() - _lastTry < 10000) return;
            var e = localStorage.getItem('lvSpiritCleaner.autoLoginEmail') || '';
            var pw = localStorage.getItem('lvSpiritCleaner.autoLoginPassword') || '';
            if (!e || !pw) return;
            try {
                var ei = document.querySelector('input[placeholder*="道籍邮箱"]:not([id^="lvsc"])');
                var pi = document.querySelector('input[placeholder*="登录密码"]:not([id^="lvsc"])');
                if (!ei) { var ti = Array.prototype.filter.call(document.querySelectorAll('input[type="text"]'), function(el){ return !el.id || !el.id.startsWith('lvsc'); }); if (ti.length) ei = ti[0]; }
                if (!pi) { var pai = Array.prototype.filter.call(document.querySelectorAll('input[type="password"]'), function(el){ return !el.id || !el.id.startsWith('lvsc'); }); if (pai.length) pi = pai[0]; }
                var btn = null; var bs = document.querySelectorAll('button, div[role="button"]');
                for (var i = 0; i < bs.length; i++) { if ((bs[i].textContent||'').indexOf('入世') >= 0) { btn = bs[i]; break; } }
                if (ei && pi && btn) {
                    ei.value = e; pi.value = pw;
                    ei.dispatchEvent(new Event('input', {bubbles:true}));
                    ei.dispatchEvent(new Event('change', {bubbles:true}));
                    pi.dispatchEvent(new Event('input', {bubbles:true}));
                    pi.dispatchEvent(new Event('change', {bubbles:true}));
                    sessionStorage.setItem('lvscAutoLoginTry', String(Date.now()));
                    clearInterval(loginTimer);
                    setTimeout(function() { btn.click(); try { localStorage.setItem('lvSpiritCleaner.lastReloadTime', String(Date.now())); } catch(_) {} }, 600);
                }
            } catch (err) {}
        }, 2000);
    })();
    script.remove();
})();
