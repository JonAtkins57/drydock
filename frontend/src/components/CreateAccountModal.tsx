import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateAccountModal({ open, onClose, onCreated }: Props) {
  const [accountNumber, setAccountNumber] = useState('');
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState('asset');
  const [normalBalance, setNormalBalance] = useState('debit');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api('/accounts', {
        method: 'POST',
        body: { accountNumber, name, accountType, normalBalance, description },
      });
      setAccountNumber('');
      setName('');
      setAccountType('asset');
      setNormalBalance('debit');
      setDescription('');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-lg shadow-2xl">
        <h2 className="text-lg font-medium text-drydock-text mb-4">New GL Account</h2>

        {error && (
          <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-drydock-text-dim mb-1">Account Number</label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                required
                autoFocus
                className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                  text-drydock-text placeholder-drydock-steel
                  focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                placeholder="e.g. 1000"
              />
            </div>
            <div>
              <label className="block text-sm text-drydock-text-dim mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                  text-drydock-text placeholder-drydock-steel
                  focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
                placeholder="Account name"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-drydock-text-dim mb-1">Account Type</label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                  text-drydock-text focus:outline-none focus:border-drydock-accent"
              >
                <option value="asset">Asset</option>
                <option value="liability">Liability</option>
                <option value="equity">Equity</option>
                <option value="revenue">Revenue</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-drydock-text-dim mb-1">Normal Balance</label>
              <select
                value={normalBalance}
                onChange={(e) => setNormalBalance(e.target.value)}
                className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                  text-drydock-text focus:outline-none focus:border-drydock-accent"
              >
                <option value="debit">Debit</option>
                <option value="credit">Credit</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                text-drydock-text placeholder-drydock-steel
                focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
              placeholder="Optional description"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 text-sm text-drydock-steel border border-drydock-border rounded-md
                hover:text-drydock-text hover:border-drydock-steel transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !accountNumber.trim() || !name.trim()}
              className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                text-drydock-dark font-medium rounded-md
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
