import { Camera, Chrome, Download, Radio, RotateCcw, ShieldCheck, Users } from "lucide-react";
import { Panel } from "@/components/ui";

export default function HelpPage() {
  return <div className="mx-auto max-w-5xl space-y-5"><div><p className="text-xs font-bold uppercase tracking-[.22em] text-leaf-400">Match-day guide</p><h1 className="mt-2 text-3xl font-bold text-white">Using Live Game</h1><p className="mt-2 text-sm text-slate-400">Recommended setup and important information for collaborative live analysis.</p></div><div className="grid gap-4 md:grid-cols-2">
    <Item icon={Chrome} title="Recommended browser">Use the latest Google Chrome on the camera computer and staff devices. Camera capture requires HTTPS in production.</Item>
    <Item icon={Camera} title="Camera computer">Connect the camera or capture card, open the match and choose Connect camera. Keep this browser tab open while recording.</Item>
    <Item icon={Radio} title="Continuous recording">Start live recording before kick-off. The camera continues recording while any user rewinds or reviews a saved clip.</Item>
    <Item icon={RotateCcw} title="Replay and Go Live">Move the shared timeline backwards to review an incident. Go Live returns to the newest available image without changing anyone else’s position.</Item>
    <Item icon={Users} title="Staff collaboration">Invite each staff member from Settings. Everyone watches the same recording but controls playback and personal playlists independently.</Item>
    <Item icon={ShieldCheck} title="Moment safety">Tagging a moment saves the previous 20 seconds immediately. The clip timing can then be adjusted without changing the underlying recording.</Item>
    <Item icon={Download} title="Half-time review">Open Playlists to play your selected clips in sequence. Maps, reports and export continue to use the same saved moments and submoments.</Item>
  </div></div>;
}

function Item({ icon: Icon, title, children }: { icon: typeof Chrome; title: string; children: React.ReactNode }) { return <Panel className="p-5"><Icon className="text-leaf-400" /><h2 className="mt-4 font-bold text-white">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{children}</p></Panel>; }
