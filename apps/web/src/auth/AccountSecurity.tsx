import { type FormEvent, useState } from 'react';
import type { SessionGateway } from './session-gateway.js';

interface AccountSecurityProps {
  readonly sessionGateway: SessionGateway;
}

export function AccountSecurity({ sessionGateway }: AccountSecurityProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get('password') ?? '');
    const confirmation = String(data.get('passwordConfirmation') ?? '');

    if (password.length < 8) {
      setError('Password must contain at least 8 characters.');
      setMessage(null);
      return;
    }
    if (password !== confirmation) {
      setError('Password confirmation does not match.');
      setMessage(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await sessionGateway.updatePassword(password);
      form.reset();
      setMessage('Password updated.');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Password could not be updated.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="account-security">
      <button
        className="button-secondary"
        onClick={() => {
          setOpen((current) => !current);
          setError(null);
          setMessage(null);
        }}
        type="button"
      >
        {open ? 'Close password setup' : 'Set / change password'}
      </button>

      {open ? (
        <form className="account-security-form" onSubmit={submit}>
          <p className="setup-hint">
            After accepting a staff invitation, set a password here for future
            email/password sign-ins.
          </p>
          <label>
            New password
            <input
              autoComplete="new-password"
              minLength={8}
              name="password"
              required
              type="password"
            />
          </label>
          <label>
            Confirm password
            <input
              autoComplete="new-password"
              minLength={8}
              name="passwordConfirmation"
              required
              type="password"
            />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {message ? <p className="setup-hint" role="status">{message}</p> : null}
          <button disabled={submitting} type="submit">
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </form>
      ) : null}
    </div>
  );
}
