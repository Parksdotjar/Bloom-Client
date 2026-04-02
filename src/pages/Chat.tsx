import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCheck,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Reply,
  Search,
  Send,
  Trash2,
  UserPlus,
  Users,
  Bell,
  Check,
  X,
  Gamepad2
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../services/supabase';

type SocialTab = 'chat' | 'friends';

type ThreadSummary = {
  thread_id: string;
  kind: 'group' | 'dm';
  title: string | null;
  dm_other_profile_id: string | null;
  dm_other_username: string | null;
  dm_other_avatar_url: string | null;
  member_count: number;
  last_message_id: number | null;
  last_message_body: string | null;
  last_message_sender_profile_id: string | null;
  last_message_created_at: string | null;
  last_message_deleted_at: string | null;
  last_read_message_id: number | null;
  unread_count: number;
  updated_at: string;
};

type ChatMessage = {
  id: number;
  thread_id: string;
  sender_profile_id: string;
  sender_username: string;
  sender_avatar_url: string | null;
  body: string | null;
  reply_to_message_id: number | null;
  reply_body: string | null;
  reply_sender_profile_id: string | null;
  reply_sender_username: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type ChatMember = {
  profile_id: string;
  mc_username: string;
  avatar_url: string | null;
  role: 'owner' | 'member';
  is_online: boolean;
  last_seen_at: string | null;
  last_read_message_id: number | null;
  last_read_at: string | null;
};

type ChatReaction = {
  message_id: number;
  profile_id: string;
  mc_username: string;
  avatar_url: string | null;
  reaction: string;
  created_at: string;
};

type ChatTyping = {
  profile_id: string;
  mc_username: string;
  typing_until: string;
};

type ChatSearchProfile = {
  mc_profile_id: string;
  mc_username: string;
  avatar_url: string | null;
  is_online: boolean;
  last_seen_at: string | null;
};

type FriendRequest = {
  request_id: string;
  sender_profile_id: string;
  sender_username: string;
  sender_avatar_url: string | null;
  receiver_profile_id: string;
  receiver_username: string;
  receiver_avatar_url: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: string;
  responded_at: string | null;
  direction: 'incoming' | 'outgoing';
};

type FriendRow = {
  profile_id: string;
  mc_username: string;
  avatar_url: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  since: string;
};

type SocialNotification = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
};

const QUICK_REACTIONS = ['👍', '❤️', '🔥', '😂', '👀', '😮'];

