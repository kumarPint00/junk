export type ProjectStatus =
  | 'PLOT_LOCKED'
  | 'REGISTRY_PENDING'
  | 'REGISTRY_COMPLETED'
  | 'POSSESSION_RECEIVED'
  | 'POST_REGISTRY'
  | 'PRE_CONSTRUCTION'
  | 'CONSTRUCTION'
  | 'FINISHING'
  | 'COMPLETED';

export type TransactionType =
  | 'FUNDING_IN'
  | 'TRANSFER'
  | 'EXPENSE'
  | 'DIRECT_FUNDED_EXPENSE'
  | 'ADVANCE'
  | 'ADVANCE_ADJUSTMENT'
  | 'REFUND'
  | 'LOAN_REPAYMENT'
  | 'ADJUSTMENT';

export type AccountKind = 'BANK' | 'CASH' | 'OTHER';
export type MilestoneStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
export type PartyKind = 'SELLER' | 'CONTRACTOR' | 'VENDOR' | 'ENGINEER' | 'ADVOCATE' | 'OTHER';

export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface Project extends BaseRecord {
  name: string;
  status: ProjectStatus;
  plotAddress: string;
  plotAreaSqYard?: number;
  agreedPurchasePrice?: number;
  ownerName: string;
  sellerName: string;
  totalBudget?: number;
  notes?: string;
}

export interface Account extends BaseRecord {
  projectId: string;
  name: string;
  kind: AccountKind;
  openingBalance: number;
  bankName?: string;
  last4?: string;
  active: boolean;
}

export interface FundingSource extends BaseRecord {
  projectId: string;
  name: string;
  type: 'OWN_FUNDS' | 'PURCHASE_LOAN' | 'CONSTRUCTION_LOAN' | 'FAMILY' | 'REFUND' | 'OTHER';
  committedAmount: number;
  notes?: string;
}

export interface Milestone extends BaseRecord {
  projectId: string;
  code: string;
  name: string;
  sequence: number;
  status: MilestoneStatus;
  plannedDate?: string;
  completedDate?: string;
  budget?: number;
  notes?: string;
}

export interface Party extends BaseRecord {
  projectId: string;
  kind: PartyKind;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
}

export interface Material extends BaseRecord {
  projectId: string;
  name: string;
  unit: string;
  category: string;
  preferredVendorId?: string;
}

export interface Transaction extends BaseRecord {
  projectId: string;
  date: string;
  type: TransactionType;
  amount: number;
  sourceAccountId?: string;
  destinationAccountId?: string;
  fundingSourceId?: string;
  milestoneId?: string;
  partyId?: string;
  category?: string;
  description: string;
  notes?: string;
  paymentMethod?: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD' | 'OTHER';
  referenceNumber?: string;
  linkedTransactionId?: string;
  quantity?: number;
  unit?: string;
  rate?: number;
  transportCost?: number;
  discount?: number;
  materialId?: string;
}

export interface Attachment extends BaseRecord {
  projectId: string;
  transactionId?: string;
  milestoneId?: string;
  name: string;
  mimeType: string;
  size: number;
  localBlob?: Blob;
  remoteUrl?: string;
}

export interface SyncMeta {
  key: string;
  value: string;
}

export interface AppSnapshot {
  schemaVersion: 1;
  revision: number;
  exportedAt: string;
  project?: Project;
  accounts: Account[];
  fundingSources: FundingSource[];
  milestones: Milestone[];
  parties: Party[];
  materials: Material[];
  transactions: Transaction[];
  attachments: Omit<Attachment, 'localBlob'>[];
}

export interface FinanceSummary {
  accountBalances: Record<string, number>;
  totalAvailable: number;
  totalCost: number;
  totalFundingReceived: number;
  advancesPaid: number;
  advancesAdjusted: number;
  advancesOutstanding: number;
  categoryTotals: Record<string, number>;
  milestoneTotals: Record<string, number>;
  fundingReceivedBySource: Record<string, number>;
}
