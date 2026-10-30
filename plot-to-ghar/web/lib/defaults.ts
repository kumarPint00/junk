import type { ConstructionPhase, ProjectState, Transaction } from './types';

const milestoneNames = [
  'Plot Locked',
  'Registry Preparation',
  'Registry Completed',
  'Possession Received',
  'Mutation / Post Registry',
  'Construction Planning',
  'Foundation & Plinth',
  'Ground Floor Structure',
  'First Floor Structure',
  'MEP',
  'Finishing',
  'Completed',
];

const phaseNames = [
  'Plot Purchase',
  'Registry & Legal',
  'Post-Registry & Mutation',
  'Design & Pre-Construction',
  'Site Preparation',
  'Excavation & PCC',
  'Foundation & Footing',
  'Plinth, Filling & DPC',
  'Ground Floor RCC',
  'Ground Floor Masonry',
  'First Floor RCC',
  'First Floor Masonry',
  'Plumbing',
  'Electrical',
  'Waterproofing',
  'Flooring',
  'Doors, Windows & Fabrication',
  'Kitchen & Bathrooms',
  'Painting & Exterior',
  'Terrace & Final Finishing',
];

function defaultPhases(): ConstructionPhase[] {
  return phaseNames.map((name, i) => ({
    id: `phase-${i + 1}`,
    name,
    sequence: i + 1,
    budgetAmount: 0,
    status: 'PENDING',
    progressPercent: 0,
  }));
}

