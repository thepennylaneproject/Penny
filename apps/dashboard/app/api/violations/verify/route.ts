/**
 * Violation Verification API
 * Manual verification form for complex constraint checks
 */

import { NextRequest, NextResponse } from "next/server";

interface VerificationInput {
  violationId: string;
  verified: boolean;
  verification: {
    reviewedBy: string;
    notes: string;
    evidence?: string;
    suggestedFix?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as VerificationInput;
    const { violationId, verified, verification } = body;

    if (!violationId || !verification?.reviewedBy) {
      return NextResponse.json(
        { error: "Violation ID and reviewer required" },
        { status: 400 }
      );
    }

    // Get violation from database
    // const violation = await repository.getViolation(violationId);

    // Store verification result
    const verificationRecord = {
      violationId,
      verified,
      reviewedBy: verification.reviewedBy,
      notes: verification.notes,
      evidence: verification.evidence,
      suggestedFix: verification.suggestedFix,
      verifiedAt: new Date(),
      status: verified ? "verified" : "needs-review"
    };

    // In real implementation, would save to database
    // await repository.saveVerification(verificationRecord);

    // If fix is suggested, could trigger auto-repair
    if (verified && verification.suggestedFix) {
      // Could integrate with repair engine here
    }

    return NextResponse.json({
      success: true,
      verification: verificationRecord
    });
  } catch (error) {
    console.error("Verification API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const violationId = searchParams.get("id");

    if (!violationId) {
      return NextResponse.json(
        { error: "Violation ID required" },
        { status: 400 }
      );
    }

    // Get violation details
    // const violation = await repository.getViolation(violationId);

    // For now, return mock data
    const violation = {
      id: violationId,
      constraintId: "embr-010",
      projectId: "embr",
      severity: "critical",
      currentState: "Creator split is 85%",
      expectedState: "Creator split must be 85-90%",
      remediation: "Update monetization service config",
      confidence: 0.75,
      complexity: "high",
      estimatedFixTime: "30 minutes",
      autoFixAvailable: false
    };

    return NextResponse.json({ violation });
  } catch (error) {
    console.error("Verification API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
