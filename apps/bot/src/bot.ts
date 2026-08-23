import { Bot, InlineKeyboard, type Context } from "grammy";
import type { AppConfig } from "@blackroom/shared/config";
import type { Storage } from "@blackroom/shared/storage";
import {
  upsertPendingUser,
  findUserByTelegramId,
  findUserById,
  approveUser,
  rejectUser,
  listApprovers,
  getDefaultShop,
  monthlyUsage,
  listBarberSessionIds,
  listSessionImagePaths,
  stripSessionImagery,
  audit,
  type UserRow,
} from "@blackroom/db";

export interface BotContext extends Context {
  dbUser: UserRow | null;
}

function displayName(u: UserRow): string {
  return u.first_name ?? (u.username ? `@${u.username}` : `#${u.telegram_id}`);
}

export function createBot(config: AppConfig, storage: Storage): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.TELEGRAM_BOT_TOKEN);

  // Resolve telegram_id → user row once per update.
  bot.use(async (ctx, next) => {
    ctx.dbUser = ctx.from ? await findUserByTelegramId(ctx.from.id) : null;
    await next();
  });

  bot.command("start", async (ctx) => {
    if (!ctx.from) return;
    const { user, created } = await upsertPendingUser(
      ctx.from.id,
      ctx.from.username ?? null,
      ctx.from.first_name ?? null,
    );

    if (user.status === "suspended") {
      await ctx.reply("Your access has been suspended. Contact the shop owner.");
      return;
    }
    if (user.role !== "pending") {
      await ctx.reply("You're in. Use /new to start a client preview.");
      return;
    }

    await ctx.reply(
      "Welcome to Black Room. Your access request has been sent to the owner — you'll get a message here once you're approved.",
    );

    if (created) {
      const keyboard = new InlineKeyboard()
        .text("✓ Approve", `approve:${user.id}`)
        .text("✗ Reject", `reject:${user.id}`);
      const approvers = await listApprovers();
      for (const approver of approvers) {
        try {
          await bot.api.sendMessage(
            Number(approver.telegram_id),
            `New access request: ${displayName(user)}${user.username ? ` (@${user.username})` : ""}`,
            { reply_markup: keyboard },
          );
        } catch {
          // An approver who never opened the bot can't be messaged; skip.
        }
      }
    }
  });

  bot.callbackQuery(/^(approve|reject):(.+)$/, async (ctx) => {
    const actor = ctx.dbUser;
    if (!actor || !["owner", "superadmin"].includes(actor.role) || actor.status !== "active") {
      await ctx.answerCallbackQuery({ text: "Not allowed." });
      return;
    }
    const [, action, targetId] = ctx.match as RegExpMatchArray;
    const target = await findUserById(targetId!);
    if (!target) {
      await ctx.answerCallbackQuery({ text: "User no longer exists." });
      return;
    }
    if (target.role !== "pending" || target.status === "suspended") {
      await ctx.answerCallbackQuery({ text: "Already handled." });
      await ctx.editMessageReplyMarkup(undefined).catch(() => {});
      return;
    }

    const shop = await getDefaultShop();
    if (action === "approve") {
      const updated = await approveUser(target.id, shop.id, actor.id);
      if (!updated) {
        await ctx.answerCallbackQuery({ text: "Already handled." });
        return;
      }
      await audit({
        shopId: shop.id,
        actorUserId: actor.id,
        action: "user.approve",
        targetType: "user",
        targetId: target.id,
      });
      await ctx.answerCallbackQuery({ text: "Approved." });
      await ctx
        .editMessageText(`✓ Approved ${displayName(updated)} as barber.`)
        .catch(() => {});
      await bot.api
        .sendMessage(
          Number(updated.telegram_id),
          "You've been approved. Use /new to start a client preview.",
        )
        .catch(() => {});
    } else {
      const updated = await rejectUser(target.id, actor.id);
      if (!updated) {
        await ctx.answerCallbackQuery({ text: "Already handled." });
        return;
      }
      await audit({
        shopId: shop.id,
        actorUserId: actor.id,
        action: "user.reject",
        targetType: "user",
        targetId: target.id,
      });
      await ctx.answerCallbackQuery({ text: "Rejected." });
      await ctx
        .editMessageText(`✗ Rejected ${displayName(updated)}.`)
        .catch(() => {});
    }
  });

  // Everything below requires an active barber/owner/superadmin.
  const gated = bot.filter((ctx): ctx is BotContext => {
    const u = ctx.dbUser;
    return !!u && u.status === "active" && u.role !== "pending";
  });

  // Polite single-line refusal for pending/suspended users on any other command.
  bot
    .filter((ctx) => {
      const u = ctx.dbUser;
      const isCommand = !!ctx.message?.text?.startsWith("/");
      const blocked = !u || u.status !== "active" || u.role === "pending";
      const isStart = !!ctx.message?.text?.startsWith("/start");
      return isCommand && blocked && !isStart;
    })
    .on("message", async (ctx) => {
      await ctx.reply("Your access isn't active yet — ask the owner, or send /start to check.");
    });

  gated.command("new", async (ctx) => {
    const keyboard = new InlineKeyboard().webApp("Open camera", `${config.PUBLIC_APP_URL}/`);
    await ctx.reply("New client preview — open the capture screen:", {
      reply_markup: keyboard,
    });
  });

  gated.command("help", async (ctx) => {
    const owner = ["owner", "superadmin"].includes(ctx.dbUser!.role);
    await ctx.reply(
      [
        "/new — photograph a client, get a 9-cut preview sheet",
        "/help — this",
        "/delete_my_data — remove all imagery from your sessions",
        ...(owner ? ["/stats — sessions and spend this month", "/users — manage users"] : []),
      ].join("\n"),
    );
  });

  gated.command("delete_my_data", async (ctx) => {
    const user = ctx.dbUser!;
    const sessionIds = await listBarberSessionIds(user.id);
    let removed = 0;
    for (const id of sessionIds) {
      const paths = await listSessionImagePaths(id);
      await storage.remove(paths).catch(() => {});
      await stripSessionImagery(id);
      removed += paths.length;
    }
    await audit({
      shopId: user.shop_id,
      actorUserId: user.id,
      action: "user.delete_my_data",
      meta: { sessions: sessionIds.length, images: removed },
    });
    await ctx.reply(
      sessionIds.length === 0
        ? "Nothing to delete — you have no sessions with stored imagery."
        : `Deleted ${removed} images from ${sessionIds.length} of your sessions.`,
    );
  });

  const ownerOnly = gated.filter((ctx) =>
    ["owner", "superadmin"].includes(ctx.dbUser!.role),
  );

  ownerOnly.command("stats", async (ctx) => {
    const shop = await getDefaultShop();
    const usage = await monthlyUsage(shop.id);
    const spend = (usage.spend_cents / 100).toFixed(2);
    const budget = (shop.monthly_budget_cents / 100).toFixed(2);
    await ctx.reply(
      `This month: ${usage.sessions} sessions · ${spend} ${shop.currency} spent of ${budget} ${shop.currency} budget.`,
    );
  });

  ownerOnly.command("users", async (ctx) => {
    const keyboard = new InlineKeyboard().webApp(
      "Open admin",
      `${config.PUBLIC_APP_URL}/?screen=admin`,
    );
    await ctx.reply("User management:", { reply_markup: keyboard });
  });

  return bot;
}
