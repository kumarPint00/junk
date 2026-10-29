import type { Account, LedgerSummary, Transaction } from './types';
export function computeLedger(accounts:Account[], txs:Transaction[]):LedgerSummary {
  const balances:Record<string,number>={};
  for(const a of accounts) balances[a.id]=Number(a.openingBalance||0);
  let projectCost=0, fundingReceived=0, advancesOutstanding=0;
  for(const t of txs){
    const n=Number(t.amount||0);
    switch(t.type){
      case 'FUNDING_IN': if(t.destinationAccountId) balances[t.destinationAccountId]=(balances[t.destinationAccountId]||0)+n; fundingReceived+=n; break;
      case 'TRANSFER': if(t.sourceAccountId) balances[t.sourceAccountId]=(balances[t.sourceAccountId]||0)-n; if(t.destinationAccountId) balances[t.destinationAccountId]=(balances[t.destinationAccountId]||0)+n; break;
      case 'EXPENSE': if(t.sourceAccountId) balances[t.sourceAccountId]=(balances[t.sourceAccountId]||0)-n; projectCost+=n; break;
      case 'DIRECT_FUNDED_EXPENSE': fundingReceived+=n; projectCost+=n; break;
      case 'ADVANCE': if(t.sourceAccountId) balances[t.sourceAccountId]=(balances[t.sourceAccountId]||0)-n; advancesOutstanding+=n; break;
      case 'ADVANCE_ADJUSTMENT': advancesOutstanding-=n; projectCost+=n; break;
      case 'REFUND': if(t.destinationAccountId) balances[t.destinationAccountId]=(balances[t.destinationAccountId]||0)+n; projectCost-=n; break;
    }
  }
  return {projectCost,fundingReceived,advancesOutstanding,accountBalances:balances,txCount:txs.length};
}
export function validateTx(t:Partial<Transaction>){
  const amount=Number(t.amount||0); if(!Number.isFinite(amount)||amount<=0) throw new Error('Amount must be greater than zero.');
  if(t.type==='TRANSFER'&&(!t.sourceAccountId||!t.destinationAccountId||t.sourceAccountId===t.destinationAccountId)) throw new Error('Transfer requires two different accounts.');
  if((t.type==='EXPENSE'||t.type==='ADVANCE')&&!t.sourceAccountId) throw new Error('Payment account is required.');
  if((t.type==='FUNDING_IN'||t.type==='REFUND')&&!t.destinationAccountId) throw new Error('Destination account is required.');
}
