'use client';

export const money = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(n || 0));

export function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card">
      <small>{label}</small>
      <strong>{value}</strong>
      {hint ? <span className="muted">{hint}</span> : null}
    </div>
  );
}

export function PageTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="pageTitle">
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
