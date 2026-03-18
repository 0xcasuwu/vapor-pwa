/**
 * groupStore.actual.test.ts
 * Vapor PWA - Actual Group Store Tests
 *
 * Tests the actual Zustand group store.
 * Verifies star topology group management.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGroupStore } from '../groupStore';

// Mock WebRTC channel
const createMockChannel = () => ({
  send: vi.fn(),
  close: vi.fn(),
  getState: () => 'connected',
});

describe('Group Store - Actual Implementation', () => {
  beforeEach(() => {
    useGroupStore.getState().leaveGroup();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useGroupStore.getState();

      expect(state.activeGroup).toBeNull();
      expect(state.role).toBe('none');
      expect(state.connectionState).toBe('disconnected');
      expect(state.error).toBeNull();
    });
  });

  describe('createGroup (Host)', () => {
    it('should create group and set role to host', () => {
      const group = useGroupStore.getState().createGroup(
        'Test Group',
        'HOST1234',
        'Alice'
      );

      expect(group.name).toBe('Test Group');
      expect(group.hostFingerprint).toBe('HOST1234');
      expect(group.hostNickname).toBe('Alice');
      expect(group.id).toBeDefined();
      expect(group.members).toEqual([]);
      expect(group.messages).toEqual([]);

      const state = useGroupStore.getState();
      expect(state.role).toBe('host');
      expect(state.connectionState).toBe('connected');
      expect(state.activeGroup?.id).toBe(group.id);
    });

    it('should generate unique group IDs', () => {
      const group1 = useGroupStore.getState().createGroup('Group 1', 'HOST1', 'Alice');
      useGroupStore.getState().leaveGroup();

      const group2 = useGroupStore.getState().createGroup('Group 2', 'HOST2', 'Bob');

      expect(group1.id).not.toBe(group2.id);
    });
  });

  describe('addMember (Host)', () => {
    it('should add member to group', () => {
      useGroupStore.getState().createGroup('Test', 'HOST', 'Alice');

      useGroupStore.getState().addMember({
        id: 'member1',
        fingerprint: 'MEMBER1234',
        nickname: 'Bob',
        publicKey: new Uint8Array(32),
        joinedAt: Date.now(),
      });

      const state = useGroupStore.getState();
      expect(state.activeGroup?.members).toHaveLength(1);
      expect(state.activeGroup?.members[0].nickname).toBe('Bob');
      expect(state.activeGroup?.members[0].isOnline).toBe(true);
    });

    it('should not add member when no group', () => {
      // No group created
      useGroupStore.getState().addMember({
        id: 'member1',
        fingerprint: 'MEMBER',
        nickname: 'Bob',
        publicKey: new Uint8Array(32),
        joinedAt: Date.now(),
      });

      expect(useGroupStore.getState().activeGroup).toBeNull();
    });

    it('should add multiple members', () => {
      useGroupStore.getState().createGroup('Test', 'HOST', 'Alice');

      for (let i = 0; i < 5; i++) {
        useGroupStore.getState().addMember({
          id: `member${i}`,
          fingerprint: `MEMBER${i}`,
          nickname: `User ${i}`,
          publicKey: new Uint8Array(32),
          joinedAt: Date.now() + i,
        });
      }

      expect(useGroupStore.getState().activeGroup?.members).toHaveLength(5);
    });
  });

  describe('removeMember (Host)', () => {
    it('should remove member from group', () => {
      useGroupStore.getState().createGroup('Test', 'HOST', 'Alice');
      useGroupStore.getState().addMember({
        id: 'member1',
        fingerprint: 'BOB123',
        nickname: 'Bob',
        publicKey: new Uint8Array(32),
        joinedAt: Date.now(),
      });

      useGroupStore.getState().removeMember('BOB123');

      expect(useGroupStore.getState().activeGroup?.members).toHaveLength(0);
    });

    it('should close channel when removing member', () => {
      useGroupStore.getState().createGroup('Test', 'HOST', 'Alice');

      const mockChannel = createMockChannel();
      useGroupStore.getState().addMember({
        id: 'member1',
        fingerprint: 'BOB123',
        nickname: 'Bob',
        publicKey: new Uint8Array(32),
        joinedAt: Date.now(),
      });
      useGroupStore.getState().setMemberChannel('BOB123', mockChannel as any);

      useGroupStore.getState().removeMember('BOB123');

      expect(mockChannel.close).toHaveBeenCalled();
    });

    it('should handle removing non-existent member', () => {
      useGroupStore.getState().createGroup('Test', 'HOST', 'Alice');
      useGroupStore.getState().addMember({
        id: 'member1',
        fingerprint: 'BOB123',
        nickname: 'Bob',
        publicKey: new Uint8Array(32),
        joinedAt: Date.now(),
      });

      // Remove non-existent member
      useGroupStore.getState().removeMember('NONEXISTENT');

      // Original member still there
      expect(useGroupStore.getState().activeGroup?.members).toHaveLength(1);
    });
  });

  describe('broadcastMessage (Host)', () => {
    it('should add message to group', () => {
      useGroupStore.getState().createGroup('Test', 'HOST', 'Alice');

      useGroupStore.getState().broadcastMessage('Hello everyone', 'HOST', 'Alice');

      const messages = useGroupStore.getState().activeGroup?.messages;
      expect(messages).toHaveLength(1);
      expect(messages?.[0].content).toBe('Hello everyone');
      expect(messages?.[0].senderFingerprint).toBe('HOST');
      expect(messages?.[0].senderNickname).toBe('Alice');
    });

    it('should relay message to all members except sender', () => {
      useGroupStore.getState().createGroup('Test', 'HOST', 'Alice');

      const mockChannel1 = createMockChannel();
      const mockChannel2 = createMockChannel();

      useGroupStore.getState().addMember({
        id: 'm1',
        fingerprint: 'BOB',
        nickname: 'Bob',
        publicKey: new Uint8Array(32),
        joinedAt: Date.now(),
      });
      useGroupStore.getState().setMemberChannel('BOB', mockChannel1 as any);

      useGroupStore.getState().addMember({
        id: 'm2',
        fingerprint: 'CAROL',
        nickname: 'Carol',
        publicKey: new Uint8Array(32),
        joinedAt: Date.now(),
      });
      useGroupStore.getState().setMemberChannel('CAROL', mockChannel2 as any);

      // Bob sends message (relayed to Carol, not back to Bob)
      useGroupStore.getState().broadcastMessage('Hi from Bob', 'BOB', 'Bob');

      expect(mockChannel1.send).not.toHaveBeenCalled(); // Bob is sender
      expect(mockChannel2.send).toHaveBeenCalled(); // Carol receives
    });

    it('should not send to offline members', () => {
      useGroupStore.getState().createGroup('Test', 'HOST', 'Alice');

      const mockChannel = createMockChannel();
      useGroupStore.getState().addMember({
        id: 'm1',
        fingerprint: 'BOB',
        nickname: 'Bob',
        publicKey: new Uint8Array(32),
        joinedAt: Date.now(),
      });
      useGroupStore.getState().setMemberChannel('BOB', mockChannel as any);
      useGroupStore.getState().updateMemberStatus('BOB', false);

      useGroupStore.getState().broadcastMessage('Test', 'HOST', 'Alice');

      expect(mockChannel.send).not.toHaveBeenCalled();
    });

    it('should not broadcast when not host', () => {
      // Join as member
      useGroupStore.getState().joinGroup({
        id: 'group1',
        name: 'Test',
        hostFingerprint: 'HOST',
        hostNickname: 'Alice',
        createdAt: Date.now(),
      });

      useGroupStore.getState().broadcastMessage('Test', 'ME', 'Me');

      // No message added (broadcast is host-only)
      expect(useGroupStore.getState().activeGroup?.messages).toHaveLength(0);
    });
  });

  describe('joinGroup (Member)', () => {
    it('should join group and set role to member', () => {
      useGroupStore.getState().joinGroup({
        id: 'group123',
        name: 'Test Group',
        hostFingerprint: 'HOST',
        hostNickname: 'Alice',
        createdAt: Date.now(),
      });

      const state = useGroupStore.getState();
      expect(state.role).toBe('member');
      expect(state.connectionState).toBe('connecting');
      expect(state.activeGroup?.name).toBe('Test Group');
      expect(state.activeGroup?.members).toEqual([]);
      expect(state.activeGroup?.messages).toEqual([]);
    });
  });

  describe('leaveGroup', () => {
    it('should reset state when member leaves', () => {
      useGroupStore.getState().joinGroup({
        id: 'group1',
        name: 'Test',
        hostFingerprint: 'HOST',
        hostNickname: 'Alice',
        createdAt: Date.now(),
      });

      useGroupStore.getState().leaveGroup();

      const state = useGroupStore.getState();
      expect(state.activeGroup).toBeNull();
      expect(state.role).toBe('none');
      expect(state.connectionState).toBe('disconnected');
    });

    it('should close all member channels when host leaves', () => {
      useGroupStore.getState().createGroup('Test', 'HOST', 'Alice');

      const mockChannel1 = createMockChannel();
      const mockChannel2 = createMockChannel();

      useGroupStore.getState().addMember({
        id: 'm1',
        fingerprint: 'BOB',
        nickname: 'Bob',
        publicKey: new Uint8Array(32),
        joinedAt: Date.now(),
      });
      useGroupStore.getState().setMemberChannel('BOB', mockChannel1 as any);

      useGroupStore.getState().addMember({
        id: 'm2',
        fingerprint: 'CAROL',
        nickname: 'Carol',
        publicKey: new Uint8Array(32),
        joinedAt: Date.now(),
      });
      useGroupStore.getState().setMemberChannel('CAROL', mockChannel2 as any);

      useGroupStore.getState().leaveGroup();

      expect(mockChannel1.close).toHaveBeenCalled();
      expect(mockChannel2.close).toHaveBeenCalled();
    });
  });

  describe('receiveMessage', () => {
    it('should add message to group', () => {
      useGroupStore.getState().createGroup('Test', 'HOST', 'Alice');
      const groupId = useGroupStore.getState().activeGroup!.id;

      useGroupStore.getState().receiveMessage({
        id: 'msg1',
        groupId,
        senderFingerprint: 'BOB',
        senderNickname: 'Bob',
        content: 'Hello',
        timestamp: Date.now(),
      });

      expect(useGroupStore.getState().activeGroup?.messages).toHaveLength(1);
    });

    it('should deduplicate messages', () => {
      useGroupStore.getState().createGroup('Test', 'HOST', 'Alice');
      const groupId = useGroupStore.getState().activeGroup!.id;

      const message = {
        id: 'msg1',
        groupId,
        senderFingerprint: 'BOB',
        senderNickname: 'Bob',
        content: 'Hello',
        timestamp: Date.now(),
      };

      useGroupStore.getState().receiveMessage(message);
      useGroupStore.getState().receiveMessage(message); // Duplicate

      expect(useGroupStore.getState().activeGroup?.messages).toHaveLength(1);
    });

    it('should ignore messages for wrong group', () => {
      useGroupStore.getState().createGroup('Test', 'HOST', 'Alice');

      useGroupStore.getState().receiveMessage({
        id: 'msg1',
        groupId: 'wrong-group-id',
        senderFingerprint: 'BOB',
        senderNickname: 'Bob',
        content: 'Hello',
        timestamp: Date.now(),
      });

      expect(useGroupStore.getState().activeGroup?.messages).toHaveLength(0);
    });
  });

  describe('updateMemberStatus', () => {
    it('should update member online status', () => {
      useGroupStore.getState().createGroup('Test', 'HOST', 'Alice');
      useGroupStore.getState().addMember({
        id: 'm1',
        fingerprint: 'BOB',
        nickname: 'Bob',
        publicKey: new Uint8Array(32),
        joinedAt: Date.now(),
      });

      useGroupStore.getState().updateMemberStatus('BOB', false);

      const bob = useGroupStore.getState().activeGroup?.members.find(m => m.fingerprint === 'BOB');
      expect(bob?.isOnline).toBe(false);
    });
  });

  describe('setConnectionState', () => {
    it('should update connection state', () => {
      useGroupStore.getState().setConnectionState('connecting');
      expect(useGroupStore.getState().connectionState).toBe('connecting');

      useGroupStore.getState().setConnectionState('connected');
      expect(useGroupStore.getState().connectionState).toBe('connected');
    });
  });

  describe('setError', () => {
    it('should set error and update connection state', () => {
      useGroupStore.getState().setError('Connection failed');

      expect(useGroupStore.getState().error).toBe('Connection failed');
      expect(useGroupStore.getState().connectionState).toBe('error');
    });

    it('should clear error', () => {
      useGroupStore.getState().setError('Some error');
      useGroupStore.getState().setConnectionState('connected');
      useGroupStore.getState().setError(null);

      expect(useGroupStore.getState().error).toBeNull();
      expect(useGroupStore.getState().connectionState).toBe('connected');
    });
  });

  describe('setMemberChannel / getMemberChannel', () => {
    it('should store and retrieve channel', () => {
      useGroupStore.getState().createGroup('Test', 'HOST', 'Alice');
      useGroupStore.getState().addMember({
        id: 'm1',
        fingerprint: 'BOB',
        nickname: 'Bob',
        publicKey: new Uint8Array(32),
        joinedAt: Date.now(),
      });

      const mockChannel = createMockChannel();
      useGroupStore.getState().setMemberChannel('BOB', mockChannel as any);

      const retrieved = useGroupStore.getState().getMemberChannel('BOB');
      expect(retrieved).toBe(mockChannel);
    });

    it('should return undefined for non-existent member', () => {
      useGroupStore.getState().createGroup('Test', 'HOST', 'Alice');

      const channel = useGroupStore.getState().getMemberChannel('NONEXISTENT');
      expect(channel).toBeUndefined();
    });

    it('should return undefined when no group', () => {
      const channel = useGroupStore.getState().getMemberChannel('BOB');
      expect(channel).toBeUndefined();
    });
  });
});
