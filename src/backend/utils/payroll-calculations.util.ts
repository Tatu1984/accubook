/**
 * Payroll Statutory Calculations for India
 * - PF (Provident Fund)
 * - ESI (Employee State Insurance)
 * - TDS (Tax Deducted at Source)
 * - Professional Tax
 */

// FY 2024-25 Tax Slabs
export const NEW_REGIME_SLABS = [
  { min: 0, max: 300000, rate: 0 },
  { min: 300000, max: 700000, rate: 5 },
  { min: 700000, max: 1000000, rate: 10 },
  { min: 1000000, max: 1200000, rate: 15 },
  { min: 1200000, max: 1500000, rate: 20 },
  { min: 1500000, max: Infinity, rate: 30 },
];

export const OLD_REGIME_SLABS = [
  { min: 0, max: 250000, rate: 0 },
  { min: 250000, max: 500000, rate: 5 },
  { min: 500000, max: 1000000, rate: 20 },
  { min: 1000000, max: Infinity, rate: 30 },
];

// Standard Deduction (New Regime FY 2024-25)
export const STANDARD_DEDUCTION_NEW = 75000;
export const STANDARD_DEDUCTION_OLD = 50000;

// PF Configuration
export const PF_CONFIG = {
  wageLimit: 15000, // Basic + DA limit for PF calculation
  employeeContribution: 12, // 12% of basic (max 15000)
  employerContribution: 12, // 12% of basic
  employerEPSContribution: 8.33, // 8.33% goes to EPS (Pension)
  employerEPFContribution: 3.67, // 3.67% goes to EPF
  adminCharges: 0.5, // 0.5% admin charges
  edliCharges: 0.5, // 0.5% EDLI charges
};

// ESI Configuration
export const ESI_CONFIG = {
  wageLimit: 21000, // Monthly gross salary limit for ESI applicability
  employeeContribution: 0.75, // 0.75% of gross
  employerContribution: 3.25, // 3.25% of gross
};

// Professional Tax (varies by state, using Maharashtra as default)
export const PROFESSIONAL_TAX_SLABS = [
  { min: 0, max: 7500, tax: 0 },
  { min: 7500, max: 10000, tax: 175 },
  { min: 10000, max: Infinity, tax: 200 }, // 200 for 11 months, 300 for Feb
];

export interface SalaryComponents {
  basic: number;
  hra?: number;
  da?: number;
  conveyance?: number;
  specialAllowance?: number;
  otherAllowances?: number;
  overtimePay?: number;
  bonus?: number;
  [key: string]: number | undefined;
}

export interface PayrollDeductions {
  pf: number;
  employerPf: number;
  esi: number;
  employerEsi: number;
  tds: number;
  professionalTax: number;
  lop: number;
  otherDeductions: number;
}

export interface PayrollCalculationInput {
  employeeId: string;
  month: number;
  year: number;
  basicSalary: number;
  earnings: SalaryComponents;
  workingDays: number;
  presentDays: number;
  lopDays: number;
  taxRegime: "new" | "old";
  annualIncome?: number; // For TDS calculation
  declarations?: {
    section80C?: number;
    section80D?: number;
    hra?: number;
    otherDeductions?: number;
  };
  isEsiApplicable?: boolean;
  isPfApplicable?: boolean;
}

export interface PayrollCalculationResult {
  grossSalary: number;
  earnings: SalaryComponents;
  deductions: PayrollDeductions;
  totalDeductions: number;
  netSalary: number;
  employerContributions: {
    pf: number;
    esi: number;
    total: number;
  };
  ctc: number;
  breakdown: {
    component: string;
    amount: number;
    type: "earning" | "deduction" | "employer";
  }[];
}

/**
 * Calculate PF contribution
 */
export function calculatePF(basicSalary: number, da: number = 0): { employee: number; employer: number } {
  const pfWage = Math.min(basicSalary + da, PF_CONFIG.wageLimit);

  return {
    employee: Math.round(pfWage * (PF_CONFIG.employeeContribution / 100)),
    employer: Math.round(pfWage * (PF_CONFIG.employerContribution / 100)),
  };
}

/**
 * Calculate ESI contribution
 */
export function calculateESI(grossSalary: number): { employee: number; employer: number; applicable: boolean } {
  if (grossSalary > ESI_CONFIG.wageLimit) {
    return { employee: 0, employer: 0, applicable: false };
  }

  return {
    employee: Math.round(grossSalary * (ESI_CONFIG.employeeContribution / 100)),
    employer: Math.round(grossSalary * (ESI_CONFIG.employerContribution / 100)),
    applicable: true,
  };
}

