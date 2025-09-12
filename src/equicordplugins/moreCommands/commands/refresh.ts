/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";
import { FluxDispatcher } from "@webpack/common";

export default [
    {
        name: "refresh",
        description: "Refreshes Discord application commands locally",
        options: [],
        inputType: ApplicationCommandInputType.BOT,
        execute: async (opts, ctx) => {
            try {
                // Send initial feedback
                sendBotMessage(ctx.channel.id, {
                    content: "Refreshing application commands...",
                });

                // Dispatch the application command index fetch request
                // This should trigger Discord to refresh its command cache
                FluxDispatcher.dispatch({
                    type: "APPLICATION_COMMAND_INDEX_FETCH_REQUEST",
                });

                // Also try fetching guild commands if we're in a guild
                const guildId = ctx.guild?.id;
                if (guildId) {
                    FluxDispatcher.dispatch({
                        type: "APPLICATION_COMMAND_INDEX_FETCH_REQUEST",
                        guildId,
                    });
                }

                // Give a small delay for the refresh to process
                await new Promise((resolve) => setTimeout(resolve, 1000));

                // Send success message
                sendBotMessage(ctx.channel.id, {
                    content: "Commands refreshed successfully!",
                });
            } catch (err) {
                console.error(
                    "[Refresh Command] Error refreshing commands:",
                    err,
                );
                sendBotMessage(ctx.channel.id, {
                    content:
                        "Failed to refresh commands. Check the console for details.",
                });
            }
        },
    },
];
