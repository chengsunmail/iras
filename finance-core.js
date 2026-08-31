/* ============================================================================
 *   iRAS Finance Core — 共享财务计算模块  (v1.5)
 *
 *   提供 IRR / NPV / 现金流 / 敏感性分析 / 贷款表 等核心函数.
 *   被 finance.html (财务评价页) 和 report.html (可研报告生成器) 共同引用,
 *   避免逻辑重复和维护漂移.
 *
 *   暴露的全局对象: window.iRASFinance
 *     - calculateCore(data, params)
 *     - calculate(data, params)           // = core + sensitivity
 *     - buildLoanSchedule(L, r, n, method)
 *     - npv(cfs, rate)
 *     - irr(cfs)
 *     - sensitivityAnalysis(data, baseParams)
 *
 *   修复记录:
 *     v1.5 Bug 2: 自有资金现金流双重投资缺陷 (loan 改为只覆盖 fixedAsset)
 *     v1.5 Bug 6: finance / report 两份代码合并到此模块
 *     v1.5 Bug 9: sensitivityAnalysis 的 share 从实际 OPEX 占比读, 不再硬编码
 *     v1.5 Bug 13: BEP 用全周期平均利息, 不用第 3 年一刀切
 *     v1.5 Bug 14: salvage 拆设备/土建分别处理
 * ============================================================================ */
