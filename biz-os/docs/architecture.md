# BOS 智能业务管理系统 — 系统架构

## 一、架构总览

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         前端 (Frontend)                                  │
│            纯 HTML + CSS + JavaScript (ES5 兼容，无框架)                  │
│                                                                          │
│  index.html (入口)                                                       │
│    ├── css/style.css       全局样式                                       │
│    ├── js/api.js           HTTP 客户端 (fetch 封装)                       │
│    ├── js/app.js           路由导航 + 动态权限 + 登录                     │
│    ├── js/pages/dashboard.js     工作台                                   │
│    ├── js/pages/suppliers.js     资源管理（运营商线路）                    │
│    ├── js/pages/spatial.js       项目管理（空间节点）                      │
│    ├── js/pages/customers.js     客户管理                                 │
│    ├── js/pages/contracts.js     合同管理                                 │
│    ├── js/pages/settings.js      系统设置（组织/人员/角色/微信/业务）     │
│    ├── js/pages/departments.js   组织架构                                 │
│    └── js/pages/staff.js         人员管理                                 │
└──────────────────────┬───────────────────────────────────────────────────┘
                       │ HTTP JSON (fetch)
                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        后端 (Backend)                                    │
│            Node.js + Express.js — server.js (端口 3100)                  │
│                                                                          │
│  Routes (路由层)                        Services (服务层)                │
│  ├── /api/suppliers     运营商线路       ├── csvService.js               │
│  ├── /api/spatial       空间节点          │   Excel/CSV 导入导出          │
│  ├── /api/customers     客户管理          ├── reminderEngine.js           │
│  ├── /api/contracts     合同管理           │   智能级联提醒引擎            │
│  ├── /api/dashboard     看板聚合          └── wechatService.js            │
│  ├── /api/reminder      提醒引擎触发           微信模板消息推送            │
│  ├── /api/departments   部门管理                                        │
│  ├── /api/staff         人员管理+登录                                   │
│  ├── /api/settings      系统设置+角色权限                               │
│  └── /api/wechat        微信回调+二维码绑定                             │
└──────────────────────┬───────────────────────────────────────────────────┘
                       │ sql.js (SQLite WASM 驱动)
                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     数据库 (Database)                                    │
