# 神识清理 (LingVerse Spirit Cleaner) — Project Rules

## 用户画像 & 沟通规范

**用户不是技术人员**，不会用专业术语描述需求。你要以**产品经理的思维**理解他的话：

1. **模糊需求先确认** — 别猜，问到清楚为止。用户宁可被问也不想要猜错的结果。
2. **描述用结果不用实现** — 比如用户说"我想点公告按钮就跳到脚本页面"，不要说"劫持 onClick 回调"，要说"点公告按钮时弹出脚本面板"。
3. **别擅自推代码** — 用户说"推送"再推，没说的只改 dev 文件。
4. **一次说清楚再动手** — 用户下完需求后，先复述确认他想要什么，确认了再改。
5. **解释方案时说人话** — 不丢技术栈，先说效果再说怎么做。

## dev / 正式版 工作流

- **dev 文件**：`lingverse-spirit-cleaner.dev.user.js`（本地，不上传仓库）
- **正式版**：`lingverse-spirit-cleaner.user.js`
- **平时改动** → 只改 dev，验证语法后再给用户
- **用户说"推送"** → dev 合并进正式版 → 更新版本号+公告 → commit + push 两个仓库
- **语法验证**：`node -e "var fs=require('fs'),vm=require('vm');var c=fs.readFileSync('lingverse-spirit-cleaner.dev.user.js','utf8');var i=c.indexOf('var source = String.raw');var s=c.indexOf('\`',i)+1;var e=c.lastIndexOf('\`;');try{vm.runInNewContext(c.slice(s,e).replace(/\r/g,''),{});console.log('OK')}catch(e){console.log(e.message.indexOf('not defined')>0?'OK':'ERR:'+e.message)}"`

## 提交前强制检查

每次 `git commit` 前必须确认以下全部完成：

1. **版本号三处同步**：
   - `// @version` (第4行)
   - `SCRIPT_VERSION` (var SCRIPT_VERSION)
   - `release.json` 的 `version` 和 `downloadUrl`

2. **更新公告同步**：
   - `BUILTIN_CHANGELOG` 新增条目（脚本内）
   - `release.json` 的 `notes` 和 `changelog`

3. **更新 README**：
   - 功能列表、配置说明如有变化，同步更新 `README.md`

4. **推送两个仓库**：
   - `git push origin main` (GitHub)
   - `git push gitee main` (Gitee)

## 仓库文件限制

- **此仓库只放**：`lingverse-spirit-cleaner.user.js`, `README.md`, `release.json`, `versions/`
- **服务器部署** → `SuRanHF/lingverse-server-deploy`
- **发布工具** → 本地，不上传

## 技术要点

- 游戏页面：`ling.muge.info/game.html`
- 游戏 JS 源码可下载到 `/tmp/g.js` 分析
- 脚本架构：外层 IIFE（Tampermonkey 沙箱）→ `String.raw` 内层注入页面
- 铭文 API：`/api/game/inscription/draw-ten` / `draw-hundred`，返回 `{ inscriptions: [...], info: {...} }`
- 品质等级：凡纹(1) 灵纹(2) 宝纹(3) 仙纹(4) 神纹(5) 圣纹(6) 天纹(7)
- 天纹 stat 映射：锋→攻击 御→防御 命→气血 灵→神识，值÷10=百分比
- 反验证：游戏 `api.request` 透明处理 429，脚本拿不到 code
