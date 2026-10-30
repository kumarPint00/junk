'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProjectState, Transaction } from '@/lib/types';
import { computeLedger } from '@/lib/ledger';
import { Home } from '@/components/views/Home';
import { Journey } from '@/components/views/Journey';
import { AddTransaction } from '@/components/views/AddTransaction';
import { Ledger } from '@/components/views/Ledger';
import { More } from '@/components/views/More';

type Tab = 'home' | 'journey' | 'add' | 'ledger' | 'more';

const TX_QUEUE = 'ptg_offline_queue_v2';
const SNAPSHOT = 'ptg_snapshot_v2';
const PENDING_STATE = 'ptg_pending_state_v2';

function readTxQueue(): Transaction[] {
  try { return JSON.parse(localStorage.getItem(TX_QUEUE) || '[]'); } catch { return []; }
}
function writeTxQueue(q: Transaction[]) {
  localStorage.setItem(TX_QUEUE, JSON.stringify(q));
}
function writeSnapshot(state: ProjectState, txs: Transaction[]) {
  localStorage.setItem(SNAPSHOT, JSON.stringify({ state, txs, at: Date.now() }));
}
function readSnapshot(): { state: ProjectState; txs: Transaction[] } | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(SNAPSHOT) || 'null');
    return parsed?.state && Array.isArray(parsed?.txs) ? parsed : null;
  } catch {
    return null;
  }
}