│         文件: backend/broadband_os.db (SQLite)                           │
│         自动备份: broadband_os.db.YYYY-MM-DD.backup                      │
│                                                                          │
│  表关系:                                                                 │
│  ┌──────────────┐       ┌──────────────┐       ┌──────────────┐        │
│  │supplier_lines│◄──┐   │spatial_nodes │       │  customers   │        │
│  │(运营商线路)   │   │   │(空间节点)     │       │  (客户)      │        │
│  └──────────────┘   │   └──────┬───────┘       └──┬────┬──────┘        │
│       ▲             │          │ ▲                │    │                │
│       │             │          │ │                │    │(连锁关系)       │
│       │     ┌───────┴──┐       │ │                │    ▼                │
│       │     │project_  │       │ │                │  parent_id          │
│       │     │lines     │───────┘ │                │  (自引用)           │
│       │     │(多对多)   │         │                │                     │
│       │     └──────────┘         │                │                     │
│       │                          ▼                │                     │
│       │                    ┌──────────┐          │                     │
│       └────────────────────┤contracts │◄─────────┘                     │
│                            │(合同)     │                               │
│                            └──────────┘                               │
│                                                                          │
│  ┌──────────┐       ┌──────────┐       ┌──────────────────┐           │
│  │departments│◄──────┤  staff   │       │system_settings   │           │
│  │(部门)     │(自引用)│(人员)    │       │(KV配置)          │           │
│  └──────────┘       └──────────┘       └──────────────────┘           │
└──────────────────────────────────────────────────────────────────────────┘
```

## 二、数据库表结构

### 2.1 运营商线路表 (supplier_lines)

| 字段 | 类型 | 说明 |
|------|------|------|
| line_id | TEXT PK | 线路编号（如 CT-001） |
| provider | TEXT NOT NULL | 运营商（中国电信/中国联通/中国移动） |
| circuit_number | TEXT NOT NULL | 电路编号 |
| total_bandwidth | INTEGER NOT NULL | 总带宽(Mbps) |
| purchase_date | TEXT NOT NULL | 采购日期 |
| expire_date | TEXT NOT NULL | 到期日期 |
| cost_annual | REAL | 年成本(元) |
| device_photos | TEXT | 设备照片JSON数组 |
| install_location | TEXT | 安装位置 |
| remarks | TEXT | 备注 |

### 2.2 空间节点表 (spatial_nodes)

| 字段 | 类型 | 说明 |
|------|------|------|
| node_id | TEXT PK | 节点编号 |
| node_name | TEXT NOT NULL | 项目名称 |
| node_type | TEXT NOT NULL | 类型（园区/单体楼宇/独立散点） |

### 2.3 项目-线路关联表 (project_lines)

| 字段 | 类型 | 说明 |
|------|------|------|
| node_id | TEXT PK | 空间节点ID |
| line_id | TEXT PK | 线路ID |

多对多关联：一个项目可承载多条线路，一条线路可服务多个项目。

### 2.4 客户表 (customers)

| 字段 | 类型 | 说明 |
|------|------|------|
| customer_id | TEXT PK | 客户编号 |
| company_name | TEXT NOT NULL | 公司名称 |
| cust_type | TEXT NOT NULL | 客户类型（自定义） |
| parent_id | TEXT | 上级客户ID（连锁店关系） |
| wechat_openid | TEXT | 微信OpenID |
| contact_person | TEXT | 联系人 |
| contact_phone | TEXT | 联系电话 |
| address | TEXT | 地址 |

### 2.5 合同表 (contracts)

| 字段 | 类型 | 说明 |
|------|------|------|
| contract_id | TEXT PK | 合同编号（如 HT-2026-001） |
| customer_id | TEXT FK | 关联客户 |
| biz_type | TEXT NOT NULL | 业务类型（宽带自运营/宽带直售/IT外包） |
| node_id | TEXT FK | 关联安装位置 |
| allocated_bw | INTEGER | 分配带宽(Mbps) |
| start_date | TEXT NOT NULL | 生效日期 |
| duration_months | INTEGER NOT NULL | 签约周期(月) |
| end_date | TEXT | 到期日（自动计算） |
| monthly_fee | REAL | 费用(元) |
| billing_cycle | TEXT | 计费周期（月/季/年） |
| status | TEXT | 状态（进行中/即将到期/已到期/已续约） |
| renewed_from | TEXT | 续约来源合同ID |

### 2.6 部门表 (departments)

| 字段 | 类型 | 说明 |
|------|------|------|
| dept_id | TEXT PK | 部门编号 |
| dept_name | TEXT NOT NULL | 部门名称 |
| parent_id | TEXT | 上级部门ID |

### 2.7 人员表 (staff)

| 字段 | 类型 | 说明 |
|------|------|------|
| staff_id | TEXT PK | 人员编号 |
| name | TEXT NOT NULL | 姓名 |
| username | TEXT UNIQUE | 登录账号 |
| password | TEXT | 登录密码 |
| phone | TEXT | 手机号 |
| email | TEXT | 邮箱 |
| dept_id | TEXT FK | 所属部门 |
| position | TEXT | 职位 |
| role | TEXT | 角色（admin/manager/operator/viewer或自定义） |
| status | TEXT | 状态（active/disabled） |
| wechat_openid | TEXT | 微信OpenID（用于接收管理通知） |

### 2.8 系统设置表 (system_settings)

KV 存储结构：

| 字段 | 说明 |
|------|------|
| setting_key | 配置键（主键） |
| setting_value | 配置值 |
| setting_group | 分组（general/wechat/biz/system） |
| description | 描述 |

## 三、API 路由清单

### 3.1 运营商线路 `/api/suppliers`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | / | 获取所有线路（支持搜索） |
| GET | /:id | 获取单条线路 |
| POST | / | 创建线路 |
| PUT | /:id | 更新线路 |
| DELETE | /:id | 删除线路 |
| POST | /batch-delete | 批量删除 |
| POST | /upload-photos | 上传设备照片 |
| GET | /export | 导出Excel |
| GET | /template | 下载导入模板 |
| POST | /import | 导入CSV/XLSX |

### 3.2 空间节点 `/api/spatial`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | / | 获取所有节点（含线路信息） |
| GET | /:id | 获取单个节点 |
| POST | / | 创建节点（含线路关联） |
| PUT | /:id | 更新节点 |
| DELETE | /:id | 删除节点 |
| POST | /batch-delete | 批量删除 |
| GET | /export | 导出Excel |
| GET | /template | 下载导入模板 |
| POST | /import | 导入CSV/XLSX |

### 3.3 客户管理 `/api/customers`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | / | 获取所有客户（含合同过期状态） |
| GET | /:id | 获取单个客户 |
| GET | /config/types | 获取客户分类配置 |
| GET | /tree | 获取连锁店结构树 |
| GET | /:id/overview | 客户全景视图 |
| POST | / | 创建客户 |
| PUT | /:id | 更新客户 |
| DELETE | /:id | 删除客户 |
| POST | /batch-delete | 批量删除 |
| GET | /export | 导出Excel |
| GET | /template | 下载导入模板 |
| POST | /import | 导入CSV/XLSX |

### 3.4 合同管理 `/api/contracts`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | / | 获取所有合同（支持搜索/筛选） |
| GET | /:id | 获取单个合同详情 |
| POST | / | 创建合同（自动计算到期日） |
| PUT | /:id | 更新合同 |
| DELETE | /:id | 删除合同 |
| POST | /batch-delete | 批量删除 |
| POST | /:id/renew | 一键续约 |
| POST | /:id/undo-renew | 撤销续约 |
| GET | /export | 导出Excel |
| GET | /template | 下载导入模板 |
| POST | /import | 导入CSV/XLSX |

### 3.5 看板 `/api/dashboard`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | / | 聚合数据（统计/红区/黄区/超卖风险/级联影响） |

### 3.6 其他

| 前缀 | 主要功能 |
|------|---------|
| /api/departments | 部门CRUD |
| /api/staff | 人员CRUD + 登录认证 |
| /api/settings | 系统设置分组CRUD + 角色权限 |
| /api/reminder | 手动触发提醒引擎 |
| /api/wechat | 微信配置状态/二维码生成/扫码绑定检查/回调 |

## 四、核心业务逻辑

### 4.1 合同状态自动更新

```
每天09:00 + 每次创建/编辑/续约/导入后执行：
  - end_date < 今天  → status = '已到期'
  - end_date >= 今天 且 end_date <= 今天+30天 且未到期 → status = '即将到期'
  - end_date > 今天+30天 且是"即将到期" → status = '进行中'
