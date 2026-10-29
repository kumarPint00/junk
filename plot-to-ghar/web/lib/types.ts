export type TxType = 'FUNDING_IN'|'TRANSFER'|'EXPENSE'|'ADVANCE'|'ADVANCE_ADJUSTMENT'|'REFUND'|'DIRECT_FUNDED_EXPENSE';
export type Account = { id:string; name:string; type:'BANK'|'CASH'|'OTHER'; openingBalance:number; active:boolean };
export type FundingSource = { id:string; name:string; type:'OWN_FUNDS'|'PURCHASE_LOAN'|'CONSTRUCTION_LOAN'|'FAMILY'|'OTHER'; committedAmount:number };
export type Milestone = { id:string; name:string; status:'PENDING'|'IN_PROGRESS'|'COMPLETED'|'SKIPPED'; sequence:number; completedAt?:string };
export type Entity = { id:string; name:string; phone?:string; notes?:string };
export type ProjectState = {
  version:number;
  project:{name:string; status:string; propertyAddress:string; plotAreaSqYard:number; agreedPurchasePrice:number; ownerName:string; sellerName:string; registryTargetDate?:string; notes?:string};
  accounts:Account[];
  fundingSources:FundingSource[];
  milestones:Milestone[];
  vendors:Entity[];
  contractors:Entity[];
  updatedAt:string;
};
export type LineItem = { description:string; quantity?:number; unit?:string; rate?:number; amount:number };
export type AttachmentRef = { pathname:string; name:string; contentType:string; size:number };
export type Transaction = {
  id:string; createdAt:string; transactionDate:string; type:TxType; amount:number;
  sourceAccountId?:string; destinationAccountId?:string; fundingSourceId?:string;
  milestoneId?:string; category?:string; payee?:string; referenceNumber?:string; description?:string; notes?:string;
  lineItems?:LineItem[]; attachments?:AttachmentRef[]; reversalOf?:string;
};
export type LedgerSummary = { projectCost:number; fundingReceived:number; advancesOutstanding:number; accountBalances:Record<string,number>; txCount:number };
