// ==UserScript==
// @name         灵田辅助
// @namespace    https://ling.muge.info/
// @version      2.3
// @description  自动收获成熟灵田 + 一键种植选定作物（种子列表实时获取 + 记忆上次选择）
// @author       User
// @match        https://ling.muge.info/game.html
// @match        https://ling.muge.info/game
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 主题模块（支持亮色/暗色自动切换 + 移动端适配） ====================
    (function() {
        const styleText = `
            .ling-atp-container { position: fixed; z-index: 999999999; font-family: "Microsoft YaHei", 微软雅黑, "PingFang SC", "Helvetica Neue", sans-serif; }
            .ling-atp-container.ling-atp-pinned { z-index: 2147483647 !important; }
            .ling-atp-panel { width: 320px; background: var(--ling-atp-bg); border: 2px solid var(--ling-atp-border); border-radius: 12px; box-shadow: var(--ling-atp-shadow); overflow: hidden; display: flex; flex-direction: column; transition: box-shadow 0.5s, border-color 0.5s; }
            .ling-atp-panel.breathing-blue { animation: ling-atp-panel-breathe-blue 2s ease-in-out infinite; }
            @keyframes ling-atp-panel-breathe-blue { 0%,100% { box-shadow: 0 0 12px rgba(74,192,224,0.3), 0 0 24px rgba(74,192,224,0.1); border-color: rgba(74,192,224,0.4); } 50% { box-shadow: 0 0 24px rgba(74,192,224,0.6), 0 0 48px rgba(74,192,224,0.2); border-color: rgba(74,192,224,0.9); } }
            .ling-atp-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: var(--ling-atp-header-bg); border-bottom: 2px solid var(--ling-atp-border2); user-select: none; cursor: move; flex-shrink: 0; transition: all 0.3s; touch-action: none; -webkit-touch-callout: none; }
            .ling-atp-header.collapsed { padding: 6px 14px; border-bottom: none; }
            .ling-atp-header.collapsed .ling-atp-title { font-size: 13px; }
            .ling-atp-title { display: flex; align-items: center; gap: 8px; color: var(--ling-atp-gold); font-size: 14px; font-weight: 700; letter-spacing: 2px; pointer-events: none; transition: all 0.3s; }
            .ling-atp-title-icon { font-size: 16px; }
            .ling-atp-header-btns { display: flex; gap: 6px; }
            .ling-atp-header-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: 2px solid var(--ling-atp-btn-border); border-radius: 4px; background: var(--ling-atp-btn-bg); color: var(--ling-atp-gold); cursor: pointer; font-size: 16px; transition: all 0.2s; touch-action: manipulation; }
            .ling-atp-header-btn:hover { background: var(--ling-atp-btn-hover-bg); border-color: var(--ling-atp-btn-hover-border); }
            .ling-atp-header-btn.pin-active { background: var(--ling-atp-pin-active-bg); border-color: var(--ling-atp-pin-active-border); color: var(--ling-atp-pin-active-color); }
            .ling-atp-body-wrap { overflow: hidden; transition: max-height 0.3s; flex: 1; min-height: 0; display: flex; flex-direction: column; touch-action: pan-y; overscroll-behavior-y: contain; }
            .ling-atp-body { padding: 14px; display: flex; flex-direction: column; gap: 10px; max-height: 55vh; overflow-y: auto; -webkit-overflow-scrolling: touch; flex: 1; min-height: 0; touch-action: pan-y; overscroll-behavior-y: contain; }
            .ling-atp-body::-webkit-scrollbar { width: 4px; }
            .ling-atp-body::-webkit-scrollbar-track { background: transparent; }
            .ling-atp-body::-webkit-scrollbar-thumb { background: var(--ling-atp-scrollbar-thumb); border-radius: 3px; }
            .ling-atp-status-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--ling-atp-glass); border: 2px solid var(--ling-atp-border3); border-radius: 6px; font-size: 12px; color: var(--ling-atp-text2); }
            .ling-atp-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: var(--ling-atp-text3); transition: background 0.3s; }
            .ling-atp-status-dot.idle { background: var(--ling-atp-text3); }
            .ling-atp-status-dot.running { background: #4ac0e0; box-shadow: 0 0 6px rgba(74,192,224,0.5); animation: ling-atp-pulse 1.5s ease-in-out infinite; }
            .ling-atp-status-dot.success { background: #3dab97; box-shadow: 0 0 6px rgba(61,171,151,0.5); }
            .ling-atp-status-dot.error { background: #e06060; box-shadow: 0 0 6px rgba(224,96,96,0.5); }
            @keyframes ling-atp-pulse { 0%,100%{opacity:1;} 50%{opacity:0.4;} }
            .ling-atp-status-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .ling-atp-stats { display: grid; gap: 8px; flex-shrink: 0; }
            .ling-atp-stat-item { padding: 10px 12px; background: var(--ling-atp-glass); border: 2px solid var(--ling-atp-border3); border-radius: 6px; text-align: center; }
            .ling-atp-stat-label { font-size: 11px; color: var(--ling-atp-text3); margin-bottom: 4px; letter-spacing: 1px; }
            .ling-atp-stat-value { font-size: 20px; font-weight: 700; color: var(--ling-atp-text); }
            .ling-atp-stat-value.gold { color: var(--ling-atp-gold); }
            .ling-atp-actions { display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
            .ling-atp-btn { width: 100%; padding: 12px 10px; border: 2px solid var(--ling-atp-action-border); border-radius: 6px; background: var(--ling-atp-action-bg); color: var(--ling-atp-gold2); font-family: inherit; font-size: 15px; font-weight: 700; letter-spacing: 3px; cursor: pointer; transition: all 0.2s; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
            .ling-atp-btn:hover { background: var(--ling-atp-action-hover-bg); border-color: var(--ling-atp-action-hover-border); }
            .ling-atp-btn:active { transform: scale(0.97); }
            .ling-atp-btn:disabled { opacity: 0.4; cursor: not-allowed; }
            .ling-atp-log { margin-top: 4px; padding: 8px 10px; background: var(--ling-atp-log-bg); border: 2px solid var(--ling-atp-log-border); border-radius: 6px; height: 180px; min-height: 180px; max-height: 180px; overflow-y: auto; font-size: 11px; color: var(--ling-atp-text3); line-height: 1.6; font-family: Consolas, "Microsoft YaHei", monospace; flex-shrink: 0; }
            .ling-atp-log-entry { padding: 1px 0; word-break: break-all; white-space: pre-wrap; }
            .ling-atp-log-entry.info { color: var(--ling-atp-text3); }
            .ling-atp-log-entry.warn { color: #c88820; }
            .ling-atp-log-entry.success { color: var(--ling-atp-jade); }
            .ling-atp-log-entry.error { color: var(--ling-atp-red); }
            .ling-atp-log-entry.gold { color: var(--ling-atp-gold); font-weight: bold; }
            /* 美化下拉框 */
            .ling-atp-select-wrapper { margin-bottom: 6px; }
            .ling-atp-select-label { font-size: 12px; margin-bottom: 6px; color: var(--ling-atp-gold); display: flex; align-items: center; gap: 6px; letter-spacing: 1px; }
            .ling-atp-select-label::before { content: "🌱"; font-size: 13px; }
            .ling-atp-select { width: 100%; padding: 10px 12px; background: var(--ling-atp-bg2); border: 2px solid var(--ling-atp-border3); border-radius: 8px; color: var(--ling-atp-text); font-family: inherit; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s ease; appearance: none; -webkit-appearance: none; background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23c9993a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>"); background-repeat: no-repeat; background-position: right 12px center; background-size: 14px; }
            .ling-atp-select:hover { border-color: var(--ling-atp-gold); background-color: var(--ling-atp-glass); box-shadow: 0 0 0 1px rgba(201,153,58,0.2); }
            .ling-atp-select:focus { outline: none; border-color: var(--ling-atp-gold); box-shadow: 0 0 0 2px rgba(201,153,58,0.3); }
            .ling-atp-select option { background: var(--ling-atp-bg); color: var(--ling-atp-text); padding: 8px; }
            .ling-atp-config-overlay { position: fixed; inset: 0; z-index: 1000000; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; padding: 16px; }
            .ling-atp-config-dialog { width: 380px; max-width: 100%; max-height: 85vh; background: var(--ling-atp-bg); border: 2px solid var(--ling-atp-border); border-radius: 12px; box-shadow: var(--ling-atp-config-shadow); overflow: hidden; display: flex; flex-direction: column; touch-action: none; }
            .ling-atp-config-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; background: var(--ling-atp-header-bg); border-bottom: 2px solid var(--ling-atp-border2); flex-shrink: 0; }
            .ling-atp-config-title { color: var(--ling-atp-gold); font-size: 16px; font-weight: 700; letter-spacing: 2px; }
            .ling-atp-config-close { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 2px solid var(--ling-atp-btn-border); border-radius: 4px; background: var(--ling-atp-btn-bg); color: var(--ling-atp-gold); cursor: pointer; font-size: 18px; transition: all 0.2s; touch-action: manipulation; }
            .ling-atp-config-body { padding: 16px; display: flex; flex-direction: column; gap: 10px; overflow-y: auto; flex: 1; -webkit-overflow-scrolling: touch; touch-action: pan-y; }
            .ling-atp-section-title { font-size: 12px; color: var(--ling-atp-text3); letter-spacing: 2px; padding: 4px 0; border-bottom: 1px solid var(--ling-atp-border3); }
            .ling-atp-toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: var(--ling-atp-glass); border: 2px solid var(--ling-atp-border3); border-radius: 6px; font-size: 14px; color: var(--ling-atp-text2); user-select: none; transition: all 0.15s; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
            .ling-atp-toggle-row input[type="checkbox"] { accent-color: var(--ling-atp-accent-check); width: 18px; height: 18px; cursor: pointer; flex-shrink: 0; }
            .ling-atp-toggle-row input[type="number"] { width: 65px; padding: 6px 8px; background: var(--ling-atp-bg2); border: 2px solid var(--ling-atp-input-border); border-radius: 4px; color: var(--ling-atp-text); text-align: center; font-family: inherit; font-size: 14px; flex-shrink: 0; }
            .ling-atp-config-footer { padding: 12px 16px; border-top: 2px solid var(--ling-atp-config-footer-border); flex-shrink: 0; }
            .ling-atp-config-save-btn { width: 100%; padding: 14px 10px; border: 2px solid var(--ling-atp-action-border); border-radius: 6px; background: var(--ling-atp-action-bg); color: var(--ling-atp-gold2); font-family: inherit; font-size: 16px; font-weight: 700; letter-spacing: 3px; cursor: pointer; touch-action: manipulation; }
            .ling-atp-float-btn { position: fixed; width: 44px; height: 44px; border-radius: 50%; background: var(--ling-atp-float-bg); border: 2px solid var(--ling-atp-border); color: var(--ling-atp-gold); font-size: 20px; cursor: grab; z-index: 99998; display: flex; align-items: center; justify-content: center; user-select: none; -webkit-user-select: none; transition: box-shadow 0.5s, border-color 0.5s; touch-action: none; -webkit-touch-callout: none; }
            .ling-atp-float-btn.breathing { animation: ling-atp-float-breathe 2s ease-in-out infinite; }
            @keyframes ling-atp-float-breathe { 0%,100% { box-shadow: 0 0 12px rgba(102,187,106,0.4), 0 0 24px rgba(102,187,106,0.15); border-color: #66bb6a; } 50% { box-shadow: 0 0 24px rgba(102,187,106,0.8), 0 0 48px rgba(102,187,106,0.35); border-color: #81c784; } }
            .hidden { display: none !important; }
            /* 移动端专用样式 */
            @media (max-width: 768px) {
                .ling-atp-container { top: auto !important; bottom: 0 !important; right: 0 !important; left: 0 !important; transform: none !important; }
                .ling-atp-panel { width: 100%; max-height: 70vh; border-radius: 14px 14px 0 0; border-bottom: none; display: flex; flex-direction: column; overflow: hidden; }
                .ling-atp-header { padding: 14px 16px; flex-shrink: 0; cursor: default; }
                .ling-atp-header.collapsed { padding: 8px 16px; }
                .ling-atp-title { font-size: 16px; }
                .ling-atp-header-btn { width: 32px; height: 32px; font-size: 18px; }
                .ling-atp-body-wrap { flex: 1; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; touch-action: pan-y; overscroll-behavior-y: contain; }
                .ling-atp-body { padding: 12px 14px; gap: 10px; max-height: none; overflow: visible; flex: none; }
                .ling-atp-stat-value { font-size: 22px; }
                .ling-atp-btn { padding: 14px 10px; font-size: 16px; }
                .ling-atp-log { height: 260px; min-height: 260px; max-height: 260px; flex-shrink: 0; }
                .ling-atp-float-btn { width: 44px; height: 44px; font-size: 20px; }
                .ling-atp-config-overlay { padding: 0; align-items: flex-end; }
                .ling-atp-config-dialog { width: 100%; max-width: 100%; max-height: 85vh; border-radius: 14px 14px 0 0; border-bottom: none; }
                .ling-atp-toggle-row { padding: 14px 16px; font-size: 14px; }
                .ling-atp-config-save-btn { padding: 16px 10px; font-size: 17px; }
            }
        `;

        function updateThemeStyle() {
            const html = document.documentElement;
            const isLight = html.classList.contains('theme-light');
            const vars = {
                '--ling-atp-bg': isLight ? '#faf8f5' : '#151d2e',
                '--ling-atp-bg2': isLight ? '#f5f0e8' : '#111827',
                '--ling-atp-border': isLight ? 'rgba(180,140,50,0.5)' : 'rgba(201,153,58,0.45)',
                '--ling-atp-border2': isLight ? 'rgba(180,140,50,0.35)' : 'rgba(201,153,58,0.3)',
                '--ling-atp-border3': isLight ? 'rgba(180,140,50,0.2)' : 'rgba(201,153,58,0.18)',
                '--ling-atp-gold': isLight ? '#8b6914' : '#c9993a',
                '--ling-atp-gold2': isLight ? '#7a5c10' : '#c9993a',
                '--ling-atp-text': isLight ? '#3d3328' : '#e8e0d0',
                '--ling-atp-text2': isLight ? '#5a5246' : '#a8a090',
                '--ling-atp-text3': isLight ? '#8a8278' : '#6a6560',
                '--ling-atp-jade': isLight ? '#2d8a78' : '#3dab97',
                '--ling-atp-red': isLight ? '#c04040' : '#e06060',
                '--ling-atp-glass': isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
                '--ling-atp-glass2': isLight ? 'rgba(0,0,0,0.01)' : 'rgba(255,255,255,0.01)',
                '--ling-atp-border-glass': isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
                '--ling-atp-shadow': isLight ? '0 0 30px rgba(0,0,0,0.12)' : '0 0 30px rgba(0,0,0,0.6)',
                '--ling-atp-config-shadow': isLight ? '0 0 40px rgba(0,0,0,0.2)' : '0 0 40px rgba(0,0,0,0.7)',
                '--ling-atp-header-bg': isLight ? 'linear-gradient(90deg, rgba(180,140,50,0.1) 0%, rgba(180,140,50,0.04) 100%)' : 'linear-gradient(90deg, rgba(201,153,58,0.12) 0%, rgba(201,153,58,0.06) 100%)',
                '--ling-atp-btn-border': isLight ? 'rgba(180,140,50,0.45)' : 'rgba(201,153,58,0.4)',
                '--ling-atp-btn-bg': isLight ? 'rgba(180,140,50,0.06)' : 'rgba(201,153,58,0.08)',
                '--ling-atp-btn-hover-bg': isLight ? 'rgba(180,140,50,0.16)' : 'rgba(201,153,58,0.2)',
                '--ling-atp-btn-hover-border': isLight ? 'rgba(180,140,50,0.7)' : 'rgba(201,153,58,0.6)',
                '--ling-atp-pin-active-bg': isLight ? 'rgba(200,160,30,0.25)' : 'rgba(255,215,0,0.25)',
                '--ling-atp-pin-active-border': isLight ? 'rgba(200,160,30,0.7)' : 'rgba(255,215,0,0.7)',
                '--ling-atp-pin-active-color': isLight ? '#b8960d' : '#ffd700',
                '--ling-atp-scrollbar-thumb': isLight ? 'rgba(180,140,50,0.15)' : 'rgba(201,153,58,0.15)',
                '--ling-atp-action-bg': isLight ? 'linear-gradient(180deg, rgba(180,140,50,0.1) 0%, rgba(180,140,50,0.03) 100%)' : 'linear-gradient(180deg, rgba(201,153,58,0.12) 0%, rgba(201,153,58,0.04) 100%)',
                '--ling-atp-action-border': isLight ? 'rgba(180,140,50,0.5)' : 'rgba(201,153,58,0.4)',
                '--ling-atp-action-hover-bg': isLight ? 'linear-gradient(180deg, rgba(180,140,50,0.18) 0%, rgba(180,140,50,0.06) 100%)' : 'linear-gradient(180deg, rgba(201,153,58,0.2) 0%, rgba(201,153,58,0.08) 100%)',
                '--ling-atp-action-hover-border': isLight ? 'rgba(180,140,50,0.8)' : 'rgba(201,153,58,0.7)',
                '--ling-atp-log-bg': isLight ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.3)',
                '--ling-atp-log-border': isLight ? 'rgba(180,140,50,0.22)' : 'rgba(201,153,58,0.2)',
                '--ling-atp-accent-check': isLight ? '#b48c32' : '#c9993a',
                '--ling-atp-input-border': isLight ? 'rgba(180,140,50,0.3)' : 'rgba(201,153,58,0.25)',
                '--ling-atp-config-footer-border': isLight ? 'rgba(180,140,50,0.25)' : 'rgba(201,153,58,0.22)',
                '--ling-atp-float-bg': isLight ? 'linear-gradient(135deg, rgba(180,140,50,0.18) 0%, rgba(180,140,50,0.08) 100%)' : 'linear-gradient(135deg, rgba(201,153,58,0.2) 0%, rgba(201,153,58,0.1) 100%)',
            };
            for (const [k, v] of Object.entries(vars)) {
                document.documentElement.style.setProperty(k, v);
            }
        }

        function initThemeWatcher() {
            const observer = new MutationObserver(() => updateThemeStyle());
            observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
            updateThemeStyle();
        }

        function injectStyles() {
            if (document.getElementById('ling-atp-styles')) return;
            const style = document.createElement('style');
            style.id = 'ling-atp-styles';
            style.textContent = styleText;
            document.head.appendChild(style);
        }

        injectStyles();
        initThemeWatcher();
    })();

    // ==================== 种子数据（动态获取） ====================
    let SEEDS_LIST = [];

    // ==================== 灵田辅助核心逻辑 ====================
    if (window._lingFarmRunning) {
        console.log('[灵田辅助] 脚本已运行，请勿重复注入');
        return;
    }

    let stopFlag = false;
    let cycleIntervalId = null;
    let currentCycleDelay = 5000;
    let currentHarvestDelay = 10000;
    let isHarvesting = false;

    let plantingActive = false;
    let currentPlantDelay = 5000;
    let selectedSeedId = "seed_wy_bone";
    let selectedSeedName = "真灵骨胚";

    let logEntries = [];
    const MAX_LOG = 50;

    let statusDot, statusTextSpan, matureSpan, idleSpan, logContainer;
    let ctrlBtn, resetBtn, plantBtn, refreshBtn, clearLogBtn, seedSelect;

    // 辅助函数
    function addLog(msg, type = 'info') {
        const time = new Date().toLocaleTimeString();
        const logMsg = `[${time}] ${msg}`;
        logEntries.unshift(logMsg);
        if (logEntries.length > MAX_LOG) logEntries.pop();
        updateLogPanel();
        const consoleMethod = type === 'error' ? 'error' : (type === 'warn' ? 'warn' : 'log');
        console[consoleMethod](logMsg);
    }

    function updateLogPanel() {
        if (logContainer) {
            logContainer.innerHTML = logEntries.map(msg => `<div class="ling-atp-log-entry ${getLogClass(msg)}">${escapeHtml(msg)}</div>`).join('');
            logContainer.scrollTop = 0;
        }
    }

    function getLogClass(msg) {
        if (msg.includes('成功') || msg.includes('完成')) return 'success';
        if (msg.includes('错误') || msg.includes('异常') || msg.includes('失败')) return 'error';
        if (msg.includes('警告')) return 'warn';
        if (msg.includes('种植') || msg.includes('收获')) return 'gold';
        return 'info';
    }

    function escapeHtml(str) {
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    function updateStatus(status, text) {
        if (statusDot) statusDot.className = `ling-atp-status-dot ${status}`;
        if (statusTextSpan) statusTextSpan.innerText = text;
    }

    function updateMatureDisplay(count) { if (matureSpan) matureSpan.innerText = count; }
    function updateIdleDisplay(count) { if (idleSpan) idleSpan.innerText = count; }

    // --- 种子记忆 ---
    function saveSelectedSeed(seedId, seedName) {
        localStorage.setItem('ling_atp_last_seed_id', seedId);
        localStorage.setItem('ling_atp_last_seed_name', seedName);
    }

    function loadSelectedSeed() {
        const id = localStorage.getItem('ling_atp_last_seed_id');
        const name = localStorage.getItem('ling_atp_last_seed_name');
        if (id && name) {
            selectedSeedId = id;
            selectedSeedName = name;
            addLog(`[记忆] 上次选择: ${selectedSeedName}`);
        } else {
            // 默认真灵骨胚
            selectedSeedId = "seed_wy_bone";
            selectedSeedName = "真灵骨胚";
            addLog(`[记忆] 使用默认种子: ${selectedSeedName}`);
        }
    }

    // API 封装
    async function fetchOverview() {
        try {
            addLog('[查询] 获取灵田概况...');
            const res = await api.request('GET', '/api/game/player-sect/farm/overview?page=1&pageSize=1');
            if (res && res.code === 200) {
                addLog(`[查询] 成功 | 成熟:${res.data.myMatureCount} 空闲:${res.data.myIdleCount}`);
                updateMatureDisplay(res.data.myMatureCount);
                updateIdleDisplay(res.data.myIdleCount);
                return { matureCount: res.data.myMatureCount, idleCount: res.data.myIdleCount, totalPlots: res.data.myPlotTotal };
            } else {
                addLog(`[查询] 失败: ${res?.message}`, 'error');
                return null;
            }
        } catch (err) {
            addLog(`[查询] 异常: ${err.message}`, 'error');
            return null;
        }
    }

    // 获取种子列表并更新下拉框
    async function fetchSeedListAndUpdate() {
        try {
            addLog('[初始化] 获取种子列表...');
            const res = await api.request('GET', '/api/game/player-sect/farm/overview?page=1&pageSize=1');
            if (res && res.code === 200 && res.data.seeds && Array.isArray(res.data.seeds)) {
                SEEDS_LIST = res.data.seeds;
                addLog(`[初始化] 获取到 ${SEEDS_LIST.length} 种作物`);
                updateSeedSelect();
            } else {
                addLog('[初始化] 获取种子列表失败，使用默认列表', 'warn');
                SEEDS_LIST = [
                    { seedId: "seed_lingcao", seedName: "灵草种子", seedRarity: 1, growHours: 2 },
                    { seedId: "seed_lingzhi", seedName: "灵芝种子", seedRarity: 2, growHours: 4 },
                    { seedId: "seed_xuanlian", seedName: "玄莲种子", seedRarity: 3, growHours: 8 },
                    { seedId: "seed_longsui", seedName: "龙髓种子", seedRarity: 4, growHours: 16 },
                    { seedId: "seed_ym_flower", seedName: "彼岸花种子", seedRarity: 4, growHours: 20 },
                    { seedId: "seed_nine_grade_core", seedName: "万妖本源灵胚", seedRarity: 5, growHours: 28 },
                    { seedId: "seed_wy_bone", seedName: "真灵骨胚", seedRarity: 5, growHours: 34 },
                    { seedId: "seed_ym_spring", seedName: "幽冥泉眼灵胚", seedRarity: 5, growHours: 32 },
                    { seedId: "seed_tl_thunder_src", seedName: "劫雷源胎", seedRarity: 5, growHours: 32 },
                    { seedId: "seed_cs_time_sand", seedName: "时砂灵胚", seedRarity: 5, growHours: 34 },
                    { seedId: "seed_hd_void_crystal", seedName: "虚空晶胚", seedRarity: 5, growHours: 36 }
                ];
                updateSeedSelect();
            }
        } catch (err) {
            addLog(`[初始化] 获取种子列表异常: ${err.message}`, 'error');
        }
    }

    function updateSeedSelect() {
        if (!seedSelect) {
            console.warn('[灵田辅助] seedSelect 元素未就绪，稍后重试');
            return;
        }
        const currentValue = seedSelect.value;
        seedSelect.innerHTML = '';
        if (SEEDS_LIST.length === 0) {
            const option = document.createElement('option');
            option.textContent = '暂无种子数据';
            seedSelect.appendChild(option);
            return;
        }
        // 确定要选中的种子ID
        let targetSeedId = selectedSeedId;
        // 如果保存的种子不在列表中，则使用默认的真灵骨胚（如果存在），否则用第一个
        if (!SEEDS_LIST.some(s => s.seedId === targetSeedId)) {
            const defaultSeed = SEEDS_LIST.find(s => s.seedId === 'seed_wy_bone');
            if (defaultSeed) targetSeedId = defaultSeed.seedId;
            else targetSeedId = SEEDS_LIST[0].seedId;
        }
        SEEDS_LIST.forEach(seed => {
            const option = document.createElement('option');
            option.value = seed.seedId;
            const rarity = seed.seedRarity !== undefined ? seed.seedRarity : (seed.rarity || 0);
            const growHours = seed.growHours !== undefined ? seed.growHours : (seed.growTime || 0);
            option.textContent = `${seed.seedName || seed.name} (稀有度${rarity} 时长${growHours}h)`;
            if (seed.seedId === targetSeedId) {
                option.selected = true;
                selectedSeedId = seed.seedId;
                selectedSeedName = seed.seedName || seed.name;
                // 确保保存
                saveSelectedSeed(selectedSeedId, selectedSeedName);
            }
            seedSelect.appendChild(option);
        });
        // 如果当前选中的与目标一致但无 option 被选中（理论上不会），强制设置值
        if (seedSelect.value !== targetSeedId && targetSeedId) {
            seedSelect.value = targetSeedId;
        }
        addLog(`[UI] 下拉框已更新，当前选中: ${selectedSeedName}`);
    }

    async function callHarvest() {
        try {
            addLog('[收菜] 调用 harvest-all...');
            const res = await api.request('POST', '/api/game/player-sect/farm/harvest-all', null);
            if (res && res.code === 200) {
                const hasRemaining = res.data && res.data.includes('请再次收获剩余灵田');
                addLog(`[收菜] 响应: ${res.message}`);
                return { success: true, hasRemaining };
            } else {
                addLog(`[收菜] 异常: ${res?.message}`, 'error');
                return { success: false, hasRemaining: false };
            }
        } catch (err) {
            addLog(`[收菜] 异常: ${err.message}`, 'error');
            return { success: false, hasRemaining: false };
        }
    }

    async function callPlantAll(seedId) {
        try {
            addLog(`[种植] 发起批量种植 (${selectedSeedName})...`);
            const res = await api.request('POST', '/api/game/player-sect/farm/plant-all', { seedId });
            if (res && res.code === 200) {
                addLog(`[种植] 发起成功: ${res.message}`);
                return true;
            } else {
                addLog(`[种植] 发起失败: ${res?.message}`, 'error');
                return false;
            }
        } catch (err) {
            addLog(`[种植] 发起异常: ${err.message}`, 'error');
            return false;
        }
    }

    async function pollPlantProgress() {
        let finished = false;
        let lastProcessed = -1;
        while (!finished && plantingActive) {
            try {
                const res = await api.request('GET', '/api/game/player-sect/farm/plant-all-progress');
                if (res && res.code === 200) {
                    const { status, total, processed, message } = res.data;
                    if (processed !== lastProcessed) {
                        addLog(`[进度] ${message} (${processed}/${total})`);
                        lastProcessed = processed;
                    }
                    if (status === 'completed') {
                        addLog(`[进度] 本次种植任务完成: ${message}`);
                        finished = true;
                    } else if (status === 'failed') {
                        addLog(`[进度] 种植任务失败: ${message}`, 'error');
                        finished = true;
                    } else {
                        await new Promise(r => setTimeout(r, 1000));
                    }
                } else {
                    addLog(`[进度] 查询失败: ${res?.message}`, 'error');
                    finished = true;
                }
            } catch (err) {
                addLog(`[进度] 查询异常: ${err.message}`, 'error');
                finished = true;
            }
        }
        return true;
    }

    async function runPlantCycle(seedId, plantDelay) {
        let totalBatches = 0;
        while (plantingActive) {
            const overview = await fetchOverview();
            if (!overview) break;
            const idle = overview.idleCount;
            if (idle === 0) {
                addLog('[种植] 所有空闲灵田已种满，停止种植');
                break;
            }
            addLog(`[种植] 当前空闲田块: ${idle}，开始第 ${totalBatches+1} 批种植 (${selectedSeedName})`);
            const started = await callPlantAll(seedId);
            if (!started) break;
            await pollPlantProgress();
            if (plantingActive) {
                addLog(`[种植] 等待 ${plantDelay}ms 后继续下一批...`);
                await new Promise(r => setTimeout(r, plantDelay));
            }
            totalBatches++;
        }
        addLog(`[种植] 全部完成，共种植 ${totalBatches} 批`);
    }

    async function runHarvestCycle() {
        if (isHarvesting) { addLog('[收菜] 上一轮未完成，跳过', 'warn'); return false; }
        isHarvesting = true;
        try {
            const overview = await fetchOverview();
            if (!overview) return false;
            let mature = overview.matureCount;
            if (mature === 0) { addLog('[收菜] 无成熟灵田，自动停止'); return false; }
            addLog(`[收菜] 发现 ${mature} 块成熟田，开始收获...`);
            let count = 0, cont = true;
            while (cont && !stopFlag) {
                const result = await callHarvest();
                count++;
                if (!result.success) break;
                cont = result.hasRemaining;
                if (cont) { addLog(`[收菜] 仍有剩余，等待 ${currentHarvestDelay}ms...`); await new Promise(r => setTimeout(r, currentHarvestDelay)); }
            }
            addLog(`[收菜] 周期结束，共调用 ${count} 次`);
            const final = await fetchOverview();
            if (final && final.matureCount > 0) { addLog(`[收菜] 警告：完成后仍有 ${final.matureCount} 块成熟`, 'warn'); return true; }
            else { addLog('[收菜] 所有成熟田已收获完毕'); return false; }
        } finally { isHarvesting = false; }
    }

    function stopHarvest() {
        if (cycleIntervalId) clearInterval(cycleIntervalId);
        cycleIntervalId = null;
        stopFlag = false;
        window._lingFarmRunning = false;
        if (ctrlBtn) ctrlBtn.textContent = '开始收菜';
        if (!plantingActive) updateStatus('idle', '空闲');
        addLog('[收菜] 已停止');
    }

    async function startHarvest(cycleDelay, harvestDelay) {
        if (cycleIntervalId) stopHarvest();
        if (plantingActive) { addLog('[收菜] 种植中，请先停止种植', 'warn'); return; }
        stopFlag = false;
        window._lingFarmRunning = true;
        if (ctrlBtn) ctrlBtn.textContent = '收菜中...';
        updateStatus('running', '收菜运行中');
        addLog(`[收菜] 启动 | 检查间隔:${cycleDelay}ms 收取间隔:${harvestDelay}ms`);
        const task = async () => { if (!stopFlag && window._lingFarmRunning) { const cont = await runHarvestCycle(); if (!cont) stopHarvest(); } };
        await task();
        if (!stopFlag && window._lingFarmRunning) cycleIntervalId = setInterval(task, cycleDelay);
    }

    async function startPlanting(seedId, seedName, plantDelay) {
        if (plantingActive) { addLog('[种植] 已有种植任务进行中，如需停止请再次点击按钮', 'warn'); return; }
        if (window._lingFarmRunning) { addLog('[种植] 收菜运行中，请先停止收菜', 'warn'); return; }
        if (!confirm(`⚠️ 确认一键种植“${seedName}”吗？\n\n将自动种满所有空闲灵田，可能消耗大量灵石/种子。\n是否继续？`)) { addLog('[种植] 用户取消'); return; }
        plantingActive = true;
        if (plantBtn) plantBtn.textContent = '停止种植';
        updateStatus('running', '种植中');
        addLog(`[种植] 启动，间隔${plantDelay}ms，种子${seedName}(${seedId})`);
        try { await runPlantCycle(seedId, plantDelay); } 
        catch (err) { addLog(`[种植] 出错: ${err.message}`, 'error'); } 
        finally { 
            plantingActive = false; 
            if (plantBtn) plantBtn.textContent = '一键种植'; 
            if (!window._lingFarmRunning) updateStatus('idle', '空闲'); 
            else updateStatus('running', '收菜运行中'); 
            await fetchOverview(); 
        }
    }

    function stopPlanting() { if (plantingActive) { plantingActive = false; addLog('[种植] 正在停止...'); } else addLog('[种植] 当前没有进行中的种植任务'); }

    function onSeedChange() {
        if (seedSelect) {
            const selectedOption = seedSelect.options[seedSelect.selectedIndex];
            selectedSeedId = selectedOption.value;
            selectedSeedName = selectedOption.text.split(' ')[0];
            saveSelectedSeed(selectedSeedId, selectedSeedName);
            addLog(`[设置] 已选择种子: ${selectedSeedName}，已保存记忆`);
        }
    }

    // ==================== UI 构建 ====================
    function buildUI() {
        const container = document.createElement('div');
        container.className = 'ling-atp-container';
        container.style.cssText = 'bottom:20px; right:20px;';
        const panel = document.createElement('div');
        panel.className = 'ling-atp-panel';
        
        const header = document.createElement('div');
        header.className = 'ling-atp-header';
        header.innerHTML = `<div class="ling-atp-title"><span class="ling-atp-title-icon">🌾</span><span>灵田辅助</span></div><div class="ling-atp-header-btns"><div class="ling-atp-header-btn" id="closePanelBtn">✕</div></div>`;
        panel.appendChild(header);
        
        const bodyWrap = document.createElement('div');
        bodyWrap.className = 'ling-atp-body-wrap';
        const body = document.createElement('div');
        body.className = 'ling-atp-body';
        
        const statusRow = document.createElement('div');
        statusRow.className = 'ling-atp-status-row';
        statusRow.innerHTML = `<div class="ling-atp-status-dot idle" id="statusDot"></div><div class="ling-atp-status-text" id="statusText">空闲</div>`;
        body.appendChild(statusRow);
        
        const controlsDiv = document.createElement('div');
        controlsDiv.style.display = 'flex';
        controlsDiv.style.flexDirection = 'column';
        controlsDiv.style.gap = '6px';
        controlsDiv.style.marginBottom = '6px';
        controlsDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; font-size:12px;"><label>🌾 检查间隔(ms):</label><input id="cycleDelay" type="number" value="5000" step="500" style="width:100px; background:var(--ling-atp-bg2); border:1px solid var(--ling-atp-border3); border-radius:4px; padding:4px 6px; color:var(--ling-atp-text);"></div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size:12px;"><label>🌾 收取间隔(ms):</label><input id="harvestDelay" type="number" value="10000" step="1000" style="width:100px; background:var(--ling-atp-bg2); border:1px solid var(--ling-atp-border3); border-radius:4px; padding:4px 6px; color:var(--ling-atp-text);"></div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size:12px;"><label>🌱 种植间隔(ms):</label><input id="plantDelay" type="number" value="5000" step="1000" style="width:100px; background:var(--ling-atp-bg2); border:1px solid var(--ling-atp-border3); border-radius:4px; padding:4px 6px; color:var(--ling-atp-text);"></div>
        `;
        body.appendChild(controlsDiv);
        
        const seedWrapper = document.createElement('div');
        seedWrapper.className = 'ling-atp-select-wrapper';
        seedWrapper.innerHTML = `<div class="ling-atp-select-label">选择种子</div><select id="seedSelect" class="ling-atp-select"></select>`;
        body.appendChild(seedWrapper);
        
        const statsDiv = document.createElement('div');
        statsDiv.className = 'ling-atp-stats';
        statsDiv.style.display = 'grid';
        statsDiv.style.gridTemplateColumns = '1fr 1fr';
        statsDiv.style.gap = '8px';
        statsDiv.innerHTML = `<div class="ling-atp-stat-item"><div class="ling-atp-stat-label">🌾 成熟数</div><div class="ling-atp-stat-value" id="matureCount">--</div></div><div class="ling-atp-stat-item"><div class="ling-atp-stat-label">🌱 空闲数</div><div class="ling-atp-stat-value" id="idleCount">--</div></div>`;
        body.appendChild(statsDiv);
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'ling-atp-actions';
        actionsDiv.style.display = 'grid';
        actionsDiv.style.gridTemplateColumns = '1fr 1fr';
        actionsDiv.style.gap = '8px';
        actionsDiv.innerHTML = `
            <button class="ling-atp-btn" id="ctrlBtn">开始收菜</button>
            <button class="ling-atp-btn" id="resetBtn">重置收菜</button>
            <button class="ling-atp-btn" id="plantBtn">一键种植</button>
            <button class="ling-atp-btn" id="refreshBtn">🔄 刷新</button>
            <button class="ling-atp-btn" id="clearLogBtn" style="grid-column: span 2;">清空日志</button>
        `;
        body.appendChild(actionsDiv);
        
        const logDiv = document.createElement('div');
        logDiv.className = 'ling-atp-log';
        logDiv.id = 'logContainer';
        body.appendChild(logDiv);
        
        bodyWrap.appendChild(body);
        panel.appendChild(bodyWrap);
        container.appendChild(panel);
        document.body.appendChild(container);
        
        statusDot = document.getElementById('statusDot');
        statusTextSpan = document.getElementById('statusText');
        matureSpan = document.getElementById('matureCount');
        idleSpan = document.getElementById('idleCount');
        logContainer = document.getElementById('logContainer');
        ctrlBtn = document.getElementById('ctrlBtn');
        resetBtn = document.getElementById('resetBtn');
        plantBtn = document.getElementById('plantBtn');
        refreshBtn = document.getElementById('refreshBtn');
        clearLogBtn = document.getElementById('clearLogBtn');
        seedSelect = document.getElementById('seedSelect');
        if (seedSelect) seedSelect.addEventListener('change', onSeedChange);
        
        const closeBtn = document.getElementById('closePanelBtn');
        if (closeBtn) closeBtn.addEventListener('click', () => { stopHarvest(); stopPlanting(); container.remove(); delete window._lingFarmRunning; delete window._lingFarmPanel; addLog('[UI] 面板已关闭'); });
        
        let dragState = { active: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 };
        
        function onDragStart(e) {
            if (e.target.closest && e.target.closest('#closePanelBtn')) return;
            e.preventDefault();
            dragState.active = true;
            const clientX = e.clientX ?? (e.touches ? e.touches[0].clientX : 0);
            const clientY = e.clientY ?? (e.touches ? e.touches[0].clientY : 0);
            dragState.startX = clientX;
            dragState.startY = clientY;
            const rect = container.getBoundingClientRect();
            dragState.startLeft = rect.left;
            dragState.startTop = rect.top;
            container.style.transition = 'none';
        }
        
        function onDragMove(e) {
            if (!dragState.active) return;
            e.preventDefault();
            const clientX = e.clientX ?? (e.touches ? e.touches[0].clientX : 0);
            const clientY = e.clientY ?? (e.touches ? e.touches[0].clientY : 0);
            let left = dragState.startLeft + (clientX - dragState.startX);
            let top = dragState.startTop + (clientY - dragState.startY);
            left = Math.min(window.innerWidth - container.offsetWidth, Math.max(0, left));
            top = Math.min(window.innerHeight - container.offsetHeight, Math.max(0, top));
            container.style.left = left + 'px';
            container.style.top = top + 'px';
            container.style.right = 'auto';
            container.style.bottom = 'auto';
        }
        
        function onDragEnd(e) {
            if (!dragState.active) return;
            dragState.active = false;
            container.style.transition = '';
        }
        
        header.addEventListener('mousedown', onDragStart);
        window.addEventListener('mousemove', onDragMove);
        window.addEventListener('mouseup', onDragEnd);
        header.addEventListener('touchstart', onDragStart, { passive: false });
        window.addEventListener('touchmove', onDragMove, { passive: false });
        window.addEventListener('touchend', onDragEnd);
        
        return container;
    }
    
    function bindEvents() {
        if (!ctrlBtn || !resetBtn || !plantBtn || !refreshBtn || !clearLogBtn) return;
        ctrlBtn.onclick = async () => {
            if (cycleIntervalId || window._lingFarmRunning) { stopHarvest(); ctrlBtn.textContent = '开始收菜'; if (!plantingActive) updateStatus('idle', '空闲'); } 
            else { if (plantingActive) { addLog('[收菜] 请先停止种植', 'warn'); return; } let cd = parseInt(document.getElementById('cycleDelay')?.value || currentCycleDelay, 10), hd = parseInt(document.getElementById('harvestDelay')?.value || currentHarvestDelay, 10); if (isNaN(cd) || cd < 1000) cd = 5000; if (isNaN(hd) || hd < 500) hd = 10000; currentCycleDelay = cd; currentHarvestDelay = hd; ctrlBtn.disabled = true; ctrlBtn.textContent = '启动中...'; await startHarvest(currentCycleDelay, currentHarvestDelay); ctrlBtn.disabled = false; if (!window._lingFarmRunning) ctrlBtn.textContent = '开始收菜'; }
        };
        resetBtn.onclick = () => { stopHarvest(); stopPlanting(); updateStatus('idle', '空闲'); ctrlBtn.textContent = '开始收菜'; if (plantBtn) plantBtn.textContent = '一键种植'; addLog('[重置] 已重置所有任务'); };
        plantBtn.onclick = async () => { if (plantingActive) { stopPlanting(); plantBtn.textContent = '一键种植'; return; } if (window._lingFarmRunning) { addLog('[种植] 请先停止收菜', 'warn'); return; } let pd = parseInt(document.getElementById('plantDelay')?.value || currentPlantDelay, 10); if (isNaN(pd) || pd < 500) pd = 5000; currentPlantDelay = pd; await startPlanting(selectedSeedId, selectedSeedName, currentPlantDelay); };
        refreshBtn.onclick = async () => { addLog('[手动] 刷新灵田概况'); await fetchOverview(); };
        clearLogBtn.onclick = () => { logEntries = []; updateLogPanel(); addLog('[日志] 已清空'); };
    }
    
    async function init() { 
        if (window._lingFarmRunning) return;
        // 先加载本地记忆的种子（如果没有则使用默认）
        loadSelectedSeed();
        buildUI();                 // 创建界面，生成 seedSelect 元素
        await fetchSeedListAndUpdate(); // 获取种子并填充下拉框（会应用记忆的种子）
        bindEvents();
        window._lingFarmRunning = false;
        window._lingFarmPanel = true;
        await fetchOverview();
        addLog('[就绪] 灵田辅助脚本已加载');
    }
    
    init();
})();