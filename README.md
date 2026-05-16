# iRAS

> 循环水养殖工程设计平台

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
![Version](https://img.shields.io/badge/version-1.7.0-green.svg)
![Status](https://img.shields.io/badge/status-stable-brightgreen.svg)

iRAS 是一个面向**水产养殖工程师、设计院、高校研究者**的循环水养殖系统(Recirculating Aquaculture System)工程设计开源工具。覆盖**工艺设计 → P&ID 工艺图 → 设备清单 → 投资财务评价 → 16 章可研报告生成**的完整工作流。

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
- **8 项工程逻辑精化** — MBBR 单价标签 / 设备选型自适应(支持千吨级单模块)/ 19 个百分比字段强制 [0,100] 钳制 / 打印优化(A4 分页)等
- **6 处手册公式订正** — NO₃ 产生率 / V_RDF / V_BF / CO₂ 单位换算 / 双节点稳态 / 残值公式(设备 5% + 土建 20%)

### v1.7:氧锥拓扑 + K-101 + 系统排水重构 + 全面审计修复 ⭐ 新增

- **氧锥工艺拓扑 mainline / bypass 真实建模** — v1.6 前 UI 上有"主流/旁路"两选项但模型完全没区分(UI 假承诺),v1.7 通过文献调研(Linde SOLVOX / Pentair AES Speece / PR Aqua PPC / Global Seafood Advocate 2019)做实。新增 5 个工艺字段,P&ID 自动重画 bypass 三件套(A-601 + P-602 + M-601 混合点)。**1000 t 大西洋三文鱼实测节能 30 kW + CAPEX 节省 612 万元**
- **K-101 鱼池增氧鼓风机(air 模式专属)** — 之前 air 模式只有 K-302(BF 风机),缺鱼池主增氧风机,温水鱼种(罗非 / 鳗 / 对虾)大规模 RAS 无法用工具自动生成。v1.7 补齐 K-101,与 K-302 同口径 1+1 备
- **系统排水重构** — 旧版"RDF 反冲(%)"是反冲管瞬时分流比导致换水率 101%/d 物理荒谬。v1.7 删 UI 输入框 + 反冲泵不再独立设备 + 新增"系统排水"卡片(流量按 `V_total × exchangeDaily` 算,与换水率定义一致,TSS 口径说明为"沉淀池入口,含污泥")
- **全面审计修复 27 项** — 含 #25 灾难性 bug(`buildContext()` return 漏 `workflow`, 致 55 处条件分支失效, **潜伏 1+ 年被 nunjucks "缺失即跳过"机制完全掩盖**,报告渲染不报错但实际不工作)。其他: K-101 modulePerSpec 缺失、系统排水硬编码 7.5%、finance-core 70/30 改用真实拆分、蛋分 DOM 公式严格物料守恒、CO₂ 风压钳制 [0.3, 10] 补全、T_room 钳制 ±2°C → ±5°C 等
- **技术手册升级至 117 页 v1.7 完整版**(WeasyPrint 生成,A4)

完整发布说明见 [v1.7 Release Notes](https://github.com/chengsunmail/iras/releases/tag/v1.7.0)

---

## 快速开始

### 方式 1:在线下载

从 Releases 页面下载最新版 zip 包,解压后双击 `index.html` 即可在浏览器中打开。

- 🌍 **GitHub Releases**(海外):https://github.com/chengsunmail/iras/releases
- 🇨🇳 **Gitee Releases**(国内镜像):https://gitee.com/chengsunmail/iras/releases

> ⚠️ **百度网盘链接已删除,国内用户请从 Gitee 下载。**

### 方式 2:本地克隆

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

📕 **完整技术手册 v1.7(117 页 PDF)**:[GitHub](https://github.com/chengsunmail/iras/releases) · [Gitee](https://gitee.com/chengsunmail/iras/releases)
- 工艺原理与文献校准
- 设备设计公式与默认参数
- 4 工况成本基线 + v1.7 拓扑对比基线
- 投资财务评价方法
- 可研报告生成器
- 站级设备(液氧储罐)
- 氧锥拓扑 mainline / bypass 工程建模(v1.7 新)
- K-101 鱼池增氧鼓风机(v1.7 新)
- 系统排水重构与质量守恒(v1.7 新)
- 完整符号表 + 参考文献 + 鱼种参数表

📖 **在线使用说明**:在主页面点击右上角 "? 帮助" 按钮

---

## 使用场景

iRAS 适用于以下场景:

- ✅ **设计院**:RAS 项目的早期工艺方案 / 概算 / 可研草稿
- ✅ **业主 / 投资方**:RAS 项目可行性快速评估
- ✅ **设备商 / 总包**:项目选型与方案对比
- ✅ **高校 / 研究者**:RAS 工程教学与课程设计
- ✅ **政府机构**:RAS 产业园规划与项目评审

iRAS **不适合**的场景:

- ❌ 替代正式的环境影响评价 / 安全评价 / 节能评价(必须由有资质机构出具)
- ❌ 替代施工图详细设计(本工具是工程概算阶段,精度 ±40%)
- ❌ 替代专业财务软件做 Monte Carlo 模拟(本工具是单点确定性现金流模型)

---

## 引用

如在学术论文、工程报告或商业项目中使用 iRAS,请引用:

```
孙程 (2026). iRAS 循环水养殖工程设计平台 (Version 1.7.0).
海南登登科技咨询有限公司. https://github.com/chengsunmail/iras
```

或 BibTeX 格式:

```bibtex
@software{iras2026,
  author       = {Sun, Cheng},
  title        = {iRAS: A Platform for Recirculating Aquaculture
                  System Engineering Design},
  version      = {1.7.0},
  year         = {2026},
  publisher    = {Hainan Dengdeng Technology Consulting Co., Ltd.},
  url          = {https://github.com/chengsunmail/iras}
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
作者:**孙程**(水处理工艺工程师)

> 由水处理工艺工程师与 AI 协作开发,
> 物理模型基于公开文献和工业实测数据校准(Timmons 2010、国家海水鱼产业技术体系、Atlantic Sapphire 公开数据、Linde SOLVOX、Pentair AES Speece、Sharrer 2010 等)。

---

## 版本历史

| 版本 | 日期 | 主要内容 |
|---|---|---|
| **v1.7** | **2026-05** | **氧锥拓扑 mainline/bypass + K-101 air 模式 + 系统排水重构 + 审计修复 27 项(含 #25 灾难性 bug)** |
| v1.6 | 2026-05 | 站级设备(液氧储罐)+ UI 重构 + 8 项工程逻辑精化 + 6 处手册公式订正 |
| v1.5 | 2026-05 | 可研报告生成器(16 章 + docx + 模板引擎) |
| v1.4 | 2026-05 | 投资财务评价(NPV/IRR + 8 张标准表 + Excel 导出) |
| v1.3 | 2026-05 | 多模块并联 + N+1 备用 + P&ID + 设备清单 |
| v1.2 | 2026-05 | 全局气候 + 双节点稳态热平衡 + 4 工况对比 |
| v1.1 | 2026-04 | 物理框架重构 + CAPEX/OPEX + V_total 完整建模 |
| v1.0 | 2026-04 | 稳态浓度计算 + 设备选型 |

---

## 免责声明

本工具计算结果仅供工程概算参考。

- 实际工程必须结合现场水质监测、批量试验数据、当地规范与专业工程师判断
- 投资概算精度约 ±40%,实际造价以厂商报价和工程招标为准
- 不替代正式的环境影响评价 / 安全评价 / 节能评价
- v1.7 氧锥拓扑 mainline / bypass 经济性对比基于 1000 t 大西洋三文鱼工况实测,中小项目(Q &lt; 5000 m³/h)bypass 优势减弱,建议项目具体核算
- v1.7 "系统排水"输出口径为**沉淀池入口**浓度(含污泥,质量守恒),不可直接对照 GB 8978 等污水管口标准
- 因使用本软件计算结果产生的工程决策后果,作者与公司不承担责任

完整免责声明见技术手册附录 F。
