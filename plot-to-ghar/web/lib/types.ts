export type TxType =
  | 'FUNDING_IN'
  | 'TRANSFER'
  | 'EXPENSE'
  | 'ADVANCE'
  | 'ADVANCE_ADJUSTMENT'
  | 'ADVANCE_REFUND'
  | 'REFUND'
  | 'DIRECT_FUNDED_EXPENSE'
  | 'LOAN_REPAYMENT';

export type CostBucket = 'ACQUISITION' | 'CONSTRUCTION' | 'OTHER';

export type Account = {
  id: string;
  name: string;
  type: 'BANK' | 'CASH' | 'OTHER';
  openingBalance: number;
  active: boolean;
  notes?: string;
};

export type FundingSource = {
  id: string;
  name: string;
  type: 'OWN_FUNDS' | 'PURCHASE_LOAN' | 'CONSTRUCTION_LOAN' | 'FAMILY' | 'REFUND' | 'OTHER';
  committedAmount: number;
  notes?: string;
};

export type Milestone = {
  id: string;
  name: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
  sequence: number;
  completedAt?: string;
  notes?: string;
};

export type Entity = {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  gstin?: string;
  specialty?: string;
  notes?: string;
  active?: boolean;
};

export type ConstructionPhase = {
  id: string;
  name: string;
  sequence: number;
  budgetAmount: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD' | 'SKIPPED';
  progressPercent: number;
  startDate?: string;
  expectedEndDate?: string;
  completedAt?: string;
  notes?: string;
};

export type LoanFacility = {
  id: string;
  lenderName: string;
  sanctionedAmount: number;
  purchaseComponent: number;
  constructionComponent: number;
  interestRate?: number;
  tenureMonths?: number;
  emiAmount?: number;
  notes?: string;
};

export type CashReconciliation = {
  id: string;
  accountId: string;
  date: string;
  systemBalance: number;
  countedBalance: number;
  difference: number;
  notes?: string;
};

export type ProjectState = {
  version: number;
  revision?: number;
  project: {
    name: string;
    status: string;
    propertyAddress: string;
    plotAreaSqYard: number;
    agreedPurchasePrice: number;
    ownerName: string;
    sellerName: string;
    registryTargetDate?: string;
    notes?: string;
  };
  accounts: Account[];
  fundingSources: FundingSource[];
  milestones: Milestone[];
  phases: ConstructionPhase[];
  vendors: Entity[];
  contractors: Entity[];
  loans: LoanFacility[];
  cashReconciliations: CashReconciliation[];
  updatedAt: string;
};

export type LineItem = {
  description: string;
  quantity?: number;
  unit?: string;
  rate?: number;
  amount: number;
};

export type AttachmentRef = {
  pathname: string;
  name: string;
  contentType: string;
  size: number;
};

export type Transaction = {
  id: string;
  createdAt: string;
  transactionDate: string;
  type: TxType;
  amount: number;
  sourceAccountId?: string;
  destinationAccountId?: string;
  fundingSourceId?: string;
  milestoneId?: string;
  phaseId?: string;
  vendorId?: string;
  contractorId?: string;
  costBucket?: CostBucket;
  category?: string;
  payee?: string;
  referenceNumber?: string;
  description?: string;
  notes?: string;
  lineItems?: LineItem[];
  attachments?: AttachmentRef[];
  reversalOf?: string;
  linkedTransactionId?: string;
};

export type LedgerSummary = {
  projectCost: number;
  acquisitionCost: number;
  constructionCost: number;
  otherCost: number;
  fundingReceived: number;
  advancesOutstanding: number;
  loanRepayments: number;
  accountBalances: Record<string, number>;
  phaseSpend: Record<string, number>;
  categorySpend: Record<string, number>;
  monthlySpend: Record<string, number>;
  txCount: number;
};