(function (global) {
  'use strict';

  // ---------- 贷款还款表 ----------
  function buildLoanSchedule(L, r, n, method) {
    const sch = [];
    if (L <= 0 || n <= 0) return sch;
    if (method === 'equal_payment' && r > 0) {
      // 等额本息 (r=0 时公式退化为 0/0, 落入下面等额本金分支)
      const a = r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
      const annual = L * a;
      let bal = L;
      for (let t = 1; t <= n; t++) {
        const interest = bal * r;
        const principal = annual - interest;
        bal -= principal;
        sch.push({ year: t, interest, principal, balance: Math.max(0, bal) });
      }
    } else {
      // 等额本金
      const principalEach = L / n;
      let bal = L;
      for (let t = 1; t <= n; t++) {
        const interest = bal * r;
        bal -= principalEach;
        sch.push({ year: t, interest, principal: principalEach, balance: Math.max(0, bal) });
      }
    }
    return sch;
  }

  // ---------- NPV ----------
  function npv(cfs, rate) {
    let v = 0;
    cfs.forEach((cf, t) => { v += cf / Math.pow(1 + rate, t); });
    return v;
  }

  // ---------- IRR (Newton-Raphson + 二分法兜底) ----------
  function irr(cfs) {
    let r = 0.10;
    for (let iter = 0; iter < 100; iter++) {
      let f = 0, df = 0;
      cfs.forEach((cf, t) => {
        const d = Math.pow(1 + r, t);
        f += cf / d;
        if (t > 0) df -= t * cf / Math.pow(1 + r, t + 1);
      });
      if (Math.abs(df) < 1e-12) break;
      const rNew = r - f / df;
      if (Math.abs(rNew - r) < 1e-7) return rNew;
      if (rNew < -0.99 || rNew > 10) return irrBisect(cfs);
      r = rNew;
    }
    return r;
  }
  function irrBisect(cfs) {
    let lo = -0.5, hi = 5.0;
    const f = (rr) => cfs.reduce((s, cf, t) => s + cf / Math.pow(1 + rr, t), 0);
    let flo = f(lo), fhi = f(hi);
    if (flo * fhi > 0) return NaN;
    for (let iter = 0; iter < 100; iter++) {
      const mid = (lo + hi) / 2;
      const fmid = f(mid);
      if (Math.abs(fmid) < 1e-7) return mid;
      if (flo * fmid < 0) { hi = mid; fhi = fmid; }
      else { lo = mid; flo = fmid; }
    }
    return (lo + hi) / 2;
  }

  // ---------- OPEX 可变/固定拆分 (v1.7 修复 Bug 19) ----------
  //   旧版: hardcoded variable=70%, fixed=30%
  //   新版: 从 perStage.cost 累加真实占比
  //         可变 (随产量 ramp 线性缩放): 饲料 + 增氧(液氧或风机电) + 化学品(甲醇/NaHCO3) + 臭氧
  //         半固定 (基本 24h 定值, 与产量弱相关): 主泵 + UV灯 + 杂项 + BF风机 + CO2风机 + 热泵
  //   优雅降级: 老数据 (perStage.cost 字段缺失) 退回旧 70/30
  function computeOpexSplit(d) {
    const perStage = (d && d.results && d.results.perStage) || [];
    let totalVar = 0, totalFix = 0, totalAll = 0;
    perStage.forEach(ps => {
      const c = ps.cost || {};
      // 可变 (随饲料/产量)
      const varCost = (c.feedCostAvg || 0)
                    + (c.aerationCostAvg || 0)        // 液氧或主风机电费 (随氧需变化)
                    + (c.methanolCostAvg || 0)
                    + (c.naHCO3CostAvg || 0)
                    + (c.ozoneCostAvg || 0);
      // 半固定 (24h 定值)
      const fixCost = (c.pumpCostAvg || 0)
                    + (c.uvLampCostAvg || 0)
                    + (c.miscCostAvg || 0)
                    + (c.bfBlowerCostAvg || 0)        // BF 风机也基本定值, 硝化耗氧波动小
                    + (c.co2BlowerCostAvg || 0)
                    + (c.thermalCostAvg || 0);
      totalVar += varCost;
      totalFix += fixCost;
      totalAll += (c.totalAvg || 0) - (c.depDaily || 0);   // 不含折旧 (折旧外部单列)
    });
    if (totalAll > 0 && (totalVar + totalFix) > 0) {
      // 钳到合理范围避免极端值: 可变 30%-90%, 固定 10%-70%
      const sum = totalVar + totalFix;
      const vFrac = Math.max(0.3, Math.min(0.9, totalVar / sum));
      return { variableShare: vFrac, fixedShare: 1 - vFrac };
    }
    return { variableShare: 0.70, fixedShare: 0.30 };   // fallback (老数据)
  }

  // ---------- 主计算 ----------
  function calculateCore(data, p) {
    if (!data || !data.results || !data.results.summary || !data.results.summary.finance) return null;
    const fin = data.results.summary.finance;
    const yieldKg = data.yieldTons * 1000;

    // CAPEX 拆分
    const capexEquip = fin.totalCapexEquip || 0;
    const capexCivil = (fin.totalCapexProject || 0) - capexEquip;
    const fixedAsset = fin.totalCapexProject || 0;
    /* ══ IRAS_R26_FIN_OPEX_BASE (2026-08-30) —— OPEX 基数改用财务专用口径 ══
       缺陷: 本模块一直读 `fin.annualOpex`, 而主页面 v1.9.2 起就专门导出了
       `fin.annualOpexForFinance = annualOpex − 维护 + 苗种` 供本模块使用。
       该字段【从未被任何代码读过】—— 只有 index 产出、manual 讲解、pid 内嵌样例。
       后果 (salmon 1000 t 实测):
         · 维护费双计: annualOpex 内含 annualMaint 396.9 万, 本模块又按
           capexEquip × repairRate 加 110.7 万 —— 同一笔钱算两遍;
         · 苗种费漏计: annualSeed 41.2 万一分未进财务评价。
         净差 +355.7 万元/年 ⇒ 全投资 IRR 11.08% (应为 13.26%)、
         资本金 IRR 14.62% (应为 18.44%)、NPV 少 2223 万。
       ⚠ 方向随物种翻转: salmon 是维护 > 苗种 ⇒ 偏保守; 而 eel_200 的
         fullCostPerKg − costPerKg = 56.0 元/kg 由苗种主导 ⇒ 漏苗种 ≫ 双计维护,
         OPEX 被低估、IRR 被高估, 是【不安全方向】。index L16088 的注释
         「鳗鲡苗种占企业全成本 43%, 漏算会让 IRR 严重失真」早已预见, 只是没接上。
       ⚠ 回退分支保留 (manual §「财务模块专用口径」明写老方案 JSON 走这条),
         但【必须给出可见信号】—— 回退时 opexBase='legacy', finance.html 据此
         改写\"不重复计算\"那行说明。声称有防线, 就要给防线失败时的信号。 */
    const _opexForFin = fin.annualOpexForFinance;
    const _opexBaseIsForFinance = (typeof _opexForFin === 'number' && isFinite(_opexForFin) && _opexForFin > 0);
    const annualOpexFull = _opexBaseIsForFinance ? _opexForFin : (fin.annualOpex || 0);
    const opexBase = _opexBaseIsForFinance ? 'forFinance' : 'legacy';
    const workingCapital = annualOpexFull * p.workingCap;
    const totalInvest = fixedAsset + workingCapital;

    // Bug 2 修复: 贷款只覆盖固定资产
    const ownEquityFixed = fixedAsset * p.ownPct;
    const loan = fixedAsset * (1 - p.ownPct);
    const ownEquity = ownEquityFixed + workingCapital;

    const annualDep = fin.annualDep || 0;

    // 贷款表
    const loanSchedule = buildLoanSchedule(loan, p.loanRate, p.loanYears, p.loanMethod);

    // 逐年现金流
    const Y = p.years;
    const ramps = [];
    for (let t = 1; t <= Y; t++) {
      if (t === 1) ramps.push(p.ramp1);
      else if (t === 2) ramps.push(p.ramp2);
      else ramps.push(p.ramp3);
    }

    // Bug 14 修复: 残值拆设备/土建
    // 设备 8 年折旧, 末年 (>8年项目) 残值 5%; 土建 20 年折旧, 末年残值 20%
    const salvageEquip = capexEquip * 0.05;
    const salvageCivil = capexCivil * 0.20;
    const totalSalvage = salvageEquip + salvageCivil;

    // v1.7 Bug 19 修复: OPEX 可变/固定从实际 cost 字段算, 不再硬编码 70/30
    //   air 模式饲料占比更高 (~75-80%) vs o2 模式 (~55%), 旧版 70/30 会高估固定/低估可变
    const opexSplit = computeOpexSplit(data);

    const yearly = [];
    for (let t = 0; t <= Y; t++) {
      const r = t === 0 ? 0 : ramps[t - 1];
      const revenue = r * yieldKg * p.price;
      const salesTax = revenue * p.salesTax;
      const netRevenue = revenue - salesTax;

      const variableOpex = annualOpexFull * opexSplit.variableShare * r;
      const fixedOpexBase = annualOpexFull * opexSplit.fixedShare;
      const fixedOpex = t === 0 ? 0 : fixedOpexBase;
      const operatingCost = variableOpex + fixedOpex;

      const repairCost = t === 0 ? 0 : capexEquip * p.repairRate;
      const adminCost = revenue * p.adminRate;
      const laborCost = t === 0 ? 0 : p.laborCost;
      const opCostTotal = operatingCost + repairCost + adminCost + laborCost;

      const lsRow = (t >= 1 && t <= p.loanYears && loanSchedule[t - 1]) ? loanSchedule[t - 1] : null;
      const interest = lsRow ? lsRow.interest : 0;
      const loanPrincipalRepay = lsRow ? lsRow.principal : 0;

      const dep = t === 0 ? 0 : annualDep;

      /* ══ IRAS_FIN_ADJTAX (2026-08-30) —— 项目投资现金流改用【调整所得税】 ══
         缺陷: `tax` 按扣完利息的利润总额算(含利息税盾), 而 `cfTotal` 不扣利息却扣这个 tax
         ⇒ 全投资口径混进了融资效应。实测全投资 IRR 随自有资金比例漂移:
             自有 20% → 11.11% · 50% → 11.02% · 80% → 10.89% · 100% → 10.80%
         理论上全投资口径与融资结构【无关】。《建设项目经济评价方法与参数》(第三版)
         的项目投资现金流量表用的是【调整所得税】= 息税前利润 × 税率, 不扣利息。
         ⇒ 拆成两个税:
             taxAdjusted —— 项目投资口径, 按 EBIT 计, 进 cfTotal
             tax         —— 企业口径, 含利息税盾, 进利润表与 cfEquity
         ⚠ 两者之差就是利息税盾, cfEquity 里必须把它加回去, 否则资本金口径反而算少了。
         ⚠ 幅度只有 0.31 pp, 但这是【定义性】问题 —— 设计院评审会当场问
           "全投资 IRR 怎么会随融资比例变"。 */
      const ebit = netRevenue - opCostTotal - dep;              // 息税前利润
      const taxAdjusted = Math.max(0, ebit) * p.taxRate;        // 调整所得税 (项目投资口径)
      const profitBefore = ebit - interest;                     // 利润总额 (企业口径)
      const tax = Math.max(0, profitBefore) * p.taxRate;        // 所得税 (含利息税盾)
      const profitNet = profitBefore - tax;
      const taxShield = taxAdjusted - tax;                      // ≥ 0, 利息带来的税盾

      // 投资与现金流
      const investOutflow = (t === 0) ? fixedAsset : 0;
      const wcOutflow = (t === 1) ? workingCapital : 0;
      const wcRecovery = (t === Y) ? workingCapital : 0;
      const salvage = (t === Y) ? totalSalvage : 0;       // Bug 14: 拆分后总残值

      /* IRAS_FIN_ADJTAX: 项目投资现金流用【调整所得税】—— 与融资结构无关 */
      const cfTotal = revenue - salesTax - opCostTotal - taxAdjusted
        - investOutflow - wcOutflow + wcRecovery + salvage;

      // Bug 2: 贷款只覆盖 fixedAsset, wc 全部由股东出
      const loanInflow = (t === 0) ? loan : 0;
      /* IRAS_FIN_ADJTAX: 资本金口径用【实际所得税】, 故把 cfTotal 里多扣的税盾加回来。
         漏掉 +taxShield 会让资本金 IRR 反而被低估 —— 修一个口径顺手压坏另一个, 是本类改动的典型错法。 */
      const cfEquity = cfTotal + taxShield + loanInflow - interest - loanPrincipalRepay;

      yearly.push({
        year: t, ramp: r, revenue, salesTax, netRevenue,
        variableOpex, fixedOpex, operatingCost,
        repairCost, adminCost, laborCost, opCostTotal,
        dep, interest, loanPrincipalRepay,
        profitBefore, tax, profitNet,
        ebit, taxAdjusted, taxShield,          // IRAS_FIN_ADJTAX: 项目投资口径的税与税盾
        cfTotal, cfEquity,
        investOutflow, wcOutflow, wcRecovery, salvage
      });
    }

    // 累计现金流与回收期
    let cumTotal = 0, cumEquity = 0, cumTotalDisc = 0, cumEquityDisc = 0;
    let paybackTotal = -1, paybackEquity = -1;
    let paybackTotalDisc = -1, paybackEquityDisc = -1;
    yearly.forEach((y, i) => {
      const d = Math.pow(1 + p.discount, -y.year);
      cumTotal += y.cfTotal;
      cumEquity += y.cfEquity;
      cumTotalDisc += y.cfTotal * d;
      cumEquityDisc += y.cfEquity * d;
      y.cumTotal = cumTotal;
      y.cumEquity = cumEquity;
      y.cumTotalDisc = cumTotalDisc;
      y.cumEquityDisc = cumEquityDisc;
      if (paybackTotal < 0 && cumTotal >= 0) {
        const prev = i > 0 ? yearly[i - 1].cumTotal : 0;
        paybackTotal = (i > 0 ? yearly[i - 1].year : 0) + (-prev) / (cumTotal - prev);
      }
      if (paybackEquity < 0 && cumEquity >= 0) {
        const prev = i > 0 ? yearly[i - 1].cumEquity : 0;
        paybackEquity = (i > 0 ? yearly[i - 1].year : 0) + (-prev) / (cumEquity - prev);
      }
      if (paybackTotalDisc < 0 && cumTotalDisc >= 0) {
        const prev = i > 0 ? yearly[i - 1].cumTotalDisc : 0;
        paybackTotalDisc = (i > 0 ? yearly[i - 1].year : 0) + (-prev) / (cumTotalDisc - prev);
      }
      if (paybackEquityDisc < 0 && cumEquityDisc >= 0) {
        const prev = i > 0 ? yearly[i - 1].cumEquityDisc : 0;
        paybackEquityDisc = (i > 0 ? yearly[i - 1].year : 0) + (-prev) / (cumEquityDisc - prev);
      }
    });

    // NPV / IRR
    const cfTotalArr = yearly.map(y => y.cfTotal);
    const cfEquityArr = yearly.map(y => y.cfEquity);
    const npvTotal = npv(cfTotalArr, p.discount);
    const npvEquity = npv(cfEquityArr, p.discount);
    const irrTotal = irr(cfTotalArr);
    const irrEquity = irr(cfEquityArr);

    // BEP — Bug 13 修复: 用全周期平均利息, 而非第 3 年单点
    const satRow = yearly[Math.min(3, Y)] || yearly[yearly.length - 1];
    const marginPerKg = (yieldKg > 0 && satRow.ramp > 0) ?
      (satRow.netRevenue - satRow.variableOpex - satRow.adminCost) / (yieldKg * satRow.ramp) : 0;
    const avgInterest = loanSchedule.length > 0
      ? loanSchedule.reduce((s, x) => s + x.interest, 0) / loanSchedule.length
      : 0;
    const fixedAnnual = annualOpexFull * opexSplit.fixedShare + annualDep + avgInterest
      + capexEquip * p.repairRate + p.laborCost;
    const bepKg = marginPerKg > 0 ? fixedAnnual / marginPerKg : 0;
    const bepPct = yieldKg > 0 ? bepKg / yieldKg * 100 : 0;

    return {
      capex: {
        equip: capexEquip, civil: capexCivil,
        fixedAsset, workingCapital, totalInvest,
        ownEquity, ownEquityFixed, loan,           // 暴露 ownEquityFixed 供 UI 显示
        salvageEquip, salvageCivil, totalSalvage    // Bug 14: 残值拆分供 UI
      },
      annual: {
        revenue: satRow.revenue, opex: annualOpexFull, dep: annualDep,
        repair: capexEquip * p.repairRate, labor: p.laborCost,
        avgInterest,                                 // Bug 13 暴露平均利息
        /* IRAS_R26_FIN_OPEX_BASE: 'forFinance' = 已剔除维护、已并入苗种;
           'legacy' = 老方案 JSON 无该字段, 退回 annualOpex ⇒ 维护双计 + 漏苗种。
           UI 必须据此改写说明文案, 不得两种情况印同一句话。 */
        opexBase
      },
      loanSchedule,
      yearly,
      indicators: {
        npvTotal, npvEquity, irrTotal, irrEquity,
        paybackTotal, paybackEquity,
        paybackTotalDisc, paybackEquityDisc,
        bepKg, bepPct
      },
      params: p,
      yieldKg
    };
  }

  // ---------- 敏感性分析 (Bug 9: share 从实际 OPEX 占比读) ----------
  function sensitivityAnalysis(data, baseParams) {
    const factors = [
      { key: 'price',       label: '售价 ±20%',     delta: 0.20 },
      { key: 'feedCost',    label: '饲料成本 ±20%', delta: 0.20 },
      { key: 'electricity', label: '电费 ±20%',     delta: 0.20 },
      { key: 'capex',       label: 'CAPEX ±20%',    delta: 0.20 },
      { key: 'yieldRate',   label: '产量 ±10%',     delta: 0.10 }
    ];
    const baseCore = calculateCore(data, baseParams);
    const baseIRR = baseCore ? baseCore.indicators.irrTotal : NaN;
    const baseNPV = baseCore ? baseCore.indicators.npvTotal : NaN;

    // Bug 9: 从 perStage 累加实际饲料/电费占 OPEX 比例
    //   旧版硬编码 feedCost=55%, electricity=20%, 不随物种/地区变化
    //   新版: 从 d.results.perStage 累加 cost.feedCostAvg / pumpCostAvg + uvLampCostAvg
    //          + miscCostAvg + co2BlowerCostAvg + ozoneCostAvg + thermalCostAvg + aerationCostAvg(若空气曝气)
    //   优雅降级: 数据缺失时退回旧硬编码
    function computeShares(d) {
      const perStage = (d.results && d.results.perStage) || [];
      let totalFeed = 0, totalElec = 0, totalOpex = 0;
      perStage.forEach(ps => {
        const c = ps.cost || {};
        const feed = c.feedCostAvg || 0;
        // 电费 = 主泵 + UV灯 + 杂项 + BF 风机 + CO2 风机 + 臭氧 + 热泵 (+ 空气曝气主风机)
        const elec = (c.pumpCostAvg || 0) + (c.uvLampCostAvg || 0) + (c.miscCostAvg || 0)
                   + (c.bfBlowerCostAvg || 0) + (c.co2BlowerCostAvg || 0)
                   + (c.ozoneCostAvg || 0) + (c.thermalCostAvg || 0);
        // 增氧成本: 空气曝气下为风机电, 纯氧下为液氧(不计入电费)
        // P&ID 导出格式无法区分, 简化按全部计入"非电非饲料"
        const total = (c.totalAvg || 0) - (c.depDaily || 0);  // 不含折旧
        totalFeed += feed;
        totalElec += elec;
        totalOpex += total;
      });
      if (totalOpex > 0) {
        return {
          feedShare: Math.max(0.1, Math.min(0.85, totalFeed / totalOpex)),
          elecShare: Math.max(0.05, Math.min(0.60, totalElec / totalOpex))
        };
      }
      return { feedShare: 0.55, elecShare: 0.20 };  // fallback
    }
    const shares = computeShares(data);

    const rows = factors.map(f => {
      let dataLow = JSON.parse(JSON.stringify(data));
      let dataHigh = JSON.parse(JSON.stringify(data));
      let pLow = { ...baseParams }, pHigh = { ...baseParams };

      if (f.key === 'price') {
        pLow.price = baseParams.price * (1 - f.delta);
        pHigh.price = baseParams.price * (1 + f.delta);
      } else if (f.key === 'feedCost' || f.key === 'electricity') {
        const share = f.key === 'feedCost' ? shares.feedShare : shares.elecShare;
        const fac = data.results.summary.finance;
        dataLow.results.summary.finance = { ...fac };
        dataLow.results.summary.finance.annualOpex = fac.annualOpex * (1 - share * f.delta);
        dataHigh.results.summary.finance = { ...fac };
        dataHigh.results.summary.finance.annualOpex = fac.annualOpex * (1 + share * f.delta);
      } else if (f.key === 'capex') {
        const fac = data.results.summary.finance;
        dataLow.results.summary.finance = { ...fac };
        dataLow.results.summary.finance.totalCapexEquip = fac.totalCapexEquip * (1 - f.delta);
        dataLow.results.summary.finance.totalCapexProject = fac.totalCapexProject * (1 - f.delta);
        dataLow.results.summary.finance.annualDep = fac.annualDep * (1 - f.delta);
        dataHigh.results.summary.finance = { ...fac };
        dataHigh.results.summary.finance.totalCapexEquip = fac.totalCapexEquip * (1 + f.delta);
        dataHigh.results.summary.finance.totalCapexProject = fac.totalCapexProject * (1 + f.delta);
        dataHigh.results.summary.finance.annualDep = fac.annualDep * (1 + f.delta);
      } else if (f.key === 'yieldRate') {
        pLow.ramp3 = baseParams.ramp3 * (1 - f.delta);
        pHigh.ramp3 = baseParams.ramp3 * (1 + f.delta);
      }

      const cLow = calculateCore(dataLow, pLow);
      const cHigh = calculateCore(dataHigh, pHigh);
      const irrLow = cLow ? cLow.indicators.irrTotal : NaN;
      const irrHigh = cHigh ? cHigh.indicators.irrTotal : NaN;
      const npvLow = cLow ? cLow.indicators.npvTotal : NaN;
      const npvHigh = cHigh ? cHigh.indicators.npvTotal : NaN;
      return {
        label: f.label,
        irrLow, irrHigh, irrSwing: Math.abs(irrHigh - irrLow),
        npvLow, npvHigh, npvSwing: Math.abs(npvHigh - npvLow)
      };
    });

    rows.sort((a, b) => b.irrSwing - a.irrSwing);
    return { baseIRR, baseNPV, factors: rows, shares };
  }

  // ---------- 顶层 API ----------
  function calculate(data, p) {
    const core = calculateCore(data, p);
    if (!core) return null;
    core.sensitivity = sensitivityAnalysis(data, p);
    return core;
  }

  // 暴露
  global.iRASFinance = {
    calculateCore,
    calculate,
    buildLoanSchedule,
    npv,
    irr,
    sensitivityAnalysis,
    version: '1.5'
  };
})(typeof window !== 'undefined' ? window : globalThis);
