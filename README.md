# iRAS

> 循环水养殖工程设计平台

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
![Version](https://img.shields.io/badge/version-1.9.0-green.svg)
![Status](https://img.shields.io/badge/status-stable-brightgreen.svg)

iRAS 是一个面向**水产养殖工程师、设计院、高校研究者**的循环水养殖系统(Recirculating Aquaculture System)工程设计开源工具。覆盖**工艺设计 → 碳酸盐平衡水化学 → P&ID 工艺图 → 设备清单 → 投资财务评价 → 16 章可研报告生成**的完整工作流。

🌐 **在线使用**:https://iras.cn

---

## 主要功能

### v1.0–v1.3:工艺设计与工程化
- **多阶段养殖规模反推**(尾数流守恒 + Little's Law)
- **精确循环方程水质稳态仿真**(TAN / TSS / DOM / NO₃ / DO / CO₂)
- **主流串联 + 旁路并联**混合建模(蛋分 / 反硝化 / AOP)
- **盐度修正**(DO 饱和度 + 硝化效率 + 海水臭氧溴酸盐警告)
- **设备规格与选型**(RDF / BF / UV / CO₂ 脱气 / 蛋分 / AOP / 反硝化 / 增氧 / 泵)
- **多模块并联 + N+1 备用**(v1.3 新增)
- **P&ID 工艺图自动生成**(v1.3.x 新增)
- **设备清单导出**(v1.3.x 新增)

### v1.2:全局气候 + 双节点稳态热平衡
- **温带 / 亚热带 / 北欧 / 中国南方** 4 工况一键切换
- **车间空气-水体双节点联立求解**(车间散热 + 鱼代谢热 + 板换回收)
- **挪威 / 海南 / 青岛**等典型场景热泵装机自动估算

### v1.4:投资财务评价
- **NPV / IRR / 投资回收期 / 盈亏平衡点**完整计算
- **8 张标准财务表**(收入 / 成本 / 利润 / 现金流 / 还款 / 敏感性等)
- **5 因子敏感性分析**(售价 / CAPEX / 产量 / 饲料 / 电费)
- **Excel 一键导出**(SheetJS,7 个工作表)

### v1.5:可研报告生成器
- **16 章扩展版可研报告**(发改委政府立项编制规范)
- **20 字段项目元数据**(项目身份 / 业主 / 用地 / 编制单位)
- **3 张嵌入图**(工艺流程示意图 / 累计现金流 / Tornado 敏感性)
- **8 鱼种条件分支**(三文鱼 / 大菱鲆 / 石斑 / 加州鲈 / 鳜 / 罗非 / 鳗 / 对虾)
- **.docx 文档输出**(浏览器侧 docx.js 生成)

### v1.6:站级设备 + UI 重构
- **液氧储罐站级化** — 修复跨阶段重复计 CAPEX(千吨级项目精度提升约 3%),P&ID / 设备清单 / 报告全部同步
- **UI 整体重构** — 可折叠分区(`<details>`)+ sticky 双行工具栏 + 2×2 KPI 卡片 + 配色克制化
- **8 项工程逻辑精化** + **6 处手册公式订正**

### v1.7:氧锥拓扑 + K-101 + 系统排水重构 + 全面审计修复

- **氧锥工艺拓扑 mainline / bypass 真实建模** — 新增 5 个工艺字段,P&ID 自动重画 bypass 三件套(A-601 + P-602 + M-601 混合点)。**1000 t 大西洋三文鱼实测节能 30 kW + CAPEX 节省 612 万元**
- **K-101 鱼池增氧鼓风机(air 模式专属)** — air 模式补齐,覆盖罗非 / 鳗 / 对虾等温水鱼种
- **系统排水重构** — 删除"RDF 反冲(%)"输入,新增"系统排水"卡片(流量按 `V_total × exchangeDaily` 算,质量守恒)
- **全面审计修复 27 项** — 含 #25 灾难性 bug (`buildContext()` return 漏 `workflow`,致 55 处条件分支失效,潜伏 1+ 年)

### v1.9:碳酸盐平衡 + O₂ 物理校准 + CO₂ 公式修正 ⭐ 最新

中文版直接从 v1.7 跳到 v1.9, 与英文版 (Polarlys Innovation AS) 同步。本次升级把工具从"工程算成本工具"推进到"工程算成本 + 水化学合规工具"。

- **碳酸盐平衡求解 (carbonate.js, 226 行 独立模块)** — 完整水化学物种平衡, 平衡常数 verbatim 移植自 **PyCO2SYS 1.8.3** (国际标准):K₁/K₂ (Millero 2010, 盐度 0-50) / K_B / K_S / K_a(NH₃) (Clegg & Whitfield 1995) / K_sp 方解石 (Mucci 1983)。vs PyCO2SYS 验证 max|ΔpH| = **1×10⁻⁵** (实验室级精度)
- **两种 pH 控制策略** — 工艺面板新增"pH 控制"下拉:
  - `持碱度` (默认):设碱度目标,pH 由平衡涌现
  - `持目标 pH`:设目标 pH,工具反推所需碱度
- **沿程水质 UI** — 鱼池节点新增 **pH / NH₃-N (μg/L) / β 缓冲强度 / 碱度需** 4 行显示,鱼种敏感性着色
- **O₂ Q10 参考温度对齐** (validation memo F1) — 把 Q10 参考温度从硬编码 20°C 改为物种 `metabRefTemp`,与热模型一致。同时**数学等价重写** o2BaseFactor (8 鱼种):salmon 0.32 → 0.2263, turbot 0.28 → 0.1980, tilapia 0.16 → 0.2786 等。数值结果不变,但语义更清晰(新值直接是 tempOpt = metabRefTemp 时的 O₂:feed 比)
- **CO₂ 公式修正** (validation memo F2) — v1.7 之前 `co2Daily` 只算呼吸,漏算硝化产 CO₂。v1.9 加入 NH₄⁺ + 2HCO₃⁻ + 2O₂ → NO₃⁻ + 2CO₂ 反应贡献(**6.286 g CO₂/g TAN-N**),1000 t 三文鱼成鱼期 co2Daily 从 700 → 1221 kg/d(+74%)
- **finance-core.js 零利率 bug 修复** — 等额本息公式在 r=0 时除零产生 NaN,v1.9 修复(影响政策性贴息贷款工况)
- **技术手册升级至 124 页 v1.9 完整版**(新增 §4.5 碳酸盐平衡章节 + v1.9 演进章节)

> **重要**:v1.9 升级**不改变** 1000 t 三文鱼综合成本基准(仍为 **36.70 元/kg**)。o2BaseFactor 是数学等价重写,数值结果与 v1.7 完全一致。

完整发布说明见 [v1.9 Release Notes](https://github.com/chengsunmail/iras/releases/tag/v1.9.0)

---

## 8 工况实测数据 (v1.9 jsdom 实测)

| 鱼种 | 产量 | 盐度 | 综合成本 (元/kg) | pH | NH3-N (μg/L) | Ω 方解石 |
|------|------|------|----------------|------|--------------|---------|
| salmon (三文鱼) mainline | 1000t | 30‰ | **36.70** | 7.26 | 1.9 | 0.72 |
| salmon (三文鱼) bypass | 1000t | 30‰ | **35.41** | 7.26 | 1.9 | 0.72 |
| turbot (大菱鲆) | 500t | 28‰ | 47.24 | 7.15 | 2.4 | 0.57 |
| tilapia (罗非鱼) | 1000t | 淡水 | **28.26** | 7.52 | 8.5 | 淡水 |
| grouper (石斑鱼) | 500t | 30‰ | 39.48 | 7.06 | 4.1 | 0.66 |
| bass (加州鲈) | 300t | 淡水 | 40.16 | 7.50 | 9.7 | 淡水 |
| eel (鳗鲡) | 200t | 淡水 | 59.73 | 7.61 | **12.6 ⚠️** | 淡水 |
| mandarin (鳜鱼) | 200t | 淡水 | 51.08 | 7.57 | 11.5 | 淡水 |
| shrimp (对虾) | 100t | 25‰ | 39.81 | 7.23 | 4.6 | 0.89 |

**与 Nordic Aqua 宁波 2024 Q2 实测对照**:iRAS 三文鱼 1000t bypass 综合成本 35.41 元/kg + 软成本(人工 / 苗 / 管理)~5 元/kg ≈ **40 元/kg**,与 Nordic Aqua 实测 41 元/kg (EUR 5.23/kg) **完全吻合**。

---

## 快速开始

### 方式 1:在线使用 (推荐)

🌐 **https://iras.cn** — 直接打开,无需安装

### 方式 2:下载离线版

从 Releases 页面下载最新版 zip 包,解压后双击 `index.html` 即可在浏览器中打开。

- 🌍 **GitHub Releases**(海外):https://github.com/chengsunmail/iras/releases
- 🇨🇳 **Gitee Releases**(国内镜像):https://gitee.com/chengsunmail/iras/releases

### 方式 3:本地克隆

```bash
# GitHub
git clone https://github.com/chengsunmail/iras.git

# 或 Gitee(国内)
git clone https://gitee.com/chengsunmail/iras.git

cd iras
# 双击 index.html 在浏览器中打开
```

### 系统要求

- 任何现代浏览器(Chrome / Edge / Firefox / Safari)
- **无需安装,无需后端,无需联网**(首次加载 Tailwind / nunjucks / docx.js / SheetJS 需要联网,之后可离线使用)

---

## 文档

📕 **完整技术手册 v1.9(124 页 PDF)**:[GitHub](https://github.com/chengsunmail/iras/releases) · [Gitee](https://gitee.com/chengsunmail/iras/releases) · [iras.cn](https://iras.cn/iRAS_技术手册_v1.9_完整版.pdf)

主要章节:
- 第 1-3 章:RAS 工艺原理 + 水质参数与控制标准
- 第 4 章:氮碳循环 + **§4.5 碳酸盐平衡 (v1.9 新)**
- 第 5-7 章:养殖规模设计 + 污染负荷计算 + 精确循环方程
- 第 8-15 章:RDF / BF / UV / 蛋分 / AOP / 反硝化 / CO₂ / 增氧设备设计
- 第 16-22 章:CAPEX / OPEX / 财务评价方法
- 第 23-25 章:三文鱼 / 大菱鲆 / 罗非鱼工程案例 (含 v1.9 碳酸数据)
- 附录 A-F:完整符号表 + 默认参数表 + 鱼种参数表 + **参考文献 40+ 篇** (含 Millero 2010, Clegg & Whitfield 1995, Dickson 1990 等碳酸文献)
- **v1.7 → v1.9 演进章节**:碳酸求解 + 物理校准 + CO₂ 修正 + finance 修复完整说明

📖 **在线使用说明**:在主页面点击右上角 "? 帮助" 按钮

📋 **v1.9 Release Notes**:[完整版](v1_9_RELEASE_NOTES.md)

---

## 使用场景

iRAS 适用于以下场景:

- ✅ **设计院**:RAS 项目的早期工艺方案 / 概算 / 可研草稿
- ✅ **业主 / 投资方**:RAS 项目可行性快速评估
- ✅ **设备商 / 总包**:项目选型与方案对比
- ✅ **高校 / 研究者**:RAS 工程教学与课程设计 (v1.9 碳酸模块对接 PyCO2SYS 实验室标准)
- ✅ **政府机构**:RAS 产业园规划与项目评审

iRAS **不适合**的场景:

- ❌ 替代正式的环境影响评价 / 安全评价 / 节能评价(必须由有资质机构出具)
- ❌ 替代施工图详细设计(本工具是工程概算阶段,精度 ±40%)
- ❌ 替代专业财务软件做 Monte Carlo 模拟(本工具是单点确定性现金流模型)

---

## 引用

如在学术论文、工程报告或商业项目中使用 iRAS,请引用:

```
孙程 (2026). iRAS 循环水养殖工程设计平台 (Version 1.9.0).
海南登登科技咨询有限公司. https://iras.cn
```

或 BibTeX 格式:

```bibtex
@software{iras2026,
  author       = {Sun, Cheng},
  title        = {iRAS: A Platform for Recirculating Aquaculture
                  System Engineering Design},
  version      = {1.9.0},
  year         = {2026},
  publisher    = {Hainan Dengdeng Technology Consulting Co., Ltd.},
  url          = {https://iras.cn}
}
```

---

## 协议与商业服务

本项目以 **GNU Affero General Public License v3 (AGPL v3)** 协议开源。

**重要提示**:AGPL v3 要求,如果您**通过网络向用户提供 iRAS 的服务或基于 iRAS 修改的服务**,您必须以相同协议开源服务端代码。详见 [LICENSE](LICENSE) 文件。

如需以下服务:

- 📋 **可研报告 / 工艺方案咨询**
- 🔧 **iRAS 二次开发或定制**
- 📚 **行业培训或专题讲座**
- 🤝 **项目深度合作**

请通过邮件联系:**6881509@qq.com**

---

## 维护方

**海南登登科技咨询有限公司**
作者:**孙程**(水处理工艺工程师, 挪威 NTNU 博士)

> 由水处理工艺工程师与 AI 协作开发,
> 物理模型基于公开文献和工业实测数据校准:
> - **核心工程**:Timmons & Ebeling 2010, 国家海水鱼产业技术体系, Atlantic Sapphire / Nordic Aqua 公开数据, Linde SOLVOX, Pentair AES Speece, Sharrer 2010
> - **碳酸水化学** (v1.9 新增):Millero 2010, Dickson 1990a/b, Clegg & Whitfield 1995, Mucci 1983, PyCO2SYS 1.8.3

---

## 版本历史

| 版本 | 日期 | 主要内容 |
|---|---|---|
| **v1.9** | **2026-06-28** | **碳酸盐平衡求解 (vs PyCO2SYS 验证) + O₂ Q10 物理校准 + CO₂ 公式修正 (加硝化产 CO₂) + finance 零利率 bug 修复** |
| v1.7 | 2026-05 | 氧锥拓扑 mainline/bypass + K-101 air 模式 + 系统排水重构 + 审计修复 27 项 |
| v1.6 | 2026-05 | 站级设备(液氧储罐)+ UI 重构 + 8 项工程逻辑精化 + 6 处手册公式订正 |
| v1.5 | 2026-05 | 可研报告生成器(16 章 + docx + 模板引擎) |
| v1.4 | 2026-05 | 投资财务评价(NPV/IRR + 8 张标准表 + Excel 导出) |
| v1.3 | 2026-05 | 多模块并联 + N+1 备用 + P&ID + 设备清单 |
| v1.2 | 2026-05 | 全局气候 + 双节点稳态热平衡 + 4 工况对比 |
| v1.1 | 2026-04 | 物理框架重构 + CAPEX/OPEX + V_total 完整建模 |
| v1.0 | 2026-04 | 稳态浓度计算 + 设备选型 |

> v1.8 不发布。中文版直接从 v1.7 跳到 v1.9, 与英文版 (Polarlys Innovation AS) 同步。

---

## 免责声明

本工具计算结果仅供工程概算参考。

- 实际工程必须结合现场水质监测、批量试验数据、当地规范与专业工程师判断
- 投资概算精度约 ±40%,实际造价以厂商报价和工程招标为准
- 不替代正式的环境影响评价 / 安全评价 / 节能评价
- v1.7 氧锥拓扑 mainline / bypass 经济性对比基于 1000 t 大西洋三文鱼工况实测,中小项目(Q &lt; 5000 m³/h)bypass 优势减弱,建议项目具体核算
- v1.7 "系统排水"输出口径为**沉淀池入口**浓度(含污泥,质量守恒),不可直接对照 GB 8978 等污水管口标准
- v1.9 碳酸盐平衡输出 pH / NH₃ / Ω 为**日均稳态(慢性暴露)值**,不是投喂瞬时峰值。生产中投喂 2-4 小时窗口的瞬态峰值另需考虑(β 缓冲强度 + CO₂ 脱气塔容量限定其上限)
- v1.9 NH₃-N 限值为长期暴露(慢性)值,苗种期工具自动收紧到 50%。商业项目还需考虑短期峰值 (Calabrese 2017 / Fivelstad 2013 文献给出区间)
- 因使用本软件计算结果产生的工程决策后果,作者与公司不承担责任

完整免责声明见技术手册附录 F。
