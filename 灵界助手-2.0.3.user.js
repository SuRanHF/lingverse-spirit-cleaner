// ==UserScript==
// @name 灵界助手
// @namespace https://ling.muge.info
// @version 2.0.3
// @description 自动雇佣护道者、购买商人物品、死亡复活、关闭打赏弹窗、自动寻宝、铭文洗练、试练塔扫荡，支持手机端拖拽
// @match https://ling.muge.info/*
// @grant GM_getValue
// @grant GM_setValue
// @grant GM_addStyle
// @grant unsafeWindow
// @run-at document-idle
// @downloadURL https://gitee.com/nashsci/ling/raw/master/ling-monitor.user.js
// @updateURL https://gitee.com/nashsci/ling/raw/master/ling-monitor.user.js
// ==/UserScript==

(function () {
    'use strict';

    const _w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    if (typeof _w.__S === 'undefined' || !_w.__S) {
        console.log('[灵界助手] 盐值未获取，脚本未激活');
        return;
    }

    // --- 主题样式 ---
    GM_addStyle(`
        /* === 主题变量 (跟随页面亮暗模式) === */
        html.theme-dark #monitor-panel,
        html:not(.theme-light) #monitor-panel {
            --mp-bg: #0e1528;
            --mp-bg-section: rgba(200,160,80,0.03);
            --mp-bg-card: rgba(0,0,0,0.25);
            --mp-bg-input: rgba(0,0,0,0.4);

            --mp-text: #f0ece4;
            --mp-text-secondary: #b8a080;
            --mp-text-muted: #9a8a70;
            --mp-text-bright: #f5f2eb;

            --mp-accent: #d4a84b;
            --mp-accent-dim: rgba(212,168,75,0.25);
            --mp-accent-glow: rgba(212,168,75,0.15);
            --mp-accent-subtle: rgba(212,168,75,0.05);
            --mp-jade: #4ecdc4;
            --mp-jade-glow: rgba(78,205,196,0.2);
            --mp-red: #ff6b6b;
            --mp-red-glow: rgba(255,107,107,0.2);

            --mp-border: rgba(200,160,80,0.08);
            --mp-border-subtle: rgba(200,160,80,0.15);
            --mp-border-strong: rgba(200,160,80,0.25);

            --mp-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 40px rgba(212,168,75,0.08);
            --mp-shadow-inner: inset 0 1px 0 rgba(200,160,80,0.1);

            --mp-header-grad: linear-gradient(180deg, rgba(212,168,75,0.08) 0%, transparent 100%);
            --mp-gold-line: linear-gradient(90deg, transparent 0%, rgba(212,168,75,0.5) 20%, rgba(212,168,75,0.8) 50%, rgba(212,168,75,0.5) 80%, transparent 100%);
            --mp-bg-texture: repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(200,160,80,0.02) 2px, rgba(200,160,80,0.02) 4px);

            --mp-log-success: #4ecdc4;
            --mp-log-error: #ff6b6b;
            --mp-log-warn: #f0a050;
            --mp-log-info: #70a0c0;
            --mp-log-action: #d4a84b;
            --mp-log-gold: #d4a84b;
        }
        html.theme-light #monitor-panel {
            --mp-bg: #f5f3ef;
            --mp-bg-section: #f0ece8;
            --mp-bg-card: rgba(90,122,138,0.05);
            --mp-bg-input: #eae6e2;

            --mp-text: #2a3a4a;
            --mp-text-secondary: #5a6a7a;
            --mp-text-muted: #607080;
            --mp-text-bright: #1a2a3a;

            --mp-accent: #b8860b;
            --mp-accent-dim: rgba(184,134,11,0.2);
            --mp-accent-glow: rgba(184,134,11,0.1);
            --mp-accent-subtle: rgba(184,134,11,0.05);
            --mp-jade: #3a8a80;
            --mp-jade-glow: rgba(58,138,128,0.15);
            --mp-red: #c84040;
            --mp-red-glow: rgba(200,64,64,0.15);

            --mp-border: rgba(60,60,60,0.06);
            --mp-border-subtle: rgba(60,60,60,0.12);
            --mp-border-strong: rgba(60,60,60,0.2);

            --mp-shadow: 0 4px 16px rgba(0,0,0,0.08);
            --mp-shadow-inner: inset 0 1px 0 rgba(255,255,255,0.5);

            --mp-header-grad: linear-gradient(180deg, #f8f6f2 0%, #f5f3ef 100%);
            --mp-gold-line: linear-gradient(90deg, transparent 0%, rgba(184,134,11,0.3) 30%, rgba(184,134,11,0.5) 50%, rgba(184,134,11,0.3) 70%, transparent 100%);
            --mp-bg-texture: none;

            --mp-log-success: #3a8a50;
            --mp-log-error: #c84040;
            --mp-log-warn: #b08030;
            --mp-log-info: #3a6a80;
            --mp-log-action: #8a6a20;
            --mp-log-gold: #8a6a20;
        }

        /* === 面板整体 === */
        #monitor-panel {
            position: fixed; top: 10px; right: 10px; width: 320px;
            max-width: calc(100vw - 20px);
            background: var(--mp-bg);
            border: 1px solid var(--mp-border-subtle);
            border-radius: 12px; z-index: 2147483647 !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 12px; font-weight: 500;
            color: var(--mp-text);
            box-shadow: var(--mp-shadow);
            overflow: hidden;
        }
        #monitor-panel::before {
            content: '';
            position: absolute;
            inset: 0;
            background: var(--mp-bg-texture);
            pointer-events: none;
            z-index: 0;
        }
        .mp-gold-line {
            height: 1px;
            background: var(--mp-gold-line);
            position: relative;
            z-index: 2;
        }
        #monitor-panel.minimized #monitor-body { display: none; }
        #monitor-panel.minimized {
            width: 48px; height: 48px;
            min-width: 48px; max-width: 48px;
            border-radius: 50%;
            cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            padding: 0;
            border: 2px solid var(--mp-border-subtle);
            box-shadow: 0 2px 12px rgba(0,0,0,0.3);
            transition: box-shadow 0.5s, border-color 0.5s;
        }
        #monitor-panel.minimized:hover {
            box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        }
        #monitor-panel.minimized::before { display: none; }
        #monitor-panel.minimized .mp-gold-line { display: none; }
        #monitor-panel.minimized #monitor-header {
            padding: 0;
            width: 100%; height: 100%;
            display: flex; align-items: center; justify-content: center;
            background: var(--mp-bg);
            border-radius: 50%;
        }
        #monitor-panel.minimized .mp-header-title { display: none; }
        #monitor-panel.minimized .mp-header-right { display: none; }
        #monitor-panel.minimized .mp-minimized-icon {
            display: flex;
            font-size: 20px;
            color: var(--mp-accent);
        }
        .mp-minimized-icon { display: none; }
        #monitor-panel.minimized.running {
            animation: mp-breathe 2s ease-in-out infinite;
        }
        @keyframes mp-breathe {
            0%, 100% { box-shadow: 0 2px 12px rgba(0,0,0,0.3), 0 0 12px rgba(74,192,224,0.3), 0 0 24px rgba(74,192,224,0.1); border-color: rgba(74,192,224,0.4); }
            50% { box-shadow: 0 2px 12px rgba(0,0,0,0.3), 0 0 24px rgba(74,192,224,0.6), 0 0 48px rgba(74,192,224,0.2); border-color: rgba(74,192,224,0.9); }
        }

        /* === 头部 === */
        #monitor-header {
            cursor: move; padding: 10px 14px;
            background: var(--mp-header-grad);
            display: flex; justify-content: space-between; align-items: center;
            border-bottom: none;
            user-select: none;
            position: relative;
            z-index: 1;
        }
        .mp-header-title {
            font-family: 'Space Grotesk', sans-serif;
            font-weight: 600; font-size: 13px; letter-spacing: 1.5px;
            color: var(--mp-text-bright);
        }
        .mp-header-right {
            display: flex; align-items: center; gap: 12px;
        }
        #monitor-minimize, #monitor-close {
            cursor: pointer;
            width: 24px; height: 24px;
            display: flex; align-items: center; justify-content: center;
            border-radius: 6px;
            color: var(--mp-text-secondary);
            background: transparent;
            border: none;
            font-size: 12px;
            transition: all 0.15s ease;
        }
        #monitor-minimize:hover {
            background: var(--mp-accent-subtle);
            color: var(--mp-accent);
        }
        #monitor-close {
            color: var(--mp-red);
            font-size: 14px; font-weight: bold;
        }
        #monitor-close:hover {
            background: var(--mp-red-glow);
        }

        /* === Tab 栏 === */
        .mp-tab-bar {
            display: flex;
            border-bottom: 1px solid var(--mp-border);
            position: relative;
            z-index: 1;
        }
        .mp-tab {
            flex: 1; padding: 8px 0;
            text-align: center;
            font-family: 'Space Grotesk', sans-serif;
            font-size: 11px; font-weight: 600;
            letter-spacing: 1px;
            color: var(--mp-text-muted);
            background: transparent;
            border: none; cursor: pointer;
            transition: all 0.15s;
            position: relative;
        }
        .mp-tab:hover:not(.active) { color: var(--mp-text-secondary); }
        .mp-tab.active { color: var(--mp-accent); }
        .mp-tab.active::after {
            content: '';
            position: absolute;
            bottom: 0; left: 20%; right: 20%;
            height: 2px;
            background: var(--mp-accent);
            border-radius: 1px;
        }

        /* === Tab 内容 === */
        .mp-tab-content { display: none; }
        .mp-tab-content.active { display: block; }

        /* === 状态行 === */
        .mp-status-line {
            padding: 6px 12px;
            display: flex; align-items: center; gap: 6px;
            font-family: 'Space Grotesk', sans-serif;
            font-size: 11px; font-weight: 600; letter-spacing: 1px;
            border-bottom: 1px solid var(--mp-border);
        }
        .mp-status-line .mp-status-dot {
            width: 6px; height: 6px; border-radius: 50%;
            background: currentColor;
        }
        .mp-status-line.status-stopped { color: var(--mp-text-muted); }
        .mp-status-line.status-running {
            color: var(--mp-jade);
        }
        .mp-status-line.status-running .mp-status-dot {
            animation: mp-pulse-dot 1.5s ease-in-out infinite;
        }
        .mp-status-line.status-paused {
            color: var(--mp-log-warn);
        }
        .mp-status-line.status-paused .mp-status-dot {
            animation: mp-pulse-dot 2s ease-in-out infinite;
        }
        @keyframes mp-pulse-dot {
            0%, 100% { transform: scale(1); opacity: 0.8; }
            50% { transform: scale(1.3); opacity: 1; }
        }
        .mp-daynight-indicator {
            margin-left: auto;
            font-size: 11px; font-weight: 600; letter-spacing: 0.5px;
        }
        .mp-daynight-indicator.day { color: var(--mp-log-warn); }
        .mp-daynight-indicator.night { color: var(--mp-log-info); }

        /* === 日志区域 === */
        #monitor-log, #treasure-log, #inscription-log, #sweep-log {
            padding: 8px 12px; max-height: 200px; overflow-y: auto;
            background: var(--mp-bg-card);
            scrollbar-width: thin; scrollbar-color: var(--mp-border-subtle) transparent;
            outline: none;
        }
        #monitor-log::-webkit-scrollbar, #treasure-log::-webkit-scrollbar, #inscription-log::-webkit-scrollbar, #sweep-log::-webkit-scrollbar { width: 5px; }
        #monitor-log::-webkit-scrollbar-track, #treasure-log::-webkit-scrollbar-track, #inscription-log::-webkit-scrollbar-track, #sweep-log::-webkit-scrollbar-track { background: transparent; }
        #monitor-log::-webkit-scrollbar-thumb, #treasure-log::-webkit-scrollbar-thumb, #inscription-log::-webkit-scrollbar-thumb, #sweep-log::-webkit-scrollbar-thumb { background: var(--mp-border-subtle); border-radius: 3px; }
        .mp-log-line {
            padding: 3px 0 3px 10px;
            font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
            font-size: 11px; font-weight: 500;
            line-height: 1.6;
            border-bottom: 1px solid var(--mp-border);
            position: relative;
        }
        .mp-log-line:last-child { border-bottom: none; }
        .mp-log-time {
            color: var(--mp-text-muted);
            font-size: 10px; font-weight: 500;
            margin-right: 8px;
        }
        .mp-log-content {
            color: var(--mp-text-secondary);
            font-weight: 500;
            word-break: break-all;
        }
        /* === 日志类型色条 === */
        .mp-log-line::before {
            content: '';
            position: absolute;
            left: 0; top: 0; bottom: 0;
            width: 2px; border-radius: 1px;
            background: var(--mp-border);
        }
        .mp-log-line.log-success::before { background: var(--mp-log-success); }
        .mp-log-line.log-error::before { background: var(--mp-log-error); }
        .mp-log-line.log-warn::before { background: var(--mp-log-warn); }
        .mp-log-line.log-info::before { background: var(--mp-log-info); }
        .mp-log-line.log-action::before { background: var(--mp-log-action); }
        .mp-log-line.log-gold::before { background: var(--mp-log-gold); }
        .mp-log-line.log-success .mp-log-content { color: var(--mp-log-success); }
        .mp-log-line.log-error .mp-log-content { color: var(--mp-log-error); }
        .mp-log-line.log-warn .mp-log-content { color: var(--mp-log-warn); }
        .mp-log-line.log-info .mp-log-content { color: var(--mp-log-info); }
        .mp-log-line.log-action .mp-log-content { color: var(--mp-log-action); }
        .mp-log-line.log-gold .mp-log-content { color: var(--mp-log-gold); }

        /* === 底部按钮栏 === */
        .mp-bottom-bar {
            padding: 8px 12px;
            border-top: 1px solid var(--mp-border);
            display: flex; gap: 6px;
            background: var(--mp-bg);
            position: relative;
            z-index: 1;
        }
        .mp-btn {
            flex: 1; padding: 7px 4px;
            border: none; border-radius: 4px;
            cursor: pointer;
            font-family: 'Space Grotesk', sans-serif;
            font-size: 11px; font-weight: 600;
            transition: all 0.15s ease;
            position: relative;
            overflow: hidden;
        }
        .mp-btn.mp-btn-start {
            background: linear-gradient(135deg, var(--mp-accent) 0%, #b8860b 100%);
            color: var(--mp-bg);
            box-shadow: 0 2px 8px var(--mp-accent-dim), var(--mp-shadow-inner);
        }
        .mp-btn.mp-btn-start:hover {
            filter: brightness(1.1);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px var(--mp-accent-dim);
        }
        .mp-btn.mp-btn-start:active { transform: translateY(0) scale(0.97); }
        .mp-btn.mp-btn-stop {
            background: linear-gradient(135deg, var(--mp-red) 0%, #c84040 100%);
            color: #fff;
            box-shadow: 0 2px 8px var(--mp-red-glow);
        }
        .mp-btn.mp-btn-stop:hover {
            filter: brightness(1.1);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px var(--mp-red-glow);
        }
        .mp-btn.mp-btn-stop:active { transform: translateY(0) scale(0.97); }
        .mp-btn.mp-btn-treasure {
            background: linear-gradient(135deg, var(--mp-jade) 0%, #3a8a80 100%);
            color: #fff;
            box-shadow: 0 2px 8px var(--mp-jade-glow), var(--mp-shadow-inner);
        }
        .mp-btn.mp-btn-treasure:hover {
            filter: brightness(1.1);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px var(--mp-jade-glow);
        }
        .mp-btn.mp-btn-treasure:active { transform: translateY(0) scale(0.97); }
        .mp-btn.mp-btn-treasure-stop {
            background: linear-gradient(135deg, var(--mp-red) 0%, #c84040 100%);
            color: #fff;
            box-shadow: 0 2px 8px var(--mp-red-glow);
        }
        .mp-btn.mp-btn-treasure-stop:hover {
            filter: brightness(1.1);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px var(--mp-red-glow);
        }
        .mp-btn.mp-btn-pause {
            background: linear-gradient(135deg, #f0a050 0%, #d08030 100%);
            color: #fff;
            box-shadow: 0 2px 8px rgba(240,160,80,0.3);
        }
        .mp-btn.mp-btn-pause:hover {
            filter: brightness(1.1);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(240,160,80,0.4);
        }
        .mp-btn.mp-btn-pause:active { transform: translateY(0) scale(0.97); }
        .mp-btn.mp-btn-config {
            background: var(--mp-bg-card);
            color: var(--mp-accent);
            border: 1px solid var(--mp-border-subtle);
        }
        .mp-btn.mp-btn-config:hover {
            background: var(--mp-accent-subtle);
            border-color: var(--mp-accent-dim);
        }
        .mp-btn.mp-btn-config:active { transform: scale(0.97); }
        .mp-btn.mp-btn-clear {
            background: var(--mp-bg-card);
            color: var(--mp-text-muted);
            border: 1px solid var(--mp-border);
        }
        .mp-btn.mp-btn-clear:hover {
            background: var(--mp-bg-section);
            color: var(--mp-text-secondary);
            border-color: var(--mp-border-subtle);
        }

        /* === 配置面板 === */
        #config-panel, #inscription-config-panel {
            width: 100%; max-height: 50vh; overflow-y: auto;
            background: var(--mp-bg);
            border-top: 1px solid var(--mp-border-subtle);
            font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
            font-size: 12px;
            color: var(--mp-text);
            padding: 12px; padding-bottom: 30px; box-sizing: border-box;
            position: relative;
            z-index: 1;
            scrollbar-width: thin; scrollbar-color: var(--mp-border-subtle) transparent;
        }
        #config-panel::-webkit-scrollbar, #inscription-config-panel::-webkit-scrollbar { width: 5px; }
        #config-panel::-webkit-scrollbar-thumb, #inscription-config-panel::-webkit-scrollbar-thumb { background: var(--mp-border-subtle); border-radius: 3px; }
        .cfg-header {
            display: flex; justify-content: space-between; align-items: center;
            margin-bottom: 16px;
        }
        .cfg-title {
            font-family: 'Space Grotesk', sans-serif;
            font-weight: 600; font-size: 14px; letter-spacing: 2px;
            color: var(--mp-text-bright);
        }
        .cfg-close {
            cursor: pointer;
            width: 28px; height: 28px;
            display: flex; align-items: center; justify-content: center;
            border-radius: 6px;
            color: var(--mp-red); font-size: 18px; font-weight: bold;
            background: transparent;
            transition: all 0.15s;
        }
        .cfg-close:hover { background: var(--mp-red-glow); }
        .cfg-section {
            margin-bottom: 14px; padding: 10px 12px;
            background: var(--mp-bg-section);
            border: 1px solid var(--mp-accent-dim);
            border-radius: 8px;
        }
        .cfg-section:last-child { margin-bottom: 0; }
        .cfg-section-label {
            font-family: 'Space Grotesk', sans-serif;
            font-size: 10px; font-weight: 700;
            color: var(--mp-text-muted);
            text-transform: uppercase; letter-spacing: 2px;
            margin-bottom: 10px;
        }
        .cfg-row { margin-bottom: 10px; }
        .cfg-row:last-child { margin-bottom: 0; }
        .cfg-label {
            display: block;
            font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
            font-size: 12px; font-weight: 600;
            color: var(--mp-accent);
            margin-bottom: 6px;
            letter-spacing: 0.5px;
        }
        .cfg-hint {
            font-size: 11px; font-weight: 400;
            color: var(--mp-text-muted);
        }
        #config-panel input[type=number],
        #config-panel input[type=text],
        #config-panel select,
        #inscription-config-panel input[type=number],
        #inscription-config-panel input[type=text],
        #inscription-config-panel select {
            width: 100%; padding: 5px 8px;
            background: var(--mp-bg-input);
            color: var(--mp-text);
            border: 1px solid var(--mp-text-muted) !important;
            border-radius: 5px;
            font-family: inherit;
            font-size: 11px; font-weight: 500;
            transition: all 0.15s;
        }
        #config-panel input:focus, #config-panel select:focus,
        #inscription-config-panel input:focus, #inscription-config-panel select:focus {
            outline: none;
            border-color: var(--mp-accent) !important;
            box-shadow: 0 0 0 2px var(--mp-accent-glow);
        }
        #config-panel input[type=checkbox],
        #inscription-config-panel input[type=checkbox] {
            -webkit-appearance: none; appearance: none;
            width: 16px; height: 16px;
            background: var(--mp-bg-input);
            border: 1.5px solid var(--mp-text-muted);
            border-radius: 3px;
            cursor: pointer;
            position: relative;
        }
        #config-panel input[type=checkbox]:checked,
        #inscription-config-panel input[type=checkbox]:checked {
            background: var(--mp-accent);
            border-color: var(--mp-accent);
        }
        #config-panel input[type=checkbox]:checked::after,
        #inscription-config-panel input[type=checkbox]:checked::after {
            content: '';
            position: absolute;
            left: 0.25em; top: 0.05em;
            width: 0.35em; height: 0.6em;
            border: solid var(--mp-bg);
            border-width: 0 0.14em 0.14em 0;
            transform: rotate(45deg);
        }
        .cfg-checkbox-row {
            display: flex; align-items: center; gap: 8px;
        }
        .cfg-bottom-bar {
            display: flex; gap: 10px;
            margin-top: 16px;
        }
        .cfg-btn {
            flex: 1; padding: 8px 0;
            border-radius: 4px;
            font-family: 'Space Grotesk', sans-serif;
            font-size: 12px; font-weight: 600;
            cursor: pointer;
            transition: all 0.15s;
        }
        .cfg-btn-save {
            background: linear-gradient(135deg, var(--mp-accent) 0%, #b8860b 100%);
            color: var(--mp-bg);
            border: none;
            box-shadow: 0 2px 8px var(--mp-accent-dim);
        }
        .cfg-btn-save:hover {
            filter: brightness(1.1);
            transform: translateY(-1px);
        }
        .cfg-btn-reset {
            background: var(--mp-bg-card);
            color: var(--mp-text-secondary);
            border: 1px solid var(--mp-border-subtle);
        }
        .cfg-btn-reset:hover {
            background: var(--mp-accent-subtle);
            color: var(--mp-accent);
            border-color: var(--mp-accent-dim);
        }

        /* === 优先级列表 === */
        .priority-list { display: flex; flex-direction: column; gap: 4px; }
        .priority-row {
            display: flex; align-items: center; gap: 4px;
            background: var(--mp-bg-card);
            border: 1px solid var(--mp-border-subtle);
            border-radius: 6px; padding: 5px 8px;
            transition: all 0.15s;
        }
        .priority-row:hover { border-color: var(--mp-text-muted); }
        .priority-row.dragging { opacity: 0.4; }
        .priority-row.drag-over { border-color: var(--mp-accent); background: var(--mp-accent-subtle); }
        .priority-handle {
            cursor: grab; color: var(--mp-text-muted);
            font-size: 14px; user-select: none;
            flex-shrink: 0;
        }
        #config-panel .priority-row .priority-type {
            width: 72px; min-width: 72px; max-width: 72px;
            padding: 3px 8px;
            background: var(--mp-bg-input) !important;
            color: var(--mp-text);
            border: 1px solid var(--mp-border);
            border-radius: 6px;
            font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
            font-size: 11px; font-weight: 500;
            flex-shrink: 0;
            height: 26px; box-sizing: border-box;
            appearance: none; -webkit-appearance: none;
            text-align: center; text-align-last: center;
        }
        #config-panel .priority-row .priority-keyword {
            flex: 1; min-width: 0;
            background: var(--mp-bg-input) !important;
            color: var(--mp-text);
            border: 1px solid var(--mp-border);
            border-radius: 6px; padding: 3px 8px;
            font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
            font-size: 11px; font-weight: 500;
            height: 26px; box-sizing: border-box;
        }
        .priority-keyword:focus { outline: none; border-color: var(--mp-accent); }
        .priority-del {
            cursor: pointer; color: var(--mp-red);
            font-size: 14px; font-weight: bold;
            user-select: none;
            width: 20px; height: 20px;
            display: flex; align-items: center; justify-content: center;
            border-radius: 6px; transition: all 0.15s;
            flex-shrink: 0;
        }
        .priority-del:hover { background: var(--mp-red-glow); }
        .priority-add {
            cursor: pointer; color: var(--mp-accent);
            font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
            font-size: 11px; font-weight: 500;
            text-align: center; padding: 6px;
            border: 1px dashed var(--mp-border-subtle);
            border-radius: 6px; margin-top: 4px;
            transition: all 0.15s;
        }
        .priority-add:hover { border-color: var(--mp-accent); background: var(--mp-accent-subtle); }

        /* === 铭文洗练统计区域 === */
        #inscription-stats {
            padding: 6px 12px;
            display: flex; gap: 4px;
            flex-wrap: wrap;
            border-bottom: 1px solid var(--mp-border);
        }
        .ip-stat {
            flex: 1; min-width: 40px;
            text-align: center;
            padding: 2px;
            background: var(--mp-bg-card);
            border-radius: 6px;
        }
        .ip-stat-value {
            font-family: 'Space Grotesk', sans-serif;
            font-size: 14px;
            font-weight: 700;
            color: var(--mp-accent);
        }
        .ip-stat-label {
            font-size: 9px;
            font-weight: 600;
            color: var(--mp-text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        /* === 铭文状态（复用 .mp-status-line） === */
        .mp-status-line.status-idle { color: var(--mp-text-muted); }
        .mp-status-line.status-paused { color: var(--mp-log-warn); }
        .mp-status-line.status-discarding { color: var(--mp-red); }

        /* === 铭文目标属性列表 === */
        .affix-list { display: flex; flex-direction: column; gap: 4px; }
        .affix-row {
            display: flex; align-items: center; gap: 4px;
            background: var(--mp-bg-card);
            border: 1px solid var(--mp-border-subtle);
            border-radius: 6px;
            padding: 5px 8px;
            transition: all 0.15s;
        }
        .affix-row:hover { border-color: var(--mp-text-muted); }
        .affix-row.dragging { opacity: 0.4; }
        .affix-row.drag-over { border-color: var(--mp-accent); background: var(--mp-accent-subtle); }
        .affix-handle {
            cursor: grab; color: var(--mp-text-muted);
            font-size: 12px; user-select: none;
            flex-shrink: 0;
        }
        #inscription-config-panel .affix-row .target-stat-select {
            flex: 0 0 70px; width: 70px;
            padding: 3px 8px;
            background: var(--mp-bg-input) !important;
            color: var(--mp-text);
            border: 1px solid var(--mp-text-muted) !important;
            border-radius: 6px;
            font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
            font-size: 11px; font-weight: 500;
            height: 26px; box-sizing: border-box;
            appearance: none; -webkit-appearance: none;
            text-align: center; text-align-last: center;
        }
        #inscription-config-panel .affix-row .affix-value {
            flex: 1; min-width: 40px;
            background: var(--mp-bg-input) !important;
            color: var(--mp-text);
            border: 1px solid var(--mp-text-muted) !important;
            border-radius: 6px; padding: 3px 8px;
            font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
            font-size: 11px; font-weight: 500;
            height: 26px; box-sizing: border-box;
        }
        .affix-value:focus { outline: none; border-color: var(--mp-accent); }
        .affix-del {
            cursor: pointer; color: var(--mp-red);
            font-size: 14px; font-weight: bold;
            user-select: none;
            width: 20px; height: 20px;
            display: flex; align-items: center; justify-content: center;
            border-radius: 6px; transition: all 0.15s;
            flex-shrink: 0;
        }
        .affix-del:hover { background: var(--mp-red-glow); }
        .affix-add {
            cursor: pointer; color: var(--mp-accent);
            font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
            font-size: 11px; font-weight: 500;
            text-align: center; padding: 6px;
            border: 1px dashed var(--mp-border-subtle);
            border-radius: 6px; margin-top: 4px;
            transition: all 0.15s;
        }
        .affix-add:hover { border-color: var(--mp-accent); background: var(--mp-accent-subtle); }
    `);

    // --- 版本与配置 ---
    const SCRIPT_VERSION = '2.0.3';

    const DEFAULT_CONFIG = {
        protectors: {
            hireProtector: true,
            priorities: [
                { nameMatch: '蜉蝣一梦', sortBy: 'attack', sortOrder: 'desc' },
                { realmMatch: '渡劫|大乘|合道', sortBy: 'attack', sortOrder: 'desc' }
            ],
            maxRetries: 3,
            retryDelayMs: 800,
            hireMode: 'together',
            onNoProtector: 'escape',
            fightAttackThreshold: 0,
            hirePriceThreshold: 2000,
            afterEscape: 'stop',
        },
        merchant: {
            highPriceThreshold: 7500000,
            stonePriority: ['传说', '史诗', '稀有', '优良', '普通', '极品', '上品', '中品', '下品'],
            itemKeywords: ['洗炼石', '空白卷轴', '妖丹', '涅槃重生丹', '太虚道典'],
            fallbackToExpensive: true,
        },
        general: {
            highLevelMeditate: true,
            checkDaoyun: true,
            exploreMultiplier: 1,
            autoMeditate: true,
        },
        treasureHunt: {
            batchSize: 0,
            intervalMs: 2000,
            useRandomInterval: false,
            intervalMinMs: 1500,
            intervalMaxMs: 3000,
            useQuantity: 10,
            hireProtector: true,
            checkDaoyun: true,
            autoMeditate: true,
            autoCycle: {
                enabled: false,
                runMinutes: 60,
                restMinutes: 30,
                refreshPage: false,
                linkSweep: false,
            },
        },
        dayNight: {
            enabled: false,
            checkIntervalSec: 30,
            maxMeditateRetries: 3,
            meditateRetryIntervalSec: 5,
        },
        inscription: {
            pullCount: 10, // 10 = 十连, 100 = 百连
            targetStats: [
                { stat: '攻击', minValue: 50 },
                { stat: '防御', minValue: 50 },
                { stat: '气血', minValue: 100 },
                { stat: '神识', minValue: 20 },
                { stat: '锋', minValue: 5 },
                { stat: '御', minValue: 5 },
                { stat: '命', minValue: 5 }
            ],
            stopMode: 'any',
            maxAttempts: 0,
            resultAnimationMs: 1500,
            discardDelayMs: 500,
            autoCloseDialogs: true,
            autoInscribe: false,
            notifyOnComplete: true,
        },
        autoCycle: {
            enabled: false,
            runMinutes: 60,
            restMinutes: 30,
            refreshPage: false,
            linkSweep: false,
        },
        sweep: {
            maxSweepCount: 0,
            sweepIntervalMs: 500,
        },
    };

    function loadConfig() {
        const defaults = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        defaults._version = SCRIPT_VERSION;
        const saved = GM_getValue('ling_config', null);
        if (saved) {
            try {
                const parsed = typeof saved === 'string' ? JSON.parse(saved) : saved;
                const result = {
                    ...defaults, ...parsed,
                    protectors: { ...defaults.protectors, ...(parsed.protectors || {}) },
                    merchant: { ...defaults.merchant, ...(parsed.merchant || {}) },
                    general: { ...defaults.general, ...(parsed.general || {}) },
                    treasureHunt: { ...defaults.treasureHunt, ...(parsed.treasureHunt || {}),
                        autoCycle: { ...defaults.treasureHunt.autoCycle, ...((parsed.treasureHunt || {}).autoCycle || {}) } },
                    dayNight: { ...defaults.dayNight, ...(parsed.dayNight || {}) },
                    inscription: { ...defaults.inscription, ...(parsed.inscription || {}) },
                    autoCycle: { ...defaults.autoCycle, ...(parsed.autoCycle || {}) },
                    sweep: { ...defaults.sweep, ...(parsed.sweep || {}) },
                };
                result._version = SCRIPT_VERSION;
                return result;
            } catch (e) { /* fallback */ }
        }
        return defaults;
    }

    function saveConfig(cfg) {
        cfg._version = SCRIPT_VERSION;
        GM_setValue('ling_config', JSON.stringify(cfg));
    }

    // --- 工具函数 ---
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    function jitteredSleep(baseMs) {
        let ms;
        const r = Math.random();
        if (r < 0.12) {
            // 12%: 快速操作 (0.4-0.7x)
            ms = baseMs * (0.4 + Math.random() * 0.3);
        } else if (r < 0.25) {
            // 13%: 较长停顿 (2.5-5x)，模拟犹豫/分心
            ms = baseMs * (2.5 + Math.random() * 2.5);
        } else {
            // 75%: 正常范围 (0.7-1.8x)
            ms = baseMs * (0.7 + Math.random() * 1.1);
        }
        ms = Math.round(ms);
        if (ms % 10 === 0) ms += Math.floor(Math.random() * 9) + 1;
        return sleep(ms);
    }

    function escapeHTML(str) {
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // --- 反检测: 模拟人类行为 ---
    const _rd = (min, max) => min + Math.random() * (max - min);
    const _isTouchDevice = 'ontouchstart' in window && window.innerWidth < 1024;

    // 鼠标位置追踪（仅 PC 端）
    let _cursorX = _isTouchDevice ? 0 : Math.round(window.innerWidth * (0.3 + Math.random() * 0.4));
    let _cursorY = _isTouchDevice ? 0 : Math.round(window.innerHeight * (0.3 + Math.random() * 0.4));

    function _offsetCoord(val) {
        const r = Math.random();
        let result;
        if (r < 0.2) result = val + _rd(-3, 3);
        else if (r < 0.5) result = val + _rd(-1.5, 1.5);
        else result = val + _rd(-0.5, 0.5);
        // 避免落在整数或半整数附近 (shield click precision 检测阈值 0.05)
        const nearHalf = Math.abs(result * 2 - Math.round(result * 2)) / 2;
        if (nearHalf < 0.08) result += (Math.random() < 0.5 ? 1 : -1) * (0.12 + Math.random() * 0.2);
        return result;
    }

    function _fireMouse(el, cx, cy, type) {
        el.dispatchEvent(new MouseEvent(type, { clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
    }

    // 贝塞尔曲线插值 + 缓动
    function _bezier(t, p0, p1, p2, p3) {
        const u = 1 - t;
        return u*u*u*p0 + 3*u*u*t*p1 + 3*u*t*t*p2 + t*t*t*p3;
    }
    function _easeInOut(t) { return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2; }

    // 模拟鼠标沿贝塞尔曲线移动到目标（仅 PC 端）
    async function _humanMouseMove(toX, toY) {
        if (_isTouchDevice) return;
        const fromX = _cursorX, fromY = _cursorY;
        const dist = Math.hypot(toX - fromX, toY - fromY);
        if (dist < 3) { _cursorX = toX; _cursorY = toY; return; }

        const spread = dist * 0.3;
        const cp1x = (fromX + toX)/2 + (Math.random()-0.5)*spread;
        const cp1y = (fromY + toY)/2 + (Math.random()-0.5)*spread;
        const cp2x = (fromX + toX)/2 + (Math.random()-0.5)*spread;
        const cp2y = (fromY + toY)/2 + (Math.random()-0.5)*spread;

        const steps = Math.max(3, Math.min(15, Math.floor(dist / 40)));
        const stepMs = Math.max(6, Math.min(20, Math.round(8000 / dist)));

        for (let i = 0; i <= steps; i++) {
            const t = _easeInOut(i / steps);
            const x = _bezier(t, fromX, cp1x, cp2x, toX);
            const y = _bezier(t, fromY, cp1y, cp2y, toY);
            const el = document.elementFromPoint(x, y) || document.documentElement;
            _fireMouse(el, x, y, 'mousemove');
            if (i < steps) await sleep(stepMs + Math.round(Math.random() * 8));
        }
        _cursorX = toX;
        _cursorY = toY;
    }

    function _fireTouch(el, cx, cy, type) {
        const touch = new Touch({ identifier: 0, target: el, clientX: cx, clientY: cy });
        el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [touch], targetTouches: type === 'touchend' ? [] : [touch], changedTouches: [touch], bubbles: true, cancelable: true }));
    }

    async function humanClick(el) {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const cx = _offsetCoord(rect.left + rect.width / 2);
        const cy = _offsetCoord(rect.top + rect.height / 2);

        // PC 端：先移动鼠标
        if (!_isTouchDevice) {
            await _humanMouseMove(cx, cy);
            await _fireMouse(el, cx, cy, 'mouseover');
            await _fireMouse(el, cx, cy, 'mouseenter');
            await sleep(_rd(40, 120));
            await _fireMouse(el, cx, cy, 'mousedown');
            await sleep(_rd(30, 80));
            await _fireMouse(el, cx, cy, 'mouseup');
            el.click();
        } else {
            // 触摸设备：touchstart → touchend → (合成) mousedown → mouseup → click
            _fireTouch(el, cx, cy, 'touchstart');
            await sleep(_rd(30, 80));
            _fireTouch(el, cx, cy, 'touchend');
            await sleep(_rd(80, 200));
            await _fireMouse(el, cx, cy, 'mouseover');
            await _fireMouse(el, cx, cy, 'mouseenter');
            await _fireMouse(el, cx, cy, 'mousemove');
            await sleep(_rd(20, 50));
            await _fireMouse(el, cx, cy, 'mousedown');
            await sleep(_rd(30, 80));
            await _fireMouse(el, cx, cy, 'mouseup');
            el.click();
        }
    }

    function humanDelay() { return sleep(_rd(20, 80)); }

    function createLogFn(logElId) {
        return function (msg, type) {
            const now = new Date();
            const ts = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
            console.log(`[${ts}] ${msg}`);
            const logEl = document.getElementById(logElId);
            if (!logEl) return;
            const line = document.createElement('div');
            const cls = type ? ` log-${type}` : '';
            line.className = `mp-log-line${cls}`;
            line.innerHTML = `<span class="mp-log-time">[${ts}]</span><span class="mp-log-content">${escapeHTML(msg)}</span>`;
            const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 30;
            logEl.appendChild(line);
            if (atBottom) logEl.scrollTop = logEl.scrollHeight;
            while (logEl.children.length > 100) logEl.removeChild(logEl.firstChild);
        };
    }

    const monitorLog = createLogFn('monitor-log');
    const thLog = createLogFn('treasure-log');
    const inscriptionLog = createLogFn('inscription-log');
    const sweepLog = createLogFn('sweep-log');

    function isRunning() {
        return window.__monitorRunning || window.__thRunning || window.__inscriptionRunning || window.__sweepRunning;
    }

    function activeLog() {
        if (window.__monitorRunning) return monitorLog;
        if (window.__thRunning) return thLog;
        return inscriptionLog;
    }

    function isOverlayVisible(id) {
        const el = document.getElementById(id);
        if (!el) return false;
        if (el.classList.contains('hidden')) return false;
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
    }

    async function clickButtonByText(root, text) {
        const btns = (root || document).querySelectorAll('button');
        for (const btn of btns) {
            if (btn.textContent.trim() === text) { await humanClick(btn); return true; }
        }
        return false;
    }

    async function dismissLeaveModal(overlayId, logMsg) {
        const overlay = document.getElementById(overlayId);
        const leaveBtn = overlay?.querySelector('.modal-btn--outline');
        if (leaveBtn) {
            activeLog()(logMsg, 'action');
            await humanClick(leaveBtn);
            for (let i = 0; i < 10; i++) {
                await sleep(300);
                if (!isOverlayVisible(overlayId)) break;
            }
            await sleep(200);
            toggleAutoCheckbox(true);
            applyExploreMultiplier();
        }
    }

    let _apiCallCounter = 0;
    async function callApi(method, path, body) {
        await humanDelay();
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('API 调用超时')), 10000);
            const eventName = '__monitorApiResult_' + (++_apiCallCounter);
            const handler = (e) => {
                clearTimeout(timeout);
                window.removeEventListener(eventName, handler);
                try { resolve(JSON.parse(e.detail)); }
                catch { resolve(e.detail); }
            };
            window.addEventListener(eventName, handler);
            const bodyStr = body ? ',' + JSON.stringify(body) : '';
            const s = document.createElement('script');
            s.textContent = `api.request(${JSON.stringify(method)},${JSON.stringify(path)}${bodyStr}).then(r=>window.dispatchEvent(new CustomEvent('${eventName}',{detail:JSON.stringify(r)}))).catch(e=>window.dispatchEvent(new CustomEvent('${eventName}',{detail:JSON.stringify({code:-1,message:e.message})})))`;
            document.head.appendChild(s);
            s.remove();
        });
    }

    async function getPlayerInfo() {
        return await callApi('GET', '/api/player/info?fresh=1');
    }

    async function getMasterOverview() {
        return await callApi('GET', '/api/master/overview');
    }

    async function withFetchIntercept(target, urlMatch, filterFn, actionFn) {
        const origFetch = target.fetch;
        let captured = null;
        target.fetch = async function (...args) {
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
            const resp = await origFetch.apply(this, args);
            if (url.includes(urlMatch)) {
                try {
                    const clone = resp.clone();
                    const data = await clone.json();
                    if (!filterFn || filterFn(data)) captured = data;
                } catch (e) { }
            }
            return resp;
        };
        try {
            return await actionFn(() => captured);
        } finally {
            target.fetch = origFetch;
        }
    }

    // --- Toast 拦截 ---
    const _uw = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    window.__lastToast = '';
    window.__lastToastTime = 0;
    window.__shenshiInsufficient = false;

    // --- 昼夜状态 ---
    const dayNightState = {
        currentIsDay: null,
        lastCheckTime: 0,
        transitioning: false,
        meditateRetryCount: 0,
    };
    const autoCycleState = {
        runStartTime: 0,
        restTimer: null,
        restStartTime: 0,
        restingSeconds: 0,
    };

    const thAutoCycleState = {
        runStartTime: 0,
        restTimer: null,
        restStartTime: 0,
        restingSeconds: 0,
    };
    const originalShowToast = _uw.showToast;
    _uw.showToast = function (msg) {
        window.__lastToast = msg;
        window.__lastToastTime = Date.now();
        if (msg && msg.includes('神识不足')) {
            window.__shenshiInsufficient = true;
        }
        if (originalShowToast) originalShowToast.apply(this, arguments);
    };

    // --- 自动接受原生弹窗 ---
    window._origAlert = window.alert;
    window._origConfirm = window.confirm;
    window._origPrompt = window.prompt;
    window.alert = function () { return undefined; };
    window.confirm = function () { return true; };
    window.prompt = function (msg, def) { return def || ''; };

    let config = loadConfig();

    // --- 同步停止状态UI ---
    function setStoppedUI(btnId, statusId, btnText, btnClass) {
        const btn = document.getElementById(btnId);
        const status = document.getElementById(statusId);
        if (btn) { btn.textContent = btnText; btn.className = btnClass; }
        if (status) {
            const extra = statusId === 'monitor-status' ? '<span id="daynight-indicator" class="mp-daynight-indicator" style="display:none;"></span>' : '';
            status.innerHTML = '<span class="mp-status-dot"></span>已停止' + extra;
            status.className = 'mp-status-line status-stopped';
        }
    }

    function syncStopUI() {
        setStoppedUI('monitor-toggle', 'monitor-status', '启动', 'mp-btn mp-btn-start');
    }

    function syncStopTHUI() {
        setStoppedUI('treasure-toggle', 'treasure-status', '寻宝', 'mp-btn mp-btn-treasure');
        window.__thRunning = false;
    }

    // --- 统一弹窗检查 ---
    async function checkAllPopups() {
        // 1. 死亡
        const d = document.getElementById('deathOverlay');
        if (isOverlayVisible('deathOverlay') && d.querySelector('.btn-revive') && !dying) {
            dying = true;
            try { await handleDeath(); } finally { dying = false; }
            return;
        }

        // 2. PVP
        if (isOverlayVisible('pvpEncounterModal')) {
            activeLog()('遭遇PVP，悄然离去', 'action');
            const btn = document.querySelector('#pvpEncounterModal .modal-btn:last-child');
            if (btn) await humanClick(btn);
            return;
        }

        // 3. 邀约
        if (isOverlayVisible('encounterInviteModal')) {
            await dismissLeaveModal('encounterInviteModal', '收到邀约，婉言告辞');
            return;
        }

        // 4. 公告
        if (isOverlayVisible('announceOverlay')) {
            activeLog()('关闭公告弹窗', 'action');
            const announce = document.getElementById('announceOverlay');
            const closeBtn = announce?.querySelector('.announce-close, .announce-confirm');
            if (closeBtn) await humanClick(closeBtn);
            return;
        }

        // 5. 打赏
        const tipDismissed = await dismissTipDialog(600);
        if (tipDismissed) {
            activeLog()('已关闭打赏弹窗', 'info');
            return;
        }

        // 6. 冥想冲突弹窗（冥想中无法探索）
        {
            const modal = document.getElementById('gameDialogModal');
            if (modal && !modal.classList.contains('hidden') && modal.dataset.meditationConflict === '1') {
                const closeBtn = modal.querySelector('.modal-header-close');
                if (closeBtn) await humanClick(closeBtn);
                activeLog()('冥想冲突弹窗，已关闭', 'action');
                return;
            }
        }

        // 7. 遭遇妖兽
        {
            const o = document.getElementById('encounterOverlay');
            if (isOverlayVisible('encounterOverlay') && !hiring) {
                const now = Date.now();
                if (now - lastEncounterTime < 3000) return;
                lastEncounterTime = now;
                const encounterMode = window.__thRunning ? 'treasure' : 'monitor';
                const logFn = encounterMode === 'treasure' ? thLog : monitorLog;
                const hireEnabled = encounterMode === 'treasure' ? config.treasureHunt.hireProtector : config.protectors.hireProtector;
                if (!hireEnabled) {
                    logMonsterInfo(logFn);
                    await directFight(o, logFn);
                    return;
                }
                await hireProtector(encounterMode);
                return;
            }
            if (hiring && !isOverlayVisible('encounterOverlay')) {
                hiring = false;
            }
        }

        // 8. 商人
        if (isRunning() && isOverlayVisible('merchantOverlay')) {
            if (!shopping) await handleMerchant();
            return;
        }

        // 9. 昼夜自动切换
        if (window.__monitorRunning && config.dayNight.enabled && !dayNightState.transitioning) {
            const now = Date.now();
            const intervalMs = config.dayNight.checkIntervalSec * 1000;
            if (now - dayNightState.lastCheckTime >= intervalMs) {
                dayNightState.lastCheckTime = now;
                if (!hiring && !shopping && !isOverlayVisible('encounterOverlay') && !isOverlayVisible('merchantOverlay')) {
                    try {
                        const playerInfo = await getPlayerInfo();
                        if (playerInfo && playerInfo.data && typeof playerInfo.data.isNight === 'boolean') {
                            const newIsDay = !playerInfo.data.isNight;
                            const oldIsDay = dayNightState.currentIsDay;
                            dayNightState.currentIsDay = newIsDay;
                            updateDayNightIndicator(newIsDay);
                            if (oldIsDay !== null && oldIsDay !== newIsDay) {
                                monitorLog(`昼夜切换: ${oldIsDay ? '白天' : '夜晚'} → ${newIsDay ? '白天' : '夜晚'}`, 'action');
                                if (newIsDay && window.__thRunning) {
                                    monitorLog('寻宝进行中，跳过冥想', 'info');
                                } else {
                                    await handleDayNightTransition(newIsDay);
                                }
                                dayNightState.meditateRetryCount = 0;
                            } else if (newIsDay && !window.__thRunning) {
                                if (playerInfo && playerInfo.data && playerInfo.data.isMeditating) {
                                    dayNightState.meditateRetryCount = 0;
                                } else if (dayNightState.meditateRetryCount < config.dayNight.maxMeditateRetries) {
                                    dayNightState.meditateRetryCount++;
                                    const retryIntervalMs = config.dayNight.meditateRetryIntervalSec * 1000;
                                    dayNightState.lastCheckTime = now - intervalMs + retryIntervalMs;
                                    monitorLog(`白天未在冥想，重新冥想... (${dayNightState.meditateRetryCount}/${config.dayNight.maxMeditateRetries})`, 'warn');
                                    await switchToMeditate();
                                } else if (dayNightState.meditateRetryCount === config.dayNight.maxMeditateRetries) {
                                    dayNightState.meditateRetryCount++;
                                    monitorLog(`冥想重试已达上限(${config.dayNight.maxMeditateRetries}次)，不再重试`, 'error');
                                }
                            } else {
                                dayNightState.meditateRetryCount = 0;
                            }
                        }
                    } catch (e) { /* API 失败跳过 */ }
                }
            }
        }

        // 10. 神识不足（仅监控模式）
        if (window.__monitorRunning && window.__shenshiInsufficient) {
            window.__shenshiInsufficient = false;
            const now2 = Date.now();
            if (now2 - _lastInstantMeditateTime < 5000) return;
            monitorLog('检测到神识不足...', 'info');

            if (config.general.autoMeditate === false) {
                if (window._autoExploreRunning) {
                    window.stopAutoExplore('神识不足', false);
                }
                toggleAutoCheckbox(false);
                // 如果启用了自动循环，转入休息阶段而非完全停止
                if (config.autoCycle.enabled) {
                    autoCycleState.restStartTime = Date.now();
                    autoCycleState.runStartTime = 0;
                    if (autoCycleState.restTimer) clearTimeout(autoCycleState.restTimer);
                    const restMs = config.autoCycle.restMinutes * 60 * 1000;
                    autoCycleState.restTimer = setTimeout(() => {
                        if (config.autoCycle.refreshPage) {
                            GM_setValue('ling_resume_intent', 'explore');
                            location.reload();
                        } else {
                            autoCycleState.restTimer = null;
                            autoCycleState.restStartTime = 0;
                            autoCycleState.restingSeconds = 0;
                            autoCycleState.runStartTime = Date.now();
                            window.__monitorRunning = true;
                            const btn2 = document.getElementById('monitor-toggle');
                            const statusEl2 = document.getElementById('monitor-status');
                            if (btn2) { btn2.textContent = '停止'; btn2.className = 'mp-btn mp-btn-stop'; }
                            if (statusEl2) {
                                statusEl2.innerHTML = '<span class="mp-status-dot"></span>运行中<span id="daynight-indicator" class="mp-daynight-indicator" style="display:none;"></span>';
                                statusEl2.className = 'mp-status-line status-running';
                            }
                            startMainLoop();
                            toggleAutoCheckbox(true);
                            applyExploreMultiplier();
                            if (config.dayNight.enabled) updateDayNightIndicator(dayNightState.currentIsDay);
                            monitorLog('神识恢复，自动循环重新开始（运行' + config.autoCycle.runMinutes + '分钟）', 'success');
                        }
                    }, restMs);
                    window.__monitorRunning = false;
                    syncStopUI();
                    monitorLog('神识不足，自动循环转入休息阶段（' + config.autoCycle.restMinutes + '分钟后自动重启）', 'warn');
                } else {
                    window.__monitorRunning = false;
                    syncStopUI();
                    monitorLog('神识不足，自动冥想已关闭，脚本停止', 'warn');
                }
                return;
            }

            const useHighLevelMeditate = config.general.highLevelMeditate;
            let instantMeditateOk = false;

            if (useHighLevelMeditate) {
                if (await isMeditatingViaApi()) {
                    monitorLog('已在冥想中，先收功再高级冥想...', 'info');
                    const stopBtn = document.querySelector('.btn-stop-meditate');
                    if (stopBtn) await humanClick(stopBtn);
                    await handleStopMeditateConfirm();
                    await waitMeditateStop(monitorLog);
                }
                monitorLog('尝试高级冥想...', 'info');
                try {
                    const data = await callApi('POST', '/api/game/meditate/instant', { grade: 2 });
                    if (data && (data.code === 0 || data.code === 200)) {
                        instantMeditateOk = true;
                        _lastInstantMeditateTime = Date.now();
                        monitorLog('高级冥想成功，点击冥想修炼...', 'success');
                        await sleep(500);
                        if ((await isMeditatingViaApi()) === false) {
                            await humanClick(document.getElementById('meditateBtn'));
                        }
                        await sleep(500);
                        if (clickButtonByText(document, '收功')) {
                            monitorLog('已点击收功', 'action');
                        }
                        await handleStopMeditateConfirm();
                        await waitMeditateStop(monitorLog);
                        toggleAutoCheckbox(true);
                        applyExploreMultiplier();
                        monitorLog('已勾选自动', 'action');
                    } else {
                        monitorLog('高级冥想失败: ' + (data?.message || '未知原因') + '，转为冥想修炼', 'warn');
                    }
                } catch (e) {
                    monitorLog('高级冥想异常: ' + e.message + '，转为冥想修炼', 'error');
                }
            } else {
                monitorLog('高级冥想已关闭，转为普通冥想...', 'info');
            }

            if (instantMeditateOk) return;

            if (window._autoExploreRunning) {
                window.stopAutoExplore('神识不足', false);
            }
            if ((await isMeditatingViaApi()) === false) {
                await humanClick(document.getElementById('meditateBtn'));
            }
            toggleAutoCheckbox(false);
            // 如果启用了自动循环，转入休息阶段而非完全停止
            if (config.autoCycle.enabled) {
                autoCycleState.restStartTime = Date.now();
                autoCycleState.runStartTime = 0;
                if (autoCycleState.restTimer) clearTimeout(autoCycleState.restTimer);
                const restMs = config.autoCycle.restMinutes * 60 * 1000;
                autoCycleState.restTimer = setTimeout(() => {
                    if (config.autoCycle.refreshPage) {
                        GM_setValue('ling_resume_intent', 'explore');
                        location.reload();
                    } else {
                        autoCycleState.restTimer = null;
                        autoCycleState.restStartTime = 0;
                        autoCycleState.restingSeconds = 0;
                        autoCycleState.runStartTime = Date.now();
                        window.__monitorRunning = true;
                        const btn2 = document.getElementById('monitor-toggle');
                        const statusEl2 = document.getElementById('monitor-status');
                        if (btn2) { btn2.textContent = '停止'; btn2.className = 'mp-btn mp-btn-stop'; }
                        if (statusEl2) {
                            statusEl2.innerHTML = '<span class="mp-status-dot"></span>运行中<span id="daynight-indicator" class="mp-daynight-indicator" style="display:none;"></span>';
                            statusEl2.className = 'mp-status-line status-running';
                        }
                        startMainLoop();
                        toggleAutoCheckbox(true);
                        applyExploreMultiplier();
                        if (config.dayNight.enabled) updateDayNightIndicator(dayNightState.currentIsDay);
                        monitorLog('神识恢复，自动循环重新开始（运行' + config.autoCycle.runMinutes + '分钟）', 'success');
                    }
                }, restMs);
                window.__monitorRunning = false;
                syncStopUI();
                monitorLog('神识不足，自动循环转入休息阶段（' + config.autoCycle.restMinutes + '分钟后自动重启）', 'warn');
            } else {
                window.__monitorRunning = false;
                syncStopUI();
                monitorLog('神识不足，已自动冥想并停止脚本', 'warn');
            }
        }
    }

    // --- 自动循环功能 ---
    function checkAutoCycle() {
        const now = Date.now();

        // 检查探索自动循环
        if (config.autoCycle.enabled) {
            const runMinutes = config.autoCycle.runMinutes;
            const restMinutes = config.autoCycle.restMinutes;

            // 休息中：检查休息是否结束
            if (autoCycleState.restTimer !== null) {
                const elapsedRestSeconds = Math.floor((now - autoCycleState.restStartTime) / 1000);
                const remainingRestSeconds = Math.max(0, (restMinutes * 60) - elapsedRestSeconds);

                if (remainingRestSeconds <= 0) {
                    // 休息结束
                    if (config.autoCycle.refreshPage) {
                        GM_setValue('ling_resume_intent', 'explore');
                        location.reload();
                    } else {
                        clearTimeout(autoCycleState.restTimer);
                        autoCycleState.restTimer = null;
                        autoCycleState.restStartTime = 0;
                        autoCycleState.restingSeconds = 0;
                        autoCycleState.runStartTime = now;

                        window.__monitorRunning = true;
                        const btn = document.getElementById('monitor-toggle');
                        const statusEl = document.getElementById('monitor-status');
                        if (btn) { btn.textContent = '停止'; btn.className = 'mp-btn mp-btn-stop'; }
                        if (statusEl) {
                            statusEl.innerHTML = '<span class="mp-status-dot"></span>运行中<span id="daynight-indicator" class="mp-daynight-indicator" style="display:none;"></span>';
                            statusEl.className = 'mp-status-line status-running';
                        }
                        startMainLoop();
                        toggleAutoCheckbox(true);
                        applyExploreMultiplier();
                        if (config.dayNight.enabled) {
                            updateDayNightIndicator(dayNightState.currentIsDay);
                        }

                        monitorLog(`探索休息结束，重新开始（运行${runMinutes}分钟）`, 'success');
                        if (config.autoCycle.linkSweep) setTimeout(() => startSweep(), 3000);
                    }
                } else {
                    // 更新休息倒计时显示
                    if (autoCycleState.restingSeconds !== elapsedRestSeconds) {
                        autoCycleState.restingSeconds = elapsedRestSeconds;
                        const statusEl2 = document.getElementById('monitor-status');
                        if (statusEl2) {
                            const m = Math.floor(remainingRestSeconds / 60);
                            const s = remainingRestSeconds % 60;
                            statusEl2.innerHTML = `<span class="mp-status-dot"></span>休息中 (${m}:${String(s).padStart(2,'0')})`;
                            statusEl2.className = 'mp-status-line status-paused';
                        }
                    }
                }
            } else if (window.__monitorRunning) {
                // 运行中：检查是否需要进入休息
                if (autoCycleState.runStartTime === 0) {
                    autoCycleState.runStartTime = now;
                    monitorLog(`探索自动循环已启动：运行${runMinutes}分钟后冥想休息${restMinutes}分钟`, 'info');
                }

                const elapsedRunMinutes = Math.floor((now - autoCycleState.runStartTime) / 60000);
                if (elapsedRunMinutes >= runMinutes) {
                    // 运行时间到，进入休息
                    autoCycleState.restStartTime = now;
                    autoCycleState.runStartTime = 0;

                    if (config.autoCycle.linkSweep) stopSweep();
                    window.__monitorRunning = false;
                    hiring = false;
                    shopping = false;
                    toggleAutoCheckbox(false);
                    removeDayNightIndicator();

                    const btn = document.getElementById('monitor-toggle');
                    const statusEl = document.getElementById('monitor-status');
                    if (btn) { btn.textContent = '启动'; btn.className = 'mp-btn mp-btn-start'; }
                    if (statusEl) {
                        statusEl.innerHTML = '<span class="mp-status-dot"></span>已停止';
                        statusEl.className = 'mp-status-line status-stopped';
                    }

                    if (!window.__thRunning) stopMainLoop();

                    // 进入冥想
                    if (config.general.autoMeditate !== false) {
                        const medBtn = document.getElementById('meditateBtn');
                        if (medBtn) {
                            humanClick(medBtn).then(() => {
                                monitorLog(`探索自动循环：运行${runMinutes}分钟到，开始冥想休息${restMinutes}分钟`, 'success');
                            });
                        }
                    }

                    // 设置休息结束定时器
                    autoCycleState.restTimer = setTimeout(() => {
                        // 休息结束
                        if (config.autoCycle.refreshPage) {
                            GM_setValue('ling_resume_intent', 'explore');
                            location.reload();
                        } else {
                            autoCycleState.restTimer = null;
                            autoCycleState.restStartTime = 0;
                            autoCycleState.restingSeconds = 0;
                            autoCycleState.runStartTime = Date.now();

                            window.__monitorRunning = true;
                            const btn2 = document.getElementById('monitor-toggle');
                            const statusEl2 = document.getElementById('monitor-status');
                            if (btn2) { btn2.textContent = '停止'; btn2.className = 'mp-btn mp-btn-stop'; }
                            if (statusEl2) {
                                statusEl2.innerHTML = '<span class="mp-status-dot"></span>运行中<span id="daynight-indicator" class="mp-daynight-indicator" style="display:none;"></span>';
                                statusEl2.className = 'mp-status-line status-running';
                            }
                            startMainLoop();
                            toggleAutoCheckbox(true);
                            applyExploreMultiplier();
                            if (config.dayNight.enabled) {
                                updateDayNightIndicator(dayNightState.currentIsDay);
                            }

                            monitorLog(`探索休息结束，重新开始（运行${runMinutes}分钟）`, 'success');
                            if (config.autoCycle.linkSweep) setTimeout(() => startSweep(), 3000);
                        }
                    }, restMinutes * 60 * 1000);
                } else if (elapsedRunMinutes % 2 === 0) {
                    // 更新剩余时间显示
                    const remaining = runMinutes - elapsedRunMinutes;
                    const statusEl3 = document.getElementById('monitor-status');
                    if (statusEl3 && statusEl3.textContent.includes('运行中')) {
                        const dnIndicator = statusEl3.querySelector('#daynight-indicator');
                        statusEl3.innerHTML = `<span class="mp-status-dot"></span>运行中 (剩余${remaining}分)${dnIndicator ? dnIndicator.outerHTML : ''}`;
                    }
                }
            }
        }

        // 检查寻宝自动循环
        if (config.treasureHunt.autoCycle.enabled) {
            const thRunMinutes = config.treasureHunt.autoCycle.runMinutes;
            const thRestMinutes = config.treasureHunt.autoCycle.restMinutes;

            // 休息中：检查休息是否结束
            if (thAutoCycleState.restTimer !== null) {
                const elapsedRestSeconds = Math.floor((now - thAutoCycleState.restStartTime) / 1000);
                const remainingRestSeconds = Math.max(0, (thRestMinutes * 60) - elapsedRestSeconds);

                if (remainingRestSeconds <= 0) {
                    // 休息结束
                    if (config.treasureHunt.autoCycle.refreshPage) {
                        GM_setValue('ling_resume_intent', 'treasure');
                        location.reload();
                    } else {
                        clearTimeout(thAutoCycleState.restTimer);
                        thAutoCycleState.restTimer = null;
                        thAutoCycleState.restStartTime = 0;
                        thAutoCycleState.restingSeconds = 0;
                        thAutoCycleState.runStartTime = now;

                        window.__thRunning = true;
                        const thBtn = document.getElementById('treasure-toggle');
                        const thStatus = document.getElementById('treasure-status');
                        if (thBtn) { thBtn.textContent = '停止寻宝'; thBtn.className = 'mp-btn mp-btn-treasure-stop'; }
                        if (thStatus) {
                            thStatus.innerHTML = '<span class="mp-status-dot"></span>寻宝中';
                            thStatus.className = 'mp-status-line status-running';
                        }
                        startMainLoop();
                        autoTreasureHunt().catch(e => thLog(`寻宝致命错误: ${e.message}`, 'error'));

                        thLog(`寻宝休息结束，重新开始（运行${thRunMinutes}分钟）`, 'success');
                        if (config.treasureHunt.autoCycle.linkSweep) setTimeout(() => startSweep(), 3000);
                    }
                } else {
                    // 更新休息倒计时显示
                    if (thAutoCycleState.restingSeconds !== elapsedRestSeconds) {
                        thAutoCycleState.restingSeconds = elapsedRestSeconds;
                        const thStatusEl = document.getElementById('treasure-status');
                        if (thStatusEl) {
                            const m = Math.floor(remainingRestSeconds / 60);
                            const s = remainingRestSeconds % 60;
                            thStatusEl.innerHTML = `<span class="mp-status-dot"></span>休息中 (${m}:${String(s).padStart(2,'0')})`;
                            thStatusEl.className = 'mp-status-line status-paused';
                        }
                    }
                }
            } else if (window.__thRunning) {
                // 运行中：检查是否需要进入休息
                if (thAutoCycleState.runStartTime === 0) {
                    thAutoCycleState.runStartTime = now;
                    thLog(`寻宝自动循环已启动：运行${thRunMinutes}分钟后冥想休息${thRestMinutes}分钟`, 'info');
                }

                const elapsedRunMinutes = Math.floor((now - thAutoCycleState.runStartTime) / 60000);
                if (elapsedRunMinutes >= thRunMinutes) {
                    // 运行时间到，进入休息
                    thAutoCycleState.restStartTime = now;
                    thAutoCycleState.runStartTime = 0;

                    if (config.treasureHunt.autoCycle.linkSweep) stopSweep();
                    window.__thRunning = false;
                    const thBtn = document.getElementById('treasure-toggle');
                    const thStatus = document.getElementById('treasure-status');
                    if (thBtn) { thBtn.textContent = '寻宝'; thBtn.className = 'mp-btn mp-btn-treasure'; }
                    if (thStatus) {
                        thStatus.innerHTML = '<span class="mp-status-dot"></span>已停止';
                        thStatus.className = 'mp-status-line status-stopped';
                    }

                    if (!window.__monitorRunning) stopMainLoop();

                    // 进入冥想
                    if (config.treasureHunt.autoMeditate !== false) {
                        const medBtn = document.getElementById('meditateBtn');
                        if (medBtn) {
                            humanClick(medBtn).then(() => {
                                thLog(`寻宝自动循环：运行${thRunMinutes}分钟到，开始冥想休息${thRestMinutes}分钟`, 'success');
                            });
                        }
                    }

                    // 设置休息结束定时器
                    thAutoCycleState.restTimer = setTimeout(() => {
                        // 休息结束
                        if (config.treasureHunt.autoCycle.refreshPage) {
                            GM_setValue('ling_resume_intent', 'treasure');
                            location.reload();
                        } else {
                            thAutoCycleState.restTimer = null;
                            thAutoCycleState.restStartTime = 0;
                            thAutoCycleState.restingSeconds = 0;
                            thAutoCycleState.runStartTime = Date.now();

                            window.__thRunning = true;
                            const thBtn2 = document.getElementById('treasure-toggle');
                            const thStatus2 = document.getElementById('treasure-status');
                            if (thBtn2) { thBtn2.textContent = '停止寻宝'; thBtn2.className = 'mp-btn mp-btn-treasure-stop'; }
                            if (thStatus2) {
                                thStatus2.innerHTML = '<span class="mp-status-dot"></span>寻宝中';
                                thStatus2.className = 'mp-status-line status-running';
                            }
                            startMainLoop();
                            autoTreasureHunt().catch(e => thLog(`寻宝致命错误: ${e.message}`, 'error'));

                            thLog(`寻宝休息结束，重新开始（运行${thRunMinutes}分钟）`, 'success');
                            if (config.treasureHunt.autoCycle.linkSweep) setTimeout(() => startSweep(), 3000);
                        }
                    }, thRestMinutes * 60 * 1000);
                } else if (elapsedRunMinutes % 2 === 0) {
                    // 更新剩余时间显示
                    const remaining = thRunMinutes - elapsedRunMinutes;
                    const thStatusEl = document.getElementById('treasure-status');
                    if (thStatusEl && thStatusEl.textContent.includes('寻宝中')) {
                        thStatusEl.innerHTML = `<span class="mp-status-dot"></span>寻宝中 (剩余${remaining}分)`;
                    }
                }
            }
        }
    }

    // --- 整理储物 ---
    let _lastInstantMeditateTime = 0;
    let _lastMerge = 0;
    async function mergeInventory() {
        const now = Date.now();
        if (now - _lastMerge < 300000) return;
        _lastMerge = now;
        try {
            const r = await callApi('POST', '/api/game/inventory/merge', {});
            if (r?.code === 200) activeLog()('整理储物完成', 'success');
            else activeLog()(`整理储物失败: ${r?.message || '未知错误'}`, 'error');
        } catch {}
    }

    // --- 主循环管理（Web Worker 定时器，后台标签页不被节流） ---
    function startMainLoop() {
        if (window.__mainLoopWorker) return;
        const workerCode = 'setInterval(() => postMessage(1), 500)';
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        window.__mainLoopWorker = new Worker(URL.createObjectURL(blob));
        let _loopBusy = false;
        window.__mainLoopWorker.onmessage = async () => {
            if (_loopBusy) return;
            _loopBusy = true;
            try {
                if (config.autoCycle.enabled || config.treasureHunt.autoCycle.enabled) checkAutoCycle();
                if (!isRunning()) return;
                await checkAllPopups();
                await mergeInventory();
            } catch (e) { console.error('[灵界助手] 主循环异常:', e); }
            finally { _loopBusy = false; }
        };
    }

    function stopMainLoop() {
        if (window.__mainLoopWorker) {
            window.__mainLoopWorker.terminate();
            window.__mainLoopWorker = null;
        }
    }

    // --- 自动勾选"自动"复选框 ---
    function toggleAutoCheckbox(enable) {
        const labels = document.querySelectorAll('.adventure-toggle-label');
        for (const label of labels) {
            if (label.textContent.trim() === '自动') {
                const parent = label.closest('label') || label.parentElement;
                const checkbox = parent ? parent.querySelector('input[type="checkbox"]') : null;
                if (checkbox && checkbox.checked !== enable) {
                    checkbox.checked = enable;
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }
    }

    // --- 应用探索倍率 ---
    function applyExploreMultiplier() {
        const mult = config.general.exploreMultiplier;
        if (!mult || mult <= 1) return;
        // 按钮组方式（新版 UI）
        const btn = document.querySelector(`.explore-multiplier-option[data-value="${mult}"]`);
        if (btn && !btn.classList.contains('active')) {
            btn.click();
            monitorLog(`探索倍率已设置为 ${mult}x`, 'info');
            return;
        }
        // 兼容旧版 select 下拉框
        const sel = document.getElementById('exploreMultiplier');
        if (sel && sel.value !== String(mult)) {
            sel.value = String(mult);
            sel.dispatchEvent(new Event('change'));
            document.getElementById('gameAlertOkBtn')?.click();
            monitorLog(`探索倍率已设置为 ${mult}x`, 'info');
        }
    }

    // --- 等待护道者列表加载 ---
    async function waitForProtectorList(timeout = 8000) {
        await sleep(800);
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (!isRunning()) return 'stopped';
            const count = document.querySelectorAll('.protector-card:not(.protector-card--master)').length;
            const list = document.getElementById('encounterProtectorList');
            const listText = list ? list.textContent : '';
            const hasEmptyText = listText.includes('暂无空闲');

            if (list && hasEmptyText) return 'empty';
            if (count > 0) return 'loaded';
            await sleep(800);
        }
        return 'timeout';
    }

    // --- 辅助: 关闭模态对话框 ---
    async function dismissModal() {
        const btns = document.querySelectorAll('.modal-btn--outline');
        for (const btn of btns) {
            if (btn.offsetParent !== null && btn.textContent.trim().includes('取')) {
                await humanClick(btn);
                break;
            }
        }
    }

    // --- 辅助: 点击雇佣护道按钮 ---
    async function clickHireProtector() {
        const overlay = document.getElementById('encounterOverlay');
        if (overlay) await clickButtonByText(overlay, '雇佣护道');
    }

    // --- 关闭打赏弹窗 ---
    async function dismissTipDialog(timeout = 3000) {
        const modal = document.getElementById('gameDialogModal');
        if (!modal || getComputedStyle(modal).display === 'none' || !modal.textContent.includes('打赏')) {
            return false;
        }
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (!isRunning()) return false;
            const modal = document.getElementById('gameDialogModal');
            if (modal && getComputedStyle(modal).display !== 'none' && modal.textContent.includes('打赏')) {
                const btns = modal.querySelectorAll('button');
                for (const btn of btns) {
                    const t = btn.textContent.trim();
                    if (t === '取 消' || t === '取消') {
                        await humanClick(btn);
                        return true;
                    }
                }
            }
            await sleep(300);
        }
        return false;
    }

    // --- 共享护道者逻辑 ---
    const SUB_REALM_ORDER = {
        '前期': 1, '中期': 2, '后期': 3, '大圆满': 4,
        '一劫仙人': 1, '二劫仙人': 2, '三劫仙人': 3, '四劫仙人': 4,
        '五劫仙人': 5, '六劫仙人': 6, '七劫仙人': 7, '八劫仙人': 8, '九劫仙人': 9,
    };

    function getSubRealmTier(realm) {
        for (const [suffix, tier] of Object.entries(SUB_REALM_ORDER)) {
            if (realm.endsWith(suffix)) return tier;
        }
        return 0;
    }

    function matchProtector(prot, rule) {
        if (rule.nameMatch && !rule.nameMatch.split('|').some(k => prot.name.includes(k))) return false;
        if (rule.excludeName && prot.name.includes(rule.excludeName)) return false;
        if (rule.realmMatch && !rule.realmMatch.split('|').some(k => prot.realm.includes(k))) return false;
        return true;
    }

    function selectProtectors(protectors, priorities) {
        const result = [];
        const seen = new Set();
        function addMatched(matched, label) {
            for (const p of matched) {
                if (seen.has(p.index)) continue;
                seen.add(p.index);
                result.push({ ...p, priority: label });
            }
        }
        for (const rule of priorities) {
            const realmKey = rule.realmMatch;
            const nameKey = rule.nameMatch;
            if (nameKey && nameKey.includes('|')) {
                for (const keyword of nameKey.split('|')) {
                    const matched = protectors.filter(p => p.name.includes(keyword));
                    matched.sort((a, b) => b.attack - a.attack);
                    addMatched(matched, keyword);
                }
            } else if (realmKey && realmKey.includes('|')) {
                for (const keyword of realmKey.split('|')) {
                    const matched = protectors.filter(p => p.realm.includes(keyword));
                    matched.sort((a, b) => {
                        const tierDiff = getSubRealmTier(b.realm) - getSubRealmTier(a.realm);
                        return tierDiff !== 0 ? tierDiff : b.attack - a.attack;
                    });
                    addMatched(matched, keyword);
                }
            } else {
                const matched = protectors.filter(p => matchProtector(p, rule));
                if (realmKey) {
                    matched.sort((a, b) => {
                        const tierDiff = getSubRealmTier(b.realm) - getSubRealmTier(a.realm);
                        return tierDiff !== 0 ? tierDiff : b.attack - a.attack;
                    });
                } else if (rule.sortBy === 'attack') {
                    matched.sort((a, b) => rule.sortOrder === 'asc' ? a.attack - b.attack : b.attack - a.attack);
                }
                addMatched(matched, nameKey || realmKey || 'unknown');
            }
        }
        return result;
    }

    async function refreshAndRecurse(attempt, logFn, retryDelay) {
        dismissModal();
        await sleep(retryDelay);
        if (!isRunning()) return false;
        clickHireProtector();
        await sleep(retryDelay);
        if (!isRunning()) return false;
        const loaded = await waitForProtectorList(8000);
        if (loaded === 'timeout') return false;
        return await findAndHireProtector(attempt + 1, logFn);
    }

    async function findAndHireProtector(attempt, logFn) {
        if (!isRunning()) return false;
        const protectorPriorities = config.protectors.priorities;
        const maxRetries = config.protectors.maxRetries;
        const retryDelay = config.protectors.retryDelayMs;

        const items = document.querySelectorAll('.protector-card:not(.protector-card--master)');
        if (items.length === 0) {
            if (!isRunning()) return false;
            if (attempt < maxRetries) {
                logFn(`[尝试${attempt}] 未找到合适护道者，刷新列表...`, 'action');
                return await refreshAndRecurse(attempt, logFn, retryDelay);
            }
            logFn(`[尝试${attempt}] ${maxRetries}次均未找到合适护道者`, 'error');
            return false;
        }

        const priceThreshold = config.protectors.hirePriceThreshold || 0;
        const wantSolo = config.protectors.hireMode === 'solo';
        const protectors = [];
        items.forEach((item, index) => {
            const nameEl = item.querySelector('.prot-name');
            const realmEl = item.querySelector('.prot-realm');
            const statsEl = item.querySelector('.prot-stats');
            if (!nameEl) return;
            const name = nameEl.textContent.replace(realmEl ? realmEl.textContent : '', '').trim();
            const realm = realmEl ? realmEl.textContent.trim() : '';
            let attack = 0;
            if (statsEl) {
                const atkMatch = statsEl.textContent.match(/攻\s*(\d+)/);
                if (atkMatch) attack = parseInt(atkMatch[1]);
            }
            let price = 0;
            const btns = item.querySelectorAll('.prot-btn');
            for (const btn of btns) {
                const isSoloBtn = btn.classList.contains('prot-btn--solo');
                if (wantSolo === isSoloBtn) {
                    const numMatch = btn.textContent.replace(/\s+/g, '').match(/(\d[\d,]*)$/);
                    if (numMatch) price = parseInt(numMatch[1].replace(/,/g, ''));
                    break;
                }
            }
            protectors.push({ name, realm, attack, index, price });
        });

        let selected = selectProtectors(protectors, protectorPriorities);
        if (priceThreshold > 0 && selected && selected.length > 0) {
            selected = selected.filter(p => {
                if (p.price > priceThreshold) {
                    logFn(`跳过 ${p.name}（${p.realm}），价格${p.price}超过阈值${priceThreshold}`, 'warn');
                    return false;
                }
                return true;
            });
        }
        if (!selected || selected.length === 0) {
            if (!isRunning()) return false;
            if (attempt < maxRetries) {
                logFn(`[尝试${attempt}] 未找到合适护道者，刷新列表...`, 'action');
                return await refreshAndRecurse(attempt, logFn, retryDelay);
            }
            logFn(`[尝试${attempt}] ${maxRetries}次均未找到合适护道者`, 'error');
            return false;
        }

        for (let i = 0; i < selected.length; i++) {
            if (!isRunning()) return false;
            const candidate = selected[i];
            logFn(`[尝试${attempt}] 选择: ${candidate.name} ${candidate.realm} 攻击:${candidate.attack} (${candidate.priority})`, 'info');

            const resp = await withFetchIntercept(_uw, 'encounter-hire-protector', null, async (getCaptured) => {
                if (items[candidate.index]) {
                    const btns = items[candidate.index].querySelectorAll('.prot-btn');
                    const wantSolo = config.protectors.hireMode === 'solo';
                    for (const btn of btns) {
                        const text = btn.textContent.trim();
                        if (wantSolo) {
                            if (text.includes('单独') || text.includes('单 独')) {
                                await humanClick(btn);
                                logFn(` 已点击单独雇佣 ${candidate.name}`, 'action');
                                break;
                            }
                        } else {
                            if (text.includes('协同') || text.includes('协 同')) {
                                await humanClick(btn);
                                logFn(` 已点击协同雇佣 ${candidate.name}`, 'action');
                                break;
                            }
                        }
                    }
                }
                for (let i = 0; i < 40; i++) {
                    await sleep(200);
                    if (!isRunning() || getCaptured()) break;
                }
                return getCaptured();
            });
            if (!isRunning()) return false;

            let hireResult;
            if (!resp) {
                hireResult = { status: 'no_response' };
            } else if (resp.code === 400) {
                hireResult = { status: 'failed', message: resp.message || '雇佣失败' };
            } else {
                hireResult = { status: 'success' };
            }

            if (hireResult.status === 'failed') {
                logFn(` 雇佣失败(code=400): ${hireResult.message}，尝试下一个候选者`, 'warn');
                continue;
            }

            if (hireResult.status === 'success') {
                logFn(' 雇佣成功！', 'success');
                return resp;
            }

            const toast = window.__lastToast || '';
            if (toast) {
                logFn(` 护道者提示: ${toast}`, 'info');
            }
            logFn(' 雇佣完成（无明确响应）', 'warn');
            return resp || true;
        }

        if (!isRunning()) return false;
        if (attempt < maxRetries) {
            logFn(`[尝试${attempt}] 当前列表所有护道者不可用，刷新...`, 'action');
            return await refreshAndRecurse(attempt, logFn, retryDelay);
        }
        logFn(`[尝试${attempt}] ${maxRetries}次尝试均失败`, 'error');
        return false;
    }

    // --- 逃跑逻辑 ---
    let hiring = false;
    let lastEncounterTime = 0;
    async function tryEscape(maxAttempts = 5) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            if (!isRunning()) return false;
            monitorLog(`逃跑尝试 ${attempt}/${maxAttempts}...`, 'action');
            const overlay = document.getElementById('encounterOverlay');
            const clicked = overlay ? clickButtonByText(overlay, '逃跑') : false;
            if (!clicked) {
                monitorLog('未找到逃跑按钮', 'error');
                return false;
            }

            await sleep(800);
            if (!isRunning()) return false;
            const stillVisible = isOverlayVisible('encounterOverlay');
            if (!stillVisible) {
                monitorLog('逃跑成功！', 'success');
                return true;
            }
            monitorLog('逃跑失败，遭遇面板仍在，继续尝试...', 'warn');
            await sleep(500);
        }
        monitorLog(`${maxAttempts}次逃跑均失败`, 'error');
        return false;
    }

    // --- 处理收功确认弹窗 ---
    async function handleStopMeditateConfirm(timeout = 5000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            // 检查确认按钮 (ID: gameDialogConfirmBtn, class: modal-btn--gold)
            const confirmBtn = document.getElementById('gameDialogConfirmBtn');
            if (confirmBtn && confirmBtn.offsetParent !== null) {
                const txt = confirmBtn.textContent.trim();
                if (txt === '确 定' || txt === '确定') {
                    await humanClick(confirmBtn);
                    await sleep(300);
                    return true;
                }
            }
            // 兜底：遍历所有可见的确认按钮
            const modal = document.getElementById('gameDialogModal');
            if (modal && !modal.classList.contains('hidden') && modal.offsetParent !== null) {
                const btns = modal.querySelectorAll('.modal-btn--gold');
                for (const btn of btns) {
                    const txt = btn.textContent.trim();
                    if (txt === '确 定' || txt === '确定') {
                        await humanClick(btn);
                        await sleep(300);
                        return true;
                    }
                }
            }
            await sleep(100);
        }
        return false;
    }

    // --- 等待冥想完全停止 ---
    async function waitMeditateStop(logFn) {
        for (let i = 0; i < 20; i++) {
            await sleep(1500);
            if (!isRunning()) return false;
            const meditating = await isMeditatingViaApi();
            if (meditating === false) return true;
            // meditating === true 或 null（查询失败），继续等待
            const sb = document.querySelector('.btn-stop-meditate');
            if (sb && meditating === true) {
                if (logFn) logFn('检测到重新冥想，再次收功...', 'action');
                await humanClick(sb);
                await handleStopMeditateConfirm();
            }
        }
        return true;
    }

    // --- 昼夜自动切换 ---
    function updateDayNightIndicator(isDay) {
        const el = document.getElementById('daynight-indicator');
        if (!el) return;
        if (isDay === null) { el.style.display = 'none'; return; }
        el.style.display = '';
        el.className = 'mp-daynight-indicator ' + (isDay ? 'day' : 'night');
        el.textContent = isDay ? '白天 - 冥想中' : '夜晚 - 探索中';
    }

    function removeDayNightIndicator() {
        const el = document.getElementById('daynight-indicator');
        if (el) el.style.display = 'none';
    }

    async function switchToExplore() {
        dayNightState.transitioning = true;
        try {
            if (await isMeditatingViaApi()) {
                const stopBtn = document.querySelector('.btn-stop-meditate');
                if (stopBtn) {
                    await humanClick(stopBtn);
                    await handleStopMeditateConfirm();
                    monitorLog('收功中...', 'action');
                    await waitMeditateStop(monitorLog);
                }
            }
            if (!window.__monitorRunning) return;
            toggleAutoCheckbox(true);
            applyExploreMultiplier();
            monitorLog('夜晚降临，开始探索', 'success');
            updateDayNightIndicator(false);
        } finally {
            dayNightState.transitioning = false;
        }
    }

    async function isMeditatingViaApi() {
        try {
            const info = await getPlayerInfo();
            if (info && info.data) return !!info.data.isMeditating;
            return null;
        } catch { return null; }
    }

    async function switchToMeditate() {
        dayNightState.transitioning = true;
        try {
            toggleAutoCheckbox(false);
            if (!window.__monitorRunning) return;
            // 先确认当前是否已在冥想
            if (await isMeditatingViaApi()) {
                monitorLog('已在冥想中', 'info');
                updateDayNightIndicator(true);
                return;
            }
            const medBtn = document.getElementById('meditateBtn');
            if (medBtn) {
                await humanClick(medBtn);
                monitorLog('白天到来，尝试进入冥想...', 'action');
            }
            // 通过接口轮询确认冥想是否真正启动
            for (let i = 0; i < 10; i++) {
                await sleep(500);
                if (!window.__monitorRunning) return;
                // 遭遇面板出现时立即退出，让主循环处理战斗
                if (isOverlayVisible('encounterOverlay')) {
                    dayNightState.lastCheckTime = 0;
                    return;
                }
                if (await isMeditatingViaApi()) {
                    monitorLog('已进入冥想', 'success');
                    updateDayNightIndicator(true);
                    return;
                }
            }
            monitorLog('冥想未成功启动，将在下次检查时重试', 'warn');
            updateDayNightIndicator(true);
        } finally {
            dayNightState.transitioning = false;
        }
    }

    async function handleDayNightTransition(newIsDay) {
        if (newIsDay) {
            await switchToMeditate();
        } else {
            await switchToExplore();
        }
    }

    // --- 启动前校验（虚空淬体、道韵加成、收功） ---
    async function preStartCheck(mode) {
        const logFn = mode === 'monitor' ? monitorLog : thLog;

        const [playerInfo, masterInfo] = await Promise.all([
            getPlayerInfo().catch(() => null),
            getMasterOverview().catch(() => null),
        ]);
        if (playerInfo && playerInfo.data) {
            const d = playerInfo.data;
            if ((d.realmStage === 9 && d.realmLevel >= 6) || d.realmStage > 9) {
                logFn('渡劫六劫及以上不再获得虚空淬体加成', 'info');
            } else if (d.voidBodyBuffExpire) {
                const remain = Math.max(0, Math.round((d.voidBodyBuffExpire - Date.now()) / 1000));
                const h = Math.floor(remain / 3600);
                const m = Math.floor((remain % 3600) / 60);
                const s = remain % 60;
                logFn(`虚空淬体生效中，倍率 x${d.voidBodyBuffMultiplier}，剩余 ${h}时${m}分${s}秒`, 'success');
            } else if (!window._origConfirm('当前没有虚空淬体加成，是否继续？')) {
                return { ok: false };
            }
        }

        const checkDaoyun = mode === 'monitor' ? config.general.checkDaoyun : config.treasureHunt.checkDaoyun;
        if (checkDaoyun && masterInfo && masterInfo.data) {
            if (masterInfo.data.exploreBoostEnabled) {
                logFn('道韵加成已开启', 'success');
            } else if (!window._origConfirm('道韵加成未开启，是否继续？')) {
                return { ok: false };
            }
        }

        // 先初始化昼夜状态，再决定是否收功
        if (config.dayNight.enabled && playerInfo && playerInfo.data) {
            dayNightState.currentIsDay = typeof playerInfo.data.isNight === 'boolean' ? !playerInfo.data.isNight : null;
            dayNightState.lastCheckTime = 0;
        }

        if (playerInfo && playerInfo.data && playerInfo.data.isMeditating) {
            // 白天且启用昼夜模式时，保持冥想不收功
            const shouldKeepMeditating = mode === 'monitor' && config.dayNight.enabled && dayNightState.currentIsDay === true;
            if (shouldKeepMeditating) {
                logFn('白天模式，保持冥想状态', 'info');
            } else {
                const status = document.getElementById(mode === 'monitor' ? 'monitor-status' : 'treasure-status');
                if (status) status.innerHTML = '<span class="mp-status-dot"></span>收功中...';
                logFn('正在收功...', 'action');

                const stopBtn = document.querySelector('.btn-stop-meditate');
                if (stopBtn) await humanClick(stopBtn);
                await handleStopMeditateConfirm();

                const stopOk = await waitMeditateStop(logFn);
                if (!stopOk) return { ok: false };
                logFn('收功完成', 'success');
            }
        }

        return { ok: true, playerInfo };
    }

    // --- 逃跑后处理 ---
    async function handleEscapeResult(escaped, reason, mode = 'monitor') {
        if (!escaped) {
            monitorLog('逃跑失败，继续探索...', 'warn');
            return;
        }
        if (config.protectors.afterEscape === 'stop') {
            if (mode === 'monitor') {
                monitorLog('逃跑成功！点击冥想修炼...', 'success');
                const btns = document.querySelectorAll('button');
                for (const btn of btns) {
                    if (btn.offsetParent !== null && btn.textContent.trim().includes('冥想修炼')) {
                        await humanClick(btn);
                        break;
                    }
                }
                monitorLog(reason || '已逃跑并进入冥想，脚本停止', 'success');
                window.__monitorRunning = false;
                if (!window.__thRunning) stopMainLoop();
                syncStopUI();
            } else {
                thLog('逃跑成功，停止寻宝', 'success');
                syncStopTHUI();
                if (!window.__monitorRunning) stopMainLoop();
            }
        } else {
            const logFn = mode === 'monitor' ? monitorLog : thLog;
            logFn('逃跑成功！继续...', 'success');
        }
    }

    // --- 打印妖兽属性 ---
    function logMonsterInfo(logFn) {
        const name = document.getElementById('encounterMonsterName')?.textContent || '';
        const realm = document.getElementById('encounterMonsterRealm')?.textContent || '';
        const atk = document.getElementById('encounterMonsterAtk')?.textContent || '';
        const hp = document.getElementById('encounterMonsterHp')?.textContent || '';
        if (name) logFn(`遭遇 ${name} (${realm}) 攻:${atk} 血:${hp}`, 'warn');
    }

    // --- 直接迎战 ---
    async function directFight(overlay, logFn) {
        hiring = true;
        try {
            const battleResult = await withFetchIntercept(_uw, 'combat-choice', null, async (getCaptured) => {
                clickButtonByText(overlay, '迎战');
                for (let i = 0; i < 150; i++) {
                    await sleep(200);
                    if (!isRunning() || getCaptured()) break;
                }
                return getCaptured();
            });
            if (battleResult?.data) parseBattleResult(battleResult.data, logFn);
            signalBattleEnd(battleResult);
        } catch (e) {
            logFn('迎战异常: ' + e.message, 'error');
        } finally {
            hiring = false;
        }
    }

    // --- 雇佣护道者主流程 ---
    async function hireProtector(mode = 'monitor') {
        const logFn = mode === 'monitor' ? monitorLog : thLog;

        if (hiring) return;
        if (!isRunning()) return;
        hiring = true;

        try {
            logFn('遭遇妖兽！开始雇佣流程...', 'info');
            logMonsterInfo(logFn);
            if (!isRunning()) return;
            const overlay = document.getElementById('encounterOverlay');
            if (!overlay) {
                logFn('未找到遭遇界面', 'error');
                return;
            }

            const overlayBtns = overlay.querySelectorAll('button');
            const step1 = clickButtonByText(overlay, '雇佣护道');
            if (!step1) {
                logFn('未找到雇佣护道按钮', 'error');
                return;
            }
            logFn('已点击雇佣护道', 'action');
            if (!isRunning()) return;
            const loaded = await waitForProtectorList(8000);
            if (!isRunning()) return;

            if (loaded === 'empty') {
                dismissModal();
                await sleep(800);
                if (!isRunning()) return;

                if (config.protectors.onNoProtector === 'escape') {
                    logFn('暂无空闲护道者，尝试逃跑...', 'info');
                    const escaped = await tryEscape();
                    if (!isRunning()) return;
                    handleEscapeResult(escaped, '已逃跑并进入冥想，脚本停止', mode);
                    return;
                }

                const threshold = config.protectors.fightAttackThreshold;
                if (threshold > 0) {
                    const atkEl = document.getElementById('encounterMonsterAtk');
                    if (atkEl) {
                        const enemyAttack = parseInt(atkEl.textContent);
                        if (enemyAttack > threshold) {
                            logFn(`妖兽攻击${enemyAttack}超过阈值${threshold}，转为逃跑...`, 'warn');
                            if (!isRunning()) return;
                            const escaped = await tryEscape();
                            if (!isRunning()) return;
                            handleEscapeResult(escaped, '妖兽攻击超过阈值，已逃跑并进入冥想，脚本停止', mode);
                            return;
                        }
                    }
                }

                logFn('暂无空闲护道者，选择迎战...', 'info');
                if (!isRunning()) return;
                await directFight(document.getElementById('encounterOverlay'), logFn);
                return;
            }

            if (loaded === 'timeout') {
                logFn('护道者列表加载超时', 'error');
                return;
            }

            const hired = await findAndHireProtector(1, logFn);
            if (!isRunning()) return;
            if (!hired) {
                logFn('雇佣失败，无合适人选', 'error');
                return;
            }

            if (hired?.data) parseBattleResult(hired.data, logFn);
            signalBattleEnd(hired);
        } catch (e) {
            logFn('错误: ' + e.message, 'error');
        } finally {
            hiring = false;
        }
    }

    let _battleEndResolve = null;
    let _pendingBattleResult = undefined;
    function signalBattleEnd(result) {
        if (_battleEndResolve) {
            const r = _battleEndResolve;
            _battleEndResolve = null;
            _pendingBattleResult = undefined;
            r(result);
        } else {
            _pendingBattleResult = result;
        }
    }
    async function waitForBattleEnd(maxWait = 60000) {
        if (_pendingBattleResult !== undefined) {
            const r = _pendingBattleResult;
            _pendingBattleResult = undefined;
            return r;
        }
        const start = Date.now();
        while (Date.now() - start < maxWait) {
            if (!isRunning()) return null;
            if (_pendingBattleResult !== undefined) {
                const r = _pendingBattleResult;
                _pendingBattleResult = undefined;
                return r;
            }
            await sleep(300);
        }
        return null;
    }
    function parseBattleResult(data, logFn) {
        if (!data?.logs) return;
        for (const log of data.logs) {
            const m = log.match(/你击败了\s*(.+?)！获得\s*(\d+)\s*修为.*?(\d+)\s*灵石/);
            if (m) {
                logFn(`击败 ${m[1]}，获得 ${m[2]} 修为，${m[3]} 灵石`, 'success');
                return;
            }
        }
        if (data.status === 'defeat') logFn('战斗失败', 'error');
    }

    // --- 商人逻辑 ---
    let shopping = false;
    let dying = false;
    async function handleMerchant() {
        if (shopping) return;
        if (!isRunning()) return;
        shopping = true;
        try {
            activeLog()('遇到云游商人！', 'info');
            if (!isRunning()) { shopping = false; return; }
            const mcfg = config.merchant;
            const items = document.querySelectorAll('.merchant-item');
            if (items.length === 0) {
                shopping = false;
                return;
            }
            const allItems = [];
            items.forEach(item => {
                const nameEl = item.querySelector('.merchant-item__name');
                const btnEl = item.querySelector('.merchant-item__buy-btn');
                if (!nameEl || !btnEl) return;
                const name = nameEl.textContent.trim();
                const priceMatch = btnEl.textContent.match(/(\d+)/);
                const price = priceMatch ? parseInt(priceMatch[1]) : 0;
                allItems.push({ name, price });
            });

            let bought = null;
            const expensiveItems = allItems.filter(i => i.price > mcfg.highPriceThreshold);
            if (expensiveItems.length > 0) {
                expensiveItems.sort((a, b) => b.price - a.price);
                clickBuyItem(expensiveItems[0].name);
                bought = { ...expensiveItems[0], reason: '高价物品' };
            }
            if (!bought) {
                const itemKeywords = mcfg.itemKeywords || [];
                for (const kw of itemKeywords) {
                    for (const quality of mcfg.stonePriority) {
                        const item = allItems.find(i => i.name.includes(quality) && i.name.includes(kw));
                        if (item) {
                            clickBuyItem(item.name);
                            bought = { ...item, reason: kw };
                            break;
                        }
                    }
                    if (bought) break;
                }
                if (!bought) {
                    for (const kw of itemKeywords) {
                        const item = allItems.find(i => i.name.includes(kw));
                        if (item) {
                            clickBuyItem(item.name);
                            bought = { ...item, reason: kw };
                            break;
                        }
                    }
                }
            }
            if (!bought && mcfg.fallbackToExpensive && allItems.length > 0) {
                const sorted = [...allItems].sort((a, b) => b.price - a.price);
                clickBuyItem(sorted[0].name);
                bought = { ...sorted[0], reason: '最贵物品' };
            }
            if (!bought) {
                activeLog()('无可购买商品，婉拒告辞', 'info');
                const leaveBtn = document.getElementById('merchantLeaveBtn');
                if (leaveBtn) await humanClick(leaveBtn);
            }

            for (let i = 0; i < 10; i++) {
                await sleep(100);
                const stillVisible = document.querySelector('.modal-overlay:not([style*="display: none"]) .merchant-item');
                if (!stillVisible) break;
            }

            const logFn = activeLog();
            logFn('商人物品列表:', 'info');
            allItems.forEach(item => logFn(` ${item.name} (${item.price}灵石)`, 'info'));
            if (bought) {
                logFn(`购买: ${bought.name} (${bought.price}灵石) [${bought.reason}]`, 'success');
            }
            logFn('云游商人已处理', 'success');
        } catch (e) {
            activeLog()('商人错误: ' + e.message, 'error');
        }
        shopping = false;
    }

    async function clickBuyItem(itemName) {
        const itemElements = document.querySelectorAll('.merchant-item');
        for (const el of itemElements) {
            const nameEl = el.querySelector('.merchant-item__name');
            if (nameEl && nameEl.textContent.trim() === itemName) {
                await humanClick(el.querySelector('.merchant-item__buy-btn'));
                return;
            }
        }
    }

    // --- 死亡复活流程 ---
    async function handleDeath() {
        monitorLog('检测到死亡画面，点击引渡归来...', 'info');
        await sleep(300);
        const deathOverlay = document.getElementById('deathOverlay');
        if (!deathOverlay) return;
        const btns = deathOverlay.querySelectorAll('button');
        let revived = false;
        for (const btn of btns) {
            if (btn.textContent.includes('引渡归来')) {
                await humanClick(btn);
                revived = true;
                break;
            }
        }
        if (!revived) return;
        monitorLog('已点击引渡归来，等待复活...', 'action');
        await sleep(800);

        monitorLog('点击地图按钮...', 'action');
        const iconBtns = document.querySelectorAll('.btn-icon');
        for (const btn of iconBtns) {
            if (btn.textContent.includes('地图')) {
                await humanClick(btn);
                break;
            }
        }
        await sleep(1000);

        await withFetchIntercept(_uw, '/api/game/move',
            (data) => data.code === 200 && typeof data.data === 'string',
            async (getCaptured) => {
                const nodes = document.querySelectorAll('.map-node');
                if (nodes.length >= 4) {
                    const nameEl = nodes[3].querySelector('.map-node-name');
                    const mapName = nameEl ? nameEl.textContent.trim() : '第四个地图';
                    monitorLog(`点击第四个地图: ${mapName}...`, 'action');
                    await humanClick(nodes[3]);
                }

                for (let i = 0; i < 25; i++) {
                    await sleep(200);
                    if (getCaptured()) break;
                }

                if (getCaptured()) {
                    monitorLog(getCaptured().data, 'success');
                } else {
                    monitorLog('移动超时，未收到响应', 'warn');
                }
            }
        );
        await sleep(300);

        monitorLog('死亡后流程完成，继续探索...', 'success');
        toggleAutoCheckbox(true);
        applyExploreMultiplier();
    }

    // ==================== 寻宝功能 ====================

    async function getTreasureMapItemId() {
        const resp = await callApi('GET', '/api/game/inventory');
        if (!resp || resp.code !== 200) return null;
        const items = resp.data || [];
        const map = items.find(i => i.name === '藏宝图' && i.quantity > 0);
        if (!map) return null;
        return { itemId: map.itemId || map.id, quantity: map.quantity };
    }

    async function useTreasureMap(itemId) {
        const eventName = '__useItemResult_' + Date.now();
        return await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                window.removeEventListener(eventName, handler);
                reject(new Error('超时'));
            }, 11000);
            const handler = (e) => {
                clearTimeout(timeout);
                window.removeEventListener(eventName, handler);
                resolve(e.detail);
            };
            window.addEventListener(eventName, handler);
            const hook = document.createElement('script');
            hook.textContent = `(async()=>{const eventName=${JSON.stringify(eventName)};let done=false;let watchdog=null;let restore=()=>{};const emit=(detail)=>window.dispatchEvent(new CustomEvent(eventName,{detail}));const finish=(detail)=>{if(done)return;done=true;if(watchdog)clearTimeout(watchdog);restore();emit(detail)};try{const _post=api.post;const _orig=_post.bind(api);restore=()=>{api.post=_post};watchdog=setTimeout(()=>finish({code:-1,message:'超时'}),10000);api.post=function(p,b){if(p==='/api/game/use-item'){b=Object.assign({},b,{quantity:${config.treasureHunt.useQuantity ?? 10}});if(!done){done=true;if(watchdog)clearTimeout(watchdog);restore();try{const r=_orig(p,b);Promise.resolve(r).then(d=>emit(d)).catch(()=>emit({code:-1,message:'请求失败'}));return r}catch(e){emit({code:-1,message:e.message});throw e}}}return _orig(p,b)};await useItem(${JSON.stringify(itemId)})}catch(e){finish({code:-1,message:e.message})}})()`;
            document.head.appendChild(hook);
            hook.remove();
        });
    }

    async function autoTreasureHunt() {
        const thStartTime = Date.now();
        let startMapCount = 0;
        try { const m = await getTreasureMapItemId(); if (m) startMapCount = m.quantity; } catch {}
        thLog('=== 开始自动寻宝 ===', 'success');
        let used = 0, encounterCount = 0, totalXiuwei = 0, totalLingshi = 0;
        const batch = config.treasureHunt.batchSize || Infinity;
        const fixedIntervalMs = config.treasureHunt.intervalMs;
        const useRandomInterval = config.treasureHunt.useRandomInterval;
        const intervalMinMs = config.treasureHunt.intervalMinMs || 1500;
        const intervalMaxMs = config.treasureHunt.intervalMaxMs || 3000;
        const getIntervalMs = useRandomInterval
            ? () => Math.round(intervalMinMs + Math.random() * (intervalMaxMs - intervalMinMs))
            : () => fixedIntervalMs;

        try {
            while (window.__thRunning && used < batch) {
                let mapInfo;
                try {
                    mapInfo = await getTreasureMapItemId();
                } catch (e) {
                    thLog(`获取藏宝图失败: ${e.message}`, 'error');
                    await jitteredSleep(getIntervalMs());
                    continue;
                }
                if (!mapInfo) {
                    thLog('没有更多藏宝图了', 'warn');
                    break;
                }
                if (mapInfo.quantity <= 0) {
                    thLog('藏宝图已用完', 'warn');
                    break;
                }

                thLog(`使用藏宝图 (剩余 ${mapInfo.quantity} 张)...`, 'action');

                const playerInfo = await getPlayerInfo().catch(() => null);
                const isMeditating = playerInfo && playerInfo.data && playerInfo.data.isMeditating;
                if (isMeditating) {
                    thLog('正在收功...', 'action');
                    const stopBtn = document.querySelector('.btn-stop-meditate');
                    if (stopBtn) await humanClick(stopBtn);
                    await handleStopMeditateConfirm();
                    const stopOk = await waitMeditateStop(thLog);
                    if (!stopOk || !window.__thRunning) break;
                    thLog('收功完成', 'success');
                }

                let result;
                try {
                    result = await useTreasureMap(mapInfo.itemId);
                } catch (e) {
                    thLog(`使用失败: ${e.message}`, 'error');
                    await jitteredSleep(getIntervalMs());
                    continue;
                }
                if (!window.__thRunning) break;

                if (!result || result.code !== 200) {
                    const errMsg = result?.message || '未知错误';
                    thLog(`使用失败: ${errMsg}`, 'error');
                    if (errMsg.includes('神识不足')) {
                        thLog('神识不足，停止寻宝', 'warn');
                        break;
                    }
                    if (errMsg.includes('未处理的遇敌')) {
                        thLog('等待遇敌处理...', 'action');
                        // 等待 encounterOverlay 出现
                        for (let i = 0; i < 20; i++) {
                            await sleep(500);
                            if (!window.__thRunning) break;
                            if (isOverlayVisible('encounterOverlay')) break;
                        }
                        // 等待 encounterOverlay 消失（主循环处理完成）
                        for (let i = 0; i < 60; i++) {
                            await sleep(500);
                            if (!window.__thRunning) break;
                            if (!isOverlayVisible('encounterOverlay')) break;
                            // 超时10秒仍未消失，强制重置hiring让主循环重新处理
                            if (i === 20 && hiring) {
                                thLog('遇敌处理超时，重试...', 'warn');
                                hiring = false;
                            }
                        }
                        continue;
                    }
                    await jitteredSleep(getIntervalMs());
                    continue;
                }

                used++;

                const rd = result?.data;
                if (rd) {
                    if (rd.type === 'encounter') {
                        thLog(`进入 ${rd.treasureLevelName || '未知洞府'}`, 'warn');
                    } else {
                        const summary = rd.message || rd.desc || rd.text || (typeof rd === 'string' ? rd : JSON.stringify(rd));
                        thLog(`结果: ${summary}`, 'success');
                    }
                }

                if (isOverlayVisible('encounterOverlay')) {
                    encounterCount++;
                    const battleData = await waitForBattleEnd();
                    if (battleData?.data?.logs) {
                        for (const log of battleData.data.logs) {
                            const m = log.match(/你击败了\s*(.+?)！获得\s*(\d+)\s*修为.*?(\d+)\s*灵石/);
                            if (m) {
                                totalXiuwei += parseInt(m[2]);
                                totalLingshi += parseInt(m[3]);
                                break;
                            }
                        }
                    }
                    if (!window.__thRunning) break;
                } else {
                    thLog('寻宝完成', 'success');
                }

                if (!window.__thRunning) break;
                await jitteredSleep(getIntervalMs());
            }
        } catch (e) {
            thLog(`寻宝异常: ${e.message}`, 'error');
        }

        const elapsed = Math.round((Date.now() - thStartTime) / 1000);
        const em = Math.floor(elapsed / 60), es = elapsed % 60;
        let endMapCount = 0;
        try { const m = await getTreasureMapItemId(); if (m) endMapCount = m.quantity; } catch {}
        thLog(`=== 寻宝结束，藏宝图 ${startMapCount} → ${endMapCount}，共使用 ${used} 次，遭遇 ${encounterCount} 次，获得 ${totalXiuwei} 修为 ${totalLingshi} 灵石，耗时 ${em}分${es}秒 ===`, 'success');
        if (config.dayNight.enabled && window.__monitorRunning) {
            // 寻宝结束后强制触发昼夜校验
            dayNightState.lastCheckTime = 0;
        } else if (config.treasureHunt.autoMeditate !== false && (await isMeditatingViaApi()) === false) {
            await humanClick(document.getElementById('meditateBtn'));
            thLog('已进入冥想', 'success');
        }
        syncStopTHUI();
        if (!window.__monitorRunning) stopMainLoop();
    }

    // ==================== 铭文洗练功能 ====================

    let inscriptionStats = {
        totalPulls: 0,
        keptCount: 0,
        discardedCount: 0,
        bestResult: null,
        startTime: null,
    };

    let cachedInscriptionSlots = [];
    let cachedTotalSlotCount = 0;

    function updateInscriptionStatusUI(status) {
        const statusEl = document.getElementById('inscription-status');
        if (!statusEl) return;

        switch (status) {
            case 'running':
                statusEl.innerHTML = '<span class="mp-status-dot"></span>洗练中';
                statusEl.className = 'mp-status-line status-running';
                break;
            case 'paused':
                statusEl.innerHTML = '<span class="mp-status-dot"></span>暂停';
                statusEl.className = 'mp-status-line status-paused';
                break;
            case 'discarding':
                statusEl.innerHTML = '<span class="mp-status-dot"></span>放弃中';
                statusEl.className = 'mp-status-line status-discarding';
                break;
            case 'idle':
            default:
                statusEl.innerHTML = '<span class="mp-status-dot"></span>待命';
                statusEl.className = 'mp-status-line status-idle';
                break;
        }
    }

    function updateInscriptionStatsDisplay() {
        const totalEl = document.getElementById('inscription-stat-total');
        const keptEl = document.getElementById('inscription-stat-kept');
        const bestEl = document.getElementById('inscription-stat-best');

        if (totalEl) totalEl.textContent = inscriptionStats.totalPulls;
        if (keptEl) keptEl.textContent = inscriptionStats.keptCount;
        if (bestEl && inscriptionStats.bestResult) {
            bestEl.textContent = `${inscriptionStats.bestResult.stat}+${inscriptionStats.bestResult.value}`;
        }
    }

    function parseInscriptionResultCards() {
        const grid = document.querySelector('.insc-result-grid');
        if (!grid) return [];

        const cards = grid.querySelectorAll('.insc-result-card');
        const results = [];

        cards.forEach(card => {
            const qualityEl = card.querySelector('.insc-result-card__quality');
            const statEl = card.querySelector('.insc-result-card__stat');
            const valueEl = card.querySelector('.insc-result-card__value');

            if (!statEl || !valueEl) return;

            const quality = qualityEl ? qualityEl.textContent.trim() : '';
            const stat = statEl.textContent.trim();
            const valueText = valueEl.textContent.trim();
            const value = parseInt(valueText.replace(/[+]/g, '')) || 0;

            results.push({
                quality,
                stat,
                value,
                element: card,
                rawText: `${quality ? quality + ' ' : ''}${stat} +${value}`
            });
        });

        return results;
    }

    function checkInscriptionTargetMet(results) {
        const inscriptionConfig = config.inscription;

        if (inscriptionConfig.targetStats.length === 0) {
            return { met: true, matches: [], reason: '无目标' };
        }

        const matches = [];
        for (const result of results) {
            for (const target of inscriptionConfig.targetStats) {
                if (result.stat.includes(target.stat)) {
                    if (!target.minValue || result.value >= target.minValue) {
                        matches.push({
                            card: result,
                            target: target.stat,
                            stat: result.stat,
                            quality: result.quality,
                            value: result.value,
                            required: target.minValue || 0
                        });
                        break;
                    }
                }
            }
        }

        const uniqueMatches = [];
        const seenCards = new Set();
        for (const match of matches) {
            if (!seenCards.has(match.card.rawText)) {
                seenCards.add(match.card.rawText);
                uniqueMatches.push(match);
            }
        }

        let met = false;
        if (inscriptionConfig.stopMode === 'any') {
            met = uniqueMatches.length > 0;
        } else if (inscriptionConfig.stopMode === 'all') {
            const matchedStats = new Set(uniqueMatches.map(m => m.target));
            const requiredStats = new Set(inscriptionConfig.targetStats.filter(t => t.minValue > 0).map(t => t.stat));
            met = [...requiredStats].every(s => matchedStats.has(s));
        }

        const reason = met ? '目标达成' : (uniqueMatches.length > 0 ? `部分匹配(${uniqueMatches.length})` : '无匹配');

        return { met, matches: uniqueMatches, reason };
    }


    async function clickInscriptionPull() {
        const pullCount = config.inscription.pullCount || 10;

        // 根据次数确定按钮文本
        let targetText;
        if (pullCount === 100) {
            targetText = '百连灵纹';
        } else {
            targetText = '十连灵纹';
        }

        const buttons = document.querySelectorAll('.modal-action-btn__text');
        for (const btn of buttons) {
            if (btn.textContent.trim() === targetText) {
                const clickTarget = btn.closest('button') || btn;
                await humanClick(clickTarget);
                return true;
            }
        }

        // 兜底：尝试其他可能的按钮文本
        const fallbackTexts = pullCount === 100
            ? ['百连', '百连灵纹']
            : ['十连', '十连灵纹'];

        for (const fallbackText of fallbackTexts) {
            for (const btn of buttons) {
                if (btn.textContent.trim().includes(fallbackText)) {
                    const clickTarget = btn.closest('button') || btn;
                    await humanClick(clickTarget);
                    return true;
                }
            }
        }

        return false;
    }

    async function clickInscriptionDiscardAll() {
        const buttons = document.querySelectorAll('button.modal-btn--outline');
        for (const btn of buttons) {
            const txt = btn.textContent.trim();
            if (txt === '全部放弃' || txt === '一键放弃') {
                await humanClick(btn);
                inscriptionLog(`已点击「${txt}」`, 'action');
                return true;
            }
        }
        const allBtns = document.querySelectorAll('button');
        for (const btn of allBtns) {
            const txt = btn.textContent.trim();
            if (btn.onclick && btn.onclick.toString().includes('discardAllInscriptionsFromTenPull')) {
                await humanClick(btn);
                inscriptionLog('已点击「全部放弃」（onclick匹配）', 'action');
                return true;
            }
            if (txt === '一键放弃') {
                await humanClick(btn);
                inscriptionLog('已点击「一键放弃」（文本匹配）', 'action');
                return true;
            }
        }
        return false;
    }

    async function handleInscriptionDiscardConfirmDialog(timeout = 500) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (!window.__inscriptionRunning) return false;
            const confirmBtnById = document.getElementById('gameDialogConfirmBtn');
            const cancelBtnById = document.getElementById('gameDialogCancelBtn');
            if (confirmBtnById && cancelBtnById) {
                const cText = confirmBtnById.textContent.trim();
                if (cText === '确 定' || cText === '确定') {
                    inscriptionLog('确认弹窗，点击「确定」', 'action');
                    await humanClick(confirmBtnById);
                    return true;
                }
            }

            const btnRows = document.querySelectorAll('.modal-btn-row');
            for (const row of btnRows) {
                const cancelBtn = row.querySelector('#gameDialogCancelBtn, .modal-btn--outline');
                const confirmBtn = row.querySelector('#gameDialogConfirmBtn, .modal-btn--gold');
                const cancelText = cancelBtn ? cancelBtn.textContent.trim() : '';
                const confirmText = confirmBtn ? confirmBtn.textContent.trim() : '';
                if ((cancelText === '取 消' || cancelText === '取消') &&
                    (confirmText === '确 定' || confirmText === '确定')) {
                    inscriptionLog('确认弹窗，点击「确定」', 'action');
                    await humanClick(confirmBtn);
                    return true;
                }
            }
            await sleep(100);
        }
        return true;
    }

    async function waitForInscriptionResultGrid(timeout = 8000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (!window.__inscriptionRunning) return false;
            const grid = document.querySelector('.insc-result-grid');
            if (grid && grid.children.length > 0) {
                await sleep(config.inscription.resultAnimationMs);
                return true;
            }
            await sleep(300);
        }
        return false;
    }

    async function waitForInscriptionResultGridGone(timeout = 10000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (!window.__inscriptionRunning) return false;
            const grid = document.querySelector('.insc-result-grid');
            if (!grid || grid.children.length === 0 || grid.offsetParent === null) {
                return true;
            }
            await sleep(300);
        }
        return false;
    }

    // 处理铭文确认弹窗（百连专用）
    async function handleInscriptionConfirmDialog(timeout = 5000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (!window.__inscriptionRunning) return false;

            // 检查确认按钮
            const confirmBtn = document.getElementById('gameDialogConfirmBtn');
            if (confirmBtn && confirmBtn.offsetParent !== null) {
                const txt = confirmBtn.textContent.trim();
                if (txt === '确 定' || txt === '确定') {
                    inscriptionLog('点击铭文确认「确定」', 'action');
                    await humanClick(confirmBtn);
                    await sleep(500);
                    return true;
                }
            }

            // 兜底：检查 modal-btn--gold 按钮
            const modal = document.getElementById('gameDialogModal');
            if (modal && !modal.classList.contains('hidden') && modal.offsetParent !== null) {
                const modalText = modal.innerText || modal.textContent || '';
                if (modalText.includes('铭文确认') || modalText.includes('百连抽将消耗')) {
                    const btns = modal.querySelectorAll('.modal-btn--gold');
                    for (const btn of btns) {
                        const btnTxt = btn.textContent.trim();
                        if (btnTxt === '确 定' || btnTxt === '确定') {
                            inscriptionLog('点击铭文确认「确定」', 'action');
                            await humanClick(btn);
                            await sleep(500);
                            return true;
                        }
                    }
                }
            }

            await sleep(100);
        }
        return false;
    }

    async function waitForInscriptionPullButton(timeout = 8000) {
        const pullCount = config.inscription.pullCount || 10;

        // 根据次数确定按钮文本
        let targetTexts;
        if (pullCount === 100) {
            targetTexts = ['百连灵纹', '百连'];
        } else {
            targetTexts = ['十连灵纹', '十连'];
        }

        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (!window.__inscriptionRunning) return false;
            const buttons = document.querySelectorAll('.modal-action-btn__text');
            for (const btn of buttons) {
                const btnText = btn.textContent.trim();
                for (const targetText of targetTexts) {
                    if (btnText === targetText || btnText.includes(targetText)) {
                        const parentBtn = btn.closest('button');
                        if (parentBtn && !parentBtn.disabled && parentBtn.offsetParent !== null) {
                            return true;
                        }
                    }
                }
            }
            await sleep(500);
        }
        return false;
    }

    function matchesAnyTarget(stat) {
        return (config.inscription.targetStats || []).some(t => stat.includes(t.stat));
    }

    function describeMatch(m) {
        return `${m.quality ? m.quality + '·' : ''}${m.stat}+${m.value}`;
    }

    function checkAllSlotsMeetTargets(slots) {
        if (!slots) slots = readMainPanelSlots();
        if (slots.length === 0) return { met: false, reason: '无法读取槽位' };

        if (hasEmptySlots()) {
            return { met: false, reason: '仍有空槽位未铭刻' };
        }

        const targets = config.inscription.targetStats;
        if (!targets || targets.length === 0) return { met: false, reason: '无目标配置' };

        for (const slot of slots) {
            const matchingTarget = targets.find(t => slot.stat.includes(t.stat));
            if (!matchingTarget) {
                return { met: false, reason: `${slot.fullText} 不匹配任何目标` };
            }
            if (matchingTarget.minValue && slot.value < matchingTarget.minValue) {
                return { met: false, reason: `${slot.fullText} 低于要求 ≥${matchingTarget.minValue}` };
            }
        }

        return { met: true, reason: '全部槽位已满足目标' };
    }

    async function inscriptionSleep(ms) {
        if (!window.__inscriptionRunning) return false;
        await sleep(ms);
        return window.__inscriptionRunning;
    }

    async function clickDetailViewButton() {
        const container = document.getElementById('customModal') || document;
        const buttons = container.querySelectorAll('button');
        for (const btn of buttons) {
            if (btn.textContent.trim() === '查看详情' && btn.offsetParent !== null) {
                await humanClick(btn);
                return true;
            }
        }
        return false;
    }

    function readMainPanelSlots() {
        const slots = [];
        const container = document.getElementById('customModal') || document;
        const spans = container.querySelectorAll('span');
        for (const s of spans) {
            const txt = s.textContent.trim();
            const m = txt.match(/^槽位\d+:\s*(.+?)\s*\+(\d+)$/);
            if (m) {
                const parts = m[1].split('·');
                slots.push({
                    quality: parts.length > 1 ? parts[0] : '',
                    stat: parts.length > 1 ? parts[1] : parts[0],
                    value: parseInt(m[2]) || 0,
                    fullText: txt
                });
            }
        }
        if (slots.length > 0) return slots;
        if (cachedInscriptionSlots.length > 0) return cachedInscriptionSlots;
        return slots;
    }

    function hasEmptySlots() {
        // 优先用缓存的槽位总数对比已填数
        if (cachedTotalSlotCount > 0) {
            const filled = readMainPanelSlots();
            return filled.length < cachedTotalSlotCount;
        }
        // 兜底：直接查 DOM
        const container = document.getElementById('customModal') || document;
        for (const s of container.querySelectorAll('span')) {
            if (s.textContent.trim().match(/^槽位\d+:\s*空$/)) return true;
        }
        for (const v of container.querySelectorAll('.insc-slot-btn__value')) {
            if (v.textContent.trim() === '空') return true;
        }
        return false;
    }

    function shouldInscribeFromMainPanel(quality, stat, value) {
        const slots = readMainPanelSlots();
        if (slots.length === 0) return { action: 'proceed', reason: '无法读取槽位' };

        if (hasEmptySlots()) {
            return { action: 'proceed', reason: '有空槽位' };
        }

        for (const slot of slots) {
            if (!matchesAnyTarget(slot.stat)) {
                return { action: 'proceed', reason: `${slot.fullText} 不匹配目标，可替换` };
            }
        }

        let lowest = slots[0];
        for (const slot of slots) {
            if (slot.value < lowest.value) lowest = slot;
        }
        if (value > lowest.value) {
            return { action: 'proceed', reason: `替换最低值 ${lowest.fullText}` };
        }

        return { action: 'skip', reason: `${describeMatch({quality, stat, value})} 不高于最低值 ${lowest.value}` };
    }

    async function autoInscribeFromDetailView(quality, stat, value) {
        const targetNameFull = (quality ? quality + '·' : '') + stat;
        const items = document.querySelectorAll('.insc-pending-item');
        for (const item of items) {
            const nameEl = item.querySelector('.insc-pending-item__name');
            const valueEl = item.querySelector('.insc-pending-item__value');
            if (!nameEl || !valueEl) continue;
            const itemName = nameEl.textContent.trim();
            const itemValue = parseInt(valueEl.textContent.replace(/[^0-9]/g, '')) || 0;
            const nameMatch = itemName === targetNameFull || itemName.endsWith('·' + stat);
            if (nameMatch && itemValue === value) {
                if (!item.classList.contains('insc-pending-item--expanded')) {
                    await humanClick(item);
                    if (!window.__inscriptionRunning) return false;
                    const deadline = Date.now() + 1000;
                    while (Date.now() < deadline) {
                        await sleep(100);
                        if (item.classList.contains('insc-pending-item--expanded')) break;
                        if (!window.__inscriptionRunning) return false;
                    }
                }
                const slotBtns = item.querySelectorAll('.insc-slot-btn');
                let targetBtn = null;
                let targetReason = '';
                let lowestMatchBtn = null;
                let lowestMatchValue = Infinity;

                for (const btn of slotBtns) {
                    const valSpan = btn.querySelector('.insc-slot-btn__value');
                    if (!valSpan) continue;
                    const slotText = valSpan.textContent.trim();
                    if (slotText === '空') {
                        targetBtn = btn;
                        targetReason = '空槽位';
                        break;
                    }
                    const m = slotText.match(/[·.](\D+?)\s*\+(\d+)/);
                    if (!m) continue;
                    const slotStat = m[1];
                    const slotVal = parseInt(m[2]) || 0;
                    if (!matchesAnyTarget(slotStat)) {
                        targetBtn = btn;
                        targetReason = `${slotText} 不匹配目标`;
                        break;
                    }
                    if (slotVal < lowestMatchValue) {
                        lowestMatchValue = slotVal;
                        lowestMatchBtn = btn;
                    }
                }
                if (!targetBtn && lowestMatchBtn && value > lowestMatchValue) {
                    targetBtn = lowestMatchBtn;
                    targetReason = `替换最低值 +${lowestMatchValue}`;
                }
                if (targetBtn) {
                    inscriptionLog(`自动铭刻: 铭刻到槽位 (${targetReason})`, 'action');
                    await humanClick(targetBtn);
                    if (!window.__inscriptionRunning) return false;
                    await handleInscriptionDiscardConfirmDialog();
                    inscriptionLog('自动铭刻: 确认铭刻', 'success');
                    if (!await inscriptionSleep(500)) return false;
                    return true;
                }
                inscriptionLog('自动铭刻: 无空槽位且无需替换', 'info');
                return false;
            }
        }
        return false;
    }

    async function performInscriptionDiscard() {
        if (!window.__inscriptionRunning) return false;

        updateInscriptionStatusUI('discarding');
        inscriptionLog('开始放弃流程...', 'action');

        const discarded = clickInscriptionDiscardAll();
        if (!discarded) {
            inscriptionLog('未找到放弃按钮，跳过', 'info');
            updateInscriptionStatusUI('running');
            return true;
        }

        if (!await inscriptionSleep(500)) return false;
        await handleInscriptionDiscardConfirmDialog();
        inscriptionLog('已确认放弃', 'success');

        if (!await inscriptionSleep(300)) return false;

        inscriptionStats.discardedCount++;
        inscriptionLog(`已放弃 (累计: ${inscriptionStats.discardedCount}) | 等待 ${config.inscription.discardDelayMs/1000}s`, 'info');
        if (!await inscriptionSleep(config.inscription.discardDelayMs)) return false;

        updateInscriptionStatusUI('running');
        return true;
    }

    async function performInscriptionKeep(results, matches) {
        inscriptionLog('发现符合要求的铭文！', 'success');
        matches.forEach(m => {
            inscriptionLog(`  ✓ ${m.target} +${m.value} (要求≥${m.required})${m.quality ? ' [' + m.quality + ']' : ''}`, 'success');
        });

        const sortedMatches = [...matches].sort((a, b) => b.value - a.value);
        const best = sortedMatches[0];
        if (best) {
            inscriptionLog(`  最佳: ${best.stat} +${best.value}${best.quality ? ' [' + best.quality + ']' : ''}`, 'success');
            if (!inscriptionStats.bestResult || best.value > inscriptionStats.bestResult.value) {
                inscriptionStats.bestResult = { quality: best.quality, stat: best.stat, value: best.value };
            }
        }

        inscriptionStats.keptCount++;
        updateInscriptionStatsDisplay();

        if (config.inscription.notifyOnComplete && Notification.permission === 'granted') {
            const pullCount = config.inscription.pullCount || 10;
            const pullName = pullCount === 100 ? '百连' : '十连';
            new Notification('铭文洗练完成', {
                body: `第${inscriptionStats.totalPulls}次${pullName}达成！${sortedMatches.map(m => `${m.target}+${m.value}`).join(', ')}`,
                icon: 'https://ling.muge.info/favicon.ico'
            });
        }

        if (config.inscription.autoInscribe && sortedMatches.length > 0) {
            let inscribedCount = 0;

            for (const match of sortedMatches) {
                if (!window.__inscriptionRunning) return;

                const check = shouldInscribeFromMainPanel(match.quality, match.stat, match.value);
                if (check.action === 'skip') {
                    inscriptionLog(`自动铭刻: 跳过 ${describeMatch(match)} — ${check.reason}`, 'info');
                    continue;
                }

                inscriptionLog(`自动铭刻: 铭刻 ${describeMatch(match)} (${check.reason})`, 'action');
                const detailClicked = await clickDetailViewButton();
                if (detailClicked) {
                    if (!await inscriptionSleep(800)) return;
                }

                const inscribed = await autoInscribeFromDetailView(match.quality, match.stat, match.value);
                if (inscribed) {
                    inscriptionLog(`自动铭刻: 已铭刻 ${describeMatch(match)}`, 'success');
                    inscribedCount++;
                    await inscriptionSleep(1500);
                } else {
                    inscriptionLog(`自动铭刻: ${describeMatch(match)} 无可用槽位`, 'warn');
                }
            }

            if (inscribedCount > 0) {
                updateInscriptionStatsDisplay();
            }

            await performInscriptionDiscard();
        }
    }

    async function startInscriptionPulling() {
        if (window.__inscriptionRunning) {
            inscriptionLog('洗练已在运行中', 'warn');
            return;
        }

        inscriptionStats = {
            totalPulls: 0,
            keptCount: 0,
            discardedCount: 0,
            bestResult: null,
            startTime: Date.now(),
        };
        updateInscriptionStatsDisplay();

        window.__inscriptionRunning = true;
        window.__inscriptionPaused = false;
        updateInscriptionStatusUI('running');

        const pullCount = config.inscription.pullCount || 10;
        const pullName = pullCount === 100 ? '百连' : '十连';

        inscriptionLog(`=== 开始铭文洗练 ===`, 'success');
        inscriptionLog(`抽取: ${pullName}`, 'info');

        inscriptionLog(`目标: ${config.inscription.targetStats.map(t => `${t.stat}≥${t.minValue || 0}`).join(', ')}`, 'info');
        inscriptionLog(`模式: ${config.inscription.stopMode === 'any' ? '任一满足' : (config.inscription.stopMode === 'all' ? '全部满足' : '永不停')}`, 'info');

        try {
            while (window.__inscriptionRunning) {
                if (window.__inscriptionPaused) {
                    await sleep(1000);
                    continue;
                }

                if (config.inscription.maxAttempts > 0 && inscriptionStats.totalPulls >= config.inscription.maxAttempts) {
                    inscriptionLog(`达到最大次数 ${config.inscription.maxAttempts}，停止`, 'warn');
                    break;
                }

                if (config.inscription.autoCloseDialogs) {
                    const gridGone = await waitForInscriptionResultGridGone(5000);
                    if (!gridGone) {
                        const closeBtns = document.querySelectorAll('.modal-close, .btn-close, [class*="close-btn"]');
                        for (const btn of closeBtns) {
                            if (btn.offsetParent !== null) {
                                await humanClick(btn);
                                break;
                            }
                        }
                        await sleep(500);
                    }
                }

                const btnAvailable = await waitForInscriptionPullButton(5000);
                if (!btnAvailable) {
                    const pullCountVal = config.inscription.pullCount || 10;
                    const pullName = pullCountVal === 100 ? '百连' : '十连';
                    inscriptionLog(`${pullName}按钮不可用，请检查材料`, 'error');
                    await sleep(3000);
                    continue;
                }

                cachedInscriptionSlots = readMainPanelSlots();
                {
                    const container = document.getElementById('customModal') || document;
                    let count = 0;
                    for (const s of container.querySelectorAll('span')) {
                        if (s.textContent.trim().match(/^槽位\d+:/)) count++;
                    }
                    if (count > 0) cachedTotalSlotCount = count;
                }

                if (inscriptionStats.totalPulls > 0) {
                    const slotsCheck = checkAllSlotsMeetTargets(cachedInscriptionSlots);
                    if (slotsCheck.met) {
                        inscriptionLog(`所有槽位已满足目标，停止`, 'success');
                        break;
                    }
                }

                const clicked = await clickInscriptionPull();
                if (!clicked) {
                    const pullCountVal2 = config.inscription.pullCount || 10;
                    const pullName = pullCountVal2 === 100 ? '百连' : '十连';
                    inscriptionLog(`未找到${pullName}按钮`, 'error');
                    await sleep(3000);
                    continue;
                }

                // 处理百连确认弹窗
                const pullCountVal3 = config.inscription.pullCount || 10;
                if (pullCountVal3 === 100) {
                    inscriptionLog('等待铭文确认弹窗...', 'info');
                    const confirmHandled = await handleInscriptionConfirmDialog();
                    if (!confirmHandled) {
                        inscriptionLog('铭文确认弹窗处理失败', 'error');
                        await sleep(3000);
                        continue;
                    }
                }

                inscriptionStats.totalPulls++;
                inscriptionLog(`--- 第 ${inscriptionStats.totalPulls} 次 ---`, 'action');

                const appeared = await waitForInscriptionResultGrid(8000);
                if (!appeared) {
                    inscriptionLog('等待结果超时', 'error');
                    continue;
                }

                const results = parseInscriptionResultCards();
                if (results.length === 0) {
                    inscriptionLog('解析失败，尝试放弃...', 'error');
                    await performInscriptionDiscard();
                    continue;
                }

                const summary = results.map(r => `${r.stat}+${r.value}`).join(' ');
                inscriptionLog(summary, 'info');

                const { met, matches, reason } = checkInscriptionTargetMet(results);

                if (met) {
                    await performInscriptionKeep(results, matches);
                    if (config.inscription.autoInscribe) {
                        continue;
                    }
                    break;
                } else {
                    inscriptionLog(`无符合 (${reason})，执行放弃`, 'warn');
                    if (matches.length > 0) {
                        matches.forEach(m => inscriptionLog(`  ~ ${m.target}+${m.value} (不满足≥${m.required})`, 'warn'));
                    }
                    await performInscriptionDiscard();
                }

                updateInscriptionStatsDisplay();
            }
        } catch (e) {
            inscriptionLog('出错: ' + e.message, 'error');
            console.error(e);
        } finally {
            window.__inscriptionRunning = false;
            window.__inscriptionPaused = false;
            updateInscriptionStatusUI('idle');
            const toggleBtn = document.getElementById('inscription-toggle');
            if (toggleBtn) { toggleBtn.textContent = '开始洗练'; toggleBtn.className = 'mp-btn mp-btn-start'; }

            const elapsed = inscriptionStats.startTime ? Math.round((Date.now() - inscriptionStats.startTime) / 1000) : 0;
            inscriptionLog(`=== 结束 | ${inscriptionStats.totalPulls}次 | 达成${inscriptionStats.keptCount} | ${Math.floor(elapsed/60)}分${elapsed%60}秒 ===`, 'info');
            if (inscriptionStats.bestResult) {
                inscriptionLog(`最佳: ${inscriptionStats.bestResult.stat}+${inscriptionStats.bestResult.value}`, 'success');
            }
        }
    }

    function stopInscriptionPulling() {
        window.__inscriptionRunning = false;
        window.__inscriptionPaused = false;
        inscriptionLog('手动停止', 'warn');
    }

    function pauseInscriptionPulling() {
        window.__inscriptionPaused = !window.__inscriptionPaused;
        if (window.__inscriptionPaused) {
            inscriptionLog('已暂停', 'warn');
            updateInscriptionStatusUI('paused');
        } else {
            inscriptionLog('已恢复', 'info');
            updateInscriptionStatusUI('running');
        }
    }

    function syncStopInscriptionUI() {
        const btn = document.getElementById('inscription-toggle');
        const status = document.getElementById('inscription-status');
        if (btn) { btn.textContent = '开始洗练'; btn.className = 'mp-btn mp-btn-start'; }
        if (status) {
            status.innerHTML = '<span class="mp-status-dot"></span>待命';
            status.className = 'mp-status-line status-idle';
        }
    }

    // ==================== 扫荡功能 ====================

    let _sweepState = { running: false, stopRequested: false, sweepCount: 0, token: 0,
        totalMaps: 0, bestFloor: 0, totalCost: 0, startTime: 0 };
    window.__sweepRunning = false;

    function formatLingShi(num) {
        const n = Number(num) || 0;
        if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿';
        if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
        return n.toFixed(0);
    }

    function syncSweepStopUI() {
        const btn = document.getElementById('sweep-toggle');
        const status = document.getElementById('sweep-status');
        if (btn) { btn.textContent = '扫荡'; btn.className = 'mp-btn mp-btn-start'; }
        if (status) {
            status.innerHTML = '<span class="mp-status-dot"></span>待命';
            status.className = 'mp-status-line status-idle';
        }
    }

    async function performSweep(token) {
        try {
            // 1. 获取试练塔信息（读取扫荡消耗 nextRefreshCost）
            const infoRes = await callApi('GET', '/api/trial-tower/info');
            if (token !== _sweepState.token || !_sweepState.running) return { cost: 0, gainMap: 0, reachedFloor: 0 };
            if (!infoRes || infoRes.code !== 200 || !infoRes.data) {
                sweepLog(`获取试练塔信息失败 (code=${infoRes?.code})`, 'error');
                _sweepState.running = false;
                window.__sweepRunning = false;
                syncSweepStopUI();
                return { cost: 0, gainMap: 0, reachedFloor: 0 };
            }

            const cost = infoRes.data.nextRefreshCost ?? 0;
            if (cost === 0) {
                sweepLog('nextRefreshCost 为 0，可能无法扫荡', 'warn');
            }

            // 2. 执行扫荡
            const sweepRes = await callApi('POST', '/api/trial-tower/sweep', {});
            if (token !== _sweepState.token || !_sweepState.running) return { cost, gainMap: 0, reachedFloor: 0 };

            if (!sweepRes || sweepRes.code !== 200) {
                const errMsg = sweepRes?.message || '未知错误';
                sweepLog(`扫荡失败: ${errMsg}`, 'error');
                _sweepState.running = false;
                window.__sweepRunning = false;
                syncSweepStopUI();
                return { cost, gainMap: 0, reachedFloor: 0 };
            }

            _sweepState.sweepCount++;
            let reachedFloor = sweepRes.data?.reachedFloor ?? 0;
            if (reachedFloor === 0) {
                const infoRes2 = await callApi('GET', '/api/trial-tower/info');
                if (infoRes2?.code === 200 && infoRes2.data) {
                    reachedFloor = infoRes2.data.activeFloor || 0;
                }
            }

            let gainMap = 0;
            if (sweepRes.data?.rewardMaps !== undefined && sweepRes.data?.rewardMaps !== null) {
                gainMap = sweepRes.data.rewardMaps;
            } else if (sweepRes.data?.treasureMap) {
                gainMap = sweepRes.data.treasureMap;
            } else if (sweepRes.data?.treasureMapCount) {
                gainMap = sweepRes.data.treasureMapCount;
            } else if (sweepRes.data?.items) {
                const mapItem = sweepRes.data.items.find(i => i.name === '藏宝图' || i.id === 'treasure_map');
                if (mapItem) gainMap = mapItem.count || mapItem.amount || 0;
            }

            sweepLog(`第${_sweepState.sweepCount}次扫荡完成 | 抵达第 ${reachedFloor} 层${gainMap > 0 ? ' | 藏宝图+' + gainMap : ''}`, 'success');
            return { cost, gainMap, reachedFloor };
        } catch (e) {
            if (token !== _sweepState.token || !_sweepState.running) return { cost: 0, gainMap: 0, reachedFloor: 0 };
            sweepLog(`扫荡异常: ${e.message}`, 'error');
        }
    }

    async function startSweepLoop(token) {
        const cfg = config.sweep;
        const maxCount = cfg.maxSweepCount || 0;

        while (_sweepState.running && token === _sweepState.token) {
            const result = await performSweep(token);
            if (!_sweepState.running || token !== _sweepState.token) break;

            _sweepState.totalCost += result.cost;
            _sweepState.totalMaps += result.gainMap;
            if (result.reachedFloor > _sweepState.bestFloor) {
                _sweepState.bestFloor = result.reachedFloor;
            }

            // 检查最大次数
            if (maxCount > 0 && _sweepState.sweepCount >= maxCount) {
                sweepLog(`已达最大扫荡次数 ${maxCount}，自动停止`, 'info');
                _sweepState.running = false;
                window.__sweepRunning = false;
                syncSweepStopUI();
                printSweepSettlement();
                return;
            }

            await jitteredSleep(cfg.sweepIntervalMs || 500);
        }
    }

    function startSweep() {
        _sweepState.running = true;
        _sweepState.stopRequested = false;
        _sweepState.sweepCount = 0;
        _sweepState.token++;
        _sweepState.totalMaps = 0;
        _sweepState.totalCost = 0;
        _sweepState.bestFloor = 0;
        _sweepState.startTime = Date.now();
        window.__sweepRunning = true;

        const btn = document.getElementById('sweep-toggle');
        const status = document.getElementById('sweep-status');
        if (btn) { btn.textContent = '停止'; btn.className = 'mp-btn mp-btn-stop'; }
        if (status) {
            status.innerHTML = '<span class="mp-status-dot"></span>扫荡中';
            status.className = 'mp-status-line status-running';
        }
        sweepLog('扫荡已启动', 'success');
        startSweepLoop(_sweepState.token).catch(e => sweepLog(`扫荡致命错误: ${e.message}`, 'error'));
    }

    function printSweepSettlement() {
        const elapsedSec = ((Date.now() - _sweepState.startTime) / 1000).toFixed(1);
        sweepLog(`════════ 扫荡结算 ════════`, 'gold');
        sweepLog(`扫荡次数: ${_sweepState.sweepCount}`, 'gold');
        sweepLog(`最佳层数: ${_sweepState.bestFloor || '-'}`, 'gold');
        sweepLog(`总消耗灵石: ${formatLingShi(_sweepState.totalCost)}`, 'gold');
        sweepLog(`获得藏宝图: ${_sweepState.totalMaps}`, 'gold');
        sweepLog(`总耗时: ${elapsedSec} 秒`, 'gold');
        sweepLog(`══════════════════════════`, 'gold');
    }

    function stopSweep() {
        const wasRunning = _sweepState.running;
        _sweepState.running = false;
        _sweepState.stopRequested = true;
        _sweepState.token++;
        window.__sweepRunning = false;
        syncSweepStopUI();
        if (wasRunning && _sweepState.sweepCount > 0) {
            printSweepSettlement();
        }
    }

    // ==================== 面板 UI ====================

    function createPanel() {
        const existing = document.getElementById('monitor-panel');
        if (existing) existing.remove();

        const panel = document.createElement('div');
        panel.id = 'monitor-panel';
        panel.innerHTML = `
            <div class="mp-gold-line"></div>
            <div id="monitor-header">
                <span class="mp-header-title">v${SCRIPT_VERSION}</span>
                <span class="mp-minimized-icon">&#x2699;</span>
                <div class="mp-header-right">
                    <span id="monitor-minimize" title="缩小">&#x25BC;</span>
                    <span id="monitor-close" title="关闭">&#x2716;</span>
                </div>
            </div>
            <div id="monitor-body">
                <div class="mp-tab-bar">
                    <button class="mp-tab active" data-tab="monitor">探索</button>
                    <button class="mp-tab" data-tab="treasure">寻宝</button>
                    <button class="mp-tab" data-tab="sweep">扫塔</button>
                    <button class="mp-tab" data-tab="inscription">铭文</button>
                    <button class="mp-tab" data-tab="changelog">更新</button>
                </div>
                <div id="tab-monitor" class="mp-tab-content active">
                    <div id="monitor-status" class="mp-status-line status-stopped">
                        <span class="mp-status-dot"></span>已停止
                        <span id="daynight-indicator" class="mp-daynight-indicator" style="display:none;"></span>
                    </div>
                    <div id="monitor-log"></div>
                </div>
                <div id="tab-treasure" class="mp-tab-content">
                    <div id="treasure-status" class="mp-status-line status-stopped">
                        <span class="mp-status-dot"></span>已停止
                    </div>
                    <div id="treasure-log"></div>
                </div>
                <div id="tab-sweep" class="mp-tab-content">
                    <div id="sweep-status" class="mp-status-line status-idle">
                        <span class="mp-status-dot"></span>待命
                    </div>
                    <div id="sweep-log"></div>
                </div>
                <div id="tab-inscription" class="mp-tab-content">
                    <div id="inscription-stats">
                        <div class="ip-stat">
                            <div class="ip-stat-value" id="inscription-stat-total">0</div>
                            <div class="ip-stat-label">次数</div>
                        </div>
                        <div class="ip-stat">
                            <div class="ip-stat-value" id="inscription-stat-kept">0</div>
                            <div class="ip-stat-label">达成</div>
                        </div>
                        <div class="ip-stat">
                            <div class="ip-stat-value" id="inscription-stat-best">-</div>
                            <div class="ip-stat-label">最佳</div>
                        </div>
                    </div>
                    <div id="inscription-status" class="mp-status-line status-idle">
                        <span class="mp-status-dot"></span>待命
                    </div>
                    <div id="inscription-log"></div>
                </div>
                <div id="tab-changelog" class="mp-tab-content">
                    <div id="changelog-list" style="padding:8px 10px;font-size:12px;line-height:1.8;color:var(--mp-text);">
                        <div style="margin-bottom:12px;">
                            <div style="color:var(--mp-accent);font-weight:bold;">v1.9.36</div>
                            <div>• 新增试练塔扫荡功能：自动调用扫荡API循环扫荡，可配置最大次数和间隔</div>
                            <div>• 新增"扫荡"独立Tab，包含独立的启停按钮、状态栏和日志区域</div>
                        </div>
                        <div style="margin-bottom:12px;">
                            <div style="color:var(--mp-accent);font-weight:bold;">v1.9.35</div>
                            <div>• 新增自动循环功能：探索/寻宝运行指定分钟后自动停止冥想，休息指定分钟后自动重启</div>
                            <div>• 自动循环状态在状态栏显示运行剩余时间和休息倒计时</div>
                            <div>• 当神识不足自动停止时，脚本不再完全停止</div>
                            <div>• 自动循环会正常转入休息阶段，并在配置的休息时间后自动重启</div>
                            <div>• 日志会明确显示"自动循环转入休息阶段"和"自动循环重新开始"</div>
                        </div>
                        <div style="margin-bottom:12px;">
                            <div style="color:var(--mp-accent);font-weight:bold;">v1.9.34</div>
                            <div>• 新增寻宝配置"区间间隔"开关，支持在最小最大时间之间随机取值</div>
                            <div>• 优化 jitteredSleep 随机延迟上限从 10 倍降为 5 倍，移除走神档位</div>
                        </div>
                        <div style="margin-bottom:12px;">
                            <div style="color:var(--mp-accent);font-weight:bold;">v1.9.33</div>
                            <div>• 新增探索和寻宝配置中的"结束时自动冥想"开关</div>
                            <div>• 将寻宝配置"每批使用数量"标签改为"使用次数"</div>
                        </div>
                        <div style="margin-bottom:12px;">
                            <div style="color:var(--mp-accent);font-weight:bold;">v1.9.32</div>
                            <div>• 修复战斗后昼夜检查延迟30秒问题</div>
                        </div>
                    </div>
                </div>
                <div class="mp-bottom-bar">
                    <button id="monitor-toggle" class="mp-btn mp-btn-start">启动</button>
                    <button id="treasure-toggle" class="mp-btn mp-btn-treasure" style="display:none">寻宝</button>
                    <button id="sweep-toggle" class="mp-btn mp-btn-start" style="display:none">扫荡</button>
                    <button id="inscription-toggle" class="mp-btn mp-btn-start" style="display:none">开始洗练</button>
                    <button id="inscription-pause" class="mp-btn mp-btn-pause" style="display:none">暂停</button>
                    <button id="monitor-config" class="mp-btn mp-btn-config">配置</button>
                    <button id="monitor-clear" class="mp-btn mp-btn-clear">清日志</button>
                </div>
            </div>
        `;
        panel.onclick = function (e) { e.stopPropagation(); };
        document.body.appendChild(panel);

        // 恢复面板位置
        const savedPos = GM_getValue('ling_panel_pos', null);
        if (savedPos && typeof savedPos.left === 'number' && typeof savedPos.top === 'number') {
            const maxLeft = window.innerWidth - panel.offsetWidth;
            const maxTop = window.innerHeight - panel.offsetHeight;
            panel.style.right = 'auto';
            panel.style.left = Math.max(0, Math.min(savedPos.left, maxLeft)) + 'px';
            panel.style.top = Math.max(0, Math.min(savedPos.top, maxTop)) + 'px';
        }

        // --- Tab 切换 ---
        const tabs = panel.querySelectorAll('.mp-tab');
        const tabContents = panel.querySelectorAll('.mp-tab-content');
        const monitorToggle = document.getElementById('monitor-toggle');
        const treasureToggle = document.getElementById('treasure-toggle');
        const sweepToggle = document.getElementById('sweep-toggle');
        const inscriptionToggle = document.getElementById('inscription-toggle');
        const inscriptionPause = document.getElementById('inscription-pause');
        const configBtn = document.getElementById('monitor-config');
        const clearBtn = document.getElementById('monitor-clear');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.dataset.tab;
                tabContents.forEach(tc => tc.classList.toggle('active', tc.id === `tab-${target}`));
                const isChangelog = target === 'changelog';
                monitorToggle.style.display = target === 'monitor' ? '' : 'none';
                treasureToggle.style.display = target === 'treasure' ? '' : 'none';
                sweepToggle.style.display = target === 'sweep' ? '' : 'none';
                inscriptionToggle.style.display = target === 'inscription' ? '' : 'none';
                inscriptionPause.style.display = target === 'inscription' ? '' : 'none';
                configBtn.style.display = isChangelog ? 'none' : '';
                clearBtn.style.display = isChangelog ? 'none' : '';
                const logId = target === 'treasure' ? 'treasure-log' : (target === 'inscription' ? 'inscription-log' : (target === 'sweep' ? 'sweep-log' : 'monitor-log'));
                const logEl = document.getElementById(logId);
                if (logEl) logEl.scrollTop = logEl.scrollHeight;
                if (configPanelEl) {
                    autoSaveConfig(true);
                    configPanelEl.remove();
                    configPanelEl = null;
                    if (!isChangelog) toggleConfigPanel();
                }
            });
        });

        // --- 拖拽 ---
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;
        let touchStartX, touchStartY;
        const header = document.getElementById('monitor-header');

        const startDrag = (clientX, clientY) => {
            isDragging = true;
            startX = clientX;
            startY = clientY;
            initialLeft = panel.offsetLeft;
            initialTop = panel.offsetTop;
            panel.style.right = 'auto';
        };
        const doDrag = (clientX, clientY) => {
            if (!isDragging) return;
            let newLeft = initialLeft + clientX - startX;
            let newTop = initialTop + clientY - startY;
            const maxLeft = window.innerWidth - panel.offsetWidth;
            const maxTop = window.innerHeight - panel.offsetHeight;
            newLeft = Math.max(0, Math.min(newLeft, maxLeft));
            newTop = Math.max(0, Math.min(newTop, maxTop));
            panel.style.left = newLeft + 'px';
            panel.style.top = newTop + 'px';
        };
        const endDrag = () => {
            if (isDragging) {
                GM_setValue('ling_panel_pos', { left: panel.offsetLeft, top: panel.offsetTop });
            }
            isDragging = false;
        };

        let mouseStartX, mouseStartY;
        header.addEventListener('mousedown', (e) => {
            if (e.target.id && (e.target.id.includes('minimize') || e.target.id.includes('close'))) return;
            mouseStartX = e.clientX;
            mouseStartY = e.clientY;
            startDrag(e.clientX, e.clientY);
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => doDrag(e.clientX, e.clientY));
        document.addEventListener('mouseup', (e) => {
            if (isDragging) {
                const moved = Math.abs(e.clientX - mouseStartX) + Math.abs(e.clientY - mouseStartY);
                if (moved < 10 && panel.classList.contains('minimized')) {
                    isDragging = false;
                    toggleMinimize();
                    return;
                }
            }
            endDrag();
        });

        header.addEventListener('touchstart', (e) => {
            const target = e.target;
            if (target.id && (target.id.includes('minimize') || target.id.includes('close'))) return;
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            startDrag(touch.clientX, touch.clientY);
            e.preventDefault();
        }, { passive: false });
        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const touch = e.touches[0];
            doDrag(touch.clientX, touch.clientY);
            e.preventDefault();
        }, { passive: false });
        document.addEventListener('touchend', (e) => {
            if (isDragging) {
                const moved = Math.abs((e.changedTouches[0]?.clientX || 0) - touchStartX)
                             + Math.abs((e.changedTouches[0]?.clientY || 0) - touchStartY);
                if (moved < 10 && panel.classList.contains('minimized')) {
                    isDragging = false;
                    toggleMinimize();
                    e.preventDefault();
                    return;
                }
            }
            endDrag();
        });

        // --- 缩小/展开 ---
        const minimizeBtn = document.getElementById('monitor-minimize');

        const toggleMinimize = () => {
            const isMinimized = panel.classList.contains('minimized');
            if (isMinimized) {
                panel.classList.remove('minimized');
                const body = document.getElementById('monitor-body');
                if (body) body.style.display = '';
                const configP = document.getElementById('config-panel');
                if (configP) configP.style.display = '';
                // 展开后滚动当前tab日志到底部
                const activeTab = panel.querySelector('.mp-tab.active');
                const tabName = activeTab ? activeTab.dataset.tab : 'monitor';
                const logId = tabName === 'treasure' ? 'treasure-log' : (tabName === 'inscription' ? 'inscription-log' : (tabName === 'sweep' ? 'sweep-log' : 'monitor-log'));
                const logEl = document.getElementById(logId);
                if (logEl) logEl.scrollTop = logEl.scrollHeight;
            } else {
                panel.classList.add('minimized');
                updateMinimizedGlow();
            }
        };

        minimizeBtn.addEventListener('click', (e) => {
            toggleMinimize();
            e.stopPropagation();
        });

        // 缩小状态呼吸光环：运行时呼吸，停止时移除
        function updateMinimizedGlow() {
            if (panel.classList.contains('minimized') && isRunning()) {
                panel.classList.add('running');
            } else {
                panel.classList.remove('running');
            }
        }
        panel.classList.remove('running');
        setInterval(updateMinimizedGlow, 500);

        // 圆形图标点击展开已由 mouseup/touchend 处理

        window.__monitorRunning = false;
        window.__thRunning = false;
        let monitorStartToken = 0;
        let treasureStartToken = 0;

        // --- 关闭面板 ---
        document.getElementById('monitor-close').addEventListener('click', (e) => {
            const panel = document.getElementById('monitor-panel');
            monitorStartToken++;
            treasureStartToken++;
            if (window.__monitorRunning) {
                window.__monitorRunning = false;
                toggleAutoCheckbox(false);
                syncStopUI();
            }
            if (window.__thRunning) {
                syncStopTHUI();
            }
            stopMainLoop();

            // 重置自动循环状态
            if (autoCycleState.restTimer) {
                clearTimeout(autoCycleState.restTimer);
                autoCycleState.restTimer = null;
            }
            autoCycleState.runStartTime = 0;
            autoCycleState.restStartTime = 0;
            autoCycleState.restingSeconds = 0;

            if (thAutoCycleState.restTimer) {
                clearTimeout(thAutoCycleState.restTimer);
                thAutoCycleState.restTimer = null;
            }
            thAutoCycleState.runStartTime = 0;
            thAutoCycleState.restStartTime = 0;
            thAutoCycleState.restingSeconds = 0;

            panel.style.display = 'none';
            monitorLog('面板已关闭，刷新页面可重新加载', 'info');
            e.stopPropagation();
        });

        // --- 监控启动/停止 ---
        monitorToggle.addEventListener('click', async (e) => {
            const btn = e.target;
            const status = document.getElementById('monitor-status');
            if (!window.__monitorRunning) {
                window.__monitorRunning = true;
                const startToken = ++monitorStartToken;
                const check = await preStartCheck('monitor');
                if (startToken !== monitorStartToken || !window.__monitorRunning) return;
                if (!check.ok) { window.__monitorRunning = false; return; }
                btn.textContent = '停止';
                btn.className = 'mp-btn mp-btn-stop';
                status.className = 'mp-status-line status-running';
                status.innerHTML = '<span class="mp-status-dot"></span>运行中<span id="daynight-indicator" class="mp-daynight-indicator" style="display:none;"></span>';
                startMainLoop();
                if (config.dayNight.enabled && dayNightState.currentIsDay === true) {
                    const alreadyMeditating = check.playerInfo?.data?.isMeditating;
                    if (alreadyMeditating) {
                        monitorLog('探索已启动（白天冥想中）', 'success');
                    } else {
                        monitorLog('探索已启动（当前白天，自动冥想）', 'success');
                        await switchToMeditate();
                    }
                    updateDayNightIndicator(true);
                } else {
                    toggleAutoCheckbox(true);
                    applyExploreMultiplier();
                    monitorLog('探索已启动', 'success');
                    if (config.dayNight.enabled) {
                        updateDayNightIndicator(dayNightState.currentIsDay);
                    }
                }
            } else {
                monitorStartToken++;
                btn.textContent = '启动';
                btn.className = 'mp-btn mp-btn-start';
                status.innerHTML = '<span class="mp-status-dot"></span>已停止';
                status.className = 'mp-status-line status-stopped';
                hiring = false;
                shopping = false;
                window.__monitorRunning = false;
                if (!window.__thRunning) stopMainLoop();
                toggleAutoCheckbox(false);
                dayNightState.currentIsDay = null;
                dayNightState.transitioning = false;
                removeDayNightIndicator();

                // 重置自动循环状态
                if (autoCycleState.restTimer) {
                    clearTimeout(autoCycleState.restTimer);
                    autoCycleState.restTimer = null;
                }
                autoCycleState.runStartTime = 0;
                autoCycleState.restStartTime = 0;
                autoCycleState.restingSeconds = 0;

                if (config.general.autoMeditate !== false) {
                    const medBtn = document.getElementById('meditateBtn');
                    if (medBtn) {
                        await humanClick(medBtn);
                        monitorLog('探索已暂停，自动进入冥想', 'success');
                    } else {
                        monitorLog('探索已暂停', 'warn');
                    }
                } else {
                    monitorLog('探索已暂停', 'warn');
                }
            }
            e.stopPropagation();
        });

        // --- 寻宝启动/停止 ---
        treasureToggle.addEventListener('click', async (e) => {
            if (window.__thRunning) {
                treasureStartToken++;
                window.__thRunning = false;
                syncStopTHUI();
                if (config.dayNight.enabled && window.__monitorRunning) {
                    dayNightState.lastCheckTime = 0;
                }
                if (!window.__monitorRunning) stopMainLoop();

                // 重置寻宝自动循环状态
                if (thAutoCycleState.restTimer) {
                    clearTimeout(thAutoCycleState.restTimer);
                    thAutoCycleState.restTimer = null;
                }
                thAutoCycleState.runStartTime = 0;
                thAutoCycleState.restStartTime = 0;
                thAutoCycleState.restingSeconds = 0;

                thLog('已停止寻宝', 'warn');
            } else {
                window.__thRunning = true;
                const startToken = ++treasureStartToken;
                const check = await preStartCheck('treasure');
                if (startToken !== treasureStartToken || !window.__thRunning) return;
                if (!check.ok) { window.__thRunning = false; return; }
                const btn = document.getElementById('treasure-toggle');
                const status = document.getElementById('treasure-status');
                btn.textContent = '停止寻宝';
                btn.className = 'mp-btn mp-btn-treasure-stop';
                status.innerHTML = '<span class="mp-status-dot"></span>寻宝中';
                status.className = 'mp-status-line status-running';
                startMainLoop();
                autoTreasureHunt().catch(e => thLog(`寻宝致命错误: ${e.message}`, 'error'));
            }
            e.stopPropagation();
        });

        // --- 铭文洗练启动/停止 ---
        inscriptionToggle.addEventListener('click', async (e) => {
            if (window.__inscriptionRunning) {
                stopInscriptionPulling();
                syncStopInscriptionUI();
                inscriptionLog('已停止洗练', 'warn');
            } else {
                const btn = document.getElementById('inscription-toggle');
                const status = document.getElementById('inscription-status');
                btn.textContent = '停止洗练';
                btn.className = 'mp-btn mp-btn-stop';
                status.innerHTML = '<span class="mp-status-dot"></span>洗练中';
                status.className = 'mp-status-line status-running';
                startInscriptionPulling().catch(e => inscriptionLog(`洗练致命错误: ${e.message}`, 'error'));
            }
            e.stopPropagation();
        });

        // --- 扫荡启动/停止 ---
        sweepToggle.addEventListener('click', (e) => {
            if (window.__sweepRunning) {
                stopSweep();
                sweepLog('已停止扫荡', 'warn');
            } else {
                startSweep();
            }
            e.stopPropagation();
        });

        // --- 铭文洗练暂停 ---
        inscriptionPause.addEventListener('click', (e) => {
            if (window.__inscriptionRunning) {
                pauseInscriptionPulling();
                const btn = document.getElementById('inscription-pause');
                btn.textContent = window.__inscriptionPaused ? '继续' : '暂停';
            }
            e.stopPropagation();
        });

        // --- 清日志 ---
        document.getElementById('monitor-clear').addEventListener('click', (e) => {
            const activeTab = panel.querySelector('.mp-tab.active');
            const tabName = activeTab ? activeTab.dataset.tab : 'monitor';
            const logId = tabName === 'treasure' ? 'treasure-log' : (tabName === 'inscription' ? 'inscription-log' : (tabName === 'sweep' ? 'sweep-log' : 'monitor-log'));
            const logEl = document.getElementById(logId);
            if (logEl) logEl.innerHTML = '';
            e.stopPropagation();
        });

        // --- 配置按钮 ---
        document.getElementById('monitor-config').addEventListener('click', (e) => {
            toggleConfigPanel();
            e.stopPropagation();
        });

        monitorLog('灵界助手已加载', 'info');
    }

    // ==================== 配置面板 UI ====================

    function renderProtectorSection(cfg) {
        return `<div class="cfg-section">
            <div class="cfg-section-label">护道者设置</div>
            <div class="cfg-row cfg-checkbox-row">
                <input id="cfg-th-hireProtector" type="checkbox" ${cfg.treasureHunt.hireProtector !== false ? 'checked' : ''}>
                <label class="cfg-label" style="margin-bottom:0;">遭遇时雇佣护道者</label>
                <span class="cfg-hint">关闭则直接迎战</span>
            </div>
            <div id="cfg-th-hire-details" style="${cfg.treasureHunt.hireProtector !== false ? '' : 'display:none;'}">
                <div class="cfg-row">
                    <label class="cfg-label">雇佣模式</label>
                    <select id="cfg-hireMode">
                        <option value="together" ${cfg.protectors.hireMode === 'together' ? 'selected' : ''}>协同（并肩作战，分担伤害）</option>
                        <option value="solo" ${cfg.protectors.hireMode === 'solo' ? 'selected' : ''}>单独（护道者替你承担全部攻击）</option>
                    </select>
                </div>
                <div class="cfg-row">
                    <label class="cfg-label">雇佣价格阈值 (超过则跳过，0=不限制)</label>
                    <input id="cfg-hirePriceThreshold" type="number" value="${cfg.protectors.hirePriceThreshold || 0}">
                </div>
                <div class="cfg-row">
                    <label class="cfg-label">无空闲护道者时</label>
                    <select id="cfg-onNoProtector">
                        <option value="escape" ${cfg.protectors.onNoProtector === 'escape' ? 'selected' : ''}>逃跑</option>
                        <option value="fight" ${cfg.protectors.onNoProtector === 'fight' ? 'selected' : ''}>迎战</option>
                    </select>
                </div>
                <div class="cfg-row" id="cfg-fightThreshold-wrap" style="${cfg.protectors.onNoProtector === 'fight' ? '' : 'display:none;'}">
                    <label class="cfg-label">迎战妖兽攻击阈值 (超过则逃跑，0=不限制)</label>
                    <input id="cfg-fightThreshold" type="number" value="${cfg.protectors.fightAttackThreshold || 0}">
                </div>
                <div class="cfg-row" id="cfg-afterEscape-wrap" style="${cfg.protectors.onNoProtector === 'escape' ? '' : 'display:none;'}">
                    <label class="cfg-label">逃跑后行为</label>
                    <select id="cfg-afterEscape">
                        <option value="stop" ${cfg.protectors.afterEscape === 'stop' ? 'selected' : ''}>冥想并停止脚本</option>
                        <option value="continue" ${cfg.protectors.afterEscape === 'continue' ? 'selected' : ''}>继续探索</option>
                    </select>
                </div>
                <div id="cfg-th-priority-wrap" style="margin-top:10px;">
                    ${renderPrioritySection(cfg)}
                </div>
            </div>
        </div>`;
    }

    function renderPrioritySection(cfg) {
        return `<div class="cfg-section">
            <div class="cfg-section-label">护道者优先级（按顺序匹配，按|分隔）</div>
            <div id="cfg-priority-list" class="priority-list">
                ${cfg.protectors.priorities.map((r, i) => {
                    const isName = !!r.nameMatch;
                    const keyword = isName ? r.nameMatch : (r.realmMatch || '');
                    return `<div class="priority-row" draggable="true" data-idx="${i}">
                        <span class="priority-handle" title="拖拽排序">⠿</span>
                        <select class="priority-type">
                            <option value="realm" ${!isName ? 'selected' : ''}>按境界</option>
                            <option value="name" ${isName ? 'selected' : ''}>按名字</option>
                        </select>
                        <input class="priority-keyword" type="text" value="${escapeHTML(keyword)}" placeholder="关键词">
                        <span class="priority-del" title="删除">&times;</span>
                    </div>`;
                }).join('')}
            </div>
            <div class="priority-add" id="cfg-priority-add">+ 添加规则</div>
        </div>`;
    }

    let configPanelEl = null;

    function autoSaveConfig(silent) {
        try {
            const before = JSON.stringify(config);
            const el = id => document.getElementById(id);
            if (el('cfg-hireMode')) config.protectors.hireMode = el('cfg-hireMode').value;
            if (el('cfg-monitor-hireProtector')) config.protectors.hireProtector = el('cfg-monitor-hireProtector').checked;
            if (el('cfg-onNoProtector')) config.protectors.onNoProtector = el('cfg-onNoProtector').value;
            if (el('cfg-fightThreshold')) config.protectors.fightAttackThreshold = parseInt(el('cfg-fightThreshold').value) || 0;
            if (el('cfg-hirePriceThreshold')) config.protectors.hirePriceThreshold = parseInt(el('cfg-hirePriceThreshold').value) || 0;
            if (el('cfg-afterEscape')) config.protectors.afterEscape = el('cfg-afterEscape').value;
            if (el('cfg-highPrice')) config.merchant.highPriceThreshold = parseInt(el('cfg-highPrice').value) || 7500000;
            if (el('cfg-stonePriority')) config.merchant.stonePriority = el('cfg-stonePriority').value.split('|').map(s => s.trim()).filter(Boolean);
            if (el('cfg-itemKeywords')) config.merchant.itemKeywords = el('cfg-itemKeywords').value.split('|').map(s => s.trim()).filter(Boolean);
            if (el('cfg-fallback')) config.merchant.fallbackToExpensive = el('cfg-fallback').checked;
            if (el('cfg-highLevelMeditate')) config.general.highLevelMeditate = el('cfg-highLevelMeditate').checked;
            if (el('cfg-checkDaoyun')) config.general.checkDaoyun = el('cfg-checkDaoyun').checked;
            if (el('cfg-autoMeditate')) config.general.autoMeditate = el('cfg-autoMeditate').checked;
            if (el('cfg-exploreMultiplier')) config.general.exploreMultiplier = parseInt(el('cfg-exploreMultiplier').value) || 1;
            if (el('cfg-th-checkDaoyun')) config.treasureHunt.checkDaoyun = el('cfg-th-checkDaoyun').checked;
            if (el('cfg-th-batchSize')) config.treasureHunt.batchSize = parseInt(el('cfg-th-batchSize').value) || 0;
            if (el('cfg-th-intervalMs')) config.treasureHunt.intervalMs = parseInt(el('cfg-th-intervalMs').value) || 2000;
            if (el('cfg-th-useRandomInterval')) config.treasureHunt.useRandomInterval = el('cfg-th-useRandomInterval').checked;
            if (el('cfg-th-intervalMinMs')) config.treasureHunt.intervalMinMs = Math.max(100, parseInt(el('cfg-th-intervalMinMs').value) || 1500);
            if (el('cfg-th-intervalMaxMs')) config.treasureHunt.intervalMaxMs = Math.max(100, parseInt(el('cfg-th-intervalMaxMs').value) || 3000);
            if (el('cfg-th-useQuantity')) config.treasureHunt.useQuantity = Math.max(1, parseInt(el('cfg-th-useQuantity').value) || 10);
            if (el('cfg-th-hireProtector')) config.treasureHunt.hireProtector = el('cfg-th-hireProtector').checked;
            if (el('cfg-th-autoMeditate')) config.treasureHunt.autoMeditate = el('cfg-th-autoMeditate').checked;
            if (el('cfg-dn-enabled')) config.dayNight.enabled = el('cfg-dn-enabled').checked;
            if (el('cfg-dn-interval')) config.dayNight.checkIntervalSec = Math.max(1, parseInt(el('cfg-dn-interval').value) || 30);
            if (el('cfg-dn-maxRetries')) config.dayNight.maxMeditateRetries = Math.max(1, parseInt(el('cfg-dn-maxRetries').value) || 3);
            if (el('cfg-dn-retryInterval')) config.dayNight.meditateRetryIntervalSec = Math.max(1, parseInt(el('cfg-dn-retryInterval').value) || 5);
            if (el('ic-stopMode')) config.inscription.stopMode = el('ic-stopMode').value;
            if (el('ic-maxAttempts')) config.inscription.maxAttempts = parseInt(el('ic-maxAttempts').value) || 0;
            if (el('ic-resultAnim')) config.inscription.resultAnimationMs = parseInt(el('ic-resultAnim').value) || 1500;
            if (el('ic-discardDelay')) config.inscription.discardDelayMs = parseInt(el('ic-discardDelay').value) || 2000;
            if (el('ic-autoDialog')) config.inscription.autoCloseDialogs = el('ic-autoDialog').checked;
            if (el('ic-autoInscribe')) config.inscription.autoInscribe = el('ic-autoInscribe').checked;
            if (el('ic-notify')) config.inscription.notifyOnComplete = el('ic-notify').checked;
            if (el('ic-pullCount')) config.inscription.pullCount = parseInt(el('ic-pullCount').value) || 10;
            if (el('cfg-autoCycle-enabled')) config.autoCycle.enabled = el('cfg-autoCycle-enabled').checked;
            if (el('cfg-autoCycle-runMinutes')) config.autoCycle.runMinutes = parseInt(el('cfg-autoCycle-runMinutes').value) || 60;
            if (el('cfg-autoCycle-restMinutes')) config.autoCycle.restMinutes = parseInt(el('cfg-autoCycle-restMinutes').value) || 30;
            if (el('cfg-autoCycle-refreshPage')) config.autoCycle.refreshPage = el('cfg-autoCycle-refreshPage').checked;
            if (el('cfg-autoCycle-linkSweep')) config.autoCycle.linkSweep = el('cfg-autoCycle-linkSweep').checked;
            if (el('cfg-th-autoCycle-enabled')) config.treasureHunt.autoCycle.enabled = el('cfg-th-autoCycle-enabled').checked;
            if (el('cfg-th-autoCycle-runMinutes')) config.treasureHunt.autoCycle.runMinutes = parseInt(el('cfg-th-autoCycle-runMinutes').value) || 60;
            if (el('cfg-th-autoCycle-restMinutes')) config.treasureHunt.autoCycle.restMinutes = parseInt(el('cfg-th-autoCycle-restMinutes').value) || 30;
            if (el('cfg-th-autoCycle-refreshPage')) config.treasureHunt.autoCycle.refreshPage = el('cfg-th-autoCycle-refreshPage').checked;
            if (el('cfg-th-autoCycle-linkSweep')) config.treasureHunt.autoCycle.linkSweep = el('cfg-th-autoCycle-linkSweep').checked;
            if (el('cfg-sweep-maxSweepCount')) config.sweep.maxSweepCount = parseInt(el('cfg-sweep-maxSweepCount').value) || 0;
            if (el('cfg-sweep-intervalMs')) config.sweep.sweepIntervalMs = Math.max(100, parseInt(el('cfg-sweep-intervalMs').value) || 500);
            const targetList = el('ic-target-list');
            if (targetList) {
                const rows = targetList.querySelectorAll('.affix-row');
                const targetStats = [];
                rows.forEach(row => {
                    const stat = row.querySelector('.target-stat-select').value;
                    const minValue = parseInt(row.querySelector('.affix-value').value) || 0;
                    targetStats.push({ stat, minValue });
                });
                if (targetStats.length > 0) {
                    config.inscription.targetStats = targetStats;
                }
            }
            const priorityList = el('cfg-priority-list');
            if (priorityList) {
                const rows = priorityList.querySelectorAll('.priority-row');
                const priorities = [];
                rows.forEach(row => {
                    const type = row.querySelector('.priority-type').value;
                    const kw = row.querySelector('.priority-keyword').value.trim();
                    if (!kw) return;
                    const rule = { sortBy: 'attack', sortOrder: 'desc' };
                    rule[type === 'name' ? 'nameMatch' : 'realmMatch'] = kw;
                    priorities.push(rule);
                });
                config.protectors.priorities = priorities;
            }
            saveConfig(config);
            if (!silent && JSON.stringify(config) !== before) {
                const activeTab = document.querySelector('.mp-tab.active');
                const tabName = activeTab ? activeTab.dataset.tab : 'monitor';
                const logFn = tabName === 'treasure' ? thLog : (tabName === 'inscription' ? inscriptionLog : (tabName === 'sweep' ? sweepLog : monitorLog));
                logFn('配置已保存', 'success');
            }
        } catch (e) {
            const activeTab = document.querySelector('.mp-tab.active');
            const tabName = activeTab ? activeTab.dataset.tab : 'monitor';
            const logFn = tabName === 'treasure' ? thLog : (tabName === 'inscription' ? inscriptionLog : (tabName === 'sweep' ? sweepLog : monitorLog));
            logFn('配置保存失败: ' + e.message, 'error');
        }
    }

    function toggleConfigPanel() {
        if (configPanelEl) {
            autoSaveConfig();
            configPanelEl.remove();
            configPanelEl = null;
            return;
        }
        const activeTab = document.querySelector('.mp-tab.active');
        const isTreasure = activeTab && activeTab.dataset.tab === 'treasure';
        const isInscription = activeTab && activeTab.dataset.tab === 'inscription';
        const isSweep = activeTab && activeTab.dataset.tab === 'sweep';
        const panel = document.createElement('div');
        panel.id = isInscription ? 'inscription-config-panel' : 'config-panel';
        const cfg = JSON.parse(JSON.stringify(config));

        // 1. 在模板外部构建 protectorSectionHTML
        let protectorSectionHTML = '';
        if (isTreasure) {
            protectorSectionHTML = renderProtectorSection(cfg);
        } else if (isInscription || isSweep) {
            protectorSectionHTML = '';
        } else {
            protectorSectionHTML = `
                <div class="cfg-section">
                    <div class="cfg-section-label">护道者设置</div>
                    <div class="cfg-row cfg-checkbox-row">
                        <input id="cfg-monitor-hireProtector" type="checkbox" ${cfg.protectors.hireProtector !== false ? 'checked' : ''}>
                        <label class="cfg-label" style="margin-bottom:0;">遭遇时雇佣护道者</label>
                        <span class="cfg-hint">关闭则直接迎战</span>
                    </div>
                    <div id="cfg-hire-details" style="${cfg.protectors.hireProtector !== false ? '' : 'display:none;'}">
                        <div class="cfg-row">
                            <label class="cfg-label">雇佣模式</label>
                            <select id="cfg-hireMode">
                                <option value="together" ${cfg.protectors.hireMode === 'together' ? 'selected' : ''}>协同（并肩作战，分担伤害）</option>
                                <option value="solo" ${cfg.protectors.hireMode === 'solo' ? 'selected' : ''}>单独（护道者替你承担全部攻击）</option>
                            </select>
                        </div>
                        <div class="cfg-row">
                            <label class="cfg-label">雇佣价格阈值 (超过则跳过，0=不限制)</label>
                            <input id="cfg-hirePriceThreshold" type="number" value="${cfg.protectors.hirePriceThreshold || 0}">
                        </div>
                        <div class="cfg-row">
                            <label class="cfg-label">无空闲护道者时</label>
                            <select id="cfg-onNoProtector">
                                <option value="escape" ${cfg.protectors.onNoProtector === 'escape' ? 'selected' : ''}>逃跑</option>
                                <option value="fight" ${cfg.protectors.onNoProtector === 'fight' ? 'selected' : ''}>迎战</option>
                            </select>
                        </div>
                        <div class="cfg-row" id="cfg-fightThreshold-wrap" style="${cfg.protectors.onNoProtector === 'fight' ? '' : 'display:none;'}">
                            <label class="cfg-label">迎战妖兽攻击阈值 (超过则逃跑，0=不限制)</label>
                            <input id="cfg-fightThreshold" type="number" value="${cfg.protectors.fightAttackThreshold || 0}">
                        </div>
                        <div class="cfg-row" id="cfg-afterEscape-wrap" style="${cfg.protectors.onNoProtector === 'escape' ? '' : 'display:none;'}">
                            <label class="cfg-label">逃跑后行为</label>
                            <select id="cfg-afterEscape">
                                <option value="stop" ${cfg.protectors.afterEscape === 'stop' ? 'selected' : ''}>冥想并停止脚本</option>
                                <option value="continue" ${cfg.protectors.afterEscape === 'continue' ? 'selected' : ''}>继续探索</option>
                            </select>
                        </div>
                    </div>
                    <div id="cfg-priority-wrap" style="margin-top:10px;${cfg.protectors.hireProtector !== false ? '' : 'display:none;'}">
                        ${renderPrioritySection(cfg)}
                    </div>
                </div>`;
        }

        // 2. 构建完整的模板，直接插入 protectorSectionHTML 变量
        panel.innerHTML = `
            <div class="cfg-header">
                <span class="cfg-title">${isTreasure ? '寻宝配置' : (isInscription ? '铭文配置' : (isSweep ? '扫荡配置' : '探索配置'))}</span>
                <span class="cfg-close">&times;</span>
            </div>

            ${protectorSectionHTML}

            ${isTreasure || isInscription || isSweep ? '' : `
            <div class="cfg-section">
                <div class="cfg-section-label">通用设置</div>
                <div class="cfg-row cfg-checkbox-row">
                    <input id="cfg-highLevelMeditate" type="checkbox" ${cfg.general.highLevelMeditate ? 'checked' : ''}>
                    <label class="cfg-label" style="margin-bottom:0;">仙缘高级冥想</label>
                    <span class="cfg-hint">关闭则直接冥想并停止脚本</span>
                </div>
                <div class="cfg-row cfg-checkbox-row">
                    <input id="cfg-checkDaoyun" type="checkbox" ${cfg.general.checkDaoyun !== false ? 'checked' : ''}>
                    <label class="cfg-label" style="margin-bottom:0;">启用道韵检查</label>
                    <span class="cfg-hint">启动时检查道韵加成是否开启</span>
                </div>
                <div class="cfg-row cfg-checkbox-row">
                    <input id="cfg-autoMeditate" type="checkbox" ${cfg.general.autoMeditate !== false ? 'checked' : ''}>
                    <label class="cfg-label" style="margin-bottom:0;">结束时自动冥想</label>
                    <span class="cfg-hint">神识不足/手动停止时自动进入冥想</span>
                </div>
                <div class="cfg-row">
                    <label class="cfg-label">探索倍率</label>
                    <select id="cfg-exploreMultiplier">
                        <option value="1" ${(cfg.general.exploreMultiplier || 1) === 1 ? 'selected' : ''}>1x</option>
                        <option value="5" ${cfg.general.exploreMultiplier === 5 ? 'selected' : ''}>5x</option>
                        <option value="10" ${cfg.general.exploreMultiplier === 10 ? 'selected' : ''}>10x</option>
                        <option value="20" ${cfg.general.exploreMultiplier === 20 ? 'selected' : ''}>20x</option>
                        <option value="50" ${cfg.general.exploreMultiplier === 50 ? 'selected' : ''}>50x</option>
                    </select>
                </div>
            </div>

            <div class="cfg-section">
                <div class="cfg-section-label">昼夜自动切换</div>
                <div class="cfg-row cfg-checkbox-row">
                    <input id="cfg-dn-enabled" type="checkbox" ${cfg.dayNight.enabled ? 'checked' : ''}>
                    <label class="cfg-label" style="margin-bottom:0;">启用昼夜自动切换</label>
                    <span class="cfg-hint">白天冥想，夜晚探索</span>
                </div>
                <div id="cfg-dn-settings" style="${cfg.dayNight.enabled ? '' : 'display:none;'}">
                    <div class="cfg-row">
                        <label class="cfg-label">检查间隔（秒）</label>
                        <input id="cfg-dn-interval" type="number" value="${cfg.dayNight.checkIntervalSec}" min="1" max="300">
                        <span class="cfg-hint">建议 30-60 秒</span>
                    </div>
                    <div class="cfg-row">
                        <label class="cfg-label">冥想最大重试次数</label>
                        <input id="cfg-dn-maxRetries" type="number" value="${cfg.dayNight.maxMeditateRetries}" min="1" max="10">
                        <span class="cfg-hint">白天冥想失败时的重试上限</span>
                    </div>
                    <div class="cfg-row">
                        <label class="cfg-label">重试间隔（秒）</label>
                        <input id="cfg-dn-retryInterval" type="number" value="${cfg.dayNight.meditateRetryIntervalSec}" min="1" max="60">
                        <span class="cfg-hint">冥想失败后多久重试</span>
                    </div>
                </div>
            </div>

            <div class="cfg-section">
                <div class="cfg-section-label">自动循环</div>
                <div class="cfg-row cfg-checkbox-row">
                    <input id="cfg-autoCycle-enabled" type="checkbox" ${cfg.autoCycle.enabled ? 'checked' : ''}>
                    <label class="cfg-label" style="margin-bottom:0;">启用自动循环</label>
                    <span class="cfg-hint">自动停止并冥想，自动启动</span>
                </div>
                <div id="cfg-autoCycle-settings" style="${cfg.autoCycle.enabled ? '' : 'display:none;'}">
                    <div class="cfg-row">
                        <label class="cfg-label">运行时间 (分钟)</label>
                        <input id="cfg-autoCycle-runMinutes" type="number" value="${cfg.autoCycle.runMinutes}" min="1" max="600">
                        <span class="cfg-hint">探索运行时间</span>
                    </div>
                    <div class="cfg-row">
                        <label class="cfg-label">休息时间 (分钟)</label>
                        <input id="cfg-autoCycle-restMinutes" type="number" value="${cfg.autoCycle.restMinutes}" min="1" max="600">
                        <span class="cfg-hint">冥想休息时间</span>
                    </div>
                    <div class="cfg-row cfg-checkbox-row">
                        <input id="cfg-autoCycle-refreshPage" type="checkbox" ${cfg.autoCycle.refreshPage ? 'checked' : ''}>
                        <label class="cfg-label" style="margin-bottom:0;">刷新网页</label>
                        <span class="cfg-hint">休息结束后先刷新网页再重启</span>
                    </div>
                    <div class="cfg-row cfg-checkbox-row">
                        <input id="cfg-autoCycle-linkSweep" type="checkbox" ${cfg.autoCycle.linkSweep ? 'checked' : ''}>
                        <label class="cfg-label" style="margin-bottom:0;">关联扫荡</label>
                        <span class="cfg-hint">运行自动扫荡，休息自动停止</span>
                    </div>
                </div>
            </div>`}

            ${(!isTreasure && !isInscription && !isSweep) ? `
            <div class="cfg-section">
                <div class="cfg-section-label">商人设置</div>
                <div class="cfg-row">
                    <label class="cfg-label">高价阈值 (灵石)</label>
                    <input id="cfg-highPrice" type="number" value="${cfg.merchant.highPriceThreshold}">
                </div>
                <div class="cfg-row">
                    <label class="cfg-label">商品关键词 (|分隔，按顺序优先)</label>
                    <input id="cfg-itemKeywords" type="text" value="${escapeHTML((cfg.merchant.itemKeywords || []).join('|'))}">
                </div>
                <div class="cfg-row">
                    <label class="cfg-label">品质优先级 (|分隔)</label>
                    <input id="cfg-stonePriority" type="text" value="${escapeHTML(cfg.merchant.stonePriority.join('|'))}">
                </div>
                <div class="cfg-row cfg-hint" style="padding:0;">匹配规则：先按关键词顺序，同关键词按品质优先级，高价物品始终最优先</div>
                <div class="cfg-row cfg-checkbox-row">
                    <input id="cfg-fallback" type="checkbox" ${cfg.merchant.fallbackToExpensive ? 'checked' : ''}>
                    <label class="cfg-label" style="margin-bottom:0;">无匹配时买最贵</label>
                    <span class="cfg-hint">关闭则无匹配时自动婉拒</span>
                </div>
            </div>` : ''}

            ${isTreasure ? `<div class="cfg-section">
                <div class="cfg-section-label">寻宝设置</div>
                <div class="cfg-row">
                    <label class="cfg-label">使用次数 (0 = 全部用完)</label>
                    <input id="cfg-th-batchSize" type="number" value="${cfg.treasureHunt.batchSize}">
                </div>
                <div id="cfg-th-fixed-interval-row" class="cfg-row" style="${cfg.treasureHunt.useRandomInterval ? 'display:none;' : ''}">
                    <label class="cfg-label">使用间隔 (毫秒)</label>
                    <input id="cfg-th-intervalMs" type="number" value="${cfg.treasureHunt.intervalMs}">
                </div>
                <div class="cfg-row cfg-checkbox-row">
                    <input id="cfg-th-useRandomInterval" type="checkbox" ${cfg.treasureHunt.useRandomInterval ? 'checked' : ''}>
                    <label class="cfg-label" style="margin-bottom:0;">启用区间间隔</label>
                    <span class="cfg-hint">在最小和最大时间之间随机取值</span>
                </div>
                <div id="cfg-th-random-interval-details" class="cfg-row" style="${cfg.treasureHunt.useRandomInterval ? '' : 'display:none;'}">
                    <div style="display:flex;gap:8px;align-items:center;">
                        <div style="flex:1;">
                            <label class="cfg-label">最小间隔 (毫秒)</label>
                            <input id="cfg-th-intervalMinMs" type="number" value="${cfg.treasureHunt.intervalMinMs || 1500}" min="100">
                        </div>
                        <span style="color:var(--mp-text-muted);margin-top:18px;">~</span>
                        <div style="flex:1;">
                            <label class="cfg-label">最大间隔 (毫秒)</label>
                            <input id="cfg-th-intervalMaxMs" type="number" value="${cfg.treasureHunt.intervalMaxMs || 3000}" min="100">
                        </div>
                    </div>
                </div>
                <div class="cfg-row">
                    <label class="cfg-label">每次使用数量</label>
                    <input id="cfg-th-useQuantity" type="number" value="${cfg.treasureHunt.useQuantity ?? 10}" min="1">
                </div>
                <div class="cfg-row cfg-checkbox-row">
                    <input id="cfg-th-checkDaoyun" type="checkbox" ${cfg.treasureHunt.checkDaoyun !== false ? 'checked' : ''}>
                    <label class="cfg-label" style="margin-bottom:0;">启用道韵检查</label>
                    <span class="cfg-hint">启动时检查道韵加成是否开启</span>
                </div>
                <div class="cfg-row cfg-checkbox-row">
                    <input id="cfg-th-autoMeditate" type="checkbox" ${cfg.treasureHunt.autoMeditate !== false ? 'checked' : ''}>
                    <label class="cfg-label" style="margin-bottom:0;">结束时自动冥想</label>
                    <span class="cfg-hint">寻宝结束后自动进入冥想</span>
                </div>
            </div>

            <div class="cfg-section">
                <div class="cfg-section-label">寻宝自动循环</div>
                <div class="cfg-row cfg-checkbox-row">
                    <input id="cfg-th-autoCycle-enabled" type="checkbox" ${cfg.treasureHunt.autoCycle.enabled ? 'checked' : ''}>
                    <label class="cfg-label" style="margin-bottom:0;">启用自动循环</label>
                    <span class="cfg-hint">自动停止并冥想，自动启动</span>
                </div>
                <div id="cfg-th-autoCycle-settings" style="${cfg.treasureHunt.autoCycle.enabled ? '' : 'display:none;'}">
                    <div class="cfg-row">
                        <label class="cfg-label">运行时间 (分钟)</label>
                        <input id="cfg-th-autoCycle-runMinutes" type="number" value="${cfg.treasureHunt.autoCycle.runMinutes}" min="1" max="600">
                        <span class="cfg-hint">寻宝运行时间</span>
                    </div>
                    <div class="cfg-row">
                        <label class="cfg-label">休息时间 (分钟)</label>
                        <input id="cfg-th-autoCycle-restMinutes" type="number" value="${cfg.treasureHunt.autoCycle.restMinutes}" min="1" max="600">
                        <span class="cfg-hint">冥想休息时间</span>
                    </div>
                    <div class="cfg-row cfg-checkbox-row">
                        <input id="cfg-th-autoCycle-refreshPage" type="checkbox" ${cfg.treasureHunt.autoCycle.refreshPage ? 'checked' : ''}>
                        <label class="cfg-label" style="margin-bottom:0;">刷新网页</label>
                        <span class="cfg-hint">休息结束后先刷新网页再重启</span>
                    </div>
                    <div class="cfg-row cfg-checkbox-row">
                        <input id="cfg-th-autoCycle-linkSweep" type="checkbox" ${cfg.treasureHunt.autoCycle.linkSweep ? 'checked' : ''}>
                        <label class="cfg-label" style="margin-bottom:0;">关联扫荡</label>
                        <span class="cfg-hint">运行自动扫荡，休息自动停止</span>
                    </div>
                </div>
            </div>` : ''}

            ${isInscription ? `<div class="cfg-section">
                <div class="cfg-section-label">抽取次数</div>
                <div class="cfg-row">
                    <label class="cfg-label">每次抽取</label>
                    <select id="ic-pullCount" style="width:100%;">
                        <option value="10" ${(cfg.inscription.pullCount || 10) === 10 ? 'selected' : ''}>十连</option>
                        <option value="100" ${cfg.inscription.pullCount === 100 ? 'selected' : ''}>百连</option>
                    </select>
                </div>
            </div>

            <div class="cfg-section">
                <div class="cfg-section-label">目标属性（不限品质，只看属性和数值）</div>
                <div id="ic-target-list" class="affix-list">
                    ${cfg.inscription.targetStats.map((t, i) => `
                        <div class="affix-row" draggable="true" data-idx="${i}">
                            <span class="affix-handle" title="排序">⠿</span>
                            <select class="target-stat-select">
                                <option value="攻击" ${t.stat === '攻击' ? 'selected' : ''}>攻击</option>
                                <option value="防御" ${t.stat === '防御' ? 'selected' : ''}>防御</option>
                                <option value="气血" ${t.stat === '气血' ? 'selected' : ''}>气血</option>
                                <option value="神识" ${t.stat === '神识' ? 'selected' : ''}>神识</option>
                                <option value="锋" ${t.stat === '锋' ? 'selected' : ''}>锋</option>
                                <option value="御" ${t.stat === '御' ? 'selected' : ''}>御</option>
                                <option value="命" ${t.stat === '命' ? 'selected' : ''}>命</option>
                            </select>
                            <span style="font-size:11px;color:var(--mp-text-muted);">≥</span>
                            <input class="affix-value" type="number" value="${t.minValue || 0}" min="0" placeholder="值">
                            <span class="affix-del" title="删除">&times;</span>
                        </div>
                    `).join('')}
                </div>
                <div class="affix-add" id="ic-target-add">+ 添加</div>
            </div>

            <div class="cfg-section">
                <div class="cfg-section-label">设置</div>
                <div class="cfg-row">
                    <label class="cfg-label">停止模式</label>
                    <select id="ic-stopMode" style="width:100%;">
                        <option value="any" ${cfg.inscription.stopMode === 'any' ? 'selected' : ''}>任一满足即停</option>
                        <option value="all" ${cfg.inscription.stopMode === 'all' ? 'selected' : ''}>全部满足才停</option>
                        <option value="manual" ${cfg.inscription.stopMode === 'manual' ? 'selected' : ''}>永不停</option>
                    </select>
                </div>
                <div class="cfg-row">
                    <label class="cfg-label">最大次数 <span class="cfg-hint">0=无限</span></label>
                    <input id="ic-maxAttempts" type="number" value="${cfg.inscription.maxAttempts}" min="0">
                </div>
                <div class="cfg-row" style="display:flex;gap:4px;">
                    <div style="flex:1;">
                        <label class="cfg-label">动画等待(ms)</label>
                        <input id="ic-resultAnim" type="number" value="${cfg.inscription.resultAnimationMs}" min="500" max="5000">
                    </div>
                    <div style="flex:1;">
                        <label class="cfg-label">放弃等待(ms)</label>
                        <input id="ic-discardDelay" type="number" value="${cfg.inscription.discardDelayMs}" min="500" max="10000">
                    </div>
                </div>
            </div>

            <div class="cfg-section">
                <div class="cfg-section-label">选项</div>
                <div class="cfg-row cfg-checkbox-row">
                    <input id="ic-autoDialog" type="checkbox" ${cfg.inscription.autoCloseDialogs ? 'checked' : ''}>
                    <label class="cfg-label" style="margin:0;">自动关闭弹窗</label>
                </div>
                <div class="cfg-row cfg-checkbox-row">
                    <input id="ic-autoInscribe" type="checkbox" ${cfg.inscription.autoInscribe ? 'checked' : ''}>
                    <label class="cfg-label" style="margin:0;">自动铭刻</label>
                </div>
                <div class="cfg-row cfg-checkbox-row">
                    <input id="ic-notify" type="checkbox" ${cfg.inscription.notifyOnComplete ? 'checked' : ''}>
                    <label class="cfg-label" style="margin:0;">浏览器通知</label>
                </div>
            </div>` : ''}

            ${isSweep ? `<div class="cfg-section">
                <div class="cfg-section-label">扫荡设置</div>
                <div class="cfg-row">
                    <label class="cfg-label">最大扫荡次数 (0 = 不限)</label>
                    <input id="cfg-sweep-maxSweepCount" type="number" value="${cfg.sweep.maxSweepCount}" min="0">
                </div>
                <div class="cfg-row">
                    <label class="cfg-label">扫荡间隔 (毫秒)</label>
                    <input id="cfg-sweep-intervalMs" type="number" value="${cfg.sweep.sweepIntervalMs}" min="100">
                    <span class="cfg-hint">建议 500-2000ms</span>
                </div>
            </div>` : ''}

            <div class="cfg-bottom-bar">
                <button id="cfg-reset" class="cfg-btn cfg-btn-reset">重置默认</button>
            </div>
        `;

        const monitorPanel = document.getElementById('monitor-panel');
        monitorPanel.appendChild(panel);
        configPanelEl = panel;

        panel.querySelector('.cfg-close').addEventListener('click', () => {
            autoSaveConfig();
            if (window.__inscriptionRunning) {
                window.__inscriptionRunning = false;
                syncStopInscriptionUI();
            }
            panel.remove();
            configPanelEl = null;
        });

        const onNoProtectorEl = document.getElementById('cfg-onNoProtector');
        if (onNoProtectorEl) {
            onNoProtectorEl.addEventListener('change', (e) => {
                document.getElementById('cfg-fightThreshold-wrap').style.display = e.target.value === 'fight' ? '' : 'none';
                document.getElementById('cfg-afterEscape-wrap').style.display = e.target.value === 'escape' ? '' : 'none';
            });
        }

        const monitorHireEl = document.getElementById('cfg-monitor-hireProtector');
        if (monitorHireEl) {
            monitorHireEl.addEventListener('change', (e) => {
                const details = document.getElementById('cfg-hire-details');
                if (details) details.style.display = e.target.checked ? '' : 'none';
                const priorityWrap = document.getElementById('cfg-priority-wrap');
                if (priorityWrap) priorityWrap.style.display = e.target.checked ? '' : 'none';
            });
        }

        const thHireEl = document.getElementById('cfg-th-hireProtector');
        if (thHireEl) {
            thHireEl.addEventListener('change', (e) => {
                const details = document.getElementById('cfg-th-hire-details');
                if (details) details.style.display = e.target.checked ? '' : 'none';
            });
        }

        const thRandomIntervalEl = document.getElementById('cfg-th-useRandomInterval');
        if (thRandomIntervalEl) {
            thRandomIntervalEl.addEventListener('change', (e) => {
                const details = document.getElementById('cfg-th-random-interval-details');
                if (details) details.style.display = e.target.checked ? '' : 'none';
                const fixedRow = document.getElementById('cfg-th-fixed-interval-row');
                if (fixedRow) fixedRow.style.display = e.target.checked ? 'none' : '';
            });
        }

        ['cfg-hireMode', 'cfg-monitor-hireProtector', 'cfg-onNoProtector', 'cfg-afterEscape',
         'cfg-fightThreshold', 'cfg-hirePriceThreshold', 'cfg-highPrice', 'cfg-stonePriority',
         'cfg-itemKeywords', 'cfg-fallback', 'cfg-highLevelMeditate', 'cfg-checkDaoyun', 'cfg-autoMeditate', 'cfg-exploreMultiplier',
         'cfg-th-batchSize', 'cfg-th-intervalMs', 'cfg-th-useRandomInterval', 'cfg-th-intervalMinMs', 'cfg-th-intervalMaxMs', 'cfg-th-useQuantity', 'cfg-th-hireProtector', 'cfg-th-checkDaoyun', 'cfg-th-autoMeditate',
         'cfg-dn-enabled', 'cfg-dn-interval', 'cfg-dn-maxRetries', 'cfg-dn-retryInterval',
         'cfg-autoCycle-enabled', 'cfg-autoCycle-runMinutes', 'cfg-autoCycle-restMinutes', 'cfg-autoCycle-refreshPage', 'cfg-autoCycle-linkSweep',
         'cfg-th-autoCycle-enabled', 'cfg-th-autoCycle-runMinutes', 'cfg-th-autoCycle-restMinutes', 'cfg-th-autoCycle-refreshPage', 'cfg-th-autoCycle-linkSweep',
         'ic-stopMode', 'ic-maxAttempts', 'ic-resultAnim', 'ic-discardDelay',
         'ic-autoDialog', 'ic-autoInscribe', 'ic-notify',
         'ic-pullCount',
         'cfg-sweep-maxSweepCount', 'cfg-sweep-intervalMs'
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => autoSaveConfig());
        });

        const dnEnabled = document.getElementById('cfg-dn-enabled');
        if (dnEnabled) {
            dnEnabled.addEventListener('change', (e) => {
                const settings = document.getElementById('cfg-dn-settings');
                if (settings) settings.style.display = e.target.checked ? '' : 'none';
            });
        }

        const autoCycleEnabled = document.getElementById('cfg-autoCycle-enabled');
        if (autoCycleEnabled) {
            autoCycleEnabled.addEventListener('change', (e) => {
                const settings = document.getElementById('cfg-autoCycle-settings');
                if (settings) settings.style.display = e.target.checked ? '' : 'none';
            });
        }

        const thAutoCycleEnabled = document.getElementById('cfg-th-autoCycle-enabled');
        if (thAutoCycleEnabled) {
            thAutoCycleEnabled.addEventListener('change', (e) => {
                const settings = document.getElementById('cfg-th-autoCycle-settings');
                if (settings) settings.style.display = e.target.checked ? '' : 'none';
            });
        }

        document.getElementById('cfg-reset').addEventListener('click', () => {
            const activeTab = document.querySelector('.mp-tab.active');
            const tabName = activeTab ? activeTab.dataset.tab : 'monitor';
            if (tabName === 'inscription') {
                config.inscription = JSON.parse(JSON.stringify(DEFAULT_CONFIG.inscription));
            } else if (tabName === 'sweep') {
                config.sweep = JSON.parse(JSON.stringify(DEFAULT_CONFIG.sweep));
            } else {
                config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
            }
            saveConfig(config);
            panel.remove();
            configPanelEl = null;
            const logFn = tabName === 'treasure' ? thLog : (tabName === 'inscription' ? inscriptionLog : (tabName === 'sweep' ? sweepLog : monitorLog));
            logFn('配置已重置为默认值', 'warn');
        });

        const list = document.getElementById('cfg-priority-list');

        if (list) {
            function makeRow(keyword, type) {
                const row = document.createElement('div');
                row.className = 'priority-row';
                row.draggable = true;
                row.innerHTML = `
                    <span class="priority-handle" title="拖拽排序">⠿</span>
                    <select class="priority-type">
                        <option value="realm" ${type !== 'name' ? 'selected' : ''}>按境界</option>
                        <option value="name" ${type === 'name' ? 'selected' : ''}>按名字</option>
                    </select>
                    <input class="priority-keyword" type="text" value="${escapeHTML(keyword)}" placeholder="关键词">
                    <span class="priority-del" title="删除">&times;</span>
                `;
                bindRowEvents(row);
                return row;
            }

            function bindRowEvents(row) {
                row.querySelector('.priority-del').addEventListener('click', () => { row.remove(); autoSaveConfig(); });
                row.querySelector('.priority-type').addEventListener('change', () => autoSaveConfig());
                row.querySelector('.priority-keyword').addEventListener('change', () => autoSaveConfig());
                row.addEventListener('dragstart', e => {
                    row.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                });
                row.addEventListener('dragend', () => { row.classList.remove('dragging'); autoSaveConfig(); });
                row.addEventListener('dragover', e => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const dragging = list.querySelector('.dragging');
                    if (dragging && dragging !== row) {
                        const rect = row.getBoundingClientRect();
                        const mid = rect.top + rect.height / 2;
                        if (e.clientY < mid) {
                            list.insertBefore(dragging, row);
                        } else {
                            list.insertBefore(dragging, row.nextSibling);
                        }
                    }
                });
            }

            list.querySelectorAll('.priority-row').forEach(bindRowEvents);

            document.getElementById('cfg-priority-add').addEventListener('click', () => {
                const row = makeRow('', 'realm');
                list.appendChild(row);
                row.querySelector('.priority-keyword').focus();
            });
        }

        // 铭文目标属性列表
        const targetList = document.getElementById('ic-target-list');
        const STAT_OPTIONS = ['攻击', '防御', '气血', '神识', '锋', '御', '命'];

        if (targetList) {
            function makeTargetRow(stat = '攻击', minValue = 0) {
                const row = document.createElement('div');
                row.className = 'affix-row';
                row.draggable = true;
                row.innerHTML = `
                    <span class="affix-handle" title="排序">⠿</span>
                    <select class="target-stat-select">
                        ${STAT_OPTIONS.map(s => `<option value="${s}" ${s === stat ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                    <span style="font-size:11px;color:var(--mp-text-muted);">≥</span>
                    <input class="affix-value" type="number" value="${minValue}" min="0" placeholder="值">
                    <span class="affix-del" title="删除">&times;</span>
                `;
                bindTargetRowEvents(row);
                return row;
            }

            function bindTargetRowEvents(row) {
                row.querySelector('.affix-del').addEventListener('click', () => { row.remove(); autoSaveConfig(); });
                row.querySelector('.target-stat-select').addEventListener('change', () => autoSaveConfig());
                row.querySelector('.affix-value').addEventListener('change', () => autoSaveConfig());
                row.addEventListener('dragstart', e => {
                    row.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                });
                row.addEventListener('dragend', () => { row.classList.remove('dragging'); autoSaveConfig(); });
                row.addEventListener('dragover', e => {
                    e.preventDefault();
                    const dragging = targetList.querySelector('.dragging');
                    if (dragging && dragging !== row) {
                        const rect = row.getBoundingClientRect();
                        const mid = rect.top + rect.height / 2;
                        if (e.clientY < mid) {
                            targetList.insertBefore(dragging, row);
                        } else {
                            targetList.insertBefore(dragging, row.nextSibling);
                        }
                    }
                });
            }

            targetList.querySelectorAll('.affix-row').forEach(bindTargetRowEvents);

            document.getElementById('ic-target-add').addEventListener('click', () => {
                const row = makeTargetRow();
                targetList.appendChild(row);
            });
        }
    }

    // ==================== 初始化 ====================
    createPanel();

    // --- 自动循环刷新恢复 ---
    (function resumeAfterReload() {
        const intent = GM_getValue('ling_resume_intent', null);
        if (!intent) return;
        GM_setValue('ling_resume_intent', null);

        // 等待面板渲染完成
        const tryResume = () => {
            const monitorToggle = document.getElementById('monitor-toggle');
            const treasureToggle = document.getElementById('treasure-toggle');
            if (!monitorToggle || !treasureToggle) {
                setTimeout(tryResume, 200);
                return;
            }

            if (intent === 'explore') {
                monitorToggle.click();
                if (config.autoCycle.linkSweep) setTimeout(() => startSweep(), 3000);
            } else if (intent === 'treasure') {
                treasureToggle.click();
                if (config.treasureHunt.autoCycle.linkSweep) setTimeout(() => startSweep(), 3000);
            }
        };
        setTimeout(tryResume, 500);
    })();
})();