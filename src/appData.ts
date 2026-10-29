import { db } from './db';
import type { Project, Account, FundingSource, Milestone, Party, Material, Transaction, Attachment, TransactionType } from './types';

export type Tab = 'home' | 'journey' | 'add' | 'ledger' | 'more';
export type Data = {
  project?: Project;
  accounts: Account[];
  fundingSources: FundingSource[];
  milestones: Milestone[];
  parties: Party[];
  materials: Material[];
  transactions: Transaction[];
  attachments: Attachment[];
};

export const EMPTY: Data = { accounts:[], fundingSources:[], milestones:[], parties:[], materials:[], transactions:[], attachments:[] };

export const CATEGORIES = [
  'Plot purchase','Token / advance','Stamp duty','Registration','TDS','Advocate / legal','Mutation','Survey / demarcation',
  'Loan charges','Insurance','Architect / drawings','Site preparation','Excavation','Cement','Steel','Bricks','Sand','Aggregate',
  'RCC labour','Masonry labour','Plumbing','Electrical','Flooring','Doors / windows','Kitchen','Bathroom','Waterproofing',
  'Paint','Fabrication','Transport','Equipment rental','Other'
];

export const TX_LABELS: Record<TransactionType,string> = {
  FUNDING_IN:'Receive money', TRANSFER:'Transfer money', EXPENSE:'Expense',
  DIRECT_FUNDED_EXPENSE:'Direct lender/vendor payment', ADVANCE:'Pay advance',
  ADVANCE_ADJUSTMENT:'Adjust advance to completed work', REFUND:'Refund / return',
  LOAN_REPAYMENT:'Loan repayment', ADJUSTMENT:'Balance adjustment'
};

export const num = (value: FormDataEntryValue | null) => {
  const n = Number(String(value || '').replace(/,/g,''));
  return Number.isFinite(n) ? n : 0;
};

export const fmtDate = (value:string) => {
  try { return new Date(value).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); }
  catch { return value; }
};

export async function loadData(): Promise<Data> {
  const [projects,accounts,fundingSources,milestones,parties,materials,transactions,attachments] = await Promise.all([
    db.projects.toArray(),db.accounts.toArray(),db.fundingSources.toArray(),db.milestones.toArray(),
    db.parties.toArray(),db.materials.toArray(),db.transactions.toArray(),db.attachments.toArray()
  ]);
  return {
    project:projects.find(x=>!x.deletedAt),
    accounts:accounts.filter(x=>!x.deletedAt),
    fundingSources:fundingSources.filter(x=>!x.deletedAt),
    milestones:milestones.filter(x=>!x.deletedAt).sort((a,b)=>a.sequence-b.sequence),
    parties:parties.filter(x=>!x.deletedAt),
    materials:materials.filter(x=>!x.deletedAt),
    transactions:transactions.filter(x=>!x.deletedAt).sort((a,b)=>b.date.localeCompare(a.date)),
    attachments:attachments.filter(x=>!x.deletedAt)
  };
}
