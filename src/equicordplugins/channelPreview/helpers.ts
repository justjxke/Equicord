/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Message } from "@vencord/discord-types";

export type PreviewPosition = {
    top: number;
    left: number;
    width: number;
    height: number;
};

export function selectPreviewMessages(messages: Message[], count: number): Message[] {
    if (messages.length <= count) return messages;
    return messages.slice(-count);
}

export function shouldLoadOlderMessages(scrollTop: number, hasMoreBefore: boolean, loadingOlder: boolean): boolean {
    return !loadingOlder && hasMoreBefore && scrollTop < 200;
}

export function resolvePreviewPosition(rect: Pick<DOMRect, "top" | "left" | "width" | "height" | "bottom" | "right">, viewportWidth: number, viewportHeight: number, previewWidth: number, previewHeight: number): PreviewPosition {
    const gap = 24;
    const left = Math.min(rect.right + gap, viewportWidth - previewWidth - gap);
    const top = Math.min(Math.max(rect.top - 8, gap), viewportHeight - previewHeight - gap);

    return {
        top,
        left: Math.max(gap, left),
        width: previewWidth,
        height: previewHeight
    };
}
