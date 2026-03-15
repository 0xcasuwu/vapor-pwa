/**
 * groupStore.ts
 * Vapor PWA - Group Chat State Management
 *
 * Manages star topology group chats where:
 * - Host maintains WebRTC connections to all members
 * - Host relays messages between members
 * - Members only connect to host, not to each other
 *
 * Key responsibility: Host must stay online for group to function
 */

import { create } from 'zustand';
import type { WebRTCChannel } from '../crypto/WebRTCChannel';

export interface GroupMember {
  id: string;
  fingerprint: string;
  nickname: string;
  publicKey: Uint8Array;
  joinedAt: number;
  isOnline: boolean;
  // Only host has these - the actual connections to members
  channel?: WebRTCChannel;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  senderFingerprint: string;
  senderNickname: string;
  content: string;
  timestamp: number;
}

export interface Group {
  id: string;
  name: string;
  hostFingerprint: string;
  hostNickname: string;
  createdAt: number;
  members: GroupMember[];
  messages: GroupMessage[];
  // Group encryption key (shared among all members)
  groupKey?: Uint8Array;
}

export type GroupRole = 'host' | 'member' | 'none';

interface GroupState {
  // Current active group (if any)
  activeGroup: Group | null;
  // User's role in the active group
  role: GroupRole;
  // Connection state
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  error: string | null;

  // Host actions
  createGroup: (name: string, hostFingerprint: string, hostNickname: string) => Group;
  addMember: (member: Omit<GroupMember, 'isOnline'>) => void;
  removeMember: (fingerprint: string) => void;
  broadcastMessage: (content: string, senderFingerprint: string, senderNickname: string) => void;

  // Member actions
  joinGroup: (group: Omit<Group, 'messages' | 'members'>) => void;
  leaveGroup: () => void;
  sendMessage: (content: string) => void;

  // Common actions
  receiveMessage: (message: GroupMessage) => void;
  updateMemberStatus: (fingerprint: string, isOnline: boolean) => void;
  setConnectionState: (state: GroupState['connectionState']) => void;
  setError: (error: string | null) => void;

  // For host: store channel references
  setMemberChannel: (fingerprint: string, channel: WebRTCChannel) => void;
  getMemberChannel: (fingerprint: string) => WebRTCChannel | undefined;
}

function generateGroupId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateMessageId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const timestamp = Date.now().toString(36);
  const random = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${timestamp}-${random}`;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  activeGroup: null,
  role: 'none',
  connectionState: 'disconnected',
  error: null,

  createGroup: (name, hostFingerprint, hostNickname) => {
    const group: Group = {
      id: generateGroupId(),
      name,
      hostFingerprint,
      hostNickname,
      createdAt: Date.now(),
      members: [],
      messages: [],
    };

    set({
      activeGroup: group,
      role: 'host',
      connectionState: 'connected',
      error: null,
    });

    return group;
  },

  addMember: (member) => {
    const { activeGroup } = get();
    if (!activeGroup) return;

    const newMember: GroupMember = {
      ...member,
      isOnline: true,
    };

    set({
      activeGroup: {
        ...activeGroup,
        members: [...activeGroup.members, newMember],
      },
    });
  },

  removeMember: (fingerprint) => {
    const { activeGroup } = get();
    if (!activeGroup) return;

    // Close the channel if it exists
    const member = activeGroup.members.find(m => m.fingerprint === fingerprint);
    if (member?.channel) {
      member.channel.close();
    }

    set({
      activeGroup: {
        ...activeGroup,
        members: activeGroup.members.filter(m => m.fingerprint !== fingerprint),
      },
    });
  },

  broadcastMessage: (content, senderFingerprint, senderNickname) => {
    const { activeGroup, role } = get();
    if (!activeGroup || role !== 'host') return;

    const message: GroupMessage = {
      id: generateMessageId(),
      groupId: activeGroup.id,
      senderFingerprint,
      senderNickname,
      content,
      timestamp: Date.now(),
    };

    // Add to local messages
    set({
      activeGroup: {
        ...activeGroup,
        messages: [...activeGroup.messages, message],
      },
    });

    // Relay to all other members
    const messagePayload = new TextEncoder().encode(JSON.stringify({
      type: 'group_message',
      ...message,
    }));

    activeGroup.members.forEach(member => {
      if (member.fingerprint !== senderFingerprint && member.channel && member.isOnline) {
        member.channel.send(messagePayload);
      }
    });
  },

  joinGroup: (groupInfo) => {
    set({
      activeGroup: {
        ...groupInfo,
        members: [],
        messages: [],
      },
      role: 'member',
      connectionState: 'connecting',
      error: null,
    });
  },

  leaveGroup: () => {
    const { activeGroup, role } = get();

    // If host, close all member connections
    if (role === 'host' && activeGroup) {
      activeGroup.members.forEach(member => {
        if (member.channel) {
          member.channel.close();
        }
      });
    }

    set({
      activeGroup: null,
      role: 'none',
      connectionState: 'disconnected',
      error: null,
    });
  },

  sendMessage: (_content) => {
    // For members, this will be handled by the component
    // which sends to the host who then broadcasts
    const { activeGroup } = get();
    if (!activeGroup) return;
    // Host: component calls broadcastMessage
    // Members: component sends to host via channel
  },

  receiveMessage: (message) => {
    const { activeGroup } = get();
    if (!activeGroup || message.groupId !== activeGroup.id) return;

    // Check for duplicate
    if (activeGroup.messages.some(m => m.id === message.id)) return;

    set({
      activeGroup: {
        ...activeGroup,
        messages: [...activeGroup.messages, message],
      },
    });
  },

  updateMemberStatus: (fingerprint, isOnline) => {
    const { activeGroup } = get();
    if (!activeGroup) return;

    set({
      activeGroup: {
        ...activeGroup,
        members: activeGroup.members.map(m =>
          m.fingerprint === fingerprint ? { ...m, isOnline } : m
        ),
      },
    });
  },

  setConnectionState: (connectionState) => {
    set({ connectionState });
  },

  setError: (error) => {
    set({ error, connectionState: error ? 'error' : get().connectionState });
  },

  setMemberChannel: (fingerprint, channel) => {
    const { activeGroup } = get();
    if (!activeGroup) return;

    set({
      activeGroup: {
        ...activeGroup,
        members: activeGroup.members.map(m =>
          m.fingerprint === fingerprint ? { ...m, channel } : m
        ),
      },
    });
  },

  getMemberChannel: (fingerprint) => {
    const { activeGroup } = get();
    if (!activeGroup) return undefined;
    return activeGroup.members.find(m => m.fingerprint === fingerprint)?.channel;
  },
}));
