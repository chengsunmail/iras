# 🌊 iRAS · 循环水养殖工程设计平台

**iRAS** (intelligent Recirculating Aquaculture System) 是一款面向水产养殖工程师、设计院、高校研究者的 RAS 工程设计与仿真工具。

输入年产量目标和鱼种 → 系统自动反推多阶段养殖规模、仿真水处理工艺、估算设备规格和投资运行成本。

**纯前端单文件，双击 `index.html` 即可使用，无需安装任何软件。**

---

## ✨ 功能特点

- **多阶段养殖规模反推**：尾数流守恒 + Little's Law，从年产量精确反推各阶段存塘量、水体、投饵量
- **精确循环方程水质仿真**：C_out = Δ/(1-R)，沿程每个处理单元（RDF → 蛋分 → BF → UV → 增氧）浓度阶跃可视化，闭合验证误差 = 0
- **O₂ 按位置分配**：鱼池主增氧（液氧/微孔）只供鱼虾生理耗氧；BF 粗孔曝气独立供硝化 + DOM 耗氧，两套不重叠
- **盐度体系**：Benson & Krause (1984) DO 饱和度公式 + USGS 盐度修正；硝化效率盐度修正 f = max(1-0.01×S, 0.3)；海水臭氧溴酸盐警告
- **主流串联 + 旁路混合建模**：蛋白分离器、AOP、反硝化均按旁路（流量比 × 单次效率 = 系统效率）建模
- **投资概算**：15 类设备单价可编辑 × 工程放大系数 (1.8-2.5)，精度标注 ±40%
- **运行成本核算**：峰值 + 日均双口径（电费/液氧/甲醇/NaHCO₃/饲料/热泵）

---

## 🐟 支持的品种

| 品种 | 水温 | 盐度 | 总周期 | 阶段数 |
|------|------|------|--------|--------|
| 🐟 三文鱼 Salmon | 12-15°C | 淡→海水 | 24 月 | 4 |
| 🐠 大菱鲆 Turbot | 16°C | 海水 28‰ | 18 月 | 3 |
| 🎣 加州鲈 Largemouth Bass | 25°C | 淡水 | 10 月 | 3 |
| 🐍 鳗鲡 Eel | 26-28°C | 淡水 | 12 月 | 3 |
| 🏅 鳜鱼 Mandarin Fish | 26°C | 淡水 | 8 月 | 2 |
| 🐡 罗非鱼 Tilapia | 28°C | 淡水 | 8 月 | 3 |
| 🪸 石斑鱼 Grouper | 27°C | 海水 30‰ | 12 月 | 3 |
| 🦐 南美白对虾 L.vannamei | 30°C | 半咸水 15‰ | 4 月 | 3 |
| 🧪 自定义 Custom | 可调 | 可调 | 可调 | 1+ |

---

## 🚀 快速开始

1. 下载 `index.html` 文件（下载后可改名为 `iRAS.html`）
2. 双击用浏览器打开（Chrome / Edge / Firefox / Safari）
3. 选择鱼种 → 填写年产量目标（吨/年）
4. 系统自动计算，展开各阶段卡片查看详细结果
5. 调整工艺参数后结果即时刷新
6. 点「💾 保存方案」导出 JSON / 点「🖨️ 打印」导出 PDF

### 在线版

> 🔗 [在线体验]()（部署后填入链接）

---

## 🔧 技术栈

- **前端**：HTML5 + JavaScript (ES2020+) + Tailwind CSS (CDN) + Chart.js
- **架构**：纯前端单文件 SPA，无后端，无数据库
- **数据存储**：localStorage 自动保存 + JSON 文件导出/导入
- **打印**：CSS @media print + JS 展开折叠区 → 浏览器原生打印/PDF

---

## 📐 核心算法

### 精确循环方程

```
R = Π(1 - η_i) × (1 - dilution)     总通过率（串联相乘）
C_out = Δ / (1 - R)                   鱼池出水（本循环最高浓度）
C_in  = Δ × R / (1 - R)               增氧后回水（下循环起点）
```

沿程递减：`C_out × (1-η_rdf) × (1-η_skim) × (1-η_bio) × ... = C_in`，闭合验证误差 = 0。

### O₂ 需求三部分

| 来源 | 公式 | 供应位置 |
|------|------|----------|
| 鱼虾生理耗氧 | feed × 0.25 | 鱼池主增氧（液氧/微孔） |
| 硝化菌耗氧 | TAN × 4.57 | BF 粗孔曝气 |
| 有机物氧化 | feed × 0.05 | BF 粗孔曝气 |

### 化学计量

- 硝化：1 g TAN-N → 消耗 4.57 g O₂ + 7.14 g CaCO₃ 碱度
- 反硝化：1 g NO₃-N → 回收 3.57 g CaCO₃ 碱度，消耗 2.47 g 甲醇
- NaHCO₃ 换算：1 kg NaHCO₃ ≈ 0.595 kg CaCO₃ 当量
- CO₂：feed × 0.25 × 1.375 (RQ ≈ 1, 摩尔比 44/32)

---

## 📖 使用说明书

点击软件右上角 `[? 帮助]` 按钮可查看内嵌的完整使用说明书（9 章）。

---

## 📄 许可证

本项目基于 [GNU Affero General Public License v3 (AGPL-3.0)](https://www.gnu.org/licenses/agpl-3.0.html) 开源。

```
Copyright (C) 2026 海南登登科技咨询有限公司
Copyright (C) 2026 孙程 <6881509@qq.com>
```

---

## 📚 参考文献

1. Timmons, M.B., Ebeling, J.M. (2010). *Recirculating Aquaculture*, 2nd ed.
2. Sharma, B., Ahlert, R.C. (1977). Nitrification and nitrogen removal. *Water Research*.
3. Benson, B.B., Krause, D. (1984). DO concentration in freshwater/seawater. *Limnol. Oceanogr.*
4. USEPA (2006). *UV Disinfection Guidance Manual* (UVDGM).
5. Summerfelt, S.T. et al. (2009). Ozonation in RAS. *Aquacultural Engineering*.
6. Mateju, V. et al. (1992). Biological water denitrification. *Enzyme Microb. Tech.*
7. Rusten, B. et al. (2006). Nitrification in saline water. *Aquacultural Engineering*.

---

## ⚠️ 免责声明

本工具的计算结果仅供工程概算参考。实际工程须结合现场水质监测、批量试验数据、当地规范与专业工程师判断。投资概算精度约 ±40%。因使用本软件的计算结果产生的任何工程决策后果，作者与公司不承担责任。

---

## 📬 联系

- 邮箱：6881509@qq.com
- 作者：孙程
- 单位：海南登登科技咨询有限公司
