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
 *  移植自英文 iRAS v1.9, 中文版 v1.9 同步引入.
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
  function solve(TA, CO2aq, Tc, S, CaOverride, ionicI) {
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
    /* v2.5 IRAS_V25_PH_BRACKET (第八轮审计 B7) — 二分区间的边界断言。
       taOf 在 H 上单调递减 ⇒ 合法括号要求 taOf(lo) > 0 且 taOf(hi) < 0。
       真解落在 [2, 12] 之外时, 二分会静默收敛到端点, 返回一个【看着正常的 pH】
       (11.999 / 2.001), 调用方无从分辨那是解还是钳位产物。
       ⚠ 现状: 在 iRAS 当前输入域内【够不到】—— alkTarget 钳在 [20, 400],
         即使 CO₂ 恰为 0, alk=400 也只到 pH_sws 11.53; 低端有 alk ≥ 20 兜着,
         下不到 5 以下; pH 模式走 solveAlk 代数直解不经二分。
         故本条是【防御性】的: 防的是将来放宽 clamp、或本模块被 iRAS 之外的
         调用方复用。不写自检工况 —— 没有工况能走到, 写了也是惰性断言
         (M13/M14 的老教训); 改由 index.html 的单元级断言 N1 直接调本函数覆盖。
       ⚠ 不抛异常: 调用方是 try/catch 静默降级的, 抛出会让 pH 字段直接消失,
         把"可疑的数"换成"没有数", 更难排查。改为随返回值带出 boundaryHit。 */
    const _fLo = taOf(lo), _fHi = taOf(hi);
    const boundaryHit = !(_fLo > 0 && _fHi < 0);
    const boundaryDir = boundaryHit ? (_fLo <= 0 ? 'high' : 'low') : null;
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
    /* v2.5 IRAS_V25_CA_INPUT: Ca 可由调用方给定 (mol/kg-SW), 缺省时按盐度反推。
       原式 S = 0 直接返回 null ⇒ 淡水 Ω 算不出, 而淡水 RAS 的碳酸钙溶蚀是真实工程问题。
       ⚠ Ksp 在 S = 0 【没有问题】: Mucci 1983 的盐度项在 S=0 干净归零,
         外推给 pKsp = 8.480, 与 Plummer-Busenberg 1982 的淡水热力学值吻合。
         卡点从来只在 Ca, 不在 Ksp。
       ⚠ 【仍未处理】低离子强度的活度修正: 本式按【浓度】计算, 而 Ksp 在 S=0 退化为
         活度标度的热力学常数。淡水 I ≈ 0.01 M 时 Davies 给 γ(二价) ≈ 0.66,
         两个二价离子相乘 ≈ 0.44 ⇒ 淡水 Ω 会【高估约 2 倍】。海水不受影响
         (Mucci 的 Ksp 本就是该盐度下的化学计量常数, 活度已含在内)。
         故淡水 Ω 目前只可用于【定性判断欠饱和/过饱和的方向】, 不可作定量依据。 */
    const _CaUse = (CaOverride != null && CaOverride > 0) ? CaOverride
                 : ((S > 0) ? Ca_RT67(S) : null);
    /* v2.5 IRAS_V25_CA_ACTIVITY: 淡水乘 Davies 活度系数 γ², 海水不乘 (见 daviesGamma 注释) */
    let _gamma2 = 1;
    if (S <= 0 && _CaUse != null && ionicI != null && ionicI > 0) {
      const _g = daviesGamma(ionicI, 2, Tc);
      _gamma2 = _g * _g;
    }
    const omega = (_CaUse != null)
      ? (_gamma2 * _CaUse * CO3 / Ksp_calcite_M83(T, S)) : null;
    return {
      pH: pH_free, pH_free, pH_sws, pH_nbs, H_sws, fH,
      CO2aq, HCO3, CO3, DIC, omega_calcite: omega,
      boundaryHit, boundaryDir,                        // v2.5 B7: 真解是否落在 [2,12] 之外
      K1, K2, KW, KB, KH: K0_W74(T, S)
    };
  }

  // 钙 (Riley-Tongudai 1967) 和方解石溶度积 (Mucci 1983, 1 atm) - 饱和指数用
  function Ca_RT67(S) { return 0.02128 / 40.087 * S / 1.80655; }                // mol/kg-SW
  /* ---- Davies 活度系数 (低离子强度) ----
     v2.5 IRAS_V25_CA_ACTIVITY
       log γ = -A·z²·(√I/(1+√I) - 0.3·I),  A(T) = 0.4918 + 6.6e-4·T + 4.87e-6·T²
     【为什么淡水必须修正】Mucci 1983 的 Ksp 在 S>0 是该盐度下的【化学计量常数】
       (按总浓度定义, 活度已含在拟合里); 而 S=0 时盐度项归零, 它退化为
       【活度标度】的热力学常数 (pKsp 8.480, 与 Plummer-Busenberg 1982 吻合)。
       故淡水必须把浓度乘活度系数才能与该 Ksp 对齐:
         Ω = a(Ca)·a(CO3)/Ksp = γ²·[Ca]·[CO3]/Ksp
     【实证 —— 这不是理论洁癖】不修正时模型给淡水 Ω = 1.22–1.76 (过饱和, 会结垢),
       而 Langelier 饱和指数独立算出 LSI = -0.16 ~ -0.39 ⇒ Ω ≈ 0.40–0.70
       (欠饱和, 会溶蚀) —— <b>定性结论相反</b>。乘 γ² ≈ 0.58 后落到 0.58–1.00,
       与 LSI 同侧同量级。而"溶蚀混凝土池体、池壁起砂"正是本模型要提示的工程问题,
       不修正等于把它藏起来。
     ⚠ 海水【不修正】: 那里 Ksp 是化学计量常数, 再乘活度系数就是重复计算。
     ⚠ 残余不确定度: K1/K2 (Millero 2010) 在 S=0 的标度约定未经独立核对,
       若它们也是活度标度, 则由其解出的 [CO3] 已含活度, 本修正会略微过头。
       LSI 交叉验证表明总方向与量级正确, 但淡水 Ω 仍应视为【±30% 量级的估计】。 */
  function daviesGamma(I, z, Tc) {
    if (!(I > 0)) return 1;
    const A = 0.4918 + 6.6e-4 * Tc + 4.87e-6 * Tc * Tc;
    const si = sqrt(I);
    return pow(10, -A * z * z * (si / (1 + si) - 0.3 * I));
  }
  /* 离子强度估算 (mol/L) —— 由已知的碱度与钙硬度 + 电荷平衡推出。
     I = 0.5·Σci·zi²; 已知 Ca²⁺ 与 HCO3⁻, 差额由一价离子 (Na⁺ 或 Cl⁻) 补平。
     ⚠ 这是【估算】: 未计 Mg²⁺、SO4²⁻ 等。典型 RAS 补水 I ≈ 0.004 M,
       与常用经验式 I ≈ 2.5e-5 × TDS 在 TDS 160 mg/L 处一致。 */
  function ionicStrengthFW(alk_mgL_CaCO3, caHard_mgL_CaCO3) {
    const mHCO3 = (alk_mgL_CaCO3 > 0 ? alk_mgL_CaCO3 : 0) / 50043;      // mol/L
    const mCa = (caHard_mgL_CaCO3 > 0 ? caHard_mgL_CaCO3 : 0) / 100090; // mol/L
    return 0.5 * (4 * mCa + mHCO3 + Math.abs(mHCO3 - 2 * mCa));
  }

  /* v2.5 IRAS_V25_CA_INPUT: 钙硬度 (mg/L as CaCO3) → Ca (mol/kg-SW)
     工程上钙硬度本就是常测项, 试剂盒读数即此单位。换算关系:
       钙硬度(as CaCO3) = [Ca2+] mg/L × 2.497   (100.09/40.078)
     再按简单盐度密度式 rho = 1 + 8e-4·S 折成 mol/kg-SW, 与本模块其他换算同源。 */
  function caFromHardness(hardness_mgL_CaCO3, S) {
    if (!(hardness_mgL_CaCO3 > 0)) return null;
    const ca_mgL = hardness_mgL_CaCO3 / 2.497;
    return ca_mgL / 40078 / (1 + 0.0008 * S);
  }
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

  /* ---- 反向: 总碱度 + 总无机碳 → 溶解 CO2 (mol/kg-SW) ----
     v2.5 IRAS_V25_CO2_BUFFER
     【用途】CO2 被气相吹走时, TA【不变】而 DIC 减少 —— CO2 与气相交换是碱度中性的。
       平衡随即右移 (HCO3- + H+ -> CO2 + H2O), 一部分重碳酸盐转回自由 CO2 补上,
       故【自由 CO2 的下降小于被吹走的质量】。要算出真实降幅, 必须由 (TA, DIC_new) 反解。
     【为什么必须反解而不能代数直解】solveAlk 能直解是因为目标 pH 已知 ⇒ [H+] 已知;
       此处 DIC 已知而 [H+] 未知, 且 DIC(CO2) 是 CO2 与 H 的耦合式, 无闭式反函数。
       故用二分 —— 与 solve() 同款几何二分, 因 CO2 跨多个数量级。
     【单调性依据】固定 TA 时 DIC 随 CO2aq 严格单调增: CO2 增加使 H 增加,
       碳酸盐各项按 K1·CO2/H 与 2K1K2·CO2/H^2 分配, 总量仍随 CO2 增。二分因此适用。
     ⚠ 区间 [1e-12, 1e-1] mol/kg 覆盖 pH 约 2..12 对应的 CO2 范围; 与 solve() 的
       pH 区间同源。落在区间外时返回端点 —— 与 solve() 的 boundaryHit 同一处境,
       调用方须自行判断合理性 (本模块不抛异常, 调用方多为静默降级路径)。 */
  function co2FromDIC(TA, DIC, Tc, S) {
    let lo = 1e-12, hi = 1e-1, m = 0;
    for (let i = 0; i < 200; i++) {
      m = sqrt(lo * hi);
      if (solve(TA, m, Tc, S).DIC > DIC) hi = m; else lo = m;
    }
    return m;
  }

  /* ---- 碳酸盐缓冲因子: 吹走单位质量 CO2 时, 自由 CO2 实际下降的倒数 ----
     v2.5 IRAS_V25_CO2_BUFFER
       factor = ΔDIC / Δ[CO2]  (>= 1)
     它就是海洋化学的 Revelle 因子换个写法:
       Revelle = (Δ[CO2]/[CO2]) / (ΔDIC/DIC)  ⇒  factor = DIC / ([CO2] × Revelle)
     实测本模型工况 Revelle ≈ 13.9 (pH 7.22, 海水), 落在海洋典型 8-15 内 —— 独立旁证。
     【物理含义】自由 CO2 只占 DIC 约 6%, 却吸收了 84% 的 DIC 变化: 小池子被大池子撑着。
     【用法】凡按【气相载量】算出的移除量 (kLoad × 风量 × 逼近), 得到的是从 DIC 里
       转移走的【质量】, 若直接当作自由 CO2 的降幅使用, 等价于假设 factor = 1.0,
       会系统性高估去除率。淡水 ≈1.02 (可忽略), 海水 150 mg/L 碱度 ≈1.12-1.18。
     ⚠ 而脱气塔的 η 来自【实测进出水自由 CO2 之比】, 本就是"表观"口径,
       缓冲已含在那个实测数里 —— 【不可】再乘一次, 否则重复计算。
     ⚠ dm 取小值求导数: 实测 1 mg/L 步长给 1.201, 0.01 mg/L 给 1.183, 差 1.6%。
       默认 1e-3 mg/L 当量, 已足够收敛且不触及二分精度下限。 */
  function co2BufferFactor(TA, CO2aq, Tc, S, dm) {
    const r0 = solve(TA, CO2aq, Tc, S);
    const d = (dm != null ? dm : 1e-3) / 44010 / (1 + 0.0008 * S);   // mol/kg 当量
    if (!(r0.DIC > d)) return 1;
    const c1 = co2FromDIC(TA, r0.DIC - d, Tc, S);
    const drop = CO2aq - c1;
    if (!(drop > 0)) return 1;
    return d / drop;
  }

  // 非离子化氨 (剧毒) 占 TAN 比例 f = [NH3]/TAN = Ka/(Ka+[H+]_SWS), 用 SWS 标度 Ka 和 H
  function nh3Fraction(H_sws, Tc, S) {
    const Ka = Ka_NH3_SWS(Tc + 273.15, S);   // CW95, SWS 标度; 物理比例与标度无关
    return Ka / (Ka + H_sws);
  }

  const api = {
    co2FromDIC, co2BufferFactor,      // v2.5 IRAS_V25_CO2_BUFFER
    solve, solveAlk, nh3Fraction, bufferBeta, Ca_RT67, Ksp_calcite_M83,
    caFromHardness,                   // v2.5 IRAS_V25_CA_INPUT
    daviesGamma, ionicStrengthFW,     // v2.5 IRAS_V25_CA_ACTIVITY
    K0_W74, K1K2_M10, KW_M79, KB_SWS, KB_TOT_D90b, KS_FREE_D90a, KF_FREE_DR79,
    fH_TWB82, Ka_NH3_CW95_TOT, Ka_NH3_SWS, boronTotal, sulfateTotal, fluorideTotal, ionicStrength
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.iRASCarbonate = api;
})(typeof window !== 'undefined' ? window : globalThis);