function formatTime(ts: string | null) {
  if (!ts) return '';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(ts: string) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const isSameDay = now.toDateString() === date.toDateString();
  if (isSameDay) return 'Today';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatLastSeen(ts: string | null) {
  if (!ts) return 'offline';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return 'offline';
  const diffMs = Date.now() - date.getTime();
  if (diffMs <= 60_000) return 'active now';
  if (diffMs <= 3_600_000) return `${Math.max(1, Math.floor(diffMs / 60_000))}m ago`;
  if (diffMs <= 86_400_000) return `${Math.max(1, Math.floor(diffMs / 3_600_000))}h ago`;
  return date.toLocaleDateString();
}

export function Chat() {
  const { authState, profileAvatarUrl, startLogin, loading } = useAuth();

  const [booting, setBooting] = useState(false);
  const [chatReady, setChatReady] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [socialTab, setSocialTab] = useState<SocialTab>('chat');

  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [reactions, setReactions] = useState<ChatReaction[]>([]);
  const [typingUsers, setTypingUsers] = useState<ChatTyping[]>([]);

  const [composer, setComposer] = useState('');
  const [replyToId, setReplyToId] = useState<number | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);

  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [createMode, setCreateMode] = useState<'none' | 'dm' | 'group'>('none');
  const [profileSearch, setProfileSearch] = useState('');
  const [searchingProfiles, setSearchingProfiles] = useState(false);
  const [profileSearchResults, setProfileSearchResults] = useState<ChatSearchProfile[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupMembers, setGroupMembers] = useState<ChatSearchProfile[]>([]);
  const [creatingThread, setCreatingThread] = useState(false);

  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [notifications, setNotifications] = useState<SocialNotification[]>([]);
  const [sendingFriendRequest, setSendingFriendRequest] = useState(false);

  const refreshTimerRef = useRef<number | null>(null);
  const activeThreadIdRef = useRef<string | null>(null);
  const reactionBusyRef = useRef<string | null>(null);
  const unreadNotifRef = useRef(0);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.thread_id === activeThreadId) || null,
    [threads, activeThreadId]
  );

  const orderedMessages = useMemo(() => [...messages].sort((a, b) => a.id - b.id), [messages]);

  const messageMap = useMemo(() => {
    const byId = new Map<number, ChatMessage>();
    for (const message of messages) byId.set(message.id, message);
    return byId;
  }, [messages]);

  const reactionsByMessage = useMemo(() => {
    const byMessage = new Map<number, Map<string, ChatReaction[]>>();
    for (const reaction of reactions) {
      const forMessage = byMessage.get(reaction.message_id) || new Map<string, ChatReaction[]>();
      const sameEmoji = forMessage.get(reaction.reaction) || [];
      sameEmoji.push(reaction);
      forMessage.set(reaction.reaction, sameEmoji);
      byMessage.set(reaction.message_id, forMessage);
    }
    return byMessage;
  }, [reactions]);

  const typingLabel = useMemo(() => {
    if (typingUsers.length === 0) return '';
    if (typingUsers.length === 1) return `${typingUsers[0].mc_username} is typing...`;
    if (typingUsers.length === 2) return `${typingUsers[0].mc_username} and ${typingUsers[1].mc_username} are typing...`;
    return `${typingUsers[0].mc_username} and ${typingUsers.length - 1} others are typing...`;
  }, [typingUsers]);

  const incomingRequests = useMemo(
    () => friendRequests.filter((request) => request.direction === 'incoming' && request.status === 'pending'),
    [friendRequests]
  );

  const outgoingRequests = useMemo(
    () => friendRequests.filter((request) => request.direction === 'outgoing' && request.status === 'pending'),
    [friendRequests]
  );

  const unreadNotifications = useMemo(
    () => notifications.filter((notification) => !notification.read_at),
    [notifications]
  );

  const socialBadgeCount = incomingRequests.length + unreadNotifications.length;

  const loadThreads = useCallback(async () => {
    const { data, error } = await supabase.rpc('chat_list_threads');
    if (error) throw error;
    const nextThreads = (data || []) as ThreadSummary[];
    setThreads(nextThreads);
    setActiveThreadId((current) => {
      if (current && nextThreads.some((thread) => thread.thread_id === current)) return current;
      return nextThreads[0]?.thread_id || null;
    });
  }, []);

  const loadThreadBundle = useCallback(async (threadId: string) => {
    const [messagesRes, membersRes, reactionsRes, typingRes] = await Promise.all([
      supabase.rpc('chat_list_messages', { p_thread_id: threadId, p_limit: 200 }),
      supabase.rpc('chat_list_members', { p_thread_id: threadId }),
      supabase.rpc('chat_list_reactions', { p_thread_id: threadId }),
      supabase.rpc('chat_list_typing', { p_thread_id: threadId })
    ]);

    if (messagesRes.error) throw messagesRes.error;
    if (membersRes.error) throw membersRes.error;
    if (reactionsRes.error) throw reactionsRes.error;
    if (typingRes.error) throw typingRes.error;

    const nextMessages = (messagesRes.data || []) as ChatMessage[];
    setMessages(nextMessages);
    setMembers((membersRes.data || []) as ChatMember[]);
    setReactions((reactionsRes.data || []) as ChatReaction[]);
    setTypingUsers((typingRes.data || []) as ChatTyping[]);

    if (nextMessages.length > 0) {
      const newestMessageId = nextMessages[0].id;
      await supabase.rpc('chat_mark_thread_read', {
        p_thread_id: threadId,
        p_message_id: newestMessageId
      });
    }
  }, []);

  const loadSocialBundle = useCallback(async () => {
    const [friendsRes, requestsRes, notificationsRes] = await Promise.all([
      supabase.rpc('chat_list_friends'),
      supabase.rpc('chat_list_friend_requests'),
      supabase.rpc('chat_list_notifications', { p_limit: 40 })
    ]);

    if (friendsRes.error) throw friendsRes.error;
    if (requestsRes.error) throw requestsRes.error;
    if (notificationsRes.error) throw notificationsRes.error;

    setFriends((friendsRes.data || []) as FriendRow[]);
    setFriendRequests((requestsRes.data || []) as FriendRequest[]);
    setNotifications((notificationsRes.data || []) as SocialNotification[]);
  }, []);

  const syncPresence = useCallback(async (isOnline: boolean) => {
    await supabase.rpc('chat_set_presence', { p_is_online: isOnline });
  }, []);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      void loadThreads();
      void loadSocialBundle();
      const currentThreadId = activeThreadIdRef.current;
      if (currentThreadId) void loadThreadBundle(currentThreadId);
    }, 220);
  }, [loadThreads, loadSocialBundle, loadThreadBundle]);

  useEffect(() => {
    if (!authState) {
      setThreads([]);
      setMessages([]);
      setMembers([]);
      setReactions([]);
      setTypingUsers([]);
      setFriends([]);
      setFriendRequests([]);
      setNotifications([]);
      setChatReady(false);
      return;
    }

    let cancelled = false;
    setBooting(true);
    setChatError(null);

    const boot = async () => {
      try {
        const sessionRes = await supabase.auth.getSession();
        if (sessionRes.error) throw sessionRes.error;
        if (!sessionRes.data.session) {
          throw new Error('Auth session missing! Please sign in again from Bloom Client.');
        }

        const syncRes = await supabase.rpc('chat_sync_identity', {
          p_mc_profile_id: authState.profile.id,
          p_mc_username: authState.profile.name,
          p_avatar_url: profileAvatarUrl || authState.profile.skinUrl || null
        });
        if (syncRes.error) throw syncRes.error;

        await syncPresence(true);
        await Promise.all([loadThreads(), loadSocialBundle()]);

        if (!cancelled) setChatReady(true);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setChatError(message.includes('anonymous') ? `${message} (Enable Anonymous sign-ins in Supabase Auth settings.)` : message);
          setChatReady(false);
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    };

    void boot();

    const heartbeat = window.setInterval(() => {
      void syncPresence(true);
    }, 45_000);

    const onBeforeUnload = () => {
      void syncPresence(false);
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeat);
      window.removeEventListener('beforeunload', onBeforeUnload);
      void syncPresence(false);
    };
  }, [authState, profileAvatarUrl, loadThreads, loadSocialBundle, syncPresence]);

  useEffect(() => {
    if (!chatReady || !activeThreadId) return;
    void loadThreadBundle(activeThreadId).catch((err) => {
      setChatError(err instanceof Error ? err.message : String(err));
    });
  }, [chatReady, activeThreadId, loadThreadBundle]);

  useEffect(() => {
    if (!chatReady || !authState) return;
    const channel = supabase.channel(`chat-live-${authState.profile.id}`);
    const watchTables = [
      'chat_threads',
      'chat_thread_members',
      'chat_messages',
      'chat_message_reactions',
      'chat_read_receipts',
      'chat_typing_states',
      'chat_presence',
      'chat_profiles',
      'chat_friendships',
      'chat_friend_requests',
      'chat_notifications'
    ];

    for (const tableName of watchTables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: tableName }, () => {
        scheduleRealtimeRefresh();
      });
    }

    channel.subscribe();

    return () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [chatReady, authState, scheduleRealtimeRefresh]);

  useEffect(() => {
    if (!chatReady || !activeThreadId) return;
    const hasDraft = composer.trim().length > 0;
    if (!hasDraft) {
      void supabase.rpc('chat_set_typing', { p_thread_id: activeThreadId, p_is_typing: false });
      return;
    }

    void supabase.rpc('chat_set_typing', { p_thread_id: activeThreadId, p_is_typing: true });
    const timer = window.setInterval(() => {
      void supabase.rpc('chat_set_typing', { p_thread_id: activeThreadId, p_is_typing: true });
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [chatReady, activeThreadId, composer]);

  useEffect(() => {
    const query = profileSearch.trim();
    if (query.length < 1) {
      setProfileSearchResults([]);
      return;
    }

    let cancelled = false;
    setSearchingProfiles(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { data, error } = await supabase.rpc('chat_search_profiles', { p_query: query, p_limit: 20 });
          if (cancelled) return;
          if (error) {
            setChatError(error.message);
            setProfileSearchResults([]);
            return;
          }
          setProfileSearchResults((data || []) as ChatSearchProfile[]);
        } finally {
          if (!cancelled) setSearchingProfiles(false);
        }
      })();
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [profileSearch]);

  useEffect(() => {
    const nextUnread = unreadNotifications.length + incomingRequests.length;
    if (nextUnread > unreadNotifRef.current && nextUnread > 0) {
      window.dispatchEvent(
        new CustomEvent('bloom-social-notification', {
          detail: {
            message: incomingRequests.length > 0
              ? `New friend request from ${incomingRequests[0].sender_username}`
              : 'You have new social notifications.'
          }
        })
      );
    }
    unreadNotifRef.current = nextUnread;
  }, [incomingRequests, unreadNotifications]);

  const sendMessage = async () => {
    if (!authState || !activeThreadId) return;
    const content = composer.trim();
    if (!content) return;

    setSendingMessage(true);
    setChatError(null);
    try {
      const { error } = await supabase.from('chat_messages').insert({
        thread_id: activeThreadId,
        sender_profile_id: authState.profile.id,
        body: content,
        reply_to_message_id: replyToId
      });
      if (error) throw error;

      setComposer('');
      setReplyToId(null);
      await Promise.all([loadThreadBundle(activeThreadId), loadThreads()]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : String(err));
    } finally {
      setSendingMessage(false);
    }
  };

  const saveEdit = async (messageId: number) => {
    if (!authState || !activeThreadId) return;
    const content = editingDraft.trim();
    if (!content) return;

    setSavingEdit(true);
    setChatError(null);
    try {
      const { error } = await supabase
        .from('chat_messages')
        .update({ body: content, edited_at: new Date().toISOString() })
        .eq('id', messageId)
        .eq('sender_profile_id', authState.profile.id);
      if (error) throw error;

      setEditingMessageId(null);
      setEditingDraft('');
      await Promise.all([loadThreadBundle(activeThreadId), loadThreads()]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteMessage = async (messageId: number) => {
    if (!authState || !activeThreadId) return;

    setChatError(null);
    const { error } = await supabase
      .from('chat_messages')
      .update({ body: null, deleted_at: new Date().toISOString(), edited_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('sender_profile_id', authState.profile.id);

    if (error) {
      setChatError(error.message);
      return;
    }

    await Promise.all([loadThreadBundle(activeThreadId), loadThreads()]);
  };

  const toggleReaction = async (messageId: number, emoji: string) => {
    if (!authState || !activeThreadId) return;
    const lockKey = `${messageId}:${emoji}`;
    if (reactionBusyRef.current === lockKey) return;
    reactionBusyRef.current = lockKey;

    try {
      const hasOwn = reactions.some(
        (reaction) =>
          reaction.message_id === messageId &&
          reaction.reaction === emoji &&
          reaction.profile_id === authState.profile.id
      );

      if (hasOwn) {
        const { error } = await supabase
          .from('chat_message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('profile_id', authState.profile.id)
          .eq('reaction', emoji);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('chat_message_reactions')
          .insert({ message_id: messageId, profile_id: authState.profile.id, reaction: emoji });
        if (error) throw error;
      }

      await loadThreadBundle(activeThreadId);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : String(err));
    } finally {
      reactionBusyRef.current = null;
    }
  };

  const startDm = async (profile: ChatSearchProfile) => {
    setCreatingThread(true);
    setChatError(null);
    try {
      const { data, error } = await supabase.rpc('chat_create_dm', { p_target_profile_id: profile.mc_profile_id });
      if (error) throw error;
      await loadThreads();
      if (typeof data === 'string') setActiveThreadId(data);
      setCreateMode('none');
    } catch (err) {
      setChatError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingThread(false);
    }
  };

  const createGroup = async () => {
    const cleanTitle = groupTitle.trim();
    if (!cleanTitle || groupMembers.length === 0) return;

    setCreatingThread(true);
    setChatError(null);
    try {
      const { data, error } = await supabase.rpc('chat_create_group', {
        p_title: cleanTitle,
        p_member_profile_ids: groupMembers.map((member) => member.mc_profile_id)
      });
      if (error) throw error;
      await loadThreads();
      if (typeof data === 'string') setActiveThreadId(data);
      setCreateMode('none');
      setGroupTitle('');
      setGroupMembers([]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingThread(false);
    }
  };

  const sendFriendRequest = async (profileId: string) => {
    setSendingFriendRequest(true);
    setChatError(null);
    try {
      const { error } = await supabase.rpc('chat_send_friend_request', { p_target_profile_id: profileId });
      if (error) throw error;
      await loadSocialBundle();
    } catch (err) {
      setChatError(err instanceof Error ? err.message : String(err));
    } finally {
      setSendingFriendRequest(false);
    }
  };

  const respondToFriendRequest = async (requestId: string, action: 'accepted' | 'declined') => {
    setChatError(null);
    const { error } = await supabase.rpc('chat_respond_friend_request', {
      p_request_id: requestId,
      p_action: action
    });
    if (error) {
      setChatError(error.message);
      return;
    }
    await loadSocialBundle();
  };

  const markNotificationRead = async (notificationId: number) => {
    const { error } = await supabase.rpc('chat_mark_notifications_read', { p_notification_id: notificationId });
    if (!error) await loadSocialBundle();
  };

  const markAllNotificationsRead = async () => {
    const { error } = await supabase.rpc('chat_mark_notifications_read', { p_notification_id: null });
    if (!error) await loadSocialBundle();
  };

  if (!authState) {
    return (
      <div className="mx-auto max-w-[960px] min-h-full px-4 py-8">
        <div className="g-panel-strong p-8 text-center">
          <h1 className="text-4xl font-black text-white">Social</h1>
          <p className="mt-3 text-white/62">Sign in with Microsoft first, then your MC username will be used automatically.</p>
          <button
            onClick={() => { void startLogin(); }}
            disabled={loading}
            className="mt-6 g-btn-accent h-11 px-5 text-xs font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />}
            {loading ? 'Starting login...' : 'Sign In'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1550px] min-h-full px-4 py-4">
      <div className="g-panel-strong border overflow-hidden">
        <div className="grid lg:grid-cols-[340px_minmax(0,1fr)] min-h-[78vh]">
          <aside className="border-r border-white/10 bg-black/20">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <p className="text-sm font-black text-white">Social</p>
              <div className="flex items-center gap-1.5">
                <button className="g-btn h-8 w-8 inline-flex items-center justify-center" onClick={() => setCreateMode(createMode === 'dm' ? 'none' : 'dm')}><MessageSquarePlus size={14} /></button>
                <button className="g-btn h-8 w-8 inline-flex items-center justify-center" onClick={() => setCreateMode(createMode === 'group' ? 'none' : 'group')}><Users size={14} /></button>
                <button className="g-btn h-8 w-8 inline-flex items-center justify-center" onClick={() => setSocialTab('friends')}><UserPlus size={14} /></button>
              </div>
            </div>

            <div className="flex border-b border-white/10 px-1.5 py-1.5 gap-1.5">
              <button
                onClick={() => setSocialTab('chat')}
                className={`h-9 flex-1 rounded-lg text-sm font-bold ${socialTab === 'chat' ? 'g-btn-accent' : 'g-btn'}`}
              >
                Chat
              </button>
              <button
                onClick={() => setSocialTab('friends')}
                className={`h-9 flex-1 rounded-lg text-sm font-bold inline-flex items-center justify-center gap-1.5 ${socialTab === 'friends' ? 'g-btn-accent' : 'g-btn'}`}
              >
                Friends
                {socialBadgeCount > 0 && <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black text-white">{socialBadgeCount}</span>}
              </button>
            </div>

            <div className="px-3 py-2 border-b border-white/10">
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2">
                <Search size={14} className="text-white/55" />
                <input
                  value={profileSearch}
                  onChange={(event) => setProfileSearch(event.target.value)}
                  placeholder={socialTab === 'chat' ? 'Search users for DM or group...' : 'Find users to add...'}
                  className="h-9 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
                />
              </div>
            </div>

            {createMode !== 'none' && socialTab === 'chat' && (
              <div className="px-3 py-2 border-b border-white/10 space-y-2">
                {createMode === 'group' && (
                  <input
                    value={groupTitle}
                    onChange={(event) => setGroupTitle(event.target.value)}
                    placeholder="Group name"
                    className="g-input h-10 w-full px-3 text-sm outline-none"
                  />
                )}
                {createMode === 'group' && groupMembers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {groupMembers.map((member) => (
                      <button
                        key={member.mc_profile_id}
                        onClick={() => setGroupMembers((prev) => prev.filter((entry) => entry.mc_profile_id !== member.mc_profile_id))}
                        className="rounded-full border border-white/15 bg-white/[0.05] px-2 py-1 text-[11px] font-bold text-white/82"
                      >
                        {member.mc_username} x
                      </button>
                    ))}
                  </div>
                )}
                {createMode === 'group' && (
                  <button
                    onClick={() => { void createGroup(); }}
                    disabled={creatingThread || groupMembers.length === 0 || groupTitle.trim().length === 0}
                    className="g-btn-accent h-9 w-full text-[11px] font-extrabold uppercase tracking-[0.12em]"
                  >
                    {creatingThread ? 'Creating...' : `Create Group (${groupMembers.length + 1}/10)`}
                  </button>
                )}
              </div>
            )}

            <div className="max-h-[58vh] overflow-y-auto">
              {searchingProfiles && <p className="px-3 py-2 text-xs text-white/58">Searching...</p>}

              {socialTab === 'chat' && createMode === 'none' && threads.map((thread) => {
                const isActive = thread.thread_id === activeThreadId;
                const title = thread.kind === 'dm' ? thread.dm_other_username || 'Direct Message' : thread.title || 'Group';
                const preview = thread.last_message_deleted_at ? 'Message deleted' : thread.last_message_body || 'No messages yet';
                return (
                  <button key={thread.thread_id} onClick={() => setActiveThreadId(thread.thread_id)} className={`w-full border-b border-white/5 px-3 py-2.5 text-left transition ${isActive ? 'bg-[color-mix(in_srgb,var(--g-accent)_12%,transparent)]' : 'hover:bg-white/[0.04]'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold text-white">{title}</p>
                      {thread.unread_count > 0 && <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-black text-white">{thread.unread_count}</span>}
                    </div>
                    <p className="mt-1 truncate text-xs text-white/56">{preview}</p>
                  </button>
                );
              })}

              {socialTab === 'chat' && createMode !== 'none' && profileSearchResults.map((profile) => (
                <button
                  key={profile.mc_profile_id}
                  onClick={() => {
                    if (createMode === 'dm') {
                      void startDm(profile);
                      return;
                    }
                    setGroupMembers((prev) => {
                      if (prev.some((entry) => entry.mc_profile_id === profile.mc_profile_id)) return prev;
                      if (prev.length >= 9) return prev;
                      return [...prev, profile];
                    });
                  }}
                  className="w-full border-b border-white/5 px-3 py-2.5 text-left hover:bg-white/[0.04]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">{profile.mc_username}</p>
                    <span className={profile.is_online ? 'text-emerald-300 text-xs font-bold' : 'text-white/44 text-xs'}>{profile.is_online ? 'online' : formatLastSeen(profile.last_seen_at)}</span>
                  </div>
                </button>
              ))}

              {socialTab === 'friends' && (
                <div className="px-3 py-2 space-y-3">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-white/58">Notifications</p>
                      <button onClick={() => { void markAllNotificationsRead(); }} className="text-[10px] font-bold text-white/70">Mark all</button>
                    </div>
                    <div className="max-h-32 space-y-1 overflow-y-auto">
                      {notifications.length === 0 && <p className="text-xs text-white/45">No notifications yet.</p>}
                      {notifications.slice(0, 8).map((notification) => (
                        <button key={notification.id} onClick={() => { void markNotificationRead(notification.id); }} className="w-full rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-left hover:bg-white/[0.04]">
                          <p className={`text-xs font-bold ${notification.read_at ? 'text-white/62' : 'text-white'}`}>{notification.title}</p>
                          <p className="text-[11px] text-white/55 truncate">{notification.body || notification.type}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                    <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-white/58">Incoming Requests</p>
                    <div className="mt-2 space-y-1">
                      {incomingRequests.length === 0 && <p className="text-xs text-white/45">No pending requests.</p>}
                      {incomingRequests.map((request) => (
                        <div key={request.request_id} className="rounded-md border border-white/10 bg-black/20 px-2 py-2">
                          <p className="text-sm font-bold text-white">{request.sender_username}</p>
                          <p className="text-[11px] text-white/45">{formatDateLabel(request.created_at)}</p>
                          <div className="mt-2 flex gap-1.5">
                            <button onClick={() => { void respondToFriendRequest(request.request_id, 'accepted'); }} className="g-btn-accent h-8 flex-1 text-[11px] font-extrabold uppercase tracking-[0.1em] inline-flex items-center justify-center gap-1"><Check size={12} /> Accept</button>
                            <button onClick={() => { void respondToFriendRequest(request.request_id, 'declined'); }} className="g-btn h-8 flex-1 text-[11px] font-extrabold uppercase tracking-[0.1em] inline-flex items-center justify-center gap-1"><X size={12} /> Decline</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                    <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-white/58">Friends ({friends.length})</p>
                    <div className="mt-2 space-y-1">
                      {friends.map((friend) => (
                        <div key={friend.profile_id} className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-white">{friend.mc_username}</p>
                            <span className={friend.is_online ? 'text-emerald-300 text-xs font-bold' : 'text-white/42 text-xs'}>{friend.is_online ? 'online' : formatLastSeen(friend.last_seen_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {(profileSearch.trim().length > 0 || profileSearchResults.length > 0) && (
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-white/58">Add Friend</p>
                      <div className="mt-2 space-y-1">
                        {profileSearchResults.map((profile) => {
                          const alreadyFriend = friends.some((friend) => friend.profile_id === profile.mc_profile_id);
                          const pending = friendRequests.some((request) =>
                            request.status === 'pending' &&
                            ((request.sender_profile_id === authState.profile.id && request.receiver_profile_id === profile.mc_profile_id) ||
                              (request.receiver_profile_id === authState.profile.id && request.sender_profile_id === profile.mc_profile_id))
                          );
                          return (
                            <div key={profile.mc_profile_id} className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-semibold text-white">{profile.mc_username}</p>
                                  <p className="text-[11px] text-white/45">{profile.is_online ? 'online' : formatLastSeen(profile.last_seen_at)}</p>
                                </div>
                                <button
                                  onClick={() => { void sendFriendRequest(profile.mc_profile_id); }}
                                  disabled={alreadyFriend || pending || sendingFriendRequest}
                                  className="g-btn-accent h-8 px-3 text-[10px] font-extrabold uppercase tracking-[0.1em] disabled:opacity-45"
                                >
                                  {alreadyFriend ? 'Friend' : pending ? 'Pending' : 'Add'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {outgoingRequests.length > 0 && (
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-white/58">Outgoing</p>
                      <div className="mt-2 space-y-1">
                        {outgoingRequests.map((request) => (
                          <div key={request.request_id} className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
                            <p className="text-sm font-semibold text-white">{request.receiver_username}</p>
                            <p className="text-[11px] text-white/45">Pending</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>

          <main className="bg-black/10 min-h-0 flex flex-col">
            {!activeThread ? (
              <div className="flex flex-1 items-center justify-center text-center p-8">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/38">Social</p>
                  <h2 className="mt-2 text-3xl font-black text-white">Pick a chat on the left</h2>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/42">{activeThread.kind === 'dm' ? 'Direct Message' : 'Group Chat'}</p>
                    <h2 className="text-xl font-black text-white">{activeThread.kind === 'dm' ? activeThread.dm_other_username || 'Direct Message' : activeThread.title || 'Group'}</h2>
                  </div>
                  <button className="g-btn-accent h-9 px-4 text-[11px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-1.5">
                    <Gamepad2 size={13} /> Join Game
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                  {orderedMessages.map((message, index) => {
                    const isOwn = message.sender_profile_id === authState.profile.id;
                    const groupedReactions = reactionsByMessage.get(message.id);
                    const seenBy = members.filter((member) => member.profile_id !== authState.profile.id && (member.last_read_message_id || 0) >= message.id);
                    const prev = index > 0 ? orderedMessages[index - 1] : null;
                    const showDateSeparator = !prev || new Date(prev.created_at).toDateString() !== new Date(message.created_at).toDateString();

                    return (
                      <div key={message.id}>
                        {showDateSeparator && (
                          <div className="my-2 flex items-center gap-2 text-white/35 text-[11px]">
                            <div className="h-px flex-1 bg-white/10" />
                            <span>{formatDateLabel(message.created_at)}</span>
                            <div className="h-px flex-1 bg-white/10" />
                          </div>
                        )}

                        <article className={`max-w-[78%] rounded-lg border p-3 ${isOwn ? 'ml-auto border-[var(--g-accent)]/45 bg-[color-mix(in_srgb,var(--g-accent)_16%,transparent)]' : 'border-white/10 bg-white/[0.03]'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-extrabold text-white/90">{message.sender_username}</p>
                            <p className="text-[11px] text-white/48">{formatTime(message.created_at)} {message.edited_at && !message.deleted_at ? '(edited)' : ''}</p>
                          </div>

                          {message.reply_to_message_id && (
                            <div className="mt-2 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs text-white/66">
                              Replying to {message.reply_sender_username || 'message'}: {message.reply_body || 'deleted message'}
                            </div>
                          )}

                          {editingMessageId === message.id && !message.deleted_at ? (
                            <div className="mt-2 space-y-2">
                              <textarea
                                value={editingDraft}
                                onChange={(event) => setEditingDraft(event.target.value)}
                                rows={3}
                                className="g-input w-full resize-none px-3 py-2 text-sm outline-none"
                              />
                              <div className="flex gap-2">
                                <button onClick={() => { void saveEdit(message.id); }} disabled={savingEdit || editingDraft.trim().length === 0} className="g-btn-accent h-8 px-3 text-[11px] font-extrabold uppercase tracking-[0.12em]">{savingEdit ? 'Saving...' : 'Save'}</button>
                                <button onClick={() => { setEditingMessageId(null); setEditingDraft(''); }} className="g-btn h-8 px-3 text-[11px] font-extrabold uppercase tracking-[0.12em]">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/84">{message.deleted_at ? 'Message deleted' : message.body}</p>
                          )}

                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {groupedReactions && Array.from(groupedReactions.entries()).map(([emoji, entries]) => {
                              const ownReacted = entries.some((entry) => entry.profile_id === authState.profile.id);
                              return (
                                <button
                                  key={`${message.id}:${emoji}`}
                                  onClick={() => { void toggleReaction(message.id, emoji); }}
                                  className="rounded-full border px-2 py-1 text-xs"
                                  style={{
                                    borderColor: ownReacted ? 'color-mix(in srgb, var(--g-accent) 44%, transparent)' : 'rgba(255,255,255,0.2)',
                                    background: ownReacted ? 'color-mix(in srgb, var(--g-accent) 12%, transparent)' : 'rgba(255,255,255,0.03)'
                                  }}
                                >
                                  {emoji} {entries.length}
                                </button>
                              );
                            })}

                            {!message.deleted_at && QUICK_REACTIONS.map((emoji) => (
                              <button key={`${message.id}:quick:${emoji}`} onClick={() => { void toggleReaction(message.id, emoji); }} className="rounded-full border border-white/14 bg-white/[0.03] px-2 py-1 text-xs text-white/76">{emoji}</button>
                            ))}

                            {!message.deleted_at && <button onClick={() => setReplyToId(message.id)} className="rounded-md border border-white/14 bg-white/[0.03] px-2 py-1 text-[11px] font-bold text-white/76"><Reply size={12} className="inline" /> Reply</button>}
                            {isOwn && !message.deleted_at && <button onClick={() => { setEditingMessageId(message.id); setEditingDraft(message.body || ''); }} className="rounded-md border border-white/14 bg-white/[0.03] px-2 py-1 text-[11px] font-bold text-white/76"><Pencil size={12} className="inline" /> Edit</button>}
                            {isOwn && !message.deleted_at && <button onClick={() => { void deleteMessage(message.id); }} className="rounded-md border border-red-300/25 bg-red-300/[0.08] px-2 py-1 text-[11px] font-bold text-red-200"><Trash2 size={12} className="inline" /> Delete</button>}
                          </div>

                          {isOwn && seenBy.length > 0 && (
                            <p className="mt-1 text-[11px] text-white/50 inline-flex items-center gap-1"><CheckCheck size={12} /> Seen by {seenBy.map((member) => member.mc_username).join(', ')}</p>
                          )}
                        </article>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-white/10 px-4 py-3">
                  {replyToId && (
                    <div className="mb-2 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-xs text-white/70">
                      Replying to: {messageMap.get(replyToId)?.body || 'deleted message'}
                      <button onClick={() => setReplyToId(null)} className="ml-2 text-white/84">Cancel</button>
                    </div>
                  )}

                  <textarea
                    rows={2}
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void sendMessage();
                      }
                    }}
                    placeholder="Message Username"
                    className="g-input w-full resize-none px-3 py-2 text-sm outline-none"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-white/56 inline-flex items-center gap-1"><Bell size={12} /> {typingLabel || ' '}</p>
                    <button onClick={() => { void sendMessage(); }} disabled={sendingMessage || composer.trim().length === 0} className="g-btn-accent h-9 px-4 text-[11px] font-extrabold uppercase tracking-[0.12em] inline-flex items-center gap-2">
                      {sendingMessage ? <Loader2 size={14} className="animate-spin" /> : <Send size={13} />} Send
                    </button>
                  </div>
                </div>
              </>
            )}
          </main>
        </div>
      </div>

      {booting && <p className="mt-3 text-xs text-white/55">Preparing social...</p>}

      {chatError && (
        <div className="mt-3 rounded-xl border border-red-300/26 bg-red-300/[0.08] px-3 py-2 text-sm text-red-100">
          {chatError}
        </div>
      )}
    </div>
  );
}
