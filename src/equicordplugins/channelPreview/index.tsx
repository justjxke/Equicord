/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { EquicordDevs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";
import type { Channel, Message, ScrollerBaseRef } from "@vencord/discord-types";
import { ChannelType } from "@vencord/discord-types/enums";
import { findByCodeLazy, findComponentByCodeLazy } from "@webpack";
import { ChannelStore, GuildChannelStore, MessageActions, MessageStore, ReadStateStore, ScrollerThin, UserStore, useEffect, useRef, useState } from "@webpack/common";

import { resolvePreviewPosition, selectPreviewMessages, shouldLoadOlderMessages } from "./helpers";

const cl = classNameFactory("vc-channel-preview-");

const settings = definePluginSettings({
    messageFetchCount: {
        type: OptionType.NUMBER,
        description: "How many messages to fetch when opening the preview.",
        default: 20,
        isValid: (value: number | string) => {
            const parsed = Number(value);
            return Number.isInteger(parsed) && parsed > 0;
        },
    },
});

const MessageComponent = findComponentByCodeLazy("must not be a thread starter message") as React.ComponentType<{
    channel: Channel;
    message: Message;
    groupId?: string;
    id?: string;
    compact?: boolean;
}>;
const ThreadStarterMessage = findComponentByCodeLazy("must be a thread starter message") as React.ComponentType<{
    channel: Channel;
    message: Message;
    groupId?: string;
    id?: string;
    compact?: boolean;
}>;
const EmptyMessage = findComponentByCodeLazy("canManageRoles", "IS_JOIN_REQUEST_INTERVIEW_CHANNEL") as React.ComponentType<{ channel: Channel; }>;
const MessageDivider = findComponentByCodeLazy('"separator"', "isBeforeGroup") as React.ComponentType<{
    className?: string;
    isUnread?: boolean;
    isBeforeGroup?: boolean;
    children?: React.ReactNode;
}>;
const generateChannelStream = findByCodeLazy("oldestUnreadMessageId", "THREAD_STARTER_MESSAGE") as (input: {
    channel: Channel;
    messages: Message[];
    oldestUnreadMessageId?: string | null;
}) => Array<{ type: "MESSAGE" | "THREAD_STARTER_MESSAGE" | "DIVIDER"; content?: Message | string; groupId?: string; unreadId?: string; cut?: boolean; }>;

const HOVER_DELAY_MS = 1500;
const PREVIEW_WIDTH = 540;
const PREVIEW_HEIGHT = 480;
const VIEWPORT_GAP = 24;

const SUPPORTED_CHANNEL_TYPES = new Set([
    ChannelType.GUILD_TEXT,
    ChannelType.GUILD_ANNOUNCEMENT,
    ChannelType.DM,
    ChannelType.GROUP_DM,
    ChannelType.PUBLIC_THREAD,
    ChannelType.PRIVATE_THREAD,
    ChannelType.GUILD_VOICE,
    ChannelType.GUILD_STAGE_VOICE,
]);

type PreviewRect = {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
};

type PreviewTarget = {
    channelId: string;
    channel: Channel;
    rect: PreviewRect;
};

type PreviewState = {
    target: PreviewTarget | null;
    loadingOlder: boolean;
};

type MessageCollection = {
    _array?: Message[];
    hasMoreBefore?: boolean;
    hasMoreAfter?: boolean;
    length: number;
    toArray?: () => Message[];
};

type StreamDivider = { type: "DIVIDER"; content: string; cut?: boolean; unreadId?: string; };
type StreamMessage = { type: "MESSAGE" | "THREAD_STARTER_MESSAGE"; content: Message; groupId?: string; unreadId?: string; };
type StreamEmpty = { type: "EMPTY_MESSAGE"; };
type StreamItem = StreamDivider | StreamMessage | StreamEmpty;

const hoverTimers = new Map<string, ReturnType<typeof setTimeout>>();
const previewListeners = new Set<() => void>();
const previewNodeListeners = new Map<string, { node: HTMLElement; wheel: (event: WheelEvent) => void; }>();
let previewState: PreviewState = {
    target: null,
    loadingOlder: false,
};
let previewOpenToken = 0;

const previewStoreScroller: { current: ScrollerBaseRef | null; } = { current: null };

function emitPreviewChange() {
    for (const listener of previewListeners) listener();
}

function setPreviewState(patch: Partial<PreviewState>) {
    previewState = { ...previewState, ...patch };
    emitPreviewChange();
}

function usePreviewState() {
    const [state, setState] = useState(previewState);

    useEffect(() => {
        const listener = () => setState(previewState);
        previewListeners.add(listener);
        return () => {
            previewListeners.delete(listener);
        };
    }, []);

    return state;
}

function getMessageArray(collection: MessageCollection | null | undefined): Message[] {
    return collection?.toArray?.() ?? collection?._array ?? [];
}

function isSupportedChannel(channel?: Channel | null) {
    return Boolean(channel && SUPPORTED_CHANNEL_TYPES.has(channel.type));
}

function getPreviewMessages(channelId: string) {
    return getMessageArray(MessageStore.getMessages(channelId) as MessageCollection);
}

function getChannelName(channel: Channel) {
    const resolvedChannel = ChannelStore.getChannel(channel.id) ?? channel;

    if (resolvedChannel.isThread?.()) {
        const threadParent = resolvedChannel.parent_id ? ChannelStore.getChannel(resolvedChannel.parent_id) : null;
        if (resolvedChannel.name) return resolvedChannel.name;
        if (threadParent?.name) return threadParent.name;
    }

    if (resolvedChannel.guild_id) {
        const disambiguation = GuildChannelStore.getTextChannelNameDisambiguations(resolvedChannel.guild_id)?.[resolvedChannel.id];
        if (disambiguation?.name) return disambiguation.name;
    }

    if (resolvedChannel.name) return resolvedChannel.name;

    if (resolvedChannel.isGroupDM?.()) return "Group DM";

    if (resolvedChannel.isDM?.()) {
        const recipientId = resolvedChannel.recipients?.[0];
        const recipient = recipientId ? UserStore.getUser(recipientId) : null;
        return recipient?.globalName ?? recipient?.username ?? "Direct Message";
    }

    return "Channel";
}

function getPreviewPosition(rect: PreviewRect) {
    if (typeof window === "undefined") {
        return {
            top: rect.top,
            left: rect.right + VIEWPORT_GAP,
        };
    }

    const position = resolvePreviewPosition(rect, window.innerWidth, window.innerHeight, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    return {
        top: position.top,
        left: position.left,
    };
}

function getPreviewScrimLeft(rect: PreviewRect) {
    return Math.max(0, rect.right + VIEWPORT_GAP);
}

function getMessageFetchCount() {
    return Math.max(1, Math.trunc(settings.store.messageFetchCount));
}

async function loadInitialMessages(channelId: string) {
    const messages = getPreviewMessages(channelId);
    const fetchCount = getMessageFetchCount();
    if (messages.length >= fetchCount) return;
    await MessageActions.fetchMessages({ channelId, limit: fetchCount });
    emitPreviewChange();
}

async function loadOlderMessages(channelId: string) {
    const messages = getPreviewMessages(channelId);
    const oldest = messages[0];
    if (!oldest) return;

    setPreviewState({ loadingOlder: true });
    try {
        await MessageActions.fetchMessages({
            channelId,
            limit: getMessageFetchCount(),
            before: oldest.id,
        });
        emitPreviewChange();
    } finally {
        setPreviewState({ loadingOlder: false });
    }
}

function schedulePreview(channel: Channel, rect: PreviewRect) {
    if (!isSupportedChannel(channel)) return;
    cancelPreview(channel.id);

    const token = ++previewOpenToken;
    hoverTimers.set(channel.id, setTimeout(() => {
        hoverTimers.delete(channel.id);
        void (async () => {
            await loadInitialMessages(channel.id);
            if (token !== previewOpenToken) return;
            setPreviewState({ target: { channelId: channel.id, channel, rect } });
        })();
    }, HOVER_DELAY_MS));
}

function cancelPreview(channelId: string) {
    const timer = hoverTimers.get(channelId);
    if (timer) {
        clearTimeout(timer);
        hoverTimers.delete(channelId);
    }

    previewOpenToken++;

    if (previewState.target?.channelId === channelId) {
        setPreviewState({ target: null, loadingOlder: false });
    }
}

function onChannelEnter(event: React.MouseEvent<HTMLElement>, channel?: Channel | null) {
    if (!channel || !isSupportedChannel(channel)) return;
    const target = event.currentTarget.getBoundingClientRect();
    const node = event.currentTarget;

    const existing = previewNodeListeners.get(channel.id);
    if (existing?.node !== node) {
        if (existing) {
            existing.node.removeEventListener("wheel", existing.wheel);
        }

        const wheel = (wheelEvent: WheelEvent) => {
            if (previewState.target?.channelId !== channel.id) return;
            const scroller = previewStoreScroller.current;
            if (!scroller) return;

            const nextPosition = Math.max(0, scroller.getDistanceFromTop() + wheelEvent.deltaY);
            scroller.scrollTo({ to: nextPosition });
            const collection = MessageStore.getMessages(channel.id) as MessageCollection;
            if (shouldLoadOlderMessages(nextPosition, Boolean(collection?.hasMoreBefore), previewState.loadingOlder)) {
                void loadOlderMessages(channel.id);
            }
            wheelEvent.preventDefault();
            wheelEvent.stopPropagation();
        };

        node.addEventListener("wheel", wheel, { passive: false });
        previewNodeListeners.set(channel.id, { node, wheel });
    }

    schedulePreview(channel, {
        top: target.top,
        left: target.left,
        right: target.right,
        bottom: target.bottom,
        width: target.width,
        height: target.height,
    });
}

function onChannelLeave(event: React.MouseEvent<HTMLElement>, channel?: Channel | null) {
    if (!channel) return;
    const existing = previewNodeListeners.get(channel.id);
    if (existing?.node === event.currentTarget) {
        existing.node.removeEventListener("wheel", existing.wheel);
        previewNodeListeners.delete(channel.id);
    }
    cancelPreview(channel.id);
}

function PreviewMessageList({ channel }: { channel: Channel; }) {
    const collection = MessageStore.getMessages(channel.id) as MessageCollection;
    const fetchCount = getMessageFetchCount();
    const messages = selectPreviewMessages(getMessageArray(collection), fetchCount);
    const oldestUnreadMessageId = ReadStateStore.getOldestUnreadMessageId(channel.id);
    const stream: StreamItem[] = messages.length
        ? (generateChannelStream({ channel, messages, oldestUnreadMessageId }) as StreamItem[])
        : [{ type: "EMPTY_MESSAGE" as const }];

    return (
        <div className={cl("scroller-wrap")}>
            {stream.map((item, index) => {
                if (item.type === "EMPTY_MESSAGE") {
                    return <EmptyMessage key="empty" channel={channel} />;
                }

                if (item.type === "DIVIDER") {
                    const divider = item as StreamDivider;
                    const next = stream[index + 1];
                    const isBeforeGroup = Boolean(next && next.type === "MESSAGE" && (next as StreamMessage).content.id === (next as StreamMessage).groupId);
                    return (
                        <MessageDivider
                            key={`divider-${index}`}
                            className={divider.cut ? cl("divider-cut") : ""}
                            isUnread={Boolean(divider.unreadId)}
                            isBeforeGroup={isBeforeGroup}
                        >
                            {divider.content}
                        </MessageDivider>
                    );
                }

                const message = item as StreamMessage;
                const MessageRow = message.type === "THREAD_STARTER_MESSAGE" ? ThreadStarterMessage : MessageComponent;
                return (
                    <MessageRow
                        key={message.content.id}
                        channel={channel}
                        message={message.content}
                        groupId={message.groupId}
                        id={`chat-messages-${message.content.id}`}
                        compact={false}
                    />
                );
            })}
        </div>
    );
}

const ChannelPreviewOverlay = ErrorBoundary.wrap(() => {
    const { target, loadingOlder } = usePreviewState();
    const scrollerRef = useRef<ScrollerBaseRef>(null);
    const channel = target?.channel ? (ChannelStore.getChannel(target.channel.id) ?? target.channel) : null;
    const collection = channel ? (MessageStore.getMessages(channel.id) as MessageCollection) : null;
    const fetchCount = getMessageFetchCount();
    const messages = channel ? selectPreviewMessages(getMessageArray(collection), fetchCount) : [];
    const showPreviewDivider = Boolean(channel && (collection?.hasMoreBefore || collection?.hasMoreAfter || messages.length > fetchCount));

    useEffect(() => {
        previewStoreScroller.current = scrollerRef.current;
        return () => {
            if (previewStoreScroller.current === scrollerRef.current) {
                previewStoreScroller.current = null;
            }
        };
    }, [target?.channelId]);

    useEffect(() => {
        scrollerRef.current?.scrollToBottom();
    }, [target?.channelId]);

    if (!target || !channel) return null;

    const position = getPreviewPosition(target.rect);

    return (
        <div className={cl("overlay")}>
            <div
                className={cl("scrim")}
                style={{
                    left: getPreviewScrimLeft(target.rect),
                }}
            />
            <div
                className={cl("preview")}
                style={{
                    top: position.top,
                    left: position.left,
                    width: PREVIEW_WIDTH,
                    height: PREVIEW_HEIGHT,
                }}
            >
                <div className={cl("header")}>
                    <span className={cl("header-name")}>{getChannelName(channel)}</span>
                </div>
                {showPreviewDivider && (
                    <MessageDivider className={cl("divider-top")} isUnread={false} isBeforeGroup={false}>
                        Displaying last {fetchCount} messages
                    </MessageDivider>
                )}
                <ScrollerThin
                    className={cl("scroller")}
                    ref={scrollerRef}
                    orientation="vertical"
                    onScroll={() => {
                        const scroller = scrollerRef.current;
                        if (!scroller) return;
                        const collection = MessageStore.getMessages(channel.id) as MessageCollection;
                        if (!shouldLoadOlderMessages(scroller.getDistanceFromTop(), Boolean(collection?.hasMoreBefore), loadingOlder)) return;
                        void loadOlderMessages(channel.id);
                    }}
                >
                    <PreviewMessageList channel={channel} />
                </ScrollerThin>
            </div>
        </div>
    );
}, { noop: true });

function renderPreviewHost() {
    return [<ChannelPreviewOverlay key="channel-preview-overlay" />];
}

export default definePlugin({
    name: "ChannelPreview",
    description: "Shows recent messages when you hover a channel without switching to it.",
    tags: ["Chat", "Servers"],
    authors: [EquicordDevs.justjxke],
    settings,
    patches: [
        {
            find: 'onMouseEnter:D||U?this.handleMouseEnter:void 0,onMouseLeave:D||U?this.handleMouseLeave:void 0',
            replacement: {
                match: /onMouseEnter:D\|\|U\?this\.handleMouseEnter:void 0,onMouseLeave:D\|\|U\?this\.handleMouseLeave:void 0/,
                replace: 'onMouseEnter:e=>{$self.onChannelEnter(e,this.props.channel);this.handleMouseEnter?.(e)},onMouseLeave:e=>{$self.onChannelLeave(e,this.props.channel);this.handleMouseLeave?.(e)}'
            }
        },
        {
            find: 'hideChannelList:a||r||m,hideSidebar:!s',
            replacement: {
                match: /hideChannelList:a\|\|r\|\|m,hideSidebar:!s\}\),(?=\(0,i\.jsx\)\("div",\{className:eV\.MY,)/,
                replace: "hideChannelList:a||r||m,hideSidebar:!s}),$self.renderPreviewHost(),"
            }
        },
        {
            find: "PrivateChannel.renderAvatar",
            replacement: {
                match: /(?<=,subText:\i\.isSystemDM\(\)\?.{0,500}:null)(?=,name:)/,
                replace: ",onMouseEnter:e=>$self.onChannelEnter(e,arguments[0].channel),onMouseLeave:e=>$self.onChannelLeave(e,arguments[0].channel)"
            }
        },
        {
            find: "shouldShowThreadsPopout",
            replacement: {
                match: /onMouseEnter:D\|\|U\?this\.handleMouseEnter:void 0,onMouseLeave:D\|\|U\?this\.handleMouseLeave:void 0/,
                replace: 'onMouseEnter:e=>{$self.onChannelEnter(e,arguments[0].thread);this.handleMouseEnter?.(e)},onMouseLeave:e=>{$self.onChannelLeave(e,arguments[0].thread);this.handleMouseLeave?.(e)}'
            }
        }
    ],
    renderPreviewHost,
    onChannelEnter,
    onChannelLeave,
});
