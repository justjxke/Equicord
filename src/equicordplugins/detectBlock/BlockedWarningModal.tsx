/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Avatar, UserStore } from "@webpack/common";
import { WarningIcon } from "@components/Icons";
import { closeModal, openModal } from "@utils/modal";
import { humanFriendlyJoin } from "@utils/text";
import { User } from "@vencord/discord-types";
import { findByPropsLazy } from "@webpack";

const NativeExpressiveModal = findByPropsLazy("onDismissAndStay", "leaveButtonText", "stayButtonText") as {
    A: (props: NativeExpressiveModalProps) => JSX.Element;
};

type NativeExpressiveModalProps = {
    headerText: string;
    descriptionText?: string;
    infoRows: Array<{
        icon: JSX.Element;
        text: string;
        className?: string;
    }>;
    onDismissAndStay: () => void;
    onDismissAndLeave: () => void;
    stayButtonText: string;
    leaveButtonText: string;
    transitionState?: unknown;
    impression?: string;
};

type WarningVariant = "voiceJoin" | "voiceLeave" | "group";

function getPrimaryUser(userIds: string[]) {
    return userIds
        .map(id => UserStore.getUser(id))
        .find((user): user is User => Boolean(user));
}

function getAvatar(user: User | undefined, fallbackId: string) {
    return (
        <Avatar
            src={user?.getAvatarURL(undefined, 24, true) ?? UserStore.getUser(fallbackId)?.getAvatarURL(undefined, 24, true) ?? UserStore.getUser(fallbackId)?.getAvatarURL(undefined, 24, false) ?? undefined}
            size="SIZE_24"
        />
    );
}

function getBlockedSubjectText(names: string[]) {
    if (names.length === 1) return `${names[0]} is here`;
    return `${humanFriendlyJoin(names)} are here`;
}

function getWarningCopy(variant: WarningVariant) {
    switch (variant) {
        case "voiceJoin":
            return {
                headerText: "Join voice?",
                descriptionText: "Someone you've blocked is here. If you join, they will still be blocked.",
                leaveButtonText: "Join",
                stayButtonText: "Don't join"
            };
        case "voiceLeave":
            return {
                headerText: "Leave voice?",
                descriptionText: "Someone you've blocked is here. If you stay, they will still be blocked.",
                leaveButtonText: "Leave",
                stayButtonText: "Stay"
            };
        case "group":
            return {
                headerText: "Join group?",
                descriptionText: "Someone you've blocked is here. If you join, they will still be blocked.",
                leaveButtonText: "Join",
                stayButtonText: "Don't join"
            };
    }
}

export function openBlockedWarningModal({
    blockedNames,
    blockedUserIds,
    onConfirm,
    variant
}: {
    blockedNames: string[];
    blockedUserIds: string[];
    onConfirm: () => void | Promise<void>;
    variant: WarningVariant;
}) {
    const copy = getWarningCopy(variant);
    const avatarUser = getPrimaryUser(blockedUserIds);
    const infoRows = [
        {
            icon: getAvatar(avatarUser, blockedUserIds[0] ?? ""),
            text: getBlockedSubjectText(blockedNames)
        },
        {
            icon: <WarningIcon height={16} width={16} />,
            text: "You will be able to hear each other"
        }
    ];

    const key = openModal(modalProps => (
        <NativeExpressiveModal.A
            transitionState={modalProps.transitionState}
            headerText={copy.headerText}
            descriptionText={copy.descriptionText}
            infoRows={infoRows}
            stayButtonText={copy.stayButtonText}
            leaveButtonText={copy.leaveButtonText}
            onDismissAndStay={() => closeModal(key)}
            onDismissAndLeave={() => {
                closeModal(key);
                void onConfirm();
            }}
        />
    ));

    return key;
}
