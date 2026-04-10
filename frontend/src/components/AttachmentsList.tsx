import { useEffect, useRef, useState } from 'react';
import { endpoints, type AttachmentRow } from '../lib/api';

interface Props {
  entityType: string;
  entityId: string;
}

const fmtBytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export default function AttachmentsList({ entityType, entityId }: Props) {
  const [rows, setRows] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await endpoints.listAttachments(entityType, entityId);
      setRows(data);
    } catch { /* */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, [entityType, entityId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await endpoints.uploadAttachment(entityType, entityId, file);
      await load();
    } catch { /* */ }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDelete = async (id: string) => {
    try {
      await endpoints.deleteAttachment(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch { /* */ }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-drydock-text-dim">{rows.length} attachment{rows.length !== 1 ? 's' : ''}</span>
        <label className="cursor-pointer text-xs px-3 py-1.5 bg-drydock-accent/20 text-drydock-accent border border-drydock-accent/30 rounded hover:bg-drydock-accent/30 transition-colors">
          {uploading ? 'Uploading...' : '+ Upload'}
          <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {loading ? (
        <div className="text-sm text-drydock-steel">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-drydock-steel">No attachments yet.</div>
      ) : (
        <ul className="divide-y divide-drydock-border">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between py-2 gap-3">
              <div className="min-w-0 flex-1">
                <a
                  href={row.presigned_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-drydock-accent hover:underline truncate block"
                >
                  {row.filename}
                </a>
                <span className="text-xs text-drydock-steel">{fmtBytes(row.sizeBytes)}</span>
              </div>
              <button
                onClick={() => handleDelete(row.id)}
                className="text-xs text-red-400 hover:text-red-300 transition-colors shrink-0"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
