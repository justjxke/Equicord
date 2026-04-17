/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Constants, RestAPI, UserProfileStore } from "@webpack/common";

export type BlockDetectionState = "unknown" | "blockedYou" | "clear";

export interface DetectionRecord {
    state: BlockDetectionState;
    checkedAt: number;
}

type Subscriber = () => void;

const UNKNOWN_TTL_MS = 5 * 60 * 1000;
const KNOWN_TTL_MS = 30 * 60 * 1000;
const MAX_CONCURRENT_REQUESTS = 4;

const cache = new Map<string, DetectionRecord>();
const inflight = new Map<string, Promise<BlockDetectionState>>();
const subscribers = new Map<string, Set<Subscriber>>();
const queue: Array<() => void> = [];

let activeRequests = 0;

function getTtlMs(state: BlockDetectionState) {
    return state === "unknown" ? UNKNOWN_TTL_MS : KNOWN_TTL_MS;
}

function isFresh(record: DetectionRecord | undefined) {
    return record != null && Date.now() - record.checkedAt < getTtlMs(record.state);
}

function notify(userId: string) {
    subscribers.get(userId)?.forEach(listener => listener());
}

function setRecord(userId: string, state: BlockDetectionState) {
    cache.set(userId, {
        state,
        checkedAt: Date.now()
    });
    notify(userId);
    return state;
}

function dequeue() {
    while (activeRequests < MAX_CONCURRENT_REQUESTS) {
        const next = queue.shift();
        if (!next) return;
        activeRequests++;
        next();
    }
}

function runQueued<T>(task: () => Promise<T>) {
    return new Promise<T>((resolve, reject) => {
        queue.push(() => {
            task().then(resolve, reject).finally(() => {
                activeRequests--;
                dequeue();
            });
        });

        dequeue();
    });
}

async function fetchState(userId: string): Promise<BlockDetectionState> {
    if (UserProfileStore.getUserProfile(userId) != null) {
        return setRecord(userId, "clear");
    }

    try {
        const { body } = await RestAPI.get({
            url: Constants.Endpoints.USER_PROFILE(userId),
            query: {
                with_mutual_guilds: false,
                with_mutual_friends_count: false
            },
            oldFormErrors: true
        });

        return setRecord(userId, body.user_profile == null ? "blockedYou" : "clear");
    } catch (error) {
        const status = typeof error === "object" && error != null && "status" in error
            ? Reflect.get(error, "status")
            : void 0;

        if (status === 404) {
            return setRecord(userId, "unknown");
        }

        return setRecord(userId, "unknown");
    }
}

export function getDetectionRecord(userId: string) {
    const record = cache.get(userId);
    if (!isFresh(record)) return void 0;
    return record;
}

export function getDetectionState(userId: string): BlockDetectionState {
    return getDetectionRecord(userId)?.state ?? "unknown";
}

export function primeClear(userId: string) {
    if (getDetectionState(userId) === "blockedYou") return;
    setRecord(userId, "clear");
}

export function subscribeToDetection(userId: string, listener: Subscriber) {
    let set = subscribers.get(userId);
    if (!set) {
        set = new Set();
        subscribers.set(userId, set);
    }

    set.add(listener);

    return () => {
        const next = subscribers.get(userId);
        if (!next) return;
        next.delete(listener);
        if (next.size === 0) subscribers.delete(userId);
    };
}

export function ensureDetection(userId: string) {
    const record = cache.get(userId);
    if (record && isFresh(record)) {
        return Promise.resolve(record.state);
    }

    const pending = inflight.get(userId);
    if (pending) return pending;

    const request = runQueued(() => fetchState(userId))
        .finally(() => inflight.delete(userId));

    inflight.set(userId, request);
    return request;
}

export async function detectBlockedUsers(userIds: string[]) {
    const uniqueIds = Array.from(new Set(userIds)).filter(Boolean);
    if (!uniqueIds.length) return [] as string[];

    const states = await Promise.all(uniqueIds.map(async userId => ({
        userId,
        state: await ensureDetection(userId)
    })));

    return states
        .filter(result => result.state === "blockedYou")
        .map(result => result.userId);
}

export function clearDetectionState() {
    cache.clear();
    inflight.clear();
    subscribers.clear();
    queue.length = 0;
    activeRequests = 0;
}
