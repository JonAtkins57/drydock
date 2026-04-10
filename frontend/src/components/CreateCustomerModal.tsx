import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateCustomerModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api('/customers', {
        method: 'POST',
        body: { name, currency, status: 'active' },
      });
      setName('');
      setCurrency('USD');
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create customer');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-drydock-card border border-drydock-border rounded-lg p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-lg font-medium text-drydock-text mb-4">New Customer</h2>

        {error && (
          <div className="mb-4 p-3 rounded bg-red-900/30 border border-red-700/50 text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                text-drydock-text placeholder-drydock-steel
                focus:outline-none focus:border-drydock-accent focus:ring-1 focus:ring-drydock-accent/30"
              placeholder="Customer name"
            />
          </div>

          <div>
            <label className="block text-sm text-drydock-text-dim mb-1">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2 bg-drydock-bg border border-drydock-border rounded-md
                text-drydock-text focus:outline-none focus:border-drydock-accent"
            >
              <option value="USD">USD</option>
              <option value="CAD">CAD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="MXN">MXN</option>
            </select>
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
              disabled={loading || !name.trim()}
              className="flex-1 py-2 px-4 text-sm bg-drydock-accent hover:bg-drydock-accent-dim
                text-drydock-dark font-medium rounded-md
                disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : 'Create Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
