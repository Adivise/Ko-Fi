import { serve } from "https://deno.land/std@0.119.0/http/server.ts";
import { connect, Query } from 'https://deno.land/x/yongo@v1.4.3/mod.ts';

const DISCORD_WEBHOOK = Deno.env.get("DISCORD_WEBHOOK");
if (DISCORD_WEBHOOK === undefined) {
  throw new Error("You need to set DISCORD_WEBHOOK environment variable to Webhook URL.");
}

const KOFI_TOKEN = Deno.env.get("KOFI_TOKEN");
if (KOFI_TOKEN === undefined) {
  throw new Error("You need to set the KOFI_TOKEN environment variable to your Ko-fi webhook verification token.");
}

const MONGO_URI = Deno.env.get("MONGO_URI");
if (MONGO_URI === undefined) {
  throw new Error("You need to set the MONGO_URI environment variable!");
}

const DEBUG = Deno.env.get("DEBUG") === "1";

await connect(MONGO_URI);

async function callWebhook(data: Record<string, any>) {
  await fetch(DISCORD_WEBHOOK!, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(Object.assign({
      username: "Ko-fi",
      avatar_url:
        "https://cdn.discordapp.com/avatars/836232765942923305/1f6fbc8561728c4de6f0f68a2a943dd6.png",
    }, data)),
  });
}

type KofiEventType = "Donation" | "Subscription" | "Commission" | "Shop Order";

interface KofiShopItem {
  direct_link_code: string;
}

interface KofiEvent {
  timestamp: string;
  type: KofiEventType;
  is_public: boolean;
  from_name: string;
  message: string;
  amount: string;
  url: string;
  email: string;
  currency: string;
  is_subscription_payment: boolean;
  is_first_subscription_payment: boolean;
  kofi_transaction_id: string;
  verification_token: string;
  shop_items: KofiShopItem[] | null;
  tier_name: string | null;
}

console.log("Listening on http://localhost:8000");
serve(async (req) => {
  const { pathname: path } = new URL(req.url);

  switch (path) {
    case "/": {
      return new Response("https://github.com/Adivise");
    }

    case "/post": {
      try {
        const form = await req.formData();
        const data: KofiEvent = JSON.parse(form.get("data")!.toString());

        if (data.verification_token !== KOFI_TOKEN && !(DEBUG && data.verification_token === "5e7284b8-d0c1-4a47-a342-37dc7e9344d6")) {
          console.log(`[INFO] Someone made unauthorized request! Verification Token: ${data}`);
          // mongoose db
          const insertQuery = new Query<any>('donate');
          insertQuery.put('name', [data]);
          await insertQuery.insert();

          return new Response("Unauthorized");
        }

        await callWebhook({ embeds: [{
              color: "#000001",
              author: { name: `${data.is_public ? "" : "(Private) "}${data.from_name}` },
              title: data.type === "Donation" ? "Someone bought you a coffee!"
                : data.type === "Commission" ? "You got a commission!"
                : data.type === "Subscription" ? (data.is_first_subscription_payment ? "Someone subscribed to your Ko-fi!" : "Subscription Payment")
                : data.type === "Shop Order" ? "Someone made an order!"
                : "Unknown Event",
              url: data.url,
              fields: [
                ...(data.message ? [{
                      name: "Message",
                      value: data.message,
                    }] : []),
                {
                  name: "Amount",
                  value: data.amount,
                  inline: true,
                },
                {
                  name: "Currency",
                  value: data.currency,
                  inline: true,
                },
                ...(data.shop_items ? [{
                      name: "Shop Items",
                      value: `${data.shop_items?.length} item${data.shop_items.length === 1 ? "" : "s"}`,
                      inline: true,
                    }] : []),
                ...(data.tier_name ? [{
                      name: "Tier",
                      value: data.tier_name,
                      inline: true,
                    }] : []),
              ],
              timestamp: data.timestamp,
              footer: {
                text: data.kofi_transaction_id,
              },
            },
          ],
        });

        console.log("[INFO] Delivered hook!");
        return new Response("Delivered!");
      } catch (e) {
        return new Response("400 Bad Request", { status: 400 });
      }
    }

    default: {
      return new Response("404 Not Found", { status: 404 });
    }
  }
});
