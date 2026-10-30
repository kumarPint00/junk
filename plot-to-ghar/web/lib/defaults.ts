import type { ConstructionPhase, ProjectState } from './types';

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
    version: 2,
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
    version: 2,
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
  for (const p of state.phases) {
    if (!p.id || !p.name?.trim()) throw new Error('Invalid construction phase.');
    if (!Number.isFinite(Number(p.budgetAmount)) || Number(p.budgetAmount) < 0) throw new Error('Invalid phase budget.');
  }
  return state;
}
