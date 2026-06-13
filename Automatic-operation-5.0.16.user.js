// ==UserScript==
// @name         Automatic-operation
// @namespace    https://github.com/sewolonX/Automatic-operation
// @version      5.0.16
// @description  不想描述
// @author       sewolon
// @match        https://ling.muge.info/game.html
// @grant        none
// @run-at       document-idle
// @downloadURL  https://sewolon.oss-cn-shanghai.aliyuncs.com/automatic-operation/Automatic-operation.js
// @updateURL    https://sewolon.oss-cn-shanghai.aliyuncs.com/automatic-operation/Automatic-operation.js
// ==/UserScript==

(function () {
  'use strict';
  if (!location.protocol.startsWith('http')) return;
  if (!document.body) { console.error('[AUTO_OP] body 跳过:'); return; }
  const IS_TOP = (() => { try { return window.top === window.self; } catch (e) { console.error('[AUTO_OP] IS_TOP 异常:', e); return true; } })();
  if (!IS_TOP) return;
  const IS_MOBILE = (() => { try { return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window && navigator.maxTouchPoints > 0); } catch (e) { console.error('[AUTO_OP] IS_MOBILE 异常:', e); return false; } })();
  // ===================== 存储键 =====================
  const SHARED_KEY = 'AUTO_OP_SHARED_' + window.location.hostname;
  const REFRESH_STATE_KEY = 'AUTO_OP_REFRESH_STATE_' + window.location.hostname;
  const PER_CONFIG_KEY = 'AUTO_OP_CFG_' + window.location.hostname + '_';
  // ===================== 共享状态（第3页 + 全局UI）=====================
  let isAutoRefresh = false, refreshIntervalSec = 60, refreshTimerID = null, refreshStartTimestamp = 0, refreshProgressTimerID = null, refreshLogs = [];
  let currentPage = 0;
  const PAGE_COUNT = 3;
  let collapseAnimPhase = 'collapsed', collapsedWidth = 300;
  let wakeLock = null, stateTimerID = null;
  let isPicking = false, isDarkMode = false;
  let originalFocus = HTMLElement.prototype.focus, focusinHandler = null;
  let elapsedTimerID_global = null;
  let isProgrammaticClick = false;
  let isPowerSave = false, powerSaveTimerID = null;
  // ===================== 配置系统 =====================
  const CONFIG_COUNT = 10;
  const CONFIG_NAMES = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];
  let activeConfig = 0;
  let configs = [];
  for (let i = 0; i < CONFIG_COUNT; i++) {
    configs.push({
      targets: [], isRunning: false, timerID: null, clickedCount: 0,
      maxClicks: Infinity, clickInterval: 1000, autoFillContent: '',
      isMultiMode: false, clickStrategy: 'simultaneous',
      currentQueueIndex: 0, waitStartTime: 0, isWaiting: false, waitTimerID: null,
      operationStartTimestamp: 0,
      autoStartEnabled: false, autoStartIntervalMin: 0,
      autoStartCountdownTimerID: null, autoStartNextTime: 0,
      maxDurationMin: 0, maxDurationTimerID: null,
      discoveredElements: new Set(),
      uiThrottled: false, doClickLastUIUpdate: 0,
      missingAction: 'wait'
    });
  }
  function cv() { return configs[activeConfig]; }
  // ===================== WakeLock =====================
  async function requestWakeLock() { if (!wakeLockCheckbox.checked) return; try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { console.error('[AUTO_OP] WakeLock 异常:', e); } }
  async function releaseWakeLock() { if (wakeLock) { await wakeLock.release(); wakeLock = null; } }
  function suppressFocus() { if (!suppressFocusCheckbox.checked) return; HTMLElement.prototype.focus = function () { if (!panel.contains(this)) return; originalFocus.apply(this, arguments); }; focusinHandler = function (e) { if (!panel.contains(e.target)) e.target.blur(); }; document.addEventListener('focusin', focusinHandler, true); }
  function restoreFocus() { HTMLElement.prototype.focus = originalFocus; if (focusinHandler) { document.removeEventListener('focusin', focusinHandler, true); focusinHandler = null; } }
  // ===================== 注入样式 =====================
  const style = document.createElement('style');
  style.textContent = `
    :root{--panel-bg:#18181b;--panel-border:#333;--panel-text:#e0e0e0;--panel-input-bg:#27272a;--panel-input-border:#333;--panel-input-text:#e0e0e0;--panel-label-text:#888;--panel-button-bg:rgba(255,255,255,0.06);--panel-button-border:rgba(255,255,255,0.1);--panel-button-text:#999;--panel-button-hover-bg:rgba(255,255,255,0.12);--panel-button-hover-text:#fff;--panel-highlight-border:#277AF7;--panel-active-border:#22c55e;--panel-active-text:#22c55e;--panel-waiting-text:#f59e0b;--panel-highlight:#f59e0b;--panel-missing-border:#dc2626;--panel-missing-text:#dc2626;--auto-op-font:system-ui}
    [data-theme="light"]{--panel-bg:#ffffff;--panel-border:#e5e7eb;--panel-text:#1f2937;--panel-input-bg:#f9fafb;--panel-input-border:#d1d5db;--panel-input-text:#1f2937;--panel-label-text:#6b7280;--panel-button-bg:rgba(0,0,0,0.05);--panel-button-border:rgba(0,0,0,0.1);--panel-button-text:#6b7280;--panel-button-hover-bg:rgba(0,0,0,0.1);--panel-button-hover-text:#1f2937;--panel-highlight-border:#3482FF;--panel-active-border:#32d486;--panel-active-text:#32d486;--panel-waiting-text:#d97706;--panel-highlight:#d97706;--panel-missing-border:#dc2626;--panel-missing-text:#dc2626}
    [data-theme="light"] .auto-op-status{border-top-color:#999}
    [data-theme="light"] .auto-op-switch-track{border-color:#d1d5db;background:#dedede}
    [data-theme="light"] .auto-op-switch-thumb{background:#ffffff}
    [data-theme="light"] .auto-op-match-mode{opacity:0.75 !important}
    [data-theme="light"] .auto-op-modal-overlay{background:rgba(0,0,0,0.2)}
    [data-theme="light"] .auto-op-log-entry{border-bottom-color:rgba(0,0,0,0.04)}
    [data-theme="light"] .auto-op-config-btn{background:rgba(0,0,0,0.05);border-color:rgba(0,0,0,0.1);color:#6b7280}
    [data-theme="light"] .auto-op-config-btn:hover{background:rgba(0,0,0,0.1);color:#1f2937}
    [data-theme="light"] .auto-op-config-menu{background:#ffffff;border-color:#e5e7eb;box-shadow:0 4px 16px rgba(0,0,0,0.12)}
    [data-theme="light"] .auto-op-config-item{color:#1f2937}
    [data-theme="light"] .auto-op-config-item:hover{background:rgba(0,0,0,0.06)}
    [data-theme="light"] .auto-op-config-item.active{color:#3482FF;background:rgba(0,0,0,0.04)}
    #auto-op-panel{position:fixed;top:85px;left:35px;z-index:2147483647 !important;background:var(--panel-bg);color:var(--panel-text);border:1px solid var(--panel-border);border-radius:12px;padding:0;width:300px;font-size:13px !important;box-shadow:0 0 6px rgba(0,0,0,0.15);transition:opacity 0.3s,width 0.2s cubic-bezier(0.4,0,0.2,1);overflow:hidden;display:flex;flex-direction:column;font-variant-numeric:tabular-nums !important;text-align:left !important;contain:layout style !important;isolation:isolate !important}
    .auto-op-header{position:sticky;top:0;background:var(--panel-bg);border-bottom:1px solid var(--panel-border);padding:14px;cursor:move;touch-action:none;z-index:1;display:flex;align-items:center;flex-shrink:0}
    .auto-op-header h3{margin:0;font-size:18px;font-weight:800;font-family:inherit;color:var(--panel-text);display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden;white-space:nowrap;flex:1 1 auto;text-align:right;justify-content:flex-end}
    .auto-op-toggle{flex-shrink:0;width:30px;height:30px;background:var(--panel-button-bg);border:1px solid var(--panel-button-border);color:var(--panel-button-text);font-size:18px;font-family:var(--auto-op-font);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;border-radius:6px;line-height:1;transition:background 0.3s,color 0.3s,transform 0.15s ease;-webkit-tap-highlight-color:transparent;user-select:none}
    .auto-op-toggle:hover{background:var(--panel-button-hover-bg);color:var(--panel-button-hover-text)}
    .auto-op-toggle:active{transform:scale(0.85) !important}
    .auto-op-config-wrap{flex-shrink:0;margin-left:12px}
    .auto-op-config-btn{width:30px;height:30px;background:var(--panel-button-bg);border:1px solid var(--panel-button-border);color:var(--panel-button-text);font-size:15px;font-weight:500;font-family:var(--auto-op-font);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;border-radius:6px;line-height:1;transition:background 0.3s,color 0.3s,transform 0.15s ease;-webkit-tap-highlight-color:transparent;user-select:none;white-space:nowrap;overflow:hidden}
    .auto-op-config-btn:hover{background:var(--panel-button-hover-bg);color:var(--panel-button-hover-text)}
    .auto-op-config-btn:active{transform:scale(0.85) !important}
    .auto-op-config-menu{display:block;position:fixed;background:var(--panel-bg);border:1px solid var(--panel-border);border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.3);z-index:2147483647;width:64px;scrollbar-width:none;opacity:0;transform:scale(0.4);transform-origin:top left;transition:opacity 0.24s ease,transform 0.24s ease;pointer-events:none}
    .auto-op-config-menu::-webkit-scrollbar{display:none}
    .auto-op-config-menu.open{opacity:1;transform:scale(1);pointer-events:auto}
    .auto-op-config-menu.closing{opacity:0;transform:scale(0.4);pointer-events:none}
    .auto-op-config-item{padding:8px 16px;font-size:16px;font-weight:500;font-family:var(--auto-op-font);color:var(--panel-text);cursor:pointer;white-space:nowrap;text-align:center;transition:background 0.15s;-webkit-tap-highlight-color:transparent;user-select:none}
    .auto-op-config-item:first-child{border-radius:7px 7px 0 0}
    .auto-op-config-item:last-child{border-radius:0 0 7px 7px}
    .auto-op-config-item:hover{background:var(--panel-button-hover-bg)}
    .auto-op-config-item.active{color:var(--panel-highlight-border);background:var(--panel-button-bg)}
    .auto-op-config-item.has-run{position:relative}
    .auto-op-config-item.has-run::after{content:'';position:absolute;top:50%;right:10px;transform:translateY(-50%);width:6px;height:6px;border-radius:50%;background:var(--panel-active-border)}
    .auto-op-header-start{flex-shrink:0;width:30px;height:30px;border:none;color:#fff;font-size:14px;font-family:inherit;cursor:pointer;display:none;align-items:center;justify-content:center;padding:0;border-radius:6px;margin-left:12px;margin-right:12px;line-height:0;transition:background 0.3s,opacity 0.3s ease,transform 0.15s ease;background:#16a34a;opacity:0.9 !important;text-align:center;-webkit-tap-highlight-color:transparent;user-select:none}
    .auto-op-header-start:hover{background:#22c55e;opacity:1 !important}
    .auto-op-header-start.is-stop{background:#dc2626;opacity:0.9 !important}
    .auto-op-header-start.is-stop:hover{background:#ef4444;opacity:1 !important}
    .auto-op-header-start:active{transform:scale(0.85) !important}
    .auto-op-header-start:disabled{opacity:0.4 !important;cursor:not-allowed}
    .auto-op-body{padding:14px;overflow:hidden;max-height:60vh;transition:max-height 0.35s ease,padding 0.25s ease,opacity 0.3s ease;opacity:1}
    .auto-op-body::-webkit-scrollbar{display:none}
    #auto-op-panel.collapsing .auto-op-body{max-height:0 !important;padding:0 !important;margin:0 !important;border-width:0 !important;opacity:0;overflow:hidden;contain:layout !important;transition:max-height 0.35s ease,padding 0.25s ease,margin 0.25s ease,border-width 0.25s ease,opacity 0.3s ease}
    #auto-op-panel.collapsed{gap:0 !important}
    #auto-op-panel.collapsed .auto-op-header{justify-content:flex-start}
    #auto-op-panel.collapsed .auto-op-header h3{flex:0 0 auto !important;margin-left:auto}
    #auto-op-panel.collapsed .auto-op-header-start{display:flex;opacity:0;animation:auto-op-fade-in 0.3s ease 0.1s forwards}
    #auto-op-panel.collapsed .auto-op-body{max-height:0 !important;padding:0 !important;margin:0 !important;border-width:0 !important;opacity:0;overflow:hidden;visibility:hidden;contain:layout !important;transition:max-height 0.35s ease,padding 0.25s ease,opacity 0.3s ease}
    #auto-op-panel.body-hidden .auto-op-body{max-height:0 !important;padding:0 !important;margin:0 !important;border-width:0 !important;opacity:0;overflow:hidden;contain:layout !important;transition:max-height 0.35s ease,padding 0.25s ease,opacity 0.3s ease}
    .auto-op-row{margin-bottom:12px;min-height:0}
    .auto-op-row label{display:block;font-size:11px;font-weight:600;font-family:var(--auto-op-font);color:var(--panel-label-text);margin-bottom:5px;letter-spacing:0.5px}
    .auto-op-row input[type="number"],.auto-op-row select,.auto-op-row input[type="text"]{width:100%;background:var(--panel-input-bg) !important;border:1px solid var(--panel-input-border) !important;border-radius:6px;color:var(--panel-input-text) !important;padding:7px 10px;font-size:13px;font-family:var(--auto-op-font);font-variant-numeric:tabular-nums;box-sizing:border-box;outline:none;-webkit-appearance:none}
    .auto-op-row input[type="number"]:focus,.auto-op-row select:focus,.auto-op-row input[type="text"]:focus{border-color:var(--panel-highlight-border) !important}
    .auto-op-row input[type="number"]::placeholder{color:var(--panel-label-text)}
    .auto-op-row select option{background:var(--panel-input-bg);color:var(--panel-input-text)}
    .auto-op-row-switch{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
    .auto-op-row-switch label{margin-bottom:0;flex:1;font-size:11px;font-weight:600;font-family:var(--auto-op-font);color:var(--panel-label-text);letter-spacing:0.5px}
    .auto-op-switch{position:relative;width:36px;height:20px;flex:0 0 36px !important;-webkit-tap-highlight-color:transparent}
    .auto-op-switch input{opacity:0;width:0;height:0;position:absolute}
    .auto-op-switch-track{position:absolute;inset:0;background:#27272a;border:1px solid var(--panel-input-border);border-radius:10px;cursor:pointer;transition:background 0.3s,border-color 0.3s;display:flex;align-items:center}
    .auto-op-switch-thumb{width:14px;height:14px;background:#999;border-radius:50%;transition:transform 0.3s,background 0.3s;pointer-events:none;flex-shrink:0;transform:translateX(3px)}
    .auto-op-switch input:checked + .auto-op-switch-track{background:var(--panel-highlight-border);border-color:var(--panel-highlight-border)}
    .auto-op-switch input:checked + .auto-op-switch-track .auto-op-switch-thumb{transform:translateX(18px);background:#fff}
    .auto-op-target-list-container{min-height:0}
    .auto-op-target-info{background:var(--panel-input-bg);border:1px solid var(--panel-input-border);border-radius:6px;padding:8px 10px;font-size:12px;font-weight:600;font-family:var(--auto-op-font);color:var(--panel-label-text);word-break:break-all;line-height:1.5}
    .auto-op-target-list{max-height:350px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;scrollbar-width:none;-ms-overflow-style:none}
    .auto-op-target-list::-webkit-scrollbar{display:none}
    .auto-op-target-item{background:var(--panel-input-bg);border:1px solid var(--panel-input-border);border-radius:6px;padding:8px 10px;font-size:12px;font-family:var(--auto-op-font);color:var(--panel-highlight-border);word-break:break-all;line-height:1.5;position:relative;min-height:54px;max-height:80px;overflow-y:auto;box-sizing:border-box;transition:border-color 0s,color 0s;scrollbar-width:none;-ms-overflow-style:none}
    .auto-op-target-item::-webkit-scrollbar{display:none}
    .auto-op-target-item.active{border-color:var(--panel-active-border);color:var(--panel-active-text)}
    .auto-op-target-item.missing{border-color:var(--panel-missing-border);color:var(--panel-missing-text)}
    .auto-op-target-item span{display:block;padding-right:20px;white-space:pre-wrap;font-weight:600}
    .auto-op-target-parent{display:block;padding-right:0px !important;font-size:11px;font-weight:600;color:var(--panel-highlight-border);margin-bottom:2px}
    .auto-op-btn-info{display:block;margin-top:4px;margin-bottom:2px;width:16px;height:16px;background:var(--panel-button-bg);border:1px solid var(--panel-button-border);color:var(--panel-button-text);font-size:10px;font-family:var(--auto-op-font);line-height:14px;text-align:center;border-radius:4px;cursor:pointer;padding:0;transition:all 0.3s;-webkit-tap-highlight-color:transparent;user-select:none}
    .auto-op-btn-info:hover{background:var(--panel-highlight-border);color:#fff;border-color:var(--panel-highlight-border)}
    .auto-op-btn-info:active{transform:scale(0.85) !important}
    .auto-op-match-mode{position:absolute !important;right:24px !important;top:4px !important;width:42px !important;height:16px !important;font-size:10px !important;font-weight:500 !important;font-family:var(--auto-op-font) !important;padding:0px 4px !important;background:var(--panel-button-bg) !important;border:1px solid var(--panel-button-border)!important;color:var(--panel-button-text) !important;border-radius:4px !important;opacity:0.8 !important}
    .auto-op-btn-item-del{position:absolute;top:4px;right:4px;width:16px;height:16px;background:var(--panel-button-bg);border:1px solid var(--panel-button-border);color:var(--panel-button-text);font-size:10px;font-family:var(--auto-op-font);line-height:14px;text-align:center;border-radius:4px;cursor:pointer;padding:0;transition:all 0.3s;-webkit-tap-highlight-color:transparent;user-select:none}
    .auto-op-btn-item-del:hover{background:#dc2626;color:#fff;border-color:#dc2626}
    .auto-op-btn-item-del:active{transform:scale(0.85) !important}
    .auto-op-btn-group{display:flex;gap:8px;margin-top:14px}
    .auto-op-btn{flex:1;padding:9px 0;border:none;border-radius:6px;font-size:13px;font-weight:600;font-family:var(--auto-op-font);cursor:pointer;transition:all 0.3s;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;user-select:none}
    .auto-op-btn:active{transform:scale(0.96) !important}
    .auto-op-btn-pick{background:var(--panel-button-bg);color:var(--panel-button-text)}
    .auto-op-btn-pick:hover{background:var(--panel-button-hover-bg);color:var(--panel-button-hover-text)}
    .auto-op-btn-pick.picking{background:#f59e0b;color:#000;animation:auto-op-pulse 1s infinite !important}
    .auto-op-btn-pick:disabled,.auto-op-btn-start:disabled{opacity:0.4;cursor:not-allowed}
    .auto-op-btn-start{background:#16a34a;color:#fff}
    .auto-op-btn-start:hover{background:#22c55e}
    .auto-op-btn-stop{background:#dc2626;color:#fff}
    .auto-op-btn-stop:hover{background:#ef4444}
    .auto-op-status{margin-top:12px;padding-top:12px;border-top:1px solid #888;font-size:12px;font-weight:600;font-family:var(--auto-op-font);color:var(--panel-label-text);display:flex;justify-content:space-between;align-items:center}
    .auto-op-status .auto-op-count{color:var(--panel-highlight-border);font-size:14px;font-family:var(--auto-op-font)}
    .auto-op-status.running .auto-op-count{animation:auto-op-pulse 0.8s infinite !important}
    .auto-op-status .auto-op-waiting{color:var(--panel-waiting-text);font-size:11px;font-family:var(--auto-op-font)}
    .auto-op-status .auto-op-elapsed{color:var(--panel-highlight-border);font-size:11px;font-weight:700;font-family:var(--auto-op-font);font-variant-numeric:tabular-nums;margin-left:8px}
    .auto-op-highlight{outline:2px dashed var(--panel-highlight) !important;outline-offset:1px !important;cursor:crosshair !important}
    .auto-op-selected-highlight{outline:2px solid var(--panel-active-border) !important;outline-offset:1px !important}
    .auto-op-parent-highlight{box-shadow:0 0 0 4px var(--panel-highlight-border) !important;outline-offset:-2px !important;position:relative !important}
    .auto-op-parent-highlight-Overlap{box-shadow:0 0 0 2px var(--panel-highlight-border) !important;position:relative !important}
    .auto-op-nearest-parent-highlight{outline:2px dashed var(--panel-missing-border) !important;outline-offset:-2px !important;position:relative !important}
    .auto-op-btn-clear{flex-shrink:0;padding:0px;font-size:11px;font-family:var(--auto-op-font);background:var(--panel-button-bg);border:1px solid var(--panel-button-border);color:var(--panel-button-text);border-radius:4px;cursor:pointer;white-space:nowrap;max-width:35px;max-height:16px;display:inline-flex;align-items:center;justify-content:center;flex:1;font-weight:600;transition:all 0.3s;-webkit-tap-highlight-color:transparent;user-select:none}
    .auto-op-btn-clear:hover{background:#dc2626;color:#fff;border-color:#dc2626}
    .auto-op-btn-clear:active{transform:scale(0.85) !important}
    .auto-op-target-count{font-size:11px;font-weight:600;font-family:var(--auto-op-font);margin-left:6px;display:inline-flex;align-items:center}
    .auto-op-target-count-exist{color:var(--panel-active-text)}
    .auto-op-target-count-missing{color:var(--panel-missing-text)}
    .auto-op-target-count-total{color:var(--panel-highlight-border)}
    @keyframes auto-op-pulse{0%,100%{opacity:1} 50%{opacity:0.5} }
    @keyframes auto-op-fade-in{from{opacity:0} to{opacity:0.9} }
    .auto-op-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2147483647}
    .auto-op-modal-box{background:var(--panel-bg);border:1px solid var(--panel-border);border-radius:10px;padding:20px;min-width:240px;max-width:275px;max-height:250px;overflow-y:auto;display:flex;flex-direction:column}
    .auto-op-modal-text{font-size:13px;font-weight:500;font-family:var(--auto-op-font);color:var(--panel-text);line-height:1.6;margin-bottom:16px;word-break:break-all;white-space:pre-wrap;flex:1 1 auto;overflow-y:auto;min-height:0}
    .auto-op-modal-btns{display:flex;gap:8px;flex-shrink:0}
    .auto-op-modal-btn{flex:1;padding:8px 0;border:none;border-radius:6px;font-size:13px;font-weight:600;font-family:var(--auto-op-font);cursor:pointer;transition:all 0.3s;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;user-select:none}
    .auto-op-modal-btn:active{transform:scale(0.96) !important}
    .auto-op-modal-cancel{background:var(--panel-button-bg);color:var(--panel-button-text)}
    .auto-op-modal-cancel:hover{background:var(--panel-button-hover-bg);color:var(--panel-button-hover-text)}
    .auto-op-modal-ok{background:var(--panel-missing-border);color:#fff;opacity:0.9 !important}
    .auto-op-modal-ok:hover{opacity:1 !important}
    .auto-op-progress-info{display:flex;justify-content:space-between;align-items:center;margin-top:8px;margin-bottom:6px;font-family:var(--auto-op-font)}
    .auto-op-progress-percent{color:var(--panel-highlight-border);font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}
    .auto-op-progress-time{color:var(--panel-label-text);font-size:12px;font-weight:600;font-variant-numeric:tabular-nums}
    .auto-op-progress-container{width:100%;height:8px;background:var(--panel-input-bg);border:1px solid var(--panel-input-border);border-radius:4px;overflow:hidden;margin-bottom:12px}
    .auto-op-progress-fill{height:100%;width:0%;background:var(--panel-highlight-border);border-radius:3px;transition:width 0.3s ease,background-color 0.5s ease}
    .auto-op-log-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}
    .auto-op-log-header label{margin-bottom:0;font-size:11px;font-weight:600;font-family:var(--auto-op-font);color:var(--panel-label-text);letter-spacing:0.5px}
    .auto-op-log-container{background:var(--panel-input-bg);border:1px solid var(--panel-input-border);border-radius:6px;padding:8px 10px;max-height:300px;overflow-y:auto;font-size:11px;font-family:var(--auto-op-font);color:var(--panel-label-text);scrollbar-width:none}
    .auto-op-log-container::-webkit-scrollbar{display:none}
    .auto-op-log-entry{padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);line-height:1.5;word-break:break-all}
    .auto-op-log-entry:last-child{border-bottom:none}
    .auto-op-log-time{color:var(--panel-highlight-border);font-weight:700;margin-right:4px}
    .auto-op-log-msg{color:var(--panel-text);font-weight:500}
    .auto-op-log-empty{color:var(--panel-label-text);font-style:italic;text-align:center;padding:6px 0;font-size:11px}
    .auto-op-page-selector{display:flex;align-items:center;justify-content:space-between;padding:0;margin:0 0 10px;gap:8px;flex-shrink:0}
    .auto-op-page-btn{width:30px;height:30px;border:1px solid var(--panel-button-border);background:var(--panel-button-bg);color:var(--panel-button-text);border-radius:6px;cursor:pointer;font-size:14px;font-weight:700;font-family:var(--auto-op-font);display:flex;align-items:center;justify-content:center;padding:0;transition:background 0.3s,color 0.3s,transform 0.15s ease;-webkit-tap-highlight-color:transparent;user-select:none;flex-shrink:0}
    .auto-op-page-btn:hover{background:var(--panel-button-hover-bg);color:var(--panel-button-hover-text)}
    .auto-op-page-btn:active{transform:scale(0.85) !important}
    .auto-op-page-btn-space{flex:1;min-width:0}
    .auto-op-page-container{position:relative;width:100%;overflow:hidden;transition:height 0.4s cubic-bezier(0.4,0,0.2,1)}
    .auto-op-page{display:none;opacity:0;transition:opacity 0.2s ease}
    .auto-op-page.active{display:block;opacity:1}
    .auto-op-row .auto-op-label-with-countdown{display:flex;align-items:center;justify-content:space-between}
    .auto-op-row .auto-op-autostart-countdown{font-size:10px;font-weight:600;font-family:var(--auto-op-font);color:var(--panel-waiting-text);white-space:nowrap;flex-shrink:0}
    #auto-op-power-save-overlay{position:fixed;inset:0;background:#000;z-index:2147483647;display:none;overflow:hidden}
    #auto-op-power-save-overlay.active{display:block}
    .ps-element{position:absolute;color:#333;font-family:var(--auto-op-font);font-variant-numeric:tabular-nums;font-weight:700;transition:left 5s ease,top 5s ease;user-select:none;pointer-events:none}
    .ps-element.ps-time{font-size:40px}
    .ps-element.ps-elapsed{font-size:20px}
    .ps-element.ps-count{font-size:20px}
    .ps-switch-area{position:absolute;transition:left 1s ease,top 1s ease;pointer-events:auto;width:36px;height:20px}
    .ps-switch-area .auto-op-switch{width:36px;height:20px;position:relative;display:block;cursor:pointer}
    .ps-switch-area .auto-op-switch input{position:absolute;width:36px;height:20px;opacity:0;z-index:1;cursor:pointer;margin:0}
    .ps-switch-area .auto-op-switch-track{position:absolute;inset:0;background:#111;border:1px solid #333;border-radius:10px;display:flex;align-items:center;cursor:pointer}
    .ps-switch-area .auto-op-switch-thumb{width:14px;height:14px;background:#444;border-radius:50%;transition:transform 0.3s;pointer-events:none;transform:translateX(3px)}
    .ps-switch-area .auto-op-switch input:checked+.auto-op-switch-track{background:#333;border-color:#666}
    .ps-switch-area .auto-op-switch input:checked+.auto-op-switch-track .auto-op-switch-thumb{transform:translateX(18px);background:#777}
  `;
  document.head.appendChild(style);
  function detectBrowserTheme() { const h = document.documentElement, b = document.body; const d = (el) => el.classList.contains('dark') || el.classList.contains('dark-mode') || el.classList.contains('night') || el.classList.contains('theme-dark') || el.getAttribute('data-theme') === 'dark' || el.getAttribute('data-color-scheme') === 'dark'; isDarkMode = d(h) || d(b) || window.matchMedia('(prefers-color-scheme: dark)').matches; document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light'); window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => { isDarkMode = e.matches; document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light'); }); }
  // ===================== 创建面板 =====================
  const panel = document.createElement('div');
  panel.id = 'auto-op-panel';
  panel.innerHTML = `
    <div class="auto-op-header">
      <button class="auto-op-toggle" title="收起/展开">−</button>
      <button class="auto-op-header-start" id="auto-op-btn-header-start" title="开始/停止">▶</button>
      <h3>自动操作</h3>
      <div class="auto-op-config-wrap">
        <button class="auto-op-config-btn" id="auto-op-config-btn" title="切换配置">①</button>
      </div>
    </div>
    <div class="auto-op-body">
      <div class="auto-op-page-selector">
        <button class="auto-op-page-btn" id="auto-op-page-prev" title="上一页"><</button>
        <div class="auto-op-page-btn-space"></div>
        <button class="auto-op-page-btn" id="auto-op-page-next" title="下一页">></button>
      </div>
      <div class="auto-op-page-container" id="auto-op-page-container">
        <div class="auto-op-page active" data-page="0">
          <div class="auto-op-row-switch">
            <label>多选模式</label>
            <label class="auto-op-switch"><input type="checkbox" id="auto-op-multi-mode"><span class="auto-op-switch-track"><span class="auto-op-switch-thumb"></span></span></label>
          </div>
          <div class="auto-op-row" id="auto-op-strategy-row" style="display: none">
            <label>操作策略</label>
            <select id="auto-op-click-strategy">
              <option value="simultaneous">同时操作（0ms队列）</option>
              <option value="sequential">队列操作</option>
            </select>
          </div>
          <div class="auto-op-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
            <label style="margin-bottom: 0;">目标元素</label>
            <span id="auto-op-target-count" class="auto-op-target-count"></span>
            <span style="flex: 1;"></span>
            <button class="auto-op-btn-clear" id="auto-op-btn-clear-all" style="display: none;">清空</button>
          </div>
          <div class="auto-op-row" style="margin-top: 0;">
            <div class="auto-op-target-list-container" id="auto-op-target-list-container">
              <div class="auto-op-target-info">未选取，请点击下方按钮选取</div>
            </div>
          </div>
          <div class="auto-op-row" id="auto-op-auto-fill-row" style="display: none;">
            <label>自动填充内容</label>
            <input type="text" id="auto-op-auto-fill" placeholder="输入内容（留空为清空）">
          </div>
        </div>
        <div class="auto-op-page" data-page="1">
          <div class="auto-op-row"><label>操作次数</label><input type="number" id="auto-op-max-clicks" min="0" placeholder="留空为无限"></div>
          <div class="auto-op-row"><label>操作时间 (min)</label><input type="number" id="auto-op-max-duration" min="0" step="0.0001" placeholder="留空为无限 支持小数"></div>
          <div class="auto-op-row"><label>操作间隔 (ms)</label><input type="number" id="auto-op-click-interval" min="1" placeholder="1000" value="1000"></div>
          <div class="auto-op-row"><div class="auto-op-label-with-countdown"><label style="margin-bottom:0;">自动启动 (min)</label><span class="auto-op-autostart-countdown" id="auto-op-autostart-countdown"></span></div><input type="number" id="auto-op-autostart-interval" min="0" step="0.0001" placeholder="留空为关闭 支持小数"></div>
          <div class="auto-op-row"><label>元素消失后</label><select id="auto-op-missing-action"><option value="wait">等待重试（自动继续）</option><option value="stop">立即停止</option></select></div>
        </div>
        <div class="auto-op-page" data-page="2">
          <div class="auto-op-row-switch"><label>自动刷新网页</label><label class="auto-op-switch"><input type="checkbox" id="auto-op-auto-refresh"><span class="auto-op-switch-track"><span class="auto-op-switch-thumb"></span></span></label></div>
          <div class="auto-op-row" id="auto-op-refresh-interval-row"><label>刷新间隔 (s) 范围：10 ~ 86400</label><input type="number" id="auto-op-refresh-interval" min="10" max="86400" placeholder="60" value="60"></div>
          <div class="auto-op-row"><div class="auto-op-log-header"><label>刷新日志</label><button class="auto-op-btn-clear" id="auto-op-btn-clear-log">清空</button></div><div class="auto-op-log-container" id="auto-op-log-container"><div class="auto-op-log-empty">暂无日志</div></div></div>
          <div class="auto-op-row-switch"><label>省电模式</label><label class="auto-op-switch"><input type="checkbox" id="auto-op-power-save"><span class="auto-op-switch-track"><span class="auto-op-switch-thumb"></span></span></label></div>
          <div class="auto-op-row-switch"><label>屏幕常亮</label><label class="auto-op-switch"><input type="checkbox" id="auto-op-wake-lock"><span class="auto-op-switch-track"><span class="auto-op-switch-thumb"></span></span></label></div>
          <div class="auto-op-row-switch"><label>禁止聚焦</label><label class="auto-op-switch"><input type="checkbox" id="auto-op-suppress-focus"><span class="auto-op-switch-track"><span class="auto-op-switch-thumb"></span></span></label></div>
        </div>
      </div>
      <div id="auto-op-refresh-progress" style="display: none;">
        <div class="auto-op-progress-info"><span class="auto-op-progress-percent" id="auto-op-refresh-percent">0%</span><span class="auto-op-progress-time" id="auto-op-refresh-time">剩余 --:--</span></div>
        <div class="auto-op-progress-container"><div class="auto-op-progress-fill" id="auto-op-progress-fill"></div></div>
      </div>
      <div class="auto-op-btn-group">
        <button class="auto-op-btn auto-op-btn-pick" id="auto-op-btn-pick">选取元素</button>
        <button class="auto-op-btn auto-op-btn-start" id="auto-op-btn-start" disabled>开始</button>
      </div>
      <div class="auto-op-status" id="auto-op-status">
        <span>已操作：<span class="auto-op-count" id="auto-op-count">0</span>次<span class="auto-op-elapsed" id="auto-op-elapsed">00:00:00</span></span>
        <span id="auto-op-state">请选取目标元素</span>
      </div>
    </div>
    <div id="auto-op-modal" style="display:none;">
      <div class="auto-op-modal-overlay">
        <div class="auto-op-modal-box">
          <div class="auto-op-modal-text" id="auto-op-modal-text"></div>
          <div class="auto-op-modal-btns"><button class="auto-op-modal-btn auto-op-modal-cancel" id="auto-op-modal-cancel">取消</button><button class="auto-op-modal-btn auto-op-modal-ok" id="auto-op-modal-ok">确定</button></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);
  // 省电模式遮罩
  const powerSaveOverlay = document.createElement('div');
  powerSaveOverlay.id = 'auto-op-power-save-overlay';
  powerSaveOverlay.innerHTML = `
    <div class="ps-element ps-time" id="ps-time"></div>
    <div class="ps-element ps-elapsed" id="ps-elapsed"></div>
    <div class="ps-element ps-count" id="ps-count"></div>
    <div class="ps-switch-area" id="ps-switch-area">
      <label class="auto-op-switch"><input type="checkbox" checked id="ps-switch"><span class="auto-op-switch-track"><span class="auto-op-switch-thumb"></span></span></label>
    </div>
  `;
  document.body.appendChild(powerSaveOverlay);
  // ===================== 配置下拉菜单 =====================
  const configMenuEl = document.createElement('div');
  configMenuEl.className = 'auto-op-config-menu';
  document.body.appendChild(configMenuEl);
  // ===================== DOM 引用 =====================
  const targetListContainer = document.getElementById('auto-op-target-list-container'),
    autoFillInput = document.getElementById('auto-op-auto-fill'),
    maxClicksInput = document.getElementById('auto-op-max-clicks'),
    clickIntervalInput = document.getElementById('auto-op-click-interval'),
    missingActionSelect = document.getElementById('auto-op-missing-action'),
    btnPick = document.getElementById('auto-op-btn-pick'),
    btnStart = document.getElementById('auto-op-btn-start'),
    statusDiv = document.getElementById('auto-op-status'),
    countSpan = document.getElementById('auto-op-count'),
    stateSpan = document.getElementById('auto-op-state'),
    toggleBtn = panel.querySelector('.auto-op-toggle'),
    dragHandle = panel.querySelector('.auto-op-header'),
    btnClearAll = document.getElementById('auto-op-btn-clear-all'),
    targetCountSpan = document.getElementById('auto-op-target-count'),
    multiModeCheckbox = document.getElementById('auto-op-multi-mode'),
    strategyRow = document.getElementById('auto-op-strategy-row'),
    strategySelect = document.getElementById('auto-op-click-strategy'),
    btnHeaderStart = document.getElementById('auto-op-btn-header-start'),
    pageContainer = document.getElementById('auto-op-page-container'),
    btnPagePrev = document.getElementById('auto-op-page-prev'),
    btnPageNext = document.getElementById('auto-op-page-next'),
    autoRefreshCheckbox = document.getElementById('auto-op-auto-refresh'),
    refreshIntervalInput = document.getElementById('auto-op-refresh-interval'),
    refreshProgressDiv = document.getElementById('auto-op-refresh-progress'),
    refreshPercentSpan = document.getElementById('auto-op-refresh-percent'),
    refreshTimeSpan = document.getElementById('auto-op-refresh-time'),
    refreshProgressFill = document.getElementById('auto-op-progress-fill'),
    logContainer = document.getElementById('auto-op-log-container'),
    btnClearLog = document.getElementById('auto-op-btn-clear-log'),
    maxDurationInput = document.getElementById('auto-op-max-duration'),
    autoStartIntervalInput = document.getElementById('auto-op-autostart-interval'),
    autoStartCountdownLabel = document.getElementById('auto-op-autostart-countdown'),
    elapsedSpan = document.getElementById('auto-op-elapsed'),
    configBtnEl = document.getElementById('auto-op-config-btn');
  const powerSaveCheckbox = document.getElementById('auto-op-power-save');
  const psTimeEl = document.getElementById('ps-time');
  const psElapsedEl = document.getElementById('ps-elapsed');
  const psCountEl = document.getElementById('ps-count');
  const psSwitchWrapEl = document.getElementById('ps-switch-area');
  const psSwitchEl = document.getElementById('ps-switch');
  const wakeLockCheckbox = document.getElementById('auto-op-wake-lock');
  const suppressFocusCheckbox = document.getElementById('auto-op-suppress-focus');
  // ===================== 配置下拉菜单逻辑 =====================
  function closeConfigMenu() { if (!configMenuEl.classList.contains('open')) return; configMenuEl.classList.remove('open'); configMenuEl.classList.add('closing'); setTimeout(() => { configMenuEl.classList.remove('closing'); }, 200); }
  function buildConfigMenu() {
    let html = '';
    for (let i = 0; i < CONFIG_COUNT; i++) {
      html += '<div class="auto-op-config-item' + (i === activeConfig ? ' active' : '') + (configs[i].isRunning ? ' has-run' : '') + '" data-ci="' + i + '">' + CONFIG_NAMES[i] + '</div>';
    }
    configMenuEl.innerHTML = html;
  }
  function openConfigMenu() {
    buildConfigMenu();
    const rect = configBtnEl.getBoundingClientRect();
    const menuHeight = CONFIG_COUNT * 36;
    const spaceBelow = window.innerHeight - rect.bottom;
    configMenuEl.style.left = Math.min(rect.left, window.innerWidth - 120) + 'px';
    configMenuEl.style.right = 'auto';
    if (spaceBelow < menuHeight + 10) {
      configMenuEl.style.top = 'auto';
      configMenuEl.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
      configMenuEl.style.transformOrigin = 'bottom left';
    } else {
      configMenuEl.style.top = (rect.bottom + 4) + 'px';
      configMenuEl.style.bottom = 'auto';
      configMenuEl.style.transformOrigin = 'top left';
    }
    configMenuEl.classList.remove('closing');
    configMenuEl.classList.remove('open');
    void configMenuEl.offsetWidth;
    configMenuEl.classList.add('open');
  }
  function updateConfigBtnLabel() { configBtnEl.textContent = CONFIG_NAMES[activeConfig]; }

  configBtnEl.addEventListener('click', e => {
    e.stopPropagation();
    if (configMenuEl.classList.contains('open')) closeConfigMenu();
    else openConfigMenu();
  });
  document.addEventListener('click', (e) => { if (isProgrammaticClick) return; closeConfigMenu(); });
  configMenuEl.addEventListener('click', e => {
    const item = e.target.closest('.auto-op-config-item');
    if (!item) return;
    const ci = parseInt(item.dataset.ci);
    if (!isNaN(ci) && ci !== activeConfig) switchConfig(ci);
    closeConfigMenu();
  });
  // ===================== 省电模式 =====================
  function isTooClose(px, py, positions) {
    return positions.some(p => Math.abs(p.x - px) < 220 && Math.abs(p.y - py) < 60);
  }
  function randomizePSPositions() {
    const items = [psTimeEl, psElapsedEl, psCountEl, psSwitchWrapEl];
    const w = window.innerWidth, h = window.innerHeight;
    const margin = 80;
    const positions = [];
    for (let i = 0; i < 4; i++) {
      let x, y, ok = false, attempts = 0;
      while (!ok && attempts < 100) {
        x = margin + Math.random() * Math.max(100, w - margin * 2 - 200);
        y = margin + Math.random() * Math.max(100, h - margin * 2 - 40);
        ok = !isTooClose(x, y, positions);
        attempts++;
      }
      positions.push({ x, y });
    }
    items.forEach((item, i) => {
      if (item) {
        item.style.left = Math.round(positions[i].x) + 'px';
        item.style.top = Math.round(positions[i].y) + 'px';
      }
    });
  }
  function updatePowerSaveOverlay() {
    psTimeEl.textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    let totalCount = 0, longestElapsed = 0, anyRunning = false;
    for (const c of configs) {
      if (c.isRunning && c.operationStartTimestamp) {
        anyRunning = true;
        totalCount += c.clickedCount;
        const elapsed = Date.now() - c.operationStartTimestamp;
        if (elapsed > longestElapsed) longestElapsed = elapsed;
      }
    }
    psElapsedEl.textContent = anyRunning ? '运行 ' + formatElapsedTime(longestElapsed) : '未运行';
    psCountEl.textContent = '已操作 ' + totalCount + ' 次';
    randomizePSPositions();
  }
  function enablePowerSave() {
    isPowerSave = true;
    if (isPicking) exitPickMode();
    powerSaveOverlay.classList.add('active');
    psSwitchEl.checked = true;
    powerSaveCheckbox.checked = true;
    updatePowerSaveOverlay();
    if (powerSaveTimerID) clearInterval(powerSaveTimerID);
    powerSaveTimerID = setInterval(updatePowerSaveOverlay, 10000);
    try {
      const p = document.documentElement.requestFullscreen();
      if (p && p.catch) p.catch(() => { powerSaveOverlay.dataset.needFs = '1'; });
    } catch (e) { powerSaveOverlay.dataset.needFs = '1'; }
  }
  function disablePowerSave() {
    isPowerSave = false;
    powerSaveOverlay.classList.remove('active');
    if (powerSaveTimerID) { clearInterval(powerSaveTimerID); powerSaveTimerID = null; }
    psSwitchEl.checked = false;
    powerSaveCheckbox.checked = false;
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    const c = cv();
    countSpan.textContent = c.clickedCount;
    if (c.isRunning && c.operationStartTimestamp) {
      elapsedSpan.textContent = formatElapsedTime(Date.now() - c.operationStartTimestamp);
      if (elapsedTimerID_global) clearInterval(elapsedTimerID_global);
      elapsedTimerID_global = setInterval(() => { const cc = cv(); if (!cc.isRunning || !cc.operationStartTimestamp) return; elapsedSpan.textContent = formatElapsedTime(Date.now() - cc.operationStartTimestamp); }, 1000);
    }
    statusDiv.classList.toggle('running', c.isRunning);
    refreshParentHighlights();
    updateTargetUI();
    updateTargetCount();
    updateAutoFillVisibility();
    if (c.targets.length > 0) stateSpan.textContent = c.isRunning ? '运行中' : '就绪';
    else stateSpan.textContent = '请选取目标元素';
  }
  powerSaveCheckbox.addEventListener('change', e => { e.stopPropagation(); if (e.target.checked) enablePowerSave(); else disablePowerSave(); });
  psSwitchEl.addEventListener('change', () => { if (!psSwitchEl.checked) disablePowerSave(); else enablePowerSave(); });
  powerSaveOverlay.addEventListener('click', () => { if (powerSaveOverlay.dataset.needFs === '1' && isPowerSave) { try { const p = document.documentElement.requestFullscreen(); if (p && p.catch) p.catch(() => {}); powerSaveOverlay.dataset.needFs = ''; } catch (e) {} } });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && isPowerSave) {
      disablePowerSave();
    }
  });
  // ===================== switchConfig =====================
  function switchConfig(newIndex) {
    if (isPicking) exitPickMode();
    const old = cv();
    old.clickInterval = parseInt(clickIntervalInput.value) || 1000;
    old.autoFillContent = autoFillInput.value;
    old.maxClicks = maxClicksInput.value === '' ? Infinity : (parseInt(maxClicksInput.value) || Infinity);
    old.maxDurationMin = parseFloat(maxDurationInput.value) || 0;
    old.clickStrategy = strategySelect.value;
    old.isMultiMode = multiModeCheckbox.checked;
    old.missingAction = missingActionSelect.value;
    savePerConfig(activeConfig);
    old.targets.forEach(t => {
      if (t.element && t.element.classList) t.element.classList.remove('auto-op-selected-highlight');
      if (t._blueParent && t._blueParent.classList) { t._blueParent.classList.remove('auto-op-parent-highlight'); t._blueParent.classList.remove('auto-op-parent-highlight-Overlap'); }
      if (t._nearestEl && t._nearestEl.classList) t._nearestEl.classList.remove('auto-op-nearest-parent-highlight');
    });
    activeConfig = newIndex;
    const c = cv();
    beginQueryCycle();
    c.targets.forEach(t => {
      if (!t.element || !document.contains(t.element)) {
        const found = tryFindTarget(t);
        if (found && found.length > 0) {
          t.element = found[0];
          const pi = resolveParentInfo(found[0]);
          t.nearestParent = pi.nearestParent;
          t.blueParent = pi.blueParent;
        } else {
          t.element = null;
        }
      }
      t._isValid = !!t.element && document.contains(t.element) && matchesFingerprint(t.element, t.fingerprint, t.matchMode);
    });
    c.targets.forEach(t => { if (t.element && t.element.classList && document.contains(t.element)) t.element.classList.add('auto-op-selected-highlight'); });
    multiModeCheckbox.checked = c.isMultiMode;
    strategyRow.style.display = c.isMultiMode ? 'block' : 'none';
    strategySelect.value = c.clickStrategy;
    autoFillInput.value = c.autoFillContent;
    maxClicksInput.value = c.maxClicks === Infinity ? '' : c.maxClicks;
    clickIntervalInput.value = c.clickInterval;
    missingActionSelect.value = c.missingAction || 'wait';
    maxDurationInput.value = c.maxDurationMin > 0 ? c.maxDurationMin : '';
    autoStartIntervalInput.value = c.autoStartIntervalMin > 0 ? c.autoStartIntervalMin : '';
    if (c.isRunning) {
      btnStart.textContent = '停止'; btnStart.className = 'auto-op-btn auto-op-btn-stop';
      btnHeaderStart.textContent = '■'; btnHeaderStart.classList.add('is-stop');
      btnPick.disabled = true; multiModeCheckbox.disabled = true; strategySelect.disabled = true;
      maxClicksInput.disabled = true; clickIntervalInput.disabled = true; missingActionSelect.disabled = true;
      autoFillInput.disabled = true; maxDurationInput.disabled = true; autoStartIntervalInput.disabled = true;
      statusDiv.classList.add('running');
    } else {
      btnStart.textContent = '开始'; btnStart.className = 'auto-op-btn auto-op-btn-start';
      btnHeaderStart.textContent = '▶'; btnHeaderStart.classList.remove('is-stop');
      btnPick.disabled = false; multiModeCheckbox.disabled = false; strategySelect.disabled = false;
      maxClicksInput.disabled = false; clickIntervalInput.disabled = false; missingActionSelect.disabled = false;
      autoFillInput.disabled = false; maxDurationInput.disabled = false; autoStartIntervalInput.disabled = false;
      statusDiv.classList.remove('running');
    }
    if (c.autoStartEnabled && c.autoStartIntervalMin > 0 && !c.isRunning && c.autoStartNextTime) {
      const rem = c.autoStartNextTime - Date.now();
      autoStartCountdownLabel.textContent = rem > 0 ? '距下次启动 ' + formatAutoStartCountdown(rem) : '即将启动...';
    } else {
      autoStartCountdownLabel.textContent = '';
    }
    refreshParentHighlights(); updateTargetUI(); updateTargetCount(); updateAutoFillVisibility();
    countSpan.textContent = c.clickedCount;
    if (c.isRunning && c.operationStartTimestamp) {
      elapsedSpan.textContent = formatElapsedTime(Date.now() - c.operationStartTimestamp);
      if (elapsedTimerID_global) clearInterval(elapsedTimerID_global);
      elapsedTimerID_global = setInterval(() => { const cc = cv(); if (!cc.isRunning || !cc.operationStartTimestamp) return; elapsedSpan.textContent = formatElapsedTime(Date.now() - cc.operationStartTimestamp); }, 1000);
    } else { elapsedSpan.textContent = '00:00:00'; if (elapsedTimerID_global) { clearInterval(elapsedTimerID_global); elapsedTimerID_global = null; } }
    if (c.isWaiting) stateSpan.classList.add('auto-op-waiting');
    else stateSpan.classList.remove('auto-op-waiting');
    if (c.targets.length > 0) stateSpan.textContent = c.isRunning ? '运行中' : '就绪';
    else stateSpan.textContent = '请选取目标元素';
    updateConfigBtnLabel(); saveData(); goToPage(0, false);
  }
  // ===================== 持久化 =====================
  function savePerConfig(ci) {
    try {
      const c = configs[ci];
      localStorage.setItem(PER_CONFIG_KEY + ci, JSON.stringify({
        isMultiMode: c.isMultiMode, clickStrategy: c.clickStrategy,
        clickInterval: c.clickInterval, maxClicks: c.maxClicks === Infinity ? '' : c.maxClicks,
        missingAction: c.missingAction || 'wait', autoFillContent: c.autoFillContent,
        autoStartIntervalMin: c.autoStartIntervalMin > 0 ? c.autoStartIntervalMin : '',
        maxDurationMin: c.maxDurationMin > 0 ? c.maxDurationMin : '',
        targets: c.targets.map(t => ({
          strict: t.strict, loose: t.loose, fingerprint: t.fingerprint, desc: t.desc,
          isInput: t.isInput, matchMode: t.matchMode, parentSelector: t.parentSelector,
          parentChain: t.parentChain || [], isAuto: !!t.isAuto
        }))
      }));
    } catch (e) { console.error('[AUTO_OP] savePerConfig 异常:', e); }
  }
  function loadPerConfig(ci) {
    try {
      const saved = localStorage.getItem(PER_CONFIG_KEY + ci);
      if (!saved) return;
      const cfg = JSON.parse(saved), c = configs[ci];
      c.isMultiMode = cfg.isMultiMode || false;
      c.clickStrategy = cfg.clickStrategy || 'simultaneous';
      c.clickInterval = cfg.clickInterval || 1000;
      c.maxClicks = (cfg.maxClicks === '' || cfg.maxClicks === undefined) ? Infinity : (parseInt(cfg.maxClicks) || Infinity);
      c.missingAction = cfg.missingAction || 'wait';
      c.autoFillContent = cfg.autoFillContent || '';
      if (cfg.autoStartIntervalMin !== undefined && cfg.autoStartIntervalMin !== '' && parseFloat(cfg.autoStartIntervalMin) > 0) { c.autoStartEnabled = true; c.autoStartIntervalMin = parseFloat(cfg.autoStartIntervalMin); }
      if (cfg.maxDurationMin !== undefined && cfg.maxDurationMin !== '' && parseFloat(cfg.maxDurationMin) > 0) c.maxDurationMin = parseFloat(cfg.maxDurationMin);
      c.targets = [];
      (cfg.targets || []).forEach(t => {
        const base = { strict: t.strict, loose: t.loose, fingerprint: t.fingerprint, desc: t.desc, isInput: !!t.isInput, matchMode: t.matchMode || 'strict', parentSelector: t.parentSelector || '', parentChain: t.parentChain || [], isAuto: !!t.isAuto, missCount: 0, nearestParent: null, blueParent: null, _blueParent: null, _nearestEl: null };
        const found = tryFindTarget({ ...base, element: null });
        if (found && found.length > 0) {
          found.forEach(el => {
            const obj = { ...base, element: el };
            const parentInfo = resolveParentInfo(el); obj.nearestParent = parentInfo.nearestParent; obj.blueParent = parentInfo.blueParent;
            c.targets.push(obj); c.discoveredElements.add(el);
          });
        } else { c.targets.push({ ...base, element: null }); }
      });
      c.targets.forEach(t => { t._isValid = !!t.element && document.contains(t.element) && matchesFingerprint(t.element, t.fingerprint, t.matchMode); });
    } catch (e) { console.error('[AUTO_OP] loadPerConfig 异常:', e); }
  }
  function migrateOldData() {
    const oldKey = 'AUTO_OP_CONFIG_' + window.location.hostname;
    try {
      const saved = localStorage.getItem(oldKey);
      if (!saved) return;
      localStorage.setItem(PER_CONFIG_KEY + '0', saved);
      const cfg = JSON.parse(saved), shared = {};
      if (cfg.isAutoRefresh !== undefined) shared.isAutoRefresh = cfg.isAutoRefresh;
      if (cfg.refreshIntervalSec !== undefined) shared.refreshIntervalSec = cfg.refreshIntervalSec;
      if (cfg.refreshLogs) shared.refreshLogs = cfg.refreshLogs;
      if (cfg.currentPage !== undefined) shared.currentPage = cfg.currentPage;
      if (Object.keys(shared).length > 0) localStorage.setItem(SHARED_KEY, JSON.stringify(shared));
      localStorage.removeItem(oldKey);
    } catch (e) {}
  }
  function saveShared() { try { localStorage.setItem(SHARED_KEY, JSON.stringify({ isAutoRefresh, refreshIntervalSec, refreshLogs, currentPage, activeConfig, wakeLock: wakeLockCheckbox.checked, suppressFocus: suppressFocusCheckbox.checked })); } catch (e) {} }
  function loadShared() {
    try {
      const saved = localStorage.getItem(SHARED_KEY);
      if (!saved) return;
      const cfg = JSON.parse(saved);
      if (cfg.isAutoRefresh !== undefined) { isAutoRefresh = cfg.isAutoRefresh; autoRefreshCheckbox.checked = isAutoRefresh; }
      if (cfg.refreshIntervalSec !== undefined) { refreshIntervalSec = cfg.refreshIntervalSec; refreshIntervalInput.value = refreshIntervalSec; }
      if (cfg.refreshLogs && Array.isArray(cfg.refreshLogs)) { refreshLogs = cfg.refreshLogs.map(item => typeof item === 'string' ? { time: item, msg: '页面已刷新' } : item); updateLogUI(); }
      if (typeof cfg.currentPage === 'number') currentPage = cfg.currentPage;
      if (typeof cfg.activeConfig === 'number' && cfg.activeConfig >= 0 && cfg.activeConfig < CONFIG_COUNT) activeConfig = cfg.activeConfig;
      if (cfg.wakeLock !== undefined) wakeLockCheckbox.checked = cfg.wakeLock;
      if (cfg.suppressFocus !== undefined) suppressFocusCheckbox.checked = cfg.suppressFocus;
    } catch (e) {}
  }
  function saveData() { savePerConfig(activeConfig); saveShared(); }
  function loadData() {
    migrateOldData(); loadShared();
    for (let i = 0; i < CONFIG_COUNT; i++) loadPerConfig(i);
    const c = cv();
    multiModeCheckbox.checked = c.isMultiMode;
    strategyRow.style.display = c.isMultiMode ? 'block' : 'none';
    strategySelect.value = c.clickStrategy;
    clickIntervalInput.value = c.clickInterval;
    maxClicksInput.value = c.maxClicks === Infinity ? '' : c.maxClicks;
    missingActionSelect.value = c.missingAction || 'wait';
    autoFillInput.value = c.autoFillContent;
    autoStartIntervalInput.value = c.autoStartIntervalMin > 0 ? c.autoStartIntervalMin : '';
    maxDurationInput.value = c.maxDurationMin > 0 ? c.maxDurationMin : '';
    c.targets.forEach(t => { if (t.element && t.element.classList && document.contains(t.element)) t.element.classList.add('auto-op-selected-highlight'); });
    updateTargetUI(); updateTargetCount(); updateAutoFillVisibility(); refreshParentHighlights();
    if (c.targets.length > 0) stateSpan.textContent = '就绪';
    updateConfigBtnLabel();
  }
  // ===================== 元素查找工具 =====================
  function buildBaseSelector(el) { if (el.id) return '#' + CSS.escape(el.id); let sel = el.tagName.toLowerCase(); if (el.className && typeof el.className === 'string') { const cls = el.className.trim().split(/\s+/).filter(c => c && !c.startsWith('auto-op-')).map(c => '.' + CSS.escape(c)).join(''); if (cls) sel += cls; } return sel; }
  function buildSelectors(el) { const base = buildBaseSelector(el); if (el.id) return { strict: base, loose: base }; let strict = base; const parent = el.parentElement; if (parent) { try { const sameTagSiblings = Array.from(parent.children).filter(c => c.tagName === el.tagName); if (sameTagSiblings.length > 1) strict += ':nth-of-type(' + (sameTagSiblings.indexOf(el) + 1) + ')'; } catch (e) {} } return { strict, loose: base }; }
  function isInputField(el) { if (!el) return false; if (el.isContentEditable || el.tagName === 'TEXTAREA') return true; if (el.tagName === 'INPUT') { const t = (el.type || '').toLowerCase(); return t !== 'checkbox' && t !== 'radio' && t !== 'hidden' && t !== 'file' && t !== 'color' && t !== 'submit' && t !== 'button' && t !== 'reset' && t !== 'image'; } return false; }
  function getElText(el) { let text = (el.textContent || '').trim(); if (!text) { for (const attr of ['alt', 'title', 'placeholder', 'aria-label', 'value']) { const val = el.getAttribute(attr); if (val && val.trim() && val.trim().length < 50) { text = val.trim(); break; } } } if (!text && el.children.length > 0) { for (const child of el.children) { const cText = (child.textContent || '').trim(); if (cText) { text = cText; break; } for (const attr of ['alt', 'title']) { const val = child.getAttribute(attr); if (val && val.trim()) { text = val.trim(); break; } } if (text) break; } } if (!text) { try { for (const pseudo of ['::before', '::after']) { const computedStyle = window.getComputedStyle(el, pseudo); let content = computedStyle.getPropertyValue('content'); if (content && content !== 'none' && content !== 'normal' && content !== '""') { content = content.replace(/^"|"$/g, '').replace(/^'|'$/g, '').trim(); if (content && !(content.length <= 2 && /[\uE000-\uF8FF]/.test(content))) { text = content; break; } } } } catch (e) {} } return text; }
  function getElementFingerprint(el) { const dataAttrs = {}, attrs = {}; const keyAttrs = ['href', 'src', 'value', 'type', 'name', 'role', 'alt', 'title', 'placeholder', 'action', 'method', 'onclick']; Array.from(el.attributes).forEach(attr => { if (attr.name.startsWith('data-')) dataAttrs[attr.name] = attr.value; else if (keyAttrs.includes(attr.name)) attrs[attr.name] = attr.value; }); let onclickParam = ''; if (attrs.onclick) { const match = attrs.onclick.match(/useItem$$(\d+)$$/); if (match) onclickParam = match[1]; } let text = getElText(el); if (!text && isInputField(el) && el.value != null && String(el.value).trim()) text = String(el.value).trim(); return { tagName: el.tagName.toLowerCase(), text, dataAttrs, attrs, onclickParam, hasStrong: !!el.id || Object.keys(dataAttrs).length > 0 || keyAttrs.some(k => attrs[k]) }; }
  function matchesFingerprint(el, fp, matchMode) { if (!el || el.tagName.toLowerCase() !== fp.tagName) return false; if (matchMode === 'strict') { for (const [k, v] of Object.entries(fp.dataAttrs)) { if (el.getAttribute(k) !== v) return false; } for (const [k, v] of Object.entries(fp.attrs)) { if (v && el.getAttribute(k) !== v) return false; } if (fp.onclickParam) { const m = (el.getAttribute('onclick') || '').match(/useItem$$(\d+)$$/); if (m && m[1] !== fp.onclickParam) return false; } if (fp.text) { let elText; if (fp.hasStrong) { elText = (el.textContent || '').trim(); if (!elText) { for (const attr of ['alt', 'title', 'placeholder', 'aria-label', 'value']) { const val = el.getAttribute(attr); if (val && val.trim()) { elText = val.trim(); break; } } } if (!elText && isInputField(el) && el.value != null && String(el.value).trim()) elText = String(el.value).trim(); } else { elText = getElText(el); } if (elText !== fp.text) return false; } return true; } else { if (fp.text) { let elText = (el.textContent || '').trim(); if (!elText) { for (const attr of ['alt', 'title', 'placeholder', 'aria-label', 'value']) { const val = el.getAttribute(attr); if (val && val.trim()) { elText = val.trim(); break; } } } if (!elText && isInputField(el) && el.value != null && String(el.value).trim()) elText = String(el.value).trim(); if (!elText) elText = getElText(el); if (elText !== fp.text) return false; } else { if (!isInputField(el)) return false; } return true; } }
  let _queryCache = null;
  function beginQueryCycle() { _queryCache = new Map(); }
  function cachedQuery(root, selector) { if (!_queryCache) _queryCache = new Map(); const key = (root === document ? '_doc' : root) + '|' + selector; if (_queryCache.has(key)) return _queryCache.get(key); const result = Array.from(root.querySelectorAll(selector)); _queryCache.set(key, result); return result; }
  function tryFindTarget(targetObj) { if (!targetObj || !targetObj.fingerprint) return null; const fp = targetObj.fingerprint; function verifyList(list) { const matched = []; for (const el of list) { if (panel.contains(el)) continue; if (matchesFingerprint(el, fp, targetObj.matchMode)) matched.push(el); } return matched.length > 0 ? matched : null; } let root = document; if (targetObj.parentSelector) { try { const p = document.querySelector(targetObj.parentSelector); if (p) root = p; } catch (e) {} } try { if (targetObj.strict) { const found = verifyList(cachedQuery(root, targetObj.strict)); if (found) return found; } if (targetObj.loose) { const found = verifyList(cachedQuery(root, targetObj.loose)); if (found) return found; } const found = verifyList(cachedQuery(root, fp.tagName)); if (found) return found; } catch (e) {} if (root !== document) { try { if (targetObj.strict) { const found = verifyList(cachedQuery(document, targetObj.strict)); if (found) return found; } if (targetObj.loose) { const found = verifyList(cachedQuery(document, targetObj.loose)); if (found) return found; } } catch (e) {} } return null; }
  function resolveParentInfo(el) { const result = { nearestParent: el.parentElement, blueParent: null }; let ancestor = el.parentElement; while (ancestor && ancestor !== document.body) { const s = buildBaseSelector(ancestor); if (s !== ancestor.tagName.toLowerCase()) { result.blueParent = ancestor; break; } ancestor = ancestor.parentElement; } return result; }
  function refreshParentHighlights() { if (isPowerSave) return; const c = cv(); const newBlueMap = new Map(), newNearestMap = new Map(); for (const t of c.targets) { if (!t.element || !document.contains(t.element)) continue; if (t.blueParent && document.contains(t.blueParent) && !panel.contains(t.blueParent)) { if (!newBlueMap.has(t.blueParent)) newBlueMap.set(t.blueParent, []); newBlueMap.get(t.blueParent).push(t.element); } let nearest = t.nearestParent || t.element.parentElement; if (nearest && document.contains(nearest) && !panel.contains(nearest)) { if (!newNearestMap.has(nearest)) newNearestMap.set(nearest, []); newNearestMap.get(nearest).push(t.element); } } for (const t of c.targets) { if (t._blueParent && !newBlueMap.has(t._blueParent)) { t._blueParent.classList.remove('auto-op-parent-highlight'); t._blueParent.classList.remove('auto-op-parent-highlight-Overlap'); t._blueParent = null; } if (t._nearestEl && !newNearestMap.has(t._nearestEl)) { t._nearestEl.classList.remove('auto-op-nearest-parent-highlight'); t._nearestEl = null; } } for (const [parent, children] of newBlueMap) { const isOverlap = newNearestMap.has(parent); if (isOverlap) { parent.classList.remove('auto-op-parent-highlight'); parent.classList.add('auto-op-parent-highlight-Overlap'); } else { parent.classList.remove('auto-op-parent-highlight-Overlap'); parent.classList.add('auto-op-parent-highlight'); } for (const child of children) { const t = c.targets.find(tt => tt.element === child); if (t) t._blueParent = parent; } } for (const [parent, children] of newNearestMap) { if (newBlueMap.has(parent)) continue; if (!parent.classList.contains('auto-op-nearest-parent-highlight')) parent.classList.add('auto-op-nearest-parent-highlight'); for (const child of children) { const t = c.targets.find(tt => tt.element === child); if (t) t._nearestEl = parent; } } }
  function discoverNewTargetsFor(ci) { const c = configs[ci]; if (c.targets.length === 0 || !c.targets.some(t => t.matchMode === 'loose')) return; const existingElements = new Set(c.targets.map(t => t.element)); for (const el of c.discoveredElements) { if (!document.contains(el)) c.discoveredElements.delete(el); } const newTargets = [], seenKeys = new Set(); for (const t of c.targets) { if (t.matchMode !== 'loose' || !t.parentSelector) continue; const selector = t.loose || t.strict, seenKey = selector + '|' + t.parentSelector; if (seenKeys.has(seenKey)) continue; seenKeys.add(seenKey); let parent; try { parent = document.querySelector(t.parentSelector); } catch (e) {} if (!parent) continue; let candidates; try { candidates = parent.querySelectorAll(selector); } catch (e) { candidates = []; } if (!candidates || candidates.length === 0) { try { candidates = parent.querySelectorAll(t.fingerprint.tagName); } catch (e) { candidates = []; } } for (const el of candidates) { if (panel.contains(el) || existingElements.has(el) || c.discoveredElements.has(el) || !matchesFingerprint(el, t.fingerprint, t.matchMode)) continue; c.discoveredElements.add(el); if (ci === activeConfig) el.classList.add('auto-op-selected-highlight'); newTargets.push({ element: el, strict: t.strict, loose: t.loose, fingerprint: t.fingerprint, desc: t.desc, isInput: t.isInput, matchMode: t.matchMode, parentSelector: t.parentSelector, parentChain: t.parentChain, isAuto: true, missCount: 0 }); } } if (newTargets.length > 0) c.targets.push(...newTargets); }
  // ===================== 分页 =====================
  function updatePageHeight() { const pages = pageContainer.querySelectorAll('.auto-op-page'), el = pages[currentPage]; if (!el) return; const h = el.offsetHeight; if (h > 0) pageContainer.style.height = (h + 2) + 'px'; }
  function goToPage(page, animated) {
    closeConfigMenu();
    const clamped = ((page % PAGE_COUNT) + PAGE_COUNT) % PAGE_COUNT;
    if (clamped === currentPage && animated !== false) return;
    const pages = pageContainer.querySelectorAll('.auto-op-page'), oldPage = pages[currentPage], newPage = pages[clamped];
    currentPage = clamped;
    if (animated === false) { pages.forEach(p => { p.classList.remove('active'); p.style.opacity = '0'; }); newPage.classList.add('active'); newPage.style.opacity = '1'; }
    else { oldPage.classList.remove('active'); oldPage.style.opacity = '0'; newPage.classList.add('active'); newPage.style.opacity = '0'; newPage.offsetHeight; newPage.style.opacity = '1'; }
    updatePageHeight(); saveShared();
  }
  btnPagePrev.addEventListener('click', e => { e.stopPropagation(); goToPage(currentPage - 1); });
  btnPageNext.addEventListener('click', e => { e.stopPropagation(); goToPage(currentPage + 1); });
  // ===================== 折叠 =====================
  function measureCollapsedWidth() {
    const h3 = dragHandle.querySelector('h3'), wasCollapsed = panel.classList.contains('collapsed');
    if (!wasCollapsed) panel.classList.add('collapsed');
    const savedWidth = panel.style.width, savedTransition = panel.style.transition;
    panel.style.transition = 'none'; panel.style.width = '300px'; void panel.offsetWidth;
    collapsedWidth = 14 + 30 + 12 + 30 + 12 + h3.offsetWidth + 12 + 30 + 14 + 2;
    panel.style.width = savedWidth || ''; panel.style.transition = savedTransition;
    if (!wasCollapsed) panel.classList.remove('collapsed');
  }
  function performCollapse() { closeConfigMenu(); const body = panel.querySelector('.auto-op-body'); collapseAnimPhase = 'collapsing'; body.style.overflow = 'hidden'; toggleBtn.textContent = '+'; panel.classList.add('body-hidden'); setTimeout(() => { panel.classList.remove('body-hidden'); panel.classList.add('collapsed'); const h3W = dragHandle.querySelector('h3').scrollWidth; collapsedWidth = 14 + 30 + 12 + 30 + 12 + h3W + 12 + 30 + 14 + 2; panel.style.width = '300px'; void panel.offsetWidth; panel.style.width = collapsedWidth + 'px'; collapseAnimPhase = 'collapsed'; }, 200); }
  function performExpand() { closeConfigMenu(); const body = panel.querySelector('.auto-op-body'); collapseAnimPhase = 'expanding'; panel.style.width = collapsedWidth + 'px'; void panel.offsetWidth; panel.style.width = '300px'; setTimeout(() => { panel.classList.remove('collapsed'); panel.style.width = ''; toggleBtn.textContent = '−'; setTimeout(() => { body.style.overflow = 'auto'; collapseAnimPhase = 'expanded'; }, 150); }, 120); }
  // ===================== 对话框 =====================
  function showConfirm(text) { return new Promise(resolve => { const modal = document.getElementById('auto-op-modal'), modalText = document.getElementById('auto-op-modal-text'), btnOk = document.getElementById('auto-op-modal-ok'), btnCancel = document.getElementById('auto-op-modal-cancel'), overlay = modal.querySelector('.auto-op-modal-overlay'), box = modal.querySelector('.auto-op-modal-box'); modalText.textContent = text; modal.style.display = 'block'; function cleanup() { modal.style.display = 'none'; btnOk.removeEventListener('click', onOk); btnCancel.removeEventListener('click', onCancel); overlay.removeEventListener('click', onOverlay); } function onOk() { cleanup(); resolve(true); } function onCancel() { cleanup(); resolve(false); } function onOverlay() { cleanup(); resolve(false); } box.addEventListener('click', e => e.stopPropagation()); btnOk.addEventListener('click', onOk); btnCancel.addEventListener('click', onCancel); overlay.addEventListener('click', onOverlay); }); }
  // ===================== 自动刷新 =====================
  function formatRefreshTime(ms) { const totalSec = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60; const pad = n => String(n).padStart(2, '0'); return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`; }
  function addRefreshLog(msg) { const stamp = new Date().toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); refreshLogs.push({ time: stamp, msg: msg || '页面已刷新' }); updateLogUI(); }
  function updateLogUI() { if (refreshLogs.length === 0) { logContainer.innerHTML = '<div class="auto-op-log-empty">暂无日志</div>'; return; } let html = ''; for (let i = 0; i < refreshLogs.length; i++) html += '<div class="auto-op-log-entry"><span class="auto-op-log-time">' + refreshLogs[i].time + '</span><span class="auto-op-log-msg">' + refreshLogs[i].msg + '</span></div>'; logContainer.innerHTML = html; logContainer.scrollTop = logContainer.scrollHeight; }
  function saveRefreshState() {
    try {
      const now = Date.now();
      const totalMs = refreshIntervalSec * 1000;
      const elapsed = now - refreshStartTimestamp;
      const remaining = Math.max(0, totalMs - elapsed);
      const running = {};
      for (let i = 0; i < CONFIG_COUNT; i++) {
        const c = configs[i];
        if (c.isRunning) {
          running[i] = { opStart: c.operationStartTimestamp || now, count: c.clickedCount };
        }
      }
      localStorage.setItem(REFRESH_STATE_KEY, JSON.stringify({
        active: isAutoRefresh,
        interval: refreshIntervalSec,
        nextRefreshTime: now + remaining,
        logs: refreshLogs,
        isPowerSave: isPowerSave,
        running: running
      }));
    } catch (e) { console.error('[AUTO_OP] saveRefreshState 异常:', e); }
  }
  function loadRefreshState() { try { const s = localStorage.getItem(REFRESH_STATE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function clearRefreshState() { try { localStorage.removeItem(REFRESH_STATE_KEY); } catch (e) {} }
  function updateRefreshProgressUI() { if (!isAutoRefresh || !refreshStartTimestamp) return; const now = Date.now(), totalMs = refreshIntervalSec * 1000, elapsed = now - refreshStartTimestamp, remaining = Math.max(0, totalMs - elapsed); const percent = Math.min(100, Math.max(0, (elapsed / totalMs) * 100)); refreshPercentSpan.textContent = percent.toFixed(1) + '%'; refreshTimeSpan.textContent = '剩余 ' + formatRefreshTime(remaining); refreshProgressFill.style.width = percent.toFixed(2) + '%'; if (remaining < 30000) { refreshProgressFill.style.background = 'var(--panel-missing-border)'; refreshPercentSpan.style.color = 'var(--panel-missing-border)'; } else { refreshProgressFill.style.background = 'var(--panel-highlight-border)'; refreshPercentSpan.style.color = 'var(--panel-highlight-border)'; } if (remaining <= 0) triggerRefresh(); }
  function triggerRefresh() {
    const runningConfigs = [];
    for (let i = 0; i < CONFIG_COUNT; i++) { if (configs[i].isRunning) runningConfigs.push(CONFIG_NAMES[i]); }
    const statusMsg = runningConfigs.length > 0 ? '运行中 [' + runningConfigs.join(',') + ']' : '未运行';
    addRefreshLog('页面已刷新 ' + statusMsg);
    saveRefreshState();
    saveData();
    for (let i = 0; i < CONFIG_COUNT; i++) savePerConfig(i);
    if (refreshProgressTimerID) { clearInterval(refreshProgressTimerID); refreshProgressTimerID = null; }
    if (refreshTimerID) { clearTimeout(refreshTimerID); refreshTimerID = null; }
    location.reload();
  }
  function startAutoRefreshCountdown(initial) { isAutoRefresh = true; autoRefreshCheckbox.checked = true; refreshProgressDiv.style.display = 'block'; if (initial) refreshStartTimestamp = Date.now(); if (refreshProgressTimerID) clearInterval(refreshProgressTimerID); refreshProgressTimerID = setInterval(updateRefreshProgressUI, 100); const remaining = Math.max(0, refreshIntervalSec * 1000 - (Date.now() - refreshStartTimestamp)); if (refreshTimerID) clearTimeout(refreshTimerID); refreshTimerID = setTimeout(triggerRefresh, remaining + 50); updateRefreshProgressUI(); requestWakeLock(); }
  function stopAutoRefreshCountdown() { isAutoRefresh = false; if (refreshProgressTimerID) { clearInterval(refreshProgressTimerID); refreshProgressTimerID = null; } if (refreshTimerID) { clearTimeout(refreshTimerID); refreshTimerID = null; } refreshProgressDiv.style.display = 'none'; refreshProgressFill.style.width = '0%'; refreshPercentSpan.textContent = '0%'; refreshTimeSpan.textContent = '剩余 --:--'; clearRefreshState(); if (!configs.some(c => c.isRunning)) releaseWakeLock(); }
  // ===================== 自动启动 =====================
  function formatAutoStartCountdown(ms) { const totalSec = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60; const pad = n => String(n).padStart(2, '0'); return h > 0 ? h + 'h' + pad(m) + 'm' + pad(s) + 's' : pad(m) + 'm' + pad(s) + 's'; }
  function updateAutoStartCountdownUI() {
    const c = cv();
    if (!c.autoStartEnabled || c.autoStartIntervalMin <= 0 || !c.autoStartNextTime) {
      autoStartCountdownLabel.textContent = '';
      return;
    }
    const remaining = c.autoStartNextTime - Date.now();
    autoStartCountdownLabel.textContent = remaining <= 0 ? '即将启动...' : '距下次启动 ' + formatAutoStartCountdown(remaining);
  }
  function doAutoStartFor(ci) { const c = configs[ci]; if (c.isRunning) return; if (c.targets.length === 0) { c.autoStartNextTime = Date.now() + c.autoStartIntervalMin * 60 * 1000; startAutoStartCountdownTimerFor(ci); return; } startClickingFor(ci); c.autoStartNextTime = Date.now() + c.autoStartIntervalMin * 60 * 1000; }
  function startAutoStartCountdownTimerFor(ci) { const c = configs[ci]; if (c.autoStartCountdownTimerID) { clearInterval(c.autoStartCountdownTimerID); c.autoStartCountdownTimerID = null; } if (!c.autoStartEnabled || c.autoStartIntervalMin <= 0 || !c.autoStartNextTime) { if (ci === activeConfig) updateAutoStartCountdownUI(); return; } c.autoStartCountdownTimerID = setInterval(() => { const remaining = c.autoStartNextTime - Date.now(); if (ci === activeConfig) updateAutoStartCountdownUI(); if (remaining <= 0) { clearInterval(c.autoStartCountdownTimerID); c.autoStartCountdownTimerID = null; doAutoStartFor(ci); } }, 500); if (ci === activeConfig) updateAutoStartCountdownUI(); }
  function stopAutoStartCountdownTimerFor(ci) { const c = configs[ci]; if (c.autoStartCountdownTimerID) { clearInterval(c.autoStartCountdownTimerID); c.autoStartCountdownTimerID = null; } c.autoStartNextTime = 0; if (ci === activeConfig) autoStartCountdownLabel.textContent = ''; }
  function setupAutoStartFromInput() { const c = cv(); const val = parseFloat(autoStartIntervalInput.value); if (isNaN(val) || val <= 0) { c.autoStartEnabled = false; c.autoStartIntervalMin = 0; stopAutoStartCountdownTimerFor(activeConfig); autoStartIntervalInput.value = ''; } else { c.autoStartEnabled = true; c.autoStartIntervalMin = val; if (!c.isRunning) { c.autoStartNextTime = Date.now() + val * 60 * 1000; startAutoStartCountdownTimerFor(activeConfig); } } savePerConfig(activeConfig); }
  // ===================== 操作时间 =====================
  function formatElapsedTime(ms) { const totalSec = Math.floor(ms / 1000), h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60; const pad = n => String(n).padStart(2, '0'); return pad(h) + ':' + pad(m) + ':' + pad(s); }
  function startElapsedTimer(savedTimestamp) { if (isPowerSave) return; if (elapsedTimerID_global) clearInterval(elapsedTimerID_global); const c = cv(); c.operationStartTimestamp = savedTimestamp || Date.now(); if (elapsedSpan) elapsedSpan.textContent = formatElapsedTime(Date.now() - c.operationStartTimestamp); elapsedTimerID_global = setInterval(() => { const cc = cv(); if (!cc.isRunning || !cc.operationStartTimestamp) return; if (elapsedSpan) elapsedSpan.textContent = formatElapsedTime(Date.now() - cc.operationStartTimestamp); }, 1000); }
  function stopElapsedTimer() { if (elapsedTimerID_global) { clearInterval(elapsedTimerID_global); elapsedTimerID_global = null; } }
  // ===================== 事件委托 =====================
  targetListContainer.addEventListener('click', async e => {
    const target = e.target, action = target.dataset.action;
    if (!action) return;
    const index = parseInt(target.dataset.index), c = cv();
    if (isNaN(index) || !c.targets[index]) { updateTargetUI(); return; }
    if (action === 'delete') {
      const t = c.targets[index];
      if (IS_MOBILE && !await showConfirm('确定删除该目标元素？\n\n' + t.desc)) return;
      if (t.element && t.element.classList) t.element.classList.remove('auto-op-selected-highlight');
      if (t._blueParent && t._blueParent.classList) { t._blueParent.classList.remove('auto-op-parent-highlight'); t._blueParent.classList.remove('auto-op-parent-highlight-Overlap'); }
      if (t._nearestEl && t._nearestEl.classList) t._nearestEl.classList.remove('auto-op-nearest-parent-highlight');
      c.targets.splice(index, 1);
      if (c.currentQueueIndex >= c.targets.length) c.currentQueueIndex = 0;
      updateTargetUI(); updateTargetCount();
      if (c.targets.length === 0) { stateSpan.textContent = '目标元素已清空'; if (stateTimerID) { clearTimeout(stateTimerID); stateTimerID = null; } stateTimerID = setTimeout(() => { if (stateSpan.textContent === '目标元素已清空') stateSpan.textContent = '请选取目标元素'; stateTimerID = null; }, 1000); } else { stateSpan.textContent = `剩余 ${c.targets.length} 个`; }
      refreshParentHighlights(); savePerConfig(activeConfig); updateAutoFillVisibility();
    }
  });
  targetListContainer.addEventListener('change', e => { const target = e.target; if (target.dataset.action === 'match-mode') { const index = parseInt(target.dataset.index), c = cv(); if (isNaN(index) || !c.targets[index]) { updateTargetUI(); return; } c.targets[index].matchMode = target.value; savePerConfig(activeConfig); } });
  // ===================== UI 更新 =====================
  function updateTargetUI() {
    if (isPowerSave) return;
    const c = cv();
    if (c.targets.length === 0) { targetListContainer.innerHTML = '<div class="auto-op-target-info">未选取，请点击下方按钮选取</div>'; btnClearAll.style.display = 'none'; btnStart.disabled = true; btnHeaderStart.disabled = true; return; }
    btnClearAll.style.display = 'inline-block'; btnStart.disabled = false; btnHeaderStart.disabled = false;
    let html = '';
    c.targets.forEach((t, i) => {
      const isValid = t._isValid !== undefined ? t._isValid : (t.element && document.contains(t.element));
      html += `<div class="auto-op-target-item ${isValid ? 'active' : 'missing'}" data-index="${i}"><span>${c.isMultiMode ? (i + 1) + '. ' : ''}${t.desc}</span><button class="auto-op-btn-info" data-action="info" data-index="${i}" title="查看详情">ⓘ</button>${t.parentChain ? t.parentChain.map(p => '<span class="auto-op-target-parent">└> ' + p.desc + '</span>').join('') : ''}<select class="auto-op-match-mode" data-action="match-mode" data-index="${i}"><option value="strict" ${t.matchMode === 'strict' ? 'selected' : ''}>严格</option><option value="loose" ${t.matchMode === 'loose' ? 'selected' : ''}>宽松</option></select><button class="auto-op-btn-item-del" data-action="delete" data-index="${i}">✕</button></div>`;
    });
    targetListContainer.innerHTML = '<div class="auto-op-target-list">' + html + '</div>';
    updateTargetCount();
  }
  function updateAutoFillVisibility() { const row = document.getElementById('auto-op-auto-fill-row'); if (row) row.style.display = cv().targets.some(t => t.isInput) ? 'block' : 'none'; }
  function updateTargetCount(status) {
    if (isPowerSave) return;
    const c = cv();
    if (!status) { let existCount = 0, missingCount = 0; for (const t of c.targets) { if (t.element && document.contains(t.element) && t._isValid) existCount++; else missingCount++; } targetCountSpan.innerHTML = '[<span class="auto-op-target-count-exist">' + existCount + '</span>/<span class="auto-op-target-count-missing">' + missingCount + '</span>/<span class="auto-op-target-count-total">' + c.targets.length + '</span>]'; return; }
    let existCount = status.filter(Boolean).length;
    targetCountSpan.innerHTML = '[<span class="auto-op-target-count-exist">' + existCount + '</span>/<span class="auto-op-target-count-missing">' + (status.length - existCount) + '</span>/<span class="auto-op-target-count-total">' + c.targets.length + '</span>]';
  }
  function updateTargetItemStyle(index, isMissing) { if (isPowerSave) return; const c = cv(); if (c.uiThrottled) return; const item = targetListContainer.querySelector(`.auto-op-target-item[data-index="${index}"]`); if (!item) return; if (isMissing) { item.classList.remove('active'); item.classList.add('missing'); } else { item.classList.remove('missing'); item.classList.add('active'); } }
  function updateRunningDisplay(ci, countText, stateText) { if (isPowerSave || ci !== activeConfig) return; countSpan.textContent = countText; stateSpan.textContent = stateText; stateSpan.classList.remove('auto-op-waiting'); }
  // ===================== 拖拽 =====================
  let isDragging = false, dragOffX = 0, dragOffY = 0;
  function getEventPos(e) { return e.touches && e.touches.length > 0 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY }; }
  function onDragStart(e) { if (e.target === toggleBtn || toggleBtn.contains(e.target) || e.target === btnHeaderStart || btnHeaderStart.contains(e.target) || e.target === configBtnEl || configBtnEl.contains(e.target)) return; isDragging = true; closeConfigMenu(); const pos = getEventPos(e), rect = panel.getBoundingClientRect(); dragOffX = pos.x - rect.left; dragOffY = pos.y - rect.top; e.preventDefault(); }
  function onDragMove(e) { if (!isDragging) return; const pos = getEventPos(e); panel.style.left = (pos.x - dragOffX) + 'px'; panel.style.top = (pos.y - dragOffY) + 'px'; panel.style.right = 'auto'; e.preventDefault(); }
  function onDragEnd() { isDragging = false; }
  dragHandle.addEventListener('mousedown', onDragStart); document.addEventListener('mousemove', onDragMove); document.addEventListener('mouseup', onDragEnd);
  dragHandle.addEventListener('touchstart', onDragStart, { passive: false }); document.addEventListener('touchmove', onDragMove, { passive: false }); document.addEventListener('touchend', onDragEnd); document.addEventListener('touchcancel', onDragEnd);
  toggleBtn.addEventListener('click', e => { e.stopPropagation(); if (collapseAnimPhase === 'collapsing' || collapseAnimPhase === 'expanding') return; if (collapseAnimPhase !== 'collapsed') performCollapse(); else performExpand(); });
  // ===================== UI 交互事件 =====================
  multiModeCheckbox.addEventListener('change', e => { const c = cv(); c.isMultiMode = e.target.checked; strategyRow.style.display = c.isMultiMode ? 'block' : 'none'; c.clickStrategy = strategySelect.value; clearSelection(); savePerConfig(activeConfig); });
  strategySelect.addEventListener('change', e => { cv().clickStrategy = e.target.value; savePerConfig(activeConfig); });
  autoFillInput.addEventListener('input', e => { cv().autoFillContent = e.target.value; savePerConfig(activeConfig); });
  [clickIntervalInput, maxClicksInput, missingActionSelect].forEach(el => { el.addEventListener('change', () => savePerConfig(activeConfig)); });
  maxDurationInput.addEventListener('change', e => { let val = parseFloat(e.target.value); const c = cv(); if (isNaN(val) || val <= 0) { c.maxDurationMin = 0; e.target.value = ''; } else { c.maxDurationMin = val; } savePerConfig(activeConfig); });
  autoStartIntervalInput.addEventListener('change', e => { e.stopPropagation(); setupAutoStartFromInput(); });
  autoRefreshCheckbox.addEventListener('change', e => {
    e.stopPropagation(); isAutoRefresh = e.target.checked;
    if (isAutoRefresh) { let val = parseInt(refreshIntervalInput.value, 10); if (isNaN(val) || val < 10) val = 10; if (val > 86400) val = 86400; refreshIntervalSec = val; refreshIntervalInput.value = val; startAutoRefreshCountdown(true); addRefreshLog('自动刷新开启 ✓ [' + val + 's]'); }
    else { const remainingSec = Math.ceil(Math.max(0, refreshIntervalSec * 1000 - (Date.now() - refreshStartTimestamp)) / 1000); stopAutoRefreshCountdown(); addRefreshLog('自动刷新关闭 ✕ [' + remainingSec + 's]'); }
    saveShared();
  });
  refreshIntervalInput.addEventListener('change', e => { e.stopPropagation(); let val = parseInt(e.target.value, 10); if (isNaN(val) || val < 10) val = 10; if (val > 86400) val = 86400; e.target.value = val; refreshIntervalSec = val; if (isAutoRefresh) startAutoRefreshCountdown(true); saveShared(); });
  btnClearLog.addEventListener('click', e => { e.stopPropagation(); refreshLogs = []; updateLogUI(); saveShared(); });
  wakeLockCheckbox.addEventListener('change', e => { e.stopPropagation(); if (e.target.checked) requestWakeLock(); else releaseWakeLock(); saveShared(); });
  suppressFocusCheckbox.addEventListener('change', e => { e.stopPropagation(); if (e.target.checked) suppressFocus(); else restoreFocus(); saveShared(); });
  // ===================== 选取元素 =====================
  btnPick.addEventListener('click', e => { e.stopPropagation(); if (cv().isRunning) return; isPicking = !isPicking; if (isPicking) { btnPick.textContent = '取消选取'; btnPick.classList.add('picking'); stateSpan.textContent = cv().isMultiMode ? '请依次点击多个目标元素' : '请点击目标元素'; stateSpan.classList.remove('auto-op-waiting'); document.addEventListener('mouseover', onPickHover, true); document.addEventListener('mouseout', onPickHoverOut, true); document.addEventListener('click', onPickClick, true); document.addEventListener('touchend', onPickTouch, true); } else { exitPickMode(); } });
  function onPickHover(e) { if (!isPicking) return; const el = e.target; if (panel.contains(el) || configMenuEl.contains(el)) return; el.classList.add('auto-op-highlight'); }
  function onPickHoverOut(e) { e.target.classList.remove('auto-op-highlight'); }
  function onPickTouch(e) { if (!isPicking || isDragging) return; const touch = e.changedTouches[0], el = document.elementFromPoint(touch.clientX, touch.clientY); if (!el || panel.contains(el) || configMenuEl.contains(el)) return; e.preventDefault(); e.stopPropagation(); selectTarget(el); }
  function onPickClick(e) { if (!isPicking || !e.isTrusted) return; const el = e.target; if (panel.contains(el) || configMenuEl.contains(el)) return; e.preventDefault(); e.stopPropagation(); selectTarget(el); }
  function selectTarget(el) {
    if (stateTimerID) { clearTimeout(stateTimerID); stateTimerID = null; }
    el.classList.remove('auto-op-highlight');
    const c = cv();
    const sels = buildSelectors(el), fp = getElementFingerprint(el);
    let desc = el.tagName.toLowerCase();
    if (el.id) desc += '#' + el.id;
    if (el.className && typeof el.className === 'string') { const cls = el.className.trim().split(/\s+/).filter(ch => ch && !ch.startsWith('auto-op-')).slice(0, 5).join('.'); if (cls) desc += '.' + cls; }
    const text = getElText(el); if (text) desc += ' "' + text + '"';
    const isInput = isInputField(el); if (isInput) desc += ' (isInput)';
    let parentSelector = '', parentChain = [], nearestParent = el.parentElement, blueParent = null, ancestor = el.parentElement;
    while (ancestor && ancestor !== document.body) { const s = buildBaseSelector(ancestor); if (s !== ancestor.tagName.toLowerCase()) { if (!parentSelector) parentSelector = s; if (!blueParent) blueParent = ancestor; let pdesc = ancestor.tagName.toLowerCase(); if (ancestor.id) pdesc += '#' + ancestor.id; if (ancestor.className && typeof ancestor.className === 'string') { const cls = ancestor.className.trim().split(/\s+/).filter(ch => ch && !ch.startsWith('auto-op-')).slice(0, 5).join('.'); if (cls) pdesc += '.' + cls; } parentChain.push({ selector: s, desc: pdesc }); } ancestor = ancestor.parentElement; }
    const targetObj = { element: el, strict: sels.strict, loose: sels.loose, fingerprint: fp, desc, isInput, matchMode: isInput ? 'loose' : 'strict', parentSelector, parentChain, nearestParent, blueParent, isAuto: false, missCount: 0, _isValid: true };
    if (c.isMultiMode) { c.targets.push(targetObj); el.classList.add('auto-op-selected-highlight'); stateSpan.textContent = `已选 ${c.targets.length} 个，继续选取或取消`; }
    else { c.targets.forEach(t => { if (t.element && t.element.classList) t.element.classList.remove('auto-op-selected-highlight'); if (t._blueParent && t._blueParent.classList) { t._blueParent.classList.remove('auto-op-parent-highlight'); t._blueParent.classList.remove('auto-op-parent-highlight-Overlap'); } if (t._nearestEl && t._nearestEl.classList) t._nearestEl.classList.remove('auto-op-nearest-parent-highlight'); }); c.targets = [targetObj]; el.classList.add('auto-op-selected-highlight'); exitPickMode(); if (c.targets.length > 0) stateSpan.textContent = '就绪'; }
    updateTargetUI(); updateTargetCount(); refreshParentHighlights(); savePerConfig(activeConfig); updateAutoFillVisibility();
  }
  function exitPickMode() {
    isPicking = false; btnPick.textContent = '选取元素'; btnPick.classList.remove('picking');
    document.removeEventListener('mouseover', onPickHover, true); document.removeEventListener('mouseout', onPickHoverOut, true);
    document.removeEventListener('click', onPickClick, true); document.removeEventListener('touchend', onPickTouch, true);
    document.querySelectorAll('.auto-op-highlight').forEach(el => el.classList.remove('auto-op-highlight'));
    const c = cv();
    if (c.isMultiMode) { stateSpan.textContent = c.targets.length === 0 ? '未选取目标元素' : `已选 ${c.targets.length} 个`; }
    else { stateSpan.textContent = c.targets.length === 0 ? '未选取目标元素' : '就绪'; }
    if (c.targets.length === 0) { if (stateTimerID) { clearTimeout(stateTimerID); stateTimerID = null; } stateTimerID = setTimeout(() => { if (stateSpan.textContent === '未选取目标元素') stateSpan.textContent = '请选取目标元素'; stateTimerID = null; }, 1500); }
  }
  async function clearSelection(manual) { const c = cv(); if (manual && IS_MOBILE && c.targets.length > 0 && !await showConfirm('确定清空 ' + c.targets.length + ' 个目标元素？')) return; for (const t of c.targets) { if (t.element && t.element.classList) t.element.classList.remove('auto-op-selected-highlight'); if (t._blueParent && t._blueParent.classList) { t._blueParent.classList.remove('auto-op-parent-highlight'); t._blueParent.classList.remove('auto-op-parent-highlight-Overlap'); } if (t._nearestEl && t._nearestEl.classList) t._nearestEl.classList.remove('auto-op-nearest-parent-highlight'); } c.targets = []; c.currentQueueIndex = 0; updateTargetUI(); updateTargetCount(); stateSpan.textContent = '目标元素已清空'; if (stateTimerID) { clearTimeout(stateTimerID); stateTimerID = null; } stateTimerID = setTimeout(() => { if (stateSpan.textContent === '目标元素已清空') stateSpan.textContent = '请选取目标元素'; stateTimerID = null; }, 1000); refreshParentHighlights(); savePerConfig(activeConfig); updateAutoFillVisibility(); }
  btnClearAll.addEventListener('click', e => { e.stopPropagation(); clearSelection(true); });
  // ===================== 开始/停止 =====================
  function handleToggleRunning(e) { e.stopPropagation(); const c = cv(); if (c.targets.length === 0) return; if (!c.isRunning) startClickingFor(activeConfig); else { stopClickingFor(activeConfig); stateSpan.textContent = '已停止'; } }
  btnStart.addEventListener('click', handleToggleRunning); btnHeaderStart.addEventListener('click', handleToggleRunning);
  function startClickingFor(ci, savedTimestamp) {
    const c = configs[ci];
    if (stateTimerID && ci === activeConfig) { clearTimeout(stateTimerID); stateTimerID = null; }
    if (isPicking && ci === activeConfig) exitPickMode();
    c.isWaiting = false; if (c.waitTimerID) { clearTimeout(c.waitTimerID); c.waitTimerID = null; }
    for (let i = 0; i < c.targets.length; i++) {
      const t = c.targets[i];
      if (!t.element || !document.contains(t.element)) {
        const found = tryFindTarget(t);
        if (found && found.length > 0) {
          if (t.element && t.element.classList) t.element.classList.remove('auto-op-selected-highlight');
          t.element = found[0]; const parentInfo = resolveParentInfo(found[0]); t.nearestParent = parentInfo.nearestParent; t.blueParent = parentInfo.blueParent;
          if (ci === activeConfig) found[0].classList.add('auto-op-selected-highlight');
        }
      } else { if (!t.blueParent) { const parentInfo = resolveParentInfo(t.element); t.nearestParent = parentInfo.nearestParent; t.blueParent = parentInfo.blueParent; } }
    }
    discoverNewTargetsFor(ci);
    if (ci === activeConfig) { c.clickInterval = parseInt(clickIntervalInput.value) || 1000; c.maxClicks = maxClicksInput.value.trim() === '' ? Infinity : (parseInt(maxClicksInput.value) || Infinity); c.missingAction = missingActionSelect.value; }
    c.isRunning = true; c.clickedCount = 0; c.currentQueueIndex = 0;
    if (ci === activeConfig) {
      countSpan.textContent = '0';
      btnStart.textContent = '停止'; btnStart.className = 'auto-op-btn auto-op-btn-stop';
      btnHeaderStart.textContent = '■'; btnHeaderStart.classList.add('is-stop');
      btnPick.disabled = true; multiModeCheckbox.disabled = true; strategySelect.disabled = true;
      maxClicksInput.disabled = true; clickIntervalInput.disabled = true; missingActionSelect.disabled = true;
      autoFillInput.disabled = true; maxDurationInput.disabled = true; autoStartIntervalInput.disabled = true;
      statusDiv.classList.add('running'); stateSpan.textContent = '运行中'; stateSpan.classList.remove('auto-op-waiting');
    }
    startElapsedTimer(savedTimestamp || 0);
    if (ci === activeConfig) { const dVal = parseFloat(maxDurationInput.value); c.maxDurationMin = (!isNaN(dVal) && dVal > 0) ? dVal : 0; }
    if (c.maxDurationMin > 0) { const maxDurationMs = c.maxDurationMin * 60 * 1000; if (c.maxDurationTimerID) clearTimeout(c.maxDurationTimerID); const alreadyElapsed = savedTimestamp ? (Date.now() - savedTimestamp) : 0; const remaining = Math.max(0, maxDurationMs - alreadyElapsed); if (remaining <= 0) { stopClickingFor(ci); if (ci === activeConfig) stateSpan.textContent = '最长时间已到'; return; } c.maxDurationTimerID = setTimeout(() => { if (c.isRunning) { stopClickingFor(ci); if (ci === activeConfig) stateSpan.textContent = '最长时间已到'; } }, remaining); }
    if (c.autoStartCountdownTimerID) { clearInterval(c.autoStartCountdownTimerID); c.autoStartCountdownTimerID = null; }
    doClickFor(ci); c.timerID = setInterval(() => doClickFor(ci), c.clickInterval);
    requestWakeLock(); suppressFocus();
    savePerConfig(ci); updateConfigBtnLabel();
  }
  function stopClickingFor(ci) {
    const c = configs[ci];
    if (stateTimerID && ci === activeConfig) { clearTimeout(stateTimerID); stateTimerID = null; }
    c.isRunning = false; c.isWaiting = false;
    if (!configs.some(cc => cc.isRunning)) restoreFocus();
    if (!isAutoRefresh && !configs.some(cc => cc.isRunning)) releaseWakeLock();
    if (c.waitTimerID) { clearTimeout(c.waitTimerID); c.waitTimerID = null; }
    if (c.timerID) { clearInterval(c.timerID); c.timerID = null; }
    if (ci === activeConfig) stopElapsedTimer();
    if (c.maxDurationTimerID) { clearTimeout(c.maxDurationTimerID); c.maxDurationTimerID = null; }
    if (c.autoStartEnabled && c.autoStartIntervalMin > 0) { c.autoStartNextTime = Date.now() + c.autoStartIntervalMin * 60 * 1000; startAutoStartCountdownTimerFor(ci); }
    if (ci === activeConfig) {
      btnStart.textContent = '开始'; btnStart.className = 'auto-op-btn auto-op-btn-start';
      btnHeaderStart.textContent = '▶'; btnHeaderStart.classList.remove('is-stop');
      btnPick.disabled = false; multiModeCheckbox.disabled = false; strategySelect.disabled = false;
      maxClicksInput.disabled = false; clickIntervalInput.disabled = false; missingActionSelect.disabled = false;
      autoFillInput.disabled = false; maxDurationInput.disabled = false; autoStartIntervalInput.disabled = false;
      statusDiv.classList.remove('running'); stateSpan.classList.remove('auto-op-waiting');
      if (c.targets.length > 0) stateSpan.textContent = '就绪'; else stateSpan.textContent = '请选取目标元素';
      if (!c.autoStartEnabled || c.autoStartIntervalMin <= 0) autoStartCountdownLabel.textContent = '';
    }
    savePerConfig(ci); updateConfigBtnLabel();
  }
  function startWaitTimer(ci, idx) { const c = configs[ci]; if (c.waitTimerID) clearTimeout(c.waitTimerID); function update() { if (!c.isWaiting || !c.isRunning) { if (c.waitTimerID) { clearTimeout(c.waitTimerID); c.waitTimerID = null; } return; } const maxWait = c.clickInterval * 2, elapsed = Date.now() - c.waitStartTime, remaining = maxWait - elapsed; if (remaining <= 0) { c.isWaiting = false; c.currentQueueIndex = (idx + 1) % c.targets.length; if (ci === activeConfig) { stateSpan.textContent = `队列[${idx + 1}/${c.targets.length}] 超时跳过`; stateSpan.classList.remove('auto-op-waiting'); } return; } if (ci === activeConfig) { stateSpan.textContent = `${remaining}ms 队列[${idx + 1}/${c.targets.length}] 等待元素中`; stateSpan.classList.add('auto-op-waiting'); } c.waitTimerID = setTimeout(update, 1); } update(); }
  function doClickFor(ci) {
    isProgrammaticClick = true;
    try {
      const c = configs[ci];
      if (c.targets.length === 0) { stopClickingFor(ci); return; }
      beginQueryCycle(); discoverNewTargetsFor(ci);
      if (!c.doClickLastUIUpdate) c.doClickLastUIUpdate = 0;
      const now = Date.now(); c.uiThrottled = (now - c.doClickLastUIUpdate) < 100;
      if (!c.uiThrottled) c.doClickLastUIUpdate = now;
      const missingAction = c.missingAction || 'wait';
      const status = c.targets.map((t, i) => {
        let el = t.element;
        let isValid = el && document.contains(el) && matchesFingerprint(el, t.fingerprint, t.matchMode);
        if (!isValid) { const found = tryFindTarget(t); if (found && found.length > 0) { if (t.element && document.contains(t.element)) t.element.classList.remove('auto-op-selected-highlight'); t.element = found[0]; const parentInfo = resolveParentInfo(found[0]); t.nearestParent = parentInfo.nearestParent; t.blueParent = parentInfo.blueParent; if (ci === activeConfig) found[0].classList.add('auto-op-selected-highlight'); isValid = true; } }
        if (ci === activeConfig) updateTargetItemStyle(i, !isValid);
        return isValid;
      });
      const totalCount = c.targets.length;
      for (let i = 0; i < totalCount; i++) c.targets[i]._isValid = status[i];
      if (ci === activeConfig && !c.uiThrottled) updateTargetCount(status);

      if (c.isMultiMode && c.clickStrategy === 'sequential') {
        const idx = c.currentQueueIndex; if (idx >= totalCount) { c.currentQueueIndex = 0; return; }
        if (status[idx]) {
          if (c.isWaiting) { c.isWaiting = false; if (c.waitTimerID) { clearTimeout(c.waitTimerID); c.waitTimerID = null; } }
          const t = c.targets[idx], el = t.element;
          if (t.isInput) { if (isInputField(el) && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) { el.value = c.autoFillContent; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } else if (el.isContentEditable) el.innerHTML = c.autoFillContent; } else { el.click(); }
          c.clickedCount++;
          updateRunningDisplay(ci, c.clickedCount, `队列[${idx + 1}/${totalCount}]`);
          c.currentQueueIndex = (idx + 1) % totalCount;
          if (c.clickedCount >= c.maxClicks) { stopClickingFor(ci); if (ci === activeConfig) stateSpan.textContent = '已完成'; }
        } else {
          if (missingAction === 'stop') { stopClickingFor(ci); updateRunningDisplay(ci, c.clickedCount, `队列[${idx + 1}] 元素已消失`); } else { if (!c.isWaiting) { c.isWaiting = true; c.waitStartTime = Date.now(); startWaitTimer(ci, idx); } }
        }
        cleanupAutoTargetsFor(ci, status); return;
      }
      let shouldStop = false, anyClicked = 0;
      for (let i = 0; i < totalCount; i++) { const t = c.targets[i]; if (status[i]) { anyClicked++; const el = t.element; if (t.isInput) { if (isInputField(el) && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) { el.value = c.autoFillContent; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } else if (el.isContentEditable) el.innerHTML = c.autoFillContent; } else { el.click(); } } else { if (missingAction === 'stop') shouldStop = true; } }
      if (shouldStop) { stopClickingFor(ci); updateRunningDisplay(ci, c.clickedCount, '元素已消失'); return; }
      if (anyClicked) { c.clickedCount += anyClicked; updateRunningDisplay(ci, c.clickedCount, c.isMultiMode && c.clickStrategy === 'simultaneous' ? '同时操作运行中' : '运行中'); if (c.clickedCount >= c.maxClicks) { stopClickingFor(ci); if (ci === activeConfig && !isPowerSave) stateSpan.textContent = '已完成'; } }
      cleanupAutoTargetsFor(ci, status);
    } catch (e) { console.error('[AUTO_OP] doClickFor 异常:', e); }
    isProgrammaticClick = false;
  }

  function cleanupAutoTargetsFor(ci, status) {
    const c = configs[ci]; let changed = false;
    for (let i = c.targets.length - 1; i >= 0; i--) { if (!c.targets[i].isAuto) continue; if (status[i] !== undefined && status[i]) c.targets[i].missCount = 0; else if (status[i] === false) { c.targets[i].missCount = (c.targets[i].missCount || 0) + 1; if (c.targets[i].missCount >= 5) { c.targets[i].element && c.targets[i].element.classList && c.targets[i].element.classList.remove('auto-op-selected-highlight'); c.discoveredElements.delete(c.targets[i].element); c.targets.splice(i, 1); changed = true; } } }
    if (c.targets.length > 0 && c.currentQueueIndex >= c.targets.length) c.currentQueueIndex = 0;
    if (ci === activeConfig && (!c.uiThrottled || changed)) { refreshParentHighlights(); updateTargetUI(); updateTargetCount(); if (changed) c.doClickLastUIUpdate = Date.now(); }
  }
  // ===================== 全局事件 =====================
  panel.addEventListener('click', (e) => { if (e.target === configBtnEl || configBtnEl.contains(e.target)) return; closeConfigMenu(); }, true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (configs.some(c => c.isRunning) || isAutoRefresh)) requestWakeLock(); });
  // ===================== 初始化 =====================
  detectBrowserTheme();
  loadData();
  const initBody = panel.querySelector('.auto-op-body');
  panel.style.transition = 'none';
  if (initBody) initBody.style.transition = 'none';
  panel.classList.add('collapsed');
  toggleBtn.textContent = '+';
  measureCollapsedWidth();
  panel.style.width = collapsedWidth + 'px';
  void panel.offsetWidth;
  panel.style.transition = '';
  if (initBody) initBody.style.transition = '';
  goToPage(currentPage, false);
  pageContainer.querySelectorAll('.auto-op-page').forEach(p => { new ResizeObserver(() => updatePageHeight()).observe(p); });
  (function restoreAutoRefreshState() {
    const rs = loadRefreshState();
    if (rs && rs.active) {
      if (rs.logs && Array.isArray(rs.logs)) {
        refreshLogs = rs.logs.map(item => typeof item === 'string' ? { time: item, msg: '页面已刷新' } : item);
        updateLogUI();
      }
      if (rs.isPowerSave) { setTimeout(() => { enablePowerSave(); }, 300); }
      const now = Date.now();
      const remaining = rs.nextRefreshTime - now;
      if (remaining > 0) { refreshStartTimestamp = now - (refreshIntervalSec * 1000 - remaining); startAutoRefreshCountdown(false);
      } else { startAutoRefreshCountdown(true); }
      if (rs.running) {
        const entries = Object.entries(rs.running);
        if (entries.length > 0) {
          setTimeout(() => {
            for (const [ci, rState] of entries) {
              const ciNum = parseInt(ci);
              if (configs[ciNum].targets.length > 0) {
                startClickingFor(ciNum, rState.opStart);
                configs[ciNum].clickedCount = rState.count || 0;
              }
            }
            const c = cv();
            if (c.isRunning) countSpan.textContent = c.clickedCount;
          }, 200);
        }
      }
      clearRefreshState();
    } else if (isAutoRefresh && refreshIntervalSec >= 10) {
      startAutoRefreshCountdown(true);
    }
  })();
  setTimeout(() => {
    for (let i = 0; i < CONFIG_COUNT; i++) {
      const c = configs[i];
      if (c.isRunning) continue;
      if (c.autoStartEnabled && c.autoStartIntervalMin > 0) {
        c.autoStartNextTime = Date.now() + c.autoStartIntervalMin * 60 * 1000;
        startAutoStartCountdownTimerFor(i);
      }
    }
  }, 500);
  panel.style.visibility = '';
})();