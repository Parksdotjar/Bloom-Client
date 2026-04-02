package dev.bloom.cosmetics.client.badges.util

import com.mojang.brigadier.arguments.StringArgumentType
import com.mojang.brigadier.builder.LiteralArgumentBuilder
import dev.bloom.cosmetics.client.badges.BadgeSystem
import net.fabricmc.fabric.api.client.command.v2.ClientCommandManager
import net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource
import net.minecraft.client.MinecraftClient
import net.minecraft.text.Text
import java.util.Locale
import java.util.UUID

object BadgeDebugCommand {
    fun register(
        dispatcher: com.mojang.brigadier.CommandDispatcher<FabricClientCommandSource>,
        badgeSystem: BadgeSystem
    ) {
        dispatcher.register(
            root()
                .then(
                    ClientCommandManager.literal("list")
                        .executes { context ->
                            val ids = badgeSystem.listDefinitions().joinToString(", ") { it.id }
                            context.source.sendFeedback(Text.literal("Bloom badges: $ids"))
                            1
                        }
                )
                .then(
                    ClientCommandManager.literal("assign")
                        .then(
                            ClientCommandManager.argument("player", StringArgumentType.word())
                                .then(
                                    ClientCommandManager.argument("badgeIds", StringArgumentType.greedyString())
                                        .executes { context ->
                                            val player = StringArgumentType.getString(context, "player")
                                            val badgeIdsRaw = StringArgumentType.getString(context, "badgeIds")
                                            val uuid = resolvePlayerUuid(player)
                                                ?: throw IllegalArgumentException("Player not found in current client session: $player")
                                            val ids = badgeIdsRaw.split(',').map { it.trim().lowercase(Locale.ROOT) }.filter { it.isNotBlank() }
                                            badgeSystem.assignDebugBadges(uuid, ids)
                                            context.source.sendFeedback(Text.literal("Assigned [${ids.joinToString(", ")}] to $player"))
                                            1
                                        }
                                )
                        )
                )
                .then(
                    ClientCommandManager.literal("clear")
                        .then(
                            ClientCommandManager.argument("player", StringArgumentType.word())
                                .executes { context ->
                                    val player = StringArgumentType.getString(context, "player")
                                    val uuid = resolvePlayerUuid(player)
                                        ?: throw IllegalArgumentException("Player not found in current client session: $player")
                                    badgeSystem.clearDebugBadges(uuid)
                                    context.source.sendFeedback(Text.literal("Cleared debug badges for $player"))
                                    1
                                }
                        )
                )
                .then(
                    ClientCommandManager.literal("reload")
                        .executes { context ->
                            badgeSystem.refreshConfig()
                            context.source.sendFeedback(Text.literal("Bloom badge config reloaded"))
                            1
                        }
                )
        )
    }

    private fun root(): LiteralArgumentBuilder<FabricClientCommandSource> {
        return ClientCommandManager.literal("bloombadges")
    }

    private fun resolvePlayerUuid(nameOrUuid: String): UUID? {
        val normalized = nameOrUuid.trim()
        runCatching { UUID.fromString(normalized) }.getOrNull()?.let { return it }
        val client = MinecraftClient.getInstance()
        val networkHandler = client.networkHandler ?: return null
        return networkHandler.playerList.firstOrNull {
            it.profile.name.equals(normalized, ignoreCase = true)
        }?.profile?.id
    }
}

