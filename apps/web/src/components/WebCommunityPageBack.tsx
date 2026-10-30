import { ArrowLeft } from "lucide-react";
import { useWebCommunityFrame } from "../controllers/useWebCommunityFrame";

// "← <community>" above an owner page in Channels, back to where the community
// opens. Classroom has its top tabs for that, so it shows nothing there.
export function WebCommunityPageBack() {
  const frame = useWebCommunityFrame();
  if (frame.layout.navigation.position === "top" || !frame.community) return null;
  const home = frame.layout.navigation.home === "agent" ? "chat" : frame.layout.navigation.home;
  return (
    <button type="button" className="pn-wf-back pn-page-back" onClick={() => frame.onSelectTab(home)}>
      <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" />
      <span>{frame.community.name}</span>
    </button>
  );
}
