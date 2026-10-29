import type { Data } from './appData';
import type { Transaction } from './types';
import { fmtDate, TX_LABELS } from './appData';
import { formatINR } from './finance';

export function Metric({label,value,note}:{label:string;value:string;note:string}) {
  return <div className="metricCard"><small>{label}</small><b>{value}</b><span>{note}</span></div>;
}
export function Empty({text}:{text:string}) { return <div className="empty">{text}</div>; }
export function TransactionRow({tx,data}:{tx:Transaction;data:Data}) {
  const source=data.accounts.find(a=>a.id===tx.sourceAccountId)?.name;
  const dest=data.accounts.find(a=>a.id===tx.destinationAccountId)?.name;
  const party=data.parties.find(p=>p.id===tx.partyId)?.name;
  const milestone=data.milestones.find(m=>m.id===tx.milestoneId)?.name;
  const positive=['FUNDING_IN','REFUND'].includes(tx.type);
  const neutral=['TRANSFER','ADVANCE_ADJUSTMENT','DIRECT_FUNDED_EXPENSE'].includes(tx.type);
  const prefix=positive?'+':(['EXPENSE','ADVANCE','LOAN_REPAYMENT'].includes(tx.type)?'-':'');
  return <div className="transactionRow">
    <div className={'txIcon '+tx.type.toLowerCase()}>{tx.type==='EXPENSE'?'−':tx.type==='FUNDING_IN'?'+':'↔'}</div>
    <div className="txMain"><b>{tx.description||TX_LABELS[tx.type]}</b>
      <small>{fmtDate(tx.date)} · {tx.category||TX_LABELS[tx.type]}{party?' · '+party:''}</small>
      {(source||dest||milestone)&&<small>{source||''}{source&&dest?' → ':''}{dest||''}{milestone?' · '+milestone:''}</small>}
    </div>
    <strong className={positive?'money positive':neutral?'money neutral':'money negative'}>{prefix}{formatINR(tx.amount)}</strong>
  </div>;
}
export function Bar({label,value,max}:{label:string;value:number;max:number}) {
  const pct=Math.max(2,Math.min(100,Math.abs(value/Math.max(max,1)*100)));
  return <div className="barRow"><div className="barLabels"><span>{label}</span><b>{formatINR(value)}</b></div><div className="barTrack"><div className="barFill" style={{width:pct+'%'}}/></div></div>;
}
