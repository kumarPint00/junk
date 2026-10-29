import Dexie, { type EntityTable } from 'dexie';
import type {
  Project, Account, FundingSource, Milestone, Party, Material,
  Transaction, Attachment, SyncMeta, AppSnapshot
} from './types';

class PlotToGharDB extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  accounts!: EntityTable<Account, 'id'>;
  fundingSources!: EntityTable<FundingSource, 'id'>;
  milestones!: EntityTable<Milestone, 'id'>;
  parties!: EntityTable<Party, 'id'>;
  materials!: EntityTable<Material, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  attachments!: EntityTable<Attachment, 'id'>;
  syncMeta!: EntityTable<SyncMeta, 'key'>;

  constructor() {
    super('plot-to-ghar-v1');
    this.version(1).stores({
      projects: 'id, status, createdAt, updatedAt',
      accounts: 'id, projectId, kind, active, updatedAt',
      fundingSources: 'id, projectId, type, updatedAt',
      milestones: 'id, projectId, sequence, status, updatedAt',
      parties: 'id, projectId, kind, name, updatedAt',
      materials: 'id, projectId, category, name, updatedAt',
      transactions: 'id, projectId, date, type, category, milestoneId, partyId, updatedAt',
      attachments: 'id, projectId, transactionId, milestoneId, updatedAt',
      syncMeta: 'key'
    });
  }
}

export const db = new PlotToGharDB();

export const nowIso = () => new Date().toISOString();
export const id = () => crypto.randomUUID();

export const DEFAULT_MILESTONES = [
  ['PLOT_LOCKED', 'Plot locked'],
  ['REGISTRY', 'Registry'],
  ['POSSESSION', 'Possession received'],
  ['MUTATION', 'Mutation / post-registry'],
  ['SITE_PREP', 'Site preparation'],
  ['FOUNDATION', 'Foundation & plinth'],
  ['GF_STRUCTURE', 'Ground floor structure'],
  ['GF_MASONRY', 'Ground floor masonry'],
  ['FF_STRUCTURE', 'First floor structure'],
  ['FF_MASONRY', 'First floor masonry'],
  ['PLUMBING', 'Plumbing'],
  ['ELECTRICAL', 'Electrical'],
  ['FLOORING', 'Flooring'],
  ['DOORS_WINDOWS', 'Doors & windows'],
  ['KITCHEN_BATH', 'Kitchen & bathrooms'],
  ['PAINT_EXTERIOR', 'Painting & exterior'],
  ['TERRACE', 'Terrace & waterproofing'],
  ['FINISHING', 'Final finishing'],
  ['COMPLETED', 'Project completed']
] as const;

export async function createInitialProject(input: {
  name: string;
  plotAddress: string;
  plotAreaSqYard?: number;
  agreedPurchasePrice?: number;
  ownerName: string;
  sellerName: string;
  totalBudget?: number;
}) {
  const projectId = id();
  const ts = nowIso();

  const project: Project = {
    id: projectId,
    ...input,
    status: 'REGISTRY_PENDING',
    createdAt: ts,
    updatedAt: ts
  };

  const bank: Account = {
    id: id(), projectId, name: 'ICICI Salary Account', kind: 'BANK',
    openingBalance: 0, bankName: 'ICICI Bank', active: true, createdAt: ts, updatedAt: ts
  };
  const cash: Account = {
    id: id(), projectId, name: 'Construction Cash', kind: 'CASH',
    openingBalance: 0, active: true, createdAt: ts, updatedAt: ts
  };

  const fundingSources: FundingSource[] = [
    {
      id: id(), projectId, name: 'Piramal Purchase Loan', type: 'PURCHASE_LOAN',
      committedAmount: 2500000, createdAt: ts, updatedAt: ts
    },
    {
      id: id(), projectId, name: 'Piramal Construction Loan', type: 'CONSTRUCTION_LOAN',
      committedAmount: 2100000, createdAt: ts, updatedAt: ts
    },
    {
      id: id(), projectId, name: 'Own Funds', type: 'OWN_FUNDS',
      committedAmount: 0, createdAt: ts, updatedAt: ts
    },
    {
      id: id(), projectId, name: 'Family Contribution', type: 'FAMILY',
      committedAmount: 0, createdAt: ts, updatedAt: ts
    }
  ];

  const milestones: Milestone[] = DEFAULT_MILESTONES.map(([code, name], index) => ({
    id: id(),
    projectId,
    code,
    name,
    sequence: index + 1,
    status: index === 0 ? 'COMPLETED' : index === 1 ? 'IN_PROGRESS' : 'PENDING',
    completedDate: index === 0 ? ts.slice(0, 10) : undefined,
    createdAt: ts,
    updatedAt: ts
  }));

  await db.transaction('rw', db.projects, db.accounts, db.fundingSources, db.milestones, async () => {
    await db.projects.add(project);
    await db.accounts.bulkAdd([bank, cash]);
    await db.fundingSources.bulkAdd(fundingSources);
    await db.milestones.bulkAdd(milestones);
  });

  return project;
}

