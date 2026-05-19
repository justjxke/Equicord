/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { EquicordDevs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import definePlugin from "@utils/types";
import { TextInput } from "@webpack/common";

const cl = classNameFactory("vc-custom-timeout-duration-");

const MAX_TIMEOUT_SECONDS = 28 * 24 * 60 * 60;
const CUSTOM_DURATION = -1;
const CHIP_CLASS_NAME = cl("chips");

const durationUnits = {
    w: 7 * 24 * 60 * 60,
    d: 24 * 60 * 60,
    h: 60 * 60,
    m: 60,
    s: 1,
};

const unitLabels = {
    w: "week",
    d: "day",
    h: "hour",
    m: "minute",
    s: "second",
};

type DurationUnit = keyof typeof durationUnits;

interface ParsedDuration {
    seconds: number;
    error?: string;
    description?: string;
}

function pluraliseUnit(value: number, unit: DurationUnit) {
    const label = unitLabels[unit];
    return `${value} ${label}${value === 1 ? "" : "s"}`;
}

function formatDuration(seconds: number) {
    const parts: string[] = [];
    let remaining = seconds;

    for (const unit of Object.keys(durationUnits) as DurationUnit[]) {
        const amount = Math.floor(remaining / durationUnits[unit]);
        if (!amount) continue;

        parts.push(pluraliseUnit(amount, unit));
        remaining %= durationUnits[unit];
    }

    return parts.join(", ");
}

function parseDuration(value: string): ParsedDuration {
    const input = value.trim();
    if (!input) return { seconds: 0, error: "Enter a duration." };

    const matches = [...input.matchAll(/(\d+)\s*([wdhms])\b/gi)];
    const consumed = matches.map(match => match[0]).join("").replace(/\s/g, "");

    if (!matches.length || consumed !== input.replace(/\s/g, "")) {
        return { seconds: 0, error: "Use a duration like 2w 3d 4h 5m." };
    }

    let seconds = 0;

    for (const match of matches) {
        const amount = Number(match[1]);
        const unit = match[2].toLowerCase() as DurationUnit;

        if (!Number.isSafeInteger(amount) || amount <= 0) {
            return { seconds: 0, error: "Duration values must be positive numbers." };
        }

        seconds += amount * durationUnits[unit];
    }

    if (seconds > MAX_TIMEOUT_SECONDS) return { seconds, error: "Timeout duration cannot be longer than 28 days." };

    return {
        seconds,
        description: formatDuration(seconds),
    };
}

let customDuration = "";
let selectedDuration = 60;

export default definePlugin({
    name: "CustomTimeoutDuration",
    description: "Adds two week, four week, and custom duration options to Discord's timeout modal.",
    authors: [EquicordDevs.justjxke],

    patches: [
        {
            find: "#{intl::GUILD_COMMUNICATION_DISABLED_DURATION}",
            replacement: [
                // Patch 1: Add 2 weeks, 4 weeks, Custom durations
                {
                    match: /\i\(\i\.DisableCommunicationDuration\.DURATION_1_WEEK\)(?=\])/,
                    replace: "$&,{value:1209600,label:\"2 weeks\"},{value:2419200,label:\"4 weeks\"},{value:$self.CUSTOM_DURATION,label:\"Custom\"}",
                },
                // Patch 2: Add custom timeout useState after the wrapped existing one
                {
                    match: /(\[\i,\i\]=)(\i)(\.useState\(\i\.DisableCommunicationDuration\.DURATION_60_SEC\))/,
                    replace: "$1$self.useWrappedState($2$3),[customTimeoutDuration,setCustomTimeoutDuration]=$2.useState(\"\")",
                },
                // Patch 3: Hook setCommunicationDisabledDuration
                {
                    match: /setCommunicationDisabledDuration\((\i),(\i),(\i),(\i),(\i),(\i)\)/,
                    replace: "setCommunicationDisabledDuration($1,$2,$self.getDuration($3),$4,$5,$6)",
                },
                // Patch 5: Add disabled prop to submit button
                {
                    match: /(onClick:\i,loading:\i)(}\],)/,
                    replace: "$1,disabled:$self.hasError()$2",
                },
                // Patch 6a: Inject className prop into button group
                {
                    match: /(\(0,\i\.jsx\)\(\i,\{)(buttons:\i\.map)/,
                    replace: "$1className:$self.CHIP_CLASS_NAME,$2",
                },
                // Patch 6b: Append custom duration input as sibling component
                {
                    match: /(\i\)\)\}\))(?=\])/,
                    replace: "$1,$self.renderCustomDurationInput(customTimeoutDuration,setCustomTimeoutDuration)",
                },
            ],
        },
    ],

    CUSTOM_DURATION,
    CHIP_CLASS_NAME,

    useWrappedState([state, setter]: [number, (val: number) => void]) {
        selectedDuration = state;
        return [
            state,
            (val: number) => {
                selectedDuration = val;
                setter(val);
            }
        ];
    },

    getDuration(duration: number) {
        return duration === CUSTOM_DURATION ? parseDuration(customDuration).seconds : duration;
    },

    hasError() {
        return selectedDuration === CUSTOM_DURATION && parseDuration(customDuration).error != null;
    },

    renderCustomDurationInput(value: string, setCustomDuration: (val: string) => void) {
        if (selectedDuration !== CUSTOM_DURATION) return null;

        const parsed = parseDuration(value);

        return (
            <div className={cl("input-wrapper")}>
                <TextInput
                    value={value}
                    onChange={val => {
                        setCustomDuration(val);
                        customDuration = val;
                    }}
                    placeholder="2w 3d 4h 5m"
                    error={parsed.error}
                    autoFocus
                />
                {parsed.description && <div className={cl("preview")}>{parsed.description}</div>}
            </div>
        );
    },
});
