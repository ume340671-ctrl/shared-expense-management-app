import { useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { friendsError } from "@/lib/friends";
import type { FriendMember } from "@/types/friends";
import { friendFieldClass, friendLabelClass } from "./FriendExpenseModal";

export function FriendMembersModal({ members, onClose, onAdd }: {
  members: FriendMember[]; onClose: () => void;
  onAdd: (id: string, fullName: string) => Promise<void>;
}) {
  const [id, setId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setError("Saisissez le nom de votre ami."); return; }
    setBusy(true); setError(null);
    try {
      await onAdd(id, name.trim());
      setName(""); setId(crypto.randomUUID());
    } catch (err) { setError(friendsError(err)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} title="Participants entre amis"
      description="Des noms libres, sans nouveau compte. Cette liste est indépendante des colocataires.">
      <form className="space-y-3" noValidate onSubmit={(event) => { void submit(event); }}>
        <label htmlFor="friend-name" className={friendLabelClass}>Nom du participant</label>
        <div className="flex gap-2">
          <input id="friend-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" autoFocus className={friendFieldClass} placeholder="Nom de votre ami" />
          <Button type="submit" loading={busy} className="h-12"><Plus className="h-4 w-4" />Ajouter</Button>
        </div>
        {error && <p role="alert" className="text-[13px] leading-relaxed text-danger">{error}</p>}
      </form>
      {members.length > 0 ? (
        <ul className="mt-6 max-h-64 divide-y divide-line overflow-y-auto border-y border-line">
          {members.map((m) => <li key={m.id} className="flex items-center gap-3 py-3"><Avatar size="sm" name={m.full_name} /><span className="min-w-0 break-words text-[14px]">{m.full_name}</span></li>)}
        </ul>
      ) : <p className="mt-6 text-[13px] text-ink-muted">Aucun participant. Ajoutez-vous, puis vos amis.</p>}
      <p className="mt-4 text-[12px] leading-relaxed text-ink-muted">Les participants sont conservés d'une période à l'autre pour préserver l'historique.</p>
      <Button variant="outline" className="mt-5 w-full" disabled={busy} onClick={onClose}>Terminer</Button>
    </Modal>
  );
}