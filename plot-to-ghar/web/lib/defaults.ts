import type { ProjectState } from './types';
const milestones = [
  'Plot Locked','Registry Preparation','Registry Completed','Possession Received','Mutation / Post Registry','Construction Planning','Foundation & Plinth','Ground Floor Structure','First Floor Structure','MEP','Finishing','Completed'
];
export function defaultState(): ProjectState {
  return {
    version:1,
    project:{name:'C-19 Plot to Home',status:'REGISTRY_PENDING',propertyAddress:'',plotAreaSqYard:120,agreedPurchasePrice:0,ownerName:'',sellerName:'',notes:''},
    accounts:[
      {id:'bank-main',name:'Main Bank Account',type:'BANK',openingBalance:0,active:true},
      {id:'cash-main',name:'Construction Cash',type:'CASH',openingBalance:0,active:true}
    ],
    fundingSources:[
      {id:'loan-purchase',name:'Purchase Loan',type:'PURCHASE_LOAN',committedAmount:2500000},
      {id:'loan-construction',name:'Construction Loan',type:'CONSTRUCTION_LOAN',committedAmount:2100000},
      {id:'own-funds',name:'Own Funds',type:'OWN_FUNDS',committedAmount:0},
      {id:'family',name:'Family Contribution',type:'FAMILY',committedAmount:0}
    ],
    milestones:milestones.map((name,i)=>({id:`m-${i+1}`,name,sequence:i+1,status:i===0?'COMPLETED':i===1?'IN_PROGRESS':'PENDING'} as const)),
    vendors:[], contractors:[], updatedAt:new Date().toISOString()
  };
}
