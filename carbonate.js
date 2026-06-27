/* ============================================================================
 *  iRAS 碳酸盐平衡求解核心  (v1.9 — Phase 1-3)
 *
 *  RAS 设计用稳态碳酸盐物种分布求解。
 *  正向 (默认): 总碱度 (NaHCO3 投加维持的设定值) + 溶解 CO2 (呼吸 + 硝化产 - 脱气
 *      塔移除后的稳态值) → pH 作为涌现的第三个变量被反推出来。
 *  反向 (solveAlk): 目标 pH + 溶解 CO2 → 维持该 pH 所需的碱度设定值 (代数直解,
 *      不迭代)。
 *
 *  平衡常数 完全照搬自 PyCO2SYS 1.8.3 (opt_k_carbonic = 14):
 *    K1, K2  Millero (2010), Mar.Freshw.Res. 61:139-142    [SWS scale, S=0-50]
 *    K0      Weiss (1974)                                   [CO2 溶解度]
 *    KW      Millero (1979)                                 [SWS]
 *    KB      Dickson (1990b), Total → SWS 转换通过 SWStoTOT
 *    TB      Uppstrom (1974); TS Morris-Riley (1966); TF Riley (1965)
 *    KS      Dickson (1990a) free; KF Dickson-Riley (1979) free
 *    fH      Takahashi et al. (1982)                        [SWS ↔ NBS]
 *    NH3 Ka  Clegg & Whitfield (1995), GCA 59(12):2403, eq.18 [Total → SWS]
 *    Ca      Riley & Tongudai (1967);  Ksp(calcite) Mucci (1983, 1 atm) [omega 用]
 *
 *  pH 标度: 内部求解在 SWS 标度上, 主输出 pH 是 FREE (自由/浓度) 标度。在海水中,
 *    pH_free > pH_sws; 在 S=0 (淡水), free = SWS = 淡水探头的 NBS 读数, 这避免了
 *    NBS 标度在淡水中"偏高 ~0.15"的 fH 修正问题。pH_sws 和 pH_nbs 也返回供参考。
 *    (一个 free↔sws 转换的符号错误 — 在 S=0 和内部往返中不可见, 只有对照 PyCO2SYS
 *    free 标度才能发现 — 在 v1.9 修复。)
 *
 *  单位: 浓度 mol/kg-SW (与 PyCO2SYS 一致); RAS 引擎包装层用简单盐度密度公式
 *    (ρ = 1 + 8e-4·S) 在 mg/L ↔ mol/kg 之间换算。
 *
 *  API (global.iRASCarbonate):
 *    solve(TA, CO2aq, Tc, S)        正向 → {pH(=free), pH_free, pH_sws, pH_nbs,
 *                                    H_sws, CO2aq, HCO3, CO3, DIC, omega_calcite, ...}
 *    solveAlk(pH_free, CO2aq, Tc, S) 反向 → 所需总碱度 (mol/kg)
 *    nh3Fraction(H_sws, Tc, S)      非离子化 NH3 占 TAN 的比例 Ka/(Ka+H), SWS
 *    bufferBeta(TA, CO2aq, Tc, S)   Van Slyke 缓冲强度 (mg/L CaCO3 per pH)
 *    Ca_RT67(S) / Ksp_calcite_M83(Tc,S)   方解石饱和指数用
 *
 *  vs PyCO2SYS 验证 (opt_k_carbonic=14, S=0-35, T=12-28):
 *    正向 pH (free & NBS) max|dpH| = 1e-5; 反向 TA = 0.083 umol/kg;
 *    omega_calcite 0.006%; NH3 fraction 1.5e-16.
 *
 *  移植自英文 iRAS v1.9 (Polarlys Innovation AS), 中文版 v1.9 同步引入.
 * ========================================================================== */