export async function exportSnapshot(): Promise<AppSnapshot> {
  const project = await db.projects.orderBy('createdAt').first();
  const [
    accounts, fundingSources, milestones, parties,
    materials, transactions, attachments
  ] = await Promise.all([
    db.accounts.toArray(),
    db.fundingSources.toArray(),
    db.milestones.toArray(),
    db.parties.toArray(),
    db.materials.toArray(),
    db.transactions.toArray(),
    db.attachments.toArray()
  ]);
  const revision = Number((await db.syncMeta.get('revision'))?.value || '0');
  return {
    schemaVersion: 1,
    revision,
    exportedAt: nowIso(),
    project,
    accounts,
    fundingSources,
    milestones,
    parties,
    materials,
    transactions,
    attachments: attachments.map(({ localBlob: _localBlob, ...rest }) => rest)
  };
}

function newer<T extends { id: string; updatedAt: string }>(a?: T, b?: T): T | undefined {
  if (!a) return b;
  if (!b) return a;
  return a.updatedAt >= b.updatedAt ? a : b;
}

function mergeRecords<T extends { id: string; updatedAt: string }>(a: T[], b: T[]): T[] {
  const map = new Map<string, T>();
  [...a, ...b].forEach((row) => map.set(row.id, newer(map.get(row.id), row)!));
  return [...map.values()];
}

export function mergeSnapshots(local: AppSnapshot, remote: AppSnapshot): AppSnapshot {
  return {
    schemaVersion: 1,
    revision: Math.max(local.revision, remote.revision) + 1,
    exportedAt: nowIso(),
    project: newer(local.project, remote.project),
    accounts: mergeRecords(local.accounts, remote.accounts),
    fundingSources: mergeRecords(local.fundingSources, remote.fundingSources),
    milestones: mergeRecords(local.milestones, remote.milestones),
    parties: mergeRecords(local.parties, remote.parties),
    materials: mergeRecords(local.materials, remote.materials),
    transactions: mergeRecords(local.transactions, remote.transactions),
    attachments: mergeRecords(local.attachments, remote.attachments)
  };
}

export async function importSnapshot(snapshot: AppSnapshot) {
  if (snapshot.schemaVersion !== 1) throw new Error('Unsupported backup version');
  await db.transaction(
    'rw',
    db.projects, db.accounts, db.fundingSources, db.milestones,
    db.parties, db.materials, db.transactions, db.attachments, db.syncMeta,
    async () => {
      if (snapshot.project) await db.projects.put(snapshot.project);
      await db.accounts.bulkPut(snapshot.accounts);
      await db.fundingSources.bulkPut(snapshot.fundingSources);
      await db.milestones.bulkPut(snapshot.milestones);
      await db.parties.bulkPut(snapshot.parties);
      await db.materials.bulkPut(snapshot.materials);
      await db.transactions.bulkPut(snapshot.transactions);
      await db.attachments.bulkPut(snapshot.attachments);
      await db.syncMeta.put({ key: 'revision', value: String(snapshot.revision) });
    }
  );
}

export async function bumpRevision() {
  const current = Number((await db.syncMeta.get('revision'))?.value || '0');
  await db.syncMeta.put({ key: 'revision', value: String(current + 1) });
}
