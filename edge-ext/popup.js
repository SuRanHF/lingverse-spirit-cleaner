// 神识清理 — 弹出面板
'use strict';
const VERSION = chrome.runtime.getManifest().version;
let latestVersion = null;
let latestScriptUrl = null;

document.getElementById('curVer').textContent = 'v' + VERSION;

function setStatus(msg, color) {
    const s = document.getElementById('status');
    s.textContent = msg;
    s.style.color = color || '#9b927f';
}

function compareVer(a, b) {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        if ((pa[i]||0) > (pb[i]||0)) return 1;
        if ((pa[i]||0) < (pb[i]||0)) return -1;
    }
    return 0;
}

async function checkUpdate() {
    setStatus('检查中...', '#dbb970');
    document.getElementById('updateBtn').disabled = true;
    try {
        const result = await chrome.runtime.sendMessage({ type: 'update-check' });
        if (chrome.runtime.lastError) { setStatus('SW连接失败: '+chrome.runtime.lastError.message, '#ff6b6b'); return; }
        if (result?.version) {
            latestVersion = result.version;
            latestScriptUrl = result.downloadUrl || '';
            document.getElementById('newVer').textContent = 'v' + latestVersion;
            if (compareVer(latestVersion, VERSION) > 0) {
                setStatus('发现新版本 v' + latestVersion, '#9be7c3');
                document.getElementById('updateBtn').disabled = false;
            } else {
                setStatus('已是最新', '#9b927f');
            }
        } else {
            setStatus('检查失败', '#ff6b6b');
        }
    } catch (_) { setStatus('检查失败', '#ff6b6b'); }
}

async function doUpdate() {
    setStatus('下载中...', '#dbb970');
    const btn = document.getElementById('updateBtn');
    btn.disabled = true;
    try {
        const result = await chrome.runtime.sendMessage({
            type: 'update-download',
            url: latestScriptUrl,
            version: latestVersion
        });
        if (result?.ok) {
            setStatus('✅ 已更新至 v' + latestVersion + '，刷新生效', '#9be7c3');
            // 重载游戏页面
            try {
                const tabs = await chrome.tabs.query({ url: 'https://ling.muge.info/game.html*' });
                tabs.forEach(t => chrome.tabs.reload(t.id));
            } catch (_) {}
        } else {
            setStatus('下载失败', '#ff6b6b');
            btn.disabled = false;
        }
    } catch (_) { setStatus('下载失败', '#ff6b6b'); btn.disabled = false; }
}

document.getElementById('checkBtn').onclick = checkUpdate;
document.getElementById('updateBtn').onclick = doUpdate;
checkUpdate();
