
<p align="center">
  <img src="https://img.shields.io/badge/version-1.3.9-dbb970?style=for-the-badge" />
  <img src="https://img.shields.io/badge/platform-Tampermonkey-9be7c3?style=for-the-badge" />
  <img src="https://img.shields.io/badge/license-MIT-8f846f?style=for-the-badge" />
</p>

<h1 align="center">🧘 神识清理</h1>
<h3 align="center">LingVerse Spirit Cleaner</h3>

<p align="center">
  <sub>灵界修仙全自动助手 · 点一下开始，剩下的交给脚本</sub>
</p>

---

## ✨ 一句话

安装后在游戏右下角点 **"开始清理"**，神识消耗、商人购物、护道雇佣、冥想恢复、死亡复活、铭文洗练、藏宝图刷图……全部自动闭环运行。手机微信定时收简报，看一眼就知道在干嘛。

---

## ⚡ 快速开始

```bash
# 1. 装 Tampermonkey
# 2. 点下面链接
```

<p align="center">
  <a href="https://raw.githubusercontent.com/SuRanHF/lingverse-spirit-cleaner/main/lingverse-spirit-cleaner.user.js">
    <img src="https://img.shields.io/badge/📥_一键安装-dbb970?style=for-the-badge&logo=tampermonkey&logoColor=white" />
  </a>
</p>

```
3. 打开游戏 → 右下角面板 → 点"开始清理"
```

---

## 🎯 功能矩阵

| 模块 | 能力 |
|---|---|
| 🔄 **核心循环** | 自动探索 · 神识监测自动衔接 · 夜间模式 · 倍率自由 |
| ⚔️ **战斗系统** | 弱怪自战 · 自动护道(最低价/合击/单独) · 战后自动回血 |
| 🛒 **商人处理** | 传说才买 · 关键词+品质筛选 · 价格上限 · 严格/宽松匹配 |
| 💚 **自动恢复** | 回血/回灵独立优先级 · 宗门治疗 · 装备自动维修 |
| 🧘 **冥想系统** | 自动冥想 · 高级冥想优先 · 收功后自动回探索 |
| 💀 **死亡处理** | 自动引渡复活 · 复活后自动恢复 · 可跳到指定地图 |
| 🎴 **铭文洗练** | API直调 · 凡纹~天纹七品质 · 十连/百连 · 自动装配 |
| 🗺️ **藏宝图** | 批量刷图 · 数量/间隔可配 · 耗尽自动切探索 |
| 🏯 **试炼塔** | 自动挑战 · 最优buff选择 · 结束自动切探索 |
| ⚗️ **Buff管理** | 虚空淬体自动维持 · 隐秘符自动使用 · 失败自动关闭 |
| 🗡️ **本命吞噬** | 自动吞噬同类型装备或材料 |
| 👥 **社交处理** | 自动收徒 · 处理徒弟问道/护道/历练 |
| 📱 **微信通知** | 清理中10min/冥想中20min推送 · 死亡/复活通知 · 清理统计 |

---

## 📊 微信通知

手机上看一眼就知道脚本在干嘛：

```
🧹 开始清理            角色：苏冉
🔄 清理中(10min)       神识剩余：120/200
🧘 开始冥想            预计下一轮：20:35
🧘 冥想中(20min)       预计收工：145/200
✨ 高级冥想            仙缘 125→123
💀 角色陨落            位置：青云城
🔄 已引渡归来           前往：灵溪村
✅ 清理统计            342次探索 · 47次遭遇 · 1次死亡
```

---

## 🎛️ 界面

- 金色暗色主题，六个标签页分类
- 可拖拽、可收起成横幅、可调节大小
- 设置自动保存 `localStorage`，重启不丢
- 内置版本公告 + 云端更新检测

---

## 🔧 配置要点

| 功能 | 关键设置 |
|---|---|
| 商人 | 关键词用空格/逗号分隔，支持品质名（传说/史诗...），品质优先+严格匹配可选 |
| 恢复 | 回血顺序：灵力疗伤→丹药→宗门；回灵顺序：灵石凝炼→丹药→宗门 |
| 铭文 | 先选装备→设品质(凡纹~天纹)→设属性(攻击/防御/气血/神识)→数值支持百分比 |
| 更新 | 每60秒检查云端 `release.json`，Gitee国内直连 |

---

## 📁 仓库结构

```
lingverse-spirit-cleaner/
├── lingverse-spirit-cleaner.user.js   ← 脚本本体
├── README.md                          ← 你正在看
├── release.json                       ← 更新公告
├── versions/                          ← 历史版本
└── CLAUDE.md                          ← 项目规则
```

- 服务器部署 → [lingverse-server-deploy](https://github.com/SuRanHF/lingverse-server-deploy)
- 发布工具 → 本地，不上传

---

## 🛠️ 技术栈

`Userscript` · `JavaScript` · `localStorage` · Tampermonkey API · 游戏 `api.request` 桥接 · Gitee 自动更新

---

<p align="center">
  <sub>made with 🧘 by SuRanHF</sub>
</p>
