import { useState } from 'react';
import type { Student } from '../types';
import { updateStudentName } from '../database/students';
import { Button, Modal, useToast } from './ui';

export function EditStudentModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const [name, setName] = useState(student.name);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <Modal title="Edit student name" onClose={() => !busy && onClose()}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            await updateStudentName(student.id, name);
            toast('Student name saved');
            onClose();
          } catch (error) {
            toast((error as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="mono">{student.enrollmentNumber}</p>
        <label>
          Student name
          <input
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <p className="hint">
          Replace the generated name with your roster’s confirmed name. Enrollment, capture history
          and saved photo filenames stay unchanged.
        </p>
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim()} busy={busy}>
            Save name
          </Button>
        </div>
      </form>
    </Modal>
  );
}