(function (global) {
  'use strict';
  const ln = Math.log, exp = Math.exp, log10 = Math.log10, sqrt = Math.sqrt, pow = Math.pow;

  // ---- 盐总量 (mol/kg-SW) ----
  function ionicStrength(S) { return 19.924 * S / (1000 - 1.005 * S); }        // DOE94
  function boronTotal(S)   { return 0.0004157 * S / 35; }                       // Uppström 1974
  function sulfateTotal(S) { return (0.14 / 96.062) * S / 1.80655; }            // Morris-Riley 1966
  function fluorideTotal(S){ return (0.000067 / 18.998) * S / 1.80655; }        // Riley 1965

  // ---- 平衡常数 (TempK, S) ----
  function K0_W74(T, S) {                                                       // Weiss 1974, mol/kg/atm
    const t = T / 100;
    return exp(-60.2409 + 93.4517 / t + 23.3585 * ln(t)
      + S * (0.023517 - 0.023656 * t + 0.0047036 * t * t));
  }
  function K1K2_M10(T, S) {                                                     // Millero 2010, SWS
    const pK10 = -126.34048 + 6320.813 / T + 19.568224 * ln(T);
    const A1 = 13.4038 * pow(S, 0.5) + 0.03206 * S - 5.242e-5 * S * S;
    const B1 = -530.659 * pow(S, 0.5) - 5.8210 * S;
    const C1 = -2.0664 * pow(S, 0.5);
    const pK1 = pK10 + A1 + B1 / T + C1 * ln(T);
    const pK20 = -90.18333 + 5143.692 / T + 14.613358 * ln(T);
    const A2 = 21.3728 * pow(S, 0.5) + 0.1218 * S - 3.688e-4 * S * S;
    const B2 = -788.289 * pow(S, 0.5) - 19.189 * S;
    const C2 = -3.374 * pow(S, 0.5);
    const pK2 = pK20 + A2 + B2 / T + C2 * ln(T);
    return [pow(10, -pK1), pow(10, -pK2)];
  }
  function KW_M79(T, S) {                                                       // Millero 1979, SWS
    return exp(148.9802 - 13847.26 / T - 23.6521 * ln(T)
      + (-79.2447 + 3298.72 / T + 12.0408 * ln(T)) * sqrt(S) - 0.019813 * S);
  }
  function KB_TOT_D90b(T, S) {                                                  // Dickson 1990b, Total
    const sq = sqrt(S);
    const top = -8966.9 - 2890.53 * sq - 77.942 * S + 1.728 * sq * S - 0.0996 * S * S;
    const lnKB = top / T + 148.0248 + 137.1942 * sq + 1.62142 * S
      + (-24.4344 - 25.085 * sq - 0.2474 * S) * ln(T) + 0.053105 * sq * T;
    return exp(lnKB);
  }
  function KS_FREE_D90a(T, S) {                                                 // Dickson 1990a, free
    const I = ionicStrength(S), L = ln(T);
    const lnKS = -4276.1 / T + 141.328 - 23.093 * L
      + (-13856 / T + 324.57 - 47.986 * L) * sqrt(I)
      + (35474 / T - 771.54 + 114.723 * L) * I
      + (-2698 / T) * sqrt(I) * I + (1776 / T) * I * I;
    return exp(lnKS) * (1 - 0.001005 * S);
  }
  function KF_FREE_DR79(T, S) {                                                 // Dickson-Riley 1979, free
    const I = ionicStrength(S);
    return exp(1590.2 / T - 12.641 + 1.525 * sqrt(I)) * (1 - 0.001005 * S);
  }
  function fH_TWB82(T, S) {                                                     // Takahashi 1982, SWS↔NBS
    return 1.2948 - 0.002036 * T + (0.0004607 - 0.000001475 * T) * S * S;
  }
  function Ka_NH3_CW95_TOT(T, S) {                                              // Clegg-Whitfield 1995, Total, S=0-40
    let pK = 9.244605 - 2729.33 * (1 / 298.15 - 1 / T);
    pK += (0.04203362 - 11.24742 / T) * pow(S, 0.25);
    pK += (-13.6416 + 1.176949 * sqrt(T) - 0.02860785 * T + 545.4834 / T) * pow(S, 0.5);
    pK += (-0.1462507 + 0.0090226468 * sqrt(T) - 0.0001471361 * T + 10.5425 / T) * pow(S, 1.5);
    pK += (0.004669309 - 0.0001691742 * sqrt(T) - 0.5677934 / T) * S * S;
    pK += (-2.354039e-05 + 0.009698623 / T) * pow(S, 2.5);
    return pow(10, -pK) * (1 - 0.001005 * S);                                   // Total 标度, mol/kg-SW
  }
  // SWS 标度 NH3 Ka (配合 [H+]_SWS 用): Total → SWS via SWStoTOT0
  function Ka_NH3_SWS(T, S) {
    if (S <= 0) return Ka_NH3_CW95_TOT(T, S);   // 淡水 S=0: free=tot=sws
    const TS = sulfateTotal(S), KS = KS_FREE_D90a(T, S);
    const TF = fluorideTotal(S), KF = KF_FREE_DR79(T, S);
    const SWStoTOT0 = (1 + TS / KS) / (1 + TS / KS + TF / KF);
    return Ka_NH3_CW95_TOT(T, S) / SWStoTOT0;
  }

  // SWS 标度 KB: Total → SWS 转换 SWStoTOT0 = (1+TS/KS)/(1+TS/KS+TF/KF)
  function KB_SWS(T, S) {
    if (S <= 0) return 0;                       // 淡水无硼酸盐
    const TS = sulfateTotal(S), KS = KS_FREE_D90a(T, S);
    const TF = fluorideTotal(S), KF = KF_FREE_DR79(T, S);
    const SWStoTOT0 = (1 + TS / KS) / (1 + TS / KS + TF / KF);
    return KB_TOT_D90b(T, S) / SWStoTOT0;
  }

  /* ---- 核心求解器: (总碱度, 溶解 CO2) → pH ----
   * TA, CO2aq 单位 mol/kg-SW; T 单位 degC; S 单位 psu。
   * SWS 标度求解, 返回 NBS 标度 pH + 完整物种分布。*/
  function solve(TA, CO2aq, Tc, S) {
    const T = Tc + 273.15;
    const [K1, K2] = K1K2_M10(T, S);
    const KW = KW_M79(T, S);
    const KB = KB_SWS(T, S), TB = boronTotal(S);
    const fH = fH_TWB82(T, S);

    // TA(H) on SWS 标度; 在 pH_SWS ∈ [2, 12] 上二分搜索
    const taOf = (H) =>
      K1 * CO2aq / H + 2 * K1 * K2 * CO2aq / (H * H)   // HCO3 + 2 CO3
      + (KB > 0 ? KB * TB / (KB + H) : 0)              // B(OH)4-
      + KW / H - H - TA;                               // OH- - H+ - TA
    let lo = pow(10, -12), hi = pow(10, -2), Hm = 0;   // [H+] 范围 (pH 2..12)
    // taOf 在该范围内 H 单调递减
    for (let i = 0; i < 100; i++) {
      Hm = sqrt(lo * hi);                              // 几何二分 (H 跨多个数量级)
      const f = taOf(Hm);
      if (f > 0) lo = Hm; else hi = Hm;
    }
    const H_sws = Hm;
    const pH_sws = -log10(H_sws);
    const pH_nbs = pH_sws - log10(fH);
    // free 标度: S=0 时 free=SWS; 海水中 pH_free = pH_sws + log10(SWStoFREE)
    let SWStoFREE = 1;
    if (S > 0) {
      const TS = sulfateTotal(S), KS = KS_FREE_D90a(T, S);
      const TF = fluorideTotal(S), KF = KF_FREE_DR79(T, S);
      SWStoFREE = 1 / (1 + TS / KS + TF / KF);
    }
    const pH_free = pH_sws - log10(SWStoFREE);   // [H+]_free = [H+]_sws · SWStoFREE (<1) ⇒ pH_free > pH_sws

    const HCO3 = K1 * CO2aq / H_sws;
    const CO3 = K1 * K2 * CO2aq / (H_sws * H_sws);
    const DIC = CO2aq + HCO3 + CO3;
    const omega = (S > 0) ? (Ca_RT67(S) * CO3 / Ksp_calcite_M83(T, S)) : null;  // 方解石饱和度 (海水)
    return {
      pH: pH_free, pH_free, pH_sws, pH_nbs, H_sws, fH,
      CO2aq, HCO3, CO3, DIC, omega_calcite: omega,
      K1, K2, KW, KB, KH: K0_W74(T, S)
    };
  }

  // 钙 (Riley-Tongudai 1967) 和方解石溶度积 (Mucci 1983, 1 atm) - 饱和指数用
  function Ca_RT67(S) { return 0.02128 / 40.087 * S / 1.80655; }                // mol/kg-SW
  function Ksp_calcite_M83(Tc, S) {                                             // (mol/kg-SW)^2, 1 atm
    const T = (typeof Tc === 'number' && Tc < 200) ? Tc + 273.15 : Tc;         // 接受 degC 或 K
    let lg = -171.9065 - 0.077993 * T + 2839.319 / T + 71.595 * log10(T)
      + (-0.77712 + 0.0028426 * T + 178.34 / T) * sqrt(S)
      - 0.07711 * S + 0.0041249 * sqrt(S) * S;
    return pow(10, lg);
  }

  // Van Slyke 缓冲强度 (运行学): 固定 CO2(aq) 下, 单位 pH 变化对应的碱度变化 (mg/L CaCO3)。
  //   越大 = 越"硬" (调 pH 需更多投碱 = 抗酸冲击更稳)。有限差分计算。
  function bufferBeta(TA, CO2aq, Tc, S) {
    const d = 1e-4;                                  // +0.1 mmol/kg 碱度扰动
    const p0 = solve(TA, CO2aq, Tc, S).pH;
    const p1 = solve(TA + d, CO2aq, Tc, S).pH;
    const dpH = p1 - p0;
    if (!isFinite(dpH) || Math.abs(dpH) < 1e-9) return null;
    return (d / dpH) * 50043;                         // mol/kg per pH → mg/L CaCO3 per pH
  }


  // ---- 反向: 目标 pH (free 标度) + 溶解 CO2 → 所需总碱度 (mol/kg-SW) ----
  //   代数直解 (不迭代): [H+] 由目标 pH 直接确定, 碳酸盐 / 硼酸盐 / 水各项均显式可计算,
  //   TA 是它们之和。当目标 pH 在低端不可达时 (即只有 CO2 也使 pH 高于目标) 返回 ≤ 0.
  function solveAlk(pH_free, CO2aq, Tc, S) {
    const T = Tc + 273.15;
    const [K1, K2] = K1K2_M10(T, S);
    const KW = KW_M79(T, S);
    const KB = KB_SWS(T, S), TB = boronTotal(S);
    let SWStoFREE = 1;
    if (S > 0) {
      const TS = sulfateTotal(S), KS = KS_FREE_D90a(T, S);
      const TF = fluorideTotal(S), KF = KF_FREE_DR79(T, S);
      SWStoFREE = 1 / (1 + TS / KS + TF / KF);
    }
    const pH_sws = pH_free + log10(SWStoFREE);   // 逆运算: pH_free = pH_sws - log10(SWStoFREE)
    const H = pow(10, -pH_sws);
    return K1 * CO2aq / H + 2 * K1 * K2 * CO2aq / (H * H)
      + (KB > 0 ? KB * TB / (KB + H) : 0) + KW / H - H;       // mol/kg-SW
  }

  // 非离子化氨 (剧毒) 占 TAN 比例 f = [NH3]/TAN = Ka/(Ka+[H+]_SWS), 用 SWS 标度 Ka 和 H
  function nh3Fraction(H_sws, Tc, S) {
    const Ka = Ka_NH3_SWS(Tc + 273.15, S);   // CW95, SWS 标度; 物理比例与标度无关
    return Ka / (Ka + H_sws);
  }

  const api = {
    solve, solveAlk, nh3Fraction, bufferBeta, Ca_RT67, Ksp_calcite_M83,
    K0_W74, K1K2_M10, KW_M79, KB_SWS, KB_TOT_D90b, KS_FREE_D90a, KF_FREE_DR79,
    fH_TWB82, Ka_NH3_CW95_TOT, Ka_NH3_SWS, boronTotal, sulfateTotal, fluorideTotal, ionicStrength
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.iRASCarbonate = api;
})(typeof window !== 'undefined' ? window : globalThis);
