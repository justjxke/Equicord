/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { EquicordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import { Channel, User } from "@vencord/discord-types";
import { ChannelType } from "@vencord/discord-types/enums";
import { findByPropsLazy } from "@webpack";
import { ChannelStore, UserProfileStore, UserStore, VoiceStateStore } from "@webpack/common";

import { openBlockedWarningModal } from "./BlockedWarningModal";
import { DetectBlockBadge } from "./DetectBlockBadge";
import { clearDetectionState, detectBlockedUsers, primeClear } from "./detection";

interface VoiceState {
    userId: string;
    channelId?: string;
}

const VoiceChannelActions = findByPropsLazy("selectVoiceChannel") as {
    selectVoiceChannel(channelId: string | null): unknown;
};

const warnedVoiceKeys = new Set<string>();
const warnedGroupChannels = new Set<string>();

function getDisplayName(user: User | undefined) {
    if (!user) return "Unknown user";
    return user.globalName || user.username;
}

function getBlockedVoiceUserIds(channelId: string) {
    const states = VoiceStateStore.getVoiceStatesForChannel(channelId) as Record<string, VoiceState> | null;
    if (!states) return [];

    const currentUserId = UserStore.getCurrentUser().id;
    return Object.values(states)
        .map(state => state.userId)
        .filter(userId => userId && userId !== currentUserId);
}

async function getBlockedUsers(userIds: string[]) {
    const blockedIds = await detectBlockedUsers(userIds);
    if (!blockedIds.length) return [];

    return blockedIds.map(userId => ({
        userId,
        name: getDisplayName(UserStore.getUser(userId))
    }));
}

function shouldWarnForVoiceChannel(channel: Channel | undefined) {
    return channel != null && (
        channel.type === ChannelType.GUILD_VOICE ||
        channel.type === ChannelType.GUILD_STAGE_VOICE ||
        channel.type === ChannelType.DM ||
        channel.type === ChannelType.GROUP_DM
    );
}

async function maybeWarnBeforeVoiceJoin(channelId: string, proceed: () => unknown) {
    const channel = ChannelStore.getChannel(channelId);
    if (!shouldWarnForVoiceChannel(channel)) {
        return proceed();
    }

    const blockedUsers = await getBlockedUsers(getBlockedVoiceUserIds(channelId));
    if (!blockedUsers.length) {
        return proceed();
    }

    openBlockedWarningModal({
        blockedNames: blockedUsers.map(user => user.name),
        blockedUserIds: blockedUsers.map(user => user.userId),
        variant: "voiceJoin",
        onConfirm: () => {
            void proceed();
        }
    });
}

async function maybeWarnForCurrentVoiceChannel(channelId: string) {
    const blockedUsers = await getBlockedUsers(getBlockedVoiceUserIds(channelId));
    if (!blockedUsers.length) return;

    const warningKey = `${channelId}:${blockedUsers.map(user => user.userId).join(",")}`;
    if (warnedVoiceKeys.has(warningKey)) return;

    warnedVoiceKeys.add(warningKey);

    openBlockedWarningModal({
        blockedNames: blockedUsers.map(user => user.name),
        blockedUserIds: blockedUsers.map(user => user.userId),
        variant: "voiceLeave",
        onConfirm: () => {
            void VoiceChannelActions.selectVoiceChannel(null);
        }
    });
}

async function maybeWarnForGroupChannel(channelId: string) {
    const channel = ChannelStore.getChannel(channelId);
    if (channel?.type !== ChannelType.GROUP_DM) return;
    if (warnedGroupChannels.has(channelId)) return;

    const blockedUsers = await getBlockedUsers(channel.recipients);
    if (!blockedUsers.length) return;

    warnedGroupChannels.add(channelId);

    openBlockedWarningModal({
        blockedNames: blockedUsers.map(user => user.name),
        blockedUserIds: blockedUsers.map(user => user.userId),
        variant: "group",
        onConfirm: () => void 0
    });
}

let originalSelectVoiceChannel: typeof VoiceChannelActions.selectVoiceChannel | null = null;

export default definePlugin({
    name: "DetectBlock",
    description: "Detects users who have blocked you and warns when they appear in voice channels or group DMs.",
    authors: [EquicordDevs.justjxke],
    flux: {
        USER_PROFILE_FETCH_SUCCESS({ userProfile }: { userProfile: { user: User; user_profile: unknown | null; }; }) {
            const userId = userProfile.user.id;
            if (userProfile.user_profile != null && UserProfileStore.getUserProfile(userId) != null) {
                primeClear(userId);
            }
        },
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            const currentUserId = UserStore.getCurrentUser().id;
            const myState = VoiceStateStore.getVoiceStateForUser(currentUserId);
            if (!myState?.channelId) return;

            const joinedCurrentChannel = voiceStates.some(state =>
                state.userId !== currentUserId &&
                state.channelId === myState.channelId
            );

            if (!joinedCurrentChannel) return;

            void maybeWarnForCurrentVoiceChannel(myState.channelId);
        },
        CHANNEL_SELECT({ channelId }: { channelId?: string; }) {
            if (!channelId) return;
            const channel = ChannelStore.getChannel(channelId);
            if (channel?.type !== ChannelType.GROUP_DM) return;

            void maybeWarnForGroupChannel(channelId);
        }
    },
    start() {
        originalSelectVoiceChannel ??= VoiceChannelActions.selectVoiceChannel.bind(VoiceChannelActions);
        VoiceChannelActions.selectVoiceChannel = ((channelId: string | null) => {
            if (!originalSelectVoiceChannel || channelId == null) {
                return originalSelectVoiceChannel?.(channelId);
            }

            return maybeWarnBeforeVoiceJoin(channelId, () => originalSelectVoiceChannel?.(channelId));
        }) as typeof VoiceChannelActions.selectVoiceChannel;
    },
    stop() {
        if (originalSelectVoiceChannel) {
            VoiceChannelActions.selectVoiceChannel = originalSelectVoiceChannel;
        }

        warnedVoiceKeys.clear();
        warnedGroupChannels.clear();
        clearDetectionState();
    },
    renderNicknameIcon({ userId }) {
        return <DetectBlockBadge user={UserStore.getUser(userId)} isProfile />;
    },
    renderMemberListDecorator({ user }) {
        return <DetectBlockBadge user={user} isMemberList />;
    },
    renderMessageDecoration({ message }) {
        return <DetectBlockBadge user={message?.author} isMessage />;
    }
});
