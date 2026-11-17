# 两个人的账本（Expense Ledger）

一个为情侣/两人设计的记账 Web 应用（PWA），可添加到 iPhone 主屏幕当原生 App 使用。

**线上地址**：https://expense-ledger-20828.app.workbuddy.host/?sharecode=6G43BHLGER

## 功能一览

- **对话记账**：在「说说」页说一句「买水 5 块」，AI 自动解析金额/分类，不确定时给选项
- **语音记账**：点 🎤 说话（内置 iOS 主屏模式语音失败的超时保护）
- **图片识别记账**：点 📷 发账单截图/小票，AI 逐笔提取，确认后批量入账
- **对话查询**：直接问「这个月外卖花了多少」，数字全部本地计算，保证与明细一致
- **明细 + 日历**：按天分组显示当日收支；点月份弹出日历，每格显示当天花费，点某天可筛选
- **总结**：按分类/人员统计，每月导出 Excel
- **双人区分**：粉色女生头像（花花）/ 蓝色男生头像（阿泽），每笔账标注谁付的
- **编码登录**：无需手机号，输入 4 位编码（9999 / 0820）自动登录

## 技术栈

| 部分 | 说明 |
|---|---|
| 前端 | 纯 HTML/CSS/JS 单页应用（无框架、无构建步骤），PWA + Service Worker |
| 后端 | WorkBuddy 云服务（PostgreSQL），全部通过 SECURITY DEFINER 数据库函数（rpc）访问 |
| AI | 云服务内置 LLM：解析口语记账、图片账单提取、把查询翻译成条件 |

## 文件结构

```
ledger/
├── index.html          入口页（注册 Service Worker、加载 SDK）
├── app.js              全部业务逻辑（约 2200 行）
├── style.css           全部样式
├── sw.js               Service Worker（缓存与自动更新）
├── server.py           发布用静态服务器（带禁缓存响应头，防 iOS 缓存旧版）
├── manifest.webmanifest PWA 配置（图标、名称、主题色）
└── icon-*.png          应用图标（180/192/512）
```

## 核心架构（改代码前必读）

### 数据链路

```
浏览器 app.js
  → rpc('ledger_state' | 'ledger_entry_add' | ...)   ← 不直接查表！
  → 数据库函数（SECURITY DEFINER，内部校验 token）
  → books / categories / entries / ledger_session 等表
```

- **登录**：`ledger_login(编码)` 验证 `ledger_login` 表（9999→花花、0820→阿泽），发 64 位 token，前端存 `localStorage('ledger-session-v2')`
- **鉴权**：每次 rpc 都带 token，函数内部验证后才读写数据，前端**没有**任何表的直连权限
- **分类**：两级树（一级分类 → 子类），存在 `categories` 表，`parent_id` 为空即一级

### 改代码后如何发布

1. 本地验证：`node --check app.js` 查语法；`PORT=8766 python3 server.py` 起本地服务，浏览器开 `http://127.0.0.1:8766/index.html?demo=1`（演示模式，预载模拟数据，不碰云端）
2. 发布：通过 WorkBuddy 的应用发布能力重新发布（python 服务模式，startCmd=`python3 server.py`）
3. 用户端：重开图标自动拉新版（SW + 禁缓存头双保险）

### 已知的重要教训（避免踩坑）

- **iOS 主屏 PWA 缓存极顽固**：入口 HTML 可能被冻结在旧版，靠 server.py 的 `Cache-Control: no-cache` + sw.js 双保险；若用户仍见旧版，删除图标重新添加是最终解法
- **CSS 选择器**：容器是 `<div id="app">`，布局规则要写 `#app` 不是 `.app`
- **弹层按钮事件**：点击委托里 `data-stop` 区域只放行非 `close-sheet` 的按钮，别改逻辑否则弹层内按钮全部失效
- **金额上限**：整数 9 位、小数 2 位，键盘输入时已限制

## 协作方式（给不太懂技术的朋友）

1. **下载最新代码**：点仓库绿色「Code」按钮 → Download ZIP，解压即可看到全部文件
2. **本地跑起来看效果**：电脑装 Python 后，在 ledger 目录运行 `python3 server.py`，浏览器打开 `http://127.0.0.1:8766/index.html?demo=1`（demo 模式有模拟数据，随便玩不伤真实账目）
3. **提建议**：直接把想法发给花花，由花花在这个项目的主对话里提出，改动统一由 AI 助理实施，避免两边改乱
4. 若真要自己改代码：改完在仓库页面提交（或让花花这边推送），改动说明写清楚改了哪个文件哪一行

## 数据备份

云端 PostgreSQL 存储所有账目；「总结」页每月可导出 Excel（月度汇总/分类统计/明细三个工作表）。
