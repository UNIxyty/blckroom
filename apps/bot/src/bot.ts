import { Bot, InlineKeyboard, type Context } from "grammy";
import type { AppConfig } from "@blackroom/shared/config";
import type { Storage } from "@blackroom/shared/storage";
import { t, resolveLang, type Lang } from "@blackroom/shared/i18n";
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
  getSession,
  enqueueJob,
  audit,
  type UserRow,
} from "@blackroom/db";

export interface BotContext extends Context {
  dbUser: UserRow | null;
  lang: Lang;
}

function displayName(u: UserRow): string {
  return u.first_name ?? (u.username ? `@${u.username}` : `#${u.telegram_id}`);
}

/** Language for messaging an arbitrary user row (outside an update context). */
function langOf(u: UserRow): Lang {
  return resolveLang(u.language);
}

export function createBot(config: AppConfig, storage: Storage): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.TELEGRAM_BOT_TOKEN);

  // Resolve telegram_id → user row + language once per update.
  bot.use(async (ctx, next) => {
    ctx.dbUser = ctx.from ? await findUserByTelegramId(ctx.from.id) : null;
    ctx.lang = resolveLang(ctx.dbUser?.language, ctx.from?.language_code);
    await next();
  });

  bot.command("start", async (ctx) => {
    if (!ctx.from) return;
    const { user, created } = await upsertPendingUser(
      ctx.from.id,
      ctx.from.username ?? null,
      ctx.from.first_name ?? null,
    );
    const lang = resolveLang(user.language, ctx.from.language_code);

    if (user.status === "suspended") {
      await ctx.reply(t(lang, "bot.start.suspended"));
      return;
    }
    if (user.role !== "pending") {
      await ctx.reply(t(lang, "bot.start.active"));
      return;
    }

    await ctx.reply(t(lang, "bot.start.welcome"));

    if (created) {
      const approvers = await listApprovers();
      for (const approver of approvers) {
        const al = langOf(approver);
        const keyboard = new InlineKeyboard()
          .text(t(al, "bot.approve"), `approve:${user.id}`)
          .text(t(al, "bot.reject"), `reject:${user.id}`);
        try {
          await bot.api.sendMessage(
            Number(approver.telegram_id),
            t(al, "bot.request.new", { name: displayName(user) }),
            { reply_markup: keyboard },
          );
        } catch {
          // Approver never opened the bot; skip.
        }
      }
    }
  });

  bot.callbackQuery(/^(approve|reject):(.+)$/, async (ctx) => {
    const actor = ctx.dbUser;
    if (!actor || !["owner", "superadmin"].includes(actor.role) || actor.status !== "active") {
      await ctx.answerCallbackQuery({ text: t(ctx.lang, "bot.notallowed") });
      return;
    }
    const [, action, targetId] = ctx.match as RegExpMatchArray;
    const target = await findUserById(targetId!);
    if (!target) {
      await ctx.answerCallbackQuery({ text: t(ctx.lang, "bot.usergone") });
      return;
    }
    if (target.role !== "pending" || target.status === "suspended") {
      await ctx.answerCallbackQuery({ text: t(ctx.lang, "bot.handled") });
      await ctx.editMessageReplyMarkup(undefined).catch(() => {});
      return;
    }

    const shop = await getDefaultShop();
    if (action === "approve") {
      const updated = await approveUser(target.id, shop.id, actor.id);
      if (!updated) {
        await ctx.answerCallbackQuery({ text: t(ctx.lang, "bot.handled") });
        return;
      }
      await audit({
        shopId: shop.id,
        actorUserId: actor.id,
        action: "user.approve",
        targetType: "user",
        targetId: target.id,
      });
      await ctx.answerCallbackQuery({});
      await ctx
        .editMessageText(t(ctx.lang, "bot.approved.done", { name: displayName(updated) }))
        .catch(() => {});
      await bot.api
        .sendMessage(Number(updated.telegram_id), t(langOf(updated), "bot.approved.msg"))
        .catch(() => {});
    } else {
      const updated = await rejectUser(target.id, actor.id);
      if (!updated) {
        await ctx.answerCallbackQuery({ text: t(ctx.lang, "bot.handled") });
        return;
      }
      await audit({
        shopId: shop.id,
        actorUserId: actor.id,
        action: "user.reject",
        targetType: "user",
        targetId: target.id,
      });
      await ctx.answerCallbackQuery({});
      await ctx
        .editMessageText(t(ctx.lang, "bot.rejected.done", { name: displayName(updated) }))
        .catch(() => {});
    }
  });

  // §9: "Send as album" under the delivered sheet — heavy lifting queued to
  // the worker so the webhook answers instantly.
  bot.callbackQuery(/^album:(.+)$/, async (ctx) => {
    const actor = ctx.dbUser;
    if (!actor || actor.status !== "active" || actor.role === "pending") {
      await ctx.answerCallbackQuery({ text: t(ctx.lang, "bot.notallowed") });
      return;
    }
    const sessionId = (ctx.match as RegExpMatchArray)[1]!;
    const session = await getSession(sessionId);
    const isOwner = ["owner", "superadmin"].includes(actor.role);
    if (!session || (session.barber_id !== actor.id && !isOwner)) {
      await ctx.answerCallbackQuery({ text: t(ctx.lang, "bot.notallowed") });
      return;
    }
    if (session.status === "expired" || session.expires_at.getTime() < Date.now()) {
      await ctx.answerCallbackQuery({ text: t(ctx.lang, "history.deleted") });
      return;
    }
    await enqueueJob("send_album", {
      session_id: session.id,
      chat_id: ctx.chat?.id ?? Number(actor.telegram_id),
    });
    await ctx.answerCallbackQuery({});
  });

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
      await ctx.reply(t(ctx.lang, "bot.refusal"));
    });

  gated.command("new", async (ctx) => {
    const keyboard = new InlineKeyboard().webApp(
      t(ctx.lang, "bot.new.button"),
      `${config.PUBLIC_APP_URL}/`,
    );
    await ctx.reply(t(ctx.lang, "bot.new.open"), { reply_markup: keyboard });
  });

  gated.command("help", async (ctx) => {
    const owner = ["owner", "superadmin"].includes(ctx.dbUser!.role);
    const lines = [
      t(ctx.lang, "bot.help.new"),
      t(ctx.lang, "bot.help.help"),
      t(ctx.lang, "bot.help.delete"),
      ...(owner ? [t(ctx.lang, "bot.help.stats"), t(ctx.lang, "bot.help.users")] : []),
    ];
    await ctx.reply(lines.join("\n"));
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
        ? t(ctx.lang, "bot.deleted.none")
        : t(ctx.lang, "bot.deleted.done", { images: removed, sessions: sessionIds.length }),
    );
  });

  const ownerOnly = gated.filter((ctx) => ["owner", "superadmin"].includes(ctx.dbUser!.role));

  ownerOnly.command("stats", async (ctx) => {
    const shop = await getDefaultShop();
    const usage = await monthlyUsage(shop.id);
    await ctx.reply(
      t(ctx.lang, "bot.stats", {
        sessions: usage.sessions,
        spend: (usage.spend_cents / 100).toFixed(2),
        budget: (shop.monthly_budget_cents / 100).toFixed(2),
        currency: shop.currency,
      }),
    );
  });

  ownerOnly.command("users", async (ctx) => {
    const keyboard = new InlineKeyboard().webApp(
      t(ctx.lang, "bot.users.button"),
      `${config.PUBLIC_APP_URL}/?screen=admin`,
    );
    await ctx.reply(t(ctx.lang, "bot.users.open"), { reply_markup: keyboard });
  });

  return bot;
}
