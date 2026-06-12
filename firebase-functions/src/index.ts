import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";

export const onInquiryCreated = onDocumentCreated("inquiries/{inquiryId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;
  const data = snapshot.data();

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn("DISCORD_WEBHOOK_URL is not set. Skipping notification.");
    return;
  }

  const payload = {
    content: `🚨 **New Inquiry Received** 🚨\n\n**Name:** ${data.name}\n**Email:** ${data.email}\n**Type:** ${data.inquiryType}\n${data.company ? `**Company:** ${data.company}\n` : ""}**Message:**\n>>> ${data.message}`
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      logger.error(`Webhook failed with status ${response.status}`);
    } else {
      logger.info("Successfully sent Discord notification.");
    }
  } catch (error) {
    logger.error("Error sending Discord webhook:", error);
  }
});