/**
 * Calculate Professional Tax
 */
export function calculateProfessionalTax(monthlySalary: number, month: number): number {
  const slab = PROFESSIONAL_TAX_SLABS.find(
    (s) => monthlySalary >= s.min && monthlySalary < s.max
  );

  if (!slab) return 200;

  // February has 300 instead of 200 for the highest slab
  if (month === 2 && slab.tax === 200) {
    return 300;
  }

  return slab.tax;
}

/**
 * Calculate TDS based on annual income
 */
export function calculateTDS(
  annualIncome: number,
  taxRegime: "new" | "old",
  declarations?: {
    section80C?: number;
    section80D?: number;
    hra?: number;
    otherDeductions?: number;
  }
): { annualTax: number; monthlyTds: number } {
  const slabs = taxRegime === "new" ? NEW_REGIME_SLABS : OLD_REGIME_SLABS;
  const standardDeduction = taxRegime === "new" ? STANDARD_DEDUCTION_NEW : STANDARD_DEDUCTION_OLD;

  // Calculate taxable income
  let taxableIncome = annualIncome - standardDeduction;

  // Apply deductions for old regime
  if (taxRegime === "old" && declarations) {
    // Section 80C (max 1.5L)
    if (declarations.section80C) {
      taxableIncome -= Math.min(declarations.section80C, 150000);
    }
    // Section 80D (health insurance)
    if (declarations.section80D) {
      taxableIncome -= Math.min(declarations.section80D, 75000);
    }
    // HRA exemption
    if (declarations.hra) {
      taxableIncome -= declarations.hra;
    }
    // Other deductions
    if (declarations.otherDeductions) {
      taxableIncome -= declarations.otherDeductions;
    }
  }

  // New regime rebate under section 87A (for income up to 7L)
  if (taxRegime === "new" && taxableIncome <= 700000) {
    return { annualTax: 0, monthlyTds: 0 };
  }

  // Old regime rebate under section 87A (for income up to 5L)
  if (taxRegime === "old" && taxableIncome <= 500000) {
    return { annualTax: 0, monthlyTds: 0 };
  }

  taxableIncome = Math.max(0, taxableIncome);

  // Calculate tax
  let tax = 0;
  let remainingIncome = taxableIncome;

  for (const slab of slabs) {
    if (remainingIncome <= 0) break;

    const taxableInSlab = Math.min(remainingIncome, slab.max - slab.min);
    tax += taxableInSlab * (slab.rate / 100);
    remainingIncome -= taxableInSlab;
  }

  // Add 4% Health and Education Cess
  const cess = tax * 0.04;
  const totalTax = Math.round(tax + cess);

  // Surcharge for high income (simplified)
  let surcharge = 0;
  if (annualIncome > 5000000 && annualIncome <= 10000000) {
    surcharge = tax * 0.10;
  } else if (annualIncome > 10000000 && annualIncome <= 20000000) {
    surcharge = tax * 0.15;
  } else if (annualIncome > 20000000 && annualIncome <= 50000000) {
    surcharge = tax * 0.25;
  } else if (annualIncome > 50000000) {
    surcharge = tax * 0.37;
  }

  const finalTax = Math.round(tax + surcharge + (tax + surcharge) * 0.04);

  return {
    annualTax: finalTax,
    monthlyTds: Math.round(finalTax / 12),
  };
}

/**
 * Calculate Loss of Pay deduction
 */
export function calculateLOP(grossSalary: number, workingDays: number, lopDays: number): number {
  if (lopDays <= 0 || workingDays <= 0) return 0;
  const perDaySalary = grossSalary / workingDays;
  return Math.round(perDaySalary * lopDays);
}

/**
 * Main payroll calculation function
 */
