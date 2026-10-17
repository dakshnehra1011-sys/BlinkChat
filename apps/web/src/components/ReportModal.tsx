import { CheckCircle2, ShieldAlert, X } from 'lucide-react';
import type { FC, FormEvent } from 'react';
import { useState } from 'react';
import { getApiUrl } from '../lib/api';

interface ReportModalProps {
  isOpen: boolean;
  reportedUserId: string | null;
  token: string | null;
  onClose: () => void;
  onReported: () => void;
}

export const ReportModal: FC<ReportModalProps> = ({
  isOpen,
  reportedUserId,
  token,
  onClose,
  onReported,
}) => {
  const [reason, setReason] = useState('nudity_or_sexual_content');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !reportedUserId) return;

    setLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/reports'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          reportedUserId,
          reason,
          notes,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
        setTimeout(() => {
          onReported();
          onClose();
        }, 1500);
      }
    } catch (err) {
      console.error('Failed to submit report:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
          }}
        >
          <h2
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--accent-danger)',
            }}
          >
            <ShieldAlert size={20} />
            Report User
          </h2>
          <button className="btn btn-secondary btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {submitted ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <CheckCircle2
              size={48}
              color="var(--accent-success)"
              style={{ margin: '0 auto 1rem' }}
            />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              User Reported & Blocked
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Thank you for helping keep BlinkChat safe. You will never be matched with this user
              again.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Violation Category</label>
              <select
                className="form-select"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="nudity_or_sexual_content">Nudity or Sexual Content</option>
                <option value="harassment_or_hate_speech">Harassment or Hate Speech</option>
                <option value="violence_or_threats">Violence or Threats</option>
                <option value="spam_or_bot">Spam or Automated Bot</option>
                <option value="underage_user">Underage User</option>
                <option value="other">Other Violation</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Additional Details (Optional)</label>
              <textarea
                className="form-input"
                style={{ resize: 'vertical', minHeight: '80px' }}
                placeholder="Briefly describe what happened..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-danger"
                style={{ flex: 1 }}
                disabled={loading}
              >
                {loading ? 'Submitting...' : 'Report & Block'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
