'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AttachmentRef, ProjectState, Transaction, TxType } from '@/lib/types';
import { defaultState, normalizeState, validateProjectState, validateStateTransition } from '@/lib/defaults';
import { computeLedger, findPotentialDuplicate, validateTx } from '@/lib/ledger';
import {
  getLocalState,
  listLocalTransactions,
  migrateLegacySnapshot,
  putLocalState,
  putLocalTransaction,
  replaceLocalData,
} from '@/lib/local-db';
import { hasLocalPin, saveLocalPin, verifyLocalPin } from '@/lib/local-auth';
import { Home } from '@/components/views/Home';
import { Journey } from '@/components/views/Journey';
import { AddTransaction } from '@/components/views/AddTransaction';
import { Ledger } from '@/components/views/Ledger';
import { More } from '@/components/views/More';
import { ConstructionHub } from '@/components/views/ConstructionHub';
import { dueReminders } from '@/lib/construction-calcs';

type Tab = 'home' | 'journey' | 'build' | 'add' | 'ledger' | 'more';
type RuntimeMode = 'checking' | 'cloud' | 'standalone';
type AuthState = 'loading' | 'yes' | 'no' | 'setup';

const TX_QUEUE = 'ptg_offline_queue_v2';
const PENDING_STATE = 'ptg_pending_state_v2';

function readTxQueue(): Transaction[] {
  try { return JSON.parse(localStorage.getItem(TX_QUEUE) || '[]'); } catch { return []; }
}

function writeTxQueue(q: Transaction[]) {
  localStorage.setItem(TX_QUEUE, JSON.stringify(q));
}

function sortTransactions(txs: Transaction[]) {
  return [...txs].sort(
    (a, b) =>
      a.transactionDate.localeCompare(b.transactionDate) ||
      a.createdAt.localeCompare(b.createdAt)
  );
}


