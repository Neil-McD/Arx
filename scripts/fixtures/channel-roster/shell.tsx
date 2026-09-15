import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChannelRosterPanel } from '../../../apps/web/src/components/ChannelRosterPanel';
import { CommunityChannelSessionContext } from '../../../apps/web/src/components/CommunityChannelSessionContext';
import { watches, memoryWatches, publish } from './readers';
import '../../../apps/web/src/index.css';
const props: any = {
  communityName: 'Popup acceptance', currentUserId: 'owner', channelId: 'general',
  getAvatarColor: () => '#888', getInitials: (s: string) => s.slice(0, 1),
  memberSettings: { canManageMembers: true, activeCommunity: { id: 'community' },
    displayName: (s: string) => s, getInitials: (s: string) => s.slice(0, 1),
    communityInitials: (s: string) => s.slice(0, 1), loadMemberBillingHistory: async () => null },
};
createRoot(document.getElementById('root')!).render(
  <div className="app-root" style={{ display: 'block' }}>
    <nav aria-label="Fixture community rail" style={{ position: 'fixed', inset: '0 auto 0 0', width: 72, zIndex: 10, background: '#222' }}>Communities</nav>
    <div className="product-shell-surface product-shell-surface--community" style={{ marginLeft: 72, height: '100%', isolation: 'isolate', overflow: 'hidden' }}>
      <CommunityChannelSessionContext.Provider value={{ communityId: 'community', session: { user: { id: 'owner' }, access_token: 'fixture' } as any }}>
        <ChannelRosterPanel {...props} />
      </CommunityChannelSessionContext.Provider>
    </div>
  </div>,
);
const ready = setInterval(() => {
  if (!watches.length || !memoryWatches.length) return;
  clearInterval(ready);
  publish(watches.at(-1), ['Platform Home Racecheck']);
  memoryWatches.at(-1).onUpdate({ memory: { total_visible_nodes: 0 }, agent: { status: 'resting' }, graph: { nodes: [], edges: [], root_node_id: null } });
}, 10);
