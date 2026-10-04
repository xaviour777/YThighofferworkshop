import { NextResponse } from 'next/server';
import { ghlClient } from '@/lib/ghlClient';
import {
  dispatchCourseEmailAutomation,
  dispatchWhatsAppAutomation,
} from '@/lib/courseAutomation';

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { name, email, phone, stage, plan, monetaryValue } = data;

    if (!name || !email) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      );
    }

    // Pipeline: "LMS lunch" 
    const pipelineId = process.env.GHL_ACADEMY_PIPELINE_ID || 'CZYMTQUzq7a6faEIKdtZ';

    // Stage IDs
    const stages: Record<string, string> = {
      // Use GHL_ACADEMY_STAGE_NEW_LEAD if set, otherwise fallback to the generic GHL_ACADEMY_STAGE_ID (Payment Pending) to prevent cross-pipeline errors
      'new-lead':       process.env.GHL_ACADEMY_STAGE_NEW_LEAD    || process.env.GHL_ACADEMY_STAGE_ID || 'da280d2b-1c00-4141-b4b0-e286d877d80c',
      'form-fill':      process.env.GHL_ACADEMY_STAGE_FORM_FILL   || process.env.GHL_ACADEMY_STAGE_ID || 'e6ed9068-7d5e-49ff-ba46-5b9072545fd1',
      'payment-sent':   process.env.GHL_ACADEMY_STAGE_PAYMENT     || process.env.GHL_ACADEMY_STAGE_ID || 'a0d09d99-ada7-4f1a-9db7-d2a21631749d',
      'closed':         process.env.GHL_ACADEMY_STAGE_CLOSED      || process.env.GHL_ACADEMY_STAGE_ID || 'd082ad8f-b5e2-44ce-bebf-305ffeb644fa',
    };

    // Determine which stage to use (default: new-lead)
    const targetStage = stages[stage] || stages['new-lead'];

    // Build tags based on plan
    const tags = ['yteb:academy-lead', 'yteb:enrolled-pending', 'academy-lead', 'yt-empire-builder'];
    if (plan) tags.push(`plan:${plan}`);

    // 1. Create or Update Contact in GHL
    const contactResult = await ghlClient.upsertContact({
      firstName: name.split(' ')[0] || name,
      lastName: name.split(' ').slice(1).join(' ') || '',
      email: email,
      phone: phone || '',
      tags: tags,
    });

    const contactId = contactResult?.contact?.id || contactResult?.id || null;
    if (!contactId) {
      console.warn("Contact creation returned unexpected result:", contactResult);
      return NextResponse.json({
        success: false,
        error: 'Contact creation failed in GHL.'
      }, { status: 500 });
    }

    // 2. If stage is 'payment-sent', try to update existing opportunity first
    if (stage === 'payment-sent' && data.opportunityId) {
      try {
        const updateResult = await ghlClient.updateOpportunityStage(
          data.opportunityId,
          targetStage
        );
        return NextResponse.json({
          success: true,
          contact: contactResult,
          opportunity: updateResult,
          opportunityId: data.opportunityId,
        });
      } catch {
        console.warn("Could not update existing opportunity, creating new one");
      }
    }

    // 3. Create new Opportunity
    const oppResult = await ghlClient.createOpportunity({
      contactId: contactId,
      name: `${name} - YT Empire Builder`,
      pipelineId: pipelineId,
      pipelineStageId: targetStage,
      status: 'open',
      monetaryValue: monetaryValue || 0,
    });

    const opportunityId = oppResult?.opportunity?.id || oppResult?.id || null;

    // 4. Trigger WhatsApp & Course Email Automations based on Stage
    const recipient = {
      contactId,
      email,
      phone: phone || "",
      name,
      workshopName: "YouTube Empire Builders Academy",
      customFee: monetaryValue ? `PKR ${monetaryValue.toLocaleString()}` : "PKR 1,999",
    };

    if (stage === "payment-sent") {
      // Payment sent / confirmed: Dispatch verified WhatsApp & Welcome LMS Onboarding Email
      dispatchWhatsAppAutomation(recipient, "payment_confirmed").catch((e) => console.warn("WA confirmed error:", e));
      dispatchCourseEmailAutomation(recipient, "welcome_onboarding").catch((e) => console.warn("Email welcome error:", e));

      // Enroll in Academy LMS GHL Workflow
      const academyWorkflowId = process.env.GHL_ACADEMY_WORKFLOW_ID || "037af938-b83f-4aac-b1b3-61cdfdf5b9a5";
      ghlClient.addContactToWorkflow(contactId, academyWorkflowId).catch((e) => console.warn("Academy workflow enrollment error:", e));
    } else {
      // Lead created / form filled: Dispatch payment instructions via WhatsApp
      dispatchWhatsAppAutomation(recipient, "payment_pending").catch((e) => console.warn("WA pending error:", e));
    }

    return NextResponse.json({
      success: true,
      contact: contactResult,
      opportunity: oppResult,
      opportunityId: opportunityId,
    });

  } catch (error) {
    console.error('Academy Lead Capture Error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to capture lead properly'
    }, { status: 500 });
  }
}
