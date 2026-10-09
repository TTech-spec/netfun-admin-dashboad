import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteChatMessage, listChat } from "@/lib/api";
import { friendlyError } from "@/lib/supabase";
import { timeAgo } from "@/lib/format";
import type { ChatMessage } from "@/lib/types";
import { Avatar, Badge, Button, ErrorNote, Modal, Spinner } from "./ui";
import { ModerationDialog, type ModerationTarget } from "./ModerationDialog";

/** Read the stream's live chat and remove bad messages (or ban their senders). */
export function LiveChatModeration({ tournamentId }: { tournamentId: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const key = ["chat", tournamentId];
  const chat = useQuery({
    queryKey: key,
    queryFn: () => listChat(tournamentId),
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });
  const [moderate, setModerate] = useState<ModerationTarget | null>(null);

  const remove = async (m: ChatMessage) => {
    try {
      await deleteChatMessage(m.id);
      qc.setQueryData<ChatMessage[]>(key, (old = []) => old.filter((x) => x.id !== m.id));
      toast.success("Message deleted");
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <MessageCircle className="size-4" /> Live chat
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Live chat">
        <p className="mb-3 text-sm text-nf-muted">
          Newest first, refreshes every few seconds. Deleted messages disappear for everyone.
        </p>
        <ErrorNote error={chat.error} />
        {chat.isLoading && <Spinner />}
        {chat.data?.length === 0 && (
          <p className="py-6 text-center text-sm text-nf-muted">No messages yet.</p>
        )}
        <div className="flex flex-col divide-y divide-nf-line">
          {chat.data?.map((m) => {
            const name = m.user?.full_name || m.user?.username || "NetFun member";
            return (
              <div key={m.id} className="flex items-start gap-2.5 py-2.5">
                <Avatar profile={m.user} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-nf-muted">
                    <span className="font-semibold text-nf-ink">{name}</span>
                    {m.user && <span>@{m.user.username}</span>}
                    <span>· {timeAgo(m.created_at)}</span>
                    {m.user?.banned_at && <Badge tone="red">Banned</Badge>}
                  </p>
                  <p className="text-[15px] break-words">{m.body}</p>
                </div>
                {m.user && !m.user.banned_at && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setModerate({ id: m.user_id, name, action: "ban" })}
                  >
                    Ban
                  </Button>
                )}
                <button
                  onClick={() => void remove(m)}
                  aria-label={`Delete message from ${name}`}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-nf-red hover:bg-nf-red-soft"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      </Modal>
      <ModerationDialog target={moderate} onClose={() => setModerate(null)} />
    </>
  );
}
