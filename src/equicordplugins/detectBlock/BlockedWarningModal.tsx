/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { Flex } from "@components/Flex";
import { WarningIcon } from "@components/Icons";
import { classNameFactory } from "@utils/css";
import { closeModal, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { humanFriendlyJoin } from "@utils/text";
import { User } from "@vencord/discord-types";
import { Avatar, UserStore } from "@webpack/common";

type WarningVariant = "voiceJoin" | "voiceLeave" | "group";

const cl = classNameFactory("vc-detect-block-");

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
    if (names.length === 1) return `${names[0]} is here.`;
    return `${humanFriendlyJoin(names)} are here.`;
}

function getWarningCopy(variant: WarningVariant) {
    switch (variant) {
        case "voiceJoin":
            return {
                headerText: "Join voice?",
                descriptionText: "Someone you've blocked is here. If you join, they will still be blocked.",
                confirmText: "Join",
                cancelText: "Don't join"
            };
        case "voiceLeave":
            return {
                headerText: "Leave voice?",
                descriptionText: "Someone you've blocked is here. If you stay, they will still be blocked.",
                confirmText: "Leave",
                cancelText: "Stay"
            };
        case "group":
            return {
                headerText: "Join group?",
                descriptionText: "Someone you've blocked is here. If you join, they will still be blocked.",
                confirmText: "Join",
                cancelText: "Don't join"
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

    const key = openModal(modalProps => (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM} className={cl("root")}>
            <ModalHeader className={cl("header")}>
                <BaseText size="lg" weight="bold" style={{ flexGrow: 1 }}>
                    {copy.headerText}
                </BaseText>
                <ModalCloseButton onClick={() => closeModal(key)} />
            </ModalHeader>
            <ModalContent className={cl("content")}>
                <Flex flexDirection="column" style={{ gap: 12 }}>
                    <Flex align="center" style={{ gap: 12 }}>
                        <div className={cl("avatar")}>
                            {getAvatar(avatarUser, blockedUserIds[0] ?? "")}
                        </div>
                        <BaseText>{getBlockedSubjectText(blockedNames)}</BaseText>
                    </Flex>
                    <Flex align="center" style={{ gap: 12 }}>
                        <div className={cl("warning-icon")}>
                            <WarningIcon height={16} width={16} />
                        </div>
                        <BaseText>You will be able to hear each other.</BaseText>
                    </Flex>
                    <BaseText>{copy.descriptionText}</BaseText>
                </Flex>
            </ModalContent>
            <ModalFooter className={cl("footer")}>
                <Button
                    color={Button.Colors.PRIMARY}
                    onClick={() => closeModal(key)}
                >
                    {copy.cancelText}
                </Button>
                <Button
                    color={Button.Colors.BRAND}
                    onClick={() => {
                        closeModal(key);
                        void onConfirm();
                    }}
                >
                    {copy.confirmText}
                </Button>
            </ModalFooter>
        </ModalRoot>
    ));

    return key;
}
