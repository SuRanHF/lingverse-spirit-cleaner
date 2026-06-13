// ==UserScript==
// @name         Spirit Cleaner — 8-Tab UI
// @namespace    local.lingverse.tools
// @version      0.1
// @description  将6tab面板升级为8tab(探索/战斗/装备/商人/自动/铭文/炼制/更新)
// @match        https://ling.muge.info/game.html*
// @match        http://ling.muge.info/game.html*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function migrate() {
        var tb = document.getElementById('lvscTabs');
        if (!tb || tb.children.length !== 6) {
            setTimeout(migrate, 500);
            return;
        }

        // 1. CSS
        tb.style.gridTemplateColumns = 'repeat(8,minmax(0,1fr))';

        // 2. 新 tab 按钮
        tb.innerHTML = '';
        [
            ['explore','探索'], ['fight','战斗'], ['equip','装备'], ['merchant','商人'],
            ['auto','自动'], ['inscription','铭文'], ['craft','炼制'], ['update','更新']
        ].forEach(function(t) {
            var b = document.createElement('button');
            b.className = 'lvsc-tab';
            b.setAttribute('data-tab', t[0]);
            b.textContent = t[1];
            b.onclick = function() {
                document.querySelectorAll('.lvsc-tab-panel').forEach(function(p){ p.classList.remove('lvsc-active'); });
                document.querySelectorAll('.lvsc-tab').forEach(function(tb2){ tb2.classList.remove('lvsc-active'); });
                b.classList.add('lvsc-active');
                var panel = document.querySelector('[data-tab-panel="' + t[0] + '"]');
                if (panel) panel.classList.add('lvsc-active');
                localStorage.setItem('lvSpiritCleaner.activeTab', t[0]);
            };
            tb.appendChild(b);
        });

        // 3. 重命名旧面板
        var renames = { basic: 'explore', combat: 'fight', flow: 'auto' };
        Object.keys(renames).forEach(function(old) {
            var p = document.querySelector('[data-tab-panel="' + old + '"]');
            if (p) p.setAttribute('data-tab-panel', renames[old]);
        });

        // 4. 新建装备和炼制面板
        function newPanel(name) {
            var d = document.createElement('div');
            d.className = 'lvsc-category lvsc-tab-panel';
            d.setAttribute('data-tab-panel', name);
            document.getElementById('lvscBody').appendChild(d);
            return d;
        }
        var eqPanel = newPanel('equip');
        var crPanel = newPanel('craft');

        // 5. 搬元素
        function moveSections(ids, to) {
            ids.forEach(function(id) {
                var el = document.getElementById(id);
                if (!el) return;
                var sec = el;
                while (sec && !sec.classList.contains('lvsc-section') && sec.id !== 'lvscBody') {
                    sec = sec.parentNode;
                }
                if (sec && sec.classList.contains('lvsc-section')) {
                    to.appendChild(sec);
                }
            });
        }

        // 装备面板
        moveSections(['lvscAutoRepair', 'lvscRepairThreshold', 'lvscRepairBtn',
                       'lvscAutoNatalDevour', 'lvscNatalDevourBtn',
                       'lvscEquipSwapEnabled', 'lvscCaptureSpiritSet', 'lvscCaptureCombatSet'], eqPanel);

        // 炼制面板
        moveSections(['lvscCraftType', 'lvscCraftRecipe', 'lvscRefreshRecipes',
                       'lvscCraftTargetCount', 'lvscCraftBatchSize', 'lvscCraftAutoBuyMats',
                       'lvscAutoCraftBtn', 'lvscStopCraftBtn', 'lvscCraftLog',
                       'lvscAutoTrialBtn', 'lvscAutoTreasureBtn',
                       'lvscTreasureBatchSize', 'lvscTreasureUseQuantity', 'lvscTreasureIntervalMs'], crPanel);

        // 6. 激活默认 tab
        var active = localStorage.getItem('lvSpiritCleaner.activeTab') || 'explore';
        var activeBtn = document.querySelector('[data-tab="' + active + '"]');
        if (activeBtn) activeBtn.click();

        console.log('[8tab] migration done');
    }

    // 等面板加载完
    var retries = 0;
    var timer = setInterval(function() {
        retries++;
        if (document.getElementById('lvscTabs') && document.getElementById('lvscTabs').children.length === 6) {
            clearInterval(timer);
            migrate();
        }
        if (retries > 30) clearInterval(timer);
    }, 1000);
})();
