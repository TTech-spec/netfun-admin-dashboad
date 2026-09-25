import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { setBan, setTournamentBlock } from "@/lib/api";
import { friendlyError } from "@/lib/supabase";
import { Button, Field, Modal } from "./ui";

export type ModerationAction = "ban" | "unban" | "block" | "unblock";

export type ModerationTarget = {
  id: string;
  name: string;
  action: ModerationAction;
};

const COPY: Record<ModerationAction, { title: string; body: string; button: string; done: string }> = {
  ban: {
    title: "Ban from NetFun",
    body: "They'll be signed out everywhere and can't sign in, post, comment, message or join tournaments. Their open tournament applications are rejected. You can unban them later.",
    button: "Ban user",
    done: "banned",
  },
  unban: {
    title: "Unban",
    body: "They'll be able to sign in and use NetFun again.",
    button: "Unban user",
    done: "unbanned",
  },
  block: {
    title: "Block from tournaments",
    body: "They keep using NetFun, but can't apply to any tournament. Their pending and accepted places in current tournaments are rejected.",
    button: "Block from tournaments",
    done: "blocked from tournaments",
  },
  unblock: {
    title: "Unblock from tournaments",
    body: "They'll be able to apply to tournaments again.",
    button: "Unblock",
    done: "can join tournaments again",
  },
};

/** Confirms a ban/block change, then refreshes every list that shows people. */
export function ModerationDialog({
  target,
  onClose,
}: {
  target: ModerationTarget | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const copy = target ? COPY[target.action] : null;

  const confirm = async () => {
    if (!target || !copy) return;
    setBusy(true);
    try {
      if (target.action === "ban" || target.action === "unban")
        await setBan(target.id, target.action === "ban", reason.trim());
      else await setTournamentBlock(target.id, target.action === "block");
      toast.success(`${target.name} ${copy.done}`);
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["entries"] });
      qc.invalidateQueries({ queryKey: ["tournaments"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setReason("");
      onClose();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const destructive = target?.action === "ban" || target?.action === "block";

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title={copy ? `${copy.title}: ${target!.name}` : ""}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={destructive ? "danger" : "primary"} loading={busy} onClick={confirm}>
            {copy?.button}
          </Button>
        </>
      }
    >
      <p className="text-[15px] leading-relaxed text-nf-soft-ink">{copy?.body}</p>
      {target?.action === "ban" && (
        <div className="mt-4">
          <Field label="Reason (optional)" hint="Kept on their record in the dashboard.">
            <input
              className="input"
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Cheating in CODM Cup, harassment"
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}
