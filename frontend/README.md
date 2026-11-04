# VTC-SAS 前端（组员 A）

Moodle 风格的课程前端，页面通过后端 API 取数据，**没有硬编码任何业务数据**。

- `index.html` —— 课程 Dashboard（已加入课程，卡片式布局）
- `assignments.html` —— 作业列表（作业名称、截止日期、weighting，支持筛选/搜索）
- `attendance.html` —— 出席记录（签到历史 + 今日签到）
- `login.html` —— 登录 / 注册

纯 HTML + CSS + JS，无构建步骤、无第三方依赖。

## 目录结构

```
frontend/
├── index.html            # 课程 Dashboard
├── assignments.html      # 作业列表
├── attendance.html       # 出席记录
├── login.html            # 登录 / 注册
├── css/
│   └── style.css         # Moodle 风格样式
├── js/
│   ├── config.js         # API_BASE 配置（一般不用改）
│   ├── api.js            # fetch 封装：token、401 处理、各接口
│   ├── normalize.js      # 后端数据规范化 + 日期/权重/状态格式化
│   ├── ui.js             # 通用 UI：toast、状态占位、导航栏、登录守卫
│   ├── dashboard.js      # 课程页逻辑
│   ├── assignments.js    # 作业页逻辑
│   ├── attendance.js     # 出席页逻辑
│   └── login.js          # 登录页逻辑
└── README.md
```

## 快速开始

### 1. 启动后端

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

后端默认跑在 `http://127.0.0.1:8000`。

### 2. 启动前端（独立静态服务器，推荐）

```powershell
cd frontend
python -m http.server 5500
```

浏览器打开 `http://127.0.0.1:5500/login.html`（或直接打开根路径 `http://127.0.0.1:5500/`，默认就是登录页）。

> `js/config.js` 会自动识别：本机 5500 端口访问时，API 请求自动发往 `http://127.0.0.1:8000`；
> 同源部署（8000 端口）时走相对路径 `/api/...`，无需改配置。

### 3. 注册 / 登录

第一次使用没有账号，先点登录页底部「注册一个」：

- 用户名、邮箱、密码必填；
- 角色可选「学生 / 教师」；
- 注册成功会自动登录并进入课程 Dashboard。

### 4. 建议的体验流程

1. 注册一个**教师**账号 → 加入或创建课程；
2. 注册一个**学生**账号 → 点「加入课程」，输入教师给的课程代码；
3. 作业数据可用教师账号调用 `POST /api/tasks/` 创建，或由 Chatbot 创建后出现在页面上；
4. 出席页点「签到（出勤）」即可写入今天记录。

## 页面与后端接口对应

| 页面 | 接口 | 说明 |
| --- | --- | --- |
| login.html | `POST /api/auth/login` | form 表单提交 `username + password`，返回 `access_token` |
| login.html（注册） | `POST /api/auth/register` | JSON：`username + email + password + role` |
| 导航栏 | `GET /api/auth/me` | 显示用户名与角色；教师才显示「创建课程」 |
| index.html | `GET /api/courses/my` | 已加入课程列表 |
| index.html | `POST /api/courses/join/{course_code}` | 加入课程（弹窗） |
| index.html（教师） | `POST /api/courses/` | 创建课程：`code + name + description?` |
| assignments.html | `GET /api/tasks/` | 作业列表 |
| assignments.html | `GET /api/courses/my` | 用于「课程」列显示课程代码、课程筛选下拉 |
| attendance.html | `GET /api/attendance/my` | 签到历史（`date` + `status`） |
| attendance.html | `POST /api/attendance/checkin` | 签到：`{"status": "present"}` |

所有业务接口都会自动带上 `Authorization: Bearer <token>`；token 存在 `localStorage` 的 `vtcsas_token` 里。
接口返回 401 时前端会自动清除会话并跳回登录页。

## 字段说明（与 backend/app/models.py 对齐）

- 课程：`id / code / name / description`，卡片展示 `code + name + description`；
- 作业：`title / due_date / weighting / course_id / is_completed`；
  - `due_date` 按本地时区显示为 `YYYY-MM-DD HH:mm`；
  - `weighting` 是字符串，纯数字会自动补 `%`（例如 `30` → `30%`），其它文本原样显示；
  - 状态：已完成 / 已截止（红）/ 即将截止（7 天内，橙）/ 进行中（蓝）/ 未设截止；
- 出席：`date`（`YYYY-MM-DD`）+ `status`（`present / late / absent`，分别显示为 出勤 / 迟到 / 缺勤）。

数据规范化在 `js/normalize.js`，后端字段若调整，改这一个文件即可。

## 提交到仓库（组员 A 分支）

按群里的约定，先开一个分支再做，避免冲突：

```powershell
git clone https://github.com/Alex06068/vtc-sas.git
cd vtc-sas
git checkout -b frontend-moodle

# 把本目录的 frontend/ 复制进仓库根目录
git add frontend
git commit -m "feat(frontend): Moodle 风格课程 / 作业 / 出席页面"
git push origin frontend-moodle
```

然后在 GitHub 上开 Pull Request 合并到 `main`（或直接找组长确认后再合并）。

## 小提示

- 如果页面报「无法连接后端服务」，先确认后端已启动、`js/config.js` 里的 API_BASE 指向正确；
- 后端 CORS 配置为允许所有来源，前端用 5500 端口跨到 8000 访问没有问题；
- 「创建课程」按钮只对教师角色显示，学生调用对应接口会被后端以 403 拒绝；
- 同源部署时若想让后端直接返回这些页面，需要在 `backend/app/main.py` 里补上对应的 `FileResponse` 路由（或参考现有 `static/*.html` 的写法）。
