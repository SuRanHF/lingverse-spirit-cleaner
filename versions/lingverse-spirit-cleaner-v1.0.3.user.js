// ==UserScript==
// @name         LingVerse Spirit Cleaner
// @namespace    local.lingverse.tools
// @version      1.0.3
// @description  Authorized helper: spend LingVerse spirit, handle merchants, hire protectors, meditate, and maintain Void Body buff.
// @match        https://ling.muge.info/game.html*
// @match        http://ling.muge.info/game.html*
// @homepageURL  https://github.com/SuRanHF/lingverse-spirit-cleaner
// @supportURL   https://github.com/SuRanHF/lingverse-spirit-cleaner/issues
// @updateURL    https://raw.githubusercontent.com/SuRanHF/lingverse-spirit-cleaner/main/lingverse-spirit-cleaner.user.js
// @downloadURL  https://raw.githubusercontent.com/SuRanHF/lingverse-spirit-cleaner/main/lingverse-spirit-cleaner.user.js
// @grant        GM_xmlhttpRequest
// @connect      lingshen.ccwu.cc
// @run-at       document-idle
// ==/UserScript==

(function injectIntoPage() {
    'use strict';

    var ONLINE_BRIDGE_EVENT = 'lvsc:online-heartbeat';
    if (typeof GM_xmlhttpRequest === 'function' && !window.__lvscOnlineBridgeInstalled) {
        window.__lvscOnlineBridgeInstalled = true;
        window.addEventListener(ONLINE_BRIDGE_EVENT, function (event) {
            var detail = {};
            try {
                detail = typeof event.detail === 'string' ? JSON.parse(event.detail) : (event.detail || {});
            } catch (_) {
                detail = {};
            }
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
        });
    }

    var source = String.raw`
(function () {
    'use strict';

    if (window.__lvSpiritCleanerLoaded) return;
    window.__lvSpiritCleanerLoaded = true;

    var running = false;
    var monitoringSpirit = false;
    var autoTrialRunning = false;
    var autoTreasureRunning = false;
    var autoInscriptionRunning = false;
    var loopTimer = null;
    var busyEvent = false;
    var checkingCloudUpdate = false;
    var inscriptionStats = { total: 0, kept: 0, discarded: 0, best: '' };
    var hiddenCharmLastUseAt = 0;
    var HIGH_FEE_CONFIRM_THRESHOLD = 500000;
    var PANEL_Z_INDEX = 2147483000;
    var UPDATE_MODAL_Z_INDEX = 2147483001;
    var SCRIPT_VERSION = '1.0.3';
    var CLOUD_UPDATE_POLL_MS = 60000;
    var CLOUD_UPDATE_REMIND_MS = 300000;
    var ONLINE_HEARTBEAT_MS = 30000;
    var DEFAULT_UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/SuRanHF/lingverse-spirit-cleaner/main/release.json';
    var DEFAULT_ONLINE_STATS_ENDPOINT = 'http://lingshen.ccwu.cc/api/heartbeat';
    var onlineHeartbeatStarted = false;
    var BUILTIN_RELEASE = {
        version: SCRIPT_VERSION,
        title: '神识清理 v' + SCRIPT_VERSION,
        notes: [
            '新增页面不刷新时的云端版本轮询：脚本运行期间每 60 秒检测一次 release.json。',
            '发现 GitHub 上有更高版本时，会自动弹出更新公告和更新地址。',
            '铭文洗练遇到按钮缺失、结果为空、放弃失败、异常、命中目标或达到最大次数时保持运行，改为等待重试或保留结果。',
            '铭文点击改为模拟人工点击，并把等级改为按页面显示文本/数字匹配，避免固定等级表不适配。',
            '铭文新增“命中后自动装配”开关：优先空槽，其次非目标槽，最后替换目标槽最低值。',
            '妖兽自战修复：战力标签已判断可打时直接自战，不再被境界或三围回退逻辑误拦。',
            '脚本面板层级提升到接近浏览器上限，打开游戏铭文页面时不会被页面覆盖。',
            '自动流程新增隐秘符：探索和刷藏宝图前可从背包使用，缺少时尝试按“隐秘符”从坊市购买。',
            '藏宝图和主探索流程的明显暂停点改为等待处理后继续，除非手动点击停止。',
            '自动流程新增“陨落后自动引渡归来”，死亡弹窗出现后可自动复活并继续流程。',
            '自动流程新增“启动前检查道韵加成”，开始清理或刷藏宝图前会确认加成状态。',
            '冥想流程新增“优先仙缘高级冥想”，失败后自动回退普通冥想。',
            '铭文洗练目标改为最低等级、属性、最小数值分开选择，不再需要手写关键词。',
            '藏宝图配置改成“最多用几张 / 一次用几张 / 每次间隔”，并补充说明示例。',
            '新增浏览器通知开关，新版本和铭文命中目标时可弹系统通知。',
            '更新公告和 README 已整理为功能列表、安装、使用、配置、发布和回滚说明。',
            '更新弹窗新增“打开安装页”和“复制更新地址”，安装页会自动携带版本参数，减少 GitHub raw 缓存影响。',
            '云端发现新版本后，如果用户只是关闭提醒但没有更新，脚本会在运行期间定时再次提醒。',
            '妖兽自战改为只按自身战力与妖兽战力数值比较，不再使用战力标签、境界或生命攻击防御兜底。',
            '在线统计改为绑定域名的阿里云 ECS 服务，电脑关机后仍可由云服务器接收心跳。',
            '在线心跳增加油猴跨域请求兜底，并提升版本号，确保同版本缓存不会导致旧脚本继续运行。'
        ]
    };

    var state = {
        reserve: readNumber('lvSpiritCleaner.reserve', 0),
        delayMs: readNumber('lvSpiritCleaner.delayMs', 1200),
        hireRetryLimit: readNumber('lvSpiritCleaner.hireRetryLimit', 2),
        hireMode: localStorage.getItem('lvSpiritCleaner.hireMode') || 'cheapest',
        hireMaxFee: readNumber('lvSpiritCleaner.hireMaxFee', 0),
        keepCurrentMultiplier: localStorage.getItem('lvSpiritCleaner.keepMultiplier') === '1',
        merchantMode: localStorage.getItem('lvSpiritCleaner.merchantMode') || 'legend',
        merchantKeyword: localStorage.getItem('lvSpiritCleaner.merchantKeyword') || '',
        merchantQualityFirst: localStorage.getItem('lvSpiritCleaner.merchantQualityFirst') !== '0',
        merchantMaxPrice: readNumber('lvSpiritCleaner.merchantMaxPrice', 0),
        autoMerchantLegend: localStorage.getItem('lvSpiritCleaner.autoMerchantLegend') !== '0',
        autoHireCheapest: localStorage.getItem('lvSpiritCleaner.autoHireCheapest') !== '0',
        autoMeditate: localStorage.getItem('lvSpiritCleaner.autoMeditate') !== '0',
        autoExploreAfterMeditate: localStorage.getItem('lvSpiritCleaner.autoExploreAfterMeditate') !== '0',
        nightOnlyExplore: localStorage.getItem('lvSpiritCleaner.nightOnlyExplore') === '1',
        autoReviveDeath: localStorage.getItem('lvSpiritCleaner.autoReviveDeath') !== '0',
        checkDaoyunBoost: localStorage.getItem('lvSpiritCleaner.checkDaoyunBoost') !== '0',
        useAdvancedMeditate: localStorage.getItem('lvSpiritCleaner.useAdvancedMeditate') === '1',
        meditateStopSpirit: readNumber('lvSpiritCleaner.meditateStopSpirit', 0),
        inscriptionTargets: localStorage.getItem('lvSpiritCleaner.inscriptionTargets') || '攻击:50,防御:50,气血:100,神识:20',
        inscriptionQuality: localStorage.getItem('lvSpiritCleaner.inscriptionQuality') || 'any',
        inscriptionStat: localStorage.getItem('lvSpiritCleaner.inscriptionStat') || '攻击',
        inscriptionMinValue: readNumber('lvSpiritCleaner.inscriptionMinValue', 50),
        inscriptionStopMode: localStorage.getItem('lvSpiritCleaner.inscriptionStopMode') || 'any',
        inscriptionAutoEquip: localStorage.getItem('lvSpiritCleaner.inscriptionAutoEquip') === '1',
        inscriptionMaxAttempts: readNumber('lvSpiritCleaner.inscriptionMaxAttempts', 0),
        inscriptionResultDelay: readNumber('lvSpiritCleaner.inscriptionResultDelay', 1500),
        inscriptionDiscardDelay: readNumber('lvSpiritCleaner.inscriptionDiscardDelay', 600),
        treasureBatchSize: readNumber('lvSpiritCleaner.treasureBatchSize', 0),
        treasureUseQuantity: readNumber('lvSpiritCleaner.treasureUseQuantity', 1),
        treasureIntervalMs: readNumber('lvSpiritCleaner.treasureIntervalMs', 0),
        desktopNotify: localStorage.getItem('lvSpiritCleaner.desktopNotify') !== '0',
        monitorStartSpirit: readNumber('lvSpiritCleaner.monitorStartSpirit', 0),
        autoSelfFightWeak: localStorage.getItem('lvSpiritCleaner.autoSelfFightWeak') !== '0',
        selfFightMargin: readNumber('lvSpiritCleaner.selfFightMargin', 1.15),
        autoRecoveryMode: localStorage.getItem('lvSpiritCleaner.autoRecoveryMode') || 'both',
        autoRecoveryThreshold: readNumber('lvSpiritCleaner.autoRecoveryThreshold', 80),
        autoRecoveryTarget: readNumber('lvSpiritCleaner.autoRecoveryTarget', 100),
        autoHpPriority: localStorage.getItem('lvSpiritCleaner.autoHpPriority') || 'mp,pill,adpoint',
        autoMpPriority: localStorage.getItem('lvSpiritCleaner.autoMpPriority') || 'stone,pill,adpoint',
        updateManifestUrl: localStorage.getItem('lvSpiritCleaner.updateManifestUrl') || DEFAULT_UPDATE_MANIFEST_URL,
        onlineStatsEndpoint: DEFAULT_ONLINE_STATS_ENDPOINT,
        autoVoidBody: localStorage.getItem('lvSpiritCleaner.autoVoidBody') !== '0',
        voidBodyRarity: readNumber('lvSpiritCleaner.voidBodyRarity', 5),
        voidBodyBuyQty: readNumber('lvSpiritCleaner.voidBodyBuyQty', 1),
        autoHiddenCharm: localStorage.getItem('lvSpiritCleaner.autoHiddenCharm') === '1',
        hiddenCharmRarity: readNumber('lvSpiritCleaner.hiddenCharmRarity', 0),
        hiddenCharmBuyQty: readNumber('lvSpiritCleaner.hiddenCharmBuyQty', 1),
        hiddenCharmRetryMs: readNumber('lvSpiritCleaner.hiddenCharmRetryMs', 60000)
    };

    function readNumber(key, fallback) {
        var value = Number(localStorage.getItem(key));
        return Number.isFinite(value) ? value : fallback;
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
        return {
            clientId: onlineClientId(),
            version: SCRIPT_VERSION,
            page: location.origin + location.pathname,
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

    function setStatus(text, tone) {
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

    function syncSettingsFromUi() {
        var reserveInput = document.getElementById('lvscReserve');
        var delayInput = document.getElementById('lvscDelay');
        var retryInput = document.getElementById('lvscHireRetryLimit');
        var hireModeInput = document.getElementById('lvscHireMode');
        var hireMaxFeeInput = document.getElementById('lvscHireMaxFee');
        var multiplierInput = document.getElementById('lvscKeepMultiplier');
        var merchantInput = document.getElementById('lvscAutoMerchant');
        var merchantModeInput = document.getElementById('lvscMerchantMode');
        var merchantKeywordInput = document.getElementById('lvscMerchantKeyword');
        var merchantQualityInput = document.getElementById('lvscMerchantQualityFirst');
        var merchantMaxPriceInput = document.getElementById('lvscMerchantMaxPrice');
        var hireInput = document.getElementById('lvscAutoHire');
        var meditateInput = document.getElementById('lvscAutoMeditate');
        var exploreAfterMeditateInput = document.getElementById('lvscAutoExploreAfterMeditate');
        var nightOnlyInput = document.getElementById('lvscNightOnlyExplore');
        var reviveDeathInput = document.getElementById('lvscAutoReviveDeath');
        var daoyunBoostInput = document.getElementById('lvscCheckDaoyunBoost');
        var advancedMeditateInput = document.getElementById('lvscUseAdvancedMeditate');
        var meditateStopInput = document.getElementById('lvscMeditateStopSpirit');
        var inscriptionQualityInput = document.getElementById('lvscInscriptionQuality');
        var inscriptionStatInput = document.getElementById('lvscInscriptionStat');
        var inscriptionMinValueInput = document.getElementById('lvscInscriptionMinValue');
        var inscriptionStopModeInput = document.getElementById('lvscInscriptionStopMode');
        var inscriptionAutoEquipInput = document.getElementById('lvscInscriptionAutoEquip');
        var inscriptionMaxAttemptsInput = document.getElementById('lvscInscriptionMaxAttempts');
        var inscriptionResultDelayInput = document.getElementById('lvscInscriptionResultDelay');
        var inscriptionDiscardDelayInput = document.getElementById('lvscInscriptionDiscardDelay');
        var treasureBatchInput = document.getElementById('lvscTreasureBatchSize');
        var treasureQtyInput = document.getElementById('lvscTreasureUseQuantity');
        var treasureIntervalInput = document.getElementById('lvscTreasureIntervalMs');
        var desktopNotifyInput = document.getElementById('lvscDesktopNotify');
        var monitorStartInput = document.getElementById('lvscMonitorStartSpirit');
        var selfFightInput = document.getElementById('lvscAutoSelfFightWeak');
        var selfFightMarginInput = document.getElementById('lvscSelfFightMargin');
        var recoveryModeInput = document.getElementById('lvscAutoRecoveryMode');
        var recoveryThresholdInput = document.getElementById('lvscAutoRecoveryThreshold');
        var recoveryTargetInput = document.getElementById('lvscAutoRecoveryTarget');
        var hpPriorityInput = document.getElementById('lvscAutoHpPriority');
        var mpPriorityInput = document.getElementById('lvscAutoMpPriority');
        var updateManifestInput = document.getElementById('lvscUpdateManifestUrl');
        var voidInput = document.getElementById('lvscAutoVoidBody');
        var voidRarityInput = document.getElementById('lvscVoidRarity');
        var voidQtyInput = document.getElementById('lvscVoidBuyQty');
        var hiddenCharmInput = document.getElementById('lvscAutoHiddenCharm');
        var hiddenCharmRarityInput = document.getElementById('lvscHiddenCharmRarity');
        var hiddenCharmQtyInput = document.getElementById('lvscHiddenCharmBuyQty');
        var hiddenCharmRetryInput = document.getElementById('lvscHiddenCharmRetryMs');

        state.reserve = Math.max(0, Number(reserveInput && reserveInput.value || 0));
        state.delayMs = Math.max(600, Number(delayInput && delayInput.value || 1200));
        state.hireRetryLimit = Math.max(1, Math.min(10, Number(retryInput && retryInput.value || 2)));
        state.hireMode = (hireModeInput && hireModeInput.value) || 'cheapest';
        if (['cheapest', 'together', 'alone'].indexOf(state.hireMode) < 0) state.hireMode = 'cheapest';
        state.hireMaxFee = Math.max(0, Number(hireMaxFeeInput && hireMaxFeeInput.value || 0));
        state.keepCurrentMultiplier = !!(multiplierInput && multiplierInput.checked);
        state.merchantMode = (merchantModeInput && merchantModeInput.value) || 'legend';
        if (['legend', 'custom', 'leave'].indexOf(state.merchantMode) < 0) state.merchantMode = 'legend';
        state.merchantKeyword = String(merchantKeywordInput && merchantKeywordInput.value || '').trim();
        state.merchantQualityFirst = !!(merchantQualityInput && merchantQualityInput.checked);
        state.merchantMaxPrice = Math.max(0, Number(merchantMaxPriceInput && merchantMaxPriceInput.value || 0));
        state.autoMerchantLegend = !!(merchantInput && merchantInput.checked);
        state.autoHireCheapest = !!(hireInput && hireInput.checked);
        state.autoMeditate = !!(meditateInput && meditateInput.checked);
        state.autoExploreAfterMeditate = !!(exploreAfterMeditateInput && exploreAfterMeditateInput.checked);
        state.nightOnlyExplore = !!(nightOnlyInput && nightOnlyInput.checked);
        state.autoReviveDeath = !!(reviveDeathInput && reviveDeathInput.checked);
        state.checkDaoyunBoost = !!(daoyunBoostInput && daoyunBoostInput.checked);
        state.useAdvancedMeditate = !!(advancedMeditateInput && advancedMeditateInput.checked);
        state.meditateStopSpirit = Math.max(0, Number(meditateStopInput && meditateStopInput.value || 0));
        state.inscriptionQuality = String(inscriptionQualityInput && inscriptionQualityInput.value || 'any').trim();
        if (!state.inscriptionQuality || state.inscriptionQuality === '不限') state.inscriptionQuality = 'any';
        state.inscriptionStat = (inscriptionStatInput && inscriptionStatInput.value) || '攻击';
        if (['攻击', '防御', '气血', '神识'].indexOf(state.inscriptionStat) < 0) state.inscriptionStat = '攻击';
        state.inscriptionMinValue = Math.max(0, Number(inscriptionMinValueInput && inscriptionMinValueInput.value || 0));
        state.inscriptionTargets = state.inscriptionStat + ':' + state.inscriptionMinValue;
        state.inscriptionStopMode = (inscriptionStopModeInput && inscriptionStopModeInput.value) || 'any';
        if (['any', 'all', 'manual'].indexOf(state.inscriptionStopMode) < 0) state.inscriptionStopMode = 'any';
        state.inscriptionAutoEquip = !!(inscriptionAutoEquipInput && inscriptionAutoEquipInput.checked);
        state.inscriptionMaxAttempts = Math.max(0, Number(inscriptionMaxAttemptsInput && inscriptionMaxAttemptsInput.value || 0));
        state.inscriptionResultDelay = Math.max(500, Number(inscriptionResultDelayInput && inscriptionResultDelayInput.value || 1500));
        state.inscriptionDiscardDelay = Math.max(300, Number(inscriptionDiscardDelayInput && inscriptionDiscardDelayInput.value || 600));
        state.treasureBatchSize = Math.max(0, Number(treasureBatchInput && treasureBatchInput.value || 0));
        state.treasureUseQuantity = Math.max(1, Number(treasureQtyInput && treasureQtyInput.value || 1));
        state.treasureIntervalMs = Math.max(0, Number(treasureIntervalInput && treasureIntervalInput.value || 0));
        state.desktopNotify = !!(desktopNotifyInput && desktopNotifyInput.checked);
        state.monitorStartSpirit = Math.max(0, Number(monitorStartInput && monitorStartInput.value || 0));
        state.autoSelfFightWeak = !!(selfFightInput && selfFightInput.checked);
        state.selfFightMargin = Math.max(1, Math.min(3, Number(selfFightMarginInput && selfFightMarginInput.value || 1.15)));
        state.autoRecoveryMode = (recoveryModeInput && recoveryModeInput.value) || 'both';
        if (['none', 'hp', 'mp', 'both'].indexOf(state.autoRecoveryMode) < 0) state.autoRecoveryMode = 'both';
        state.autoRecoveryThreshold = Math.max(0, Math.min(100, Number(recoveryThresholdInput && recoveryThresholdInput.value || 80)));
        state.autoRecoveryTarget = Math.max(0, Math.min(100, Number(recoveryTargetInput && recoveryTargetInput.value || 100)));
        state.autoHpPriority = (hpPriorityInput && hpPriorityInput.value) || 'mp,pill,adpoint';
        if (['mp,pill,adpoint', 'pill,mp,adpoint', 'adpoint,mp,pill'].indexOf(state.autoHpPriority) < 0) state.autoHpPriority = 'mp,pill,adpoint';
        state.autoMpPriority = (mpPriorityInput && mpPriorityInput.value) || 'stone,pill,adpoint';
        if (['stone,pill,adpoint', 'pill,stone,adpoint', 'adpoint,stone,pill'].indexOf(state.autoMpPriority) < 0) state.autoMpPriority = 'stone,pill,adpoint';
        state.updateManifestUrl = String(updateManifestInput && updateManifestInput.value || '').trim();
        state.autoVoidBody = !!(voidInput && voidInput.checked);
        state.voidBodyRarity = Math.max(1, Math.min(5, Number(voidRarityInput && voidRarityInput.value || 5)));
        state.voidBodyBuyQty = Math.max(1, Math.min(999, Number(voidQtyInput && voidQtyInput.value || 1)));
        state.autoHiddenCharm = !!(hiddenCharmInput && hiddenCharmInput.checked);
        state.hiddenCharmRarity = Math.max(0, Math.min(5, Number(hiddenCharmRarityInput && hiddenCharmRarityInput.value || 0)));
        state.hiddenCharmBuyQty = Math.max(1, Math.min(999, Number(hiddenCharmQtyInput && hiddenCharmQtyInput.value || 1)));
        state.hiddenCharmRetryMs = Math.max(3000, Number(hiddenCharmRetryInput && hiddenCharmRetryInput.value || 60000));

        localStorage.setItem('lvSpiritCleaner.reserve', String(state.reserve));
        localStorage.setItem('lvSpiritCleaner.delayMs', String(state.delayMs));
        localStorage.setItem('lvSpiritCleaner.hireRetryLimit', String(state.hireRetryLimit));
        localStorage.setItem('lvSpiritCleaner.hireMode', state.hireMode);
        localStorage.setItem('lvSpiritCleaner.hireMaxFee', String(state.hireMaxFee));
        localStorage.setItem('lvSpiritCleaner.keepMultiplier', state.keepCurrentMultiplier ? '1' : '0');
        localStorage.setItem('lvSpiritCleaner.merchantMode', state.merchantMode);
        localStorage.setItem('lvSpiritCleaner.merchantKeyword', state.merchantKeyword);
        localStorage.setItem('lvSpiritCleaner.merchantQualityFirst', state.merchantQualityFirst ? '1' : '0');
        localStorage.setItem('lvSpiritCleaner.merchantMaxPrice', String(state.merchantMaxPrice));
        localStorage.setItem('lvSpiritCleaner.autoMerchantLegend', state.autoMerchantLegend ? '1' : '0');
        localStorage.setItem('lvSpiritCleaner.autoHireCheapest', state.autoHireCheapest ? '1' : '0');
        localStorage.setItem('lvSpiritCleaner.autoMeditate', state.autoMeditate ? '1' : '0');
        localStorage.setItem('lvSpiritCleaner.autoExploreAfterMeditate', state.autoExploreAfterMeditate ? '1' : '0');
        localStorage.setItem('lvSpiritCleaner.nightOnlyExplore', state.nightOnlyExplore ? '1' : '0');
        localStorage.setItem('lvSpiritCleaner.autoReviveDeath', state.autoReviveDeath ? '1' : '0');
        localStorage.setItem('lvSpiritCleaner.checkDaoyunBoost', state.checkDaoyunBoost ? '1' : '0');
        localStorage.setItem('lvSpiritCleaner.useAdvancedMeditate', state.useAdvancedMeditate ? '1' : '0');
        localStorage.setItem('lvSpiritCleaner.meditateStopSpirit', String(state.meditateStopSpirit));
        localStorage.setItem('lvSpiritCleaner.inscriptionTargets', state.inscriptionTargets);
        localStorage.setItem('lvSpiritCleaner.inscriptionQuality', state.inscriptionQuality);
        localStorage.setItem('lvSpiritCleaner.inscriptionStat', state.inscriptionStat);
        localStorage.setItem('lvSpiritCleaner.inscriptionMinValue', String(state.inscriptionMinValue));
        localStorage.setItem('lvSpiritCleaner.inscriptionStopMode', state.inscriptionStopMode);
        localStorage.setItem('lvSpiritCleaner.inscriptionAutoEquip', state.inscriptionAutoEquip ? '1' : '0');
        localStorage.setItem('lvSpiritCleaner.inscriptionMaxAttempts', String(state.inscriptionMaxAttempts));
        localStorage.setItem('lvSpiritCleaner.inscriptionResultDelay', String(state.inscriptionResultDelay));
        localStorage.setItem('lvSpiritCleaner.inscriptionDiscardDelay', String(state.inscriptionDiscardDelay));
        localStorage.setItem('lvSpiritCleaner.treasureBatchSize', String(state.treasureBatchSize));
        localStorage.setItem('lvSpiritCleaner.treasureUseQuantity', String(state.treasureUseQuantity));
        localStorage.setItem('lvSpiritCleaner.treasureIntervalMs', String(state.treasureIntervalMs));
        localStorage.setItem('lvSpiritCleaner.desktopNotify', state.desktopNotify ? '1' : '0');
        localStorage.setItem('lvSpiritCleaner.monitorStartSpirit', String(state.monitorStartSpirit));
        localStorage.setItem('lvSpiritCleaner.autoSelfFightWeak', state.autoSelfFightWeak ? '1' : '0');
        localStorage.setItem('lvSpiritCleaner.selfFightMargin', String(state.selfFightMargin));
        localStorage.setItem('lvSpiritCleaner.autoRecoveryMode', state.autoRecoveryMode);
        localStorage.setItem('lvSpiritCleaner.autoRecoveryThreshold', String(state.autoRecoveryThreshold));
        localStorage.setItem('lvSpiritCleaner.autoRecoveryTarget', String(state.autoRecoveryTarget));
        localStorage.setItem('lvSpiritCleaner.autoHpPriority', state.autoHpPriority);
        localStorage.setItem('lvSpiritCleaner.autoMpPriority', state.autoMpPriority);
        localStorage.setItem('lvSpiritCleaner.updateManifestUrl', state.updateManifestUrl);
        localStorage.setItem('lvSpiritCleaner.autoVoidBody', state.autoVoidBody ? '1' : '0');
        localStorage.setItem('lvSpiritCleaner.voidBodyRarity', String(state.voidBodyRarity));
        localStorage.setItem('lvSpiritCleaner.voidBodyBuyQty', String(state.voidBodyBuyQty));
        localStorage.setItem('lvSpiritCleaner.autoHiddenCharm', state.autoHiddenCharm ? '1' : '0');
        localStorage.setItem('lvSpiritCleaner.hiddenCharmRarity', String(state.hiddenCharmRarity));
        localStorage.setItem('lvSpiritCleaner.hiddenCharmBuyQty', String(state.hiddenCharmBuyQty));
        localStorage.setItem('lvSpiritCleaner.hiddenCharmRetryMs', String(state.hiddenCharmRetryMs));
    }

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

    async function checkDaoyunBeforeStart(modeLabel) {
        if (!state.checkDaoyunBoost || !gameApi()) return true;
        try {
            var res = await gameApi().get('/api/master/overview');
            if (!res || res.code !== 200 || !res.data) {
                setStatus('道韵加成检查失败，等待手动确认', 'warn');
                return window.confirm('道韵加成状态读取失败，是否继续' + modeLabel + '？');
            }
            if (res.data.exploreBoostEnabled) {
                setStatus('道韵加成已开启', 'run');
                return true;
            }
            return window.confirm('道韵加成未开启，是否继续' + modeLabel + '？');
        } catch (err) {
            console.warn('[LingVerse Spirit Cleaner] daoyun boost check failed', err);
            setStatus('道韵加成检查异常，等待手动确认', 'warn');
            return window.confirm('道韵加成检查异常，是否继续' + modeLabel + '？');
        }
    }

    function normalizeMultiplier() {
        if (state.keepCurrentMultiplier) return;
        var select = document.getElementById('exploreMultiplier');
        if (!select || select.value === '1') return;
        select.value = '1';
        if (typeof window.onExploreMultiplierChange === 'function') {
            window.onExploreMultiplierChange();
        }
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
            setStatus('已引渡归来，继续流程', 'run');
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
        try {
            setStatus('尝试仙缘高级冥想', 'run');
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
            setStatus('高级冥想已完成', 'run');
            return true;
        } catch (err) {
            console.warn('[LingVerse Spirit Cleaner] advanced meditate failed', err);
            setStatus('高级冥想异常，转普通冥想', 'warn');
            return false;
        }
    }

    async function meditateUntilSpiritFull() {
        if (!state.autoMeditate || !gameApi()) return false;
        var info = getSpiritInfo();
        if (!info.player || info.player.isDead || window.playerDead) return false;
        var targetSpirit = getMeditateTargetSpirit(info);
        if (info.maxSpirit <= 0 || info.spirit >= targetSpirit) return true;

        setStatus('神识不足，开始冥想到 ' + targetSpirit, 'run');
        if (await tryAdvancedMeditateOnce()) {
            info = getSpiritInfo();
            if (info.spirit >= targetSpirit) return true;
        }
        var startRes = await gameApi().post('/api/game/meditate/start', {});
        if (!startRes || (startRes.code !== 200 && String(startRes.message || '').indexOf('冥想') < 0)) {
            toast('自动冥想启动失败：' + ((startRes && startRes.message) || '未知错误'));
            return false;
        }

        var spiritPerMinute = Number(startRes.data && startRes.data.spiritPerMinute || window.meditationSpiritRate || 0);
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
                toast('坊市购买失败：' + ((res && res.message) || '未知错误'));
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
        if (ok) setStatus('虚空淬体已补齐', 'run');
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
                toast('隐秘符购买失败：' + ((res && res.message) || '未知错误'));
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

    function chooseMerchantItem(items) {
        var keywords = merchantKeywordList();
        var candidates = items.map(normalizeMerchantItem).filter(function (item) {
            if (!Number.isFinite(item.index)) return false;
            if (state.merchantMode === 'legend' && !isLegendary(item)) return false;
            if (state.merchantMaxPrice > 0 && Number(item.price || 0) > state.merchantMaxPrice) return false;
            if (!keywords.length) return true;
            return keywords.some(function (keyword) {
                return String(item.name || '').indexOf(keyword) >= 0;
            });
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
        if (!gameApi()) return;
        syncSettingsFromUi();
        var mode = state.autoRecoveryMode;
        var threshold = mode === 'none' ? 0 : state.autoRecoveryThreshold;
        var target = Math.max(threshold, state.autoRecoveryTarget);
        var hpEnabled = mode === 'hp' || mode === 'both';
        var mpEnabled = mode === 'mp' || mode === 'both';
        var tasks = [];

        tasks.push(gameApi().post('/api/player/settings/auto-hp', {
            ratio: hpEnabled ? threshold : 0,
            target: hpEnabled ? target : 0,
            priority: state.autoHpPriority.split(',')
        }));
        tasks.push(gameApi().post('/api/player/settings/auto-mp', {
            ratio: mpEnabled ? threshold : 0,
            target: mpEnabled ? target : 0,
            priority: state.autoMpPriority.split(',')
        }));

        setStatus('同步自动恢复配置中', 'run');
        try {
            var results = await Promise.all(tasks);
            var failed = results.filter(function (res) { return !res || res.code !== 200; })[0];
            if (failed) {
                setStatus('自动恢复保存失败：' + (failed.message || '未知错误'), 'warn');
                return;
            }
            setStatus(mode === 'none' ? '已关闭自动回血/回灵' : '已保存自动回血/回灵', 'run');
            await refreshPlayer();
        } catch (err) {
            console.warn('[LingVerse Spirit Cleaner] auto recovery settings failed', err);
            setStatus('自动恢复保存异常', 'warn');
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
        if (!state.autoHireCheapest || busyEvent || !isEncounterActive() || !gameApi()) return false;
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
            if (typeof window.loadInventory === 'function') window.loadInventory();
            if (typeof window.loadGameLogs === 'function') window.loadGameLogs();
            await refreshPlayer();
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
                        setStatus('试炼开始失败，等待重试：' + ((startRes && startRes.message) || '未知错误'), 'warn');
                        await sleep(state.delayMs);
                        continue;
                    }
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
                    await sleep(state.treasureIntervalMs || state.delayMs);
                    continue;
                }

                var map = await findTreasureMap();
                if (!map) {
                    setStatus('背包没有藏宝图，等待补充后继续刷图', 'warn');
                    await sleep(state.treasureIntervalMs || state.delayMs);
                    continue;
                }

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
        if (!state.inscriptionAutoEquip) return false;
        var sorted = (matches || []).slice().sort(function (a, b) {
            return Number((b.result || {}).value || 0) - Number((a.result || {}).value || 0);
        });
        var equipped = 0;
        for (var i = 0; i < sorted.length && autoInscriptionRunning; i++) {
            var result = sorted[i].result;
            if (!result) continue;
            inscriptionLog('自动装配：准备处理 ' + inscriptionResultLabel(result));
            await clickInscriptionDetailButton(result);
            await sleep(600);
            var choice = chooseInscriptionSlotButton(result.value);
            if (!choice) {
                inscriptionLog('自动装配：跳过 ' + inscriptionResultLabel(result) + '，没有空槽或更低值槽位');
                continue;
            }
            inscriptionLog('自动装配：' + inscriptionResultLabel(result) + ' -> ' + choice.reason);
            await humanClick(choice.button);
            await sleep(300);
            var confirmBtn = document.getElementById('gameDialogConfirmBtn') || visibleButtonByText(document, '确定') || visibleButtonByText(document, '确认');
            if (confirmBtn) await humanClick(confirmBtn);
            equipped += 1;
            await sleep(900);
        }
        if (equipped) inscriptionLog('自动装配完成：' + equipped + ' 个');
        return equipped > 0;
    }

    function inscriptionTargetDecision(results) {
        var targets = parseInscriptionTargets();
        if (!targets.length) return { met: true, matches: [], reason: '未设置目标' };
        var matches = [];
        results.forEach(function (result) {
            targets.forEach(function (target) {
                var qualityOk = inscriptionQualityOk(result.quality, target.quality);
                if (qualityOk && String(result.stat || '').indexOf(target.stat) >= 0 && Number(result.value || 0) >= Number(target.minValue || 0)) {
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

    async function clickInscriptionTenPull() {
        var selectors = [
            '.modal-action-btn__text',
            'button',
            '.modal-action-btn',
            '[role=button]',
            '[onclick*="TenPull"]',
            '[onclick*="tenPull"]',
            '[onclick*="Inscription"]',
            '[onclick*="inscription"]'
        ];
        var buttons = document.querySelectorAll(selectors.join(','));
        for (var i = 0; i < buttons.length; i++) {
            var text = String(buttons[i].textContent || '').trim();
            var onclickText = String(buttons[i].getAttribute && buttons[i].getAttribute('onclick') || '');
            if (text === '十连灵纹' || text.indexOf('十连') >= 0 || onclickText.indexOf('TenPull') >= 0 || onclickText.indexOf('tenPull') >= 0) {
                var target = buttons[i].closest && buttons[i].closest('button') || buttons[i];
                if (target && !isElementDisabled(target) && isElementVisible(target)) {
                    await humanClick(target);
                    return true;
                }
            }
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
        inscriptionStats = { total: 0, kept: 0, discarded: 0, best: '' };
        autoInscriptionRunning = true;
        var targetHeld = false;
        inscriptionLog('开始铭文洗练：' + (state.inscriptionQuality === 'any' ? '不限等级' : state.inscriptionQuality + '及以上') + ' / ' + state.inscriptionStat + ' ≥ ' + state.inscriptionMinValue);
        updateInscriptionPanel();
        while (autoInscriptionRunning) {
            try {
                var existingResults = parseInscriptionResultCards();
                if (existingResults.length) {
                    var existingDecision = inscriptionTargetDecision(existingResults);
                    if (existingDecision.met) {
                        if (state.inscriptionAutoEquip && await autoEquipInscriptionResults(existingDecision.matches)) {
                            inscriptionStats.kept += 1;
                            updateInscriptionPanel();
                            await clickInscriptionDiscardAll();
                            await sleep(state.inscriptionDiscardDelay);
                            continue;
                        }
                        setStatus('铭文目标达成，已保留结果等待处理', 'run');
                        await sleep(Math.max(state.inscriptionResultDelay, 2000));
                        continue;
                    }
                    if (!await clickInscriptionDiscardAll()) {
                        inscriptionLog('已有未命中结果但放弃失败，等待重试');
                        setStatus('放弃已有铭文结果失败，等待重试', 'warn');
                        await sleep(Math.max(state.inscriptionDiscardDelay, 2000));
                        continue;
                    }
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
                if (!await clickInscriptionTenPull()) {
                    inscriptionLog('未找到“十连灵纹”按钮，等待重试');
                    setStatus('未找到十连按钮，等待重试', 'warn');
                    await sleep(Math.max(state.inscriptionResultDelay, 2000));
                    continue;
                }
                inscriptionStats.total += 1;
                targetHeld = false;
                updateInscriptionPanel();
                await sleep(state.inscriptionResultDelay);
                var results = await waitInscriptionResults(5000);
                if (!results.length) {
                    inscriptionLog('第' + inscriptionStats.total + ' 次没有解析到结果，等待重试');
                    setStatus('铭文结果为空，等待重试', 'warn');
                    await sleep(Math.max(state.inscriptionResultDelay, 2000));
                    continue;
                }
                var best = results.slice().sort(function (a, b) { return Number(b.value || 0) - Number(a.value || 0); })[0];
                if (best) inscriptionStats.best = best.text;
                var decision = inscriptionTargetDecision(results);
                inscriptionLog('第' + inscriptionStats.total + ' 次：' + results.map(function (item) { return item.text; }).join('，') + '：' + decision.reason);
                if (decision.met) {
                    inscriptionStats.kept += 1;
                    updateInscriptionPanel();
                    setStatus('铭文目标达成，已保留结果等待处理', 'run');
                    notifyUser('铭文目标达成', results.map(function (item) { return item.text; }).join('，'));
                    if (state.inscriptionAutoEquip && await autoEquipInscriptionResults(decision.matches)) {
                        await clickInscriptionDiscardAll();
                        await sleep(state.inscriptionDiscardDelay);
                        continue;
                    }
                    targetHeld = true;
                    while (autoInscriptionRunning && targetHeld) {
                        await sleep(Math.max(state.inscriptionResultDelay, 2000));
                        var heldResults = parseInscriptionResultCards();
                        var heldDecision = inscriptionTargetDecision(heldResults);
                        if (!heldResults.length || !heldDecision.met) targetHeld = false;
                    }
                    continue;
                }
                if (await clickInscriptionDiscardAll()) {
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

        while (monitoringSpirit && !running) {
            await refreshPlayer();
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
                    if (progress.total >= target) {
                        monitoringSpirit = false;
                        updateMeter();
                        setStatus('预计神识已到，收功后开始清理', 'run');
                        await stopMeditationAndRefresh();
                        await sleep(300);
                        await runLoop();
                        return;
                    }
                } else if (info.spirit >= target) {
                    monitoringSpirit = false;
                    updateMeter();
                    setStatus('神识已到 ' + info.spirit + '/' + target + '，开始清理', 'run');
                    await sleep(300);
                    await runLoop();
                    return;
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

    async function runLoop() {
        if (running) return;
        if (autoInscriptionRunning) {
            setStatus('铭文洗练中，不能开始清理', 'warn');
            return;
        }
        monitoringSpirit = false;
        running = true;
        syncSettingsFromUi();
        normalizeMultiplier();
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

        while (running) {
            await refreshPlayer();

            if (await handleSpecialEvents()) {
                await sleep(state.delayMs);
                continue;
            }
            if (isEncounterActive() && state.autoHireCheapest) {
                await sleep(state.delayMs);
                continue;
            }
            if (isMerchantActive() && state.autoMerchantLegend) {
                await sleep(state.delayMs);
                continue;
            }
            if (isMerchantActive()) {
                setStatus('商人事件待处理，等待中', 'warn');
                await sleep(state.delayMs);
                continue;
            }

            if (state.nightOnlyExplore && !isGameNight()) {
                setStatus('当前不是夜晚，等待夜晚探索', 'warn');
                await sleep(Math.max(30000, state.delayMs));
                continue;
            }

            try {
                if (state.autoVoidBody && !hasVoidBodyBuff()) {
                    if (await ensureVoidBodyBuff(false)) {
                        await sleep(state.delayMs);
                        continue;
                    }
                    setStatus('虚空淬体补充失败，等待重试', 'warn');
                    await sleep(state.delayMs);
                    continue;
                }

                if (state.autoHiddenCharm) {
                    if (!await ensureHiddenCharm(false)) {
                        setStatus('隐秘符未能使用，等待重试', 'warn');
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

            var stopReason = shouldStopBeforeAction();
            if (stopReason) {
                if (stopReason === 'need_meditate') {
                    if (await meditateUntilSpiritFull()) {
                        if (!state.autoExploreAfterMeditate) {
                            setStatus('已收功，等待手动停止或开启自动继续探索', 'warn');
                            await sleep(state.delayMs);
                            continue;
                        }
                        await sleep(state.delayMs);
                        continue;
                    }
                    setStatus('神识不足，自动冥想失败，等待重试', 'warn');
                    await sleep(state.delayMs);
                    continue;
                }
                setStatus(stopReason + '，等待重试', 'warn');
                await sleep(state.delayMs);
                continue;
            }

            try {
                var result = await window.handleExplore();
                updateMeter();
                if (result === 'stop') {
                    await sleep(500);
                    if (await handleSpecialEvents()) {
                        await sleep(state.delayMs);
                        continue;
                    }
                    if (isEncounterActive() && state.autoHireCheapest) {
                        setStatus('暂无符合条件的护道，等待重试' + (state.hireMaxFee > 0 ? '（上限 ' + state.hireMaxFee + ' 灵石）' : ''), 'warn');
                        await sleep(state.delayMs);
                        continue;
                    }
                    if (isMerchantActive() && state.autoMerchantLegend) {
                        await sleep(state.delayMs);
                        continue;
                    }
                    if (isMerchantActive()) {
                        setStatus('商人事件待处理，等待中', 'warn');
                        await sleep(state.delayMs);
                        continue;
                    }
                    await refreshPlayer();
                    var afterExplore = getSpiritInfo();
                    if (state.autoMeditate && afterExplore.player && afterExplore.spirit < afterExplore.cost) {
                        if (await meditateUntilSpiritFull()) {
                            if (!state.autoExploreAfterMeditate) {
                                setStatus('已收功，等待手动停止或开启自动继续探索', 'warn');
                                await sleep(state.delayMs);
                                continue;
                            }
                            await sleep(state.delayMs);
                            continue;
                        }
                    }
                    setStatus('游戏事件触发，等待处理后重试', 'warn');
                    await sleep(state.delayMs);
                    continue;
                }
            } catch (err) {
                console.warn('[LingVerse Spirit Cleaner] explore failed', err);
                setStatus('探索异常，等待重试', 'warn');
                await sleep(state.delayMs);
                continue;
            }

            var jitter = Math.floor(Math.random() * 350);
            await sleep(state.delayMs + jitter);
        }
    }
    function stop(reason) {
        running = false;
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
            var notes = normalizeNotes(data.notes || data.changes || data.changelog || data.releaseNotes);
            return {
                version: String(data.version || data.latestVersion || data.tag || '').replace(/^v/i, ''),
                title: data.title || data.name || '',
                notes: notes,
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
        var url = String((release && release.downloadUrl) || (release && release.url) || (release && release.sourceUrl) || '').trim();
        var version = String((release && release.version) || '').trim();
        if (!url) return '';
        if (url.indexOf('release.json') >= 0) {
            url = DEFAULT_UPDATE_MANIFEST_URL.replace(/release\.json(?:[?#].*)?$/, 'lingverse-spirit-cleaner.user.js');
        }
        if (version && url.indexOf('v=') < 0) {
            url += (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(version);
        }
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

        var notes = normalizeNotes(release.notes);
        if (!notes.length) notes = ['云端版本已更新，暂无详细变更说明。'];
        var installUrl = versionedInstallUrl(release);
        var modal = document.createElement('div');
        modal.id = 'lvscUpdateModal';
        modal.innerHTML =
            '<div class="lvsc-update-backdrop"></div>' +
            '<div class="lvsc-update-card">' +
            '<div class="lvsc-update-kicker">' + escapeLocalHtml(options.kicker || '更新公告') + '</div>' +
            '<div class="lvsc-update-title">' + escapeLocalHtml(release.title || ('神识清理 v' + release.version)) + '</div>' +
            '<div class="lvsc-update-version">当前 ' + escapeLocalHtml(SCRIPT_VERSION) + ' · 公告 ' + escapeLocalHtml(release.version || '-') + '</div>' +
            '<ul>' + notes.map(function (note) { return '<li>' + escapeLocalHtml(note) + '</li>'; }).join('') + '</ul>' +
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
        syncSettingsFromUi();
        var url = state.updateManifestUrl;
        if (!url) {
            if (manual) setStatus('请先填写云端公告 JSON 地址', 'warn');
            return;
        }
        checkingCloudUpdate = true;
        try {
            if (manual) setStatus('检测云端更新中', 'run');
            var sep = url.indexOf('?') >= 0 ? '&' : '?';
            var res = await fetch(url + sep + '_lvsc=' + Date.now(), { cache: 'no-store' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var text = await res.text();
            var release = normalizeReleaseData(text, url);
            if (!release.version) {
                setStatus('云端公告缺少 version 字段', 'warn');
                return;
            }

            var newer = compareVersion(release.version, SCRIPT_VERSION) > 0;
            var seenKey = 'lvSpiritCleaner.seenCloudVersion.' + simpleHash(url);
            var remindKey = 'lvSpiritCleaner.lastCloudReminder.' + simpleHash(url);
            var lastReminderAt = Number(localStorage.getItem(remindKey) || 0);
            var shouldRemind = manual || localStorage.getItem(seenKey) !== release.version || Date.now() - lastReminderAt > CLOUD_UPDATE_REMIND_MS;
            if (newer && shouldRemind) {
                if (!document.getElementById('lvscUpdateModal')) {
                    showUpdateNotice(release, { seenKey: seenKey, kicker: '发现云端新版' });
                }
                localStorage.setItem(remindKey, String(Date.now()));
                setStatus('发现云端新版：' + release.version, 'warn');
                notifyUser('发现神识清理新版', 'v' + release.version);
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

    function activatePanelTab(tabName) {
        var allowed = ['basic', 'merchant', 'combat', 'flow', 'inscription', 'update'];
        if (allowed.indexOf(tabName) < 0) tabName = 'basic';
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
            '#lvscTabs{position:sticky;top:-12px;z-index:3;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;margin:-2px -2px 0;padding:4px 2px 6px;background:rgba(17,20,29,.96);border-bottom:1px solid rgba(255,255,255,.08)}',
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
            '.lvsc-check{display:flex!important;align-items:center;gap:0;line-height:1.35;font-size:12px}',
            '#lvscSpiritTrack{height:8px;background:rgba(255,255,255,.12);border-radius:999px;overflow:hidden}',
            '#lvscSpiritFill{height:100%;width:0;background:linear-gradient(90deg,#8667ff,#d8b4fe)}',
            '#lvscSpiritValue{font-size:12px;color:#d8b4fe}',
            '#lvscAuthor{font-size:11px;color:#8f846f;text-align:center;border-top:1px solid rgba(255,255,255,.08);padding-top:8px}',
            '#lvscActions{flex:0 0 auto;display:flex;gap:8px;padding:10px 12px 12px;background:linear-gradient(180deg,rgba(17,20,29,.9),rgba(17,20,29,.98));border-top:1px solid rgba(255,255,255,.08)}',
            '#lvscRunBtn{flex:1;height:34px;background:#dbb970;color:#17141d}',
            '#lvscRefreshBtn{width:72px;height:34px;background:rgba(255,255,255,.08);color:#f5f1e8;border:1px solid rgba(255,255,255,.12)!important}',
            '#lvscMonitorBtn{height:34px;background:rgba(155,231,195,.16);color:#9be7c3;border:1px solid rgba(155,231,195,.28)!important}',
            '#lvscAutoTrialBtn,#lvscAutoTreasureBtn{height:34px;background:rgba(216,180,254,.14);color:#d8b4fe;border:1px solid rgba(216,180,254,.28)!important}',
            '#lvscSelfFightBtn,#lvscAutoRecoveryBtn,#lvscVoidBodyBtn,#lvscHiddenCharmBtn,#lvscCheckUpdateBtn{height:32px;background:rgba(155,231,195,.16);color:#9be7c3;border:1px solid rgba(155,231,195,.28)!important}',
            '#lvscAutoInscriptionBtn{height:34px;background:rgba(216,180,254,.14);color:#d8b4fe;border:1px solid rgba(216,180,254,.28)!important}',
            '#lvscInscriptionStats{font-size:12px;color:#9be7c3}',
            '#lvscInscriptionLog{min-height:130px;max-height:190px;overflow:auto;white-space:pre-wrap;font-size:11px;color:#cfc6b2;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:8px}',
            '#lvscAutoRecoveryBtn{align-self:end}',
            '#lvscUpdateModal{position:fixed;inset:0;z-index:' + UPDATE_MODAL_Z_INDEX + ';color:#f5f1e8;font:13px/1.55 "Microsoft YaHei",sans-serif}',
            '.lvsc-update-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(2px)}',
            '.lvsc-update-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(420px,calc(100vw - 28px));max-height:82vh;overflow:auto;padding:18px;border-radius:12px;background:rgba(17,20,29,.98);border:1px solid rgba(219,185,112,.5);box-shadow:0 18px 60px rgba(0,0,0,.55)}',
            '.lvsc-update-kicker{font-size:12px;color:#dbb970;font-weight:700;margin-bottom:4px}',
            '.lvsc-update-title{font-size:18px;font-weight:800;margin-bottom:2px}',
            '.lvsc-update-version{font-size:12px;color:#9be7c3;margin-bottom:12px}',
            '.lvsc-update-card ul{margin:0 0 14px 18px;padding:0;color:#e9dfcf}',
            '.lvsc-update-card li{margin:6px 0}',
            '.lvsc-update-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}',
            '.lvsc-update-link,#lvscUpdateCopyBtn{display:flex;align-items:center;justify-content:center;min-height:34px;border-radius:7px;text-decoration:none;border:1px solid rgba(216,180,254,.28)!important;background:rgba(216,180,254,.12);color:#d8b4fe;font-weight:700}',
            '#lvscUpdateCloseBtn{width:100%;height:34px;background:#dbb970;color:#17141d}',
            '#lvscResizeHandle{position:absolute;right:3px;bottom:3px;z-index:5;width:18px;height:18px;cursor:nwse-resize;border-radius:3px;background:linear-gradient(135deg,transparent 0 45%,rgba(219,185,112,.75) 46% 52%,transparent 53% 62%,rgba(219,185,112,.65) 63% 69%,transparent 70%);opacity:.85}',
            '@container (max-width: 380px){.lvsc-grid2,.lvsc-field-grid,.lvsc-card-grid{grid-template-columns:1fr}#lvscTabs{grid-template-columns:repeat(3,minmax(0,1fr))}.lvsc-tab{font-size:11px}}',
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
            '<button class="lvsc-tab" data-tab="basic">基础</button>' +
            '<button class="lvsc-tab" data-tab="merchant">商人护道</button>' +
            '<button class="lvsc-tab" data-tab="combat">妖兽恢复</button>' +
            '<button class="lvsc-tab" data-tab="flow">自动流程</button>' +
            '<button class="lvsc-tab" data-tab="inscription">铭文</button>' +
            '<button class="lvsc-tab" data-tab="update">更新</button>' +
            '</div>' +
            '<div class="lvsc-category lvsc-tab-panel" data-tab-panel="basic">' +
            '<div class="lvsc-category-title">基础清理</div>' +
            '<div class="lvsc-field-grid">' +
            '<label>保留神识<input id="lvscReserve" type="number" min="0" step="1"></label>' +
            '<label>间隔毫秒<input id="lvscDelay" type="number" min="600" step="100"></label>' +
            '<label>监测到神识<input id="lvscMonitorStartSpirit" type="number" min="0" step="1" title="填 0 表示神识满了再开始清理"></label>' +
            '<label class="lvsc-check"><input id="lvscKeepMultiplier" type="checkbox">使用当前探索倍率</label>' +
            '</div>' +
            '</div>' +
            '<div class="lvsc-category lvsc-tab-panel" data-tab-panel="merchant">' +
            '<div class="lvsc-category-title">护道与商人</div>' +
            '<div class="lvsc-field-grid">' +
            '<label>护道方式<select id="lvscHireMode"><option value="cheapest">最低价</option><option value="together">合击</option><option value="alone">单独</option></select></label>' +
            '<label>灵石上限<input id="lvscHireMaxFee" type="number" min="0" step="1" title="填 0 表示不限"></label>' +
            '<label>护道重试上限<input id="lvscHireRetryLimit" type="number" min="1" max="10" step="1"></label>' +
            '<label>商人策略<select id="lvscMerchantMode"><option value="legend">传说才买</option><option value="custom">按条件购买</option><option value="leave">直接离去</option></select></label>' +
            '<label>商品关键词<input id="lvscMerchantKeyword" type="text" placeholder="多个用空格或逗号隔开"></label>' +
            '<label>高价阈值(灵石)<input id="lvscMerchantMaxPrice" type="number" min="0" step="1" title="填 0 表示不限"></label>' +
            '<label class="lvsc-check"><input id="lvscMerchantQualityFirst" type="checkbox">品质优先</label>' +
            '<label class="lvsc-check"><input id="lvscAutoMerchant" type="checkbox">自动处理商人</label>' +
            '</div>' +
            '<div class="lvsc-help">传说才买会固定要求传说品质；按条件购买会按关键词和价格筛选，品质优先开启后先买更高品质。</div>' +
            '</div>' +
            '<div class="lvsc-category lvsc-tab-panel" data-tab-panel="combat">' +
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
            '<label class="lvsc-span2">回血顺序<select id="lvscAutoHpPriority"><option value="mp,pill,adpoint">灵力 → 丹药 → 仙缘</option><option value="pill,mp,adpoint">丹药 → 灵力 → 仙缘</option><option value="adpoint,mp,pill">仙缘 → 灵力 → 丹药</option></select></label>' +
            '<label class="lvsc-span2">回灵顺序<select id="lvscAutoMpPriority"><option value="stone,pill,adpoint">灵石 → 丹药 → 仙缘</option><option value="pill,stone,adpoint">丹药 → 灵石 → 仙缘</option><option value="adpoint,stone,pill">仙缘 → 灵石 → 丹药</option></select></label>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '<div class="lvsc-category lvsc-tab-panel" data-tab-panel="flow">' +
            '<div class="lvsc-category-title">自动流程</div>' +
            '<div class="lvsc-card-grid">' +
            '<div class="lvsc-section">' +
            '<div class="lvsc-section-title">冥想探索</div>' +
            '<label class="lvsc-check"><input id="lvscAutoMeditate" type="checkbox">神识不足自动冥想回满</label>' +
            '<label>收功神识<input id="lvscMeditateStopSpirit" type="number" min="0" step="1" title="填 0 表示冥想到神识上限"></label>' +
            '<label class="lvsc-check"><input id="lvscAutoExploreAfterMeditate" type="checkbox">收功后自动继续探索</label>' +
            '<label class="lvsc-check"><input id="lvscNightOnlyExplore" type="checkbox">只在游戏夜晚探索</label>' +
            '<label class="lvsc-check"><input id="lvscAutoReviveDeath" type="checkbox">陨落后自动引渡归来</label>' +
            '<label class="lvsc-check"><input id="lvscCheckDaoyunBoost" type="checkbox">启动前检查道韵加成</label>' +
            '<label class="lvsc-check"><input id="lvscUseAdvancedMeditate" type="checkbox">优先仙缘高级冥想</label>' +
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
            '<div class="lvsc-category lvsc-tab-panel" data-tab-panel="inscription">' +
            '<div class="lvsc-category-title">铭文洗练</div>' +
            '<div class="lvsc-section">' +
            '<div id="lvscInscriptionStats">次数 0 / 达成 0 / 放弃 0</div>' +
            '<div class="lvsc-grid2">' +
            '<label>等级关键词<input id="lvscInscriptionQuality" type="text" placeholder="不限，或填页面显示的等级"></label>' +
            '<label>目标属性<select id="lvscInscriptionStat"><option value="攻击">攻击</option><option value="防御">防御</option><option value="气血">气血</option><option value="神识">神识</option></select></label>' +
            '<label>最小数值<input id="lvscInscriptionMinValue" type="number" min="0" step="1"></label>' +
            '<label>命中模式<select id="lvscInscriptionStopMode"><option value="any">任一满足即保留</option><option value="all">全部满足才保留</option><option value="manual">只手动停止</option></select></label>' +
            '<label class="lvsc-check"><input id="lvscInscriptionAutoEquip" type="checkbox">命中后自动装配</label>' +
            '<label>最大次数<input id="lvscInscriptionMaxAttempts" type="number" min="0" step="1" title="填 0 表示无限"></label>' +
            '<label>结果等待(ms)<input id="lvscInscriptionResultDelay" type="number" min="500" step="100"></label>' +
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
            '<button id="lvscCheckUpdateBtn">检查云端更新</button>' +
            '</div>' +
            '<div class="lvsc-help">默认读取 GitHub 公告。脚本管理器会根据 updateURL/downloadURL 检测并提示下载安装。</div>' +
            '</div>' +
            '<div id="lvscAuthor">作者：SuH2RanZ1</div>' +
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
        document.getElementById('lvscMerchantMaxPrice').value = String(state.merchantMaxPrice);
        document.getElementById('lvscAutoMerchant').checked = state.autoMerchantLegend;
        document.getElementById('lvscAutoSelfFightWeak').checked = state.autoSelfFightWeak;
        document.getElementById('lvscSelfFightMargin').value = String(state.selfFightMargin);
        document.getElementById('lvscAutoHire').checked = state.autoHireCheapest;
        document.getElementById('lvscAutoRecoveryMode').value = String(state.autoRecoveryMode);
        document.getElementById('lvscAutoRecoveryThreshold').value = String(state.autoRecoveryThreshold);
        document.getElementById('lvscAutoRecoveryTarget').value = String(state.autoRecoveryTarget);
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
        document.getElementById('lvscInscriptionQuality').value = String(state.inscriptionQuality);
        document.getElementById('lvscInscriptionStat').value = String(state.inscriptionStat);
        document.getElementById('lvscInscriptionMinValue').value = String(state.inscriptionMinValue);
        document.getElementById('lvscInscriptionStopMode').value = String(state.inscriptionStopMode);
        document.getElementById('lvscInscriptionAutoEquip').checked = state.inscriptionAutoEquip;
        document.getElementById('lvscInscriptionMaxAttempts').value = String(state.inscriptionMaxAttempts);
        document.getElementById('lvscInscriptionResultDelay').value = String(state.inscriptionResultDelay);
        document.getElementById('lvscInscriptionDiscardDelay').value = String(state.inscriptionDiscardDelay);
        document.getElementById('lvscTreasureBatchSize').value = String(state.treasureBatchSize);
        document.getElementById('lvscTreasureUseQuantity').value = String(state.treasureUseQuantity);
        document.getElementById('lvscTreasureIntervalMs').value = String(state.treasureIntervalMs);
        document.getElementById('lvscDesktopNotify').checked = state.desktopNotify;
        document.getElementById('lvscAutoVoidBody').checked = state.autoVoidBody;
        document.getElementById('lvscVoidRarity').value = String(state.voidBodyRarity);
        document.getElementById('lvscVoidBuyQty').value = String(state.voidBodyBuyQty);
        document.getElementById('lvscAutoHiddenCharm').checked = state.autoHiddenCharm;
        document.getElementById('lvscHiddenCharmRarity').value = String(state.hiddenCharmRarity);
        document.getElementById('lvscHiddenCharmBuyQty').value = String(state.hiddenCharmBuyQty);
        document.getElementById('lvscHiddenCharmRetryMs').value = String(state.hiddenCharmRetryMs);
        document.getElementById('lvscRunBtn').onclick = function () {
            if (running) stop('手动停止');
            else runLoop();
        };
        document.getElementById('lvscCompactRunBtn').onclick = function () {
            if (running) stop('手动停止');
            else runLoop();
        };
        document.getElementById('lvscMonitorBtn').onclick = toggleSpiritMonitor;
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
        document.getElementById('lvscCheckUpdateBtn').onclick = function () {
            checkCloudUpdate(true);
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
            };
        });
        document.getElementById('lvscReserve').onchange = syncSettingsFromUi;
        document.getElementById('lvscDelay').onchange = syncSettingsFromUi;
        document.getElementById('lvscHireRetryLimit').onchange = syncSettingsFromUi;
        document.getElementById('lvscHireMode').onchange = syncSettingsFromUi;
        document.getElementById('lvscHireMaxFee').onchange = syncSettingsFromUi;
        document.getElementById('lvscKeepMultiplier').onchange = syncSettingsFromUi;
        document.getElementById('lvscMerchantMode').onchange = syncSettingsFromUi;
        document.getElementById('lvscMerchantKeyword').onchange = syncSettingsFromUi;
        document.getElementById('lvscMerchantQualityFirst').onchange = syncSettingsFromUi;
        document.getElementById('lvscMerchantMaxPrice').onchange = syncSettingsFromUi;
        document.getElementById('lvscAutoMerchant').onchange = syncSettingsFromUi;
        document.getElementById('lvscAutoSelfFightWeak').onchange = syncSettingsFromUi;
        document.getElementById('lvscSelfFightMargin').onchange = syncSettingsFromUi;
        document.getElementById('lvscAutoHire').onchange = syncSettingsFromUi;
        document.getElementById('lvscAutoRecoveryMode').onchange = syncSettingsFromUi;
        document.getElementById('lvscAutoRecoveryThreshold').onchange = syncSettingsFromUi;
        document.getElementById('lvscAutoRecoveryTarget').onchange = syncSettingsFromUi;
        document.getElementById('lvscAutoHpPriority').onchange = syncSettingsFromUi;
        document.getElementById('lvscAutoMpPriority').onchange = syncSettingsFromUi;
        document.getElementById('lvscUpdateManifestUrl').onchange = syncSettingsFromUi;
        document.getElementById('lvscAutoMeditate').onchange = syncSettingsFromUi;
        document.getElementById('lvscMeditateStopSpirit').onchange = syncSettingsFromUi;
        document.getElementById('lvscMonitorStartSpirit').onchange = syncSettingsFromUi;
        document.getElementById('lvscAutoExploreAfterMeditate').onchange = syncSettingsFromUi;
        document.getElementById('lvscNightOnlyExplore').onchange = syncSettingsFromUi;
        document.getElementById('lvscAutoReviveDeath').onchange = syncSettingsFromUi;
        document.getElementById('lvscCheckDaoyunBoost').onchange = syncSettingsFromUi;
        document.getElementById('lvscUseAdvancedMeditate').onchange = syncSettingsFromUi;
        document.getElementById('lvscInscriptionQuality').onchange = syncSettingsFromUi;
        document.getElementById('lvscInscriptionStat').onchange = syncSettingsFromUi;
        document.getElementById('lvscInscriptionMinValue').onchange = syncSettingsFromUi;
        document.getElementById('lvscInscriptionStopMode').onchange = syncSettingsFromUi;
        document.getElementById('lvscInscriptionMaxAttempts').onchange = syncSettingsFromUi;
        document.getElementById('lvscInscriptionResultDelay').onchange = syncSettingsFromUi;
        document.getElementById('lvscInscriptionDiscardDelay').onchange = syncSettingsFromUi;
        document.getElementById('lvscInscriptionAutoEquip').onchange = syncSettingsFromUi;
        document.getElementById('lvscTreasureBatchSize').onchange = syncSettingsFromUi;
        document.getElementById('lvscTreasureUseQuantity').onchange = syncSettingsFromUi;
        document.getElementById('lvscTreasureIntervalMs').onchange = syncSettingsFromUi;
        document.getElementById('lvscDesktopNotify').onchange = syncSettingsFromUi;
        document.getElementById('lvscAutoVoidBody').onchange = syncSettingsFromUi;
        document.getElementById('lvscVoidRarity').onchange = syncSettingsFromUi;
        document.getElementById('lvscVoidBuyQty').onchange = syncSettingsFromUi;
        document.getElementById('lvscAutoHiddenCharm').onchange = syncSettingsFromUi;
        document.getElementById('lvscHiddenCharmRarity').onchange = syncSettingsFromUi;
        document.getElementById('lvscHiddenCharmBuyQty').onchange = syncSettingsFromUi;
        document.getElementById('lvscHiddenCharmRetryMs').onchange = syncSettingsFromUi;

        setPanelCollapsed(panel, localStorage.getItem('lvSpiritCleaner.collapsed') === '1');
        activatePanelTab(localStorage.getItem('lvSpiritCleaner.activeTab') || 'basic');
        refreshPlayer();
        showBuiltinReleaseOnce();
        startOnlineHeartbeat();
        setTimeout(function () { checkCloudUpdate(false); }, 1500);
        setInterval(function () { checkCloudUpdate(false); }, CLOUD_UPDATE_POLL_MS);
        setInterval(updateMeter, 2000);
    }

    function waitForGame() {
        if (document.body && (window.api || window._lastPlayerData || document.getElementById('exploreBtn'))) {
            buildPanel();
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