```

### 4.2 智能级联提醒引擎

```
策略A：运营商大线临期（60天扫描）
  → 计算受影响的空间节点和客户数
  → 生成级联影响预警（企微Markdown）

策略B：客户合同到期（60天扫描）
  → 对终端客户：微信模板消息（30天内）
  → 对内：企微待办

策略C：管理通知（按自定义时间段归并）
  → 按时间段（如60/30/15/7/3/1天）分组
  → 合并所有到期项 → 集中微信通知勾选的管理人员
```

### 4.3 续约机制

```
原合同(状态='已到期')
  ├── 一键续约 → 克隆数据生成新合同
  │    ├── 新合同.renewed_from = 原合同ID
  │    ├── 原合同.status = '已续约'
  │    └── 微信推送续约通知（如已配置）
  │
  └── 撤销续约 → 删除新合同，恢复原合同
       ├── 删除续约产生的新合同
       └── 原合同.status = '进行中'
```

## 五、用户角色与权限

| 角色 | 可访问页面 | 说明 |
|------|-----------|------|
| admin | 全部页面 | 管理员，系统设置 |
| manager | 全部页面 | 经理，系统设置 |
| operator | 工作台/资源/项目/客户/合同 | 专员，无系统设置 |
| viewer | 工作台/客户/合同 | 观察员，只读 |

> 角色和权限为动态配置，可在系统设置 → 组织架构中自定义增删角色和调整权限矩阵。