export function defaultState(): ProjectState {
  return {
    version: 4,
    revision: 1,
    project: {
      name: 'C-19 Plot to Home',
      status: 'REGISTRY_PENDING',
      propertyAddress: '',
      plotAreaSqYard: 120,
      agreedPurchasePrice: 0,
      ownerName: '',
      sellerName: '',
      notes: '',
    },
    accounts: [
      { id: 'bank-main', name: 'Main Bank Account', type: 'BANK', openingBalance: 0, active: true },
      { id: 'cash-main', name: 'Construction Cash', type: 'CASH', openingBalance: 0, active: true },
    ],
    fundingSources: [
      { id: 'loan-purchase', name: 'Purchase Loan', type: 'PURCHASE_LOAN', committedAmount: 2500000 },
      { id: 'loan-construction', name: 'Construction Loan', type: 'CONSTRUCTION_LOAN', committedAmount: 2100000 },
      { id: 'own-funds', name: 'Own Funds', type: 'OWN_FUNDS', committedAmount: 0 },
      { id: 'family', name: 'Family Contribution', type: 'FAMILY', committedAmount: 0 },
    ],
    milestones: milestoneNames.map((name, i) => ({
      id: `m-${i + 1}`,
      name,
      sequence: i + 1,
      status: i === 0 ? 'COMPLETED' : i === 1 ? 'IN_PROGRESS' : 'PENDING',
    })),
    phases: defaultPhases(),
    vendors: [],
    contractors: [],
    loans: [
      {
        id: 'loan-piramal',
        lenderName: 'Piramal Finance',
        sanctionedAmount: 4600000,
        purchaseComponent: 2500000,
        constructionComponent: 2100000,
      },
    ],
    cashReconciliations: [],
    construction: {
      floors: [
        { id: 'floor-ground', name: 'Ground Floor · Shops + Parking', areaSqFt: 0, budgetAmount: 0, status: 'PLANNED' },
        { id: 'floor-first', name: 'First Floor · 4BHK', areaSqFt: 0, budgetAmount: 0, status: 'PLANNED' },
        { id: 'floor-terrace', name: 'Terrace / Roof', areaSqFt: 0, budgetAmount: 0, status: 'PLANNED' },
      ],
      schedule: [], agreements: [], progress: [], stockItems: [], stockMovements: [], reminders: [],
    },
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeState(input?: Partial<ProjectState> | null): ProjectState {
  const base = defaultState();
  if (!input) return base;

  const project = { ...base.project, ...(input.project || {}) };
  const accounts = Array.isArray(input.accounts) && input.accounts.length ? input.accounts : base.accounts;
  const fundingSources =
    Array.isArray(input.fundingSources) && input.fundingSources.length ? input.fundingSources : base.fundingSources;
  const milestones =
    Array.isArray(input.milestones) && input.milestones.length ? input.milestones : base.milestones;
  const phases = Array.isArray(input.phases) && input.phases.length ? input.phases : base.phases;

  return {
    ...base,
    ...input,
    version: 3,
    revision: Number(input.revision || 1),
    project,
    accounts: accounts.map((a) => ({ ...a, openingBalance: Number(a.openingBalance || 0), active: a.active !== false })),
    fundingSources: fundingSources.map((f) => ({ ...f, committedAmount: Number(f.committedAmount || 0) })),
    milestones: milestones.map((m, i) => ({ ...m, sequence: Number(m.sequence || i + 1) })),
    phases: phases.map((p, i) => ({
      ...p,
      sequence: Number(p.sequence || i + 1),
      budgetAmount: Number(p.budgetAmount || 0),
      progressPercent: Math.max(0, Math.min(100, Number(p.progressPercent || 0))),
      status: p.status || 'PENDING',
    })),
    vendors: Array.isArray(input.vendors) ? input.vendors : [],
    contractors: Array.isArray(input.contractors) ? input.contractors : [],
    loans: Array.isArray(input.loans) && input.loans.length ? input.loans : base.loans,
    cashReconciliations: Array.isArray(input.cashReconciliations) ? input.cashReconciliations : [],
    construction: {
      floors: Array.isArray(input.construction?.floors) ? input.construction.floors : base.construction.floors,
      schedule: Array.isArray(input.construction?.schedule) ? input.construction.schedule : [],
      agreements: Array.isArray(input.construction?.agreements) ? input.construction.agreements : [],
      progress: Array.isArray(input.construction?.progress) ? input.construction.progress : [],
      stockItems: Array.isArray(input.construction?.stockItems) ? input.construction.stockItems : [],
      stockMovements: Array.isArray(input.construction?.stockMovements) ? input.construction.stockMovements : [],
      reminders: Array.isArray(input.construction?.reminders) ? input.construction.reminders : [],
    },
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

export function validateProjectState(state: ProjectState) {
  if (!state.project?.name?.trim()) throw new Error('Project name is required.');
  if (state.project.name.length > 120) throw new Error('Project name is too long.');
  if (state.accounts.length < 1 || state.accounts.length > 100) throw new Error('Invalid account list.');
  if (state.fundingSources.length > 100 || state.milestones.length > 100 || state.phases.length > 100) {
    throw new Error('Project configuration exceeds supported limits.');
  }
  const ids = new Set<string>();
  for (const a of state.accounts) {
    if (!a.id || ids.has(a.id)) throw new Error('Duplicate or missing account ID.');
    ids.add(a.id);
    if (!a.name?.trim()) throw new Error('Every account needs a name.');
    if (!Number.isFinite(Number(a.openingBalance))) throw new Error('Invalid opening balance.');
  }
  for (const f of state.fundingSources) {
    if (!f.id || !f.name.trim() || !Number.isFinite(f.committedAmount) || f.committedAmount < 0) throw new Error('Invalid funding commitment.');
  }
  if (!Number.isFinite(state.project.plotAreaSqYard) || state.project.plotAreaSqYard <= 0) throw new Error('Plot area must be positive.');
  if (!Number.isFinite(state.project.agreedPurchasePrice) || state.project.agreedPurchasePrice < 0) throw new Error('Agreed purchase price cannot be negative.');
  for (const loan of state.loans) {
    if (!loan.lenderName.trim() || [loan.sanctionedAmount,loan.purchaseComponent,loan.constructionComponent].some((n)=>!Number.isFinite(n)||n<0)) throw new Error('Invalid loan facility.');
  }
  for (const floor of state.construction.floors) {
    if (!floor.id || !floor.name.trim() || !Number.isFinite(floor.areaSqFt) || floor.areaSqFt < 0) throw new Error('Invalid floor area.');
    if (!Number.isFinite(floor.budgetAmount) || floor.budgetAmount < 0) throw new Error('Invalid floor budget.');
  }
  const workIds = new Set(state.construction.schedule.map((w) => w.id));
  for (const work of state.construction.schedule) {
    if (!work.name.trim() || !work.startDate || !work.endDate || work.endDate < work.startDate) throw new Error('Invalid construction schedule dates.');
    if (!Number.isFinite(work.estimatedCost) || work.estimatedCost < 0) throw new Error('Invalid work estimate.');
    if (work.dependsOnId && (!workIds.has(work.dependsOnId) || work.dependsOnId === work.id)) throw new Error('Invalid task dependency.');
    const visited = new Set<string>([work.id]);
    let current = work.dependsOnId;
    while (current) {
      if (visited.has(current)) throw new Error('Circular task dependencies are not allowed.');
      visited.add(current);
      current = state.construction.schedule.find((w)=>w.id===current)?.dependsOnId;
    }
  }
  for (const a of state.construction.agreements) {
    if (!a.title.trim() || !a.scope.trim() || !Number.isFinite(a.value) || a.value < 0) throw new Error('Invalid contractor agreement.');
    if (!state.contractors.some((c) => c.id === a.contractorId)) throw new Error('Agreement contractor not found.');
  }
  for (const item of state.construction.stockItems) {
    if (!item.name.trim() || !item.unit.trim() || !Number.isFinite(item.reorderLevel) || item.reorderLevel < 0) throw new Error('Invalid inventory item.');
  }
  const progressIds = new Set(state.construction.progress.map((p)=>p.id));
  for (const entry of state.construction.progress) {
    if (entry.supersedesId && (!progressIds.has(entry.supersedesId) || entry.supersedesId === entry.id)) {
      throw new Error('Progress correction must refer to another existing entry.');
    }
    if (!Number.isFinite(entry.progressPercent) || entry.progressPercent < 0 || entry.progressPercent > 100) throw new Error('Invalid progress percentage.');
  }
  for (const entry of state.construction.stockMovements) {
    if (!state.construction.stockItems.some((s) => s.id === entry.itemId) || !Number.isFinite(entry.quantity) || entry.quantity <= 0) throw new Error('Invalid inventory movement.');
    if (!['RECEIPT','CONSUMPTION','WASTAGE','RETURN','CORRECTION_IN','CORRECTION_OUT'].includes(entry.type)) throw new Error('Unknown stock movement.');
    if (entry.type.startsWith('CORRECTION_') && (!entry.notes || entry.notes.trim().length < 8)) throw new Error('Stock corrections require a reason.');
  }
  for (const p of state.phases) {
    if (!p.id || !p.name?.trim()) throw new Error('Invalid construction phase.');
    if (!Number.isFinite(Number(p.budgetAmount)) || Number(p.budgetAmount) < 0) throw new Error('Invalid phase budget.');
  }
  return state;
}

/**
 * Editable planning details are not the financial ledger.
 * Changing an opening balance after posting money creates phantom cash, so
 * changes to previously used accounts must be posted as explicit ledger entries.
 */
export function validateStateTransition(previous: ProjectState, next: ProjectState, transactions: Transaction[]) {
  const usedAccountIds = new Set(transactions.flatMap((t) => [t.sourceAccountId, t.destinationAccountId]).filter(Boolean));
  const usedSourceIds = new Set(transactions.map((t) => t.fundingSourceId).filter(Boolean));
  for (const prior of previous.accounts) {
    const updated = next.accounts.find((a) => a.id === prior.id);
    if (!updated && usedAccountIds.has(prior.id)) throw new Error('Cannot delete an account with transactions: ' + prior.name);
    if (!updated) continue;
    if (usedAccountIds.has(prior.id) && Math.round(updated.openingBalance * 100) !== Math.round(prior.openingBalance * 100)) {
      throw new Error('Opening balance for ' + prior.name + ' is locked after the first transaction. Use Add → audited balance correction.');
    }
  }
  for (const prior of previous.fundingSources) {
    const updated = next.fundingSources.find((f) => f.id === prior.id);
    if (!updated && usedSourceIds.has(prior.id)) throw new Error('Cannot remove a funding source already used in ledger.');
    if (updated && updated.type !== prior.type && usedSourceIds.has(prior.id)) {
      throw new Error('Cannot change an already-used funding source type.');
    }
  }
  // These documents are event history. Existing entries cannot be silently
  // overwritten through a general project-state PUT or device save.
  const unchanged = <T extends { id: string }>(before: T[], after: T[], label: string) => {
    for (const original of before) {
      const current = after.find((x)=>x.id===original.id);
      if (!current || JSON.stringify(original)!==JSON.stringify(current)) {
        throw new Error(label+' history cannot be edited or deleted. Append a correcting entry instead.');
      }
    }
  };
  unchanged(previous.construction.stockMovements, next.construction.stockMovements, 'Stock');
  unchanged(previous.construction.progress, next.construction.progress, 'Progress');
  unchanged(previous.cashReconciliations, next.cashReconciliations, 'Cash-count');

  const agreementIdsInLedger = new Set(transactions.map((t)=>t.agreementId).filter(Boolean));
  for (const before of previous.construction.agreements) {
    const after = next.construction.agreements.find((a)=>a.id===before.id);
    if (!after && (before.status!=='DRAFT' || agreementIdsInLedger.has(before.id))) {
      throw new Error('Signed or ledger-linked contractor agreements cannot be deleted.');
    }
    if (!after) continue;
    if (agreementIdsInLedger.has(before.id) && before.contractorId!==after.contractorId) throw new Error('Cannot change the contractor of an agreement with payments.');
    if (before.status==='CLOSED' && after.status!=='CLOSED') throw new Error('Closed agreements cannot be reopened.');
    if (before.status==='SIGNED' && after.status==='DRAFT') throw new Error('Signed agreements cannot revert to draft.');
    if (before.status==='SIGNED' || before.status==='CLOSED') {
      const legalTerms = (x: typeof before) => [x.contractorId,x.title,x.scope,x.value,x.advanceLimit,x.startDate,x.endDate,x.paymentTerms,x.retentionPercent,x.parentAgreementId];
      if (JSON.stringify(legalTerms(before)) !== JSON.stringify(legalTerms(after))) {
        throw new Error('Signed contractor terms cannot be edited. Create a draft amendment.');
      }
    }
  }
  for (const item of previous.construction.stockItems) {
    const updated = next.construction.stockItems.find((x)=>x.id===item.id);
    if (previous.construction.stockMovements.some((m)=>m.itemId===item.id)) {
      if (!updated) throw new Error('Cannot delete material with stock history.');
      if (updated.unit!==item.unit) throw new Error('Material unit is locked after stock movements exist.');
    }
  }

  const knownPhases = new Set(next.phases.map((p) => p.id));
  const knownFloors = new Set(next.construction.floors.map((f) => f.id));
  for (const t of transactions) {
    if (t.phaseId && !knownPhases.has(t.phaseId)) throw new Error('Cannot delete a phase used by the ledger.');
    if (t.floorId && !knownFloors.has(t.floorId)) throw new Error('Cannot delete a floor used by the ledger.');
  }
  return next;
}
