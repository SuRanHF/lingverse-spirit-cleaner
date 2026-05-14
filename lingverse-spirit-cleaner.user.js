// ==UserScript==
// @name         LingVerse Spirit Cleaner
// @namespace    local.lingverse.tools
// @version      0.9.12
// @description  Authorized helper: spend LingVerse spirit, handle merchants, hire protectors, meditate, and maintain Void Body buff.
// @match        https://ling.muge.info/game.html*
// @match        http://ling.muge.info/game.html*
// @homepageURL  https://github.com/SuRanHF/lingverse-spirit-cleaner
// @supportURL   https://github.com/SuRanHF/lingverse-spirit-cleaner/issues
// @updateURL    https://raw.githubusercontent.com/SuRanHF/lingverse-spirit-cleaner/main/lingverse-spirit-cleaner.user.js
// @downloadURL  https://raw.githubusercontent.com/SuRanHF/lingverse-spirit-cleaner/main/lingverse-spirit-cleaner.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function injectIntoPage() {
    'use strict';

    var source = String.raw`
(function () {
    'use strict';

    if (window.__lvSpiritCleanerLoaded) return;
    window.__lvSpiritCleanerLoaded = true;

    var running = false;
    var monitoringSpirit = false;
    var autoTrialRunning = false;
    var autoTreasureRunning = false;
    var loopTimer = null;
    var busyEvent = false;
    var HIGH_FEE_CONFIRM_THRESHOLD = 500000;
    var SCRIPT_VERSION = '0.9.12';
    var DEFAULT_UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/SuRanHF/lingverse-spirit-cleaner/main/release.json';
    var BUILTIN_RELEASE = {
        version: SCRIPT_VERSION,
        title: '神识清理 v' + SCRIPT_VERSION,
        notes: [
            '商人自动购买新增商品关键词、品质优先和高价阈值配置。',
            '面板改成顶部菜单切换不同功能分类，窗口缩放时不再把大类混在一起。',
            '商人购买会先按筛选规则挑商品，买不到符合条件的商品再自动离开。'
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
        meditateStopSpirit: readNumber('lvSpiritCleaner.meditateStopSpirit', 0),
        monitorStartSpirit: readNumber('lvSpiritCleaner.monitorStartSpirit', 0),
        autoSelfFightWeak: localStorage.getItem('lvSpiritCleaner.autoSelfFightWeak') !== '0',
        selfFightPowerLimit: localStorage.getItem('lvSpiritCleaner.selfFightPowerLimit') || 'stable',
        selfFightMargin: readNumber('lvSpiritCleaner.selfFightMargin', 1.15),
        autoRecoveryMode: localStorage.getItem('lvSpiritCleaner.autoRecoveryMode') || 'both',
        autoRecoveryThreshold: readNumber('lvSpiritCleaner.autoRecoveryThreshold', 80),
        autoRecoveryTarget: readNumber('lvSpiritCleaner.autoRecoveryTarget', 100),
        autoHpPriority: localStorage.getItem('lvSpiritCleaner.autoHpPriority') || 'mp,pill,adpoint',
        autoMpPriority: localStorage.getItem('lvSpiritCleaner.autoMpPriority') || 'stone,pill,adpoint',
        updateManifestUrl: localStorage.getItem('lvSpiritCleaner.updateManifestUrl') || DEFAULT_UPDATE_MANIFEST_URL,
        autoVoidBody: localStorage.getItem('lvSpiritCleaner.autoVoidBody') !== '0',
        voidBodyRarity: readNumber('lvSpiritCleaner.voidBodyRarity', 5),
        voidBodyBuyQty: readNumber('lvSpiritCleaner.voidBodyBuyQty', 1)
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
        var meditateStopInput = document.getElementById('lvscMeditateStopSpirit');
        var monitorStartInput = document.getElementById('lvscMonitorStartSpirit');
        var selfFightInput = document.getElementById('lvscAutoSelfFightWeak');
        var selfFightPowerLimitInput = document.getElementById('lvscSelfFightPowerLimit');
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
        state.meditateStopSpirit = Math.max(0, Number(meditateStopInput && meditateStopInput.value || 0));
        state.monitorStartSpirit = Math.max(0, Number(monitorStartInput && monitorStartInput.value || 0));
        state.autoSelfFightWeak = !!(selfFightInput && selfFightInput.checked);
        state.selfFightPowerLimit = (selfFightPowerLimitInput && selfFightPowerLimitInput.value) || 'stable';
        if (['stable', 'balanced', 'slightlyStrong', 'weak', 'slightlyWeak', 'close'].indexOf(state.selfFightPowerLimit) < 0) state.selfFightPowerLimit = 'stable';
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
        localStorage.setItem('lvSpiritCleaner.meditateStopSpirit', String(state.meditateStopSpirit));
        localStorage.setItem('lvSpiritCleaner.monitorStartSpirit', String(state.monitorStartSpirit));
        localStorage.setItem('lvSpiritCleaner.autoSelfFightWeak', state.autoSelfFightWeak ? '1' : '0');
        localStorage.setItem('lvSpiritCleaner.selfFightPowerLimit', state.selfFightPowerLimit);
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
        if (info.player.isDead || window.playerDead) {
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

    function isGameNight() {
        if (typeof window.calcGameTime === 'function') {
            try {
                var gt = window.calcGameTime();
                if (gt && typeof gt.isNight === 'boolean') return gt.isNight;
            } catch (_) {}
        }

        var timeEl = document.getElementById('headerGameTime');
        if (!timeEl) return false;
        return timeEl.classList.contains('is-night') || String(timeEl.textContent || '').indexOf('(夜)') >= 0;
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

    async function meditateUntilSpiritFull() {
        if (!state.autoMeditate || !gameApi()) return false;
        var info = getSpiritInfo();
        if (!info.player || info.player.isDead || window.playerDead) return false;
        var targetSpirit = getMeditateTargetSpirit(info);
        if (info.maxSpirit <= 0 || info.spirit >= targetSpirit) return true;

        setStatus('神识不足，开始冥想到 ' + targetSpirit, 'run');
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
        var itemId = Number(item.id || item.itemId || item.inventoryId || 0);
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

            setStatus('坊市购买' + rarityName(rarity) + '虚空淬体丹 x' + buyQty, 'run');
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
        if (ok) setStatus('虚空淬体已补充', 'run');
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
        return String(state.merchantKeyword || '').split(/[\s,，、;；|]+/).map(function (part) {
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
            setStatus('处理商人中', 'run');
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

    function relationRank(value) {
        value = String(value || '').trim();
        if (!value) return null;
        if (/可稳战|碾压|极弱|很弱|明显弱|远弱|弱很多/.test(value)) return { key: 'stable', score: 1, label: '可稳战' };
        if (/势均力敌|接近|相近|差不多|相当|持平|同等|相等|相同/.test(value)) return { key: 'balanced', score: 2, label: '势均力敌' };
        if (/略强|稍强|偏强|小强/.test(value)) return { key: 'slightlyStrong', score: 3, label: '略强' };
        if (/高层压制/.test(value)) return { key: 'levelSuppress', score: 4, label: '高层压制' };
        if (/越阶强敌/.test(value)) return { key: 'realmDanger', score: 6, label: '越阶强敌' };
        if (/强敌|更强|较强|很强|明显强|远强|强于|高于/.test(value)) return { key: 'danger', score: 5, label: '强敌' };
        if (/仅供参考/.test(value)) return { key: 'unknown', score: 99, label: '仅供参考' };
        return null;
    }

    function relationLimitScore() {
        var key = state.selfFightPowerLimit || 'slightlyWeak';
        var scores = {
            weak: 1,
            slightlyWeak: 1,
            stable: 1,
            close: 2,
            balanced: 2,
            slightlyStrong: 3
        };
        return scores[key] || 2;
    }

    function relationLabelByScore(score) {
        if (score <= 1) return '可稳战';
        if (score === 2) return '势均力敌';
        if (score === 3) return '略强';
        if (score === 4) return '高层压制';
        if (score === 5) return '强敌';
        return '越阶强敌';
    }

    function relationFromPower(playerPower, monsterPower) {
        if (!(playerPower > 0) || !(monsterPower > 0)) return null;
        var ratio = monsterPower / playerPower;
        var score = 5;
        if (ratio < 0.85) score = 1;
        else if (ratio < 1.12) score = 2;
        else if (ratio < 1.35) score = 3;
        return {
            key: score <= 1 ? 'stable' : score === 2 ? 'balanced' : score === 3 ? 'slightlyStrong' : 'danger',
            score: score,
            label: relationLabelByScore(score),
            ratio: ratio
        };
    }

    function readEncounterPowerRelation(encounterData, playerPower, monsterPower) {
        encounterData = encounterData || {};
        var candidates = [
            encounterData.powerRelation,
            encounterData.combatPowerRelation,
            encounterData.powerComparison,
            encounterData.combatPowerComparison,
            encounterData.strengthRelation,
            encounterData.relativePower,
            encounterData.powerLevelText,
            textFromFirstElement(['encounterPowerRelation', 'encounterCombatPowerRelation', 'encounterPowerCompare', 'encounterPowerComparison'])
        ];
        var text = overlayText();
        var overlayMatch = text.match(/(?:战力|实力|威胁|强度)[^，。；\n]*(可稳战|势均力敌|略强|高层压制|强敌|越阶强敌|仅供参考|碾压|明显弱|稍弱|略弱|接近|相近|相当|同等|稍强|更强|明显强)/);
        if (overlayMatch) candidates.push(overlayMatch[1]);
        for (var i = 0; i < candidates.length; i++) {
            var relation = relationRank(candidates[i]);
            if (relation) return relation;
        }
        return relationFromPower(playerPower, monsterPower);
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
        var mHp = combatNumber(encounterData.monsterHp);
        var mAtk = combatNumber(encounterData.monsterAtk);
        var mDef = combatNumber(encounterData.monsterDef);
        var pHp = Number(p.hp || 0);
        var pAtk = Number(p.attack || 0);
        var pDef = Number(p.defense || 0);
        var playerPower = firstCombatValue(p, ['combatPower', 'battlePower', 'power', 'fightPower', 'strength', 'totalPower']);
        var monsterPower = firstCombatValue(encounterData, ['monsterPower', 'monsterCombatPower', 'combatPower', 'battlePower', 'power', 'fightPower', 'strength', 'totalPower']);
        var powerRelation = readEncounterPowerRelation(encounterData, playerPower, monsterPower);
        if (powerRelation) {
            var limit = relationLimitScore();
            if (powerRelation.score > limit) {
                return {
                    safe: false,
                    reason: '战力' + powerRelation.label + '，超过自战上限“' + relationLabelByScore(limit) + '及以下”',
                    summary: '自身战力 ' + (playerPower || '?') + '；妖兽战力 ' + (monsterPower || '?')
                };
            }
        }

        var mStage = Number(window._currentEncounterMonsterStage || 0);
        if (!mStage && typeof window.parseRealmStageName === 'function') {
            mStage = window.parseRealmStageName(encounterData.monsterRealmName || '');
        }
        var pStage = Number(p.realmStage || 0);
        if (mStage > pStage) {
            return { safe: false, reason: '妖兽境界更高' };
        }

        var tooHigh = [];
        if (pHp > 0 && mHp > pHp * margin) tooHigh.push('生命');
        if (pAtk > 0 && mAtk > pAtk * margin) tooHigh.push('攻击');
        if (pDef > 0 && mDef > pDef * margin) tooHigh.push('防御');
        if (tooHigh.length) {
            return { safe: false, reason: '妖兽' + tooHigh.join('、') + '超出接近倍率' };
        }

        if (pAtk > 0 && pHp > 0) {
            var playerDamage = Math.max(1, pAtk - mDef);
            var monsterDamage = Math.max(1, mAtk - pDef);
            var turnsToKillMonster = Math.ceil(Math.max(1, mHp) / playerDamage);
            var turnsToKillPlayer = Math.ceil(pHp / monsterDamage);
            if (turnsToKillPlayer < turnsToKillMonster) {
                return { safe: false, reason: '粗略回合模拟不占优' };
            }
        }

        return {
            safe: true,
            reason: powerRelation ? ('战力' + powerRelation.label + '，未超过自战上限') : '妖兽数值未明显高于自身',
            summary: powerRelation ? ('自身战力 ' + (playerPower || '?') + '；妖兽战力 ' + (monsterPower || '?')) : ('妖兽 HP/攻/防 ' + mHp + '/' + mAtk + '/' + mDef + '；自身 ' + pHp + '/' + pAtk + '/' + pDef)
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
            stop(sourceLabel + '后角色陨落');
            return false;
        }
        if (data && data.status === 'encounter_expired') {
            setStatus('妖兽遭遇已结束', 'warn');
        } else if (data && data.status === 'defeat') {
            stop(sourceLabel + '失败，已暂停');
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
                name: p.name || '护道者',
                fee: togetherFee,
                mode: 'together'
            });
            candidates.push({
                id: p.playerId,
                name: p.name || '护道者',
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
                stop('护道后角色陨落');
                return false;
            }

            toast('已雇佣护道：' + cheapest.name + '（' + cheapest.fee + '灵石，' + (cheapest.mode === 'alone' ? '单独' : '协同') + '）');
            if (typeof window.loadInventory === 'function') window.loadInventory();
            if (typeof window.loadGameLogs === 'function') window.loadGameLogs();
            await refreshPlayer();
            return true;
        } catch (err) {
            console.warn('[LingVerse Spirit Cleaner] protector hiring failed', err);
            stop('护道处理异常，已暂停');
            return false;
        } finally {
            busyEvent = false;
        }
    }

    async function handleSpecialEvents() {
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
                        setStatus('试炼开始失败：' + ((startRes && startRes.message) || '未知错误'), 'warn');
                        autoTrialRunning = false;
                        break;
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

                setStatus('试炼挑战第 ' + (info.activeFloor || '?') + ' 层', 'run');
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
        autoTreasureRunning = true;
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
                    setStatus('角色已陨落，停止刷图', 'warn');
                    autoTreasureRunning = false;
                    break;
                }
                if (info.player && info.spirit < 3) {
                    setStatus('神识不足 3，停止刷图', 'warn');
                    autoTreasureRunning = false;
                    break;
                }

                var map = await findTreasureMap();
                if (!map) {
                    setStatus('背包没有藏宝图，停止刷图', 'warn');
                    autoTreasureRunning = false;
                    break;
                }

                setStatus('使用藏宝图：剩余 ' + itemQuantity(map), 'run');
                var used = callPageFunction('useItem', [Number(map.id || map.itemId || 0)]);
                if (used && typeof used.then === 'function') await used;
                else if (!used) await gameApi().post('/api/game/use-item', { itemId: Number(map.id || map.itemId || 0) });
                await sleep(state.delayMs);
            } catch (err) {
                console.warn('[LingVerse Spirit Cleaner] auto treasure failed', err);
                setStatus('自动刷藏宝图异常，等待重试', 'warn');
                await sleep(state.delayMs);
            }
        }

        updateMeter();
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
        monitoringSpirit = false;
        running = true;
        syncSettingsFromUi();
        normalizeMultiplier();
        updateMeter();
        setStatus('启动中', 'run');
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

            if (state.autoVoidBody && !hasVoidBodyBuff()) {
                if (await ensureVoidBodyBuff(false)) {
                    await sleep(state.delayMs);
                    continue;
                }
                stop('虚空淬体补充失败，已暂停');
                return;
            }

            var stopReason = shouldStopBeforeAction();
            if (stopReason) {
                if (stopReason === 'need_meditate') {
                    if (await meditateUntilSpiritFull()) {
                        if (!state.autoExploreAfterMeditate) {
                            stop('已收功，自动探索关闭');
                            return;
                        }
                        await sleep(state.delayMs);
                        continue;
                    }
                    stop('神识不足，自动冥想失败');
                    return;
                }
                stop(stopReason);
                return;
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
                                stop('已收功，自动探索关闭');
                                return;
                            }
                            await sleep(state.delayMs);
                            continue;
                        }
                    }
                    stop('游戏事件触发，已暂停');
                    return;
                }
            } catch (err) {
                console.warn('[LingVerse Spirit Cleaner] explore failed', err);
                stop('探索异常，已暂停');
                return;
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

    function showUpdateNotice(release, options) {
        release = release || BUILTIN_RELEASE;
        options = options || {};
        var old = document.getElementById('lvscUpdateModal');
        if (old) old.remove();

        var notes = normalizeNotes(release.notes);
        if (!notes.length) notes = ['云端版本已更新，暂无详细变更说明。'];
        var modal = document.createElement('div');
        modal.id = 'lvscUpdateModal';
        modal.innerHTML =
            '<div class="lvsc-update-backdrop"></div>' +
            '<div class="lvsc-update-card">' +
            '<div class="lvsc-update-kicker">' + escapeLocalHtml(options.kicker || '更新公告') + '</div>' +
            '<div class="lvsc-update-title">' + escapeLocalHtml(release.title || ('神识清理 v' + release.version)) + '</div>' +
            '<div class="lvsc-update-version">当前 ' + escapeLocalHtml(SCRIPT_VERSION) + ' · 公告 ' + escapeLocalHtml(release.version || '-') + '</div>' +
            '<ul>' + notes.map(function (note) { return '<li>' + escapeLocalHtml(note) + '</li>'; }).join('') + '</ul>' +
            (release.downloadUrl ? '<a class="lvsc-update-link" href="' + escapeLocalHtml(release.downloadUrl) + '" target="_blank" rel="noopener">打开更新地址</a>' : '') +
            '<button id="lvscUpdateCloseBtn">知道了</button>' +
            '</div>';
        document.body.appendChild(modal);

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
        syncSettingsFromUi();
        var url = state.updateManifestUrl;
        if (!url) {
            if (manual) setStatus('请先填写云端公告 JSON 地址', 'warn');
            return;
        }
        try {
            setStatus('检测云端更新中', 'run');
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
            if (newer && localStorage.getItem(seenKey) !== release.version) {
                showUpdateNotice(release, { seenKey: seenKey, kicker: '发现云端新版本' });
                setStatus('发现云端新版本 ' + release.version, 'warn');
            } else if (manual) {
                showUpdateNotice(release, { kicker: newer ? '云端新版本' : '云端公告' });
                setStatus(newer ? '云端有新版本 ' + release.version : '当前已是最新：' + SCRIPT_VERSION, newer ? 'warn' : 'run');
            } else {
                setStatus(newer ? '云端有新版本 ' + release.version : '云端更新检测完成', newer ? 'warn' : 'idle');
            }
        } catch (err) {
            console.warn('[LingVerse Spirit Cleaner] cloud update check failed', err);
            if (manual) setStatus('云端更新检测失败：' + (err.message || '未知错误'), 'warn');
        }
    }

    function activatePanelTab(tabName) {
        var allowed = ['basic', 'merchant', 'combat', 'flow', 'update'];
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
            '#lvscPanel{position:fixed;right:18px;bottom:18px;z-index:99999;width:min(460px,calc(100vw - 36px));height:min(720px,calc(100vh - 36px));min-width:300px;min-height:260px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);display:flex;flex-direction:column;background:rgba(17,20,29,.94);color:#f5f1e8;border:1px solid rgba(219,185,112,.45);box-shadow:0 16px 48px rgba(0,0,0,.38);border-radius:10px;font:13px/1.45 "Microsoft YaHei",sans-serif;overflow:hidden;resize:none;touch-action:none;container-type:inline-size}',
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
            '#lvscPanel.lvsc-collapsed #lvscCompactBar{display:flex}',
            '#lvscPanel.lvsc-collapsed #lvscResizeHandle{display:none}',
            '#lvscPanel label{display:grid;gap:4px;min-width:0;color:#cfc6b2;font-size:12px}',
            '#lvscPanel input[type=number],#lvscPanel input[type=text],#lvscPanel select{width:100%;height:29px;border-radius:6px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;padding:0 8px;font-size:12px}',
            '#lvscPanel input[type=checkbox]{margin-right:6px}',
            '#lvscPanel select option{background:#17141d;color:#fff}',
            '.lvsc-meter{display:grid;gap:7px;padding:9px;border:1px solid rgba(216,180,254,.2);border-radius:8px;background:rgba(216,180,254,.05)}',
            '#lvscTabs{position:sticky;top:-12px;z-index:3;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin:-2px -2px 0;padding:4px 2px 6px;background:rgba(17,20,29,.96);border-bottom:1px solid rgba(255,255,255,.08)}',
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
            '#lvscActions{position:sticky;bottom:-12px;z-index:2;display:flex;gap:8px;margin:0 -12px -12px;padding:10px 12px 12px;background:linear-gradient(180deg,rgba(17,20,29,.72),rgba(17,20,29,.98) 35%)}',
            '#lvscRunBtn{flex:1;height:34px;background:#dbb970;color:#17141d}',
            '#lvscRefreshBtn{width:72px;height:34px;background:rgba(255,255,255,.08);color:#f5f1e8;border:1px solid rgba(255,255,255,.12)!important}',
            '#lvscMonitorBtn{height:34px;background:rgba(155,231,195,.16);color:#9be7c3;border:1px solid rgba(155,231,195,.28)!important}',
            '#lvscAutoTrialBtn,#lvscAutoTreasureBtn{height:34px;background:rgba(216,180,254,.14);color:#d8b4fe;border:1px solid rgba(216,180,254,.28)!important}',
            '#lvscSelfFightBtn,#lvscAutoRecoveryBtn,#lvscVoidBodyBtn,#lvscCheckUpdateBtn{height:32px;background:rgba(155,231,195,.16);color:#9be7c3;border:1px solid rgba(155,231,195,.28)!important}',
            '#lvscAutoRecoveryBtn{align-self:end}',
            '#lvscUpdateModal{position:fixed;inset:0;z-index:100000;color:#f5f1e8;font:13px/1.55 "Microsoft YaHei",sans-serif}',
            '.lvsc-update-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(2px)}',
            '.lvsc-update-card{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(420px,calc(100vw - 28px));max-height:82vh;overflow:auto;padding:18px;border-radius:12px;background:rgba(17,20,29,.98);border:1px solid rgba(219,185,112,.5);box-shadow:0 18px 60px rgba(0,0,0,.55)}',
            '.lvsc-update-kicker{font-size:12px;color:#dbb970;font-weight:700;margin-bottom:4px}',
            '.lvsc-update-title{font-size:18px;font-weight:800;margin-bottom:2px}',
            '.lvsc-update-version{font-size:12px;color:#9be7c3;margin-bottom:12px}',
            '.lvsc-update-card ul{margin:0 0 14px 18px;padding:0;color:#e9dfcf}',
            '.lvsc-update-card li{margin:6px 0}',
            '.lvsc-update-link{display:inline-block;color:#d8b4fe;margin-bottom:12px;text-decoration:none}',
            '#lvscUpdateCloseBtn{width:100%;height:34px;background:#dbb970;color:#17141d}',
            '#lvscResizeHandle{position:absolute;right:3px;bottom:3px;z-index:5;width:18px;height:18px;cursor:nwse-resize;border-radius:3px;background:linear-gradient(135deg,transparent 0 45%,rgba(219,185,112,.75) 46% 52%,transparent 53% 62%,rgba(219,185,112,.65) 63% 69%,transparent 70%);opacity:.85}',
            '@container (max-width: 380px){.lvsc-grid2,.lvsc-field-grid,.lvsc-card-grid{grid-template-columns:1fr}#lvscTabs{grid-template-columns:repeat(3,minmax(0,1fr))}.lvsc-tab{font-size:11px}}',
            '@media (max-width: 520px){#lvscPanel{right:8px;bottom:8px;width:min(340px,calc(100vw - 16px));height:min(620px,calc(100vh - 16px));max-width:calc(100vw - 16px);max-height:78vh;font-size:12px}#lvscBody{gap:8px;padding:10px}#lvscTabs{top:-10px}#lvscPanel input[type=number],#lvscPanel input[type=text],#lvscPanel select{height:34px}#lvscActions button,#lvscSelfFightBtn,#lvscAutoRecoveryBtn,#lvscVoidBodyBtn,#lvscCheckUpdateBtn{height:38px}#lvscPanel.lvsc-collapsed{width:calc(100vw - 16px)!important;border-radius:12px}#lvscCompactStatus{max-width:none}}'
        ].join('');
        document.head.appendChild(style);

        var panel = document.createElement('div');
        panel.id = 'lvscPanel';
        panel.innerHTML =
            '<header><span id="lvscTitle"><span id="lvscTitleText">神识清理</span></span><span id="lvscHeaderActions"><button id="lvscCollapseBtn" title="收起成横栏">收起</button><button id="lvscClose" title="隐藏">×</button></span></header>' +
            '<div id="lvscStatus" data-tone="idle">待命</div>' +
            '<div id="lvscCompactBar"><span id="lvscCompactSpirit">读取中</span><span id="lvscCompactStatus" data-tone="idle">待命</span><button id="lvscCompactRunBtn">开始</button><button id="lvscCompactMonitorBtn">监测</button><button id="lvscExpandBtn">展开</button></div>' +
            '<div id="lvscBody">' +
            '<div class="lvsc-meter"><div id="lvscSpiritValue">读取中...</div><div id="lvscSpiritTrack"><div id="lvscSpiritFill"></div></div></div>' +
            '<div id="lvscTabs">' +
            '<button class="lvsc-tab" data-tab="basic">基础</button>' +
            '<button class="lvsc-tab" data-tab="merchant">商人护道</button>' +
            '<button class="lvsc-tab" data-tab="combat">妖兽恢复</button>' +
            '<button class="lvsc-tab" data-tab="flow">自动流程</button>' +
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
            '<label>灵石上限<input id="lvscHireMaxFee" type="number" min="0" step="1" title="填 0 表示不限制"></label>' +
            '<label>护道重试上限<input id="lvscHireRetryLimit" type="number" min="1" max="10" step="1"></label>' +
            '<label>商人策略<select id="lvscMerchantMode"><option value="legend">传说才买</option><option value="custom">按条件购买</option><option value="leave">直接离去</option></select></label>' +
            '<label>商品关键词<input id="lvscMerchantKeyword" type="text" placeholder="多个用空格或逗号隔开"></label>' +
            '<label>高价阈值(灵石)<input id="lvscMerchantMaxPrice" type="number" min="0" step="1" title="填 0 表示不限制"></label>' +
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
            '<label>自战上限<select id="lvscSelfFightPowerLimit"><option value="stable">可稳战及以下</option><option value="balanced">势均力敌及以下</option><option value="slightlyStrong">略强及以下</option></select></label>' +
            '<label>接近倍率<input id="lvscSelfFightMargin" type="number" min="1" max="3" step="0.05" title="1.15 表示妖兽数值不超过自身 115% 时可自战"></label>' +
            '<button id="lvscSelfFightBtn">检查并自战</button>' +
            '</div>' +
            '<label class="lvsc-check"><input id="lvscAutoHire" type="checkbox">无法自战时自动雇最低价护道</label>' +
            '<div class="lvsc-help">优先按战力评价判断；没有战力时回退到生命、攻击、防御和境界。可自战时优先于护道。</div>' +
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
            '</div>' +
            '<div class="lvsc-section">' +
            '<div class="lvsc-section-title">藏宝图</div>' +
            '<div class="lvsc-grid2">' +
            '<button id="lvscAutoTrialBtn">自动试炼</button>' +
            '<button id="lvscAutoTreasureBtn">自动刷藏宝图</button>' +
            '</div>' +
            '<div class="lvsc-help">试炼会消耗重置所需资源；刷图会使用背包藏宝图，遇守卫按护道配置处理。</div>' +
            '</div>' +
            '<div class="lvsc-section">' +
            '<div class="lvsc-section-title">虚空淬体</div>' +
            '<label class="lvsc-check"><input id="lvscAutoVoidBody" type="checkbox">探索前自动补加成</label>' +
            '<div class="lvsc-grid2">' +
            '<label>丹药等级<select id="lvscVoidRarity"><option value="1">普通</option><option value="2">优良</option><option value="3">稀有</option><option value="4">史诗</option><option value="5">传说</option></select></label>' +
            '<label>坊市购买数<input id="lvscVoidBuyQty" type="number" min="1" max="999" step="1"></label>' +
            '</div>' +
            '<button id="lvscVoidBodyBtn">检查/补淬体</button>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '<div class="lvsc-category lvsc-tab-panel" data-tab-panel="update">' +
            '<div class="lvsc-category-title">更新公告<small>v' + SCRIPT_VERSION + '</small></div>' +
            '<div class="lvsc-field-grid">' +
            '<label>云端公告 JSON<input id="lvscUpdateManifestUrl" type="text" placeholder="' + DEFAULT_UPDATE_MANIFEST_URL + '"></label>' +
            '<button id="lvscCheckUpdateBtn">检查云端更新</button>' +
            '</div>' +
            '<div class="lvsc-help">默认读取 GitHub 公告。脚本管理器会根据 updateURL/downloadURL 检测并提示下载安装。</div>' +
            '</div>' +
            '<div id="lvscActions"><button id="lvscRunBtn">开始清理</button><button id="lvscMonitorBtn">监测神识</button><button id="lvscRefreshBtn">刷新</button></div>' +
            '<div id="lvscAuthor">作者：SuH2RanZ1</div>' +
            '</div>' +
            '<div id="lvscResizeHandle" title="拖拽调节面板大小"></div>';
        document.body.appendChild(panel);
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
        document.getElementById('lvscSelfFightPowerLimit').value = String(state.selfFightPowerLimit);
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
        document.getElementById('lvscAutoVoidBody').checked = state.autoVoidBody;
        document.getElementById('lvscVoidRarity').value = String(state.voidBodyRarity);
        document.getElementById('lvscVoidBuyQty').value = String(state.voidBodyBuyQty);
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
        document.getElementById('lvscSelfFightPowerLimit').onchange = syncSettingsFromUi;
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
        document.getElementById('lvscAutoVoidBody').onchange = syncSettingsFromUi;
        document.getElementById('lvscVoidRarity').onchange = syncSettingsFromUi;
        document.getElementById('lvscVoidBuyQty').onchange = syncSettingsFromUi;

        setPanelCollapsed(panel, localStorage.getItem('lvSpiritCleaner.collapsed') === '1');
        activatePanelTab(localStorage.getItem('lvSpiritCleaner.activeTab') || 'basic');
        refreshPlayer();
        showBuiltinReleaseOnce();
        setTimeout(function () { checkCloudUpdate(false); }, 1500);
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
