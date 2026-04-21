/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { Flex } from "@components/Flex";
import { classNameFactory } from "@utils/css";
import { CloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { humanFriendlyJoin } from "@utils/text";
import { User } from "@vencord/discord-types";
import { Avatar, UserStore } from "@webpack/common";

type WarningVariant = "voiceJoin" | "voiceLeave" | "group";

type WarningCopy = {
    headerText: string;
    descriptionText: string;
    leftButtonText: string;
    rightButtonText: string;
    leftButtonConfirms: boolean;
    rightButtonConfirms: boolean;
};

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
            size="SIZE_32"
        />
    );
}

function getBlockedSubjectText(names: string[]) {
    const subject = names.length === 1 ? names[0] : humanFriendlyJoin(names);
    return {
        subject,
        suffix: names.length === 1 ? " is here" : " are here"
    };
}

function getWarningCopy(variant: WarningVariant): WarningCopy {
    switch (variant) {
        case "voiceJoin":
            return {
                headerText: "Join voice?",
                descriptionText: "Someone who has blocked you is here. If you join, they will still be blocked.",
                leftButtonText: "Join",
                rightButtonText: "Don't join",
                leftButtonConfirms: true,
                rightButtonConfirms: false
            };
        case "voiceLeave":
            return {
                headerText: "Leave voice?",
                descriptionText: "Someone you blocked has joined. If you leave, they will still be blocked.",
                leftButtonText: "Stay here",
                rightButtonText: "Leave",
                leftButtonConfirms: false,
                rightButtonConfirms: true
            };
        case "group":
            return {
                headerText: "Join group?",
                descriptionText: "People who have blocked you are here. Leave group?",
                leftButtonText: "Stay here",
                rightButtonText: "Leave",
                leftButtonConfirms: false,
                rightButtonConfirms: true
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
    const subjectText = getBlockedSubjectText(blockedNames);

    return openModal(modalProps => (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM} className={cl("root")}>
            <ModalHeader separator={false} className={cl("header")}>
                <div className={cl("stack")}>
                    <div className={cl("header-layout")}>
                        <div className={cl("header-leading")} />
                        <div className={cl("header-leading-spacer")} />
                        <div className={cl("header-main")}>
                            <div className={cl("header-graphic")}>
                                <div className={cl("header-graphic-container")}>
                                    <div className={cl("header-image-frame")}>
                                        <img
                                            className={cl("header-image")}
                                            alt=""
                                            draggable={false}
                                            src="https://cdn.discordapp.com/assets/content/f64aeb4eb878e4f0749f45b759fc3ee6f3a943329962bc573fcbe0ea7678870d.svg"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className={cl("header-trailing-spacer")} />
                        <div className={cl("header-trailing")}>
                            <CloseButton onClick={modalProps.onClose} />
                        </div>
                    </div>
                    <BaseText tag="h1" size="xl" weight="semibold" color="text-strong" className={cl("title")}>
                        {copy.headerText}
                    </BaseText>
                    <BaseText size="md" weight="normal" color="text-subtle" className={cl("subtitle")}>
                        {copy.descriptionText}
                    </BaseText>
                </div>
            </ModalHeader>

            <ModalContent className={cl("body")}>
                <main className={cl("body-inner")}>
                    <div className={cl("info-group")}>
                        <div className={cl("info-row")}>
                            <div className={cl("avatar-wrap")}>
                                {getAvatar(avatarUser, blockedUserIds[0] ?? "")}
                            </div>
                            <BaseText size="md" weight="medium" color="text-default" className={cl("row-text")}>
                                <BaseText tag="span" size="md" weight="semibold" color="text-default" className={cl("username")}>
                                    {subjectText.subject}
                                </BaseText>
                                {subjectText.suffix}
                            </BaseText>
                        </div>
                        <div className={cl("divider")} />
                        <div className={cl("info-row")}>
                            <div className={cl("icon-wrap")}>
                                <svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                                    <path fill="var(--interactive-icon-default)" fillRule="evenodd" d="M10 3.1a2.37 2.37 0 0 1 4 0l8.71 14.75c.84 1.41-.26 3.15-2 3.15H3.29c-1.74 0-2.84-1.74-2-3.15L9.99 3.1Zm3.25 14.65a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0ZM13.06 14l.37-5.94a1 1 0 0 0-1-1.06h-.87a1 1 0 0 0-1 1.06l.38 5.94a1.06 1.06 0 0 0 2.12 0Z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <BaseText size="md" weight="medium" color="text-default">
                                You can both hear each other
                            </BaseText>
                        </div>
                    </div>
                </main>
            </ModalContent>

            <ModalFooter className={cl("footer")}>
                <Flex className={cl("footer-stack")}>
                    <Button
                        variant="secondary"
                        className={cl("button")}
                        onClick={() => {
                            if (copy.leftButtonConfirms) void onConfirm();
                            modalProps.onClose();
                        }}
                    >
                        {copy.leftButtonText}
                    </Button>
                    <Button
                        variant="primary"
                        className={cl("button")}
                        onClick={() => {
                            if (copy.rightButtonConfirms) void onConfirm();
                            modalProps.onClose();
                        }}
                    >
                        {copy.rightButtonText}
                    </Button>
                </Flex>
            </ModalFooter>
        </ModalRoot>
    ));
}
