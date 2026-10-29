import { neon } from '@neondatabase/serverless';
import { defaultState } from './defaults';
import type { ProjectState, Transaction } from './types';

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return neon(url);
}

let schemaReady: Promise<void> | null = null;

async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const sql = db();
    await sql`
      create table if not exists ptg_state (
        id text primary key,
        payload jsonb not null,
        updated_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists ptg_transactions (
        id text primary key,
        transaction_date timestamptz not null,
        created_at timestamptz not null,
        type text not null,
        amount numeric(14,2) not null check (amount > 0),
        reversal_of text null,
        payload jsonb not null,
        inserted_at timestamptz not null default now()
      )
    `;
    await sql`
      create index if not exists ptg_transactions_date_idx
      on ptg_transactions(transaction_date, created_at)
    `;
    await sql`
      create index if not exists ptg_transactions_reversal_idx
      on ptg_transactions(reversal_of)
    `;
    await sql`
      create table if not exists ptg_audit (
        id bigserial primary key,
        at timestamptz not null default now(),
        action text not null,
        transaction_id text,
        payload jsonb not null default '{}'::jsonb
      )
    `;
  })().catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

export async function getState(): Promise<ProjectState> {
  await ensureSchema();
  const sql = db();
  const rows = await sql`select payload from ptg_state where id = 'singleton' limit 1`;
  return (rows[0]?.payload as ProjectState | undefined) ?? defaultState();
}

export async function saveState(state: ProjectState) {
  await ensureSchema();
  const next = { ...state, updatedAt: new Date().toISOString() };
  const sql = db();
  await sql`
    insert into ptg_state (id, payload, updated_at)
    values ('singleton', ${JSON.stringify(next)}::jsonb, now())
    on conflict (id) do update
    set payload = excluded.payload, updated_at = now()
  `;
  return next;
}

export async function listTransactions(): Promise<Transaction[]> {
  await ensureSchema();
  const sql = db();
  const rows = await sql`
    select payload
    from ptg_transactions
    order by transaction_date asc, created_at asc
  `;
  return rows.map((row) => row.payload as Transaction);
}

export async function getTransaction(id: string): Promise<Transaction | null> {
  await ensureSchema();
  const sql = db();
  const rows = await sql`
    select payload from ptg_transactions where id = ${id} limit 1
  `;
  return (rows[0]?.payload as Transaction | undefined) ?? null;
}

export async function putTransaction(transaction: Transaction) {
  await ensureSchema();
  const sql = db();
  const audit = JSON.stringify({
    type: transaction.type,
    amount: transaction.amount,
    reversalOf: transaction.reversalOf ?? null,
  });
  await sql`
    with inserted as (
      insert into ptg_transactions (
        id, transaction_date, created_at, type, amount, reversal_of, payload
      )
      values (
        ${transaction.id},
        ${transaction.transactionDate}::timestamptz,
        ${transaction.createdAt}::timestamptz,
        ${transaction.type},
        ${transaction.amount},
        ${transaction.reversalOf ?? null},
        ${JSON.stringify(transaction)}::jsonb
      )
      on conflict (id) do nothing
      returning id
    )
    insert into ptg_audit (action, transaction_id, payload)
    select 'CREATE_TRANSACTION', id, ${audit}::jsonb from inserted
  `;
  return transaction;
}

export async function replaceAll(state: ProjectState, transactions: Transaction[]) {
  await ensureSchema();
  const sql = db();
  const next = { ...state, updatedAt: new Date().toISOString() };
  const txJson = JSON.stringify(transactions);
  await sql`
    with state_upsert as (
      insert into ptg_state (id, payload, updated_at)
      values ('singleton', ${JSON.stringify(next)}::jsonb, now())
      on conflict (id) do update
      set payload = excluded.payload, updated_at = now()
      returning id
    ),
    deleted as (
      delete from ptg_transactions returning id
    )
    insert into ptg_transactions (
      id, transaction_date, created_at, type, amount, reversal_of, payload
    )
    select
      item->>'id',
      (item->>'transactionDate')::timestamptz,
      (item->>'createdAt')::timestamptz,
      item->>'type',
      (item->>'amount')::numeric,
      nullif(item->>'reversalOf',''),
      item
    from jsonb_array_elements(${txJson}::jsonb) item
  `;
  await sql`
    insert into ptg_audit (action, payload)
    values ('RESTORE_BACKUP', ${JSON.stringify({ transactionCount: transactions.length })}::jsonb)
  `;
}
