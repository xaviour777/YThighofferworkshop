import { NextResponse } from "next/server";
import { ghlClient } from "@/lib/ghlClient";

function normalizePhone(phone?: string) {
  if (!phone) return "";
  let clean = phone.replace(/[^\d+]/g, "");
  if (clean.startsWith("03")) {
    clean = "+92" + clean.slice(1);
  } else if (clean.startsWith("3") && clean.length === 10) {
    clean = "+92" + clean;
  }
  return clean;
}

// 5-Action Automated Plan Segmentation Engine
function determineCustomPlan(answers: Record<string, string>) {
  const budget = answers?.startBudget || "";
  const goal = answers?.goal || "";
  const stage = answers?.currentStage || "";
  const income = answers?.incomeSituation || "";

  // 1. Executive / DFY Agency Tier
  if (goal.includes("100-channel") || goal.includes("Scale a business") || income.includes("Own a business")) {
    return {
      tier: "Tier 4 — Executive Advisory & DFY Channels",
      tag: "plan:tier-4-dfy-executive",
      recommendedOffer: "1:1 Executive Channel Architecture & DFY Team Placement",
      priceRange: "Rs. 45,000 – Rs. 120,000",
      cta: "Schedule Private Architecture Call",
      pitchAngle: "Hands-off automated systems with pre-vetted editor placement from my 3,000-student pool.",
    };
  }

  // 2. In-Person Content Colony Residency
  if (budget.includes("40k+") && (goal.includes("Full-time") || stage.includes("Working creator"))) {
    return {
      tier: "Tier 3 — Content Colony IRL Residency",
      tag: "plan:tier-3-colony",
      recommendedOffer: "Content Colony Co-Live & Co-Work Residency Pass",
      priceRange: "Rs. 35,000 / month",
      cta: "Reserve Colony Residency Suite",
      pitchAngle: "Live & shoot alongside Abrar with 1 Gbps fiber, 24/7 power, and 4K studio bays.",
    };
  }

  // 3. Channel Audit & Monetization Rescue
  if (stage.includes("Tried before, failed") || answers?.blocker?.includes("Failed") || answers?.blocker?.includes("Confusion")) {
    return {
      tier: "Tier 5 — Channel Audit & Monetization Rescue",
      tag: "plan:tier-5-audit-rescue",
      recommendedOffer: "60-Minute Channel Diagnostics & Policy Fix",
      priceRange: "Rs. 15,000",
      cta: "Book Diagnostic Audit",
      pitchAngle: "Fixing your retention bottlenecks, CTR drop-offs, and compliance issues in one intensive session.",
    };
  }

  // 4. Budget / Student Entry
  if (budget.includes("Under 5k") || budget.includes("5k–15k") || income.includes("Student") || income.includes("No income")) {
    return {
      tier: "Tier 1 — YT Empire Starter & AI Workbooks",
      tag: "plan:tier-1-starter",
      recommendedOffer: "YT Empire Starter AI Prompt Vault & Self-Paced Setup",
      priceRange: "Rs. 5,000 – Rs. 12,000",
      cta: "Access Starter Workbooks",
      pitchAngle: "100% free AI tools workflow designed to get you from zero to your first video without high software costs.",
    };
  }

  // 5. Default: Standard Accelerator Mentorship
  return {
    tier: "Tier 2 — YT Empire Builder Accelerator",
    tag: "plan:tier-2-accelerator",
    recommendedOffer: "YT Empire Builder 30-Day Accelerator & Community",
    priceRange: "Rs. 25,000 – Rs. 35,000",
    cta: "Join Accelerator Batch",
    pitchAngle: "Full hand-holding mentorship to launch, edit, publish, and monetize high-RPM faceless channels.",
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, phone, answers, notes } = body;

    if (!name || !phone) {
      return NextResponse.json(
        { success: false, error: "Name and WhatsApp number are required" },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizePhone(phone);
    const firstName = name.trim().split(" ")[0] || name.trim();
    const lastName = name.trim().split(" ").slice(1).join(" ") || "";

    // Run Segmentation Engine
    const planRecommendation = determineCustomPlan(answers);

    // Build tags from questionnaire answers & custom tier
    const tags = [
      "custom-price-application",
      "lead:custom-package",
      planRecommendation.tag,
    ];

    if (answers?.goal) tags.push(`goal:${answers.goal.toLowerCase().replace(/[^a-z0-9]/g, "-")}`);
    if (answers?.currentStage) tags.push(`stage:${answers.currentStage.toLowerCase().replace(/[^a-z0-9]/g, "-")}`);
    if (answers?.startBudget) tags.push(`budget:${answers.startBudget.toLowerCase().replace(/[^a-z0-9]/g, "-")}`);
    if (answers?.timePerWeek) tags.push(`time:${answers.timePerWeek.toLowerCase().replace(/[^a-z0-9]/g, "-")}`);
    if (answers?.blocker) tags.push(`blocker:${answers.blocker.toLowerCase().replace(/[^a-z0-9]/g, "-")}`);

    let contactId = null;
    let opportunityId = null;

    if (ghlClient.isConfigured) {
      const syntheticEmail = `${(normalizedPhone || "lead").replace(/[^\d]/g, "")}@whatsapp.user`;
      
      // 1. Upsert Contact in GHL with segmented tags
      const contactResult = await ghlClient.upsertContact({
        firstName,
        lastName,
        email: syntheticEmail,
        phone: normalizedPhone,
        tags,
      });

      contactId = contactResult?.contact?.id || contactResult?.id || null;

      // 2. Create Opportunity in GHL
      if (contactId) {
        const pipelineId = process.env.GHL_CUSTOM_PACKAGE_PIPELINE_ID || "AeBr4Q7skdfh8RyojRY0";
        const stageId = process.env.GHL_CUSTOM_PACKAGE_STAGE_NEW_LEAD || "be725ac6-305c-44ac-8054-83dfab4d5384";

        const oppResult = await ghlClient.createOpportunity({
          contactId,
          name: `${name} — ${planRecommendation.tier}`,
          pipelineId,
          pipelineStageId: stageId,
          status: "open",
        });

        opportunityId = oppResult?.opportunity?.id || oppResult?.id || null;
      }
    }

    // Format WhatsApp message text
    const message = `*Custom Plan Application for Abrar Nadir:*
👤 *Name:* ${name}
📱 *WhatsApp:* ${normalizedPhone}

🎯 *Goal:* ${answers?.goal || "Not specified"}
📍 *Current Stage:* ${answers?.currentStage || "Not specified"}
💼 *Income Situation:* ${answers?.incomeSituation || "Not specified"}
⚡ *Pressure:* ${answers?.pressure || "Not specified"}
💰 *Starting Budget:* ${answers?.startBudget || "Not specified"}
🏠 *Environment:* ${answers?.environment || "Not specified"}
⏳ *Time/Week:* ${answers?.timePerWeek || "Not specified"}
🚧 *Blocker:* ${answers?.blocker || "Not specified"}
📝 *Story/Notes:* ${notes || "None"}

⭐ *Calculated Tier:* ${planRecommendation.tier}
🎁 *Recommended Plan:* ${planRecommendation.recommendedOffer} (${planRecommendation.priceRange})

Hi Abrar, please send me my custom plan details!`;

    const whatsappUrl = `https://wa.me/923274532186?text=${encodeURIComponent(message)}`;

    return NextResponse.json({
      success: true,
      whatsappUrl,
      contactId,
      opportunityId,
      recommendation: planRecommendation,
    });
  } catch (error) {
    console.error("Custom Price Lead API Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process application" },
      { status: 500 }
    );
  }
}
