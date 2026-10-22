import { useState } from 'react';
import type { Session, SessionRules } from '../types';
import { defaultRules, normalizeRules, SHEET_RULE, updateSessionRules } from '../database/rules';
import { Button, Modal, useToast } from './ui';

export function SessionRulesFields({
  value,
  onChange,
}: {
  value: SessionRules;
  onChange: (value: SessionRules) => void;
}) {
  return (
    <fieldset className="session-rules-fields">
      <legend>Session capture rules</legend>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={value.requireSheet}
          onChange={(event) => onChange({ ...value, requireSheet: event.target.checked })}
        />
        <span>
          Require a sheet held with both hands<small>{SHEET_RULE}</small>
        </span>
      </label>
      <label>
        Additional instructions
        <textarea
          maxLength={600}
          rows={3}
          value={value.instructions}
          placeholder="Optional: e.g. use a plain background or show the session code on the sheet"
          onChange={(event) => onChange({ ...value, instructions: event.target.value })}
        />
      </label>
      <p className="hint">
        When rules are set, an operator must review each captured photo before saving. Sheet
        position and hand placement are not checked by AI.
      </p>
    </fieldset>
  );
}
export function SessionRulesEditor({
  session,
  onClose,
}: {
  session: Session;
  onClose: () => void;
}) {
  const [rules, setRules] = useState(() => normalizeRules(session.rules || defaultRules));
  const [busy, setBusy] = useState(false),
    toast = useToast();
  return (
    <Modal title={`Rules · ${session.name}`} onClose={() => !busy && onClose()}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            await updateSessionRules(session.id, rules, session.rulesRevision || 0);
            toast('Session rules saved');
            onClose();
          } catch (error) {
            toast((error as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <SessionRulesFields value={rules} onChange={setRules} />
        <p className="hint">
          Changes apply to future captures and retakes. Existing photos keep their original review
          record.
        </p>
        <div className="modal-actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Save rules
          </Button>
        </div>
      </form>
    </Modal>
  );
}