export function AppShell() {
  const [mode, setMode] = useState<RuntimeMode>('checking');
  const [auth, setAuth] = useState<AuthState>('loading');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [state, setState] = useState<ProjectState | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [tab, setTab] = useState<Tab>('home');
  const [scanDraft, setScanDraft] = useState<{ amount: string; date: string; payee: string; description: string; attachment?: AttachmentRef } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [online, setOnline] = useState(true);
  const [backendError, setBackendError] = useState('');

  const loadStandalone = useCallback(async (checkLock = false) => {
    await migrateLegacySnapshot();
    let localState = await getLocalState();
    if (!localState) {
      localState = defaultState();
      await putLocalState(localState);
    }
    const localTransactions = await listLocalTransactions();
    setState(normalizeState(localState));
    setTxs(sortTransactions(localTransactions));
    setBackendError('');
    if (checkLock) setAuth(hasLocalPin() ? 'no' : 'setup');
  }, []);

  const loadCloud = useCallback(async () => {
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
        const detail = await response.json().catch(() => ({ error: 'Cloud backend unavailable' }));
        throw new Error(detail.error || 'Cloud backend unavailable');
      }

      const sj = await stateResponse.json();
      const tj = await txResponse.json();
      const nextState = normalizeState(sj.state);
      const nextTxs = sortTransactions(tj.transactions || []);
      setState(nextState);
      setTxs(nextTxs);
      await replaceLocalData(nextState, nextTxs);
      setBackendError('');
      setAuth('yes');
    } catch (e) {
      const localState = await getLocalState();
      const localTransactions = await listLocalTransactions();
      if (localState) {
        setState(normalizeState(localState));
        setTxs(sortTransactions(localTransactions));
        setAuth('yes');
        setBackendError('Cloud is temporarily unavailable. Using the on-device copy; pending changes will retry.');
      } else {
        setBackendError(e instanceof Error ? e.message : 'Cloud backend unavailable');
      }
    }
  }, []);

  const bootstrap = useCallback(async () => {
    setAuth('loading');
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    await migrateLegacySnapshot();

    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const health = response.ok ? await response.json() : null;
      if (health?.cloudReady) {
        setMode('cloud');
        await loadCloud();
        return;
      }
    } catch {
      // No server connection is required for standalone mode.
    }

    setMode('standalone');
    await loadStandalone(true);
  }, [loadCloud, loadStandalone]);

  const reload = useCallback(async () => {
    if (mode === 'cloud') await loadCloud();
    else await loadStandalone(false);
  }, [mode, loadCloud, loadStandalone]);

  const flush = useCallback(async () => {
    if (mode !== 'cloud' || !navigator.onLine) return;

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
      await loadCloud();
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
    await loadCloud();
  }, [mode, loadCloud]);

  useEffect(() => {
    bootstrap();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const on = () => {
      setOnline(true);
      if (mode === 'cloud') flush();
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [bootstrap, flush, mode]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const summary = useMemo(() => (state ? computeLedger(state.accounts, txs, state.financialAllocations) : null), [state, txs]);

  // Foreground browser reminder notifications. No background push claim: browsers may
  // suspend this page when closed. Android native notifications need a separate bridge.
  useEffect(() => {
    if (auth !== 'yes' || !state) return;
    const tick = () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const today = new Date().toLocaleDateString('en-CA');
      for (const reminder of dueReminders(state.construction.reminders, new Date())) {
        if (reminder.completed) continue;
        const key = 'ptg-notified:' + reminder.id + ':' + today;
        if (localStorage.getItem(key)) continue;
        try {
          new Notification('Plot to Ghar · ' + reminder.category, { body: reminder.title, icon: '/icon.svg', tag: reminder.id });
          localStorage.setItem(key, '1');
        } catch { /* Unsupported notification surface; in-app list remains available. */ }
      }
    };
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [auth, state]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoginErr('');

    if (mode === 'standalone') {
      const ok = await verifyLocalPin(pin);
      if (!ok) {
        setLoginErr('Invalid PIN');
        return;
      }
      setPin('');
      setAuth('yes');
      return;
    }

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (response.ok) {
      setPin('');
      await loadCloud();
    } else {
      setLoginErr((await response.json().catch(() => ({}))).error || 'Login failed');
    }
  }

  async function setupPin(e: React.FormEvent) {
    e.preventDefault();
    setLoginErr('');
    if (!/^\d{4,12}$/.test(pin)) {
      setLoginErr('Choose a 4–12 digit PIN.');
      return;
    }
    if (pin !== pinConfirm) {
      setLoginErr('PINs do not match.');
      return;
    }
    await saveLocalPin(pin);
    setPin('');
    setPinConfirm('');
    setAuth('yes');
    setToast('Local PIN created');
  }

  async function saveState(next: ProjectState) {
    setBusy(true);
    try {
      const normalized = validateProjectState(
        normalizeState({
          ...next,
          revision: Number(next.revision || 1) + 1,
          updatedAt: new Date().toISOString(),
        })
      );

      if (state) validateStateTransition(state, normalized, txs);
      await putLocalState(normalized);
      setState(normalized);

      if (mode === 'standalone') {
        setToast('Project saved on this device');
        return;
      }

      try {
        const response = await fetch('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalized),
        });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Save failed');
        const body = await response.json();
        const cloudState = normalizeState(body.state);
        setState(cloudState);
        await putLocalState(cloudState);
        localStorage.removeItem(PENDING_STATE);
        setToast('Project saved');
      } catch {
        localStorage.setItem(PENDING_STATE, JSON.stringify(normalized));
        setToast('Saved on device; cloud sync will retry');
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function postTx(t: Transaction) {
    setBusy(true);
    try {
      if (!state) throw new Error('Project is not loaded.');
      validateTx(t, { state, transactions: txs });

      const duplicate = findPotentialDuplicate(t, txs);
      let allowDuplicate = false;
      if (duplicate) {
        allowDuplicate = window.confirm('Possible duplicate transaction found. Save it anyway?');
        if (!allowDuplicate) return;
      }

      if (mode === 'standalone') {
        await putLocalTransaction(t);
        const next = sortTransactions([...txs.filter((x) => x.id !== t.id), t]);
        setTxs(next);
        setToast('Transaction saved on this device');
        setTab('ledger');
        return;
      }

      try {
        let response = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...t, allowDuplicate }),
        });

        if (response.status === 409 && !allowDuplicate) {
          const proceed = window.confirm('Possible duplicate transaction found on the cloud ledger. Save it anyway?');
          if (!proceed) return;
          response = await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...t, allowDuplicate: true }),
          });
        }

        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Save failed');
        const body = await response.json();
        await putLocalTransaction(body.transaction);
        const next = sortTransactions([...txs.filter((x) => x.id !== body.transaction.id), body.transaction]);
        setTxs(next);
        setToast('Transaction saved');
        setTab('ledger');
      } catch (e) {
        if (!navigator.onLine || e instanceof TypeError) {
          const q = readTxQueue();
          if (!q.some((x) => x.id === t.id)) q.push(t);
          writeTxQueue(q);
          await putLocalTransaction(t);
          const next = sortTransactions([...txs.filter((x) => x.id !== t.id), t]);
          setTxs(next);
          setToast('Saved on device; cloud sync will retry');
          setTab('ledger');
        } else {
          throw e;
        }
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function voidTx(id: string) {
    if (!state) return;
    if (!window.confirm('Create a correcting reversal? The original record remains in the audit trail.')) return;
    setBusy(true);

    try {
      if (mode === 'standalone') {
        const original = txs.find((x) => x.id === id);
        if (!original) throw new Error('Transaction not found.');
        if (original.type === 'REVERSAL' || original.reversalOf) throw new Error('Cannot reverse a correction entry.');
        const reversal: Transaction = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          transactionDate: new Date().toISOString(),
          type: 'REVERSAL',
          amount: original.amount,
          reversalOf: original.id,
          description: 'Reversal of ' + original.id + '. Original retained for audit.',
        };
        validateTx(reversal, { state, transactions: txs });
        await putLocalTransaction(reversal);
        setTxs(sortTransactions([...txs, reversal]));
        setToast('Correction recorded. Original remains in ledger.');
        return;
      }

      if (!navigator.onLine) {
        setToast('Cloud-mode reversals require an online connection.');
        return;
      }

      const response = await fetch('/api/transactions/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Void failed');
      await loadCloud();
      setToast('Correcting reversal created');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Void failed');
    } finally {
      setBusy(false);
    }
  }

  async function lockApp() {
    if (mode === 'cloud') {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    }
    setPin('');
    setAuth('no');
  }

  if (auth === 'loading' || mode === 'checking') {
    return <div className="center"><div className="spinner" /><p>Opening Plot to Ghar…</p></div>;
  }

  if (auth === 'setup') {
    return (
      <main className="login">
        <section className="loginCard">
          <div className="brandMark">🏠</div>
          <h1>Set up Plot to Ghar</h1>
          <p>Your data will be stored on this device. Create a PIN to protect access.</p>
          <form onSubmit={setupPin}>
            <label>
              Create PIN
              <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
            </label>
            <label>
              Confirm PIN
              <input type="password" inputMode="numeric" value={pinConfirm} onChange={(e) => setPinConfirm(e.target.value)} />
            </label>
            {loginErr ? <div className="error">{loginErr}</div> : null}
            <button className="primary">Create PIN & open app</button>
          </form>
        </section>
      </main>
    );
  }

  if (auth === 'no') {
    return (
      <main className="login">
        <section className="loginCard">
          <div className="brandMark">🏠</div>
          <h1>Plot to Ghar</h1>
          <p>{mode === 'standalone' ? 'On-device property & construction ledger' : 'Private property & construction ledger'}</p>
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

  if (!state || !summary) {
    return (
      <main className="login">
        <section className="loginCard">
          <h1>Unable to open project</h1>
          <p>{backendError || 'Project data is unavailable.'}</p>
          <button className="primary" onClick={bootstrap}>Retry</button>
        </section>
      </main>
    );
  }

  return (
    <div className="app">
      <header>
        <div>
          <strong>{state.project.name}</strong>
          <small>{state.project.status.replaceAll('_', ' ')}</small>
        </div>
        <span className={online ? 'online' : 'offline'}>
          {mode === 'standalone' ? '● On-device' : online ? '● Cloud' : '● Offline'}
        </span>
      </header>

      {backendError ? <div className="syncBanner">{backendError}</div> : null}
      {mode === 'standalone' ? (
        <div className="syncBanner">Zero-cost standalone mode · data and evidence are stored on this device · use Backup regularly.</div>
      ) : null}

      <main className="content">
        {tab === 'home' ? <Home state={state} txs={txs} save={saveState} navigate={setTab} /> : null}
        {tab === 'journey' ? <Journey state={state} save={saveState} /> : null}
        {tab === 'build' ? <ConstructionHub state={state} txs={txs} save={saveState} mode={mode} onScanned={(draft) => { setScanDraft(draft); setTab('add'); }} /> : null}
        {tab === 'add' ? <AddTransaction key={scanDraft ? 'scan-' + scanDraft.date + '-' + scanDraft.amount + '-' + (scanDraft.attachment?.pathname || '') : 'manual'} prefill={scanDraft || undefined} state={state} txs={txs} onSave={async (t) => { await postTx(t); setScanDraft(null); }} mode={mode} /> : null}
        {tab === 'ledger' ? <Ledger state={state} txs={txs} onVoid={voidTx} mode={mode} /> : null}
        {tab === 'more' ? <More state={state} txs={txs} save={saveState} reload={reload} mode={mode} onLock={lockApp} onNavigate={setTab} /> : null}
      </main>

      <nav>
        {(['home', 'journey', 'build', 'add', 'ledger', 'more'] as Tab[]).map((x) => (
          <button key={x} onClick={() => setTab(x)} className={tab === x ? 'active' : ''}>
            <span>{x === 'home' ? '⌂' : x === 'journey' ? '◉' : x === 'build' ? '▦' : x === 'add' ? '+' : x === 'ledger' ? '☷' : '•••'}</span>
            {x === 'add' ? 'Add' : x[0].toUpperCase() + x.slice(1)}
          </button>
        ))}
      </nav>

      {busy ? <div className="busy">Working…</div> : null}
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
