import { createFileRoute } from "@tanstack/react-router";
import { EmojiPanel } from "@/components/fp/ChatPro";
import { ControlPills } from "@/components/fp/ControlPills";

export const Route = createFileRoute("/ui-check")({
  ssr: false,
  head: () => ({ meta: [{ title: "UI check — DuoX" }, { name: "description", content: "Temporary visual check." }, { property: "og:title", content: "UI check — DuoX" }, { property: "og:description", content: "Temporary visual check." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => (
    <div className="mx-auto max-w-md bg-chat-bg">
      <ControlPills pairId="ui-check" ctl={{ chat_paused: true, disappearing_seconds: 3600, save_to_gallery_blocked: true, settings: { g_no_copy: true, g_stealth: true, g_quiet_on: true } }} muted bn={false} onMute={() => {}} />
      <p className="text-ui">Typography check</p>
      <EmojiPanel onPick={() => {}} />
    </div>
  ),
});
