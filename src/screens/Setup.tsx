import { useState } from 'react';
import { createInitialProject } from '../db';
import { num } from '../appData';

export default function Setup({onCreated}:{onCreated:()=>void}) {
  const [saving,setSaving]=useState(false);
  const submit=async(e:React.FormEvent<HTMLFormElement>)=>{
    e.preventDefault();setSaving(true);
    const f=new FormData(e.currentTarget);
    await createInitialProject({
      name:String(f.get('name')||'Plot to Ghar'),plotAddress:String(f.get('address')||''),
      plotAreaSqYard:num(f.get('area'))||undefined,agreedPurchasePrice:num(f.get('price'))||undefined,
      ownerName:String(f.get('owner')||''),sellerName:String(f.get('seller')||''),
      totalBudget:num(f.get('budget'))||undefined
    });
    onCreated();
  };
  return <div className="setupPage">
    <section className="setupHero"><div className="logoMark">🏠</div><div className="eyebrow">DAY 0 → COMPLETION</div>
      <h1>Plot to Ghar</h1><p>One ledger for buying the plot, registry, construction, contractors, materials and every rupee in between.</p>
    </section>
    <form className="card formGrid" onSubmit={submit}><h2>Start your property project</h2>
      <label>Project name<input name="name" defaultValue="C-19 Plot to Home" required/></label>
      <label>Plot address<textarea name="address" rows={2} placeholder="Property / plot address"/></label>
      <div className="twoCol"><label>Plot area (sq yd)<input name="area" type="number" step=".01" min="0" defaultValue="120"/></label>
        <label>Agreed plot price<input name="price" type="number" min="0" placeholder="Enter documented amount"/></label></div>
      <div className="twoCol"><label>Registered owner / buyer<input name="owner" placeholder="Owner name"/></label>
        <label>Seller<input name="seller" placeholder="Seller name"/></label></div>
      <label>Overall project budget (optional)<input name="budget" type="number" min="0"/></label>
      <div className="infoBox">Piramal funding is preconfigured as <b>₹25L purchase</b> + <b>₹21L construction</b>. Edit it anytime.</div>
      <button className="primary" disabled={saving}>{saving?'Creating…':'Create project'}</button>
    </form>
  </div>;
}
