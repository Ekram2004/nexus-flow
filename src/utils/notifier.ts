import "dotenv/config";

export async function sendFlaggedAlert(tx: {
  id: string;
  description: string;
  amount: number;
  source: string;
}) {
  const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log(
      "[Notifier] Skipping alert. No NOTIFICATION_WEBHOOK_URL configured.",
    );
    return;
  }

  // Construct a clean, readable alert payload
  const payload = {
    content: `🚨 **NexusFlow Exception Alert** 🚨`,
    embeds: [
      {
        title: "Transaction Flagged for Human Review",
        description: `The autonomous AI pipeline could not confirm a high-confidence match for this record.`,
        color: 16738048, // Vivid Amber/Red hex color integer
        fields: [
          { name: "Transaction ID", value: `\`${tx.id}\``, inline: false },
          { name: "Description", value: tx.description, inline: true },
          { name: "Source Ledger", value: `\`${tx.source}\``, inline: true },
          {
            name: "Amount",
            value: `$` + parseFloat(tx.amount.toString()).toFixed(2),
            inline: true,
          },
          {
            name: "Action Required",
            value:
              "[Open Administrative Control Dashboard](http://localhost:3000/dashboard)",
            inline: false,
          },
        ],
        footer: {
          text: `NexusFlow Instance Engine • ${new Date().toISOString()}`,
        },
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(
        `[Notifier Error] Webhook endpoint responded with HTTP ${response.status}`,
      );
    } else {
      console.log(
        `[Notifier] Exception warning pushed to operational alert channel for ID: ${tx.id}`,
      );
    }
  } catch (err: any) {
    console.error(
      "[Notifier Error] Failed to send webhook alert payload:",
      err.message,
    );
  }
}
