import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, X } from 'lucide-react';

interface Props {
  onClose: () => void;
  onChanged: () => void;
}

export function ChangePasswordModal({ onClose, onChanged }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    element?.querySelector('input')?.focus();
    return () => element?.close();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (newPassword !== confirmPassword) {
      setError('A confirmação deve ser igual à nova senha.');
      return;
    }
    if (currentPassword === newPassword) {
      setError('Escolha uma senha diferente da atual.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Não foi possível trocar a senha. Tente novamente.');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onChanged();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível trocar a senha.');
    } finally {
      setBusy(false);
    }
  }

  const inputClass = 'w-full rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 disabled:opacity-60';
  return (
    <dialog ref={dialog} aria-labelledby="change-password-title"
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-violet-100 bg-white p-5 text-slate-800 shadow-xl backdrop:bg-slate-950/40">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 id="change-password-title" className="flex items-center gap-2 text-lg font-serif font-bold"><KeyRound className="w-4 h-4 text-pink-600" />Trocar senha</h2>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Fechar troca de senha" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-violet-50 disabled:opacity-50"><X className="w-4 h-4" /></button>
      </div>
      <p className="text-xs leading-relaxed text-slate-600 mb-4">Ao salvar, todas as sessões serão encerradas. Entre novamente com a nova senha.</p>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-xs font-medium">Senha atual
          <input type="password" autoComplete="current-password" autoFocus required maxLength={256} value={currentPassword} disabled={busy} onChange={event => setCurrentPassword(event.target.value)} className={`${inputClass} mt-1`} />
        </label>
        <label className="block text-xs font-medium">Nova senha
          <input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={newPassword} disabled={busy} onChange={event => setNewPassword(event.target.value)} aria-describedby="new-password-help" className={`${inputClass} mt-1`} />
        </label>
        <p id="new-password-help" className="text-[11px] text-slate-500">Use de 12 a 128 caracteres. Prefira uma frase longa e exclusiva.</p>
        <label className="block text-xs font-medium">Confirmar nova senha
          <input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmPassword} disabled={busy} onChange={event => setConfirmPassword(event.target.value)} className={`${inputClass} mt-1`} />
        </label>
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-violet-200 px-3 py-2 text-xs font-medium disabled:opacity-50">Cancelar</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-pink-600 px-3 py-2 text-xs font-semibold text-white hover:bg-pink-500 disabled:opacity-50">{busy ? 'Salvando…' : 'Salvar nova senha'}</button>
        </div>
      </form>
    </dialog>
  );
}
