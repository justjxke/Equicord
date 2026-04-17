/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { BaseText } from "@components/BaseText";
import ErrorBoundary from "@components/ErrorBoundary";
import { classNameFactory } from "@utils/css";
import { EquicordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import { TextInput, useEffect, useMemo } from "@webpack/common";

const cl = classNameFactory("vc-expand-timeout-duration-");
const CUSTOM_DURATION = -1;
const MONTH_SECONDS = 30 * 24 * 60 * 60;
const WEEK_SECONDS = 7 * 24 * 60 * 60;
const MAX_TIMEOUT_SECONDS = 4 * WEEK_SECONDS;
let currentCustomDurationSeconds: number | null = null;
type CustomDurationOption = {
    __customDuration: true;
    valueOf(): number;
    toString(): string;
};
const CUSTOM_DURATION_OPTION: CustomDurationOption = {
    __customDuration: true,
    valueOf() {
        return currentCustomDurationSeconds ?? CUSTOM_DURATION;
    },
    toString() {
        return String(this.valueOf());
    }
};
const durationUnits: Record<string, number> = {
    s: 1,
    sec: 1,
    secs: 1,
    second: 1,
    seconds: 1,
    m: 60,
    min: 60,
    mins: 60,
    minute: 60,
    minutes: 60,
    h: 60 * 60,
    hr: 60 * 60,
    hrs: 60 * 60,
    hour: 60 * 60,
    hours: 60 * 60,
    d: 24 * 60 * 60,
    day: 24 * 60 * 60,
    days: 24 * 60 * 60,
    w: WEEK_SECONDS,
    week: WEEK_SECONDS,
    weeks: WEEK_SECONDS,
    mo: MONTH_SECONDS,
    mon: MONTH_SECONDS,
    month: MONTH_SECONDS,
    months: MONTH_SECONDS
};
const durationToken = /(\d+)\s*(mo(?:nths?)?|mon|months?|weeks?|week|days?|day|hours?|hour|hrs?|hr|minutes?|minute|mins?|min|seconds?|second|secs?|sec|w|d|h|m|s)/gi;

function isCustomDuration(value: number | string | CustomDurationOption) {
    return typeof value === "object"
        ? Boolean(value && "__customDuration" in value)
        : Number(value) === CUSTOM_DURATION;
}

function resolveDuration(selected: number | string | CustomDurationOption, customDurationText: string) {
    if (!isCustomDuration(selected)) return Number(selected);
    return parseCustomDuration(customDurationText) ?? currentCustomDurationSeconds;
}

function parseCustomDuration(value: string): number | null {
    return parseCustomDurationDetails(value).seconds;
}

function parseCustomDurationDetails(value: string): { seconds: number | null; tooLong: boolean; } {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return { seconds: null, tooLong: false };
    if (/^\d+$/.test(normalized)) {
        const seconds = Number(normalized);
        if (seconds <= 0) return { seconds: null, tooLong: false };
        return seconds > MAX_TIMEOUT_SECONDS
            ? { seconds: null, tooLong: true }
            : { seconds, tooLong: false };
    }

    let total = 0;
    let lastIndex = 0;
    let matched = false;

    for (const match of normalized.matchAll(durationToken)) {
        const [full, amount, unit] = match;
        if (match.index == null) return { seconds: null, tooLong: false };

        const gap = normalized.slice(lastIndex, match.index).replace(/\s+/g, "");
        if (gap.length) return null;

        matched = true;
        total += Number(amount) * durationUnits[unit];
        lastIndex = match.index + full.length;
    }

    if (!matched) return { seconds: null, tooLong: false };
    if (normalized.slice(lastIndex).replace(/\s+/g, "").length) return { seconds: null, tooLong: false };

    if (total <= 0) return { seconds: null, tooLong: false };
    return total > MAX_TIMEOUT_SECONDS
        ? { seconds: null, tooLong: true }
        : { seconds: total, tooLong: false };
}

function formatParsedDuration(seconds: number) {
    const parts: string[] = [];
    let remaining = seconds;

    const push = (value: number, unit: string) => {
        if (!value) return;
        parts.push(`${value} ${unit}${value === 1 ? "" : "s"}`);
    };

    const months = Math.floor(remaining / MONTH_SECONDS);
    remaining -= months * MONTH_SECONDS;
    push(months, "month");

    const weeks = Math.floor(remaining / WEEK_SECONDS);
    remaining -= weeks * WEEK_SECONDS;
    push(weeks, "week");

    const days = Math.floor(remaining / (24 * 60 * 60));
    remaining -= days * 24 * 60 * 60;
    push(days, "day");

    const hours = Math.floor(remaining / (60 * 60));
    remaining -= hours * 60 * 60;
    push(hours, "hour");

    const minutes = Math.floor(remaining / 60);
    remaining -= minutes * 60;
    push(minutes, "minute");

    push(remaining, "second");
    return parts.join(" ");
}

function x(duration: number) {
    return {
        value: duration,
        get label() {
            const label = formatParsedDuration(duration);
            return label ? label : `${duration} seconds`;
        }
    };
}

let y = [
    x(60),
    x(300),
    x(600),
    x(3600),
    x(86400),
    x(WEEK_SECONDS)
];

function CustomDurationInput({ selected, value, onChange }: { selected: number | string | CustomDurationOption; value: string; onChange: (value: string) => void; }) {
    const parsed = useMemo(() => parseCustomDurationDetails(value), [value]);
    const parsedSeconds = parsed.seconds;

    useEffect(() => {
        currentCustomDurationSeconds = parsedSeconds;
        return () => {
            if (currentCustomDurationSeconds === parsedSeconds) currentCustomDurationSeconds = null;
        };
    }, [parsedSeconds]);

    if (!isCustomDuration(selected)) return null;

    return (
        <div className={cl("custom")}>
            <TextInput
                value={value}
                onChange={onChange}
                placeholder="e.g. 1h 30m, 2d 14h 30m 15s, or 5400"
            />
            <BaseText size="sm" color={parsedSeconds != null ? "text-muted" : "text-danger"}>
                {parsedSeconds != null
                    ? `Parsed to ${parsedSeconds.toLocaleString()} seconds (${formatParsedDuration(parsedSeconds)}).`
                    : value
                        ? parsed.tooLong
                            ? "Discord only allows timeouts up to 4 weeks."
                            : "Enter a valid duration."
                        : "Use seconds or mixed durations, up to 4 weeks."
                }
            </BaseText>
        </div>
    );
}

export default definePlugin({
    name: "CustomTimeoutDuration",
    description: "Adds longer timeout presets and a custom timeout duration input to the timeout modal.",
    tags: ["Servers", "Utility"],
    authors: [EquicordDevs.justjxke],
    parseCustomDuration,
    isCustomDuration,
    resolveDuration,
    CUSTOM_DURATION_OPTION,
    CustomDurationInput: ErrorBoundary.wrap(CustomDurationInput, { noop: true }),
    patches: [{
        find: "buttons:y.map",
        replacement: [{
            match: /buttons:y\.map/,
            replace: 'className:"vc-expand-timeout-duration",buttons:y.map'
        }, {
            match: /x\(C\.DisableCommunicationDuration\.DURATION_1_WEEK\)\]/,
            replace: 'x(C.DisableCommunicationDuration.DURATION_1_WEEK),{value:1209600,label:"2 weeks"},{value:$self.CUSTOM_DURATION_OPTION,label:"Custom"}]'
        }, {
            match: /\[k,v\]=i\.useState\(""\)/,
            replace: '$&, [customDurationText, setCustomDurationText] = i.useState("")'
        }, {
            match: /\]\}\),\(0,a\.jsxs\)\(r\.BJc,\{gap:8,children:\[\(0,a\.jsx\)\(r\.Heading,\{variant:"heading-sm\/semibold",children:p\.intl\.string\(p\.t\.ewHW15\)\}\),\(0,a\.jsx\)\(r\.fs1,\{value:k,onChange:t=>v\(t\),placeholder:p\.intl\.string\(p\.t\.GakiH1\),rows:4,maxLength:C\.hl\}\)\]\}\)/,
            replace: ']}),(0,a.jsx)($self.CustomDurationInput,{selected:U,value:customDurationText,onChange:setCustomDurationText}),(0,a.jsxs)(r.BJc,{gap:8,children:[(0,a.jsx)(r.Heading,{variant:"heading-sm/semibold",children:p.intl.string(p.t.ewHW15)}),(0,a.jsx)(r.fs1,{value:k,onChange:t=>v(t),placeholder:p.intl.string(p.t.GakiH1),rows:4,maxLength:C.hl})]})'
        }, {
            match: /loading:M\}/,
            replace: 'loading:M,disabled:M||$self.isCustomDuration(U)&&$self.resolveDuration(U,customDurationText)==null}'
        }, {
            match: /setCommunicationDisabledDuration\(e,n,U,k,I,N\)/,
            replace: 'setCommunicationDisabledDuration(e,n,$self.resolveDuration(U,customDurationText),k,I,N)'
        }]
    }]
});
