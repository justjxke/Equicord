/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { migratePluginSettings } from "@api/Settings";
import { Devs, EquicordDevs } from "@utils/constants";
import definePlugin from "@utils/types";

import choice from "./commands/choice";
import misc from "./commands/misc";
import refresh from "./commands/refresh";
import system from "./commands/system";
import text from "./commands/text";
import time from "./commands/time";

migratePluginSettings(
    "MoreCommands",
    "CuteAnimeBoys",
    "CuteNekos",
    "CutePats",
    "Slap",
);
export default definePlugin({
    name: "MoreCommands",
    description: "Adds various fun and useful commands",
    authors: [
        Devs.Arjix,
        Devs.amy,
        Devs.Samu,
        EquicordDevs.zyqunix,
        EquicordDevs.ShadyGoat,
        Devs.thororen,
        Devs.Korbo,
        EquicordDevs.justjxke,
    ],
    commands: [...choice, ...system, ...text, ...time, ...misc, ...refresh],
});