export function calculatePayroll(input: PayrollCalculationInput): PayrollCalculationResult {
  const {
    basicSalary,
    earnings,
    workingDays,
    presentDays,
    lopDays,
    taxRegime,
    month,
    declarations,
    isEsiApplicable = true,
    isPfApplicable = true,
  } = input;

  // Calculate gross salary from components
  const basic = basicSalary;
  const hra = earnings.hra || 0;
  const da = earnings.da || 0;
  const conveyance = earnings.conveyance || 0;
  const specialAllowance = earnings.specialAllowance || 0;
  const otherAllowances = earnings.otherAllowances || 0;
  const overtimePay = earnings.overtimePay || 0;
  const bonus = earnings.bonus || 0;

  const grossSalary = basic + hra + da + conveyance + specialAllowance + otherAllowances + overtimePay + bonus;

  // Calculate annual income for TDS
  const annualIncome = input.annualIncome || grossSalary * 12;

  // Calculate deductions
  const pf = isPfApplicable ? calculatePF(basic, da) : { employee: 0, employer: 0 };
  const esi = isEsiApplicable ? calculateESI(grossSalary) : { employee: 0, employer: 0, applicable: false };
  const professionalTax = calculateProfessionalTax(grossSalary, month);
  const tds = calculateTDS(annualIncome, taxRegime, declarations);
  const lop = calculateLOP(grossSalary, workingDays, lopDays);

  const deductions: PayrollDeductions = {
    pf: pf.employee,
    employerPf: pf.employer,
    esi: esi.employee,
    employerEsi: esi.employer,
    tds: tds.monthlyTds,
    professionalTax,
    lop,
    otherDeductions: 0,
  };

  const totalDeductions = deductions.pf + deductions.esi + deductions.tds + deductions.professionalTax + deductions.lop + deductions.otherDeductions;

  const netSalary = grossSalary - totalDeductions;

  const employerContributions = {
    pf: pf.employer,
    esi: esi.employer,
    total: pf.employer + esi.employer,
  };

  const ctc = grossSalary + employerContributions.total;

  // Build breakdown
  const breakdown: PayrollCalculationResult["breakdown"] = [
    { component: "Basic Salary", amount: basic, type: "earning" },
    ...(hra > 0 ? [{ component: "HRA", amount: hra, type: "earning" as const }] : []),
    ...(da > 0 ? [{ component: "DA", amount: da, type: "earning" as const }] : []),
    ...(conveyance > 0 ? [{ component: "Conveyance", amount: conveyance, type: "earning" as const }] : []),
    ...(specialAllowance > 0 ? [{ component: "Special Allowance", amount: specialAllowance, type: "earning" as const }] : []),
    ...(otherAllowances > 0 ? [{ component: "Other Allowances", amount: otherAllowances, type: "earning" as const }] : []),
    ...(overtimePay > 0 ? [{ component: "Overtime Pay", amount: overtimePay, type: "earning" as const }] : []),
    ...(bonus > 0 ? [{ component: "Bonus", amount: bonus, type: "earning" as const }] : []),
    ...(pf.employee > 0 ? [{ component: "PF (Employee)", amount: pf.employee, type: "deduction" as const }] : []),
    ...(esi.employee > 0 ? [{ component: "ESI (Employee)", amount: esi.employee, type: "deduction" as const }] : []),
    ...(tds.monthlyTds > 0 ? [{ component: "TDS", amount: tds.monthlyTds, type: "deduction" as const }] : []),
    ...(professionalTax > 0 ? [{ component: "Professional Tax", amount: professionalTax, type: "deduction" as const }] : []),
    ...(lop > 0 ? [{ component: "Loss of Pay", amount: lop, type: "deduction" as const }] : []),
    ...(pf.employer > 0 ? [{ component: "PF (Employer)", amount: pf.employer, type: "employer" as const }] : []),
    ...(esi.employer > 0 ? [{ component: "ESI (Employer)", amount: esi.employer, type: "employer" as const }] : []),
  ];

  return {
    grossSalary,
    earnings: {
      basic,
      hra,
      da,
      conveyance,
      specialAllowance,
      otherAllowances,
      overtimePay,
      bonus,
    },
    deductions,
    totalDeductions,
    netSalary,
    employerContributions,
    ctc,
    breakdown,
  };
}

/**
 * Generate salary structure from CTC
 */
export function generateSalaryStructure(annualCtc: number): SalaryComponents & { monthlyGross: number } {
  // Standard structure: Basic 50%, HRA 40% of basic, Others remaining
  const monthlyCtc = annualCtc / 12;

  // Employer contributions (approx 13-15%)
  const employerContribution = monthlyCtc * 0.13;
  const monthlyGross = monthlyCtc - employerContribution;

  const basic = Math.round(monthlyGross * 0.50);
  const hra = Math.round(basic * 0.40);
  const conveyance = 1600; // Standard
  const specialAllowance = Math.round(monthlyGross - basic - hra - conveyance);

  return {
    basic,
    hra,
    da: 0,
    conveyance,
    specialAllowance: Math.max(0, specialAllowance),
    otherAllowances: 0,
    monthlyGross,
  };
}
