// ==UserScript==
// @name         LingVerse Spirit Cleaner UI Preview
// @namespace    local.lingverse.tools.ui-preview
// @version      0.1.0
// @description  UI-only preview for LingVerse Spirit Cleaner. No game API calls, no automation logic.
// @match        https://ling.muge.info/game.html*
// @match        http://ling.muge.info/game.html*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    if (window.__lvSpiritCleanerUiPreviewLoaded) return;
    window.__lvSpiritCleanerUiPreviewLoaded = true;

    var STORAGE_PREFIX = 'lvSpiritCleaner.uiPreview.';
    var PANEL_Z_INDEX = 2147482800;
    var VERSION = '0.1.0';

    function readStore(key, fallback) {
        try {
            var value = localStorage.getItem(STORAGE_PREFIX + key);
            return value === null ? fallback : value;
        } catch (_) {
            return fallback;
        }
    }

    function writeStore(key, value) {
        try {
            localStorage.setItem(STORAGE_PREFIX + key, String(value));
        } catch (_) {}
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function removeOldPreview() {
        var old = document.getElementById('lvscUiPreviewHost');
        if (old) old.remove();
    }

    function pill(text, tone) {
        return '<span class="lvsu-pill lvsu-pill--' + tone + '">' + text + '</span>';
    }

    function switcher(label, checked) {
        return '<label class="lvsu-switch"><input type="checkbox"' + (checked ? ' checked' : '') + '><span></span><b>' + label + '</b></label>';
    }

    function action(label, tone, wide) {
        return '<button type="button" class="lvsu-btn lvsu-btn--' + tone + (wide ? ' lvsu-btn--wide' : '') + '" data-placeholder-action>' + label + '</button>';
    }

    function field(label, control) {
        return '<label class="lvsu-field"><span>' + label + '</span>' + control + '</label>';
    }

    function metric(label, value, detail, tone) {
        return '<div class="lvsu-metric lvsu-metric--' + tone + '">' +
            '<span>' + label + '</span><strong>' + value + '</strong><small>' + detail + '</small>' +
            '</div>';
    }

    removeOldPreview();

    var host = document.createElement('div');
    host.id = 'lvscUiPreviewHost';
    host.style.position = 'fixed';
    host.style.zIndex = String(PANEL_Z_INDEX);
    document.documentElement.appendChild(host);

    var root = host.attachShadow({ mode: 'open' });
    root.innerHTML = [
        '<style>',
        ':host{',
        '  --lvsu-bg:#12161a;',
        '  --lvsu-panel:#171d22;',
        '  --lvsu-panel-2:#1d2529;',
        '  --lvsu-card:rgba(255,255,255,.045);',
        '  --lvsu-card-strong:rgba(255,255,255,.075);',
        '  --lvsu-line:rgba(212,181,112,.22);',
        '  --lvsu-line-soft:rgba(220,230,236,.13);',
        '  --lvsu-gold:var(--accent-gold,#b7781f);',
        '  --lvsu-gold-soft:#dbb970;',
        '  --lvsu-jade:var(--accent-jade,#16806a);',
        '  --lvsu-jade-soft:#63d6ad;',
        '  --lvsu-cinnabar:#b7352d;',
        '  --lvsu-blue:#526f80;',
        '  --lvsu-ink:#0b0f12;',
        '  --lvsu-text:#f4efe4;',
        '  --lvsu-sub:#b9b1a1;',
        '  --lvsu-muted:#7f8a91;',
        '  --lvsu-shadow:0 22px 70px rgba(0,0,0,.46);',
        '  --lvsu-font:"Microsoft YaHei","Noto Sans SC","PingFang SC",sans-serif;',
        '  color:var(--lvsu-text);',
        '  font-family:var(--lvsu-font);',
        '}',
        '*{box-sizing:border-box}',
        'button,input,select,textarea{font:inherit}',
        '#lvsuPanel{',
        '  position:fixed;right:18px;bottom:18px;width:min(478px,calc(100vw - 28px));height:min(704px,calc(100vh - 28px));',
        '  min-width:336px;min-height:300px;display:flex;flex-direction:column;overflow:hidden;color:var(--lvsu-text);',
        '  background:',
        '    radial-gradient(circle at 18% -12%,rgba(183,120,31,.22),transparent 35%),',
        '    radial-gradient(circle at 105% 20%,rgba(22,128,106,.16),transparent 34%),',
        '    linear-gradient(180deg,rgba(25,31,35,.98),rgba(14,18,21,.98));',
        '  border:1px solid rgba(219,185,112,.43);border-radius:12px;box-shadow:var(--lvsu-shadow);',
        '  resize:both;container-type:inline-size;isolation:isolate;',
        '}',
        '#lvsuPanel:before{content:"";position:absolute;inset:0;pointer-events:none;opacity:.22;',
        '  background-image:linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px);',
        '  background-size:34px 34px,34px 34px;mask-image:linear-gradient(180deg,#000 0%,transparent 84%);',
        '}',
        '#lvsuPanel:after{content:"";position:absolute;inset:7px;pointer-events:none;border:1px solid rgba(219,185,112,.14);border-radius:8px;}',
        '.lvsu-head{position:relative;display:grid;grid-template-columns:1fr auto;gap:10px;padding:13px 14px 11px;border-bottom:1px solid rgba(219,185,112,.24);',
        '  background:linear-gradient(180deg,rgba(219,185,112,.14),rgba(219,185,112,.045));cursor:move;user-select:none;}',
        '.lvsu-title{display:grid;grid-template-columns:38px 1fr;gap:10px;min-width:0;align-items:center;}',
        '.lvsu-seal{display:grid;place-items:center;width:38px;height:38px;border:1px solid rgba(219,185,112,.6);border-radius:8px;color:#21180b;',
        '  background:linear-gradient(145deg,#f0d390,#a86716);box-shadow:inset 0 1px 0 rgba(255,255,255,.32),0 8px 20px rgba(183,120,31,.23);font-weight:900;}',
        '.lvsu-title h1{margin:0;font-size:16px;line-height:1.2;letter-spacing:0;color:var(--lvsu-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.lvsu-title p{margin:3px 0 0;color:var(--lvsu-sub);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.lvsu-head-actions{display:flex;gap:6px;align-items:start;}',
        '.lvsu-icon-btn{width:30px;height:30px;border:1px solid rgba(255,255,255,.13);border-radius:7px;background:rgba(255,255,255,.06);color:var(--lvsu-text);cursor:pointer;}',
        '.lvsu-icon-btn:hover{background:rgba(255,255,255,.11);border-color:rgba(219,185,112,.34)}',
        '.lvsu-status{position:relative;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:9px 14px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.14);}',
        '#lvsuStatusText{font-size:12px;color:var(--lvsu-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '#lvsuStatusText[data-tone=ready]{color:var(--lvsu-jade-soft)}',
        '#lvsuStatusText[data-tone=warn]{color:#f0c979}',
        '.lvsu-status-tags{display:flex;gap:5px;align-items:center;min-width:0;}',
        '.lvsu-pill{display:inline-flex;align-items:center;justify-content:center;min-height:22px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:800;white-space:nowrap;border:1px solid transparent;}',
        '.lvsu-pill--gold{background:rgba(219,185,112,.16);color:#f0d390;border-color:rgba(219,185,112,.32)}',
        '.lvsu-pill--jade{background:rgba(99,214,173,.13);color:#9be7c3;border-color:rgba(99,214,173,.24)}',
        '.lvsu-pill--red{background:rgba(183,53,45,.14);color:#ffb5ad;border-color:rgba(183,53,45,.28)}',
        '.lvsu-pill--blue{background:rgba(82,111,128,.18);color:#b8d5e5;border-color:rgba(82,111,128,.34)}',
        '.lvsu-body{position:relative;z-index:1;display:grid;grid-template-columns:116px minmax(0,1fr);gap:10px;min-height:0;flex:1;padding:12px;}',
        '.lvsu-nav{display:grid;grid-template-rows:repeat(8,1fr);gap:7px;min-height:0;}',
        '.lvsu-tab{position:relative;display:grid;grid-template-columns:24px 1fr;align-items:center;gap:7px;min-width:0;height:100%;min-height:42px;padding:7px 8px;border-radius:8px;',
        '  border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.045);color:var(--lvsu-sub);cursor:pointer;text-align:left;overflow:hidden;}',
        '.lvsu-tab:before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:2px;background:transparent;border-radius:2px;}',
        '.lvsu-tab i{display:grid;place-items:center;width:24px;height:24px;border-radius:6px;background:rgba(0,0,0,.2);color:var(--lvsu-gold-soft);font-style:normal;font-size:12px;font-weight:900;}',
        '.lvsu-tab b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.lvsu-tab:hover{border-color:rgba(219,185,112,.26);background:rgba(255,255,255,.07)}',
        '.lvsu-tab.is-active{background:linear-gradient(135deg,rgba(219,185,112,.22),rgba(22,128,106,.10));border-color:rgba(219,185,112,.46);color:var(--lvsu-text);}',
        '.lvsu-tab.is-active:before{background:var(--lvsu-gold-soft)}',
        '.lvsu-main{min-height:0;overflow:auto;padding-right:3px;scrollbar-color:rgba(219,185,112,.45) transparent;scrollbar-width:thin;}',
        '.lvsu-panel{display:none;gap:10px;}',
        '.lvsu-panel.is-active{display:grid;}',
        '.lvsu-hero{display:grid;grid-template-columns:1fr 112px;gap:10px;padding:12px;border:1px solid rgba(219,185,112,.24);border-radius:9px;',
        '  background:linear-gradient(135deg,rgba(219,185,112,.13),rgba(22,128,106,.08) 58%,rgba(183,53,45,.06));}',
        '.lvsu-hero h2{margin:0;font-size:18px;line-height:1.12;color:#f3dfb0;letter-spacing:0;}',
        '.lvsu-hero p{margin:6px 0 0;color:var(--lvsu-sub);font-size:12px;line-height:1.45;}',
        '.lvsu-ring{--p:68;display:grid;place-items:center;width:100%;aspect-ratio:1;border-radius:999px;background:conic-gradient(var(--lvsu-jade-soft) calc(var(--p)*1%),rgba(255,255,255,.10) 0);padding:7px;}',
        '.lvsu-ring-inner{display:grid;place-items:center;width:100%;height:100%;border-radius:999px;background:#11171b;border:1px solid rgba(255,255,255,.08);text-align:center;}',
        '.lvsu-ring-inner strong{font-size:22px;color:#f0d390;line-height:1}.lvsu-ring-inner span{font-size:10px;color:var(--lvsu-muted);margin-top:3px;}',
        '.lvsu-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;}',
        '.lvsu-grid--3{grid-template-columns:repeat(3,minmax(0,1fr));}',
        '.lvsu-card{min-width:0;padding:10px;border:1px solid var(--lvsu-line-soft);border-radius:8px;background:var(--lvsu-card);box-shadow:inset 0 1px 0 rgba(255,255,255,.035);}',
        '.lvsu-card--gold{border-color:rgba(219,185,112,.24);background:rgba(219,185,112,.07)}',
        '.lvsu-card--jade{border-color:rgba(99,214,173,.20);background:rgba(22,128,106,.07)}',
        '.lvsu-card--blue{border-color:rgba(82,111,128,.28);background:rgba(82,111,128,.08)}',
        '.lvsu-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px;}',
        '.lvsu-card h3{margin:0;font-size:13px;line-height:1.25;color:#f0d390;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.lvsu-card small{display:block;color:var(--lvsu-muted);font-size:11px;line-height:1.35;}',
        '.lvsu-metric{display:grid;gap:3px;min-height:76px;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.12);}',
        '.lvsu-metric span{color:var(--lvsu-muted);font-size:11px}.lvsu-metric strong{font-size:18px;line-height:1;color:var(--lvsu-text)}.lvsu-metric small{color:var(--lvsu-sub)}',
        '.lvsu-metric--gold strong{color:#f0d390}.lvsu-metric--jade strong{color:#9be7c3}.lvsu-metric--red strong{color:#ffb5ad}.lvsu-metric--blue strong{color:#b8d5e5}',
        '.lvsu-field{display:grid;gap:5px;color:var(--lvsu-sub);font-size:11px;min-width:0;}',
        '.lvsu-field span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.lvsu-field input,.lvsu-field select,.lvsu-field textarea{width:100%;min-width:0;height:32px;border-radius:7px;border:1px solid rgba(255,255,255,.13);background:rgba(5,9,11,.38);color:var(--lvsu-text);padding:0 9px;outline:none;}',
        '.lvsu-field textarea{height:68px;padding:8px;resize:none;line-height:1.4;}',
        '.lvsu-field input:focus,.lvsu-field select:focus,.lvsu-field textarea:focus{border-color:rgba(219,185,112,.56);box-shadow:0 0 0 2px rgba(219,185,112,.12);}',
        '.lvsu-field select option{background:#171d22;color:#f4efe4;}',
        '.lvsu-switch{display:flex;align-items:center;gap:8px;min-width:0;color:var(--lvsu-sub);font-size:12px;line-height:1.3;}',
        '.lvsu-switch input{appearance:none;position:absolute;opacity:0;pointer-events:none;}',
        '.lvsu-switch span{position:relative;flex:0 0 auto;width:36px;height:20px;border-radius:999px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.28);transition:.16s ease;}',
        '.lvsu-switch span:after{content:"";position:absolute;width:14px;height:14px;left:3px;top:2px;border-radius:999px;background:var(--lvsu-muted);transition:.16s ease;}',
        '.lvsu-switch input:checked + span{background:rgba(99,214,173,.18);border-color:rgba(99,214,173,.38)}',
        '.lvsu-switch input:checked + span:after{transform:translateX(15px);background:#9be7c3;}',
        '.lvsu-switch b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.lvsu-btn-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}',
        '.lvsu-btn{height:34px;border-radius:7px;border:1px solid transparent;cursor:pointer;font-weight:900;letter-spacing:0;color:var(--lvsu-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.lvsu-btn--gold{background:linear-gradient(180deg,#e8c978,#b7781f);color:#1c1307;border-color:rgba(255,232,168,.32);box-shadow:0 8px 20px rgba(183,120,31,.16);}',
        '.lvsu-btn--jade{background:rgba(22,128,106,.22);color:#9be7c3;border-color:rgba(99,214,173,.28)}',
        '.lvsu-btn--blue{background:rgba(82,111,128,.22);color:#b8d5e5;border-color:rgba(82,111,128,.38)}',
        '.lvsu-btn--red{background:rgba(183,53,45,.18);color:#ffb5ad;border-color:rgba(183,53,45,.34)}',
        '.lvsu-btn--ghost{background:rgba(255,255,255,.055);color:var(--lvsu-sub);border-color:rgba(255,255,255,.12)}',
        '.lvsu-btn:hover{filter:brightness(1.08)}',
        '.lvsu-btn--wide{grid-column:1 / -1;}',
        '.lvsu-toolbar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;}',
        '.lvsu-chipset{display:flex;gap:6px;flex-wrap:wrap;}',
        '.lvsu-chip{display:inline-flex;align-items:center;gap:4px;min-height:24px;padding:0 8px;border-radius:6px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:var(--lvsu-sub);font-size:11px;font-weight:700;}',
        '.lvsu-chip.is-hot{border-color:rgba(219,185,112,.32);background:rgba(219,185,112,.11);color:#f0d390;}',
        '.lvsu-timeline{display:grid;gap:7px;}',
        '.lvsu-step{display:grid;grid-template-columns:26px 1fr auto;gap:8px;align-items:center;padding:8px;border-radius:8px;background:rgba(0,0,0,.13);border:1px solid rgba(255,255,255,.08);}',
        '.lvsu-step i{display:grid;place-items:center;width:24px;height:24px;border-radius:999px;background:rgba(219,185,112,.15);color:#f0d390;font-style:normal;font-weight:900;font-size:11px;}',
        '.lvsu-step b{font-size:12px}.lvsu-step small{color:var(--lvsu-muted);font-size:11px}',
        '.lvsu-log{min-height:92px;max-height:142px;overflow:auto;white-space:pre-wrap;padding:9px;border:1px solid rgba(255,255,255,.10);border-radius:8px;background:rgba(0,0,0,.22);color:#c8c0af;font:11px/1.5 Consolas,"Microsoft YaHei",monospace;}',
        '.lvsu-section-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:2px 0 0;color:#f0d390;font-size:13px;font-weight:900;}',
        '.lvsu-divider{height:1px;background:linear-gradient(90deg,transparent,rgba(219,185,112,.35),transparent);}',
        '.lvsu-foot{position:relative;z-index:1;display:grid;grid-template-columns:1fr 1fr 78px;gap:8px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.09);background:linear-gradient(180deg,rgba(14,18,21,.78),rgba(8,11,13,.96));}',
        '.lvsu-toast{position:absolute;right:14px;bottom:64px;z-index:5;max-width:min(330px,calc(100% - 28px));padding:9px 12px;border:1px solid rgba(219,185,112,.42);border-radius:8px;',
        '  background:rgba(16,21,24,.96);color:#f0d390;box-shadow:0 14px 40px rgba(0,0,0,.42);font-size:12px;opacity:0;transform:translateY(8px);pointer-events:none;transition:.18s ease;}',
        '.lvsu-toast.is-visible{opacity:1;transform:translateY(0)}',
        '#lvsuPanel.is-collapsed{height:auto!important;min-height:0;width:min(430px,calc(100vw - 18px))!important;border-radius:999px;resize:none;}',
        '#lvsuPanel.is-collapsed .lvsu-status,#lvsuPanel.is-collapsed .lvsu-body,#lvsuPanel.is-collapsed .lvsu-foot{display:none;}',
        '#lvsuPanel.is-collapsed .lvsu-head{grid-template-columns:1fr auto;padding:8px 10px;border-bottom:0;border-radius:999px;}',
        '#lvsuPanel.is-collapsed .lvsu-title{grid-template-columns:28px 1fr;}',
        '#lvsuPanel.is-collapsed .lvsu-seal{width:28px;height:28px;border-radius:999px;font-size:12px;}',
        '#lvsuPanel.is-collapsed .lvsu-title h1{font-size:13px;}',
        '#lvsuPanel.is-collapsed .lvsu-title p{display:none;}',
        '@container (max-width:430px){',
        '  .lvsu-body{grid-template-columns:1fr;grid-template-rows:auto 1fr}.lvsu-nav{grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:repeat(2,42px)}',
        '  .lvsu-tab{grid-template-columns:1fr;place-items:center;text-align:center}.lvsu-tab i{display:none}.lvsu-grid,.lvsu-grid--3{grid-template-columns:1fr}.lvsu-hero{grid-template-columns:1fr}.lvsu-ring{width:116px;justify-self:center}.lvsu-foot{grid-template-columns:1fr}.lvsu-btn--wide{grid-column:auto}',
        '}',
        '@media (max-width:520px){#lvsuPanel{right:8px;bottom:8px;width:calc(100vw - 16px);height:min(680px,calc(100vh - 16px));min-width:0}.lvsu-status{grid-template-columns:1fr}.lvsu-status-tags{overflow:auto}.lvsu-head-actions{align-items:center}}',
        '</style>',
        '<section id="lvsuPanel" role="dialog" aria-label="LingVerse Spirit Cleaner UI Preview">',
        '  <header class="lvsu-head" id="lvsuDragHandle">',
        '    <div class="lvsu-title">',
        '      <div class="lvsu-seal">净</div>',
        '      <div><h1>神识清理</h1><p>灵界助手界面预览 · 功能未接入</p></div>',
        '    </div>',
        '    <div class="lvsu-head-actions">',
        '      <button type="button" class="lvsu-icon-btn" id="lvsuCollapse" title="收起">收</button>',
        '      <button type="button" class="lvsu-icon-btn" id="lvsuClose" title="隐藏">×</button>',
        '    </div>',
        '  </header>',
        '  <div class="lvsu-status">',
        '    <div id="lvsuStatusText" data-tone="ready">UI 预览已加载，当前不会调用游戏接口。</div>',
        '    <div class="lvsu-status-tags">' + pill('UI-only', 'gold') + pill('Shadow DOM', 'blue') + pill('v' + VERSION, 'jade') + '</div>',
        '  </div>',
        '  <div class="lvsu-body">',
        '    <nav class="lvsu-nav" id="lvsuTabs" aria-label="预览标签">',
        '      <button type="button" class="lvsu-tab" data-tab="overview"><i>总</i><b>总览</b></button>',
        '      <button type="button" class="lvsu-tab" data-tab="explore"><i>探</i><b>探索</b></button>',
        '      <button type="button" class="lvsu-tab" data-tab="battle"><i>战</i><b>战斗</b></button>',
        '      <button type="button" class="lvsu-tab" data-tab="merchant"><i>商</i><b>商人</b></button>',
        '      <button type="button" class="lvsu-tab" data-tab="auto"><i>流</i><b>自动</b></button>',
        '      <button type="button" class="lvsu-tab" data-tab="inscription"><i>铭</i><b>铭文</b></button>',
        '      <button type="button" class="lvsu-tab" data-tab="craft"><i>炼</i><b>炼造</b></button>',
        '      <button type="button" class="lvsu-tab" data-tab="notify"><i>讯</i><b>通知</b></button>',
        '    </nav>',
        '    <main class="lvsu-main">',
        '      <article class="lvsu-panel" data-panel="overview">',
        '        <section class="lvsu-hero">',
        '          <div><h2>灵宝司总控台</h2><p>把原脚本的清理、商人、护道、冥想、铭文、炼造和通知整理成一套更像游戏内面板的占位界面。</p></div>',
        '          <div class="lvsu-ring"><div class="lvsu-ring-inner"><strong>68</strong><span>神识预览</span></div></div>',
        '        </section>',
        '        <section class="lvsu-grid lvsu-grid--3">',
                  metric('清理轮次', '0', '待接入', 'gold') +
                  metric('遭遇处理', '0', '护道未启用', 'jade') +
                  metric('本轮收益', '--', '无数据源', 'blue') +
        '        </section>',
        '        <section class="lvsu-card lvsu-card--gold">',
        '          <div class="lvsu-card-head"><h3>主流程</h3>' + pill('占位', 'red') + '</div>',
        '          <div class="lvsu-btn-row">' + action('开始清理', 'gold') + action('监测神识', 'jade') + action('刷新预览', 'ghost') + action('生成简报', 'blue') + '</div>',
        '        </section>',
        '        <section class="lvsu-card">',
        '          <div class="lvsu-card-head"><h3>运行队列</h3>' + pill('待命', 'blue') + '</div>',
        '          <div class="lvsu-timeline">',
        '            <div class="lvsu-step"><i>1</i><b>探索消耗神识</b><small>未迁移</small></div>',
        '            <div class="lvsu-step"><i>2</i><b>事件分流处理</b><small>商人 / 战斗 / 收徒</small></div>',
        '            <div class="lvsu-step"><i>3</i><b>冥想与恢复</b><small>回满后继续</small></div>',
        '          </div>',
        '        </section>',
        '      </article>',
        '      <article class="lvsu-panel" data-panel="explore">',
        '        <section class="lvsu-card lvsu-card--gold"><div class="lvsu-card-head"><h3>基础探索</h3>' + pill('核心循环', 'gold') + '</div>',
        '          <div class="lvsu-grid">' +
                    field('保留神识', '<input type="number" value="0" min="0">') +
                    field('探索间隔(ms)', '<input type="number" value="1200" min="600" step="100">') +
                    field('优先倍率', '<select><option>保持当前倍率</option><option>×1</option><option>×5</option><option>×10</option><option>×20</option><option>×50</option></select>') +
                    field('神识监测阈值', '<input type="number" value="0" min="0">') +
        '          </div><div class="lvsu-divider"></div><div class="lvsu-toolbar">' + switcher('只在夜晚探索', false) + switcher('启动前检查道韵', true) + switcher('探索后自动汇报', true) + '</div>',
        '        </section>',
        '        <section class="lvsu-card"><div class="lvsu-card-head"><h3>区域与复活</h3>' + pill('死亡处理', 'red') + '</div>',
        '          <div class="lvsu-grid">' +
                    field('复活后前往', '<select><option>不跳转</option><option>灵溪村</option><option>青云城</option><option>玄天秘境</option></select>') +
                    field('复活策略', '<select><option>自动引渡归来</option><option>只提示</option><option>暂停清理</option></select>') +
        '          </div><div class="lvsu-btn-row">' + action('刷新地图', 'ghost') + action('模拟复活后路线', 'blue') + '</div>',
        '        </section>',
        '      </article>',
        '      <article class="lvsu-panel" data-panel="battle">',
        '        <section class="lvsu-card lvsu-card--jade"><div class="lvsu-card-head"><h3>妖兽遭遇</h3>' + pill('战斗系统', 'jade') + '</div>',
        '          <div class="lvsu-toolbar">' + switcher('弱怪自战', true) + switcher('无法自战则雇护道', true) + '</div>',
        '          <div class="lvsu-grid">' +
                    field('自战倍率', '<input type="number" value="1.15" min="1" max="3" step="0.05">') +
                    field('护道方式', '<select><option>最低价</option><option>合击</option><option>单独</option></select>') +
                    field('护道价格上限', '<input type="number" value="0" min="0">') +
                    field('重试次数', '<input type="number" value="2" min="1" max="10">') +
        '          </div><div class="lvsu-btn-row">' + action('检查并自战', 'jade') + action('查看护道队列', 'ghost') + '</div>',
        '        </section>',
        '        <section class="lvsu-card"><div class="lvsu-card-head"><h3>战后恢复</h3>' + pill('回血回灵', 'blue') + '</div>',
        '          <div class="lvsu-grid">' +
                    field('恢复项目', '<select><option>回血 + 回灵</option><option>只回血</option><option>只回灵</option><option>关闭</option></select>') +
                    field('低于百分比', '<input type="number" value="80" min="0" max="100">') +
                    field('恢复到百分比', '<input type="number" value="100" min="0" max="100">') +
                    field('装备耐久阈值', '<input type="number" value="70" min="0" max="100">') +
        '          </div><div class="lvsu-chipset"><span class="lvsu-chip is-hot">宗门治疗</span><span class="lvsu-chip">灵力疗伤</span><span class="lvsu-chip">丹药</span><span class="lvsu-chip">灵石凝炼</span></div>',
        '        </section>',
        '      </article>',
        '      <article class="lvsu-panel" data-panel="merchant">',
        '        <section class="lvsu-card lvsu-card--gold"><div class="lvsu-card-head"><h3>云游商人</h3>' + pill('筛选购买', 'gold') + '</div>',
        '          <div class="lvsu-grid">' +
                    field('商人策略', '<select><option>传说才买</option><option>按条件购买</option><option>直接离去</option></select>') +
                    field('价格上限', '<input type="number" value="0" min="0" placeholder="0 表示不限">') +
                    field('关键词', '<input type="text" value="传说 史诗" placeholder="空格或逗号分隔">') +
                    field('匹配方式', '<select><option>品质优先</option><option>严格匹配</option><option>宽松匹配</option></select>') +
        '          </div><div class="lvsu-toolbar">' + switcher('自动处理商人', true) + switcher('高价二次确认', true) + '</div>',
        '        </section>',
        '        <section class="lvsu-card"><div class="lvsu-card-head"><h3>珍宝阁</h3>' + pill('兑换占位', 'blue') + '</div>',
        '          <div class="lvsu-grid">' +
                    field('商品', '<select><option>点击刷新后选择</option></select>') +
                    field('单次数量', '<input type="number" value="99" min="1">') +
                    field('循环次数', '<input type="number" value="10" min="1">') +
                    field('间隔(ms)', '<input type="number" value="500" min="100" step="100">') +
        '          </div><div class="lvsu-btn-row">' + action('刷新商品', 'ghost') + action('开始兑换', 'gold') + '</div>',
        '        </section>',
        '      </article>',
        '      <article class="lvsu-panel" data-panel="auto">',
        '        <section class="lvsu-card lvsu-card--jade"><div class="lvsu-card-head"><h3>冥想与 Buff</h3>' + pill('自动流程', 'jade') + '</div>',
        '          <div class="lvsu-toolbar">' + switcher('神识不足自动冥想', true) + switcher('收功后继续探索', true) + switcher('高级冥想优先', false) + '</div>',
        '          <div class="lvsu-grid">' +
                    field('收功神识', '<input type="number" value="0" min="0">') +
                    field('虚空丹药等级', '<select><option>传说</option><option>史诗</option><option>稀有</option><option>普通</option></select>') +
                    field('隐秘符等级', '<select><option>不限</option><option>传说</option><option>史诗</option></select>') +
                    field('重试间隔(ms)', '<input type="number" value="60000" min="3000" step="1000">') +
        '          </div><div class="lvsu-btn-row">' + action('检查淬体', 'jade') + action('检查隐秘符', 'blue') + '</div>',
        '        </section>',
        '        <section class="lvsu-card"><div class="lvsu-card-head"><h3>灵田 / 收徒 / 出狱</h3>' + pill('生活处理', 'blue') + '</div>',
        '          <div class="lvsu-grid">' +
                    field('灵田种子', '<select><option>点击刷新后选择</option></select>') +
                    field('灵田检测间隔', '<input type="number" value="30" min="5" step="5">') +
                    field('收徒冷却(ms)', '<input type="number" value="5000" min="1000" step="500">') +
                    field('保释方式', '<select><option>灵石保释</option><option>仙材保释</option></select>') +
        '          </div><div class="lvsu-toolbar">' + switcher('收获成熟灵田', true) + switcher('自动种植', true) + switcher('监控世界聊天', false) + '</div>',
        '        </section>',
        '      </article>',
        '      <article class="lvsu-panel" data-panel="inscription">',
        '        <section class="lvsu-card lvsu-card--blue"><div class="lvsu-card-head"><h3>铭文洗练</h3>' + pill('七品质', 'blue') + '</div>',
        '          <div class="lvsu-grid">' +
                    field('铭文装备', '<select><option>点击刷新选择装备</option><option>当前装备</option></select>') +
                    field('最低品质', '<select><option>不限</option><option>凡纹</option><option>灵纹</option><option>宝纹</option><option>仙纹</option><option>神纹</option><option>圣纹</option><option>天纹</option></select>') +
                    field('目标属性', '<select><option>攻击</option><option>防御</option><option>气血</option><option>神识</option></select>') +
                    field('最小数值', '<input type="text" value="50" placeholder="如 50 或 80%">') +
                    field('命中模式', '<select><option>任一满足即保留</option><option>全部满足才保留</option><option>只手动停止</option></select>') +
                    field('洗练模式', '<select><option>十连</option><option>百连</option></select>') +
        '          </div><div class="lvsu-toolbar">' + switcher('命中后自动装配', false) + switcher('允许覆盖不同属性', false) + switcher('跳过神识铭文', false) + '</div>',
        '          <div class="lvsu-btn-row">' + action('刷新装备', 'ghost') + action('自动刷铭文', 'blue') + '</div>',
        '          <div class="lvsu-log" id="lvsuInscLog">[预览] 次数 0 / 达成 0 / 放弃 0\\n[预览] 等待接入铭文接口...</div>',
        '        </section>',
        '      </article>',
        '      <article class="lvsu-panel" data-panel="craft">',
        '        <section class="lvsu-card lvsu-card--gold"><div class="lvsu-card-head"><h3>批量炼造</h3>' + pill('炼丹炼器', 'gold') + '</div>',
        '          <div class="lvsu-grid">' +
                    field('类型', '<select><option>炼丹</option><option>炼器</option><option>制符</option></select>') +
                    field('配方', '<select><option>点击刷新后选择</option></select>') +
                    field('目标数量', '<input type="number" value="10" min="1">') +
                    field('每批数量', '<input type="number" value="50" min="1" max="100">') +
        '          </div><div class="lvsu-toolbar">' + switcher('自动购买材料', false) + switcher('完成后发通知', true) + '</div>',
        '          <div class="lvsu-btn-row">' + action('刷新配方', 'ghost') + action('开始炼造', 'gold') + '</div>',
        '        </section>',
        '        <section class="lvsu-card"><div class="lvsu-card-head"><h3>藏宝图 / 试炼 / 批量用符</h3>' + pill('消耗品', 'jade') + '</div>',
        '          <div class="lvsu-grid">' +
                    field('藏宝图上限', '<input type="number" value="0" min="0">') +
                    field('一次用几张', '<input type="number" value="1" min="1">') +
                    field('扫荡间隔(ms)', '<input type="number" value="3000" min="500" step="500">') +
                    field('用符批次', '<input type="number" value="10" min="1">') +
        '          </div><div class="lvsu-btn-row">' + action('自动刷图', 'jade') + action('试炼扫荡', 'blue') + action('批量用符', 'ghost', true) + '</div>',
        '        </section>',
        '      </article>',
        '      <article class="lvsu-panel" data-panel="notify">',
        '        <section class="lvsu-card lvsu-card--jade"><div class="lvsu-card-head"><h3>通知与公告</h3>' + pill('外部通道', 'jade') + '</div>',
        '          <div class="lvsu-grid">' +
                    field('云端公告 JSON', '<input type="text" value="release.json" placeholder="公告地址">') +
                    field('在线统计端点', '<input type="text" value="heartbeat" placeholder="占位端点">') +
                    field('脚本通知 Webhook', '<input type="text" placeholder="清理 / 陨落 / 新版">') +
                    field('世界消息 Webhook', '<input type="text" placeholder="世界频道转发">') +
        '          </div><div class="lvsu-toolbar">' + switcher('浏览器通知', true) + switcher('企业微信通知', false) + switcher('屏蔽更新提醒', false) + '</div>',
        '          <div class="lvsu-chipset"><span class="lvsu-chip is-hot">运行</span><span class="lvsu-chip is-hot">战斗</span><span class="lvsu-chip">商人</span><span class="lvsu-chip">冥想</span><span class="lvsu-chip">炼造</span><span class="lvsu-chip">铭文</span></div>',
        '          <div class="lvsu-btn-row">' + action('检查云端更新', 'jade') + action('测试通知', 'ghost') + action('导出配置', 'blue') + action('导入配置', 'blue') + '</div>',
        '        </section>',
        '        <section class="lvsu-card"><div class="lvsu-card-head"><h3>反馈</h3>' + pill('作者入口', 'blue') + '</div>' +
                    field('反馈内容', '<textarea placeholder="这里先作为 UI 占位，不会发送。"></textarea>') +
        '          <div class="lvsu-btn-row">' + action('提交反馈', 'gold') + action('复制诊断信息', 'ghost') + '</div>',
        '        </section>',
        '      </article>',
        '    </main>',
        '  </div>',
        '  <footer class="lvsu-foot">' + action('开始清理', 'gold') + action('监测神识', 'jade') + action('刷新', 'ghost') + '</footer>',
        '  <div class="lvsu-toast" id="lvsuToast">占位提示</div>',
        '</section>'
    ].join('');

    var panel = root.getElementById('lvsuPanel');
    var statusText = root.getElementById('lvsuStatusText');
    var toast = root.getElementById('lvsuToast');
    var toastTimer = null;

    function setStatus(message, tone) {
        statusText.textContent = message;
        statusText.setAttribute('data-tone', tone || 'ready');
    }

    function showToast(message) {
        clearTimeout(toastTimer);
        toast.textContent = message;
        toast.classList.add('is-visible');
        toastTimer = setTimeout(function () {
            toast.classList.remove('is-visible');
        }, 1800);
    }

    function activateTab(name) {
        var tabs = root.querySelectorAll('.lvsu-tab');
        var panels = root.querySelectorAll('.lvsu-panel');
        var exists = false;
        Array.prototype.forEach.call(tabs, function (tab) {
            if (tab.getAttribute('data-tab') === name) exists = true;
        });
        if (!exists) name = 'overview';
        Array.prototype.forEach.call(tabs, function (tab) {
            var active = tab.getAttribute('data-tab') === name;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        Array.prototype.forEach.call(panels, function (item) {
            item.classList.toggle('is-active', item.getAttribute('data-panel') === name);
        });
        writeStore('activeTab', name);
    }

    Array.prototype.forEach.call(root.querySelectorAll('.lvsu-tab'), function (tab) {
        tab.addEventListener('click', function () {
            activateTab(tab.getAttribute('data-tab'));
        });
    });

    Array.prototype.forEach.call(root.querySelectorAll('[data-placeholder-action]'), function (button) {
        button.addEventListener('click', function () {
            var text = (button.textContent || '操作').trim();
            setStatus('已点击 "' + text + '"，当前仅展示 UI，占位功能未接入。', 'warn');
            showToast('占位 UI：' + text + ' 暂不执行游戏操作');
            var log = root.getElementById('lvsuInscLog');
            if (log && /铭文|刷新装备/.test(text)) {
                var now = new Date().toLocaleTimeString();
                log.textContent = '[' + now + '] ' + text + '：占位触发，未调用接口\\n' + log.textContent;
            }
        });
    });

    Array.prototype.forEach.call(root.querySelectorAll('input,select,textarea'), function (control) {
        control.addEventListener('change', function () {
            setStatus('UI 选项已变更，设置保存逻辑尚未迁移。', 'ready');
        });
    });

    root.getElementById('lvsuCollapse').addEventListener('click', function () {
        var collapsed = !panel.classList.contains('is-collapsed');
        panel.classList.toggle('is-collapsed', collapsed);
        this.textContent = collapsed ? '展' : '收';
        this.title = collapsed ? '展开' : '收起';
        writeStore('collapsed', collapsed ? '1' : '0');
    });

    root.getElementById('lvsuClose').addEventListener('click', function () {
        host.remove();
        window.__lvSpiritCleanerUiPreviewLoaded = false;
    });

    function restorePosition() {
        var left = Number(readStore('left', NaN));
        var top = Number(readStore('top', NaN));
        if (Number.isFinite(left) && Number.isFinite(top)) {
            panel.style.left = clamp(left, 8, window.innerWidth - 80) + 'px';
            panel.style.top = clamp(top, 8, window.innerHeight - 60) + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        }
        if (readStore('collapsed', '0') === '1') {
            panel.classList.add('is-collapsed');
            root.getElementById('lvsuCollapse').textContent = '展';
            root.getElementById('lvsuCollapse').title = '展开';
        }
    }

    function makeDraggable() {
        var handle = root.getElementById('lvsuDragHandle');
        var dragging = false;
        var offsetX = 0;
        var offsetY = 0;

        handle.addEventListener('pointerdown', function (event) {
            if (event.target && event.target.closest && event.target.closest('button')) return;
            dragging = true;
            var rect = panel.getBoundingClientRect();
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;
            panel.style.left = rect.left + 'px';
            panel.style.top = rect.top + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            handle.setPointerCapture(event.pointerId);
        });

        handle.addEventListener('pointermove', function (event) {
            if (!dragging) return;
            var rect = panel.getBoundingClientRect();
            var maxLeft = Math.max(8, window.innerWidth - Math.min(rect.width, window.innerWidth - 16) - 8);
            var maxTop = Math.max(8, window.innerHeight - Math.min(rect.height, window.innerHeight - 16) - 8);
            var left = clamp(event.clientX - offsetX, 8, maxLeft);
            var top = clamp(event.clientY - offsetY, 8, maxTop);
            panel.style.left = left + 'px';
            panel.style.top = top + 'px';
        });

        function stopDrag(event) {
            if (!dragging) return;
            dragging = false;
            try { handle.releasePointerCapture(event.pointerId); } catch (_) {}
            var rect = panel.getBoundingClientRect();
            writeStore('left', Math.round(rect.left));
            writeStore('top', Math.round(rect.top));
        }

        handle.addEventListener('pointerup', stopDrag);
        handle.addEventListener('pointercancel', stopDrag);
    }

    restorePosition();
    makeDraggable();
    activateTab(readStore('activeTab', 'overview'));
})();