export function AppShell() {
  const [auth, setAuth] = useState<'loading' | 'yes' | 'no'>('loading');
  const [pin, setPin] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [state, setState] = useState<ProjectState | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [tab, setTab] = useState<Tab>('home');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [online, setOnline] = useState(true);
  const [backendError, setBackendError] = useState('');

  const load = useCallback(async () => {
    try {
      const [stateResponse, txResponse] = await Promise.all([
        fetch('/api/state', { cache: 'no-store' }),
        fetch('/api/transactions', { cache: 'no-store' }),
      ]);

      if (stateResponse.status === 401 || txResponse.status === 401) {
        setBackendError('');
        setAuth('no');
        return;
      }
      if (!stateResponse.ok || !txResponse.ok) {
        const response = stateResponse.ok ? txResponse : stateResponse;
        const detail = await response.json().catch(() => ({ error: 'Backend unavailable' }));
        throw new Error(detail.error || 'Backend unavailable');
      }

      const sj = await stateResponse.json();
      const tj = await txResponse.json();
      setState(sj.state);
      setTxs(tj.transactions);
      writeSnapshot(sj.state, tj.transactions);
      setBackendError('');
      setAuth('yes');
    } catch (e) {
      const cached = readSnapshot();
      if (cached) {
        setState(cached.state);
        setTxs(cached.txs);
        setAuth('yes');
        setBackendError('Offline snapshot loaded. Changes will sync when the connection returns.');
      } else {
        setBackendError(e instanceof Error ? e.message : 'Backend unavailable');
        setAuth('yes');
      }
    }
  }, []);

  const flush = useCallback(async () => {
    if (!navigator.onLine) return;

    const pendingState = localStorage.getItem(PENDING_STATE);
    if (pendingState) {
      try {
        const response = await fetch('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: pendingState,
        });
        if (response.ok) localStorage.removeItem(PENDING_STATE);
      } catch {
        return;
      }
    }

    const q = readTxQueue();
    if (!q.length) {
      await load();
      return;
    }

    const keep: Transaction[] = [];
    for (const t of q) {
      try {
        const response = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...t, allowDuplicate: true }),
        });
        if (!response.ok && response.status !== 409) keep.push(t);
      } catch {
        keep.push(t);
      }
    }
    writeTxQueue(keep);
    await load();
  }, [load]);

  useEffect(() => {
    load();
    setOnline(navigator.onLine);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const on = () => { setOnline(true); flush(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [load, flush]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const summary = useMemo(() => (state ? computeLedger(state.accounts, txs) : null), [state, txs]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginErr('');
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (response.ok) {
      setPin('');
      await load();
    } else {
      setLoginErr((await response.json().catch(() => ({}))).error || 'Login failed');
    }
  }

  async function saveState(next: ProjectState) {
    setBusy(true);
    setState(next);
    writeSnapshot(next, txs);
    try {
      const response = await fetch('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Save failed');
      const body = await response.json();
      setState(body.state);
      writeSnapshot(body.state, txs);
      localStorage.removeItem(PENDING_STATE);
      setToast('Project saved');
    } catch (e) {
      localStorage.setItem(PENDING_STATE, JSON.stringify(next));
      setToast(navigator.onLine ? 'Saved locally; cloud sync will retry' : 'Saved offline; cloud sync will retry');
    } finally {
      setBusy(false);
    }
  }

  async function postTx(t: Transaction) {
    setBusy(true);
    try {
      let response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(t),
      });

      if (response.status === 409) {
        const detail = await response.json().catch(() => ({}));
        const proceed = window.confirm(
          `${detail.error || 'Possible duplicate transaction.'}\n\nSave it anyway?`
        );
        if (!proceed) return;
        response = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...t, allowDuplicate: true }),
        });
      }

      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Save failed');
      const body = await response.json();
      const next = [...txs.filter((x) => x.id !== body.transaction.id), body.transaction]
        .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
      setTxs(next);
      if (state) writeSnapshot(state, next);
      setToast('Transaction saved');
      setTab('ledger');
    } catch (e) {
      if (!navigator.onLine || e instanceof TypeError) {
        const q = readTxQueue();
        if (!q.some((x) => x.id === t.id)) q.push(t);
        writeTxQueue(q);
        const next = [...txs.filter((x) => x.id !== t.id), t];
        setTxs(next);
        if (state) writeSnapshot(state, next);
        setToast('Saved offline; will sync automatically');
        setTab('ledger');
      } else {
        setToast(e instanceof Error ? e.message : 'Save failed');
      }
    } finally {
      setBusy(false);
    }
  }

  async function voidTx(id: string) {
    if (!navigator.onLine) {
      setToast('Voiding requires an online connection.');
      return;
    }
    if (!window.confirm('Create a correcting reversal for this transaction? The original record will remain in the audit trail.')) return;
    setBusy(true);
    try {
      const response = await fetch('/api/transactions/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Void failed');
      await load();
      setToast('Correcting reversal created');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Void failed');
    } finally {
      setBusy(false);
    }
  }

  if (auth === 'loading') {
    return <div className="center"><div className="spinner" /><p>Opening Plot to Ghar…</p></div>;
  }

  if (auth === 'no') {
    return (
      <main className="login">
        <section className="loginCard">
          <div className="brandMark">🏠</div>
          <h1>Plot to Ghar</h1>
          <p>Private property & construction ledger</p>
          <form onSubmit={login}>
            <label>
              Access PIN
              <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
            </label>
            {loginErr ? <div className="error">{loginErr}</div> : null}
            <button className="primary">Unlock</button>
          </form>
        </section>
      </main>
    );
  }

  if (backendError && !state) {
    return (
      <main className="login">
        <section className="loginCard">
          <div className="brandMark">⚙️</div>
          <h1>Backend unavailable</h1>
          <p>{backendError}</p>
          <button className="primary" onClick={load}>Retry connection</button>
          <button className="secondary" onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.reload(); }}>Lock app</button>
        </section>
      </main>
    );
  }

  if (!state || !summary) return null;

  return (
    <div className="app">
      <header>
        <div>
          <strong>{state.project.name}</strong>
          <small>{state.project.status.replaceAll('_', ' ')}</small>
        </div>
        <span className={online ? 'online' : 'offline'}>{online ? '● Online' : '● Offline'}</span>
      </header>

      {backendError ? <div className="syncBanner">{backendError}</div> : null}

      <main className="content">
        {tab === 'home' ? <Home state={state} txs={txs} /> : null}
        {tab === 'journey' ? <Journey state={state} save={saveState} /> : null}
        {tab === 'add' ? <AddTransaction state={state} txs={txs} onSave={postTx} /> : null}
        {tab === 'ledger' ? <Ledger state={state} txs={txs} onVoid={voidTx} /> : null}
        {tab === 'more' ? <More state={state} txs={txs} save={saveState} reload={load} /> : null}
      </main>

      <nav>
        {(['home', 'journey', 'add', 'ledger', 'more'] as Tab[]).map((x) => (
          <button key={x} onClick={() => setTab(x)} className={tab === x ? 'active' : ''}>
            <span>{x === 'home' ? '⌂' : x === 'journey' ? '◉' : x === 'add' ? '+' : x === 'ledger' ? '☷' : '•••'}</span>
            {x === 'add' ? 'Add' : x[0].toUpperCase() + x.slice(1)}
          </button>
        ))}
      </nav>

      {busy ? <div className="busy">Working…</div> : null}
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
