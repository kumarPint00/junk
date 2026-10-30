import type { ProjectReminder, StockMovement, WorkTask } from './types';

export function emi(principal: number, annualPercent: number, months: number): number {
  if (!Number.isFinite(principal) || !Number.isFinite(annualPercent) || !Number.isFinite(months) || principal <= 0 || months <= 0 || annualPercent < 0) return 0;
  const r = annualPercent / 1200;
  if (r === 0) return principal / months;
  const factor = Math.pow(1 + r, months);
  return principal * r * factor / (factor - 1);
}

export function loanProjection(principal: number, rate: number, tenureMonths: number, extraMonthly = 0, termLimit = 360) {
  let balance = Math.max(0, principal);
  const normalEmi = emi(balance, rate, tenureMonths);
  const monthlyRate = Math.max(0, rate) / 1200;
  const schedule: { month: number; interest: number; principal: number; balance: number; payment: number }[] = [];
  for (let i = 1; i <= Math.min(termLimit, 600) && balance > 0.01; i++) {
    const interest = balance * monthlyRate;
    const payment = Math.min(balance + interest, normalEmi + Math.max(0, extraMonthly));
    const towardPrincipal = payment - interest;
    if (towardPrincipal <= 0) break;
    balance = Math.max(0, balance - towardPrincipal);
    schedule.push({ month: i, interest, principal: towardPrincipal, balance, payment });
  }
  return { emi: normalEmi, schedule, totalInterest: schedule.reduce((a, x) => a + x.interest, 0), remainingAfterHorizon: balance };
}

export function stockBalances(items: { id: string }[], movements: StockMovement[]) {
  const result: Record<string, number> = Object.fromEntries(items.map((x) => [x.id, 0]));
  for (const m of movements) {
    const sign = m.type === 'RECEIPT' || m.type === 'CORRECTION_IN' ? 1 : -1;
    result[m.itemId] = (result[m.itemId] || 0) + sign * Number(m.quantity || 0);
  }
  return result;
}

export function hasScheduleCycle(work: WorkTask[], taskId: string, dependsOn?: string) {
  const parents = new Map(work.map((t) => [t.id, t.dependsOnId]));
  parents.set(taskId, dependsOn);
  const visited = new Set<string>();
  let next = dependsOn;
  while (next) {
    if (visited.has(next) || next === taskId) return true;
    visited.add(next);
    next = parents.get(next);
  }
  return false;
}

export function materialEstimate(kind: 'concrete' | 'brickwork', lengthM: number, widthM: number, depthM: number) {
  const volume = lengthM * widthM * depthM;
  if (![lengthM, widthM, depthM].every((n) => Number.isFinite(n) && n > 0)) return { volume: 0, cementBags: 0, sandM3: 0, aggregateM3: 0, bricks: 0, steelKgLow: 0, steelKgHigh: 0 };
  if (kind === 'brickwork') {
    return { volume, cementBags: 0, sandM3: 0, aggregateM3: 0, bricks: Math.ceil(volume * 500), steelKgLow: 0, steelKgHigh: 0 };
  }
  // Only a nominal 1:1.5:3 mix and a dry-volume multiplier, NOT a structural mix design.
  const dry = volume * 1.54;
  const cementM3 = dry / 5.5;
  return {
    volume,
    cementBags: Math.ceil(cementM3 / 0.0347),
    sandM3: dry * 1.5 / 5.5,
    aggregateM3: dry * 3 / 5.5,
    bricks: 0,
    steelKgLow: Math.round(volume * 80),
    steelKgHigh: Math.round(volume * 120),
  };
}

export function dueReminders(reminders: ProjectReminder[], now: Date) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return reminders.filter((r) => {
    if (r.completed && r.repeat === 'NONE') return false;
    if (!r.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(r.dueDate)) return false;
    const [year, month, day] = r.dueDate.split('-').map(Number);
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return false;
    if (r.repeat === 'MONTHLY') {
      const expectedDay = Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate());
      const dueThisMonth = new Date(date.getFullYear(), date.getMonth(), expectedDay);
      return date >= new Date(year, month - 1, day) && date >= dueThisMonth;
    }
    return date >= new Date(year, month - 1, day);
  });
}


/** Planning-only plaster quantity for a cement:sand 1:4 mix. Structural or site specifications prevail. */
export function plasterEstimate(areaM2: number, thicknessMm: number, sandParts = 4) {
  if (![areaM2, thicknessMm, sandParts].every(n => Number.isFinite(n) && n > 0)) {
    return { areaM2: 0, wetM3: 0, cementBags: 0, sandM3: 0 };
  }
  const wetM3 = areaM2 * thicknessMm / 1000;
  const dryM3 = wetM3 * 1.33; // Allowance for shrinkage and voids; excludes wastage
  const cementM3 = dryM3 / (1 + sandParts);
  return { areaM2, wetM3, cementBags: Math.ceil(cementM3 / 0.0347), sandM3: dryM3 * sandParts / (1 + sandParts) };
}

/** Tile purchase allowance; tile dimensions must include any chosen grout gap separately. */
export function flooringEstimate(areaM2: number, tileLengthCm: number, tileWidthCm: number, wastePercent = 5) {
  if (![areaM2, tileLengthCm, tileWidthCm, wastePercent].every(n => Number.isFinite(n))
      || areaM2 <= 0 || tileLengthCm <= 0 || tileWidthCm <= 0 || wastePercent < 0 || wastePercent > 50) {
    return { areaM2: 0, tileAreaM2: 0, tilesWithoutWaste: 0, tilesWithWaste: 0 };
  }
  const tileAreaM2 = tileLengthCm * tileWidthCm / 10000;
  return { areaM2, tileAreaM2, tilesWithoutWaste: Math.ceil(areaM2 / tileAreaM2),
    tilesWithWaste: Math.ceil(areaM2 * (1 + wastePercent / 100) / tileAreaM2) };
}
