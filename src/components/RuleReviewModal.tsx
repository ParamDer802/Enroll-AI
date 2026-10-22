import { useState } from 'react';
import type { CaptureRecord } from '../types';
import { Button, Modal, Photo } from './ui';

export function RuleReviewModal({
  record,
  busy,
  onApprove,
  onRetake,
}: {
  record: CaptureRecord;
  busy: boolean;
  onApprove: () => void;
  onRetake: () => void;
}) {
  const rules = record.ruleReview!.rules;
  const checks = [
    ...(rules.requireSheet
      ? [
          'The full sheet is visible below the face',
          'The student holds the sheet with both hands',
          'The sheet does not cover any part of the face',
        ]
      : []),
    ...(rules.instructions ? [`The photo meets these instructions: ${rules.instructions}`] : []),
  ];
  const [confirmed, setConfirmed] = useState<boolean[]>(checks.map(() => false));
  return (
    <Modal title="Review session rules" onClose={() => !busy && onRetake()} wide>
      <p>
        This photo is <strong>not saved yet</strong>. Check the captured image for enrollment{' '}
        <span className="mono">{record.enrollmentNumber}</span>.
      </p>
      <div className="rule-review-layout">
        <Photo blob={record.imageBlob} className="rule-review-photo" />
        <div>
          <h3>Operator checklist</h3>
          {checks.map((check, index) => (
            <label className="checkbox-label" key={check}>
              <input
                type="checkbox"
                checked={confirmed[index]}
                disabled={busy}
                onChange={(event) =>
                  setConfirmed((old) =>
                    old.map((value, i) => (i === index ? event.target.checked : value)),
                  )
                }
              />
              <span>{check}</span>
            </label>
          ))}
          <p className="hint">
            This is your visual confirmation, not an AI detection result. If any requirement is
            missing, retake the photo.
          </p>
        </div>
      </div>
      <div className="modal-actions">
        <Button variant="secondary" disabled={busy} onClick={onRetake}>
          Retake photo
        </Button>
        <Button
          disabled={!confirmed.every(Boolean) || !checks.length}
          busy={busy}
          onClick={onApprove}
        >
          Confirm rules & save photo
        </Button>
      </div>
    </Modal>
  );
}
