// ==UserScript==
// @name         珍宝阁
// @namespace    http://tampermonkey.net/
// @version      2026-05-23
// @description  try to take over the world!
// @author       You
// @match        https://ling.muge.info/game.html
// @icon         https://www.google.com/s2/favicons?sz=64&domain=undefined.
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ========== 1. 导航到珍宝阁 ==========
    async function navigateToShop() {
        const sectBtn = document.getElementById('sectBtn');
        if (sectBtn) {
            sectBtn.click();
            await new Promise(r => setTimeout(r, 300));
        } else if (typeof togglePanel === 'function') {
            togglePanel('sect');
            await new Promise(r => setTimeout(r, 300));
        }

        if (typeof SectModule !== 'undefined' && SectModule.switchTab) {
            SectModule.switchTab('shop');
        } else {
            const shopTab = Array.from(document.querySelectorAll('.sect-tab')).find(b =>
                b.textContent.trim() === '珍宝阁'
            );
            if (shopTab) shopTab.click();
        }
        await new Promise(r => setTimeout(r, 300));
    }

    // ========== 2. 配置存储 ==========
    const STORAGE_KEY = 'auto_pill_config_v3';      // 版本升级
    const MINI_KEY = 'auto_pill_minimized';
    const POS_KEY = 'auto_pill_position';

    const DEFAULT_CONFIG = {
        qty: 99,
        loop: 10,
        delay: 500,
        itemName: '宗门优良聚灵丹',                // 新增：物品名称
        qtyId: 'shopQty_sect_pill_upper',          // 备用ID
        buyClass: 'sect-btn-buy',
        confirmId: 'gameDialogConfirmBtn',
        autoNavigate: true
    };

    function loadConfig() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            let config = saved ? JSON.parse(saved) : DEFAULT_CONFIG;
            // 保证新字段存在
            return { ...DEFAULT_CONFIG, ...config };
        } catch(e) {
            return DEFAULT_CONFIG;
        }
    }

    function saveConfig(config) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        } catch(e) {}
    }

    function loadPosition() {
        try {
            const saved = localStorage.getItem(POS_KEY);
            return saved ? JSON.parse(saved) : null;
        } catch(e) { return null; }
    }

    function savePosition(pos) {
        try {
            localStorage.setItem(POS_KEY, JSON.stringify(pos));
        } catch(e) {}
    }

    // 移除旧面板
    if (document.getElementById('autoExchangePanel')) {
        document.getElementById('autoExchangePanel').remove();
    }

    const config = loadConfig();
    const wasMinimized = localStorage.getItem(MINI_KEY) === 'true';
    const savedPos = loadPosition();

    // ========== 3. 创建UI面板 ==========
    const panel = document.createElement('div');
    panel.id = 'autoExchangePanel';
    panel.className = wasMinimized ? 'minimized' : '';

    const defaultRight = 20;
    const defaultTop = 20;
    const initialRight = savedPos ? savedPos.right : defaultRight;
    const initialTop = savedPos ? savedPos.top : defaultTop;

    panel.style.cssText = `position:fixed;top:${initialTop}px;right:${initialRight}px;width:340px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;padding:0;color:#1a202c;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;z-index:999999;box-shadow:0 10px 40px rgba(0,0,0,0.15);cursor:default;user-select:none;overflow:hidden;`;

    panel.innerHTML = `
        <style>
            /* 样式略 (与之前相同，保证美观) */
            #autoExchangePanel { transition: width 0.3s ease, height 0.3s ease; }
            #autoExchangePanel.minimized { width: auto !important; }
            #autoExchangePanel.minimized .panel-body { display: none !important; }
            #autoExchangePanel.minimized .drag-header { margin:0!important; border-radius:12px!important; border-bottom:none!important; padding:12px 16px!important; }
            #autoExchangePanel.minimized h3 { font-size:14px!important; }
            #autoExchangePanel input, #autoExchangePanel .row-3, #autoExchangePanel button, #autoExchangePanel .status, #autoExchangePanel .log, #autoExchangePanel .header-btn, #autoExchangePanel .drag-header, #autoExchangePanel .checkbox-wrap { /* 保持原样，省略重复样式以节省长度，实际运行时会补全 */ }
            /* 为确保显示，下面给出精简但完整的样式 */
            #autoExchangePanel input { width:100%;padding:8px 10px;margin-bottom:10px;border:1px solid #cbd5e0;border-radius:6px;background:#fff;box-sizing:border-box; }
            #autoExchangePanel .row-3 { display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px; }
            #autoExchangePanel button { border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;padding:8px 12px; }
            #autoExchangePanel .btn-start { background:#3182ce;color:white;width:100%; }
            #autoExchangePanel .btn-stop { background:#e53e3e;color:white;width:100%;display:none; }
            #autoExchangePanel .btn-save { background:#38a169;color:white;width:100%;margin-bottom:8px; }
            #autoExchangePanel .btn-nav { background:#dd6b20;color:white; }
            #autoExchangePanel .status { background:#f7fafc;padding:12px;border-radius:8px;margin-top:12px; }
            #autoExchangePanel .progress { height:6px;background:#e2e8f0;border-radius:3px;margin:8px 0; }
            #autoExchangePanel .progress-bar { height:100%;background:#3182ce;width:0%; }
            #autoExchangePanel .stats { display:flex;justify-content:space-between;font-size:11px; }
            #autoExchangePanel .drag-header { background:#edf2f7;padding:12px 16px;border-radius:12px 12px 0 0;cursor:move;display:flex;justify-content:space-between;align-items:center; }
            #autoExchangePanel .drag-header h3 { margin:0;font-size:16px;color:#2b6cb0; }
            #autoExchangePanel .header-btn { background:transparent;border:none;font-size:18px;cursor:pointer;width:28px;height:28px; }
            #autoExchangePanel .log { background:#f7fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px;margin-top:12px;max-height:100px;overflow:auto;font-size:11px;font-family:monospace; }
            #autoExchangePanel .log .success { color:#38a169; }
            #autoExchangePanel .log .error { color:#e53e3e; }
            #autoExchangePanel .log .info { color:#3182ce; }
            #autoExchangePanel .save-indicator { font-size:11px;color:#38a169;opacity:0;transition:opacity 0.3s;background:#f0fff4;padding:2px 6px;border-radius:4px;margin-right:8px; }
            #autoExchangePanel .save-indicator.show { opacity:1; }
            #autoExchangePanel .running-indicator { display:inline-block;width:8px;height:8px;background:#4299e1;border-radius:50%;margin-right:6px;animation:pulse 1.5s infinite; }
            @keyframes pulse { 0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.5;transform:scale(0.8);} }
            #autoExchangePanel .checkbox-wrap { display:flex;align-items:center;gap:6px;font-size:12px; }
            #autoExchangePanel .checkbox-wrap input { width:auto;margin:0; }
        </style>
        <div class="drag-header" id="ae_dragHeader">
            <h3><span id="ae_runningDot" style="display:none" class="running-indicator"></span>⚡ 自动兑换 · 按名称匹配</h3>
            <div style="display:flex;align-items:center;">
                <span class="save-indicator" id="ae_saveIndicator">✓ 已保存</span>
                <button class="header-btn" id="ae_minimizeBtn" title="最小化">−</button>
                <button class="header-btn close-btn" id="ae_closeBtn" title="关闭">×</button>
            </div>
        </div>
        <div class="panel-body" id="ae_panelBody">
            <div class="row-3">
                <input type="number" id="ae_qty" placeholder="单次数量" value="${config.qty}" min="1" max="99">
                <input type="number" id="ae_loop" placeholder="循环次数" value="${config.loop}" min="1">
                <input type="number" id="ae_delay" placeholder="延迟(ms)" value="${config.delay}" min="100" step="100">
            </div>
            <div style="margin-bottom:10px;">
                <input type="text" id="ae_itemName" placeholder="物品名称（精确匹配）" value="${config.itemName}" style="width:100%;">
            </div>
            <div style="margin:8px 0;display:flex;gap:8px;">
                <button class="btn-nav" id="ae_navBtn">🏛️ 打开珍宝阁</button>
                <label class="checkbox-wrap" style="flex:1;">
                    <input type="checkbox" id="ae_autoNav" ${config.autoNavigate ? 'checked' : ''}>
                    <span>启动时自动导航</span>
                </label>
            </div>
            <input type="text" id="ae_qtyId" placeholder="备用输入框ID" value="${config.qtyId}">
            <input type="text" id="ae_buyClass" placeholder="兑换按钮Class" value="${config.buyClass}">
            <input type="text" id="ae_confirmId" placeholder="确认按钮ID" value="${config.confirmId}">
            <button class="btn-save" id="ae_saveBtn">💾 保存设置</button>
            <button class="btn-start" id="ae_startBtn">▶ 开始兑换</button>
            <button class="btn-stop" id="ae_stopBtn">⏹ 终止循环</button>
            <div class="status">
                <div>状态: <span id="ae_status" style="color:#3182ce;font-weight:600">待机中</span></div>
                <div class="progress"><div class="progress-bar" id="ae_progress"></div></div>
                <div class="stats">
                    <span>当前: <b id="ae_current">0</b></span>
                    <span>目标: <b id="ae_target">0</b></span>
                    <span>成功: <b id="ae_success">0</b></span>
                </div>
            </div>
            <div class="log" id="ae_log"><div class="info">⚙️ 根据物品名称「${config.itemName}」匹配，自动填写数量并兑换。</div></div>
        </div>
    `;

    document.body.appendChild(panel);

    // DOM 元素引用
    const els = {
        panel, minimizeBtn: document.getElementById('ae_minimizeBtn'), closeBtn: document.getElementById('ae_closeBtn'),
        saveBtn: document.getElementById('ae_saveBtn'), startBtn: document.getElementById('ae_startBtn'),
        stopBtn: document.getElementById('ae_stopBtn'), navBtn: document.getElementById('ae_navBtn'),
        autoNav: document.getElementById('ae_autoNav'), status: document.getElementById('ae_status'),
        progress: document.getElementById('ae_progress'), current: document.getElementById('ae_current'),
        target: document.getElementById('ae_target'), success: document.getElementById('ae_success'),
        log: document.getElementById('ae_log'), saveIndicator: document.getElementById('ae_saveIndicator'),
        runningDot: document.getElementById('ae_runningDot'), itemName: document.getElementById('ae_itemName')
    };

    // 最小化
    function toggleMinimize() {
        const isMin = panel.classList.toggle('minimized');
        els.minimizeBtn.textContent = isMin ? '+' : '−';
        localStorage.setItem(MINI_KEY, isMin);
    }
    els.minimizeBtn.onclick = toggleMinimize;
    els.closeBtn.onclick = () => panel.remove();

    function log(msg, type = 'info') {
        const div = document.createElement('div');
        div.className = type;
        const time = new Date().toLocaleTimeString('zh-CN', {hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit'});
        div.textContent = `[${time}] ${msg}`;
        els.log.insertBefore(div, els.log.firstChild);
        if (els.log.children.length > 20) els.log.lastChild.remove();
    }

    function autoSave() {
        const newConfig = {
            qty: parseInt(document.getElementById('ae_qty').value) || 99,
            loop: parseInt(document.getElementById('ae_loop').value) || 10,
            delay: parseInt(document.getElementById('ae_delay').value) || 500,
            itemName: els.itemName.value.trim() || DEFAULT_CONFIG.itemName,
            qtyId: document.getElementById('ae_qtyId').value || DEFAULT_CONFIG.qtyId,
            buyClass: document.getElementById('ae_buyClass').value || DEFAULT_CONFIG.buyClass,
            confirmId: document.getElementById('ae_confirmId').value || DEFAULT_CONFIG.confirmId,
            autoNavigate: els.autoNav.checked
        };
        saveConfig(newConfig);
        els.saveIndicator.classList.add('show');
        setTimeout(() => els.saveIndicator.classList.remove('show'), 1500);
        log('设置已保存', 'success');
    }

    // 拖拽（简化，保持原样）
    const header = document.getElementById('ae_dragHeader');
    let isDragging = false, startX, startY, panelRight, panelTop;
    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.header-btn')) return;
        isDragging = true;
        startX = e.clientX; startY = e.clientY;
        const rect = panel.getBoundingClientRect();
        panelRight = window.innerWidth - rect.right;
        panelTop = rect.top;
        panel.style.transition = 'none';
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        let newRight = panelRight - (e.clientX - startX);
        let newTop = panelTop + (e.clientY - startY);
        newRight = Math.max(0, Math.min(newRight, window.innerWidth - panel.offsetWidth));
        newTop = Math.max(0, Math.min(newTop, window.innerHeight - panel.offsetHeight));
        panel.style.right = newRight + 'px';
        panel.style.top = newTop + 'px';
        panel.style.left = 'auto';
    });
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            panel.style.transition = '';
            const rect = panel.getBoundingClientRect();
            savePosition({ right: window.innerWidth - rect.right, top: rect.top });
        }
    });

    let state = { isRunning: false, current: 0, success: 0 };
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function updateUI() {
        els.status.textContent = state.isRunning ? '执行中...' : '待机中';
        els.status.style.color = state.isRunning ? '#3182ce' : '#718096';
        els.current.textContent = state.current;
        els.target.textContent = document.getElementById('ae_loop').value;
        els.success.textContent = state.success;
        const total = parseInt(document.getElementById('ae_loop').value) || 1;
        const pct = (state.current / total) * 100;
        els.progress.style.width = Math.min(pct, 100) + '%';
        els.runningDot.style.display = state.isRunning ? 'inline-block' : 'none';

        const titleH3 = document.querySelector('#ae_dragHeader h3');
        if (panel.classList.contains('minimized') && state.isRunning) {
            titleH3.innerHTML = `<span class="running-indicator"></span>⚡ ${state.current}/${total}`;
        } else if (!state.isRunning) {
            titleH3.innerHTML = `<span id="ae_runningDot" style="display:none" class="running-indicator"></span>⚡ 自动兑换 · 按名称匹配`;
            els.runningDot = document.getElementById('ae_runningDot');
        }
    }

    // ========== 核心：根据物品名称查找并兑换 ==========
    async function doExchange() {
        try {
            const qty = document.getElementById('ae_qty').value;
            const targetName = els.itemName.value.trim();
            const buyClass = document.getElementById('ae_buyClass').value;
            const confirmId = document.getElementById('ae_confirmId').value;
            const fallbackQtyId = document.getElementById('ae_qtyId').value;

            let qtyInput = null;
            let buyBtn = null;

            // 方法1：按物品名称匹配
            if (targetName) {
                // 查找所有 .sect-shop-item-name 元素，匹配文本内容
                const nameSpans = Array.from(document.querySelectorAll('.sect-shop-item-name'));
                const targetSpan = nameSpans.find(span => span.textContent.trim() === targetName);
                if (targetSpan) {
                    const shopItem = targetSpan.closest('.sect-shop-item');
                    if (shopItem) {
                        // 在 item 内查找数量输入框（可能是 input 或带 class .sect-shop-qty）
                        qtyInput = shopItem.querySelector('input.sect-shop-qty, input[type="number"]');
                        buyBtn = shopItem.querySelector('.' + buyClass);
                        log(`✅ 根据名称「${targetName}」定位到物品`, 'success');
                    } else {
                        log(`⚠️ 找到名称「${targetName}」但未找到父容器 .sect-shop-item`, 'error');
                    }
                } else {
                    log(`❌ 未找到名称为「${targetName}」的物品，将尝试备用ID方式`, 'error');
                }
            }

            // 方法2：备用 - 通过固定ID查找（兼容旧版）
            if (!qtyInput) {
                qtyInput = document.getElementById(fallbackQtyId);
                if (qtyInput) {
                    log(`使用备用ID定位: ${fallbackQtyId}`, 'info');
                    const actionsDiv = qtyInput.closest('.sect-shop-item-actions');
                    if (actionsDiv) buyBtn = actionsDiv.querySelector('.' + buyClass);
                    if (!buyBtn) buyBtn = document.querySelector('.' + buyClass);
                }
            }

            if (!qtyInput) throw new Error(`无法定位数量输入框，名称「${targetName}」或备用ID「${fallbackQtyId}」均失败`);
            if (!buyBtn) throw new Error(`无法定位兑换按钮 (class: ${buyClass})`);

            // 填写数量
            qtyInput.value = qty;
            qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
            qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(100);

            // 点击兑换
            if (buyBtn.onclick) buyBtn.onclick();
            else buyBtn.click();

            // 等待确认弹窗
            let confirmBtn = null;
            for (let i = 0; i < 20; i++) {
                await sleep(200);
                const modal = document.getElementById('gameDialogModal');
                if (modal) {
                    confirmBtn = modal.querySelector('#' + confirmId);
                    if (!confirmBtn) confirmBtn = modal.querySelector('.modal-btn--gold');
                }
                if (!confirmBtn) confirmBtn = document.getElementById(confirmId);
                if (confirmBtn) break;
            }
            if (!confirmBtn) throw new Error(`确认弹窗超时: ${confirmId}`);

            confirmBtn.click();
            await sleep(300);
            state.success++;
            log(`第 ${state.current} 次兑换成功`, 'success');
            return true;
        } catch (e) {
            log(`兑换失败: ${e.message}`, 'error');
            return false;
        }
    }

    async function start() {
        if (state.isRunning) return;
        if (els.autoNav.checked) {
            log('正在导航到珍宝阁...', 'info');
            await navigateToShop();
            log('已到达珍宝阁', 'success');
        }
        state.isRunning = true;
        state.current = 0;
        state.success = 0;
        els.startBtn.style.display = 'none';
        els.stopBtn.style.display = 'block';

        const total = parseInt(document.getElementById('ae_loop').value) || 10;
        const delay = parseInt(document.getElementById('ae_delay').value) || 500;
        log(`开始执行 ${total} 次兑换（物品：${els.itemName.value.trim()}）`, 'info');

        while (state.isRunning && state.current < total) {
            state.current++;
            updateUI();
            const ok = await doExchange();
            if (!ok && state.isRunning) log('本次失败，继续下次', 'error');
            if (state.isRunning && state.current < total) await sleep(delay);
        }
        stop();
        log('全部兑换完成', 'success');
    }

    function stop() {
        state.isRunning = false;
        els.startBtn.style.display = 'block';
        els.stopBtn.style.display = 'none';
        updateUI();
    }

    // 绑定事件
    els.startBtn.onclick = start;
    els.stopBtn.onclick = stop;
    els.saveBtn.onclick = autoSave;
    els.navBtn.onclick = async () => {
        log('手动导航到珍宝阁...', 'info');
        await navigateToShop();
        log('导航完成', 'success');
    };

    // 自动保存防抖
    let saveTimeout;
    ['ae_qty', 'ae_loop', 'ae_delay', 'ae_qtyId', 'ae_buyClass', 'ae_confirmId', 'ae_itemName'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(autoSave, 1000);
        });
    });
    els.autoNav.addEventListener('change', autoSave);

    // ESC停止
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.isRunning) {
            stop();
            log('ESC 强制终止', 'error');
        }
    });

    log(`脚本已启动，匹配物品名称：「${config.itemName}」`, 'info');
    if (wasMinimized) log('面板已最小化，点击 + 展开', 'info');
})();